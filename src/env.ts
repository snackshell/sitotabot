import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  // Required
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // Optional: Random.org
  RANDOM_ORG_API_KEY: z.string().optional().default(""),

  // Server configuration
  PORT: z.coerce.number().optional().default(8080),

  // Optional: Webhook mode
  WEBHOOK_URL: z.string().optional().default(""),
  WEBHOOK_PORT: z.coerce.number().optional().default(8443),
  WEBHOOK_SECRET: z.string().optional().default(""),

  // Optional: Telegram Mini App
  MINI_APP_URL: z.string().url().optional().or(z.literal("")).default(""),

  // Logging
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .optional()
    .default("info"),

  // Bot settings
  DEFAULT_MIN_ACCOUNT_AGE: z.coerce.number().optional().default(0),
  MAX_PARTICIPANTS: z.coerce.number().optional().default(0),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
