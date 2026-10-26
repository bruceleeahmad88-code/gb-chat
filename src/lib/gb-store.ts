"use client";

/** GB Chat global store (zustand) — original implementation */
import { create } from "zustand";
import { api, setToken } from "@/lib/gb-api";
import type { ChatMessage, ChatSummary, CallEntry, Me, StatusGroup, PublicUser } from "@/lib/gb-types";
import type { UserSettings } from "@/lib/settings";

export type Tab = "chats" | "status" | "calls";

/** Live call state — real user-to-user calls are WebRTC; bot/dialpad calls are simulated */
export interface ActiveCall {
  user: PublicUser;
  video: boolean;
  /** kept for compatibility with old call sites */
  incoming: boolean;
  callId: string;
  /** caller = dialed out, callee = receiving, sim = bot/dialpad demo call */
  role: "caller" | "callee" | "sim";
  phase: "ringing-out" | "ringing-in" | "connecting" | "active" | "ended";
  endedLabel?: string;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  muted?: boolean;
  camOff?: boolean;
  /** voice-relay fallback active (direct WebRTC media unavailable — audio via socket) */
  relayMode?: boolean;
}

export type View =
  | { name: "tabs" }
  | { name: "chat"; chatId: string }
  | { name: "newchat" }
  | { name: "newgroup" }
  | { name: "addcontact" }
  | { name: "settings" }
  | { name: "profile" }
  | { name: "contactinfo"; chatId: string }
  | { name: "gbsettings" }
  | { name: "privacy" }
  | { name: "chatsettings" }
  | { name: "notifsettings" }
  | { name: "ringtone" }
  | {name: "account"}
  | { name: "storage" }
  | { name: "starred" }
  | { name: "archived" }
  | { name: "invite" }
  | { name: "addstatus" }
  | { name: "statusview" }
  | { name: "lock" };

interface TypingState {
  [chatId: string]: { userId: string; name: string } | null;
}

interface GBStore {
  booted: boolean;
  me: Me | null;
  chats: ChatSummary[];
  chatsLoaded: boolean;
  statusGroups: StatusGroup[];
  calls: CallEntry[];
  messagesByChat: Record<string, ChatMessage[]>;
  typing: TypingState;
  online: Set<string>;
  /** userId -> last-seen ISO reported by presence-offline events (fresh last seen) */
  lastSeenBy: Record<string, string>;
  activeChatId: string | null;
  tab: Tab;
  viewStack: View[];
  toastQueue: { id: number; text: string; kind: "info" | "error" }[];
  searchQuery: string;
  forwarding: ChatMessage | null;
  replying: ChatMessage | null;
  activeCall: ActiveCall | null;
  dialpadOpen: boolean;
  statusViewer: { groupId: string; itemIdx: number } | null;

  setBooted: (v: boolean) => void;
  setMe: (me: Me | null) => void;
  setTab: (t: Tab) => void;
  pushView: (v: View) => void;
  popView: () => void;
  resetViews: () => void;
  toast: (text: string, kind?: "info" | "error") => void;
  dismissToast: (id: number) => void;
  setSearch: (q: string) => void;
  setForwarding: (m: ChatMessage | null) => void;
  setReplying: (m: ChatMessage | null) => void;
  setActiveCall: (c: GBStore["activeCall"]) => void;
  setDialpad: (v: boolean) => void;
  setStatusViewer: (v: { groupId: string; itemIdx: number } | null) => void;

  refreshChats: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshCalls: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  loadChatData: (chatId: string) => Promise<void>;
  openChat: (chatId: string) => Promise<void>;
  closeChat: () => void;
  appendMessage: (m: ChatMessage, opts?: { active?: boolean }) => void;
  updateMessageStatus: (chatId: string, senderId: string, status: string) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  setTyping: (chatId: string, userId: string, name: string, isTyping: boolean) => void;
  setOnline: (ids: string[]) => void;
  setPresence: (userId: string, isOnline: boolean, at?: string) => void;
  logout: () => Promise<void>;
  patchSettings: (patch: Partial<UserSettings> | ((cur: UserSettings) => Partial<UserSettings>)) => Promise<void>;
}

let toastId = 1;

