function getRawMaxInitData() {
  return typeof window !== "undefined" ? (window as Window & { WebApp?: { initData?: string } }).WebApp?.initData ?? "" : "";
}

function getMaxInitDataUnsafe() {
  return typeof window !== "undefined"
    ? (window as Window & { WebApp?: { initDataUnsafe?: { start_param?: string } } }).WebApp?.initDataUnsafe
    : undefined;
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
