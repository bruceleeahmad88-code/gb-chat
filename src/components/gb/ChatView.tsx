"use client";

/** GB Chat — individual/group chat screen with bubbles */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Search,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Mic,
  Send,
  Copy,
  Star,
  Trash2,
  Forward,
  Reply,
  X,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  MapPin,
  User as UserIcon,
  Timer,
  Volume2,
  Play,
  Ban,
  Download,
  Loader2,
  Eraser,
  Clapperboard,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import {
  api,
  apiForm,
  formatTime,
  formatDayLabel,
  formatBytes,
  formatDuration,
  lastSeenText,
  mediaUrl,
  resolveMedia,
  pickFile,
  gifProxyUrl,
  gifDirectUrl,
} from "@/lib/gb-api";
import type { ChatMessage } from "@/lib/gb-types";
import {
  GbAvatar,
  Ticks,
  ScreenHeader,
  HeaderIcon,
  wallpaperStyle,
} from "@/components/gb/ui-bits";
import { EmojiPicker } from "@/components/gb/EmojiPicker";
import { ForwardDialog } from "@/components/gb/ForwardDialog";
import { GifPicker } from "@/components/gb/GifPicker";
import { startCall as startCallRtc } from "@/lib/calls";

function mediaTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "image":
      return "📷 Photo";
    case "video":
      return "📹 Video";
    case "audio":
      return "🎤 Voice message";
    case "document":
      return "📄 Document";
    case "location":
      return "📍 Location";
    case "contact":
      return "👤 Contact";
    case "gif":
      return "🎞️ GIF";
    default:
      return type ? `📎 ${type}` : "";
  }
}

/* --- WAV encoder: turn the browser recording into universal 16-bit PCM mono .wav ---
   Plays on EVERY device (like real WhatsApp voice notes). The voice note is ALWAYS
   sent — even if the mic captured silence, exactly like the user asked. */
function encodeWav(buffer: AudioBuffer): Blob {
  const len = buffer.length;
  const sampleRate = buffer.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + len * 2));
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  data.setUint32(4, 36 + len * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  data.setUint32(16, 16, true); // PCM chunk size
  data.setUint16(20, 1, true); // PCM format
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true); // byte rate
  data.setUint16(32, 2, true); // block align
  data.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  data.setUint32(40, len * 2, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    let v = 0;
    for (let c = 0; c < chans.length; c++) v += chans[c][i];
    v /= chans.length;
    v = Math.max(-1, Math.min(1, v));
    data.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }
  return new Blob([data.buffer], { type: "audio/wav" });
}

function audioCtxCtor(): typeof AudioContext | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext || w.webkitAudioContext || null;
}

/* WhatsApp-style voice note player — real <audio> playback + waveform + live progress.
   Used for both recorded voice notes and real audio files shared from the device. */
