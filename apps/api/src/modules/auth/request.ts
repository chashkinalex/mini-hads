import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { readDoctorSessionCookie, clearDoctorSessionCookie } from "./session";

export async function requireDoctor(request: Request, response: Response) {
  const session = readDoctorSessionCookie(request.headers.cookie);

  if (!session) {
    response.status(401).send("Unauthorized");
    return null;
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: session.doctorId },
  });

  if (!doctor) {
    const cleared = clearDoctorSessionCookie();
    response.cookie(cleared.name, cleared.value, cleared.options);
    response.status(401).send("Unauthorized");
    return null;
  }

  return doctor;
}
