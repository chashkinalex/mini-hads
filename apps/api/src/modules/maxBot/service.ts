import type { HadsScoreResult } from "@mini-hads/domain";

type MaxNotificationInput = {
  platform: string;
  platformUserId: string;
  result: HadsScoreResult;
};

type MaxInlineKeyboardButton =
  | {
      type: "link";
      text: string;
      url: string;
    }
  | {
      type: "message";
      text: string;
    };

type MaxMessageInput = {
  userId: string;
  text: string;
  buttons?: MaxInlineKeyboardButton[][];
};

function getMiniAppUrl() {
  return process.env.MINIAPP_URL || "https://mini-hads-miniapp.vercel.app";
}

export function buildPatientJoinUrl(publicToken: string) {
  const url = new URL("/join", getMiniAppUrl());
  url.searchParams.set("token", publicToken);
  return url.toString();
}

function buildResultMessage(result: HadsScoreResult) {
  return [
    "**Пациент завершил HADS**",
    "",
    `Тревога: **${result.anxietyScore}**`,
    result.anxietyInterpretation,
    "",
    `Депрессия: **${result.depressionScore}**`,
    result.depressionInterpretation,
    "",
    `[Открыть кабинет врача](${getMiniAppUrl()})`,
  ].join("\n");
}

export async function sendMaxMessage(input: MaxMessageInput) {
  const botToken = process.env.MAX_BOT_TOKEN;

  if (!botToken) {
    return;
  }

  const url = new URL("https://platform-api.max.ru/messages");
  url.searchParams.set("user_id", input.userId);

  const attachments = input.buttons
    ? [
        {
          type: "inline_keyboard",
          payload: {
            buttons: input.buttons,
          },
        },
      ]
    : undefined;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: botToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: input.text,
      attachments,
      format: "markdown",
      notify: true,
      disable_link_preview: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `MAX notification failed: ${response.status}`);
  }
}

export async function notifyMaxDoctorAboutResult(input: MaxNotificationInput) {
  if (input.platform !== "max") {
    return;
  }

  await sendMaxMessage({
    userId: input.platformUserId,
    text: buildResultMessage(input.result),
    buttons: [
      [
        {
          type: "link",
          text: "Открыть кабинет",
          url: getMiniAppUrl(),
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
