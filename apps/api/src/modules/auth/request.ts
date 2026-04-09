import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { readDoctorAccessToken } from "./session";

function getAccessToken(request: Request) {
  const authHeader = request.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const queryToken = request.query.access_token;
  return typeof queryToken === "string" ? queryToken : null;
}

export async function requireDoctor(request: Request, response: Response) {
  const session = readDoctorAccessToken(getAccessToken(request));

  if (!session) {
    response.status(401).send("Unauthorized");
    return null;
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
  });

  if (!doctor) {
    response.status(401).send("Unauthorized");
    return null;
  }

  return doctor;
}
