import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./index.js";
import { logger } from "../utils/logger.js";

export async function runMigrations(): Promise<void> {
  try {
    logger.info("Running database migrations...");
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.info("✅ Migrations completed successfully");
  } catch (error) {
    logger.error({ error }, "❌ Migration failed");
    throw error;
  }
}
