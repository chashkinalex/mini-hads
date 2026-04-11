import type { HadsScoreResult } from "@mini-hads/domain";

type MaxNotificationInput = {
  platform: string;
  platformUserId: string;
  result: HadsScoreResult;
};

function getMiniAppUrl() {
  return process.env.MINIAPP_URL || "https://mini-hads-miniapp.vercel.app";
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

export async function notifyMaxDoctorAboutResult(input: MaxNotificationInput) {
  const botToken = process.env.MAX_BOT_TOKEN;

  if (input.platform !== "max" || !botToken) {
    return;
  }

  const url = new URL("https://platform-api.max.ru/messages");
  url.searchParams.set("user_id", input.platformUserId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: botToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: buildResultMessage(input.result),
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
