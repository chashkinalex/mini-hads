const YANDEX_METRIKA_COUNTER_ID = 108513306;

type YandexMetrika = (counterId: number, method: "reachGoal", goal: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    ym?: YandexMetrika;
  }
}

export function trackGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.ym !== "function") {
    return;
  }

  window.ym(YANDEX_METRIKA_COUNTER_ID, "reachGoal", goal, params);
}
