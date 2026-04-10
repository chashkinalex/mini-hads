import { createHmac } from "node:crypto";

type TelegramLaunchUser = {
  id: string;
  displayName: string;
};

function buildDisplayName(user: { first_name?: string; last_name?: string; username?: string }) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || user.username || "Doctor TELEGRAM";
}

export function validateTelegramLaunchData(rawInitData: string, botToken: string): TelegramLaunchUser | null {
  if (!rawInitData || !botToken) {
    return null;
  }

  const params = new URLSearchParams(rawInitData);
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    return null;
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };

    return {
      id: String(user.id),
      displayName: buildDisplayName(user),
    };
  } catch {
    return null;
  }
}
