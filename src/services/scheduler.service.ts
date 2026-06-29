import type { Api } from "grammy";
import type { ScheduledTask, GiveawayWithRelations } from "../types/index.js";
import { drawWinners } from "./winner.service.js";
import { getGiveaway, getOverdueGiveaways, getPendingGiveaways } from "./giveaway.service.js";
import { announceWinners, notifyWinners, notifyAdmin, notifyCreatorWinners } from "./notification.service.js";
import { getWinners } from "./winner.service.js";
import { msUntil } from "../utils/date.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("service:scheduler");
const MAX_TIMEOUT_MS = 2_147_483_647;

// In-memory store of scheduled tasks
const scheduledTasks = new Map<string, ScheduledTask>();

/**
 * Schedule a giveaway to automatically end at its end time.
 */
export function scheduleGiveawayEnd(
  giveaway: GiveawayWithRelations,
  api: Api
): void {
  const delay = msUntil(giveaway.endTime);

  if (delay <= 0) {
    // Already past end time — process immediately
    log.info(
      { giveawayId: giveaway.id },
      "Giveaway past end time, processing immediately"
    );
    processGiveawayEnd(giveaway.id, api);
    return;
  }

  // Cancel any existing schedule for this giveaway
  cancelSchedule(giveaway.id);

  scheduleGiveawayTimeout(giveaway, api);

  const delayMinutes = Math.round(delay / 60_000);
  log.info(
    {
      giveawayId: giveaway.id,
      endTime: giveaway.endTime.toISOString(),
      delayMinutes,
    },
    `Giveaway end scheduled in ${delayMinutes} minutes`
  );
}

function scheduleGiveawayTimeout(
  giveaway: GiveawayWithRelations,
  api: Api
): void {
  const delay = msUntil(giveaway.endTime);
  const timeoutDelay = Math.min(delay, MAX_TIMEOUT_MS);

  const timeout = setTimeout(() => {
    const remaining = msUntil(giveaway.endTime);
    if (remaining > 0) {
      scheduleGiveawayTimeout(giveaway, api);
      return;
    }

    void processGiveawayEnd(giveaway.id, api);
    scheduledTasks.delete(giveaway.id);
  }, timeoutDelay);

  scheduledTasks.set(giveaway.id, {
    giveawayId: giveaway.id,
    endTime: giveaway.endTime,
    timeout,
  });
}

/**
 * Process the end of a giveaway: draw winners, announce, notify.
 */
async function processGiveawayEnd(
  giveawayId: string,
  api: Api
): Promise<void> {
  log.info({ giveawayId }, "Processing giveaway end");

  try {
    const result = await drawWinners(giveawayId);

    if (!result) {
      log.warn({ giveawayId }, "No winners drawn (no eligible participants?)");
      const giveaway = await getGiveaway(giveawayId);
      if (giveaway?.channel?.telegramId) {
        await api.sendMessage(
          Number(giveaway.channel.telegramId),
          `🏁 Giveaway "<b>${giveaway.prize}</b>" has ended with no eligible participants.`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) return;

    // Announce winners in channel only for public winner giveaways.
    if (giveaway.winnersPublic) {
      await announceWinners(api, giveaway, result.winnerUsers);
    }

    // DM winners
    const dmResult = await notifyWinners(api, giveaway, result.winnerUsers);

    // DM creator with winner details for both public and private giveaways.
    await notifyCreatorWinners(api, giveaway, result.winnerUsers);

    // Notify admin
    if (giveaway.creator) {
      await notifyAdmin(
        api,
        giveaway.creator.telegramId,
        "ended",
        giveaway,
        `🏆 ${result.winnerUsers.length} winner(s) selected\n📬 ${dmResult.notified} notified, ${dmResult.failed} failed DMs`
      );
    }

    log.info(
      {
        giveawayId,
        winners: result.winnerUsers.length,
        notified: dmResult.notified,
      },
      "Giveaway end processing complete"
    );
  } catch (error) {
    log.error({ error, giveawayId }, "Error processing giveaway end");
  }
}

/**
 * Cancel a scheduled giveaway ending.
 */
export function cancelSchedule(giveawayId: string): void {
  const task = scheduledTasks.get(giveawayId);
  if (task) {
    clearTimeout(task.timeout);
    scheduledTasks.delete(giveawayId);
    log.info({ giveawayId }, "Scheduled giveaway end cancelled");
  }
}

/**
 * Restore all scheduled tasks on startup.
 * - Processes any giveaways that should have ended while the bot was offline
 * - Schedules future giveaway endings
 */
export async function restoreSchedules(api: Api): Promise<void> {
  log.info("Restoring giveaway schedules from database...");

  // Process overdue giveaways
  const overdue = await getOverdueGiveaways();
  if (overdue.length > 0) {
    log.info(
      { count: overdue.length },
      "Found overdue giveaways, processing..."
    );
    for (const giveaway of overdue) {
      await processGiveawayEnd(giveaway.id, api);
    }
  }

  // Schedule pending giveaways
  const pending = await getPendingGiveaways();
  if (pending.length > 0) {
    log.info(
      { count: pending.length },
      "Scheduling pending giveaway endings..."
    );
    for (const giveaway of pending) {
      scheduleGiveawayEnd(giveaway, api);
    }
  }

  log.info(
    {
      overdue: overdue.length,
      pending: pending.length,
    },
    "Schedule restoration complete"
  );
}

/**
 * Get the number of currently scheduled tasks.
 */
export function getScheduledCount(): number {
  return scheduledTasks.size;
}