export const useGB = create<GBStore>((set, get) => ({
  booted: false,
  me: null,
  chats: [],
  chatsLoaded: false,
  statusGroups: [],
  calls: [],
  messagesByChat: {},
  typing: {},
  online: new Set(),
  lastSeenBy: {},
  activeChatId: null,
  tab: "chats",
  viewStack: [{ name: "tabs" }],
  toastQueue: [],
  searchQuery: "",
  forwarding: null,
  replying: null,
  activeCall: null,
  dialpadOpen: false,
  statusViewer: null,

  setBooted: (v) => set({ booted: v }),
  setMe: (me) => set({ me }),
  setTab: (t) => set({ tab: t }),
  pushView: (v) => set((s) => ({ viewStack: [...s.viewStack, v] })),
  popView: () => set((s) => ({ viewStack: s.viewStack.length > 1 ? s.viewStack.slice(0, -1) : s.viewStack })),
  resetViews: () => set({ viewStack: [{ name: "tabs" }] }),
  toast: (text, kind = "info") => {
    const id = toastId++;
    set((s) => ({ toastQueue: [...s.toastQueue, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.id !== id) })),
  setSearch: (q) => set({ searchQuery: q }),
  setForwarding: (m) => set({ forwarding: m }),
  setReplying: (m) => set({ replying: m }),
  setActiveCall: (c) => set({ activeCall: c }),
  setDialpad: (v) => set({ dialpadOpen: v }),
  setStatusViewer: (v) => set({ statusViewer: v }),

  refreshChats: async () => {
    try {
      const { chats } = await api<{ chats: ChatSummary[] }>("/api/chats");
      set({ chats, chatsLoaded: true });
    } catch (e) {
      if ((e as Error).message === "Unauthorized") await get().logout();
    }
  },
  refreshStatus: async () => {
    try {
      const { groups } = await api<{ groups: StatusGroup[] }>("/api/status");
      set({ statusGroups: groups });
    } catch {
      /* ignore */
    }
  },
  refreshCalls: async () => {
    try {
      const { calls } = await api<{ calls: CallEntry[] }>("/api/calls");
      set({ calls });
    } catch {
      /* ignore */
    }
  },
  loadMessages: async (chatId) => {
    const { messages } = await api<{ messages: ChatMessage[] }>(`/api/chats/${chatId}/messages`);
    set((s) => ({ messagesByChat: { ...s.messagesByChat, [chatId]: messages } }));
  },
  loadChatData: async (chatId) => {
    try {
      await get().loadMessages(chatId);
      await api(`/api/chats/${chatId}/read`, { method: "POST" });
      set((s) => ({
        chats: s.chats.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)),
      }));
    } catch {
      /* ignore */
    }
  },
  openChat: async (chatId) => {
    set({ activeChatId: chatId, replying: null });
    get().pushView({ name: "chat", chatId });
    await get().loadChatData(chatId);
  },
  closeChat: () => {
    set({ activeChatId: null, replying: null });
    get().popView();
  },

  appendMessage: (m, opts) => {
    const isActive = get().activeChatId === m.chatId && opts?.active;
    set((s) => {
      const list = s.messagesByChat[m.chatId] || [];
      if (list.some((x) => x.id === m.id)) return s;
      return { messagesByChat: { ...s.messagesByChat, [m.chatId]: [...list, m] } };
    });
    if (isActive) {
      api(`/api/chats/${m.chatId}/read`, { method: "POST" }).catch(() => {});
      set((s) => ({ chats: s.chats.map((c) => (c.id === m.chatId ? { ...c, unread: 0 } : c)) }));
    }
  },
  updateMessageStatus: (chatId, senderId, status) => {
    set((s) => {
      const list = s.messagesByChat[chatId];
      if (!list) return s;
      return {
        messagesByChat: {
          ...s.messagesByChat,
          [chatId]: list.map((m) =>
            m.senderId === senderId && ["sent", "delivered", "read"].includes(m.status)
              ? rank(status) > rank(m.status)
                ? { ...m, status }
                : m
              : m
          ),
        },
      };
    });
  },
  removeMessage: (chatId, messageId) => {
    set((s) => {
      const list = s.messagesByChat[chatId];
      if (!list) return s;
      return {
        messagesByChat: {
          ...s.messagesByChat,
          [chatId]: list.map((m) =>
            m.id === messageId ? { ...m, deletedForAll: true, content: "" } : m
          ),
        },
      };
    });
  },
  setTyping: (chatId, userId, name, isTyping) => {
    set((s) => ({
      typing: { ...s.typing, [chatId]: isTyping ? { userId, name } : null },
    }));
    if (isTyping) {
      setTimeout(() => {
        const cur = get().typing[chatId];
        if (cur && cur.userId === userId) set((s) => ({ typing: { ...s.typing, [chatId]: null } }));
      }, 6000);
    }
  },
  setOnline: (ids) => set({ online: new Set(ids) }),
  setPresence: (userId, isOnline, at) => {
    set((s) => {
      const next = new Set(s.online);
      if (isOnline) next.add(userId);
      else next.delete(userId);
      return {
        online: next,
        // keep the freshest last-seen the moment a contact goes offline
        lastSeenBy: !isOnline && at ? { ...s.lastSeenBy, [userId]: at } : s.lastSeenBy,
      };
    });
    set((s) => ({
      chats: s.chats.map((c) =>
        c.otherUser && c.otherUser.id === userId
          ? { ...c, otherUser: { ...c.otherUser, isOnline } }
          : c
      ),
      statusGroups: s.statusGroups.map((g) =>
        g.user.id === userId ? { ...g, user: { ...g.user, isOnline } } : g
      ),
      calls: s.calls.map((c) =>
        c.other.id === userId ? { ...c, other: { ...c.other, isOnline } } : c
      ),
    }));
  },
  logout: async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setToken(null);
    set({
      me: null,
      chats: [],
      chatsLoaded: false,
      statusGroups: [],
      calls: [],
      messagesByChat: {},
      viewStack: [{ name: "tabs" }],
      tab: "chats",
      activeChatId: null,
      online: new Set(),
      lastSeenBy: {},
    });
  },
  patchSettings: async (patch) => {
    const me = get().me;
    if (!me) return;
    const cur = me.settings;
    const p = typeof patch === "function" ? patch(cur) : patch;
    const next: UserSettings = {
      ...cur,
      ...(p as Partial<UserSettings>),
      privacy: { ...cur.privacy, ...(p.privacy || {}) },
      gb: { ...cur.gb, ...(p.gb || {}) },
      chat: { ...cur.chat, ...(p.chat || {}) },
      notifications: { ...cur.notifications, ...(p.notifications || {}) },
    };
    set({ me: { ...me, settings: next } });
    try {
      await api("/api/me/settings", { method: "PUT", body: p });
    } catch {
      /* revert silently */
    }
  },
}));

function rank(status: string): number {
  return status === "read" ? 3 : status === "delivered" ? 2 : 1;
}
