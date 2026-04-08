import { createHmac, timingSafeEqual } from "node:crypto";

type ValidatedMaxUser = {
  id: string;
  displayName: string;
};

function toPairs(raw: string) {
  return raw
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return [part, ""] as const;
      }

      return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)] as const;
    });
}

function normalizeInput(rawInput: string) {
  if (rawInput.includes("WebAppData=") || rawInput.startsWith("http")) {
    const hashPart = rawInput.includes("#") ? rawInput.split("#")[1] ?? "" : rawInput;
    const hashParams = new URLSearchParams(hashPart);
    return hashParams.get("WebAppData") ?? "";
  }

  return rawInput;
}

export function validateMaxLaunchData(rawInput: string, botToken: string): ValidatedMaxUser | null {
  const webAppData = normalizeInput(rawInput);

  if (!webAppData) {
    return null;
  }

  const pairs = toPairs(webAppData).map(([key, value]) => [key, decodeURIComponent(value)] as const);
  const hashEntries = pairs.filter(([key]) => key === "hash");

  if (hashEntries.length !== 1) {
    return null;
  }

  const originalHash = hashEntries[0][1];
  const launchParams = pairs
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(launchParams).digest("hex");

  const isValid =
    originalHash.length === calculatedHash.length &&
    timingSafeEqual(Buffer.from(calculatedHash, "utf8"), Buffer.from(originalHash, "utf8"));

  if (!isValid) {
    return null;
  }

  const userValue = pairs.find(([key]) => key === "user")?.[1];
  if (!userValue) {
    return null;
  }

  const user = JSON.parse(userValue) as {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    username?: string | null;
  };

  if (!user.id) {
    return null;
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.username ||
    `Doctor MAX`;

  return {
    id: String(user.id),
    displayName,
  };
}
