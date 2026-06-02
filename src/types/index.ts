import type { Context, Api, SessionFlavor } from "grammy";
import type { HydrateFlavor } from "@grammyjs/hydrate";
import type { ConversationFlavor } from "@grammyjs/conversations";

// ─── Bot Context ───

/**
 * Custom bot context with hydration and conversation support.
 */
export type BotContext = HydrateFlavor<Context> &
  ConversationFlavor<Context> &
  SessionFlavor<any>;

// ─── Giveaway Types ───

export type GiveawayType =
  | "new_members"
  | "existing_members"
  | "multi_channel"
  | "all_members";

export type GiveawayStatus = "draft" | "active" | "ended" | "cancelled";

export interface GiveawayCreateInput {
  prize: string;
  description?: string;
  type: GiveawayType;
  channelTelegramId: bigint;
  additionalChannelIds?: bigint[];
  startTime: Date;
  endTime: Date;
  maxWinners: number;
  minAccountAge?: number;
  joinDateAfter?: Date;
  joinDateBefore?: Date;
  weightByActivity?: boolean;
  createdByTelegramId: bigint;
}

export interface GiveawayWithRelations {
  id: string;
  channelId: number;
  createdBy: number;
  prize: string;
  description: string | null;
  type: GiveawayType;
  startTime: Date;
  endTime: Date;
  maxWinners: number;
  minAccountAge: number | null;
  joinDateAfter: Date | null;
  joinDateBefore: Date | null;
  weightByActivity: boolean;
  status: GiveawayStatus;
  seed: string | null;
  participantHash: string | null;
  proofHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  channel?: {
    id: number;
    telegramId: bigint;
    name: string;
    username: string | null;
  } | null;
  creator?: {
    id: number;
    telegramId: bigint;
    username: string | null;
    firstName: string;
  } | null;
}

// ─── Participant Types ───

export interface ParticipantWithUser {
  id: number;
  giveawayId: string;
  userId: number;
  joinedAt: Date;
  isEligible: boolean;
  eligibilityReason: string | null;
  messageCount: number;
  user: {
    id: number;
    telegramId: bigint;
    username: string | null;
    firstName: string;
    lastName: string | null;
    accountCreated: Date | null;
    firstSeen: Date;
  };
}

// ─── Winner Types ───

export interface WinnerWithUser {
  id: number;
  giveawayId: string;
  userId: number;
  drawTime: Date;
  position: number;
  proofHash: string;
  isReroll: boolean;
  rerollReason: string | null;
  notified: boolean;
  user: {
    id: number;
    telegramId: bigint;
    username: string | null;
    firstName: string;
    lastName: string | null;
  };
}

// ─── Fairness Types ───

export interface FairnessProof {
  giveawayId: string;
  participantIds: number[];
  participantHash: string;
  seed: string;
  combinedHash: string;
  winnerIds: number[];
  winnerTelegramIds: bigint[];
  algorithm: "sha256" | "random_org";
  drawHashes: string[];
}

// ─── Eligibility Types ───

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
}

// ─── Validation Types ───

export interface ValidationCheck {
  name: string;
  passed: boolean;
  reason?: string;
}

// ─── Export Types ───

export interface ExportParticipant {
  telegramId: bigint;
  username: string | null;
  firstName: string;
  lastName: string | null;
  joinedAt: Date;
  isEligible: boolean;
  eligibilityReason: string | null;
  messageCount: number;
}

export interface ExportWinner {
  position: number;
  telegramId: bigint;
  username: string | null;
  firstName: string;
  lastName: string | null;
  drawTime: Date;
  proofHash: string;
  isReroll: boolean;
}

// ─── Scheduler Types ───

export interface ScheduledTask {
  giveawayId: string;
  endTime: Date;
  timeout: ReturnType<typeof setTimeout>;
}
