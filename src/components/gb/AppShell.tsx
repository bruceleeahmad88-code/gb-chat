"use client";

/** GB Chat — app shell: boot, auth gate, navigation, socket, toasts */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { MessageCircle, CircleDashed, Phone, Menu as MenuIcon } from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, getToken, setToken, syncClock } from "@/lib/gb-api";
import { handleSignal } from "@/lib/calls";
import { askNotifyPermission, armNotifyGesture, sysNotify } from "@/lib/notify";
import type { Me, ChatMessage } from "@/lib/gb-types";
import { themeVars } from "@/components/gb/ui-bits";
import { Splash, Welcome, Signup, Login } from "@/components/gb/Auth";
import { LockScreen } from "@/components/gb/SettingsScreens";
import { ChatList } from "@/components/gb/ChatList";
import { ChatView } from "@/components/gb/ChatView";
import { NewChat, NewGroup, AddContactScreen } from "@/components/gb/NewChatScreens";
import { ContactInfo } from "@/components/gb/ContactInfo";
import { StatusScreen, AddStatus, StatusViewer } from "@/components/gb/StatusScreens";
import { CallsScreen, Dialpad, CallOverlay } from "@/components/gb/CallsScreens";
import {
  SettingsScreen,
  ProfileScreen,
  AccountScreen,
  PrivacyScreen,
  ChatSettingsScreen,
  NotifSettingsScreen,
  RingtoneScreen,
  StorageScreen,
  StarredScreen,
  ArchivedScreen,
  InviteScreen,
} from "@/components/gb/SettingsScreens";
import { GBSettingsScreen } from "@/components/gb/GBSettings";

type BootState = "loading" | "auth" | "signup" | "login" | "locked" | "main";

