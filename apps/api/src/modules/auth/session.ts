import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type SessionPayload = {
  doctorId: string;
  expiresAt: number;
};

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.MAX_BOT_TOKEN || "mini-hads-dev-session-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

export function createDoctorAccessToken(doctorId: string) {
  const payload: SessionPayload = {
    doctorId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readDoctorAccessToken(token?: string | null) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);

  try {
    const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload;

    if (!payload.doctorId || payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
