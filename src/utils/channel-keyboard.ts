import { InlineKeyboard } from "grammy";
import { escapeHtml } from "./telegram.js";

export type RequiredChannel = {
  name: string;
  username: string | null;
};

function cleanUsername(username: string): string {
  return username.replace(/^@/, "");
}

function buttonLabel(channel: RequiredChannel, index: number, total: number): string {
  const prefix = total > 1 ? `Join ${index + 1}` : "Open Channel";
  const name = channel.name.trim() || channel.username || "Channel";
  const compactName = name.length > 28 ? `${name.slice(0, 25)}...` : name;
  return total > 1 ? `${prefix}: ${compactName}` : prefix;
}

export function formatRequiredChannelLines(channels: RequiredChannel[]): string[] {
  if (channels.length === 0) return [];

  return channels.map((channel, index) => {
    const username = channel.username
      ? `@${cleanUsername(channel.username)}`
      : "no public link";
    return `${index + 1}. ${escapeHtml(channel.name)} (${escapeHtml(username)})`;
  });
}

export function hasRequiredChannelLinks(channels: RequiredChannel[]): boolean {
  return channels.some((channel) => channel.username);
}

export function addRequiredChannelButtons(
  keyboard: InlineKeyboard,
  channels: RequiredChannel[]
): InlineKeyboard {
  const linkableChannels = channels.filter((channel) => channel.username);

  linkableChannels.forEach((channel, index) => {
    keyboard
      .url(
        buttonLabel(channel, index, linkableChannels.length),
        `https://t.me/${cleanUsername(channel.username!)}`
      )
      .row();
  });

  return keyboard;
}
