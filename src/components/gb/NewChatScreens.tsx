"use client";

/** GB Chat — new chat & new group screens (private: only invited contacts + your AI) */
import { useEffect, useMemo, useState } from "react";
import { Search, Users, ArrowRight, Check, Crown, Star, UserRoundPlus, ShieldCheck, BookUser, MessageCircle, Loader2 } from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, lastSeenText, formatGbNumber } from "@/lib/gb-api";
import type { PublicUser } from "@/lib/gb-types";
import { GbAvatar, ScreenHeader, HeaderIcon } from "@/components/gb/ui-bits";

export function NewChat() {
  const toast = useGB((s) => s.toast);
  const openChat = useGB((s) => s.openChat);
  const pushView = useGB((s) => s.pushView);
  const refreshChats = useGB((s) => s.refreshChats);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: PublicUser[] }>("/api/users").then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          u.name.toLowerCase().includes(q.toLowerCase()) ||
          u.username.toLowerCase().includes(q.toLowerCase())
      ),
    [users, q]
  );
  const favourites = filtered.filter((u) => u.favourite);
  const contacts = filtered.filter((u) => !u.favourite);

  const start = async (u: PublicUser) => {
    setBusy(u.id);
    try {
      const res = await api<{ chatId: string }>("/api/chats", {
        method: "POST",
        body: { type: "individual", username: u.username },
      });
      await refreshChats();
      openChat(res.chatId);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const renderUser = (u: PublicUser) => (
    <button
      key={u.id}
      onClick={() => start(u)}
      disabled={busy === u.id}
      className="w-full flex items-center gap-4 px-5 py-2.5 hover:bg-[var(--gb-panel-2)] text-left disabled:opacity-60"
    >
      <GbAvatar name={u.name} color={u.avatarColor} emoji={u.avatarEmoji} url={u.avatarUrl} online={u.isOnline} size={46} />
      <div className="flex-1 min-w-0">
        <div className="text-[15.5px] text-[var(--gb-text)] truncate flex items-center gap-1.5">
          {u.name}
          {u.isBot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gb-accent)]/15 text-[var(--gb-accent)] font-semibold">
              BOT
            </span>
          )}
          {u.favourite && <Star size={13} className="text-amber-400 fill-amber-400 shrink-0" />}
        </div>
        <div className="text-[13px] text-[var(--gb-text-2)] truncate">
          @{u.username} • {u.isOnline ? "online" : lastSeenText(u.isOnline, u.lastSeen)}
        </div>
      </div>
      {busy === u.id && <span className="text-[12px] text-[var(--gb-text-2)]">opening...</span>}
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader
        onBack={() => useGB.getState().popView()}
        title="New chat"
        right={
          <HeaderIcon label="new group" onClick={() => pushView({ name: "newgroup" })}>
            <Users size={20} />
          </HeaderIcon>
        }
      />
      <div className="p-3">
        <div className="flex items-center gap-2 h-10 rounded-lg px-3 bg-[var(--gb-panel)] border border-[var(--gb-border)]">
          <Search size={16} className="text-[var(--gb-text-2)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or username"
            className="flex-1 bg-transparent outline-none text-[14px] text-[var(--gb-text)]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => pushView({ name: "addcontact" })}
          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--gb-panel-2)] text-left"
        >
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "var(--gb-accent)" }}>
            <BookUser size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[15.5px] text-[var(--gb-text)]">Add contact</span>
            <span className="block text-[12.5px] text-[var(--gb-text-2)]">Save a friend by their GB number — like WhatsApp</span>
          </span>
        </button>

        <button
          onClick={() => pushView({ name: "newgroup" })}
          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--gb-panel-2)] text-left"
        >
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "var(--gb-accent)" }}>
            <Users size={22} />
          </span>
          <span className="text-[15.5px] text-[var(--gb-text)]">New group</span>
        </button>

        <button
          onClick={() => pushView({ name: "invite" })}
          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--gb-panel-2)] text-left border-b border-[var(--gb-border)]"
        >
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ background: "#5f66cd" }}>
            <UserRoundPlus size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[15.5px] text-[var(--gb-text)]">Invite friends</span>
            <span className="block text-[12.5px] text-[var(--gb-text-2)]">Share your GB number or link — they'll appear here</span>
          </span>
        </button>

        {favourites.length > 0 && (
          <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-accent)] flex items-center gap-1.5">
            <Star size={13} className="fill-current" /> Favourites
          </div>
        )}
        {favourites.map(renderUser)}

        <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-accent)]">Your contacts</div>
        {contacts.map(renderUser)}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-[var(--gb-text-2)] text-sm">
            {q ? `No contacts found for "${q}"` : "No contacts yet — invite a friend to start chatting"}
          </div>
        )}

        <div className="px-5 py-6 flex items-start gap-2.5 text-[12px] text-[var(--gb-text-2)] leading-relaxed">
          <ShieldCheck size={15} className="shrink-0 mt-0.5" />
          <span>Private: only people you've invited, who invited you, or who you added by GB number can appear here and message you — like your own personal WhatsApp.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Add contact by GB number / invite code (WhatsApp-style) ---------------- */
