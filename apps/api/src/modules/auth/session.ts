import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "mini_hads_session";
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

export function createDoctorSessionCookie(doctorId: string) {
  const payload: SessionPayload = {
    doctorId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  const value = `${encodedPayload}.${signature}`;
  const isProduction = process.env.NODE_ENV === "production";
  const secure = isProduction;
  const sameSite = isProduction ? "none" : "lax";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);

  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure,
      sameSite,
      path: "/",
      maxAge,
    } as const,
  };
}

export function clearDoctorSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
      path: "/",
      maxAge: 0,
    },
  };
}

export function readDoctorSessionCookie(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const sessionPair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionPair) {
    return null;
  }

  const value = sessionPair.slice(SESSION_COOKIE_NAME.length + 1);
  const [encodedPayload, signature] = value.split(".");

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
