export function getMaxLaunchData() {
  const initData = typeof window !== "undefined" ? (window as Window & { WebApp?: { initData?: string } }).WebApp?.initData : "";

  return {
    platform: "max" as const,
    raw: initData || "",
  };
}
