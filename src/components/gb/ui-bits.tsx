"use client";

/** GB Chat shared UI bits — original design implementation */
import { ReactNode, CSSProperties } from "react";
import { Check, CheckCheck, Clock, ChevronLeft } from "lucide-react";
import { avatarStyle, initials } from "@/lib/gb-api";
import type { UserSettings } from "@/lib/settings";

/* ---------------- Avatar ---------------- */
export function GbAvatar({
  name,
  color,
  emoji,
  url,
  size = 49,
  online,
  ring,
  onClick,
}: {
  name: string;
  color: string;
  emoji?: string;
  url?: string | null;
  size?: number;
  online?: boolean;
  ring?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} onClick={onClick}>
      <div
        className={`w-full h-full rounded-full flex items-center justify-center text-white font-medium select-none overflow-hidden ${
          ring ? "ring-2 ring-offset-2 ring-[var(--gb-accent)]" : ""
        }`}
        style={{ ...avatarStyle(color), fontSize: size * 0.38 }}
      >
        {url ? (
          <img src={url} alt={name} className="w-full h-full object-cover" draggable={false} />
        ) : emoji ? (
          <span style={{ fontSize: size * 0.5 }}>{emoji}</span>
        ) : (
          initials(name) || "?"
        )}
      </div>
      {online && (
        <span
          className="absolute rounded-full border-2 border-white dark:border-[#111b21]"
          style={{
            width: size * 0.26,
            height: size * 0.26,
            right: 0,
            bottom: 0,
            background: "#25d366",
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Message ticks ---------------- */
export function Ticks({ status, light }: { status: string; light?: boolean }) {
  if (status === "pending")
    return <Clock size={15} className={light ? "text-white/70" : "text-[var(--gb-tick)]"} />;
  if (status === "read") return <CheckCheck size={16} className="text-[#53bdeb]" />;
  if (status === "delivered")
    return <CheckCheck size={16} className={light ? "text-white/80" : "text-[var(--gb-tick)]"} />;
  return <Check size={16} className={light ? "text-white/80" : "text-[var(--gb-tick)]"} />;
}

/* ---------------- Screen header ---------------- */
export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
  center,
  onBack,
  avatar,
}: {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  center?: boolean;
  onBack?: () => void;
  avatar?: ReactNode;
}) {
  return (
    <div
      className="h-14 flex items-center gap-3 px-3 shrink-0 z-20"
      style={{ background: "var(--gb-header)" }}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {avatar}
      {title && (
        <div className={`flex-1 min-w-0 ${center ? "text-center pr-10" : ""}`}>
          <div className="text-white font-medium truncate leading-tight">{title}</div>
          {subtitle && (
            <div className="text-white/75 text-[12px] truncate leading-tight">{subtitle}</div>
          )}
        </div>
      )}
      {!title && <div className="flex-1">{left}</div>}
      <div className="flex items-center gap-1">{right}</div>
    </div>
  );
}

export function HeaderIcon({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors text-white"
    >
      {children}
    </button>
  );
}

/* ---------------- Theme ---------------- */
export interface ThemeVars extends CSSProperties {
  "--gb-header": string;
  "--gb-bg": string;
  "--gb-panel": string;
  "--gb-panel-2": string;
  "--gb-text": string;
  "--gb-text-2": string;
  "--gb-border": string;
  "--gb-accent": string;
  "--gb-accent-text": string;
  "--gb-bubble-in": string;
  "--gb-bubble-out": string;
  "--gb-tick": string;
  "--gb-unread": string;
  "--gb-input": string;
}

export function themeVars(settings: UserSettings | undefined | null): ThemeVars {
  const accent = settings?.chat.accent || "00a884";
  const theme = settings?.chat.theme || "light";
  if (theme === "light") {
    return {
      "--gb-header": `#${accent}`,
      "--gb-bg": "#f0f2f5",
      "--gb-panel": "#ffffff",
      "--gb-panel-2": "#f5f6f6",
      "--gb-text": "#111b21",
      "--gb-text-2": "#667781",
      "--gb-border": "#e9edef",
      "--gb-accent": `#${accent}`,
      "--gb-accent-text": "#ffffff",
      "--gb-bubble-in": "#ffffff",
      "--gb-bubble-out": "#d9fdd3",
      "--gb-tick": "#8696a0",
      "--gb-unread": `#${accent}`,
      "--gb-input": "#ffffff",
    };
  }
  if (theme === "amoled") {
    return {
      "--gb-header": "#000000",
      "--gb-bg": "#000000",
      "--gb-panel": "#0a0a0a",
      "--gb-panel-2": "#111111",
      "--gb-text": "#e9edef",
      "--gb-text-2": "#8696a0",
      "--gb-border": "#1f2c33",
      "--gb-accent": `#${accent}`,
      "--gb-accent-text": "#ffffff",
      "--gb-bubble-in": "#111b21",
      "--gb-bubble-out": "#005c4b",
      "--gb-tick": "#8696a0",
      "--gb-unread": `#${accent}`,
      "--gb-input": "#0a0a0a",
    };
  }
  return {
    "--gb-header": "#1f2c34",
    "--gb-bg": "#0b141a",
    "--gb-panel": "#111b21",
    "--gb-panel-2": "#202c33",
    "--gb-text": "#e9edef",
    "--gb-text-2": "#8696a0",
    "--gb-border": "#222d34",
    "--gb-accent": `#${accent}`,
    "--gb-accent-text": "#ffffff",
    "--gb-bubble-in": "#202c33",
    "--gb-bubble-out": "#005c4b",
    "--gb-tick": "#8696a0",
    "--gb-unread": `#${accent}`,
    "--gb-input": "#111b21",
  } as ThemeVars;
}

/** Wallpaper background style (original doodle pattern) */
export function wallpaperStyle(settings: UserSettings | undefined | null): CSSProperties {
  const wp = settings?.chat.wallpaper || "default";
  const dark = settings?.chat.theme !== "light";
  if (wp === "default") {
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'>` +
        `<g fill='none' stroke='${dark ? "rgba(255,255,255,0.045)" : "rgba(60,74,80,0.08)"}' stroke-width='2.4' stroke-linecap='round'>` +
        `<circle cx='24' cy='26' r='9'/><path d='M20 26l3 3 6-7'/><path d='M60 18c2-4 8-4 10 0 2-4 8-4 10 0 0 5-10 11-10 11s-10-6-10-11z'/>` +
        `<path d='M110 30l4 8-4 8-8-4z'/><circle cx='40' cy='86' r='5'/><path d='M84 78h22M84 88h16M84 98h20'/>` +
        `<path d='M18 120c0-6 5-11 11-11s11 5 11 11'/><path d='M118 108c4 2 6 7 4 11s-7 6-11 4'/>` +
        `<path d='M62 116c3-3 9-3 12 0'/><circle cx='132' cy='70' r='4'/><circle cx='8' cy='64' r='4'/><circle cx='72' cy='52' r='4'/><circle cx='100' cy='132' r='4'/><circle cx='46' cy='134' r='4'/></g></svg>`
    );
    return {
      backgroundImage: `url("data:image/svg+xml,${svg}")`,
      backgroundColor: dark ? "#0b141a" : "#efe7db",
    };
  }
  const solids: Record<string, string> = {
    plain: dark ? "#0b141a" : "#f6f2ec",
    mint: dark ? "#0b1f1b" : "#dcf3ec",
    sand: dark ? "#231c0e" : "#f5e6c8",
    blush: dark ? "#230e16" : "#f8dee7",
    sky: dark ? "#0e1a23" : "#d9edf7",
    lav: dark ? "#170e23" : "#e8def5",
    charcoal: "#1e272c",
  };
  return { backgroundColor: solids[wp] || solids.plain };
}

/* ---------------- Misc ---------------- */
export function Row({
  icon,
  title,
  subtitle,
  right,
  onClick,
  danger,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--gb-panel-2)] active:bg-[var(--gb-panel-2)] transition-colors text-left cursor-pointer"
    >
      {icon && <span className={danger ? "text-red-500" : "text-[var(--gb-text-2)]"}>{icon}</span>}
      <span className="flex-1 min-w-0">
        <span
          className={`block text-[15px] truncate ${danger ? "text-red-500" : "text-[var(--gb-text)]"}`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="block text-[13px] text-[var(--gb-text-2)] truncate">{subtitle}</span>
        )}
      </span>
      {right}
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      {title && (
        <div className="px-5 pt-4 pb-1.5 text-[13px] font-medium text-[var(--gb-accent)]">
          {title}
        </div>
      )}
      <div className="bg-[var(--gb-panel)]">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-[22px] rounded-full transition-colors relative shrink-0 ${
        checked ? "bg-[var(--gb-accent)]" : "bg-[var(--gb-tick)]/50"
      }`}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[20px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}
