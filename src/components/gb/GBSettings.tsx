"use client";

/** GB Chat — special GB settings (original implementation) */
import { useState } from "react";
import {
  BellOff,
  Reply,
  Snowflake,
  EyeOff,
  CheckCheck,
  ShieldCheck,
  Undo2,
  LockKeyhole,
  Palette,
  Type,
  KeyRound,
  Info,
  Timer,
  Users,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { ScreenHeader, Section, Row, Switch } from "@/components/gb/ui-bits";

export function GBSettingsScreen() {
  const me = useGB((s) => s.me);
  const patchSettings = useGB((s) => s.patchSettings);
  const toast = useGB((s) => s.toast);
  const [replyText, setReplyText] = useState(me?.settings.gb.autoReplyText || "");
  const [pinOpen, setPinOpen] = useState(false);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");

  if (!me) return null;
  const gb = me.settings.gb;

  const set = (k: keyof typeof gb, v: boolean | string) => patchSettings({ gb: { ...gb, [k]: v } as never });

  const savePin = () => {
    if (!/^\d{4}$/.test(pin1)) return toast("PIN must be 4 digits", "error");
    if (pin1 !== pin2) return toast("PINs don't match", "error");
    patchSettings({ pin: pin1, gb: { ...gb, appLock: true } });
    setPinOpen(false);
    setPin1("");
    setPin2("");
    toast("App lock ON — PIN saved 🔒");
  };

  return (
    <div className="h-full flex flex-col bg-[var(--gb-bg)]">
      <ScreenHeader title="GB Settings" onBack={() => useGB.getState().popView()} />
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[13px] text-[var(--gb-text-2)] leading-relaxed">
            GB Chat's extra privacy and customization features — the WhatsApp experience you love, plus full control.
          </p>
        </div>

        <Section title="Privacy & Security">
          <Row
            icon={<Snowflake size={20} />}
            title="Freeze Last Seen"
            subtitle="Freeze your online status — nobody can see when you come or go"
            right={<Switch checked={gb.freezeLastSeen} onChange={(v) => set("freezeLastSeen", v)} />}
          />
          <Row
            icon={<EyeOff size={20} />}
            title="Hide Blue Ticks"
            subtitle="Read receipts off — your blue ticks stay hidden from everyone"
            right={<Switch checked={gb.hideBlueTicks} onChange={(v) => set("hideBlueTicks", v)} />}
          />
          <Row
            icon={<CheckCheck size={20} />}
            title="Hide Second Tick"
            subtitle="Hide the delivered tick too"
            right={<Switch checked={gb.hideSecondTick} onChange={(v) => set("hideSecondTick", v)} />}
          />
          <Row
            icon={<Users size={20} />}
            title="Hide Typing Status"
            subtitle="Typing... won't be shown while you type"
            right={<Switch checked={gb.hideTyping} onChange={(v) => set("hideTyping", v)} />}
          />
          <Row
            icon={<ShieldCheck size={20} />}
            title="Hide Online Status"
            subtitle="Your online badge stays hidden from everyone"
            right={<Switch checked={gb.showOnlineStatus} onChange={(v) => set("showOnlineStatus", v)} />}
          />
          <Row
            icon={<Undo2 size={20} />}
            title="Anti-Revoke"
            subtitle="Deleted messages bhi aapko dikhenge (revoke-proof)"
            right={<Switch checked={gb.antiRevoke} onChange={(v) => set("antiRevoke", v)} />}
          />
        </Section>

        <Section title="Do Not Disturb">
          <Row
            icon={<BellOff size={20} />}
            title="DND Mode"
            subtitle={gb.dnd ? "ON — notifications are off" : "Mute all notifications"}
            right={<Switch checked={gb.dnd} onChange={(v) => { set("dnd", v); toast(v ? "DND ON 🔕 — notifications off" : "DND OFF 🔔"); }} />}
          />
        </Section>

        <Section title="Auto Reply">
          <div className="bg-[var(--gb-panel)] px-5 py-3.5">
            <div className="flex items-center gap-4">
              <Reply size={20} className="text-[var(--gb-text-2)]" />
              <div className="flex-1">
                <div className="text-[15px] text-[var(--gb-text)]">Auto-Reply Enable</div>
                <div className="text-[12px] text-[var(--gb-text-2)]">Busy hone par automatic jawab jayega</div>
              </div>
              <Switch checked={gb.autoReply} onChange={(v) => set("autoReply", v)} />
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              maxLength={200}
              className="w-full mt-3 rounded-lg p-2.5 text-[14px] outline-none resize-none border border-[var(--gb-border)] bg-[var(--gb-panel-2)] text-[var(--gb-text)]"
              placeholder="Type your auto-reply message..."
            />
            <button
              onClick={() => {
                set("autoReplyText", replyText);
                toast("Auto-reply text saved ✅");
              }}
              className="mt-2 px-4 h-9 rounded-full text-[13px] font-medium text-white"
              style={{ background: "var(--gb-accent)" }}
            >
              Save text
            </button>
          </div>
        </Section>

        <Section title="App Lock">
          <Row
            icon={<LockKeyhole size={20} />}
            title="App Lock (4-digit PIN)"
            subtitle={gb.appLock && me.settings.pin ? "ON — PIN will be asked when opening the app" : "Off — set a PIN first"}
            right={
              <Switch
                checked={gb.appLock && !!me.settings.pin}
                onChange={(v) => {
                  if (v) {
                    setPinOpen(true);
                  } else {
                    patchSettings({ pin: null, gb: { ...gb, appLock: false } });
                    toast("App lock OFF");
                  }
                }}
              />
            }
          />
        </Section>

        <Section title="Customization">
          <Row
            icon={<Palette size={20} />}
            title="Themes & Accent Colors"
            subtitle="8 accent colors + Light/Dark/AMOLED"
            onClick={() => useGB.getState().pushView({ name: "chatsettings" })}
          />
          <Row
            icon={<Type size={20} />}
            title="Font Size & Wallpaper"
            subtitle="Change chat font and background"
            onClick={() => useGB.getState().pushView({ name: "chatsettings" })}
          />
          <Row
            icon={<Timer size={20} />}
            title="Scheduled Messages"
            subtitle="Open a chat → 📎 → Schedule"
            onClick={() => useGB.getState().toast("Chat screen → 📎 → Schedule message ⏰")}
          />
        </Section>

        <Section title="About GB Features">
          <Row icon={<Info size={20} />} title="Feature list" subtitle="All GB features at a glance" onClick={() => toast("Freeze Last Seen • Hide Ticks • DND • Auto-Reply • Anti-Revoke • App Lock • Themes • Scheduler")} />
          <Row
            icon={<KeyRound size={20} />}
            title="Reset GB settings"
            onClick={async () => {
              await patchSettings({
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
              });
              toast("GB settings reset 🔄");
            }}
          />
        </Section>
      </div>

      {/* PIN dialog */}
      {pinOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setPinOpen(false)}>
          <div className="w-full max-w-[300px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-[var(--gb-text)] mb-1">App Lock PIN</h3>
            <p className="text-[12px] text-[var(--gb-text-2)] mb-4">Set a 4-digit PIN</p>
            <input
              value={pin1}
              onChange={(e) => setPin1(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              type="password"
              placeholder="New PIN"
              className="w-full h-11 px-3 rounded-lg mb-2 bg-[var(--gb-panel-2)] outline-none text-[18px] tracking-[8px] text-center text-[var(--gb-text)] border border-[var(--gb-border)]"
            />
            <input
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              type="password"
              placeholder="Confirm PIN"
              className="w-full h-11 px-3 rounded-lg bg-[var(--gb-panel-2)] outline-none text-[18px] tracking-[8px] text-center text-[var(--gb-text)] border border-[var(--gb-border)]"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPinOpen(false)} className="flex-1 h-10 rounded-full text-[14px] text-[var(--gb-text-2)]">
                Cancel
              </button>
              <button onClick={savePin} className="flex-1 h-10 rounded-full text-[14px] font-medium text-white" style={{ background: "var(--gb-accent)" }}>
                Set PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
