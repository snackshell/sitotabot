import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { env } from "../env.js";
import { logger } from "../utils/logger.js";

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(queryClient, { schema });

export async function testConnection(): Promise<void> {
  try {
    await queryClient`SELECT 1`;
    logger.info("✅ Database connected successfully");
  } catch (error) {
    logger.fatal({ error }, "❌ Failed to connect to database");
    process.exit(1);
  }
}

export async function closeConnection(): Promise<void> {
  await queryClient.end();
  logger.info("Database connection closed");
}
