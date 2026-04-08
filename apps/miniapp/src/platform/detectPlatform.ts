import type { SupportedPlatform } from "./types";

export function detectPlatform(): SupportedPlatform {
  if (typeof window === "undefined") {
    return "web";
  }

  const search = new URLSearchParams(window.location.search);
  const explicit = search.get("platform");

  if (explicit === "telegram" || explicit === "max" || explicit === "vk") {
    return explicit;
  }

  return "web";
}
