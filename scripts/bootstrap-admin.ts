import bcrypt from "bcryptjs";
import { Buffer } from "node:buffer";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function bootstrapAdmin(env: {
  email?: string;
  name?: string;
  password?: string;
  databaseUrl?: string;
} = {
  email: process.env.BOOTSTRAP_ADMIN_EMAIL,
  name: process.env.BOOTSTRAP_ADMIN_NAME,
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  databaseUrl: process.env.DATABASE_URL,
}) {
  const email = env.email?.trim().toLowerCase();
  const name = env.name?.trim();
  const password = env.password;

  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    throw new Error("A valid BOOTSTRAP_ADMIN_EMAIL (max 254 characters) is required.");
  }
  if (!name || name.length < 2 || name.length > 100) {
    throw new Error("BOOTSTRAP_ADMIN_NAME must be between 2 and 100 characters.");
  }
  if (!password || password.length < 14) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 14 characters long.");
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD exceeds the 72 UTF-8 byte limit for bcrypt.");
  }

  const dbUrl = env.databaseUrl?.trim();
  if (!dbUrl || dbUrl.includes("USER:PASSWORD")) {
    throw new Error("Set DATABASE_URL to the target database before running the bootstrap command.");
  }

  // Safeguard: do not run if an admin already exists
  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) {
    throw new Error("An administrator already exists; this bootstrap command only runs for the initial administrator.");
  }

  // Safeguard: do not overwrite any existing account with this email
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("An account with this email address already exists. Bootstrap will not overwrite existing accounts.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name,
        password: passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: created.id,
        action: "admin.bootstrapped",
        resourceType: "User",
        resourceId: created.id,
        metadata: { email: created.email, role: created.role },
      },
    });

    return created;
  });

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

async function main() {
  try {
    const admin = await bootstrapAdmin();
    console.log(`Successfully created initial administrator account for ${admin.email}.`);
    console.log("Ensure the password is stored securely and remove bootstrap variables from the environment.");
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "Admin bootstrap failed.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("bootstrap-admin.ts") || process.argv[1]?.endsWith("bootstrap-admin.js")) {
  main();
}
