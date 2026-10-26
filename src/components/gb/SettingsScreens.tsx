"use client";

/** GB Chat — settings & sub-screens (original implementation) */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound,
  User as UserIcon,
  MessageCircle,
  Bell,
  HelpCircle,
  Users,
  Database,
  HardDrive,
  Star,
  Archive,
  ShieldCheck,
  ChevronRight,
  Check,
  Camera,
  Moon,
  Sun,
  MonitorSmartphone,
  Trash2,
  Download,
  LogOut,
  Pencil,
  Smartphone,
  Globe,
  CircleUserRound,
  BadgeCheck,
  Bot,
  Share2,
  Copy,
  UserRoundPlus,
  Volume2,
  Square,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, lastSeenText, devDate, formatGbNumber } from "@/lib/gb-api";
import { RINGTONES, ringtoneByKey } from "@/lib/ringtones";
import { previewRingtone, stopRingtonePreview } from "@/lib/calls";
import { GbAvatar, ScreenHeader, Section, Row, Switch, themeVars } from "@/components/gb/ui-bits";
import { ACCENTS, WALLPAPERS } from "@/lib/settings";
import type { Me } from "@/lib/gb-types";

/* ---------------- Main settings ---------------- */
export function SettingsScreen() {
  const me = useGB((s) => s.me);
  const pushView = useGB((s) => s.pushView);
  const toast = useGB((s) => s.toast);
  const logout = useGB((s) => s.logout);
  const chats = useGB((s) => s.chats);

  if (!me) return null;
  const totalMsgs = useGB.getState().chats.reduce((a, c) => a + (c.unread || 0), 0);

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Settings" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        {/* profile card */}
        <button
          onClick={() => pushView({ name: "profile" })}
          className="w-full flex items-center gap-4 px-5 py-5 bg-[var(--gb-panel)] hover:bg-[var(--gb-panel-2)] transition-colors text-left"
        >
          <GbAvatar name={me.name} color={me.avatarColor} emoji={me.avatarEmoji} url={me.avatarUrl} size={62} />
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-medium text-[var(--gb-text)] truncate">{me.name}</div>
            <div className="text-[13.5px] text-[var(--gb-text-2)] truncate" dir="ltr">
              @{me.username}
              {me.gbNumber ? `  •  ${formatGbNumber(me.gbNumber)}` : ""}
            </div>
            <div className="text-[13px] text-[var(--gb-text-2)] truncate mt-0.5">{me.about}</div>
          </div>
          <div className="flex flex-col items-center gap-1 text-[var(--gb-accent)]">
            <BadgeCheck size={20} />
            <span className="text-[10px] text-[var(--gb-text-2)]">Gmail</span>
          </div>
        </button>

        <div className="h-2" />

        <Section title="">
          <Row
            icon={<Users size={20} />}
            title="Account"
            subtitle={`Security, change username, Gmail: ${me.email.split("@")[0]}•••@gmail.com`}
            onClick={() => pushView({ name: "account" })}
          />
          <Row
            icon={<ShieldCheck size={20} />}
            title="Privacy"
            subtitle="Last seen, blue ticks, blocked contacts"
            onClick={() => pushView({ name: "privacy" })}
          />
          <Row icon={<MessageCircle size={20} />} title="Chats" subtitle="Theme, wallpaper, chat history" onClick={() => pushView({ name: "chatsettings" })} />
          <Row icon={<Bell size={20} />} title="Notifications" subtitle="Message, group tones" onClick={() => pushView({ name: "notifsettings" })} />
          <Row icon={<HardDrive size={20} />} title="Storage and data" subtitle={`${totalMsgs} unread • network usage`} onClick={() => pushView({ name: "storage" })} />
        </Section>

        <Section title="">
          <Row
            icon={<UserRoundPlus size={20} />}
            title="Invite friends"
            subtitle="Invite your friends to GB Chat — share the link"
            onClick={() => pushView({ name: "invite" })}
          />
          <Row
            icon={<Star size={20} />}
            title="Starred messages"
            onClick={() => pushView({ name: "starred" })}
          />
          <Row
            icon={<Archive size={20} />}
            title="Archived chats"
            subtitle={`${chats.filter((c) => c.archived).length} archived`}
            onClick={() => pushView({ name: "archived" })}
          />
        </Section>

        <Section title="">
          <Row icon={<KeyRound size={20} />} title="GB Settings" subtitle="DND, Auto-reply, App lock, Themes and much more" onClick={() => pushView({ name: "gbsettings" })} />
        </Section>

        <Section title="">
          <Row icon={<HelpCircle size={20} />} title="Help" subtitle="Help centre, contact us, terms" onClick={() => toast("GB Chat v1.0.0 — demo build 🚀")} />
          <Row
            icon={<LogOut size={20} />}
            title="Log out"
            subtitle="You can log in again with your username"
            danger
            onClick={async () => {
              await logout();
            }}
          />
        </Section>

        <p className="text-center text-[11px] text-[var(--gb-text-2)] mt-4">
          GB Chat v1.0.0 • Gmail signup + username login
        </p>
      </div>
    </div>
  );
}

