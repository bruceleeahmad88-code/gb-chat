"use client";

/** GB Chat — contact / group info screen */
import { useEffect, useState } from "react";
import { Phone, Video, Search, VolumeOff, Pin, Star, Lock, Trash2, LogOut, UserPlus, ShieldCheck, Heart, Pencil, Camera, Loader2, Copy } from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, lastSeenText, resolveMedia, formatDayLabel, pickFile, formatGbNumber } from "@/lib/gb-api";
import { startCall as startCallRtc } from "@/lib/calls";
import type { PublicUser } from "@/lib/gb-types";
import { GbAvatar, ScreenHeader, Section, Row, Switch } from "@/components/gb/ui-bits";

interface ChatInfo {
  id: string;
  type: "individual" | "group";
  name: string;
  emoji: string;
  color: string;
  about?: string;
  participants: (PublicUser & { role?: string })[];
}

interface ContactMeta {
  favourite: boolean;
  customName: string | null;
}

export function ContactInfo({ chatId }: { chatId: string }) {
  const me = useGB((s) => s.me);
  const toast = useGB((s) => s.toast);
  const refreshChats = useGB((s) => s.refreshChats);
  const closeChat = useGB((s) => s.closeChat);
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [media, setMedia] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<PublicUser[]>([]);
  const [contactMeta, setContactMeta] = useState<ContactMeta>({ favourite: false, customName: null });
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [dpBusy, setDpBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ chat: ChatInfo; contactMeta?: ContactMeta }>(`/api/chats/${chatId}/group`)
      .then((r) => {
        if (alive) {
          setInfo(r.chat);
          if (r.contactMeta) {
            setContactMeta(r.contactMeta);
            setRenameText(r.contactMeta.customName || "");
          }
        }
      })
      .catch(() => {});
    Promise.resolve().then(() => {
      if (!alive) return;
      const chat = useGB.getState().chats.find((c) => c.id === chatId);
      setMuted(!!chat?.muted);
      setPinned(!!chat?.pinned);
      const msgs = useGB.getState().messagesByChat[chatId] || [];
      setMedia(
        msgs
          .filter((m) => m.type === "image" && m.mediaSeed)
          .slice(-9)
          .map((m) => m.mediaSeed as string)
      );
    });
    return () => {
      alive = false;
    };
  }, [chatId]);

  if (!info || !me) {
    return (
      <div className="h-full flex flex-col bg-[var(--gb-bg)]">
        <ScreenHeader onBack={() => useGB.getState().popView()} title="Info" />
      </div>
    );
  }

  const other = info.type === "individual" ? info.participants.find((p) => p.id !== me.id) : null;
  const isAdmin = info.participants.find((p) => p.id === me.id)?.role === "admin";

  const toggle = async (key: "muted" | "pinned", value: boolean) => {
    await api(`/api/chats/${chatId}/archive`, { method: "POST", body: { [key]: value } });
    if (key === "muted") setMuted(value);
    else setPinned(value);
    refreshChats();
  };

  const openAdd = async () => {
    setAddOpen(true);
    const r = await api<{ users: PublicUser[] }>("/api/users");
    setCandidates(r.users.filter((u) => !info.participants.some((p) => p.id === u.id)));
  };

  const addMember = async (u: PublicUser) => {
    try {
      await api(`/api/chats/${chatId}/group`, { method: "POST", body: { userId: u.id } });
      const r = await api<{ chat: ChatInfo }>(`/api/chats/${chatId}/group`);
      setInfo(r.chat);
      setAddOpen(false);
      toast(`${u.name} added ✅`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const exitGroup = async () => {
    try {
      await api(`/api/chats/${chatId}/group`, { method: "DELETE" });
      await refreshChats();
      toast("You left the group");
      closeChat();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  /* ---- favourites + custom rename (per-account, private) ---- */
  const otherUser = info?.type === "individual" ? info.participants.find((p) => p.id !== me?.id) : null;

  const saveContactMeta = async (patch: Partial<ContactMeta>) => {
    if (!otherUser) return;
    try {
      const r = await api<{ contact: ContactMeta }>("/api/contacts", {
        method: "PUT",
        body: { userId: otherUser.id, ...patch },
      });
      setContactMeta(r.contact);
      await refreshChats();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggleFavourite = (v: boolean) => {
    setContactMeta((m) => ({ ...m, favourite: v }));
    void saveContactMeta({ favourite: v });
    if (v) toast("Added to favourites ⭐");
  };

  const saveRename = async () => {
    const name = renameText.trim();
    if (name.length > 40) return toast("Name is too long (max 40 chars)", "error");
    await saveContactMeta({ customName: name });
    setRenameOpen(false);
    toast(name ? "Contact renamed ✏️" : "Name reset to original");
  };

  /* ---- 100% owner access: change the Bot's DP (it's your app, your Bot) ---- */
  const isBotContact = !!otherUser?.isBot;

  const changeBotDp = async (file: File) => {
    if (!otherUser) return;
    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }
    setDpBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Couldn't read the file"));
        reader.readAsDataURL(file);
      });
      // square crop + 320px resize — sharp DP, small upload
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Invalid image"));
        i.src = dataUrl;
      });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Processing fail");
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        320,
        320
      );
      const out = canvas.toDataURL("image/jpeg", 0.82);
      const r = await api<{ avatarUrl: string | null }>("/api/contacts/avatar", {
        method: "PUT",
        body: { userId: otherUser.id, avatarUrl: out },
      });
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === otherUser.id ? { ...p, avatarUrl: r.avatarUrl } : p
              ),
            }
          : prev
      );
      await refreshChats();
      toast("Bot DP updated 📸");
    } catch (e) {
      toast((e as Error).message || "DP change failed", "error");
    } finally {
      setDpBusy(false);
    }
  };

  const pickBotDp = () => {
    if (dpBusy) return;
    pickFile("image/*", (f) => void changeBotDp(f));
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader onBack={() => useGB.getState().popView()} title={info.type === "group" ? "Group info" : "Contact info"} />

      <div className="flex-1 overflow-y-auto pb-6">
        {/* profile card */}
        <div className="bg-[var(--gb-panel)] py-6 flex flex-col items-center">
          {info.type === "individual" && other?.isBot ? (
            <div className="relative">
              <GbAvatar
                name={info.name}
                color={info.color}
                emoji={other?.avatarEmoji}
                url={other?.avatarUrl}
                size={110}
              />
              <button
                onClick={pickBotDp}
                aria-label="change Bot photo"
                title="Change DP"
                className="absolute -bottom-1 right-0 w-9 h-9 rounded-full flex items-center justify-center text-white border-2 border-[var(--gb-panel)] shadow-md active:scale-95 transition-transform"
                style={{ background: "var(--gb-accent)" }}
              >
                {dpBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
            </div>
          ) : (
            <GbAvatar
              name={info.type === "group" ? info.emoji : info.name}
              color={info.color}
              emoji={info.type === "group" ? info.emoji : other?.avatarEmoji}
              url={info.type === "individual" ? other?.avatarUrl : undefined}
              size={110}
            />
          )}
          <h2 className="mt-3 text-[21px] font-semibold text-[var(--gb-text)]">{info.name}</h2>
          <p className="text-[14px] text-[var(--gb-text-2)]">
            {info.type === "group"
              ? `Group • ${info.participants.length} participants`
              : other
                ? `@${other.username}`
                : ""}
          </p>

          <div className="flex gap-10 mt-5">
            <button
              onClick={() => other && startCallRtc(other, false)}
              className="flex flex-col items-center gap-1 text-[var(--gb-accent)]"
            >
              <Phone size={21} />
              <span className="text-[12px]">Audio</span>
            </button>
            <button
              onClick={() => other && startCallRtc(other, true)}
              className="flex flex-col items-center gap-1 text-[var(--gb-accent)]"
            >
              <Video size={21} />
              <span className="text-[12px]">Video</span>
            </button>
            <button onClick={() => useGB.getState().openChat(chatId)} className="flex flex-col items-center gap-1 text-[var(--gb-accent)]">
              <Search size={21} />
              <span className="text-[12px]">Search</span>
            </button>
          </div>
        </div>

        <div className="h-2" />

        {/* about */}
        <div className="bg-[var(--gb-panel)] px-5 py-3.5">
          <div className="text-[13px] text-[var(--gb-text-2)]">
            {info.type === "group" ? "Group description" : "About"}
          </div>
          <div className="text-[15px] text-[var(--gb-text)] mt-0.5">
            {info.type === "group" ? info.about || "No description" : other?.about || "Hey there! I am using GB Chat."}
          </div>
        </div>

        {/* GB number — WhatsApp-style permanent identity */}
        {info.type === "individual" && other?.gbNumber && (
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 mt-2">
            <div className="text-[13px] text-[var(--gb-text-2)]">GB number</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[15.5px] text-[var(--gb-text)] font-medium" dir="ltr">{formatGbNumber(other.gbNumber)}</span>
              <button
                onClick={async () => {
                  const n = formatGbNumber(other?.gbNumber);
                  if (!n) return;
                  try {
                    await navigator.clipboard.writeText(n);
                    toast("GB number copied ✅");
                  } catch {
                    toast("Copy failed", "error");
                  }
                }}
                className="p-1 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]"
                aria-label="copy GB number"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="text-[11.5px] text-[var(--gb-text-2)] mt-1">
              Like a phone number — anyone can add this contact with it.
            </p>
          </div>
        )}

        {/* media */}
        {media.length > 0 && (
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[var(--gb-text)]">Media, links and docs</span>
              <span className="text-[13px] text-[var(--gb-text-2)]">{media.length}</span>
            </div>
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto">
              {media.map((seed, i) => (
                 
                <img key={i} src={resolveMedia(seed)} alt="media" className="w-20 h-20 rounded-lg object-cover shrink-0" />
              ))}
            </div>
          </div>
        )}

        {/* switches */}
        <div className="bg-[var(--gb-panel)] mt-2">
          <div className="flex items-center gap-4 px-5 py-3.5">
            <VolumeOff size={20} className="text-[var(--gb-text-2)]" />
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Mute notifications</span>
            <Switch checked={muted} onChange={(v) => toggle("muted", v)} />
          </div>
          <div className="flex items-center gap-4 px-5 py-3.5 border-t border-[var(--gb-border)]">
            <Pin size={20} className="text-[var(--gb-text-2)]" />
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Pin chat</span>
            <Switch checked={pinned} onChange={(v) => toggle("pinned", v)} />
          </div>
        </div>

        {/* group participants */}
        {info.type === "group" && (
          <div className="bg-[var(--gb-panel)] mt-2 py-2">
            <div className="px-5 py-2 text-[13px] font-medium text-[var(--gb-accent)]">
              {info.participants.length} participants
            </div>
            {isAdmin && (
              <button onClick={openAdd} className="w-full flex items-center gap-4 px-5 py-2.5 hover:bg-[var(--gb-panel-2)] text-left">
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: "var(--gb-accent)" }}>
                  <UserPlus size={20} />
                </span>
                <span className="text-[15px] text-[var(--gb-text)]">Add participant</span>
              </button>
            )}
            {info.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-2">
                <GbAvatar name={p.name} color={p.avatarColor} emoji={p.avatarEmoji} url={p.avatarUrl} size={42} online={p.isOnline} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] text-[var(--gb-text)] truncate">
                    {p.id === me.id ? "You" : p.name}
                  </div>
                  <div className="text-[13px] text-[var(--gb-text-2)] truncate">@{p.username}</div>
                </div>
                {p.role === "admin" && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--gb-accent)]/15 text-[var(--gb-accent)] font-semibold">
                    Admin
                  </span>
                )}
              </div>
            ))}
            <button
              onClick={exitGroup}
              className="w-full flex items-center gap-4 px-5 py-3 mt-2 hover:bg-[var(--gb-panel-2)] text-left text-red-500"
            >
              <LogOut size={20} />
              <span className="text-[15px]">Exit group</span>
            </button>
          </div>
        )}

        {info.type === "individual" && (
          <>
            <Section title="">
              {isBotContact && (
                <Row
                  icon={<Camera size={20} />}
                  title="Change profile photo"
                  subtitle="You own this Bot — set any DP you like"
                  onClick={pickBotDp}
                  right={dpBusy ? <Loader2 size={18} className="animate-spin text-[var(--gb-text-2)]" /> : undefined}
                />
              )}
              <Row
                icon={<Heart size={20} className={contactMeta.favourite ? "text-red-500 fill-red-500" : ""} />}
                title={contactMeta.favourite ? "Remove from favourites" : "Add to favourites"}
                subtitle={contactMeta.favourite ? "Shows in the Favourites section" : "Quick access from New chat"}
                right={<Switch checked={contactMeta.favourite} onChange={toggleFavourite} />}
              />
              <Row
                icon={<Pencil size={20} />}
                title="Rename contact"
                subtitle={contactMeta.customName ? `Currently "${contactMeta.customName}"` : "Give them any name only you see"}
                onClick={() => {
                  setRenameText(contactMeta.customName || "");
                  setRenameOpen(true);
                }}
              />
              <Row
                icon={<Star size={20} />}
                title="Starred messages"
                onClick={() => useGB.getState().pushView({ name: "starred" })}
              />
            </Section>
            <Section title="">
              <Row icon={<Lock size={20} />} title="Encryption" subtitle="Messages end-to-end encrypted (demo)" />
            </Section>
          </>
        )}
      </div>

      {/* rename contact dialog */}
      {renameOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setRenameOpen(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Pencil size={18} className="text-[var(--gb-accent)]" />
              <h3 className="font-semibold text-[var(--gb-text)]">Rename contact</h3>
            </div>
            <input
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveRename()}
              autoFocus
              maxLength={40}
              placeholder={info.name}
              className="w-full h-11 px-3 rounded-lg bg-[var(--gb-panel-2)] border border-[var(--gb-border)] outline-none focus:border-[var(--gb-accent)] text-[15px] text-[var(--gb-text)]"
            />
            <p className="text-[12px] text-[var(--gb-text-2)] mt-2">Only you will see this name. Leave empty to reset.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRenameOpen(false)}
                className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
              >
                CANCEL
              </button>
              <button
                onClick={() => void saveRename()}
                className="px-5 h-9 rounded-full text-[13px] font-semibold text-white"
                style={{ background: "var(--gb-accent)" }}
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* add member dialog */}
      {addOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-5" onClick={() => setAddOpen(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl overflow-hidden bg-[var(--gb-panel)] max-h-[70%] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 font-semibold text-[var(--gb-text)] border-b border-[var(--gb-border)]">Add participant</div>
            <div className="overflow-y-auto">
              {candidates.length === 0 && (
                <div className="p-6 text-center text-[var(--gb-text-2)] text-sm">Everyone is already in the group</div>
              )}
              {candidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => addMember(u)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--gb-panel-2)] text-left"
                >
                  <GbAvatar name={u.name} color={u.avatarColor} emoji={u.avatarEmoji} url={u.avatarUrl} size={38} online={u.isOnline} />
                  <span className="text-[14.5px] text-[var(--gb-text)]">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
