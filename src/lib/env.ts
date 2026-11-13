import { z } from "zod";

const optionalEnv = <Schema extends z.ZodTypeAny>(schema: Schema) =>
  z.preprocess((value) => value === "" ? undefined : value, schema.optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL must be specified"),
  NEXT_PUBLIC_APP_URL: optionalEnv(z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL")),
  NEY_MEDIA_CORE_URL: optionalEnv(z.string().url()),
  NEY_MEDIA_CORE_SERVICE_KEY: optionalEnv(z.string().min(16)),
  REDIS_URL: optionalEnv(z.string().url()),
  SMTP_HOST: optionalEnv(z.string()),
  SMTP_PORT: optionalEnv(z.coerce.number().int().positive()),
  SMTP_USER: optionalEnv(z.string()),
  SMTP_PASSWORD: optionalEnv(z.string()),
  EMAIL_FROM: optionalEnv(z.string().email()),
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(5).max(120).default(15)),
  SMTP_SECURE: optionalEnv(z.enum(["true", "false"])),
  GOOGLE_CLIENT_ID: optionalEnv(z.string()),
  GOOGLE_CLIENT_SECRET: optionalEnv(z.string()),
  DISCORD_CLIENT_ID: optionalEnv(z.string()),
  DISCORD_CLIENT_SECRET: optionalEnv(z.string()),
  APPLE_CLIENT_ID: optionalEnv(z.string()),
  APPLE_TEAM_ID: optionalEnv(z.string()),
  APPLE_KEY_ID: optionalEnv(z.string()),
  APPLE_PRIVATE_KEY: optionalEnv(z.string()),
  TWILIO_ACCOUNT_SID: optionalEnv(z.string()),
  TWILIO_AUTH_TOKEN: optionalEnv(z.string()),
  TWILIO_VERIFY_SERVICE_SID: optionalEnv(z.string()),
  BOOTSTRAP_ADMIN_EMAIL: optionalEnv(z.string().email()),
  BOOTSTRAP_ADMIN_NAME: optionalEnv(z.string()),
  BOOTSTRAP_ADMIN_PASSWORD: optionalEnv(z.string()),
  TRUST_PROXY: optionalEnv(z.enum(["true", "false"])),
  TRUSTED_PROXIES: optionalEnv(z.string()),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateProductionEnv(): { valid: boolean; errors: string[] } {
  const isProd = process.env.NODE_ENV === "production";
  const errors: string[] = [];

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl || dbUrl.includes("USER:PASSWORD")) {
    if (isProd) {
      errors.push("DATABASE_URL must be set to a valid PostgreSQL connection string in production.");
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    if (isProd) {
      errors.push("NEXT_PUBLIC_APP_URL must be set to the public canonical URL in production.");
    }
  } else {
    try {
      new URL(appUrl);
    } catch {
      errors.push("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
    }
  }

  const mediaCoreUrl = process.env.NEY_MEDIA_CORE_URL?.trim();
  const mediaCoreKey = process.env.NEY_MEDIA_CORE_SERVICE_KEY?.trim();
  if (Boolean(mediaCoreUrl) !== Boolean(mediaCoreKey)) {
    errors.push("NEY_MEDIA_CORE_URL and NEY_MEDIA_CORE_SERVICE_KEY must both be set when Media Core is enabled.");
  }
  if (isProd && (!mediaCoreUrl || !mediaCoreKey)) {
    errors.push("NEY_MEDIA_CORE_URL and NEY_MEDIA_CORE_SERVICE_KEY must be configured in production.");
  }
  if (mediaCoreUrl) {
    try {
      const url = new URL(mediaCoreUrl);
      if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
        errors.push("NEY_MEDIA_CORE_URL must be an origin without a path, query, or credentials.");
      }
      if (isProd && url.protocol !== "https:") {
        errors.push("NEY_MEDIA_CORE_URL must use HTTPS in production.");
      }
    } catch {
      errors.push("NEY_MEDIA_CORE_URL must be a valid absolute URL.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