/* ---------------- Profile edit ---------------- */
export function ProfileScreen() {
  const me = useGB((s) => s.me);
  const setMe = useGB((s) => s.setMe);
  const toast = useGB((s) => s.toast);
  const [name, setName] = useState(me?.name || "");
  const [about, setAbout] = useState(me?.about || "");
  const [emoji, setEmoji] = useState(me?.avatarEmoji || "");
  const [color, setColor] = useState(me?.avatarColor || "0ea47a");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me?.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const AVATARS = ["", "🙂", "😎", "🥰", "🤠", "👨", "👩", "🧕", "👨‍💻", "🏏", "🌸", "🔥", "⭐", "🦋", "🌹", "☕"];

  useEffect(() => {
    if (me) {
      setName(me.name);
      setAbout(me.about);
      setEmoji(me.avatarEmoji);
      setColor(me.avatarColor);
      setAvatarUrl(me.avatarUrl || null);
    }
     
  }, []);

  if (!me) return null;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api<{ me: Me }>("/api/me", {
        method: "PUT",
        body: { name, about, avatarEmoji: emoji, avatarColor: color },
      });
      setMe(res.me);
      toast("Profile updated ✅");
      useGB.getState().popView();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Couldn't read the file"));
        reader.readAsDataURL(file);
      });
      // square crop + 320px resize — fast upload, sharp DP
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
      const res = await api<{ me: Me }>("/api/me", { method: "PUT", body: { avatarUrl: out } });
      setMe(res.me);
      setAvatarUrl(res.me.avatarUrl || null);
      toast("Photo updated! Everyone will see it now ✅");
    } catch (e) {
      toast((e as Error).message || "Photo upload failed", "error");
    }
  };

  const removePhoto = async () => {
    try {
      const res = await api<{ me: Me }>("/api/me", { method: "PUT", body: { avatarUrl: "" } });
      setMe(res.me);
      setAvatarUrl(null);
      toast("Photo removed");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader
        title="Profile"
        onBack={() => useGB.getState().popView()}
        right={
          <button onClick={save} disabled={busy} className="px-4 h-9 rounded-full bg-white/20 text-white text-[13px] font-medium disabled:opacity-50">
            {busy ? "..." : "Save"}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="flex flex-col items-center py-6 bg-[var(--gb-panel)]">
          <div className="relative">
            <GbAvatar name={name || me.name} color={color} emoji={emoji} url={avatarUrl} size={110} />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
              }}
            />
            <button
              aria-label="change profile photo"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-white shadow active:scale-95 transition-transform"
              style={{ background: "var(--gb-accent)" }}
            >
              <Camera size={15} />
            </button>
          </div>
          <p className="text-[12.5px] text-[var(--gb-text-2)] mt-3 px-8 text-center">
            Tap the camera icon — add your photo from gallery or camera 📷
          </p>
          {avatarUrl && (
            <button onClick={removePhoto} className="mt-1 text-[12.5px] font-medium text-red-500">
              Remove photo
            </button>
          )}
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <div className="flex items-center gap-3">
            <UserIcon size={20} className="text-[var(--gb-text-2)]" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 h-9 bg-transparent outline-none text-[16px] text-[var(--gb-text)]"
              placeholder="Name"
            />
            <Pencil size={16} className="text-[var(--gb-text-2)]" />
          </div>
          <p className="text-[12px] text-[var(--gb-text-2)] mt-1.5 ml-8">
            This name will be visible to your contacts. Email: <b>{me.email}</b> (Gmail verified)
          </p>
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <div className="flex items-start gap-3">
            <CircleUserRound size={20} className="text-[var(--gb-text-2)] mt-2" />
            <div className="flex-1">
              <input
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={139}
                className="w-full h-9 bg-transparent outline-none text-[15px] text-[var(--gb-text)]"
                placeholder="About"
              />
              <p className="text-[12px] text-[var(--gb-text-2)]">{about.length}/139</p>
            </div>
          </div>
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <p className="text-[13px] text-[var(--gb-text-2)] mb-3">
            Pick an avatar emoji (optional — hidden when a photo is set)
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((e) => (
              <button
                key={e || "none"}
                onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-full text-[20px] flex items-center justify-center border-2 ${
                  emoji === e ? "border-[var(--gb-accent)] bg-[var(--gb-accent)]/10" : "border-[var(--gb-border)]"
                }`}
              >
                {e || "—"}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-[var(--gb-text-2)] mt-4 mb-2">Avatar background color</p>
          <div className="flex flex-wrap gap-2">
            {["0ea47a", "0288d1", "7b1fa2", "e91e63", "f57c00", "e53935", "3949ab", "00897b", "607d8b", "5d4037"].map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${color === c ? "border-[var(--gb-text)] scale-110" : "border-transparent"}`}
                style={{ background: `#${c}` }}
              >
                {color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-3">
          <BadgeCheck size={18} className="text-[var(--gb-accent)]" />
          <div className="flex-1">
            <div className="text-[15px] text-[var(--gb-text)]">Username: @{me.username}</div>
            <div className="text-[12px] text-[var(--gb-text-2)]">Used for login</div>
          </div>
          <button
            onClick={() => useGB.getState().pushView({ name: "account" })}
            className="text-[13px] font-medium text-[var(--gb-accent)]"
          >
            Change
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Account (username change) ---------------- */
export function AccountScreen() {
  const me = useGB((s) => s.me);
  const setMe = useGB((s) => s.setMe);
  const toast = useGB((s) => s.toast);
  const [username, setUsername] = useState(me?.username || "");
  const [busy, setBusy] = useState(false);
  const valid = /^[a-z0-9_]{3,20}$/.test(username);

  if (!me) return null;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api<{ me: Me }>("/api/me", { method: "PUT", body: { username } });
      setMe(res.me);
      toast("Username updated ✅ — use it to log in from now on");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Account" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        <Section title="GB number">
          <div className="px-5 py-4 bg-[var(--gb-panel)]">
            <div className="flex items-center gap-2 text-[13px] text-[var(--gb-text-2)]">
              <Smartphone size={16} className="text-[var(--gb-accent)]" />
              Your permanent identity (never changes)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[18px] font-semibold text-[var(--gb-text)] tracking-wide" dir="ltr">
                {formatGbNumber(me.gbNumber) || "—"}
              </span>
              {me.gbNumber && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formatGbNumber(me.gbNumber));
                      toast("GB number copied ✅ — share it like a phone number");
                    } catch {
                      toast("Copy failed", "error");
                    }
                  }}
                  className="p-1.5 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]"
                  aria-label="copy GB number"
                >
                  <Copy size={15} />
                </button>
              )}
            </div>
            <p className="text-[12px] text-[var(--gb-text-2)] mt-1">
              Friends add you with this number — also shown in Menu → Invite friends.
            </p>
          </div>
        </Section>
        <Section title="Login credentials">
          <div className="px-5 py-4 bg-[var(--gb-panel)]">
            <div className="flex items-center gap-2 text-[13px] text-[var(--gb-text-2)]">
              <BadgeCheck size={16} className="text-[var(--gb-accent)]" />
              Gmail (verified)
            </div>
            <div className="text-[16px] text-[var(--gb-text)] mt-1">{me.email}</div>
            <p className="text-[12px] text-[var(--gb-text-2)] mt-1">
              Your account was created with Gmail — phone numbers are never used in this app.
            </p>
          </div>
          <div className="px-5 py-4 bg-[var(--gb-panel)] border-t border-[var(--gb-border)]">
            <div className="flex items-center gap-2 text-[13px] text-[var(--gb-text-2)]">
              <KeyRound size={16} className="text-[var(--gb-accent)]" />
              Username (login ID)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--gb-text-2)] text-[16px]">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="flex-1 h-10 bg-transparent outline-none text-[16px] text-[var(--gb-text)] border-b-2 border-[var(--gb-border)] focus:border-[var(--gb-accent)]"
              />
            </div>
            {!valid && <p className="text-[12px] text-red-500 mt-1">3-20 chars: a-z, 0-9, _</p>}
            <button
              onClick={save}
              disabled={!valid || busy || username === me.username}
              className="mt-3 w-full h-11 rounded-full text-white font-medium disabled:opacity-50"
              style={{ background: "var(--gb-accent)" }}
            >
              {busy ? "Saving..." : "Update username"}
            </button>
          </div>
        </Section>

        <Section title="Security">
          <Row icon={<ShieldCheck size={20} />} title="Two-step verification" subtitle="Not available in demo mode" onClick={() => toast("Demo feature — coming soon")} />
          <Row icon={<Smartphone size={20} />} title="Logged in devices" subtitle="This device (demo)" onClick={() => toast("Only this device is logged in")} />
        </Section>

        <Section title="More">
          <Row icon={<Globe size={20} />} title="Request account info" onClick={() => toast("Backup: use the Export option in Chats settings")} />
          <Row
            icon={<Trash2 size={20} />}
            title="Delete account"
            danger
            onClick={() => toast("Account deletion is disabled in the demo 😅", "error")}
          />
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Privacy ---------------- */
export function PrivacyScreen() {
  const me = useGB((s) => s.me);
  const patchSettings = useGB((s) => s.patchSettings);
  const toast = useGB((s) => s.toast);
  if (!me) return null;
  const p = me.settings.privacy;

  const set = (key: keyof typeof p, value: string | boolean) => {
    patchSettings({ privacy: { ...p, [key]: value } as never });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Privacy" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        <Section title="Who can see my personal info">
          {(
            [
              ["lastSeen", "Last seen"],
              ["profilePhoto", "Profile photo"],
              ["about", "About"],
              ["status", "Status"],
              ["groups", "Groups"],
              ["calls", "Calls"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="bg-[var(--gb-panel)] border-b border-[var(--gb-border)] px-5 py-3">
              <div className="text-[15px] text-[var(--gb-text)]">{label}</div>
              <div className="flex gap-2 mt-2">
                {(key === "status"
                  ? (["contacts", "all", "none"] as const)
                  : (["everyone", "contacts", "nobody"] as const)
                ).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => set(key, opt)}
                    className={`flex-1 h-9 rounded-full text-[12.5px] font-medium border transition-colors ${
                      p[key] === opt
                        ? "border-[var(--gb-accent)] text-white"
                        : "border-[var(--gb-border)] text-[var(--gb-text-2)]"
                    }`}
                    style={p[key] === opt ? { background: "var(--gb-accent)" } : {}}
                  >
                    {opt === "everyone" ? "Everyone" : opt === "contacts" ? "Contacts" : opt === "all" ? "All contacts" : opt === "none" ? "None" : "Nobody"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Messaging">
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)]">
            <div className="flex-1">
              <div className="text-[15px] text-[var(--gb-text)]">Read receipts (blue ticks)</div>
              <div className="text-[12px] text-[var(--gb-text-2)]">When off, you won't see others' blue ticks either</div>
            </div>
            <Switch checked={p.readReceipts} onChange={(v) => set("readReceipts", v)} />
          </div>
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[15px] text-[var(--gb-text)]">Live location</div>
              <div className="text-[12px] text-[var(--gb-text-2)]">Location sharing (demo)</div>
            </div>
            <Switch checked={p.liveLocation} onChange={(v) => set("liveLocation", v)} />
          </div>
        </Section>

        <Section title="Blocked">
          <Row
            icon={<Users size={20} />}
            title={`Blocked contacts (${p.blocked.length})`}
            subtitle={p.blocked.length ? p.blocked.join(", ") : "Nobody blocked"}
            onClick={() => toast(p.blocked.length ? "Blocked: " + p.blocked.join(", ") : "Block from the chat screen → menu")}
          />
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Chats settings (theme, wallpaper, backup) ---------------- */
export function ChatSettingsScreen() {
  const me = useGB((s) => s.me);
  const patchSettings = useGB((s) => s.patchSettings);
  const toast = useGB((s) => s.toast);
  if (!me) return null;
  const c = me.settings.chat;

  const downloadBackup = async () => {
    try {
      const data = await api<Record<string, unknown>>("/api/backup");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gbchat-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Backup downloaded 💾");
    } catch {
      toast("Backup failed", "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Chats" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        <Section title="Display">
          <div className="bg-[var(--gb-panel)] px-5 py-4">
            <div className="text-[15px] text-[var(--gb-text)] mb-3">Theme</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["light", "Light", <Sun key="l" size={18} />],
                  ["dark", "Dark", <Moon key="d" size={18} />],
                  ["amoled", "AMOLED", <MonitorSmartphone key="a" size={18} />],
                ] as const
              ).map(([val, label, icon]) => (
                <button
                  key={val}
                  onClick={() => patchSettings({ chat: { ...c, theme: val } })}
                  className={`h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-colors ${
                    c.theme === val ? "border-[var(--gb-accent)]" : "border-[var(--gb-border)]"
                  }`}
                  style={{ background: val === "light" ? "#ffffff" : val === "dark" ? "#111b21" : "#000000", color: val === "light" ? "#111b21" : "#e9edef" }}
                >
                  {icon}
                  <span className="text-[12px] font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[var(--gb-panel)] px-5 py-4 border-t border-[var(--gb-border)]">
            <div className="text-[15px] text-[var(--gb-text)] mb-2">Wallpaper</div>
            <div className="grid grid-cols-4 gap-2">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => patchSettings({ chat: { ...c, wallpaper: w.key } })}
                  className={`h-16 rounded-lg border-2 relative overflow-hidden ${c.wallpaper === w.key ? "border-[var(--gb-accent)]" : "border-[var(--gb-border)]"}`}
                  style={{ background: w.color }}
                >
                  <span className="absolute bottom-0.5 left-0 right-0 text-[9px] text-black/50 font-medium">{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[var(--gb-panel)] px-5 py-4 border-t border-[var(--gb-border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[15px] text-[var(--gb-text)]">Font size</span>
              <span className="text-[13px] text-[var(--gb-text-2)]">{c.fontSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={20}
              value={c.fontSize}
              onChange={(e) => patchSettings({ chat: { ...c, fontSize: parseInt(e.target.value) } })}
              className="w-full accent-[var(--gb-accent)]"
            />
          </div>
        </Section>

        <Section title="Accent color">
          <div className="bg-[var(--gb-panel)] px-5 py-4">
            <div className="flex flex-wrap gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  onClick={() => patchSettings({ chat: { ...c, accent: a.hex } })}
                  aria-label={a.name}
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform ${
                    c.accent === a.hex ? "border-[var(--gb-text)] scale-110" : "border-transparent"
                  }`}
                  style={{ background: `#${a.hex}` }}
                >
                  {c.accent === a.hex && <Check size={16} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Chat settings">
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)]">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Enter is send</span>
            <Switch checked={c.enterToSend} onChange={(v) => patchSettings({ chat: { ...c, enterToSend: v } })} />
          </div>
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Media visibility</span>
            <Switch checked={c.mediaVisibility} onChange={(v) => patchSettings({ chat: { ...c, mediaVisibility: v } })} />
          </div>
        </Section>

        <Section title="Chat history">
          <Row icon={<Download size={20} />} title="Export chat backup" subtitle="Download a JSON backup of your chats" onClick={downloadBackup} />
          <Row icon={<Archive size={20} />} title="Archive all chats" onClick={async () => {
            for (const ch of useGB.getState().chats.filter((x) => !x.archived)) {
              await api(`/api/chats/${ch.id}/archive`, { method: "POST", body: { archived: true } });
            }
            await useGB.getState().refreshChats();
            toast("All chats archived 📥");
          }} />
          <Row icon={<Trash2 size={20} />} title="Clear all chats" danger onClick={() => toast("Demo: delete each chat from its menu", "error")} />
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Notifications settings ---------------- */
export function NotifSettingsScreen() {
  const me = useGB((s) => s.me);
  const patchSettings = useGB((s) => s.patchSettings);
  if (!me) return null;
  const n = me.settings.notifications;
  const set = (k: keyof typeof n, v: boolean) => patchSettings({ notifications: { ...n, [k]: v } });

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Notifications" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto">
        <Section title="Messages">
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)]">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Notification for messages</span>
            <Switch checked={n.messages} onChange={(v) => set("messages", v)} />
          </div>
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)]">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Show message preview</span>
            <Switch checked={n.preview} onChange={(v) => set("preview", v)} />
          </div>
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)]">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Sound</span>
            <Switch checked={n.sound} onChange={(v) => set("sound", v)} />
          </div>
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Conversation tones</span>
            <Switch checked={n.conversationTones} onChange={(v) => set("conversationTones", v)} />
          </div>
        </Section>
        <Section title="Groups">
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Group notifications</span>
            <Switch checked={n.groupMessages} onChange={(v) => set("groupMessages", v)} />
          </div>
        </Section>
        <Section title="Calls">
          <Row
            icon={<Bell size={20} />}
            title="Ringtone"
            subtitle={ringtoneByKey(n.callRingtone).label}
            onClick={() => useGB.getState().pushView({ name: "ringtone" })}
          />
          <div className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4">
            <span className="flex-1 text-[15px] text-[var(--gb-text)]">Vibrate on incoming call</span>
            <Switch checked={n.callVibrate} onChange={(v) => set("callVibrate", v)} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Call ringtone picker ---------------- */
export function RingtoneScreen() {
  const me = useGB((s) => s.me);
  const patchSettings = useGB((s) => s.patchSettings);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => stopRingtonePreview(), []);
  if (!me) return null;
  const n = me.settings.notifications;
  const cur = n.callRingtone || "classic";

  const togglePreview = (key: string) => {
    if (playing === key) {
      stopRingtonePreview();
      setPlaying(null);
    } else {
      previewRingtone(key);
      setPlaying(key);
      // auto-release the button label after one full loop
      const def = ringtoneByKey(key);
      setTimeout(() => setPlaying((p) => (p === key ? null : p)), def.period * 1000 + 400);
    }
  };

  const select = (key: string) => {
    stopRingtonePreview();
    setPlaying(null);
    void patchSettings({ notifications: { ...n, callRingtone: key } });
    useGB.getState().toast(`Ringtone set: ${ringtoneByKey(key).label} 🔔`);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Call ringtone" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-3 text-[13px] text-[var(--gb-text-2)]">
          Pick the ringtone that plays when someone calls you. Tap the speaker to preview.
        </div>
        <Section title="Ringtones">
          {RINGTONES.map((r) => (
            <div
              key={r.key}
              className="bg-[var(--gb-panel)] px-5 py-3.5 flex items-center gap-4 border-b border-[var(--gb-border)] last:border-b-0"
            >
              <button
                onClick={() => select(r.key)}
                className="flex-1 min-w-0 flex items-center gap-3 text-left"
                aria-label={`select ${r.label}`}
              >
                <span className="w-5 shrink-0 flex justify-center">
                  {cur === r.key ? <Check size={18} className="text-[var(--gb-accent)]" /> : null}
                </span>
                <span className="text-[15px] text-[var(--gb-text)] truncate">{r.label}</span>
              </button>
              <button
                onClick={() => togglePreview(r.key)}
                className="p-2 rounded-full text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
                aria-label={`preview ${r.label}`}
              >
                {playing === r.key ? <Square size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          ))}
        </Section>
        <div className="px-5 py-4 text-[12.5px] text-[var(--gb-text-2)]">
          This ringtone plays on every incoming voice & video call. Outgoing calls use the standard ringback tone.
        </div>
      </div>
    </div>
  );
}

/* ---------------- Storage ---------------- */
export function StorageScreen() {
  const chats = useGB((s) => s.chats);
  const messagesMap = useGB((s) => s.messagesByChat);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const ch of chats) {
      const msgs = messagesMap[ch.id] || [];
      c[ch.id] = msgs.reduce(
        (a, m) => a + Math.max(64, (m.content || "").length * 2) + (m.type === "image" ? 40960 : 0),
        0
      );
    }
    return c;
  }, [chats, messagesMap]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const fmtKB = (b: number) => (b > 1024 ? `${(b / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b))} KB`);

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Storage and data" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="bg-[var(--gb-panel)] px-5 py-6 flex items-center gap-4">
          <Database size={34} className="text-[var(--gb-accent)]" />
          <div>
            <div className="text-[20px] font-semibold text-[var(--gb-text)]">{fmtKB(total)}</div>
            <div className="text-[13px] text-[var(--gb-text-2)]">Estimated GB Chat storage used</div>
          </div>
        </div>

        <Section title="Media per chat">
          {chats
            .filter((c) => !c.archived)
            .map((c) => (
              <Row
                key={c.id}
                title={c.name}
                subtitle={fmtKB(counts[c.id] || 0)}
                right={<ChevronRight size={18} className="text-[var(--gb-text-2)]" />}
                onClick={() => useGB.getState().openChat(c.id)}
              />
            ))}
        </Section>

        <Section title="Network usage (demo)">
          <div className="bg-[var(--gb-panel)] px-5 py-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl p-3 bg-[var(--gb-panel-2)]">
              <div className="text-[18px] font-semibold text-[var(--gb-text)]">2.4 GB</div>
              <div className="text-[12px] text-[var(--gb-text-2)]">Sent</div>
            </div>
            <div className="rounded-xl p-3 bg-[var(--gb-panel-2)]">
              <div className="text-[18px] font-semibold text-[var(--gb-text)]">6.1 GB</div>
              <div className="text-[12px] text-[var(--gb-text-2)]">Received</div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Starred messages ---------------- */
export function StarredScreen() {
  const [msgs, setMsgs] = useState<{ id: string; chatId: string; content: string; sender: { name: string }; createdAt: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ messages: typeof msgs }>("/api/messages/starred")
      .then((r) => setMsgs(r.messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const open = (chatId: string) => {
    useGB.getState().resetViews();
    setTimeout(() => useGB.getState().openChat(chatId), 60);
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Starred messages" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="p-8 text-center text-[var(--gb-text-2)] text-sm">Loading...</div>}
        {!loading && msgs.length === 0 && (
          <div className="p-10 text-center">
            <Star size={40} className="mx-auto text-[var(--gb-text-2)]" />
            <p className="mt-3 text-[var(--gb-text-2)] text-sm">
              No starred messages. Double-tap a message or star it from the menu ⭐
            </p>
          </div>
        )}
        {msgs.map((m) => (
          <button key={m.id} onClick={() => open(m.chatId)} className="w-full text-left px-5 py-3 hover:bg-[var(--gb-panel-2)] border-b border-[var(--gb-border)]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--gb-accent)]">{m.sender.name}</span>
              <span className="text-[12px] text-[var(--gb-text-2)]">{devDate(m.createdAt).toLocaleDateString()}</span>
            </div>
            <p className="text-[14.5px] text-[var(--gb-text)] mt-1 line-clamp-2">
              {m.type !== "text" ? `📎 ${m.type}` : m.content}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Archived ---------------- */
export function ArchivedScreen() {
  const chats = useGB((s) => s.chats);
  const openChat = useGB((s) => s.openChat);
  const archived = chats.filter((c) => c.archived);

  const unarchive = async (id: string) => {
    await api(`/api/chats/${id}/archive`, { method: "POST", body: { archived: false } });
    useGB.getState().refreshChats();
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Archived" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto">
        {archived.length === 0 && (
          <div className="p-10 text-center">
            <Archive size={40} className="mx-auto text-[var(--gb-text-2)]" />
            <p className="mt-3 text-[var(--gb-text-2)] text-sm">No archived chats</p>
          </div>
        )}
        {archived.map((c) => (
          <div key={c.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--gb-panel-2)]">
            <GbAvatar name={c.type === "group" ? c.emoji : c.name} color={c.color} emoji={c.type === "group" ? c.emoji : c.otherUser?.avatarEmoji} url={c.type === "individual" ? c.otherUser?.avatarUrl : undefined} size={47} />
            <button onClick={() => openChat(c.id)} className="flex-1 min-w-0 text-left">
              <div className="text-[16px] text-[var(--gb-text)] truncate">{c.name}</div>
              <div className="text-[13px] text-[var(--gb-text-2)] truncate">{c.lastMessage?.content || "No messages"}</div>
            </button>
            <button onClick={() => unarchive(c.id)} className="text-[12px] font-medium text-[var(--gb-accent)] px-2 py-1">
              Unarchive
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- App lock screen ---------------- */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const me = useGB((s) => s.me);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const press = (k: string) => {
    if (k === "del") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (next === me?.settings.pin) {
        setTimeout(onUnlock, 150);
      } else {
        setErr(true);
        setTimeout(() => {
          setErr(false);
          setPin("");
        }, 600);
      }
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-[var(--gb-panel)] px-10">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${err ? "bg-red-500/15" : ""}`} style={{ background: err ? undefined : "var(--gb-accent)" }}>
        <KeyRound size={36} className="text-white" />
      </div>
      <h2 className="text-[18px] font-semibold text-[var(--gb-text)]">GB Chat Locked</h2>
      <p className="text-[13px] text-[var(--gb-text-2)] mt-1 mb-6">Enter your 4-digit PIN</p>
      <div className={`flex gap-3 mb-8 ${err ? "animate-shake" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 ${err ? "border-red-500" : "border-[var(--gb-text-2)]"}`}
            style={i < pin.length ? { background: err ? "#ef4444" : "var(--gb-accent)", borderColor: err ? "#ef4444" : "var(--gb-accent)" } : {}}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(k)}
              className="w-16 h-16 rounded-full text-[22px] font-medium text-[var(--gb-text)] bg-[var(--gb-panel-2)] hover:bg-[var(--gb-border)] transition-colors"
            >
              {k === "del" ? "⌫" : k}
            </button>
          )
        )}
      </div>
      <style jsx>{`
        .animate-shake {
          animation: shake 0.4s;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

/* ---------------- Invite friends (GB number + link + code) ---------------- */
export function InviteScreen() {
  const toast = useGB((s) => s.toast);
  const me = useGB((s) => s.me);
  const setMe = useGB((s) => s.setMe);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [fetched, setFetched] = useState<{ code?: string; gbNumber?: string }>({});

  // backfill fallback: agar profile me abhi code/number nahi aya to /api/me se lao
  useEffect(() => {
    if (me?.inviteCode && me?.gbNumber) return;
    api<{ me: { inviteCode?: string; gbNumber?: string } }>("/api/me")
      .then((r) => {
        setFetched({ code: r.me?.inviteCode, gbNumber: r.me?.gbNumber });
        if (me && (r.me?.inviteCode || r.me?.gbNumber)) {
          setMe({ ...me, inviteCode: r.me.inviteCode || me.inviteCode, gbNumber: r.me.gbNumber || me.gbNumber });
        }
      })
      .catch(() => {});
  }, []);

  const code = me?.inviteCode || fetched.code || "";
  const numberRaw = me?.gbNumber || fetched.gbNumber || "";
  const myNumber = formatGbNumber(numberRaw) || "+88 •••• ••••";
  // personal invite link — jo bhi is link se aaye (signup ya login) dono ke contacts link ho jayenge
  const link = code ? `${origin}/?ref=${code}` : origin;

  const msg = `Add me on GB Chat! 💬\nMy GB number: ${myNumber}\nOpen the app → New chat → Add contact → type my number${link ? `\nor just tap this link: ${link}` : ""}${me?.name ? `\n— ${me.name}` : ""}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "GB Chat", text: msg, url: link || undefined });
      } catch {
        /* user cancelled */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    }
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied ✅`);
    } catch {
      toast("Copy failed — please copy manually", "error");
    }
  };

  const steps = [
    { t: "Share your GB number", s: "Copy it from the box above and send it to your friend on WhatsApp — exactly like sharing a phone number." },
    { t: "Friend adds you", s: "They open GB Chat → New chat → Add contact → type your GB number. Done — you both appear in each other's contacts." },
    { t: "Or share the link", s: "Your friend opens the invite link — if they're new they sign up, if they already use GB Chat your contact appears instantly." },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="Invite friends" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        {/* GB number card — the WhatsApp-style identity */}
        <div className="bg-[var(--gb-panel)] py-7 px-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: "var(--gb-accent)" }}>
            <UserRoundPlus size={38} className="text-white" />
          </div>
          <h2 className="text-[19px] font-semibold text-[var(--gb-text)] mt-4">Invite your friends</h2>

          <p className="text-[13px] text-[var(--gb-text-2)] mt-4 self-start">My GB number</p>
          <div className="w-full flex items-center gap-2 bg-[var(--gb-panel-2)] rounded-lg px-3 py-3 border border-[var(--gb-border)] mt-1">
            <span className="flex-1 text-[20px] font-bold tracking-wide text-[var(--gb-text)]" dir="ltr">{myNumber}</span>
            <button
              onClick={() => copy(numberRaw ? myNumber : "", "Number")}
              aria-label="copy GB number"
              className="shrink-0 p-1.5 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]"
            >
              <Copy size={17} />
            </button>
          </div>
          <p className="text-[12px] text-[var(--gb-text-2)] mt-2 self-start">
            This number never changes — jaise WhatsApp ka number. Friends save it and add you anytime.
          </p>
        </div>

        {/* 3 steps */}
        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <p className="text-[13px] font-medium text-[var(--gb-text)] mb-3">How inviting works</p>
          {steps.map((st, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <span
                className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold text-white mt-0.5"
                style={{ background: "var(--gb-accent)" }}
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[14.5px] text-[var(--gb-text)] font-medium">{st.t}</div>
                <div className="text-[12.5px] text-[var(--gb-text-2)] leading-relaxed mt-0.5">{st.s}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <p className="text-[13px] text-[var(--gb-text-2)] mb-2">Invite link</p>
          <div className="flex items-center gap-2 bg-[var(--gb-panel-2)] rounded-lg px-3 py-2.5 border border-[var(--gb-border)]">
            <span className="flex-1 text-[13.5px] text-[var(--gb-text)] truncate" dir="ltr">{link || "..."}</span>
            <button onClick={() => copy(link, "Link")} aria-label="copy link" className="shrink-0 p-1.5 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]">
              <Copy size={17} />
            </button>
          </div>
          {code && (
            <div className="mt-3">
              <p className="text-[13px] text-[var(--gb-text-2)] mb-2">Invite code</p>
              <div className="flex items-center gap-2 bg-[var(--gb-panel-2)] rounded-lg px-3 py-2.5 border border-[var(--gb-border)]">
                <span className="flex-1 text-[15px] font-semibold tracking-wider text-[var(--gb-text)]" dir="ltr">{code}</span>
                <button onClick={() => copy(code, "Code")} aria-label="copy code" className="shrink-0 p-1.5 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]">
                  <Copy size={17} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 bg-[var(--gb-panel)] px-5 py-4">
          <p className="text-[13px] text-[var(--gb-text-2)] mb-2">Ready-made invite message</p>
          <div className="relative bg-[var(--gb-panel-2)] rounded-lg px-3 py-2.5 border border-[var(--gb-border)]">
            <p className="text-[13.5px] text-[var(--gb-text)] leading-relaxed whitespace-pre-line">{msg}</p>
            <button
              onClick={() => copy(msg, "Message")}
              aria-label="copy message"
              className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-[var(--gb-border)] text-[var(--gb-accent)]"
            >
              <Copy size={15} />
            </button>
          </div>
        </div>

        <div className="px-5 mt-5 flex flex-col gap-2.5">
          <button
            onClick={share}
            className="w-full h-12 rounded-full text-white font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ background: "var(--gb-accent)" }}
          >
            <Share2 size={18} />
            Share invite
          </button>
          <button
            onClick={shareWhatsApp}
            className="w-full h-12 rounded-full font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-white"
            style={{ background: "#25d366" }}
          >
            <Share2 size={18} />
            Share on WhatsApp
          </button>
          <p className="text-[12px] text-[var(--gb-text-2)] text-center mt-1 leading-relaxed">
            Send the number to your friend — they type it in New chat → Add contact, and both contact lists connect instantly. 🔒
          </p>
        </div>
      </div>
    </div>
  );
}
