type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  ready?(): void;
  expand?(): void;
};

function getTelegramWebApp(): TelegramWebApp | undefined {
  return typeof window !== "undefined"
    ? (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
    : undefined;
}

export function getTelegramLaunchData() {
  const telegramInitData = getTelegramWebApp()?.initData;

  return {
    platform: "telegram" as const,
    raw: telegramInitData || "",
  };
}

export function getTelegramStartParam() {
  if (typeof window !== "undefined") {
    const search = new URLSearchParams(window.location.search);
    const directParam = search.get("tgWebAppStartParam") || search.get("startapp") || search.get("start_param");

    if (directParam) {
      return directParam;
    }
  }

  const initDataUnsafeParam = getTelegramWebApp()?.initDataUnsafe?.start_param;

  if (initDataUnsafeParam) {
    return initDataUnsafeParam;
  }

  const initData = getTelegramWebApp()?.initData;

  if (!initData) {
    return null;
  }

  return new URLSearchParams(initData).get("start_param");
}

export function prepareTelegramWebApp() {
  const webApp = getTelegramWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}