export function AppShell() {
  // fixed initial state for SSR/client hydration consistency
  const [boot, setBoot] = useState<BootState>("loading");
  const me = useGB((s) => s.me);
  const setMe = useGB((s) => s.setMe);
  const tab = useGB((s) => s.tab);
  const setTab = useGB((s) => s.setTab);
  const viewStack = useGB((s) => s.viewStack);
  const pushView = useGB((s) => s.pushView);
  const popView = useGB((s) => s.popView);
  const toast = useGB((s) => s.toast);
  const toastQueue = useGB((s) => s.toastQueue);
  const dismissToast = useGB((s) => s.dismissToast);

  /* ---------- real device time sync (messages show the DEVICE clock) ---------- */
  useEffect(() => {
    syncClock();
    const t = setInterval(syncClock, 5 * 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") syncClock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // keep splash visible briefly, then show welcome
      const t = setTimeout(() => setBoot("auth"), 1200);
      return () => clearTimeout(t);
    }
    let alive = true;
    api<{ me: Me }>("/api/me")
      .then((r) => {
        if (!alive) return;
        setMe(r.me);
        const settings = r.me.settings;
        if (settings.gb.appLock && settings.pin) {
          setBoot("locked");
        } else {
          setBoot("main");
        }
      })
      .catch(() => {
        if (!alive) return;
        setToken(null);
        const t = setTimeout(() => setBoot("auth"), 1200);
        return () => clearTimeout(t);
      });
    return () => {
      alive = false;
    };
  }, [setMe]);

  /* ---------- if logged out while in main, go back to welcome ---------- */
  useEffect(() => {
    if (boot === "main" && !me) {
      const t = setTimeout(() => setBoot("auth"), 0);
      return () => clearTimeout(t);
    }
  }, [boot, me]);

  /* ---------- presence heartbeat ---------- */
  useEffect(() => {
    if (boot !== "main") return;
    const ping = () => api("/api/me/presence", { method: "POST" }).catch(() => {});
    ping();
    const timer = setInterval(ping, 25000);
    return () => clearInterval(timer);
  }, [boot]);

  /* ---------- data refresh ---------- */
  useEffect(() => {
    if (boot !== "main" || !me) return;
    useGB.getState().refreshChats();
    useGB.getState().refreshStatus();
    void catchUpMissedCalls(); // also refreshes calls — shows offline missed-call rows
  }, [boot, me?.id]);

  /* ---------- invite link (?ref=) opened by a LOGGED-IN user —
     the inviter instantly appears in contacts (WhatsApp-style) ---------- */
  const refApplied = useRef(false);
  useEffect(() => {
    if (boot !== "main" || !me || refApplied.current) return;
    refApplied.current = true;
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    api<{ already: boolean; user: { name: string } }>("/api/contacts/add", {
      method: "POST",
      body: { code: ref },
    })
      .then((r) => {
        useGB.getState().refreshChats();
        useGB
          .getState()
          .toast(
            r.already
              ? `${r.user.name} is already in your contacts`
              : `${r.user.name} added to your contacts ✅`
          );
      })
      .catch((e) => useGB.getState().toast((e as Error).message, "error"))
      .finally(() => {
        // clean the URL so refresh doesn't re-trigger
        window.history.replaceState({}, "", window.location.pathname);
      });
  }, [boot, me?.id, me]);  

  /* ---------- WhatsApp-style system notifications ---------- */
  useEffect(() => {
    if (boot !== "main") return;
    askNotifyPermission();
    armNotifyGesture(); // browsers only allow the prompt inside a user gesture
  }, [boot]);

  /* ---------- socket ---------- */
  useEffect(() => {
    if (boot !== "main" || !me) return;

    /* Socket URL is environment-driven:
     * - sandbox/dev: NEXT_PUBLIC_SOCKET_URL unset -> legacy Caddy transform URL
     * - production (Render etc.): NEXT_PUBLIC_SOCKET_URL=/ -> same origin, standard /socket.io path */
    const sockUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "/?XTransformPort=3003";
    const sock = io(sockUrl, {
      path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
      transports: ["websocket", "polling"],
      // PRESENCE FIX: never give up reconnecting. The old limit (10 tries ≈ 15s) left
      // contacts stuck "offline" after the phone slept, and incoming calls were missed.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 12000,
    });
    (window as unknown as { __gbSocket?: typeof sock }).__gbSocket = sock;

    sock.on("connect", () => {
      sock.emit("auth", { userId: me.id });
      // rejoin active chat room
      const active = useGB.getState().activeChatId;
      if (active) sock.emit("chat:join", { chatId: active });
      // fresh presence data after any reconnect
      useGB.getState().refreshChats();
      // just came online → pick up missed-call rows that landed while we were away
      void catchUpMissedCalls();
    });

    // phone woke up / tab visible again → force a reconnect attempt right away
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      syncClock();
      if (!sock.connected) sock.connect();
      api("/api/me/presence", { method: "POST" }).catch(() => {});
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);

    sock.on("presence:snapshot", (d: { online: string[] }) => {
      useGB.getState().setOnline(d.online);
    });
    sock.on("presence", (d: { userId: string; online: boolean; at?: string }) => {
      useGB.getState().setPresence(d.userId, d.online, d.at);
    });

    /* ---------- incoming & in-call signaling (REAL calls) ---------- */
    sock.on("call:signal", (d: Parameters<typeof handleSignal>[0]) => {
      // system notification for incoming calls when the tab is in the background
      if (d?.t === "invite" && d.from && typeof d.from === "object") {
        const st = useGB.getState();
        if (!st.me?.settings.gb.dnd) {
          sysNotify(
            `Incoming ${d.video ? "video" : "voice"} call`,
            (d.from as { name?: string }).name || "GB Chat",
            { tag: "gb-call" }
          );
        }
      }
      void handleSignal(d);
    });

    /* offline caller left a missed call for us — WhatsApp-style banner */
    sock.on("call:missed", (d: { from?: { name?: string }; type?: string }) => {
      const s = useGB.getState();
      void s.refreshCalls();
      if (s.me?.settings.gb.dnd) return;
      const who = d.from?.name || "Someone";
      s.toast(`📞 Missed ${d.type === "video" ? "video" : "voice"} call from ${who}`);
      sysNotify(`Missed ${d.type === "video" ? "video call" : "voice call"}`, who, {
        tag: "gb-missed-live",
        onClick: () => useGB.getState().setTab("calls"),
      });
    });

    sock.on("message:new", (d: { message: ChatMessage }) => {
      const s = useGB.getState();
      const m = d.message;
      const mine = m.senderId === me.id;
      const isActive = s.activeChatId === m.chatId;
      s.appendMessage(m, { active: isActive });
      if (!mine) {
        s.refreshChats();
        // toast for background messages
        if (!isActive) {
          const settings = s.me?.settings;
          const chat = s.chats.find((c) => c.id === m.chatId);
          if (settings?.notifications.messages !== false && !settings?.gb.dnd && !chat?.muted) {
            const from = chat?.name || m.sender.name;
            const isGroup = chat?.type === "group";
            if (!isGroup || settings?.notifications.groupMessages) {
              const preview = m.type !== "text" ? `📎 ${m.type}` : m.content.slice(0, 60);
              s.toast(`${from}: ${preview}`);
              // WhatsApp-style system notification (background tab)
              sysNotify(from, settings?.notifications.preview === false ? "New message" : preview, {
                tag: `gb-msg-${m.chatId}`,
                onClick: () => void useGB.getState().openChat(m.chatId),
              });
            }
          }
        } else {
          api(`/api/chats/${m.chatId}/read`, { method: "POST" }).catch(() => {});
        }
        // delivered ack for real users
        if (!m.sender.isBot) {
          sock.emit("msg:ack", { chatId: m.chatId, status: "delivered", senderId: m.senderId });
        }
      }
    });

    sock.on("message:status", (d: { chatId: string; senderId: string; status: string }) => {
      const s = useGB.getState();
      if (d.senderId === me.id) {
        s.updateMessageStatus(d.chatId, me.id, d.status);
        s.refreshChats();
      }
    });

    sock.on("message:deleted", (d: { chatId: string; messageId: string; scope: string; by: string }) => {
      const s = useGB.getState();
      if (d.scope === "everyone") {
        s.removeMessage(d.chatId, d.messageId);
      } else if (d.by === me.id) {
        useGB.setState((st) => ({
          messagesByChat: {
            ...st.messagesByChat,
            [d.chatId]: (st.messagesByChat[d.chatId] || []).filter((x) => x.id !== d.messageId),
          },
        }));
      }
      s.refreshChats();
    });

    sock.on("typing", (d: { chatId: string; userId: string; name: string; isTyping: boolean }) => {
      if (d.userId !== me.id) {
        useGB.getState().setTyping(d.chatId, d.userId, d.name, d.isTyping);
      }
    });

    sock.on("chats:invalidate", () => {
      useGB.getState().refreshChats();
    });
    sock.on("status:invalidate", () => {
      useGB.getState().refreshStatus();
    });
    sock.on("calls:invalidate", () => {
      useGB.getState().refreshCalls();
    });
    sock.on("starred:invalidate", () => {
      /* starred list refetches on open */
    });
    sock.on("settings:updated", (settings: Me["settings"]) => {
      const s = useGB.getState();
      if (s.me) s.setMe({ ...s.me, settings });
    });

    return () => {
      sock.disconnect();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      (window as unknown as { __gbSocket?: undefined }).__gbSocket = undefined;
    };
  }, [boot, me?.id]);  

  /* ---------- chat room join/leave on navigation ---------- */
  const prevChat = useRef<string | null>(null);
  useEffect(() => {
    const sock = (window as unknown as { __gbSocket?: { emit: (e: string, d: unknown) => void } }).__gbSocket;
    if (!sock) return;
    const active = useGB.getState().activeChatId;
    if (prevChat.current && prevChat.current !== active) {
      sock.emit("chat:leave", { chatId: prevChat.current });
    }
    if (active) sock.emit("chat:join", { chatId: active });
    prevChat.current = active;
  }, [viewStack]);

  /* ---------- theme vars ---------- */
  const vars = themeVars(me?.settings);
  const fontScale = me?.settings.chat.fontSize || 15;

  /* ---------- render ---------- */
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0c1917] via-[#111d1a] to-[#0a0f0d] sm:p-6">
      {/* phone frame */}
      <div
        className="relative w-full h-[100dvh] sm:h-[860px] sm:max-h-[92vh] sm:w-[420px] sm:rounded-[2.2rem] sm:shadow-[0_25px_80px_-12px_rgba(0,0,0,0.7)] sm:ring-1 sm:ring-white/10 overflow-hidden"
        style={vars as React.CSSProperties}
      >
        <div className="h-full flex flex-col text-[var(--gb-text)]" style={{ fontSize: fontScale }}>
          {boot === "loading" && <Splash />}
          {boot === "auth" && (
            <Welcome
              onSignup={() => setBoot("signup")}
              onLogin={() => setBoot("login")}
            />
          )}
          {boot === "signup" && (
            <Signup
              onBack={() => setBoot("auth")}
              goLogin={() => setBoot("login")}
              onDone={(token, m) => {
                setToken(token);
                setMe(m);
                setBoot(m.settings.gb.appLock && m.settings.pin ? "locked" : "main");
              }}
            />
          )}
          {boot === "login" && (
            <Login
              onBack={() => setBoot("auth")}
              goSignup={() => setBoot("signup")}
              onDone={(token, m) => {
                setToken(token);
                setMe(m);
                setBoot(m.settings.gb.appLock && m.settings.pin ? "locked" : "main");
              }}
            />
          )}
          {boot === "locked" && <LockScreen onUnlock={() => setBoot("main")} />}
          {boot === "main" && me && <MainRouter />}

          {/* toasts */}
          <div className="absolute top-3 left-3 right-3 z-[80] flex flex-col gap-2 pointer-events-none">
            {toastQueue.map((t) => (
              <button
                key={t.id}
                onClick={() => dismissToast(t.id)}
                className={`pointer-events-auto text-left px-4 py-2.5 rounded-xl shadow-2xl text-[13.5px] leading-snug ${
                  t.kind === "error" ? "bg-red-600 text-white" : "bg-[#1f2c34] text-white/95"
                }`}
                style={{ animation: "gbToastIn 0.25s ease-out" }}
              >
                {t.text}
              </button>
            ))}
          </div>

          {/* global overlays */}
          <CallOverlay />
        </div>
      </div>

      <style jsx global>{`
        @keyframes gbToastIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(128, 128, 128, 0.35);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}

/* ---------------- Main router (tabs + nav stack) ---------------- */

/** WhatsApp-style missed-call catch-up: rows that landed while the app was
 *  closed/offline show as red "Missed" entries + a one-time banner per row. */
async function catchUpMissedCalls(): Promise<void> {
  try {
    await useGB.getState().refreshCalls();
    const KEY = "gb_missedSeenAt";
    const seen = Number(localStorage.getItem(KEY) || "0");
    const calls = useGB.getState().calls;
    const missed = calls.filter(
      (c) => !c.outgoing && (c.outcome === "missed" || (!c.outgoing && c.duration === 0))
    );
    if (seen > 0) {
      const fresh = missed.filter((c) => new Date(c.createdAt).getTime() > seen);
      const s = useGB.getState();
      for (const c of fresh.slice(0, 3)) {
        s.toast(`📞 Missed ${c.type === "video" ? "video" : "voice"} call from ${c.other.name}`);
        sysNotify(`Missed ${c.type === "video" ? "video call" : "voice call"}`, c.other.name, {
          tag: `gb-missed-${c.id}`,
          onClick: () => useGB.getState().setTab("calls"),
        });
      }
      if (fresh.length > 3) {
        useGB.getState().toast(`📞 ${fresh.length - 3} more missed calls — check the Calls tab`);
      }
    }
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function MainRouter() {
  const viewStack = useGB((s) => s.viewStack);
  const tab = useGB((s) => s.tab);
  const setTab = useGB((s) => s.setTab);
  const pushView = useGB((s) => s.pushView);
  const popView = useGB((s) => s.popView);
  const me = useGB((s) => s.me);
  const chats = useGB((s) => s.chats);

  const top = viewStack[viewStack.length - 1];
  const totalUnread = chats.filter((c) => !c.archived).reduce((a, c) => a + c.unread, 0);

  // tab content
  const tabContent =
    tab === "chats" ? <ChatList /> : tab === "status" ? <StatusScreen /> : <CallsScreen />;

  // stack screens
  let screen: React.ReactNode = null;
  if (top.name === "tabs") {
    screen = tabContent;
  } else {
    switch (top.name) {
      case "chat":
        screen = <ChatView chatId={top.chatId} />;
        break;
      case "newchat":
        screen = <NewChat />;
        break;
      case "newgroup":
        screen = <NewGroup />;
        break;
      case "addcontact":
        screen = <AddContactScreen />;
        break;
      case "settings":
        screen = <SettingsScreen />;
        break;
      case "profile":
        screen = <ProfileScreen />;
        break;
      case "account":
        screen = <AccountScreen />;
        break;
      case "privacy":
        screen = <PrivacyScreen />;
        break;
      case "chatsettings":
        screen = <ChatSettingsScreen />;
        break;
      case "notifsettings":
        screen = <NotifSettingsScreen />;
        break;
      case "ringtone":
        screen = <RingtoneScreen />;
        break;
      case "storage":
        screen = <StorageScreen />;
        break;
      case "gbsettings":
        screen = <GBSettingsScreen />;
        break;
      case "starred":
        screen = <StarredScreen />;
        break;
      case "archived":
        screen = <ArchivedScreen />;
        break;
      case "invite":
        screen = <InviteScreen />;
        break;
      case "contactinfo":
        screen = <ContactInfo chatId={top.chatId} />;
        break;
      case "addstatus":
        screen = <AddStatus />;
        break;
      case "statusview":
        screen = <StatusViewer />;
        break;
      default:
        screen = tabContent;
    }
  }

  const showTabs = top.name === "tabs";

  return (
    <div className="h-full flex flex-col relative">
      {/* status bar area for desktop frame aesthetics */}
      {showTabs && (
        <div className="h-9 shrink-0 flex items-center justify-between px-5 text-[11px] font-medium" style={{ background: "var(--gb-header)" }}>
          <span className="text-white/90">9:41</span>
          <div className="flex items-center gap-1 text-white/90">
            <span>▮▮▮</span>
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">{screen}</div>

      {/* bottom tabs */}
      {showTabs && (
        <div className="h-[62px] shrink-0 flex items-stretch border-t border-[var(--gb-border)]" style={{ background: "var(--gb-panel)" }}>
          <TabButton
            active={tab === "chats"}
            onClick={() => setTab("chats")}
            icon={<MessageCircle size={22} />}
            label="Chats"
            badge={totalUnread}
          />
          <TabButton
            active={tab === "status"}
            onClick={() => setTab("status")}
            icon={<CircleDashed size={22} />}
            label="Status"
          />
          <TabButton
            active={tab === "calls"}
            onClick={() => setTab("calls")}
            icon={<Phone size={20} />}
            label="Calls"
          />
          <TabButton
            active={false}
            onClick={() => pushView({ name: "settings" })}
            icon={<MenuIcon size={22} />}
            label="Menu"
          />
        </div>
      )}

      {/* back handling for browser back button */}
      <BrowserBack onBack={popView} />
      <span className="hidden">{me?.id}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
        active ? "text-[var(--gb-accent)]" : "text-[var(--gb-text-2)]"
      }`}
    >
      <span className="relative">
        {icon}
        {!!badge && badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ background: "var(--gb-accent)" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="text-[10.5px] font-medium">{label}</span>
      {active && (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full"
          style={{ background: "var(--gb-accent)" }}
        />
      )}
    </button>
  );
}

/** Browser back button → pop navigation stack */
function BrowserBack({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      onBack();
    };
    window.history.pushState({ gb: true }, "");
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [onBack]);
  return null;
}
