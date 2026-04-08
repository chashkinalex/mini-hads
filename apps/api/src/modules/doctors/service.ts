import { getHadsInterpretation, type HadsAnswers, type HadsLevel } from "@mini-hads/domain";
import { prisma } from "../../lib/prisma";

export async function getDoctorDashboard(doctorId: string) {
  const [sessions, results] = await Promise.all([
    prisma.surveySession.findMany({
      where: { doctorId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.questionnaireResponse.findMany({
      where: { session: { doctorId } },
      include: { session: true },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    sessions: sessions.map((session) => ({
      id: session.id,
      publicToken: session.publicToken,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    })),
    results: results.map((result) => ({
      ...(function () {
        const anxietyLevel = result.anxietyLevel as HadsLevel;
        const depressionLevel = result.depressionLevel as HadsLevel;

        return {
          sessionId: result.sessionId,
          submittedAt: result.submittedAt.toISOString(),
          anxietyScore: result.anxietyScore,
          depressionScore: result.depressionScore,
          anxietyLevel,
          depressionLevel,
          anxietyInterpretation: getHadsInterpretation(anxietyLevel),
          depressionInterpretation: getHadsInterpretation(depressionLevel),
          answers: JSON.parse(result.answersJson) as HadsAnswers,
        };
      })(),
    })),
  };
}
