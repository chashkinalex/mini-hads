import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validateMaxLaunchData } from "./maxValidation";
import { createDoctorSessionCookie } from "./session";

const platformLoginSchema = z.object({
  platform: z.enum(["telegram", "max", "vk", "web"]),
  launchData: z.object({
    raw: z.string().min(1),
  }),
});

export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

export async function loginDoctor(input: PlatformLoginInput) {
  const parsed = platformLoginSchema.parse(input);
  const allowDevAuth = (process.env.ALLOW_DEV_AUTH ?? "true") === "true";

  let platformUserId = parsed.launchData.raw;
  let displayName = `Doctor ${parsed.platform.toUpperCase()}`;

  if (parsed.platform === "max" && process.env.MAX_BOT_TOKEN) {
    const validatedUser = validateMaxLaunchData(parsed.launchData.raw, process.env.MAX_BOT_TOKEN);

    if (!validatedUser) {
      if (!allowDevAuth) {
        throw new Error("MAX launch data validation failed");
      }
    } else {
      platformUserId = validatedUser.id;
      displayName = validatedUser.displayName;
    }
  } else if (!allowDevAuth && parsed.platform !== "web") {
    throw new Error(`Production auth for platform "${parsed.platform}" is not configured yet`);
  }

  const doctor = await prisma.doctor.upsert({
    where: {
      platform_platformUserId: {
        platform: parsed.platform,
        platformUserId,
      },
    },
    update: {
      displayName,
    },
    create: {
      platform: parsed.platform,
      platformUserId,
      displayName,
    },
  });

  return {
    doctor,
    sessionCookie: createDoctorSessionCookie(doctor.id),
  };
}
