export function getTelegramLaunchData() {
  const telegramInitData =
    typeof window !== "undefined"
      ? (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData
      : "";

  return {
    platform: "telegram" as const,
    raw: telegramInitData || "",
  };
}
