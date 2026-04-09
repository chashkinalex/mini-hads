import type { HadsAnswers, HadsScoreResult } from "@mini-hads/domain";
import { getMaxLaunchData } from "../../platform/max";
import { getTelegramLaunchData } from "../../platform/telegram";
import { getVkLaunchData } from "../../platform/vk";

export type Doctor = {
  id: string;
  platform: string;
  displayName: string;
};

export type SessionRecord = {
  id: string;
  publicToken: string;
  status: string;
  createdAt: string;
  expiresAt: string;
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function loginDoctor(platform: string) {
  const launchData =
    platform === "max"
      ? getMaxLaunchData()
      : platform === "telegram"
        ? getTelegramLaunchData()
        : platform === "vk"
          ? getVkLaunchData()
          : { platform: "web" as const, raw: `dev-web` };

  return request<{ doctor: Doctor }>("/auth/platform-login", {
    method: "POST",
    body: JSON.stringify({
      platform: launchData.platform,
      launchData: { raw: launchData.raw || `dev-${platform}` },
    }),
  });
}

export function createDoctorSession() {
  return request<{ session: SessionRecord }>("/sessions", {
    method: "POST",
  });
}

export function cancelDoctorSession(token: string) {
  return request<{ session: SessionRecord }>(`/sessions/${token}/cancel`, {
    method: "POST",
  });
}

export function getDoctorResults() {
  return request<{ sessions: SessionRecord[]; results: Array<HadsScoreResult & { sessionId: string; submittedAt: string; answers: HadsAnswers }> }>(
    "/me/dashboard",
  );
}

export function getPatientSession(token: string) {
  return request<{ session: SessionRecord & { doctorName: string } }>(`/sessions/${token}`);
}

export function openPatientSession(token: string) {
  return request<{ session: SessionRecord }>(`/sessions/${token}/open`, {
    method: "POST",
  });
}

export function submitPatientAnswers(token: string, answers: HadsAnswers) {
  return request<{ result: HadsScoreResult }>(`/sessions/${token}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export function subscribeDoctorEvents(onEvent: (event: MessageEvent<string>) => void) {
  const source = new EventSource(`${API_URL}/me/events`, { withCredentials: true });

  source.addEventListener("session_created", onEvent);
  source.addEventListener("session_opened", onEvent);
  source.addEventListener("session_submitted", onEvent);
  source.addEventListener("session_cancelled", onEvent);

  return source;
}
