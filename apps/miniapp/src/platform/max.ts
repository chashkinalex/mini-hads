type MaxBackButton = {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick?(callback: () => void): void;
};

type MaxWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  openMaxLink?(url: string): void;
  openLink?(url: string): void;
  ready?(): void;
  expand?(): void;
  BackButton?: MaxBackButton;
};

function getMaxWebApp(): MaxWebApp | undefined {
  return typeof window !== "undefined" ? (window as Window & { WebApp?: MaxWebApp }).WebApp : undefined;
}

function getRawMaxInitData() {
  return getMaxWebApp()?.initData ?? "";
}

function getMaxInitDataUnsafe() {
  return getMaxWebApp()?.initDataUnsafe;
}

export function getMaxLaunchData() {
  const initData = getRawMaxInitData();

  return {
    platform: "max" as const,
    raw: initData || "",
  };
}

export function getMaxStartParam() {
  if (typeof window !== "undefined") {
    const search = new URLSearchParams(window.location.search);
    const directParam = search.get("WebAppStartParam") || search.get("start_param") || search.get("startapp") || search.get("token");

    if (directParam) {
      return directParam;
    }
  }

  const unsafeParam = getMaxInitDataUnsafe()?.start_param;

  if (unsafeParam) {
    return unsafeParam;
  }

  const initData = getRawMaxInitData();

  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  return params.get("start_param");
}

export function isMaxBridgeAvailable() {
  return Boolean(getMaxWebApp());
}

export function openMaxUrl(url: string) {
  const webApp = getMaxWebApp();

  if (webApp?.openMaxLink) {
    webApp.openMaxLink(url);
    return;
  }

  window.location.href = url;
}

export function openExternalUrl(url: string) {
  const webApp = getMaxWebApp();

  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }

  window.location.href = url;
}

export function prepareMaxWebApp() {
  const webApp = getMaxWebApp();
  webApp?.ready?.();
  webApp?.expand?.();
}

export function bindMaxBackButton(visible: boolean, onClick: () => void) {
  const backButton = getMaxWebApp()?.BackButton;

  if (!backButton) {
    return () => {};
  }

  if (visible) {
    backButton.show();
    backButton.onClick(onClick);
  } else {
    backButton.hide();
  }

  return () => {
    if (backButton.offClick) {
      backButton.offClick(onClick);
    } else {
      backButton.hide();
    }
  };
}
