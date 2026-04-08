import cors from "cors";
import express from "express";
import { z } from "zod";
import { loginDoctor } from "./modules/auth/service";
import { getDoctorDashboard } from "./modules/doctors/service";
import { subscribeDoctor } from "./modules/realtime/broker";
import { cancelSession, createSession, getSessionByToken, openSession, submitSession } from "./modules/sessions/service";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"));
    },
  }),
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/auth/platform-login", async (request, response) => {
  try {
    const doctor = await loginDoctor(request.body);
    response.json({
      doctor: {
        id: doctor.id,
        platform: doctor.platform,
        displayName: doctor.displayName,
      },
    });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Auth failed");
  }
});

app.post("/sessions", async (request, response) => {
  try {
    const body = z.object({ doctorId: z.string().min(1) }).parse(request.body);
    const session = await createSession(body.doctorId);
    response.status(201).json({ session });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to create session");
  }
});

app.get("/doctors/:doctorId/events", (request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const doctorId = request.params.doctorId;
  const unsubscribe = subscribeDoctor(doctorId, (event, payload) => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  });

  const ping = setInterval(() => {
    response.write("event: ping\n");
    response.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 15000);

  request.on("close", () => {
    clearInterval(ping);
    unsubscribe();
    response.end();
  });
});

app.get("/sessions/:token", async (request, response) => {
  try {
    const session = await getSessionByToken(request.params.token);
    response.json({ session });
  } catch (error) {
    response.status(404).send(error instanceof Error ? error.message : "Session not found");
  }
});

app.post("/sessions/:token/open", async (request, response) => {
  try {
    const session = await openSession(request.params.token);
    response.json({ session });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to open session");
  }
});

app.post("/sessions/:token/submit", async (request, response) => {
  try {
    const answers = z.record(z.enum([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
      "q7",
      "q8",
      "q9",
      "q10",
      "q11",
      "q12",
      "q13",
      "q14",
    ]), z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])).parse(request.body.answers);
    const result = await submitSession(request.params.token, answers);
    response.json({ result });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to submit answers");
  }
});

app.post("/sessions/:token/cancel", async (request, response) => {
  try {
    const session = await cancelSession(request.params.token);
    response.json({ session });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to cancel session");
  }
});

app.get("/doctors/:doctorId/dashboard", async (request, response) => {
  try {
    const dashboard = await getDoctorDashboard(request.params.doctorId);
    response.json(dashboard);
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to load dashboard");
  }
});

app.listen(port, () => {
  console.log(`Mini HADS API listening on http://localhost:${port}`);
});
