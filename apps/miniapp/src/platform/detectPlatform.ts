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

  if ((window as Window & { WebApp?: { initData?: string } }).WebApp?.initData) {
    return "max";
  }

  if ((window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData) {
    return "telegram";
  }

  if (search.has("tgWebAppStartParam")) {
    return "telegram";
  }

  if (search.has("vk_platform") || search.has("sign")) {
    return "vk";
  }

  return "web";
}
