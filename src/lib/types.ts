/** Shared types — original GB Chat implementation */

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  about: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarUrl?: string | null;
  isBot: boolean;
  isOnline: boolean;
  lastSeen: string;
  email?: string;
  /** permanent GB number identity (WhatsApp-style) */
  gbNumber?: string | null;
  /** per-account contact meta (injected by API) */
  favourite?: boolean;
  isCustomNamed?: boolean;
}

export interface ChatSummary {
  id: string;
  type: "individual" | "group";
  name: string; // display name (other user name or group name)
  emoji: string;
  color: string;
  about?: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  unread: number;
  updatedAt: string;
  otherUser?: PublicUser; // individual chats
  participants?: PublicUser[]; // groups
  lastMessage?: {
    id: string;
    type: string;
    content: string;
    senderId: string;
    senderName: string;
    status: string;
    deletedForAll: boolean;
    createdAt: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  mediaSeed: string | null;
  mediaName: string | null;
  mediaMeta: string | null;
  status: string;
  starred: boolean;
  deletedForAll: boolean;
  deletedForIds: string;
  replyToId: string | null;
  replyToContent: string | null;
  replyToSender: string | null;
  replyToType: string | null;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    username: string;
    avatarColor: string;
    avatarEmoji: string;
    avatarUrl?: string | null;
    isBot?: boolean;
  };
}

export interface StatusItem {
  id: string;
  userId: string;
  type: "text" | "image";
  content: string;
  mediaSeed: string | null;
  bg: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  myReaction?: string | null;
  reactions?: { emoji: string; viewerId: string; name: string }[];
  viewCount: number;
  viewers: { id: string; name: string; viewedAt: string }[];
  user: PublicUser;
}

export interface CallEntry {
  id: string;
  type: "audio" | "video";
  outcome: "missed" | "outgoing" | "incoming" | "declined" | "ended";
  duration: number;
  createdAt: string;
  other: PublicUser;
  outgoing: boolean;
}

export interface Me extends PublicUser {
  email: string;
  settings: import("./settings").UserSettings;
}
