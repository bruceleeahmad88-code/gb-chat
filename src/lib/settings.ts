/** User settings model — all original GB Chat implementation */

export interface PrivacySettings {
  lastSeen: "everyone" | "contacts" | "nobody";
  profilePhoto: "everyone" | "contacts" | "nobody";
  about: "everyone" | "contacts" | "nobody";
  status: "contacts" | "all" | "none";
  readReceipts: boolean; // blue ticks
  groups: "everyone" | "contacts" | "nobody";
  calls: "everyone" | "contacts" | "nobody";
  liveLocation: boolean;
  blocked: string[]; // blocked usernames
}

export interface GBSettings {
  dnd: boolean; // do not disturb
  autoReply: boolean;
  autoReplyText: string;
  freezeLastSeen: boolean;
  hideBlueTicks: boolean;
  hideSecondTick: boolean;
  hideTyping: boolean;
  antiRevoke: boolean;
  appLock: boolean;
  showOnlineStatus: boolean;
}

export interface ChatPrefs {
  theme: "light" | "dark" | "amoled";
  accent: string; // hex without #
  wallpaper: string; // key: default | doodle | solid-<hex>
  fontSize: number; // 12..20
  enterToSend: boolean;
  mediaVisibility: boolean;
  darkWallpaper: boolean;
}

export interface NotificationPrefs {
  messages: boolean;
  preview: boolean;
  sound: boolean;
  conversationTones: boolean;
  groupMessages: boolean;
  /** selected call ringtone (key of RINGTONES in lib/ringtones) */
  callRingtone: string;
  /** vibrate on incoming call */
  callVibrate: boolean;
}

export interface UserSettings {
  privacy: PrivacySettings;
  gb: GBSettings;
  chat: ChatPrefs;
  notifications: NotificationPrefs;
  pin: string | null; // app lock pin
  scheduledCount: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  privacy: {
    lastSeen: "everyone",
    profilePhoto: "everyone",
    about: "everyone",
    status: "contacts",
    readReceipts: true,
    groups: "everyone",
    calls: "everyone",
    liveLocation: false,
    blocked: [],
  },
  gb: {
    dnd: false,
    autoReply: false,
    autoReplyText: "I am busy right now. I will get back to you soon!",
    freezeLastSeen: false,
    hideBlueTicks: false,
    hideSecondTick: false,
    hideTyping: false,
    antiRevoke: true,
    appLock: false,
    showOnlineStatus: true,
  },
  chat: {
    theme: "light",
    accent: "00a884",
    wallpaper: "default",
    fontSize: 15,
    enterToSend: true,
    mediaVisibility: true,
    darkWallpaper: false,
  },
  notifications: {
    messages: true,
    preview: true,
    sound: true,
    conversationTones: true,
    groupMessages: true,
    callRingtone: "classic",
    callVibrate: true,
  },
  pin: null,
  scheduledCount: 0,
};

/** Deep-merge stored JSON over defaults so new fields always exist */
export function parseSettings(raw: string): UserSettings {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    parsed = {};
  }
  const merged: UserSettings = {
    ...DEFAULT_SETTINGS,
    ...(parsed as Partial<UserSettings>),
  };
  merged.privacy = { ...DEFAULT_SETTINGS.privacy, ...((parsed.privacy as object) || {}) };
  merged.gb = { ...DEFAULT_SETTINGS.gb, ...((parsed.gb as object) || {}) };
  merged.chat = { ...DEFAULT_SETTINGS.chat, ...((parsed.chat as object) || {}) };
  merged.notifications = {
    ...DEFAULT_SETTINGS.notifications,
    ...((parsed.notifications as object) || {}),
  };
  return merged;
}

export const ACCENTS: { name: string; hex: string }[] = [
  { name: "Green", hex: "00a884" },
  { name: "Teal", hex: "00897b" },
  { name: "Blue", hex: "0288d1" },
  { name: "Purple", hex: "7b1fa2" },
  { name: "Pink", hex: "e91e63" },
  { name: "Orange", hex: "f57c00" },
  { name: "Red", hex: "e53935" },
  { name: "Indigo", hex: "3949ab" },
];

export const WALLPAPERS: { key: string; label: string; color: string }[] = [
  { key: "default", label: "Default Doodle", color: "#efe7db" },
  { key: "plain", label: "Plain", color: "#f6f2ec" },
  { key: "mint", label: "Mint", color: "#dcf3ec" },
  { key: "sand", label: "Sand", color: "#f5e6c8" },
  { key: "blush", label: "Blush", color: "#f8dee7" },
  { key: "sky", label: "Sky", color: "#d9edf7" },
  { key: "lav", label: "Lavender", color: "#e8def5" },
  { key: "charcoal", label: "Charcoal", color: "#1e272c" },
];
