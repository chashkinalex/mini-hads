import cors from "cors";
import express from "express";
import { z } from "zod";
import { requireDoctor } from "./modules/auth/request";
import { loginDoctor } from "./modules/auth/service";
import { getAdminStats } from "./modules/admin/service";
import { getDoctorDashboard } from "./modules/doctors/service";
import { handleMaxWebhookUpdate } from "./modules/maxBot/webhook";
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
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/admin/stats", async (request, response) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const authorization = request.header("Authorization");
  const providedToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;

  if (!adminToken || providedToken !== adminToken) {
    response.status(401).send("Unauthorized");
    return;
  }

  try {
    response.json(await getAdminStats());
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "Failed to load admin stats");
  }
});

app.post("/max/webhook", async (request, response) => {
  const webhookSecret = process.env.MAX_WEBHOOK_SECRET;

  if (webhookSecret && request.header("X-Max-Bot-Api-Secret") !== webhookSecret) {
    response.status(401).send("Unauthorized");
    return;
  }

  try {
    await handleMaxWebhookUpdate(request.body);
    response.json({ ok: true });
  } catch (error) {
    console.error("MAX webhook failed", error);
    response.status(500).send(error instanceof Error ? error.message : "MAX webhook failed");
  }
});

app.post("/auth/platform-login", async (request, response) => {
  try {
    const auth = await loginDoctor(request.body);
    response.json({
      doctor: {
        id: auth.doctor.id,
        platform: auth.doctor.platform,
        displayName: auth.doctor.displayName,
      },
      accessToken: auth.accessToken,
    });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Auth failed");
  }
});

app.post("/sessions", async (request, response) => {
  try {
    const doctor = await requireDoctor(request, response);

    if (!doctor) {
      return;
    }

    const session = await createSession(doctor.id);
    response.status(201).json({ session });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to create session");
  }
});

app.get("/me/events", async (request, response) => {
  const doctor = await requireDoctor(request, response);

  if (!doctor) {
    return;
  }

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const unsubscribe = subscribeDoctor(doctor.id, (event, payload) => {
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
    const doctor = await requireDoctor(request, response);

    if (!doctor) {
      return;
    }

    const session = await cancelSession(request.params.token, doctor.id);
    response.json({ session });
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to cancel session");
  }
});

app.get("/me/dashboard", async (request, response) => {
  try {
    const doctor = await requireDoctor(request, response);

    if (!doctor) {
      return;
    }

    const dashboard = await getDoctorDashboard(doctor.id);
    response.json(dashboard);
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "Failed to load dashboard");
  }
});

app.listen(port, () => {
  console.log(`Mini HADS API listening on http://localhost:${port}`);
});
