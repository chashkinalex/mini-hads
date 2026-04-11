import { prisma } from "../../lib/prisma";
import { createSession } from "../sessions/service";
import { buildPatientJoinUrl, sendMaxMessage } from "./service";

type MaxUser = {
  user_id?: number | string;
  first_name?: string;
  last_name?: string | null;
  username?: string | null;
};

type MaxWebhookUpdate = {
  update_type?: string;
  message?: {
    sender?: MaxUser;
    body?: {
      text?: string | null;
    } | null;
  };
};

function getDisplayName(user: MaxUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || "Doctor MAX";
}

function isNewPatientCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized === "новый пациент" || normalized === "/new" || normalized === "new patient";
}

function isStartCommand(text: string) {
  const normalized = text.trim().toLowerCase();
  return normalized === "/start" || normalized === "start" || normalized === "начать";
}

async function getOrCreateMaxDoctor(user: MaxUser) {
  if (!user.user_id) {
    throw new Error("MAX webhook sender is missing user_id");
  }

  const platformUserId = String(user.user_id);
  const displayName = getDisplayName(user);

  return prisma.doctor.upsert({
    where: {
      platform_platformUserId: {
        platform: "max",
        platformUserId,
      },
    },
    update: { displayName },
    create: {
      platform: "max",
      platformUserId,
      displayName,
    },
  });
}

async function sendHelp(userId: string) {
  await sendMaxMessage({
    userId,
    text: [
      "**Praxium HADS**",
      "",
      "Я могу быстро создать новую HADS-сессию для пациента.",
      "",
      "Нажмите кнопку ниже или напишите: `Новый пациент`.",
    ].join("\n"),
    buttons: [
      [
        {
          type: "message",
          text: "Новый пациент",
        },
      ],
      [
        {
          type: "link",
          text: "Открыть кабинет",
          url: process.env.MINIAPP_URL || "https://mini-hads-miniapp.vercel.app",
        },
      ],
    ],
  });
}

async function createPatientFromChat(user: MaxUser) {
  const doctor = await getOrCreateMaxDoctor(user);
  const session = await createSession(doctor.id);
  const joinUrl = buildPatientJoinUrl(session.publicToken);

  await sendMaxMessage({
    userId: doctor.platformUserId,
    text: [
      "**Новая HADS-сессия создана**",
      "",
      "Отправьте пациенту ссылку или покажите QR-код из кабинета врача.",
      "",
      `[Открыть опрос пациента](${joinUrl})`,
    ].join("\n"),
    buttons: [
      [
        {
          type: "link",
          text: "Ссылка пациента",
          url: joinUrl,
        },
      ],
      [
        {
          type: "link",
          text: "Открыть кабинет",
          url: process.env.MINIAPP_URL || "https://mini-hads-miniapp.vercel.app",
        },
      ],
      [
        {
          type: "message",
          text: "Новый пациент",
        },
      ],
    ],
  });
}

export async function handleMaxWebhookUpdate(update: MaxWebhookUpdate) {
  if (update.update_type !== "message_created") {
    return;
  }

  const sender = update.message?.sender;
  const text = update.message?.body?.text?.trim() ?? "";

  if (!sender?.user_id || !text) {
    return;
  }

  if (isNewPatientCommand(text)) {
    await createPatientFromChat(sender);
    return;
  }

  if (isStartCommand(text)) {
    await getOrCreateMaxDoctor(sender);
  }

  await sendHelp(String(sender.user_id));
}