interface AddedUser {
  id: string;
  name: string;
  username: string;
  gbNumber?: string | null;
  avatarColor: string;
  avatarEmoji: string;
  avatarUrl?: string | null;
  isBot: boolean;
}

export function AddContactScreen() {
  const toast = useGB((s) => s.toast);
  const openChat = useGB((s) => s.openChat);
  const refreshChats = useGB((s) => s.refreshChats);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ user: AddedUser; already: boolean } | null>(null);

  const submit = async () => {
    const c = code.trim();
    if (!c) return toast("Enter a GB number or invite code", "error");
    setBusy(true);
    setAdded(null);
    try {
      const r = await api<{ already: boolean; user: AddedUser }>("/api/contacts/add", {
        method: "POST",
        body: { code: c },
      });
      setAdded(r);
      await refreshChats();
      toast(r.already ? `${r.user.name} is already your contact` : `${r.user.name} added to contacts ✅`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const message = async () => {
    if (!added) return;
    try {
      const res = await api<{ chatId: string }>("/api/chats", {
        method: "POST",
        body: { type: "individual", username: added.user.username },
      });
      await refreshChats();
      openChat(res.chatId);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader onBack={() => useGB.getState().popView()} title="Add contact" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center shadow-lg" style={{ background: "var(--gb-accent)" }}>
          <BookUser size={38} className="text-white" />
        </div>
        <p className="text-center text-[13.5px] text-[var(--gb-text-2)] mt-4 leading-relaxed">
          Type your friend's <span className="text-[var(--gb-text)] font-medium">GB number</span> (like a phone
          number on WhatsApp) or their invite code — they'll be added to both contact lists instantly.
        </p>

        <label className="block mt-6 text-[12px] font-medium text-[var(--gb-accent)]">
          GB NUMBER OR INVITE CODE
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. +88 3123 44567 or gbx2k9m4"
          dir="ltr"
          autoFocus
          className="w-full mt-1 h-11 px-3 rounded-lg bg-[var(--gb-panel)] border border-[var(--gb-border)] focus:border-[var(--gb-accent)] outline-none text-[16px] text-[var(--gb-text)] placeholder:text-[var(--gb-text-2)]/60"
        />

        <button
          onClick={submit}
          disabled={busy}
          className="w-full h-12 mt-5 rounded-full text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
          style={{ background: "var(--gb-accent)" }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <UserRoundPlus size={18} />}
          {busy ? "Adding..." : "Add contact"}
        </button>

        {/* found card */}
        {added && (
          <div className="mt-6 rounded-xl border border-[var(--gb-border)] bg-[var(--gb-panel)] p-4">
            <div className="flex items-center gap-3.5">
              <GbAvatar name={added.user.name} color={added.user.avatarColor} emoji={added.user.avatarEmoji} url={added.user.avatarUrl} size={52} />
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-medium text-[var(--gb-text)] truncate flex items-center gap-1.5">
                  {added.user.name}
                  {added.user.isBot && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gb-accent)]/15 text-[var(--gb-accent)] font-semibold">BOT</span>
                  )}
                </div>
                <div className="text-[13px] text-[var(--gb-text-2)] truncate" dir="ltr">
                  {formatGbNumber(added.user.gbNumber) || `@${added.user.username}`}
                </div>
              </div>
            </div>
            <button
              onClick={message}
              className="w-full h-11 mt-4 rounded-full text-white font-medium flex items-center justify-center gap-2"
              style={{ background: "var(--gb-accent)" }}
            >
              <MessageCircle size={17} />
              Message
            </button>
            {added.already && (
              <p className="text-[12px] text-[var(--gb-text-2)] text-center mt-2.5">Already in your contacts — nothing changed.</p>
            )}
          </div>
        )}

        <div className="mt-7 flex items-start gap-2.5 text-[12px] text-[var(--gb-text-2)] leading-relaxed">
          <ShieldCheck size={15} className="shrink-0 mt-0.5" />
          <span>
            Don't know their number? Ask them to open <span className="text-[var(--gb-text)]">Menu → Invite friends</span> — their GB number and invite link are right there.
          </span>
        </div>
      </div>
    </div>
  );
}

