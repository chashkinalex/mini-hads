function getRawMaxInitData() {
  return typeof window !== "undefined" ? (window as Window & { WebApp?: { initData?: string } }).WebApp?.initData ?? "" : "";
}

export function getMaxLaunchData() {
  const initData = getRawMaxInitData();

  return {
    platform: "max" as const,
    raw: initData || "",
  };
}

export function getMaxStartParam() {
  const initData = getRawMaxInitData();

  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  return params.get("start_param");
}
