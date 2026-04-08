export function getVkLaunchData() {
  const raw = typeof window !== "undefined" ? window.location.search : "";

  return {
    platform: "vk" as const,
    raw,
  };
}
