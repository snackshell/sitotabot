import { stringify } from "csv-stringify/sync";

export interface CSVColumn {
  key: string;
  header: string;
}

/**
 * Generate a CSV string from an array of records.
 */
export function generateCSV(
  records: Record<string, unknown>[],
  columns: CSVColumn[]
): string {
  return stringify(records, {
    header: true,
    columns: columns.map((col) => ({ key: col.key, header: col.header })),
    cast: {
      date: (value: Date) => value.toISOString(),
      boolean: (value: boolean) => (value ? "true" : "false"),
      bigint: (value: bigint) => value.toString(),
    },
  });
}

/**
 * Generate a participants CSV.
 */
export function generateParticipantsCSV(
  participants: {
    telegramId: bigint;
    username: string | null;
    firstName: string;
    lastName: string | null;
    joinedAt: Date;
    isEligible: boolean;
    eligibilityReason: string | null;
    messageCount: number;
  }[]
): string {
  const columns: CSVColumn[] = [
    { key: "telegramId", header: "Telegram ID" },
    { key: "username", header: "Username" },
    { key: "firstName", header: "First Name" },
    { key: "lastName", header: "Last Name" },
    { key: "joinedAt", header: "Joined At" },
    { key: "isEligible", header: "Eligible" },
    { key: "eligibilityReason", header: "Reason" },
    { key: "messageCount", header: "Messages" },
  ];

  return generateCSV(
    participants.map((p) => ({
      ...p,
      telegramId: p.telegramId.toString(),
    })),
    columns
  );
}

/**
 * Generate a winners CSV.
 */
export function generateWinnersCSV(
  winnersList: {
    position: number;
    telegramId: bigint;
    username: string | null;
    firstName: string;
    lastName: string | null;
    drawTime: Date;
    proofHash: string;
    isReroll: boolean;
  }[]
): string {
  const columns: CSVColumn[] = [
    { key: "position", header: "Position" },
    { key: "telegramId", header: "Telegram ID" },
    { key: "username", header: "Username" },
    { key: "firstName", header: "First Name" },
    { key: "lastName", header: "Last Name" },
    { key: "drawTime", header: "Draw Time" },
    { key: "proofHash", header: "Proof Hash" },
    { key: "isReroll", header: "Reroll" },
  ];

  return generateCSV(
    winnersList.map((w) => ({
      ...w,
      telegramId: w.telegramId.toString(),
    })),
    columns
  );
}
