import {
  pgTable,
  serial,
  text,
  timestamp,
  bigint,
  boolean,
  integer,
  uuid,
  pgEnum,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───

export const giveawayTypeEnum = pgEnum("giveaway_type", [
  "new_members",
  "existing_members",
  "multi_channel",
  "all_members",
]);

export const giveawayStatusEnum = pgEnum("giveaway_status", [
  "draft",
  "active",
  "ended",
  "cancelled",
]);

// ─── Users ───

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "bigint" }).notNull(),
    username: text("username"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    accountCreated: timestamp("account_created", { withTimezone: true }),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isBot: boolean("is_bot").default(false).notNull(),
  },
  (table) => [uniqueIndex("users_telegram_id_idx").on(table.telegramId)]
);

// ─── Channels ───

export const channels = pgTable(
  "channels",
  {
    id: serial("id").primaryKey(),
    telegramId: bigint("telegram_id", { mode: "bigint" }).notNull(),
    name: text("name").notNull(),
    username: text("username"),
    memberCount: integer("member_count"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("channels_telegram_id_idx").on(table.telegramId)]
);

// ─── Giveaways ───

export const giveaways = pgTable("giveaways", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: integer("channel_id")
    .references(() => channels.id, { onDelete: "cascade" })
    .notNull(),
  createdBy: integer("created_by")
    .references(() => users.id)
    .notNull(),
  prize: text("prize").notNull(),
  description: text("description"),
  type: giveawayTypeEnum("type").default("all_members").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  maxWinners: integer("max_winners").default(1).notNull(),
  creatorContactUsername: text("creator_contact_username"),
  winnersPublic: boolean("winners_public").default(false).notNull(),
  minAccountAge: integer("min_account_age_days"),
  joinDateAfter: timestamp("join_date_after", { withTimezone: true }),
  joinDateBefore: timestamp("join_date_before", { withTimezone: true }),
  weightByActivity: boolean("weight_by_activity").default(false).notNull(),
  status: giveawayStatusEnum("status").default("draft").notNull(),
  seed: text("seed"),
  participantHash: text("participant_hash"),
  proofHash: text("proof_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ─── Giveaway Channels (many-to-many for multi-channel giveaways) ───

export const giveawayChannels = pgTable(
  "giveaway_channels",
  {
    giveawayId: uuid("giveaway_id")
      .references(() => giveaways.id, { onDelete: "cascade" })
      .notNull(),
    channelId: integer("channel_id")
      .references(() => channels.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.giveawayId, table.channelId] }),
  ]
);

// ─── Participants ───

export const participants = pgTable(
  "participants",
  {
    id: serial("id").primaryKey(),
    giveawayId: uuid("giveaway_id")
      .references(() => giveaways.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isEligible: boolean("is_eligible").default(true).notNull(),
    eligibilityReason: text("eligibility_reason"),
    messageCount: integer("message_count").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("participants_giveaway_user_idx").on(
      table.giveawayId,
      table.userId
    ),
  ]
);

// ─── Winners ───

export const winners = pgTable("winners", {
  id: serial("id").primaryKey(),
  giveawayId: uuid("giveaway_id")
    .references(() => giveaways.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  drawTime: timestamp("draw_time", { withTimezone: true })
    .defaultNow()
    .notNull(),
  position: integer("position").notNull(),
  proofHash: text("proof_hash").notNull(),
  isReroll: boolean("is_reroll").default(false).notNull(),
  rerollReason: text("reroll_reason"),
  notified: boolean("notified").default(false).notNull(),
});

// ─── Relations ───

export const usersRelations = relations(users, ({ many }) => ({
  participants: many(participants),
  winners: many(winners),
  createdGiveaways: many(giveaways),
}));

export const channelsRelations = relations(channels, ({ many }) => ({
  giveaways: many(giveaways),
  giveawayChannels: many(giveawayChannels),
}));

export const giveawaysRelations = relations(giveaways, ({ one, many }) => ({
  channel: one(channels, {
    fields: [giveaways.channelId],
    references: [channels.id],
  }),
  creator: one(users, {
    fields: [giveaways.createdBy],
    references: [users.id],
  }),
  participants: many(participants),
  winners: many(winners),
  giveawayChannels: many(giveawayChannels),
}));

export const giveawayChannelsRelations = relations(
  giveawayChannels,
  ({ one }) => ({
    giveaway: one(giveaways, {
      fields: [giveawayChannels.giveawayId],
      references: [giveaways.id],
    }),
    channel: one(channels, {
      fields: [giveawayChannels.channelId],
      references: [channels.id],
    }),
  })
);

export const participantsRelations = relations(participants, ({ one }) => ({
  giveaway: one(giveaways, {
    fields: [participants.giveawayId],
    references: [giveaways.id],
  }),
  user: one(users, {
    fields: [participants.userId],
    references: [users.id],
  }),
}));

export const winnersRelations = relations(winners, ({ one }) => ({
  giveaway: one(giveaways, {
    fields: [winners.giveawayId],
    references: [giveaways.id],
  }),
  user: one(users, {
    fields: [winners.userId],
    references: [users.id],
  }),
}));
