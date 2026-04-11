import { prisma } from "../../lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRecentDayKeys(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - index - 1) * DAY_MS);
    return toDateKey(date);
  });
}

function percent(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function getAdminStats() {
  const now = Date.now();
  const since7Days = new Date(now - 7 * DAY_MS);
  const since30Days = new Date(now - 30 * DAY_MS);
  const since14Days = new Date(now - 14 * DAY_MS);
  const dayKeys = getRecentDayKeys(14);

  const [
    totalDoctors,
    activeDoctors7Days,
    activeDoctors30Days,
    sessionsByStatus,
    totalSessions,
    totalResponses,
    anxietyLevels,
    depressionLevels,
    recentSessions,
    recentResponses,
    doctors,
  ] = await Promise.all([
    prisma.doctor.count(),
    prisma.surveySession.findMany({
      where: { createdAt: { gte: since7Days } },
      distinct: ["doctorId"],
      select: { doctorId: true },
    }),
    prisma.surveySession.findMany({
      where: { createdAt: { gte: since30Days } },
      distinct: ["doctorId"],
      select: { doctorId: true },
    }),
    prisma.surveySession.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.surveySession.count(),
    prisma.questionnaireResponse.count(),
    prisma.questionnaireResponse.groupBy({
      by: ["anxietyLevel"],
      _count: { _all: true },
    }),
    prisma.questionnaireResponse.groupBy({
      by: ["depressionLevel"],
      _count: { _all: true },
    }),
    prisma.surveySession.findMany({
      where: { createdAt: { gte: since14Days } },
      select: { createdAt: true, status: true },
    }),
    prisma.questionnaireResponse.findMany({
      where: { submittedAt: { gte: since14Days } },
      select: { submittedAt: true },
    }),
    prisma.doctor.findMany({
      include: {
        sessions: {
          include: { response: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  ]);

  const statusCounts = Object.fromEntries(sessionsByStatus.map((item) => [item.status, item._count._all]));
  const createdSessions = totalSessions;
  const openedSessions = (statusCounts.opened ?? 0) + (statusCounts.submitted ?? 0);
  const submittedSessions = totalResponses;
  const cancelledSessions = statusCounts.cancelled ?? 0;

  const daily = dayKeys.map((date) => ({
    date,
    created: 0,
    started: 0,
    submitted: 0,
  }));
  const dailyByKey = new Map(daily.map((item) => [item.date, item]));

  for (const session of recentSessions) {
    const date = toDateKey(session.createdAt);
    const item = dailyByKey.get(date);
    if (!item) continue;

    item.created += 1;
    if (session.status === "opened" || session.status === "submitted") {
      item.started += 1;
    }
  }

  for (const response of recentResponses) {
    const date = toDateKey(response.submittedAt);
    const item = dailyByKey.get(date);
    if (!item) continue;

    item.submitted += 1;
  }

  const doctorsActivity = doctors
    .map((doctor) => {
      const sessionsCreated = doctor.sessions.length;
      const sessionsStarted = doctor.sessions.filter((session) => session.status === "opened" || session.status === "submitted").length;
      const sessionsSubmitted = doctor.sessions.filter((session) => Boolean(session.response)).length;
      const lastSession = doctor.sessions[0] ?? null;
      const lastResponse = doctor.sessions
        .map((session) => session.response?.submittedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

      return {
        id: doctor.id,
        displayName: doctor.displayName,
        platform: doctor.platform,
        createdAt: doctor.createdAt.toISOString(),
        sessionsCreated,
        sessionsStarted,
        sessionsSubmitted,
        completionRate: percent(sessionsSubmitted, sessionsCreated),
        lastSessionAt: lastSession?.createdAt.toISOString() ?? null,
        lastSubmittedAt: lastResponse?.toISOString() ?? null,
      };
    })
    .sort((a, b) => {
      if (b.sessionsSubmitted !== a.sessionsSubmitted) return b.sessionsSubmitted - a.sessionsSubmitted;
      return b.sessionsCreated - a.sessionsCreated;
    })
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalDoctors,
      activeDoctors7Days: activeDoctors7Days.length,
      activeDoctors30Days: activeDoctors30Days.length,
      createdSessions,
      openedSessions,
      submittedSessions,
      cancelledSessions,
      startRate: percent(openedSessions, createdSessions),
      completionRate: percent(submittedSessions, createdSessions),
      completionFromStartedRate: percent(submittedSessions, openedSessions),
    },
    levels: {
      anxiety: Object.fromEntries(anxietyLevels.map((item) => [item.anxietyLevel, item._count._all])),
      depression: Object.fromEntries(depressionLevels.map((item) => [item.depressionLevel, item._count._all])),
    },
    daily,
    doctors: doctorsActivity,
  };
}
