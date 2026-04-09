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

export function getMaxDebugSnapshot() {
  if (typeof window === "undefined") {
    return {
      search: "",
      directStartParam: null,
      unsafeStartParam: null,
      parsedInitDataStartParam: null,
      initData: "",
      hasWebApp: false,
    };
  }

  const search = new URLSearchParams(window.location.search);
  const initData = getRawMaxInitData();
  const unsafeStartParam = getMaxInitDataUnsafe()?.start_param ?? null;
  const parsedInitDataStartParam = initData ? new URLSearchParams(initData).get("start_param") : null;
  const directStartParam = search.get("WebAppStartParam") || search.get("start_param") || search.get("startapp") || search.get("token");

  return {
    search: window.location.search,
    directStartParam,
    unsafeStartParam,
    parsedInitDataStartParam,
    initData,
    hasWebApp: Boolean((window as Window & { WebApp?: unknown }).WebApp),
  };
}