export function NewGroup() {
  const toast = useGB((s) => s.toast);
  const refreshChats = useGB((s) => s.refreshChats);
  const openChat = useGB((s) => s.openChat);
  const popView = useGB((s) => s.popView);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"members" | "info">("members");

  useEffect(() => {
    api<{ users: PublicUser[] }>("/api/users").then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  const create = async () => {
    if (name.trim().length < 2) return toast("Enter a group name", "error");
    setBusy(true);
    try {
      const res = await api<{ chatId: string }>("/api/chats", {
        method: "POST",
        body: { type: "group", name: name.trim(), memberIds: Array.from(selected), emoji },
      });
      await refreshChats();
      openChat(res.chatId);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const EMOJIS = ["👥", "🎉", "💼", "🏏", "🎮", "📚", "🍔", "✈️", "🏠", "❤️", "🔥", "⭐"];

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader
        onBack={() => (step === "members" ? popView() : setStep("members"))}
        title={step === "members" ? "New group" : "New group"}
        subtitle={step === "members" ? `${selected.size} members selected` : "Group info"}
        right={
          step === "info" ? (
            <HeaderIcon label="create group" onClick={create}>
              <Check size={22} />
            </HeaderIcon>
          ) : (
            <HeaderIcon
              label="next"
              onClick={() => (selected.size > 0 ? setStep("info") : toast("Select at least 1 member"))}
            >
              <ArrowRight size={20} />
            </HeaderIcon>
          )
        }
      />

      {step === "members" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-accent)]">Select members</div>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(u.id)) n.delete(u.id);
                  else n.add(u.id);
                  return n;
                })
              }
              className="w-full flex items-center gap-4 px-5 py-2.5 hover:bg-[var(--gb-panel-2)] text-left"
            >
              <GbAvatar name={u.name} color={u.avatarColor} emoji={u.avatarEmoji} url={u.avatarUrl} size={46} />
              <div className="flex-1 min-w-0">
                <div className="text-[15.5px] text-[var(--gb-text)] truncate">{u.name}</div>
                <div className="text-[13px] text-[var(--gb-text-2)] truncate">@{u.username}</div>
              </div>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-[11px] ${
                  selected.has(u.id) ? "border-[var(--gb-accent)]" : "border-[var(--gb-text-2)]"
                }`}
                style={selected.has(u.id) ? { background: "var(--gb-accent)" } : {}}
              >
                {selected.has(u.id) ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-[30px]" style={{ background: "var(--gb-accent)" }}>
              {emoji}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
              autoFocus
              className="flex-1 h-11 px-3 rounded-lg bg-[var(--gb-panel)] border border-[var(--gb-border)] outline-none focus:border-[var(--gb-accent)] text-[15px] text-[var(--gb-text)]"
            />
          </div>
          <div className="mt-5 text-[13px] text-[var(--gb-text-2)] mb-2">Choose group icon</div>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-11 h-11 rounded-full text-[22px] flex items-center justify-center border-2 ${
                  emoji === e ? "border-[var(--gb-accent)] bg-[var(--gb-accent)]/10" : "border-[var(--gb-border)] bg-[var(--gb-panel)]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-6">
            <div className="text-[13px] text-[var(--gb-text-2)] mb-2">Participants: {selected.size + 1}</div>
            <div className="rounded-xl overflow-hidden border border-[var(--gb-border)]">
              {users
                .filter((u) => selected.has(u.id))
                .map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2 bg-[var(--gb-panel)]">
                    <GbAvatar name={u.name} color={u.avatarColor} emoji={u.avatarEmoji} url={u.avatarUrl} size={34} />
                    <span className="text-[14px] text-[var(--gb-text)]">{u.name}</span>
                    <Crown size={14} className="text-[var(--gb-accent)] ml-auto" />
                  </div>
                ))}
            </div>
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="w-full h-12 mt-8 rounded-full text-white font-medium disabled:opacity-60"
            style={{ background: "var(--gb-accent)" }}
          >
            {busy ? "Creating..." : "Create group"}
          </button>
        </div>
      )}
    </div>
  );
}
