"use client";

/** GB Chat — calls tab, dialpad & simulated call overlay (original implementation) */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  Video,
  MoreVertical,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VideoOff,
  Grid3x3,
  Delete,
  Trash2,
  SwitchCamera,
} from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api, formatDuration, formatListTime } from "@/lib/gb-api";
import { startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCam, switchCam, activeSeconds } from "@/lib/calls";
import type { CallEntry } from "@/lib/gb-types";
import { GbAvatar, ScreenHeader, HeaderIcon } from "@/components/gb/ui-bits";

export function CallsScreen() {
  const calls = useGB((s) => s.calls);
  const refreshCalls = useGB((s) => s.refreshCalls);
  const setDialpad = useGB((s) => s.setDialpad);
  const toast = useGB((s) => s.toast);

  // WhatsApp-style history management: header menu + long-press delete
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CallEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    refreshCalls();
  }, [refreshCalls]);

  const startPress = (c: CallEntry) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      if (navigator.vibrate) navigator.vibrate(35);
      setConfirmDelete(c);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const deleteOne = async () => {
    const c = confirmDelete;
    setConfirmDelete(null);
    if (!c) return;
    try {
      await api(`/api/calls/${c.id}`, { method: "DELETE" });
      await refreshCalls();
      toast("Call log deleted 🗑️");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    setMenuOpen(false);
    try {
      const r = await api<{ cleared: number }>("/api/calls", { method: "DELETE" });
      await refreshCalls();
      toast(r.cleared > 0 ? "Call history cleared 🧹" : "Call history is already empty");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-[var(--gb-bg)]"
      onClick={() => menuOpen && setMenuOpen(false)}
    >
      <ScreenHeader
        title="Calls"
        right={
          <HeaderIcon
            label="menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={20} />
          </HeaderIcon>
        }
      />

      {/* header dropdown — like WhatsApp's clear-history menu */}
      {menuOpen && (
        <div
          className="absolute right-3 top-14 z-40 w-56 rounded-lg overflow-hidden shadow-2xl border border-[var(--gb-border)]"
          style={{ background: "var(--gb-panel-2)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              setConfirmClear(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--gb-border)] text-left"
          >
            <Trash2 size={18} className="text-red-500" />
            <span className="text-[14.5px] text-[var(--gb-text)]">Clear call history</span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {calls.length === 0 && (
          <div className="p-10 text-center text-[var(--gb-text-2)] text-sm">
            No call history yet. Start a call from the dialpad! 📞
          </div>
        )}
        {calls.map((c) => {
          // WhatsApp mapping: an incoming row with zero duration = missed call
          const missed = c.outcome === "missed" || (!c.outgoing && c.duration === 0);
          const Icon = missed ? PhoneMissed : c.outgoing ? PhoneOutgoing : PhoneIncoming;
          return (
            <div
              key={c.id}
              className="w-full flex items-center gap-3.5 px-4 py-2.5 hover:bg-[var(--gb-panel-2)] transition-colors select-none"
              onPointerDown={() => startPress(c)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerMove={cancelPress}
              onContextMenu={(e) => {
                e.preventDefault();
                setConfirmDelete(c);
              }}
              title="Long-press to delete this call log"
            >
              <GbAvatar name={c.other.name} color={c.other.avatarColor} emoji={c.other.avatarEmoji} url={c.other.avatarUrl} size={47} online={c.other.isOnline} />
              <div className="flex-1 min-w-0">
                <div className={`text-[16px] font-medium truncate ${missed ? "text-red-500" : "text-[var(--gb-text)]"}`}>
                  {c.other.name}
                </div>
                <div className="text-[13px] text-[var(--gb-text-2)] flex items-center gap-1">
                  <Icon size={13} className={missed ? "text-red-500" : "text-[var(--gb-accent)]"} />
                  {c.outgoing ? "Outgoing" : missed ? "Missed" : "Incoming"}
                  {c.duration > 0 ? ` • ${formatDuration(c.duration)}` : ""} • {formatListTime(c.createdAt)}
                </div>
              </div>
              <button
                onClick={() => {
                  if (longPressed.current) return; // long-press se click na chale
                  startCall(c.other, false);
                }}
                aria-label={`call ${c.other.name}`}
                className="p-2 rounded-full text-white"
                style={{ background: "var(--gb-accent)" }}
              >
                <Phone size={17} />
              </button>
            </div>
          );
        })}
        {calls.length > 0 && (
          <p className="px-5 py-4 text-[11.5px] text-[var(--gb-text-2)] text-center">
            Long-press any call to delete it — or menu → Clear call history.
          </p>
        )}
      </div>

      <button
        onClick={() => setDialpad(true)}
        aria-label="dialpad"
        className="absolute bottom-[76px] right-4 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform z-10"
        style={{ background: "var(--gb-accent)" }}
      >
        <Grid3x3 size={22} />
      </button>

      {/* delete one dialog */}
      {confirmDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-500" />
              <h3 className="font-semibold text-[var(--gb-text)]">Delete call log?</h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed">
              This call entry ({confirmDelete.other.name}) will be removed from your history.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmDelete(null)} className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]">
                CANCEL
              </button>
              <button onClick={deleteOne} className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600">
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* clear all dialog */}
      {confirmClear && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setConfirmClear(false)}>
          <div className="w-full max-w-[320px] rounded-2xl p-5 bg-[var(--gb-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-500" />
              <h3 className="font-semibold text-[var(--gb-text)]">Clear call history?</h3>
            </div>
            <p className="text-[13.5px] text-[var(--gb-text-2)] leading-relaxed">
              All {calls.length} call entries will be removed from your history. This can't be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirmClear(false)} className="px-4 h-9 rounded-full text-[13px] font-medium text-[var(--gb-accent)] hover:bg-[var(--gb-panel-2)]">
                CANCEL
              </button>
              <button onClick={clearAll} className="px-5 h-9 rounded-full text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600">
                CLEAR ALL
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialpad />
      {/* NOTE: CallOverlay is mounted ONCE globally in AppShell — do NOT add it here
          again; a second mount stacked a duplicate fullscreen overlay on the Calls tab
          (double remote audio + doubled video elements). */}
    </div>
  );
}

/* ---------------- Dialpad ---------------- */
const KEYS = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

export function Dialpad() {
  const open = useGB((s) => s.dialpadOpen);
  const setDialpad = useGB((s) => s.setDialpad);
  const toast = useGB((s) => s.toast);
  const [num, setNum] = useState("");

  const call = () => {
    if (num.length < 3) return toast("Enter a number", "error");
    setDialpad(false);
    startCall(
      {
        id: `dial-${num}`,
        name: num,
        username: "unknown",
        about: "",
        avatarColor: "607d8b",
        avatarEmoji: "",
        isBot: false,
        isOnline: false,
        lastSeen: new Date().toISOString(),
      },
      false
    );
    setNum("");
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--gb-panel)]" onClick={() => setDialpad(false)}>
      <div className="h-14 flex items-center px-3" style={{ background: "var(--gb-header)" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDialpad(false);
          }}
          className="p-1.5 rounded-full hover:bg-white/10 text-white"
          aria-label="close dialpad"
        >
          <Delete size={22} className="rotate-180" />
        </button>
        <div className="ml-3 text-white font-medium">Dial pad</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-end pb-2" onClick={(e) => e.stopPropagation()}>
        <div className="text-[30px] font-light text-[var(--gb-text)] tracking-widest min-h-[40px]">{num}</div>
        <div className="text-[12px] text-[var(--gb-text-2)] mb-3">
          {num ? "Tap the button below to call" : "Enter a number"}
        </div>
        <div className="grid grid-cols-3 gap-x-7 gap-y-2">
          {KEYS.map(([k, sub]) => (
            <button
              key={k}
              onClick={() => setNum((n) => (n + k).slice(0, 15))}
              className="w-14 h-14 rounded-full bg-[var(--gb-panel-2)] hover:bg-[var(--gb-border)] transition-colors flex flex-col items-center justify-center"
            >
              <span className="text-[22px] font-medium text-[var(--gb-text)] leading-none">{k}</span>
              {sub && <span className="text-[9px] tracking-[2px] text-[var(--gb-text-2)] mt-0.5">{sub}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-6 mt-4">
          <div className="w-12" />
          <button
            onClick={call}
            aria-label="call"
            className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform"
            style={{ background: "var(--gb-accent)" }}
          >
            <Phone size={22} />
          </button>
          <button
            onClick={() => setNum((n) => n.slice(0, -1))}
            aria-label="backspace"
            className="w-12 h-12 rounded-full flex items-center justify-center text-[var(--gb-text-2)] hover:bg-[var(--gb-panel-2)]"
          >
            <Delete size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Live call overlay — REAL WebRTC calls + simulated bot/dialpad ---------------- */
export function CallOverlay() {
  const activeCall = useGB((s) => s.activeCall);
  if (!activeCall) return null;
  return <CallOverlayInner key={activeCall.callId} call={activeCall} />;
}

function CallOverlayInner({
  call,
}: {
  call: NonNullable<ReturnType<typeof useGB.getState>["activeCall"]>;
}) {
  const [secs, setSecs] = useState(0);
  const [speaker, setSpeaker] = useState(false);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  // data-saver (relay) video: peer camera frames arrive as JPEG blobs on the socket
  const relayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef(0);
  const [relayHasVideo, setRelayHasVideo] = useState(false);

  /* ⏱️ THE TIMER FIX: the counter polls the call manager's active clock, which only
     starts AFTER the call is answered & connected. Ringing shows "Ringing…", never a timer. */
  useEffect(() => {
    const timer = setInterval(() => {
      if (call.phase === "active") setSecs(activeSeconds());
    }, 400);
    return () => clearInterval(timer);
  }, [call.phase]);

  /* attach media streams + force-play them (autoplay policies, iOS quirks, …) */
  useEffect(() => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    const forcePlay = (el: HTMLMediaElement | null) => {
      if (!el) return;
      const tryPlay = () => el.play().catch(() => {});
      tryPlay();
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        if (el.paused && tries < 40) tryPlay();
        else clearInterval(t);
      }, 500);
      intervals.push(t);
      const retryOnTap = () => tryPlay();
      window.addEventListener("pointerdown", retryOnTap, { once: true });
    };

    // fullscreen video: the PEER's camera — or, for sim demo calls, our own camera
    const remoteSrc =
      call.role === "sim" && !call.remoteStream ? call.localStream : call.remoteStream;
    if (remoteVideoRef.current && remoteSrc) {
      if (remoteVideoRef.current.srcObject !== remoteSrc) {
        remoteVideoRef.current.srcObject = remoteSrc;
      }
      forcePlay(remoteVideoRef.current);
    }
    // voice calls: sound rides on a hidden <audio> element
    if (remoteAudioRef.current && call.remoteStream) {
      if (remoteAudioRef.current.srcObject !== call.remoteStream) {
        remoteAudioRef.current.srcObject = call.remoteStream;
      }
      forcePlay(remoteAudioRef.current);
    }
    // local PIP
    if (localVideoRef.current && call.localStream) {
      if (localVideoRef.current.srcObject !== call.localStream) {
        localVideoRef.current.srcObject = call.localStream;
      }
      forcePlay(localVideoRef.current);
    }
    return () => intervals.forEach(clearInterval);
  }, [call.remoteStream, call.localStream, call.video, call.phase, call.role, call.relayMode]);

  /* data-saver video: draw the peer's relayed JPEG frames onto a fullscreen canvas */
  useEffect(() => {
    let alive = true;
    let bmp: ImageBitmap | null = null;
    const draw = async (buf: ArrayBuffer) => {
      // mark liveness FIRST — the canvas only mounts once frames are flowing
      // (it renders after relayHasVideo flips true, so the ref is still null
      // for the first ~0.4s; dropping those frames is fine, the stall is not)
      lastFrameRef.current = Date.now();
      const canvas = relayCanvasRef.current;
      if (!canvas || !alive) return;
      try {
        const blob = new Blob([buf], { type: "image/jpeg" });
        bmp = await createImageBitmap(blob);
        if (!alive) {
          bmp.close();
          return;
        }
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const g = canvas.getContext("2d");
        if (g) g.drawImage(bmp, 0, 0);
        bmp.close();
        bmp = null;
      } catch {
        /* skip a bad frame */
      }
    };
    const onFrame = (e: Event) => {
      if (!call.relayMode || !call.video) return;
      void draw((e as CustomEvent).detail as ArrayBuffer);
    };
    const onActive = () => {
      if (call.relayMode && call.video) lastFrameRef.current = Date.now();
    };
    window.addEventListener("gb-relay-frame", onFrame);
    window.addEventListener("gb-relay-video", onActive);
    // flip the canvas visibility only when frames start/stop (camera off, peer asleep…)
    const iv = setInterval(() => {
      const has =
        !!call.relayMode && !!call.video && lastFrameRef.current > 0 && Date.now() - lastFrameRef.current < 2500;
      setRelayHasVideo((v) => (v === has ? v : has));
    }, 400);
    return () => {
      alive = false;
      window.removeEventListener("gb-relay-frame", onFrame);
      window.removeEventListener("gb-relay-video", onActive);
      clearInterval(iv);
      bmp?.close();
    };
  }, [call.relayMode, call.video, call.callId]);

  const statusText =
    call.phase === "ringing-in"
      ? call.video
        ? "Incoming video call..."
        : "Incoming voice call..."
      : call.phase === "ringing-out"
        ? call.role === "sim"
          ? "Calling..."
          : "Ringing..."
        : call.phase === "connecting"
          ? "Connecting..."
          : call.phase === "active"
            ? formatDuration(secs)
            : call.endedLabel || "Call ended";

  const inCallControls = call.phase === "ringing-out" || call.phase === "connecting" || call.phase === "active";

  // fullscreen remote video only when we actually HAVE media (never a black screen)
  const showVideoLayer =
    call.video &&
    call.phase !== "ended" &&
    !!(call.remoteStream || (call.role === "sim" && call.localStream));
  // low-network data-saver video (socket-relayed frames) — the peer's picture on ANY network
  const showRelayVideo = !!call.relayMode && !!call.video && relayHasVideo && call.phase === "active";

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center overflow-hidden" style={{ background: "#0b1a20" }}>
      {/* video layer — real peer camera (or own camera preview for bot demo calls) */}
      {showVideoLayer && (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={call.role === "sim"}
            onCanPlay={() => remoteVideoRef.current?.play?.().catch(() => {})}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {call.role === "sim" && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 bg-black/40 rounded-3xl px-6 py-4 backdrop-blur-sm">
              <GbAvatar name={call.user.name} color={call.user.avatarColor} emoji={call.user.avatarEmoji} url={call.user.avatarUrl} size={64} />
              <span className="text-white/85 text-[12.5px]">{call.user.name} (demo preview)</span>
            </div>
          )}
          {/* local PIP */}
          {call.localStream && !call.camOff && (
            <div className="absolute top-4 right-4 w-28 h-40 rounded-xl overflow-hidden shadow-xl border border-white/25 z-10">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}
        </>
      )}

      {/* data-saver video layer — peer's camera frames via the socket relay */}
      {showRelayVideo && (
        <>
          <canvas
            ref={relayCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "cover" }}
          />
          {/* local PIP stays live here too */}
          {call.localStream && !call.camOff && (
            <div className="absolute top-4 right-4 w-28 h-40 rounded-xl overflow-hidden shadow-xl border border-white/25 z-10">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}
        </>
      )}

      {/* voice-call / connecting / relay layer */}
      {!showVideoLayer && !showRelayVideo && (
        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at 30% 20%, var(--gb-accent), transparent 60%)" }} />
      )}

      <div className={`relative z-10 flex-1 flex flex-col items-center justify-center gap-4 w-full ${showVideoLayer || showRelayVideo ? "hidden" : ""}`}>
        <div className={`relative ${call.phase.startsWith("ringing") ? "animate-pulse" : ""}`}>
          <GbAvatar name={call.user.name} color={call.user.avatarColor} emoji={call.user.avatarEmoji} url={call.user.avatarUrl} size={120} />
        </div>
        <h2 className="text-white text-[26px] font-medium mt-2 px-6 text-center">{call.user.name}</h2>
        <p className={`text-[15px] ${call.phase === "active" ? "text-white/90 tabular-nums" : "text-white/70"}`}>{statusText}</p>
        {call.relayMode && call.phase === "active" && (
          <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-1.5 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-white/85 text-[12px]">
              {call.video && relayHasVideo ? "Low connection — data-saver video" : "Low connection — voice mode"}
            </span>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="relative z-10 pb-10 w-full flex flex-col items-center gap-6">
        {/* incoming call: accept / reject */}
        {call.phase === "ringing-in" && (
          <div className="w-full flex items-center justify-around px-10">
            <button
              onClick={rejectCall}
              aria-label="decline call"
              className="flex flex-col items-center gap-2"
            >
              <span className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors">
                <PhoneOff size={26} />
              </span>
              <span className="text-white/80 text-[12px]">Decline</span>
            </button>
            <button
              onClick={acceptCall}
              aria-label="answer call"
              className="flex flex-col items-center gap-2"
            >
              <span
                className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform"
                style={{ background: "#25d366" }}
              >
                {call.video ? <Video size={24} /> : <Phone size={24} />}
              </span>
              <span className="text-white/80 text-[12px]">Answer</span>
            </button>
          </div>
        )}

        {/* in-call controls */}
        {inCallControls && (
          <div className="flex items-center gap-4 flex-wrap justify-center px-4">
            <CallBtn active={!!call.muted} onClick={toggleMute} label="mute">
              {call.muted ? <MicOff size={22} /> : <Mic size={22} />}
            </CallBtn>
            <CallBtn active={speaker} onClick={() => setSpeaker(!speaker)} label="speaker">
              <Volume2 size={22} />
            </CallBtn>
            {call.video && call.role !== "callee" && (
              <CallBtn active={false} onClick={() => void switchCam()} label="switch camera">
                <SwitchCamera size={22} />
              </CallBtn>
            )}
            {call.video && (
              <CallBtn active={!!call.camOff} onClick={toggleCam} label="camera">
                {call.camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </CallBtn>
            )}
            <button
              onClick={() => endCall()}
              aria-label="end call"
              className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors"
            >
              <PhoneOff size={26} />
            </button>
          </div>
        )}

        {/* ended: brief closing state */}
        {call.phase === "ended" && (
          <p className="text-white/60 text-[13px] mb-2">GB Chat</p>
        )}
      </div>

      {/* remote audio for voice calls (video calls play sound through the unmuted remote video) */}
      {!call.video && <audio ref={remoteAudioRef} autoPlay className="hidden" />}
    </div>
  );
}

function CallBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
        active ? "bg-white text-gray-900" : "bg-white/15 text-white hover:bg-white/25"
      }`}
    >
      {children}
    </button>
  );
}