function VoiceBubble({ src, meta }: { src: string; meta?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0); // seconds from file metadata
  const [broken, setBroken] = useState(false);

  const metaSec = useMemo(() => {
    if (!meta) return 0;
    const m = /^(\d+):(\d{1,2})$/.exec(meta.trim());
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
  }, [meta]);

  const fmt = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0:00";
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    el.play().catch(() => setBroken(true));
  };

  const shownDur = duration || metaSec;
  const remaining = playing || progress > 0 ? Math.max(0, (1 - progress) * shownDur) : shownDur;

  return (
    <div className="flex items-center gap-2.5 pr-6 min-w-[210px] py-0.5">
      <button
        onClick={toggle}
        aria-label={playing ? "pause voice" : "play voice"}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 active:scale-95 transition-transform"
        style={{ background: "var(--gb-accent)" }}
      >
        {playing ? <Volume2 size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-[2px] h-6">
          {Array.from({ length: 24 }).map((_, i) => {
            const played = i / 24 <= progress;
            return (
              <span
                key={i}
                className="w-[2.5px] rounded-full transition-colors"
                style={{
                  height: `${8 + ((i * 7) % 17)}px`,
                  background: played ? "var(--gb-accent)" : "var(--gb-tick)",
                }}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--gb-text-2)] mt-0.5" dir="ltr">
          {broken ? (
            <span className="text-red-500">Can&apos;t play this audio</span>
          ) : playing && progress <= 0 ? (
            "Playing..."
          ) : (
            fmt(remaining)
          )}
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onError={() => setBroken(true)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress(el.currentTime / el.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          const el = audioRef.current;
          if (el) el.currentTime = 0;
        }}
        className="hidden"
      />
    </div>
  );
}

function Bubble({
  msg,
  mine,
  isGroup,
  onAction,
  antiRevoke,
  fontScale,
}: {
  msg: ChatMessage;
  mine: boolean;
  isGroup: boolean;
  onAction: (a: string, m: ChatMessage) => void;
  antiRevoke: boolean;
  fontScale: number;
}) {
  const [menu, setMenu] = useState(false);

  const deleted = msg.deletedForAll;
  const showDeleted = deleted && !antiRevoke;

  const bg = mine ? "var(--gb-bubble-out)" : "var(--gb-bubble-in)";
  const time = formatTime(msg.createdAt);

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} px-3 mb-[3px] relative`}>
      {!mine && isGroup && (
        <div className="w-7 shrink-0 self-end" />
      )}
      <div className="relative max-w-[82%] group" onContextMenu={(e) => e.preventDefault()}>
        <div
          className="rounded-lg px-2 py-1.5 shadow-sm relative"
          style={{ background: showDeleted ? "color-mix(in srgb, var(--gb-bubble-in) 88%, transparent)" : bg }}
          onDoubleClick={() => onAction("star", msg)}
        >
          {/* tail */}
          <span
            className="absolute top-0 w-3 h-3 overflow-hidden"
            style={{
              [mine ? "right" : "left"]: "-8px",
            } as React.CSSProperties}
          >
            <svg viewBox="0 0 12 12" width="12" height="12">
              <path
                d={mine ? "M0 0 L12 0 L0 12 Z" : "M12 0 L0 0 L12 12 Z"}
                fill={showDeleted ? "color-mix(in srgb, var(--gb-bubble-in) 88%, transparent)" : bg}
              />
            </svg>
          </span>

          {!mine && isGroup && !showDeleted && (
            <div className="text-[13px] font-semibold" style={{ color: `#${msg.sender.avatarColor}` }}>
              {msg.sender.name}
            </div>
          )}

          {/* reply quote */}
          {msg.replyToId && !showDeleted && (
            <div className="rounded-md mb-1 px-2 py-1 border-l-4 border-[var(--gb-accent)] bg-black/5 dark:bg-white/5">
              <div className="text-[12.5px] font-semibold text-[var(--gb-accent)]">
                {msg.replyToSender === "You" ? "You" : msg.replyToSender}
              </div>
              <div className="text-[12.5px] text-[var(--gb-text-2)] truncate">
                {msg.replyToType !== "text" ? mediaTypeLabel(msg.replyToType) : msg.replyToContent}
              </div>
            </div>
          )}

          {showDeleted ? (
            <div className="flex items-center gap-1.5 text-[14px] italic text-[var(--gb-text-2)] pr-10">
              <Ban size={14} /> This message was deleted
            </div>
          ) : deleted && antiRevoke ? (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-orange-400 mb-0.5">
                <Ban size={11} /> Anti-revoke: sender deleted this
              </div>
              {renderBody()}
            </div>
          ) : (
            renderBody()
          )}

          <div className="flex items-center justify-end gap-1 float-right ml-2 -mb-0.5 mt-0.5 translate-y-0.5">
            <span className="text-[11px] text-[var(--gb-text-2)]">{time}</span>
            {mine && !deleted && <Ticks status={msg.status} />}
            {msg.starred && <Star size={11} className="text-[var(--gb-text-2)] fill-[var(--gb-text-2)]" />}
          </div>
        </div>

        {/* action button */}
        {!showDeleted && (
          <button
            onClick={() => setMenu(!menu)}
            aria-label="message options"
            className={`absolute top-1 ${mine ? "left-[-26px]" : "right-[-26px]"} p-1 rounded-full opacity-0 group-hover:opacity-100 md:opacity-40 hover:!opacity-100 transition-opacity`}
            style={{ color: "var(--gb-text-2)" }}
          >
            <ChevronDown size={15} />
          </button>
        )}

        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div
              className={`absolute z-40 ${mine ? "right-0" : "left-0"} top-6 w-44 rounded-lg shadow-2xl bg-[var(--gb-panel)] border border-[var(--gb-border)] py-1 text-[14px] text-[var(--gb-text)]`}
            >
              {[
                { icon: <Reply size={15} />, label: "Reply", act: "reply", show: !deleted },
                { icon: <Forward size={15} />, label: "Forward", act: "forward", show: !deleted },
                { icon: <Copy size={15} />, label: "Copy", act: "copy", show: msg.type === "text" && !!msg.content },
                {
                  icon: <Star size={15} className={msg.starred ? "fill-current" : ""} />,
                  label: msg.starred ? "Unstar" : "Star",
                  act: "star",
                  show: true,
                },
                { icon: <Trash2 size={15} />, label: "Delete for me", act: "delme", show: true },
                { icon: <Trash2 size={15} />, label: "Delete for everyone", act: "deleveryone", show: mine && !deleted },
              ]
                .filter((i) => i.show)
                .map((item) => (
                  <button
                    key={item.act + item.label}
                    onClick={() => {
                      setMenu(false);
                      onAction(item.act, msg);
                    }}
                    className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-[var(--gb-panel-2)] text-left"
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  function renderBody() {
    if (msg.type === "gif") {
      // Always render through our /api/gifs/media proxy — Giphy's old
      // media.giphy.com paths show "THIS CONTENT IS NOT AVAILABLE" now.
      // gifProxyUrl() also REWRITES old stored giphy URLs, so history repairs itself.
      const proxied = gifProxyUrl(msg.mediaSeed);
      const direct = gifDirectUrl(msg.mediaSeed);
      if (!proxied) {
        return (
          <div className="rounded-md px-3 py-2 text-[13.5px] text-[var(--gb-text-2)] italic">GIF unavailable</div>
        );
      }
      return (
        <div className="rounded-md overflow-hidden max-w-[240px]">
          <img
            src={proxied}
            alt="GIF"
            loading="lazy"
            className="w-full h-auto block"
            onError={(e) => {
              // proxy hiccup → direct i.giphy.com CDN → give up with a clean label
              const el = e.currentTarget as HTMLImageElement;
              const step = el.dataset.fb || "0";
              if (step === "0" && direct) {
                el.dataset.fb = "1";
                el.src = direct;
              } else if (step === "1") {
                el.dataset.fb = "2";
                el.style.display = "none";
                const box = el.parentElement;
                if (box && !box.querySelector(".gif-fail")) {
                  const d = document.createElement("div");
                  d.className = "gif-fail px-3 py-2 text-[13px] text-[var(--gb-text-2)] italic";
                  d.textContent = "GIF unavailable";
                  box.appendChild(d);
                }
              }
            }}
          />
        </div>
      );
    }
    if (msg.type === "image") {
      return (
        <div className="rounded-md overflow-hidden max-w-[240px]">
          <img
            src={resolveMedia(msg.mediaSeed)}
            alt="photo"
            className="w-full h-auto"
            loading="lazy"
          />
          {msg.content && <div className="text-[14.5px] text-[var(--gb-text)] px-0.5 pt-1">{msg.content}</div>}
        </div>
      );
    }
    if (msg.type === "video") {
      return (
        <div className="rounded-md overflow-hidden max-w-[250px]">
          <video
            src={resolveMedia(msg.mediaSeed)}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[340px] bg-black/20"
          />
          {msg.content && <div className="text-[14.5px] text-[var(--gb-text)] px-0.5 pt-1">{msg.content}</div>}
        </div>
      );
    }
    if (msg.type === "audio") {
      // REAL audio (recorded voice note ya device file) — WhatsApp-style player
      if (msg.mediaSeed && msg.mediaSeed.startsWith("/api/files/")) {
        return <VoiceBubble src={resolveMedia(msg.mediaSeed)} meta={msg.mediaMeta} />;
      }
      // legacy placeholder (old fake voice notes) — sirf label dikha do
      const dur = msg.mediaMeta || "0:14";
      return (
        <div className="flex items-center gap-2.5 pr-6 min-w-[150px]">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 opacity-60"
            style={{ background: "var(--gb-accent)" }}
          >
            <Volume2 size={16} />
          </span>
          <div>
            <div className="text-[12px] text-[var(--gb-text-2)]">Voice message</div>
            <div className="text-[11px] text-[var(--gb-text-2)]" dir="ltr">{dur}</div>
          </div>
        </div>
      );
    }
    if (msg.type === "document") {
      const isReal = !!msg.mediaSeed && msg.mediaSeed.startsWith("/api/files/");
      const card = (
        <div className="flex items-center gap-3 pr-8 py-1 min-w-[200px]">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-500/10">
            <FileText size={20} className="text-red-500" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] text-[var(--gb-text)] truncate">{msg.mediaName || "Document"}</div>
            <div className="text-[11px] text-[var(--gb-text-2)]">{msg.mediaMeta || "PDF • 1 page"}</div>
          </div>
          {isReal && <Download size={16} className="text-[var(--gb-text-2)] shrink-0" />}
        </div>
      );
      return isReal ? (
        <a
          href={resolveMedia(msg.mediaSeed)}
          download={msg.mediaName || true}
          className="block hover:opacity-90 transition-opacity"
          title="Download document"
        >
          {card}
        </a>
      ) : (
        card
      );
    }
    if (msg.type === "location") {
      const seed = msg.mediaSeed || "loc";
      return (
        <div className="rounded-md overflow-hidden max-w-[230px]">
          <div className="relative h-32 bg-emerald-100">
            <svg viewBox="0 0 230 130" className="w-full h-full">
              <rect width="230" height="130" fill="#e8f0e4" />
              {[20, 60, 100, 140, 180].map((y) => (
                <line key={y} x1="0" y1={y} x2="230" y2={y} stroke="#cfdcc9" strokeWidth="6" />
              ))}
              {[40, 110, 180].map((x) => (
                <line key={x} x1={x} y1="0" x2={x} y2="130" stroke="#cfdcc9" strokeWidth="6" />
              ))}
              <path d="M0 90 Q60 70 115 90 T230 85" stroke="#9fc4e8" strokeWidth="10" fill="none" />
            </svg>
            <MapPin size={28} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-red-500 fill-red-500/30" />
          </div>
          <div className="px-2 py-1.5 text-[13px] text-[var(--gb-text)] bg-[var(--gb-bubble-in)]">
            {msg.content || "Live location"}
          </div>
        </div>
      );
    }
    return (
      <div className="text-[14.8px] leading-relaxed text-[var(--gb-text)] whitespace-pre-wrap break-words pr-10" style={{ fontSize: `${fontScale}px` }}>
        {msg.content}
      </div>
    );
  }
}

/* ---------------- Chat View ---------------- */
export function ChatView({ chatId }: { chatId: string }) {
  const me = useGB((s) => s.me);
  const chats = useGB((s) => s.chats);
  const messagesMap = useGB((s) => s.messagesByChat);
  const typing = useGB((s) => s.typing);
  const closeChat = useGB((s) => s.closeChat);
  const pushView = useGB((s) => s.pushView);
  const toast = useGB((s) => s.toast);
  const setReplying = useGB((s) => s.setReplying);
  const replying = useGB((s) => s.replying);
  const setForwarding = useGB((s) => s.setForwarding);
  const online = useGB((s) => s.online);
  const lastSeenBy = useGB((s) => s.lastSeenBy);

  const chat = chats.find((c) => c.id === chatId);
  const messages = messagesMap[chatId] || [];
  const typingInfo = typing[chatId];

  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleText, setScheduleText] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ---- real voice recording (MediaRecorder → decoded → WAV) ---- */
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recLevel, setRecLevel] = useState(0); // real mic loudness 0..1 (live meter)
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelNodes = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);

  const startRecording = async () => {
    if (recRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", ""];
      const mimeType =
        candidates.find(
          (m) =>
            m === "" ||
            (typeof MediaRecorder !== "undefined" &&
              typeof MediaRecorder.isTypeSupported === "function" &&
              MediaRecorder.isTypeSupported(m))
        ) || "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      mr.start(250); // collect small chunks — real audio, real time
      recRef.current = { mr, stream, chunks, startedAt: Date.now() };
      setRecording(true);
      setRecSec(0);
      setRecLevel(0);
      recTimer.current = setInterval(() => setRecSec((s) => s + 1), 1000);
      // live mic level meter — visible proof the mic is actually capturing sound
      try {
        const AC = audioCtxCtor();
        if (AC) {
          const ctx = new AC();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          levelNodes.current = { ctx, analyser };
          const buf = new Uint8Array(analyser.frequencyBinCount);
          levelTimer.current = setInterval(() => {
            const node = levelNodes.current?.analyser;
            if (!node) return;
            node.getByteTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
            setRecLevel(peak);
          }, 120);
        }
      } catch {
        /* level meter is optional */
      }
    } catch {
      toast("Microphone access denied — allow mic permission to record voice notes 🎙️", "error");
    }
  };

  const stopRecording = async (sendIt: boolean) => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    if (recTimer.current) {
      clearInterval(recTimer.current);
      recTimer.current = null;
    }
    if (levelTimer.current) {
      clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
    levelNodes.current = null;
    setRecLevel(0);
    setRecording(false);
    const seconds = Math.max(1, Math.round((Date.now() - rec.startedAt) / 1000));
    await new Promise<void>((resolve) => {
      rec.mr.onstop = () => resolve();
      try {
        rec.mr.stop();
      } catch {
        resolve();
      }
    });
    rec.stream.getTracks().forEach((t) => t.stop());
    setRecSec(0);
    if (!sendIt) return; // cancelled
    if (seconds < 1) {
      toast("Voice note too short — tap the mic, speak, then send", "error");
      return;
    }
    const raw = new Blob(rec.chunks, { type: rec.mr.mimeType || "audio/webm" });
    if (!raw.size) {
      toast("Recording failed — please try again", "error");
      return;
    }
    setUploading("Preparing voice note...");
    try {
      let outBlob: Blob = raw;
      let outMime = rec.mr.mimeType || "audio/webm";
      let outExt = outMime.includes("mp4") ? "m4a" : outMime.includes("ogg") ? "ogg" : "weba";
      /* Playback compatibility fix: decode the raw recording with the browser's own
         audio stack and re-encode as 16-bit PCM WAV — a format every phone browser
         can play. The note is ALWAYS sent, even if it captured silence. */
      try {
        const AC = audioCtxCtor();
        if (AC) {
          const ac = new AC();
          const decoded = await ac.decodeAudioData(await raw.arrayBuffer());
          outBlob = encodeWav(decoded);
          await ac.close();
          outMime = "audio/wav";
          outExt = "wav";
        }
      } catch {
        /* decode failed — send the raw recording as-is (some browsers behave oddly) */
      }
      setUploading("Sending voice note...");
      const fd = new FormData();
      fd.append("file", new File([outBlob], `voice-note-${Date.now()}.${outExt}`, { type: outMime }));
      const res = await apiForm<{ url: string }>("/api/upload", fd);
      await send("", "audio", {
        mediaSeed: res.url,
        mediaName: "Voice message",
        mediaMeta: formatDuration(seconds),
      });
    } catch (e) {
      toast((e as Error).message || "Voice note send failed", "error");
    } finally {
      setUploading(null);
    }
  };

  // unmount safety: mic release
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec) {
        try {
          rec.mr.stop();
        } catch {
          /* ignore */
        }
        rec.stream.getTracks().forEach((t) => t.stop());
      }
      if (recTimer.current) clearInterval(recTimer.current);
      if (levelTimer.current) clearInterval(levelTimer.current);
    };
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroup = chat?.type === "group";
  const gb = me?.settings.gb;
  const fontScale = me?.settings.chat.fontSize || 15;

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(searchQ.toLowerCase()));
  }, [messages, searchQ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingInfo?.userId, chatId]);

  useEffect(() => {
    // data reload only — view push already happened in openChat
    useGB.getState().loadChatData(chatId);
  }, [chatId]);

  const emitTyping = (isTyping: boolean) => {
    if (gb?.hideTyping) return;
    try {
      const sock = (window as unknown as { __gbSocket?: { emit: (e: string, d: unknown) => void } }).__gbSocket;
      sock?.emit("typing", { chatId, isTyping, name: me?.name });
    } catch {
      /* ignore */
    }
  };

  const onTextChange = (v: string) => {
    setText(v);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (v) {
      emitTyping(true);
      typingTimer.current = setTimeout(() => emitTyping(false), 2500);
    } else {
      emitTyping(false);
    }
  };

  const send = async (content: string, type = "text", extra: Record<string, unknown> = {}) => {
    const payload = {
      content,
      type,
      replyToId: replying?.id,
      // real device clock + timezone — so the Bot's /time and /date match THIS device
      clientTime: Date.now(),
      tzOffset: new Date().getTimezoneOffset(),
      ...extra,
    };
    setText("");
    setReplying(null);
    setShowEmoji(false);
    emitTyping(false);
    try {
      const res = await api<{ message: ChatMessage }>(`/api/chats/${chatId}/messages`, {
        method: "POST",
        body: payload,
      });
      useGB.getState().appendMessage(res.message, { active: true });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const sendScheduled = async (mins: number) => {
    if (!scheduleText.trim()) return;
    try {
      await api(`/api/chats/${chatId}/messages`, {
        method: "POST",
        body: { content: scheduleText.trim(), type: "text", scheduleMs: mins * 60 * 1000 },
      });
      toast(`Message scheduled ⏰ will be sent in ${mins} min`);
      setScheduleOpen(false);
      setScheduleText("");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  /** device se real file upload kar ke bhejo (photo/video/document/audio) */
  const uploadAndSend = async (file: File, kind: "auto" | "document" | "audio") => {
    let type = "image";
    if (kind === "document") type = "document";
    else if (kind === "audio") type = "audio";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("image/")) type = "image";
    else type = "document";

    setUploading(`Uploading ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiForm<{ url: string; name: string; size: number }>("/api/upload", fd);
      const ext = (file.name.split(".").pop() || "").toUpperCase().slice(0, 5);
      await send(
        "",
        type,
        type === "document"
          ? { mediaSeed: res.url, mediaName: res.name, mediaMeta: `${ext} • ${formatBytes(res.size)}` }
          : { mediaSeed: res.url, mediaName: res.name, mediaMeta: formatBytes(res.size) }
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(null);
    }
  };

  const deleteChat = async () => {
    try {
      setDeleting(true);
      await api(`/api/chats/${chatId}`, { method: "DELETE" });
      setConfirmDelete(false);
      useGB.getState().refreshChats();
      toast("Chat deleted 🗑️");
      closeChat();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const clearChat = async () => {
    try {
      setDeleting(true);
      await api(`/api/chats/${chatId}`, { method: "POST" });
      useGB.setState((s) => ({
        messagesByChat: { ...s.messagesByChat, [chatId]: [] },
      }));
      setConfirmClear(false);
      await useGB.getState().refreshChats();
      toast("Chat cleared 🧹");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const onAction = async (action: string, m: ChatMessage) => {
    switch (action) {
      case "reply":
        setReplying(m);
        inputRef.current?.focus();
        break;
      case "forward":
        setForwarding(m);
        break;
      case "copy":
        try {
          await navigator.clipboard.writeText(m.content);
          toast("Copied ✅");
        } catch {
          toast("Couldn't copy", "error");
        }
        break;
      case "star":
        try {
          await api(`/api/messages/${m.id}`, { method: "PUT", body: { starred: !m.starred } });
          useGB.setState((s) => ({
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: (s.messagesByChat[chatId] || []).map((x) =>
                x.id === m.id ? { ...x, starred: !x.starred } : x
              ),
            },
          }));
          toast(m.starred ? "Removed from starred" : "Starred ⭐");
        } catch {
          toast("Action failed", "error");
        }
        break;
      case "delme":
        try {
          await api(`/api/messages/${m.id}?scope=me`, { method: "DELETE" });
          useGB.setState((s) => ({
            messagesByChat: {
              ...s.messagesByChat,
              [chatId]: (s.messagesByChat[chatId] || []).filter((x) => x.id !== m.id),
            },
          }));
        } catch {
          toast("Couldn't delete", "error");
        }
        break;
      case "deleveryone":
        try {
          await api(`/api/messages/${m.id}?scope=everyone`, { method: "DELETE" });
        } catch (e) {
          toast((e as Error).message, "error");
        }
        break;
    }
  };

  const attachItems = [
    {
      icon: <ImageIcon size={21} className="text-white" />,
      bg: "#7f66ff",
      label: "Gallery",
      sub: "Photo/Video",
      act: () => {
        setAttachOpen(false);
        pickFile("image/*,video/*", (f) => void uploadAndSend(f, "auto"));
      },
    },
    {
      icon: <FileText size={21} className="text-white" />,
      bg: "#5f66cd",
      label: "Document",
      sub: "From device",
      act: () => {
        setAttachOpen(false);
        pickFile("*/*", (f) => void uploadAndSend(f, "document"));
      },
    },
    {
      icon: <Mic size={21} className="text-white" />,
      bg: "#c86b85",
      label: "Audio",
      sub: "Music/File",
      act: () => {
        setAttachOpen(false);
        pickFile("audio/*", (f) => void uploadAndSend(f, "audio"));
      },
    },
    {
      icon: <MapPin size={21} className="text-white" />,
      bg: "#1fa855",
      label: "Location",
      act: () => {
        setAttachOpen(false);
        send("Current location", "location", { mediaSeed: "loc" });
      },
    },
    {
      icon: <UserIcon size={21} className="text-white" />,
      bg: "#0796a1",
      label: "Contact",
      act: () => {
        setAttachOpen(false);
        send(`${chat?.otherUser?.name || "Contact"} — @${chat?.otherUser?.username || "user"}`, "contact", { mediaSeed: "contact" });
      },
    },
    {
      icon: <Clapperboard size={21} className="text-white" />,
      bg: "#0e7490",
      label: "GIF",
      sub: "GIPHY",
      act: () => {
        setAttachOpen(false);
        setGifOpen(true);
      },
    },
    {
      icon: <Timer size={21} className="text-white" />,
      bg: "#e5a712",
      label: "Schedule",
      act: () => {
        setAttachOpen(false);
        setScheduleOpen(true);
      },
    },
  ];

  const dayGroups: { label: string; items: ChatMessage[] }[] = [];
  for (const m of filtered) {
    const label = formatDayLabel(m.createdAt);
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else dayGroups.push({ label, items: [m] });
  }

  const other = chat?.otherUser;
  const subtitle = isGroup
    ? chat?.participants?.map((p) => (p.id === me?.id ? "You" : p.name.split(" ")[0])).join(", ")
    : typingInfo
      ? "typing..."
      : other
        ? other.isBot
          ? "online"
          : online.has(other.id)
            ? "online"
            : lastSeenText(other.isOnline, lastSeenBy[other.id] || other.lastSeen)
        : "";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <ScreenHeader
        onBack={closeChat}
        avatar={
          <button onClick={() => pushView({ name: "contactinfo", chatId })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <GbAvatar
              name={isGroup ? chat?.emoji || "👥" : chat?.name || "?"}
              color={chat?.color || "0ea47a"}
              emoji={isGroup ? chat?.emoji : other?.avatarEmoji}
              url={isGroup ? undefined : other?.avatarUrl}
              size={40}
              online={!isGroup && !!other && online.has(other.id)}
            />
            <div className="min-w-0">
              <div className="text-white font-medium truncate leading-tight">{chat?.name}</div>
              <div className={`text-[12px] truncate leading-tight ${typingInfo ? "text-[#53bdeb] font-medium" : "text-white/75"}`}>
                {subtitle}
              </div>
            </div>
          </button>
        }
        right={
          searchMode ? (
            <div className="flex items-center flex-1 h-9 bg-white/15 rounded-full px-3 gap-2">
              <Search size={15} className="text-white/80" />
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 min-w-0 bg-transparent text-white text-[14px] outline-none placeholder:text-white/60"
              />
              <button
                onClick={() => {
                  setSearchMode(false);
                  setSearchQ("");
                }}
                aria-label="close search"
              >
                <X size={17} className="text-white" />
              </button>
            </div>
          ) : (
            <>
              <HeaderIcon label="video call" onClick={() => startCall(true)}>
                <Video size={21} />
              </HeaderIcon>
              <HeaderIcon label="voice call" onClick={() => startCall(false)}>
                <Phone size={19} />
              </HeaderIcon>
              <HeaderIcon label="search" onClick={() => setSearchMode(true)}>
                <Search size={19} />
              </HeaderIcon>
              <div className="relative">
                <HeaderIcon label="menu" onClick={() => setMenuOpen(!menuOpen)}>
                  <MoreVertical size={20} />
                </HeaderIcon>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-1 top-10 z-40 w-56 rounded-lg shadow-2xl overflow-hidden bg-[var(--gb-panel)] border border-[var(--gb-border)] py-1 text-[15px] text-[var(--gb-text)]">
                      {[
                        { label: "View contact", act: () => pushView({ name: "contactinfo", chatId }) },
                        { label: "Search", act: () => setSearchMode(true) },
                        {
                          label: chat?.muted ? "Unmute notifications" : "Mute notifications",
                          act: async () => {
                            await api(`/api/chats/${chatId}/archive`, { method: "POST", body: { muted: !chat?.muted } });
                            useGB.getState().refreshChats();
                            toast(chat?.muted ? "Unmuted 🔔" : "Muted 🔕");
                          },
                        },
                        {
                          label: chat?.pinned ? "Unpin chat" : "Pin chat",
                          act: async () => {
                            await api(`/api/chats/${chatId}/archive`, { method: "POST", body: { pinned: !chat?.pinned } });
                            useGB.getState().refreshChats();
                            toast(chat?.pinned ? "Unpinned" : "Pinned 📌");
                          },
                        },
                        {
                          label: chat?.archived ? "Unarchive" : "Archive chat",
                          act: async () => {
                            await api(`/api/chats/${chatId}/archive`, { method: "POST", body: { archived: !chat?.archived } });
                            useGB.getState().refreshChats();
                            toast(chat?.archived ? "Unarchived" : "Archived 📥");
                            if (!chat?.archived) closeChat();
                          },
                        },
                        { label: "Clear chat", act: () => setConfirmClear(true) },
                        { label: "Delete chat", act: () => setConfirmDelete(true), danger: true },
                      ].map((i) => (
                        <button
                          key={i.label}
                          onClick={() => {
                            setMenuOpen(false);
                            i.act();
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-[var(--gb-panel-2)] ${
                            (i as { danger?: boolean }).danger ? "text-red-500" : ""
                          }`}
                        >
                          {i.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )
        }
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative py-2" style={wallpaperStyle(me?.settings)}>
        {searchQ && (
          <div className="mx-3 mb-2 text-center text-[12px] px-3 py-1.5 rounded-full bg-[var(--gb-panel)] text-[var(--gb-text-2)] inline-block relative left-1/2 -translate-x-1/2">
            {filtered.length} results for &quot;{searchQ}&quot;
          </div>
        )}
        {dayGroups.map((g) => (
          <div key={g.label}>
            <div className="flex justify-center my-2 sticky top-1 z-10">
              <span className="text-[11.5px] font-medium text-[var(--gb-text-2)] bg-[var(--gb-panel)] px-3 py-1 rounded-lg shadow-sm">
                {g.label}
              </span>
            </div>
            {g.items.map((m) => (
              <Bubble
                key={m.id}
                msg={m}
                mine={m.senderId === me?.id}
                isGroup={isGroup}
                onAction={onAction}
                antiRevoke={!!gb?.antiRevoke}
                fontScale={fontScale}
              />
            ))}
          </div>
        ))}
        {typingInfo && (
          <div className="flex px-3 mb-2">
            <div className="rounded-full px-3.5 py-2.5 shadow-sm flex gap-1 items-center" style={{ background: "var(--gb-bubble-in)" }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[var(--gb-text-2)] animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replying && (
        <div className="px-2 pt-1.5" style={{ background: "var(--gb-panel)" }}>
          <div className="rounded-lg p-2 flex items-start gap-2" style={{ background: "var(--gb-panel-2)" }}>
            <div className="flex-1 min-w-0 border-l-4 border-[var(--gb-accent)] pl-2">
              <div className="text-[12.5px] font-semibold text-[var(--gb-accent)]">
                {replying.senderId === me?.id ? "You" : replying.sender.name}
              </div>
              <div className="text-[13px] text-[var(--gb-text-2)] truncate">
                {replying.type !== "text" ? mediaTypeLabel(replying.type) : replying.content}
              </div>
            </div>
            <button onClick={() => setReplying(null)} aria-label="cancel reply" className="p-1 text-[var(--gb-text-2)]">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Emoji panel */}
      {showEmoji && <EmojiPicker onPick={(e) => setText((t) => t + e)} onClose={() => setShowEmoji(false)} />}

      {/* GIPHY GIF picker */}
      {gifOpen && (
        <GifPicker
          onPick={(g) => {
            setGifOpen(false);
            void send(g.page || "GIF", "gif", { mediaSeed: g.url, mediaName: "GIF" });
          }}
          onClose={() => setGifOpen(false)}
        />
      )}

      {/* Input bar — replaced by the RECORDING bar while recording a voice note */}
      {recording ? (
        <div className="flex items-center gap-2 px-2 py-1.5 pb-2" style={{ background: "var(--gb-panel)" }}>
          <button
            onClick={() => void stopRecording(false)}
            aria-label="cancel recording"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white bg-red-500 hover:bg-red-600 shrink-0 transition-colors"
          >
            <Trash2 size={19} />
          </button>
          <div
            className="flex-1 flex items-center gap-2.5 rounded-3xl px-4 py-2.5"
            style={{ background: "var(--gb-panel-2)" }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[14.5px] font-semibold text-[var(--gb-text)]" dir="ltr">
              {formatDuration(recSec)}
            </span>
            <span className="flex-1 text-[13px] text-[var(--gb-text-2)] truncate">Recording voice...</span>
            <span className="flex items-end gap-[2px] h-4 shrink-0">
              {[0, 1, 2, 3, 4].map((i) => {
                // REAL mic loudness — bars collapse when the mic picks up silence
                const h = 3 + Math.max(0.06, recLevel * (1 - i * 0.16)) * 13;
                return (
                  <span
                    key={i}
                    className="w-[3px] rounded-full transition-[height] duration-100"
                    style={{
                      height: `${h}px`,
                      background: "var(--gb-accent)",
                    }}
                  />
                );
              })}
            </span>
          </div>
          <button
            onClick={() => void stopRecording(true)}
            disabled={uploading !== null}
            aria-label="send voice note"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: "var(--gb-accent)" }}
          >
            <Send size={19} />
          </button>
        </div>
      ) : (
      <div className="flex items-end gap-1.5 px-2 py-1.5 pb-2" style={{ background: "var(--gb-panel)" }}>
        <div className="flex-1 flex items-end rounded-3xl px-2 py-1.5 gap-1" style={{ background: "var(--gb-panel-2)" }}>
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            aria-label="emoji"
            className="p-1.5 text-[var(--gb-text-2)] hover:text-[var(--gb-accent)] transition-colors"
          >
            <Smile size={23} />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && me?.settings.chat.enterToSend) {
                e.preventDefault();
                if (text.trim()) send(text.trim());
              }
            }}
            rows={1}
            placeholder="Message"
            className="flex-1 max-h-24 resize-none bg-transparent outline-none text-[15.5px] text-[var(--gb-text)] py-1 placeholder:text-[var(--gb-text-2)] leading-snug"
          />
          <button
            onClick={() => {
              setShowEmoji(false);
              setGifOpen(!gifOpen);
            }}
            aria-label="GIF picker"
            className={`p-1.5 transition-colors ${gifOpen ? "text-[var(--gb-accent)]" : "text-[var(--gb-text-2)] hover:text-[var(--gb-accent)]"}`}
          >
            <Clapperboard size={21} />
          </button>
          <button
            onClick={() => setAttachOpen(!attachOpen)}
            aria-label="attach"
            className="p-1.5 text-[var(--gb-text-2)] hover:text-[var(--gb-accent)] transition-colors"
          >
            <Paperclip size={22} />
          </button>
          {!text && (
            <button
              onClick={() => void startRecording()}
              aria-label="record voice note"
              className="p-1.5 text-[var(--gb-text-2)] hover:text-[var(--gb-accent)] transition-colors"
            >
              <Mic size={22} />
            </button>
          )}
        </div>
        <button
          onClick={() => {
            if (text.trim()) send(text.trim());
            else void startRecording();
          }}
          aria-label={text.trim() ? "send" : "record voice note"}
          className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0 shadow-md hover:scale-105 active:scale-95 transition-transform"
          style={{ background: "var(--gb-accent)" }}
        >
          {text.trim() ? <Send size={19} /> : <Mic size={20} />}
        </button>
      </div>
      )}

      {/* Attach menu */}
      {attachOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAttachOpen(false)} />
          <div className="absolute bottom-20 left-3 z-30 grid grid-cols-3 gap-x-3 gap-y-4 p-4 rounded-2xl shadow-2xl bg-[var(--gb-panel)] border border-[var(--gb-border)]">
            {attachItems.map((it) => (
              <button key={it.label} onClick={it.act} className="flex flex-col items-center gap-1.5 w-20">
                <span className="w-12 h-12 rounded-full flex items-center justify-center shadow" style={{ background: it.bg }}>
                  {it.icon}
                </span>
                <span className="text-[12px] text-[var(--gb-text)] leading-tight">{it.label}</span>
                {(it as { sub?: string }).sub && (
                  <span className="text-[10px] text-[var(--gb-text-2)] -mt-1">{(it as { sub?: string }).sub}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Schedule dialog */}
      {scheduleOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setScheduleOpen(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <Timer size={20} className="text-[var(--gb-accent)]" />
              <h3 className="font-semibold text-[var(--gb-text)]">Schedule message</h3>
            </div>
            <textarea
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              rows={3}
              placeholder="Type a message..."
              className="w-full rounded-lg p-2.5 text-[14px] outline-none resize-none border border-[var(--gb-border)] bg-[var(--gb-panel-2)] text-[var(--gb-text)]"
            />
            <div className="flex gap-2 mt-3">
              {[1, 5, 30].map((m) => (
                <button
                  key={m}
                  onClick={() => sendScheduled(m)}
                  className="flex-1 h-10 rounded-full text-[13px] font-medium text-white"
                  style={{ background: "var(--gb-accent)" }}
                >
                  +{m} min
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full px-4 py-2 shadow-lg text-[13px] text-white bg-black/80">
          <Loader2 size={15} className="animate-spin" />
          {uploading}
        </div>
      )}

      {/* Delete chat confirm dialog */}
      {confirmDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !deleting && setConfirmDelete(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </span>
              <h3 className="font-semibold text-[16px] text-[var(--gb-text)]">Delete chat?</h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed mb-4">
              <b className="text-[var(--gb-text)]">{chat?.name}</b> will be deleted forever along with all its messages. Are you sure you want to delete?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
              >
                CANCEL
              </button>
              <button
                onClick={deleteChat}
                disabled={deleting}
                className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60"
              >
                {deleting ? "DELETING..." : "DELETE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear chat confirm dialog */}
      {confirmClear && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6" onClick={() => !deleting && setConfirmClear(false)}>
          <div
            className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
                <Eraser size={18} className="text-amber-500" />
              </span>
              <h3 className="font-semibold text-[16px] text-[var(--gb-text)]">Clear chat?</h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed mb-4">
              All messages in <b className="text-[var(--gb-text)]">{chat?.name}</b> will be removed. The chat will stay in your list.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                disabled={deleting}
                className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]"
              >
                CANCEL
              </button>
              <button
                onClick={clearChat}
                disabled={deleting}
                className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60"
              >
                {deleting ? "CLEARING..." : "CLEAR"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ForwardDialog />
    </div>
  );

  function startCall(video: boolean) {
    if (!other && !isGroup) return;
    if (isGroup) {
      toast("Group calls are coming soon 👥");
      return;
    }
    if (!other) return;
    // REAL call: WebRTC ringing on the other phone, timer starts only after answer.
    // Bot calls stay a friendly demo call. Logging happens at call end.
    startCallRtc(other, video);
  }
}
