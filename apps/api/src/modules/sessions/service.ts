import { scoreHadsAnswers, type HadsAnswers } from "@mini-hads/domain";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { publishDoctorEvent } from "../realtime/broker";

export async function createSession(doctorId: string) {
  const session = await prisma.surveySession.create({
    data: {
      doctorId,
      publicToken: randomUUID(),
      status: "created",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  const sessionPayload = {
    id: session.id,
    doctorId: session.doctorId,
    publicToken: session.publicToken,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };

  publishDoctorEvent(doctorId, "session_created", {
    sessionId: session.id,
    publicToken: session.publicToken,
  });

  return sessionPayload;
}

export async function getSessionByToken(publicToken: string) {
  const session = await prisma.surveySession.findUnique({
    where: { publicToken },
    include: { doctor: true },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  return {
    id: session.id,
    publicToken: session.publicToken,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    doctorName: session.doctor.displayName,
  };
}

export async function submitSession(publicToken: string, answers: HadsAnswers) {
  const session = await prisma.surveySession.findUnique({
    where: { publicToken },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.status === "submitted") {
    throw new Error("Session already submitted");
  }

  if (session.status === "cancelled") {
    throw new Error("Session was cancelled");
  }

  const result = scoreHadsAnswers(answers);

  await prisma.$transaction([
    prisma.questionnaireResponse.create({
      data: {
        sessionId: session.id,
        answersJson: JSON.stringify(answers),
        anxietyScore: result.anxietyScore,
        depressionScore: result.depressionScore,
        anxietyLevel: result.anxietyLevel,
        depressionLevel: result.depressionLevel,
      },
    }),
    prisma.surveySession.update({
      where: { id: session.id },
      data: { status: "submitted" },
    }),
  ]);

  publishDoctorEvent(session.doctorId, "session_submitted", {
    sessionId: session.id,
    publicToken: session.publicToken,
  });

  return result;
}

export async function openSession(publicToken: string) {
  const session = await prisma.surveySession.findUnique({
    where: { publicToken },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.status === "cancelled") {
    throw new Error("Session was cancelled");
  }

  if (session.status === "submitted") {
    throw new Error("Session already submitted");
  }

  const updated = session.status === "opened"
    ? session
    : await prisma.surveySession.update({
        where: { id: session.id },
        data: { status: "opened" },
      });

  publishDoctorEvent(updated.doctorId, "session_opened", {
    sessionId: updated.id,
    publicToken: updated.publicToken,
  });

  return {
    id: updated.id,
    publicToken: updated.publicToken,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    expiresAt: updated.expiresAt.toISOString(),
  };
}

export async function cancelSession(publicToken: string) {
  const session = await prisma.surveySession.findUnique({
    where: { publicToken },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.status === "submitted") {
    throw new Error("Cannot cancel a completed session");
  }

  const updated = await prisma.surveySession.update({
    where: { id: session.id },
    data: { status: "cancelled" },
  });

  publishDoctorEvent(updated.doctorId, "session_cancelled", {
    sessionId: updated.id,
    publicToken: updated.publicToken,
  });

  return {
    id: updated.id,
    publicToken: updated.publicToken,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    expiresAt: updated.expiresAt.toISOString(),
  };
}
