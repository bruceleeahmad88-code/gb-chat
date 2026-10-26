"use client";

/**
 * GB Chat — REAL user-to-user calls (voice + video) over WebRTC.
 * Signaling rides on the socket.io service (call:signal relay to user rooms).
 *
 * Round-11 fixes (user: "saamnay walay ki screen nazar nahi aati, awaz dono taraf
 * nahi aati, call thori dair baad khud cut ho jati hai"):
 *
 *  1. ROOT CAUSE — every TURN server in the old list was DEAD (openrelay.metered.ca
 *     timeouts, anyfirewall/express-turn/freeturn DNS dead). Without a relay, ICE
 *     fails across different networks → no audio, no video both ways, and the call
 *     ends with "Connection failed" shortly after starting. Replaced with a LIVE-VERIFIED
 *     set (scripts/test-turn.mjs allocates a relay on every entry below).
 *  2. AUTO-CUT — "disconnected" no longer kills the call after 4s. We attempt
 *     restartIce(), wait, retry — a call only dies after repeated real failures.
 *  3. NEVER-DROP-ICE — candidates arriving before the peer connection exists are
 *     queued instead of silently discarded (callee side race).
 *  4. VOICE RELAY FALLBACK — if media still can't connect (e.g. both sides behind
 *     UDP-blocking firewalls), the call does NOT die: 16 kHz PCM audio is relayed
 *     through the existing socket.io channel so the user at least always HEARS the
 *     other person ("Low connection — voice mode").
 *  5. Remote stream is accumulated into ONE persistent MediaStream (video + audio
 *     tracks survive renegotiation), and the overlay force-plays elements so
 *     autoplay policies can't mute the call.
 *
 * Timer still starts ONLY after the call is answered & media connected.
 */
import { useGB, type ActiveCall } from "@/lib/gb-store";
import type { PublicUser } from "@/lib/gb-types";
import { api } from "@/lib/gb-api";
import { ringtoneByKey } from "@/lib/ringtones";

/* Every entry verified live: STUN binding OK / TURN allocate (long-term creds) OK.
 * Do NOT re-add openrelay.metered.ca / turn.anyfirewall.com — both are dead. */
const RTC_CFG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:stun.cloudflare.com:3478"] },
    // UDP relay (fastest path when UDP is open)
    { urls: "turn:standard.relay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:standard.relay.metered.ca:3478", username: "openrelayproject", credential: "openrelayproject" },
    // TCP relay (networks that block UDP entirely — CGNAT, office/school WiFi).
    // TCP-reachability verified live (scripts/test-turn-tcp.mjs).
    { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:standard.relay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:eu.relay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
  iceCandidatePoolSize: 4,
};

const RING_TIMEOUT_MS = 40_000; // no answer → cancel
const MEDIA_CONNECT_TIMEOUT_MS = 12_000; // no media after this → voice relay fallback
const DISCONNECT_GRACE_MS = 10_000; // ICE disconnected → restart + grace before relay

type Ctx = {
  pc: RTCPeerConnection | null;
  local: MediaStream | null;
  remote: MediaStream | null;
  pendingIce: RTCIceCandidateInit[];
  remoteSet: boolean;
  timer: ReturnType<typeof setTimeout> | null; // ring timeout
  mediaWatch: ReturnType<typeof setTimeout> | null; // media-connect watchdog
  iceGrace: ReturnType<typeof setTimeout> | null; // disconnected/failed grace
  ringTone: ReturnType<typeof setInterval> | null;
  ringBucket: OscillatorNode[] | null;
  vibrate: ReturnType<typeof setInterval> | null;
  startedAt: number; // epoch ms when the call became active
  answered: boolean;
  ended: boolean;
  restarts: number;
  relay: Relay | null;
  peerId: string; // remote user id (for ICE-restart renegotiation)
  restartBusy: boolean; // an ICE-restart offer is already in flight
  // --- video frame relay (data-saver fallback) ---
  frameTimer: ReturnType<typeof setInterval> | null;
  frameVideo: HTMLVideoElement | null;
  frameCanvas: HTMLCanvasElement | null;
};

/* ---------------- voice-relay fallback (socket PCM) ---------------- */
type Relay = {
  ac: AudioContext;
  src: MediaStreamAudioSourceNode | null;
  spn: ScriptProcessorNode | null;
  sink: GainNode | null; // zero-gain sink so the processor runs (no echo)
  playGain: GainNode;
  playhead: number;
};

const RELAY_RATE = 16_000;

function relayCtx(): Relay | null {
  if (ctx.relay) return ctx.relay;
  const a = ac();
  if (!a) return null;
  const playGain = a.createGain();
  playGain.gain.value = 0.95;
  playGain.connect(a.destination);
  ctx.relay = { ac: a, src: null, spn: null, sink: null, playGain, playhead: 0 };
  return ctx.relay;
}

/** start sending our mic (16 kHz mono Int16 chunks over the socket) */
function relayStartSend(): void {
  const r = relayCtx();
  if (!r || !ctx.local || r.spn) return;
  try {
    const src = r.ac.createMediaStreamSource(ctx.local);
    const spn = r.ac.createScriptProcessor(4096, 1, 1);
    const sink = r.ac.createGain();
    sink.gain.value = 0; // silent sink — processor needs a destination, must not echo
    src.connect(spn);
    spn.connect(sink);
    sink.connect(r.ac.destination);
    const ratio = r.ac.sampleRate / RELAY_RATE;
    spn.onaudioprocess = (ev) => {
      const c = useGB.getState().activeCall;
      if (!c || c.phase === "ended" || !ctx.relay) return;
      const input = ev.inputBuffer.getChannelData(0);
      const outLen = Math.floor(input.length / ratio);
      const pcm = new Int16Array(outLen);
      const muted = c.muted || ctx.local?.getAudioTracks()[0]?.enabled === false;
      for (let i = 0; i < outLen; i++) {
        const pos = Math.min(input.length - 1, i * ratio);
        const base = Math.floor(pos);
        const frac = pos - base;
        const s = input[base] * (1 - frac) + input[base + 1 < input.length ? base + 1 : base] * frac;
        pcm[i] = muted ? 0 : Math.max(-1, Math.min(1, s)) * 32767;
      }
      sig(c.user.id, { t: "pcm", callId: c.callId, data: pcm.buffer });
    };
    r.src = src;
    r.spn = spn;
    r.sink = sink;
  } catch {
    /* relay send unavailable — receive still works */
  }
}

/** play a received PCM chunk with jitter-buffered scheduling */
function relayRecv(buf: ArrayBuffer): void {
  const r = relayCtx();
  if (!r) return;
  try {
    const pcm = new Int16Array(buf);
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
    const abuf = r.ac.createBuffer(1, f32.length, RELAY_RATE);
    abuf.copyToChannel(f32, 0);
    const src = r.ac.createBufferSource();
    src.buffer = abuf;
    src.connect(r.playGain);
    const now = r.ac.currentTime;
    // (re)prime the jitter buffer; if we fell behind, jump ahead instead of bursting
    if (!r.playhead || r.playhead < now + 0.05) r.playhead = now + 0.2;
    src.start(r.playhead);
    r.playhead += abuf.duration;
  } catch {
    /* ignore a bad chunk */
  }
}

function stopRelayVoice(): void {
  const r = ctx.relay;
  if (!r) return;
  try {
    if (r.spn) r.spn.onaudioprocess = null;
    r.src?.disconnect();
    r.spn?.disconnect();
    r.sink?.disconnect();
    r.playGain.disconnect();
  } catch {
    /* ignore */
  }
  ctx.relay = null;
}

/* ------------- video frame relay (data-saver fallback, ROUND 12) -------------
 * The old relay carried ONLY the mic audio, so on networks where ICE could not
 * connect the call kept the voice but the video NEVER appeared (the exact user
 * complaint: “dusre device par call par samne wale ka video nahi aata”).
 * Fix: capture our camera on a hidden canvas and push small JPEG frames through
 * the SAME socket channel the PCM audio uses. Both directions, ~8 fps, ≈20 KB per
 * frame — works on ANY network that can reach the socket server. */
const FRAME_W = 320;
const FRAME_INTERVAL_MS = 125; // ~8 fps
const FRAME_MAX_BYTES = 60_000;

function startVideoRelay(): void {
  const c = useGB.getState().activeCall;
  if (!c || !c.video || ctx.frameTimer) return;
  const track = ctx.local?.getVideoTracks()[0];
  if (!track) return;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    // MUST sit in the DOM (offscreen but "rendered") — a detached <video> can
    // stay at the 2x2 placeholder size forever in throttled/occluded tabs,
    // which previously produced useless 2×2 black frames
    video.style.cssText =
      "position:fixed;left:-20px;top:-20px;width:2px;height:2px;opacity:0.01;pointer-events:none;";
    video.srcObject = new MediaStream([track]);
    document.body.appendChild(video);
    void video.play().catch(() => {});
    const canvas = document.createElement("canvas");
    ctx.frameVideo = video;
    ctx.frameCanvas = canvas;
    window.dispatchEvent(new CustomEvent("gb-relay-video", { detail: { active: true } }));
    ctx.frameTimer = setInterval(() => {
      sendRelayFrame();
    }, FRAME_INTERVAL_MS);
  } catch {
    /* frame relay unavailable — voice relay still works */
  }
}

function sendRelayFrame(): void {
  const v = ctx.frameVideo;
  const canvas = ctx.frameCanvas;
  const c = useGB.getState().activeCall;
  if (!v || !canvas || !c || c.phase === "ended" || !ctx.relay) return;
  const track = ctx.local?.getVideoTracks()[0];
  if (!track || !track.enabled) return; // camera switched off — receiver shows the avatar
  // readyState ≥ 2 AND a real size — skip the 2×2 placeholder frames entirely
  if (v.readyState < 2 || !v.videoWidth || v.videoWidth < 8) return;
  try {
    const scale = Math.min(1, FRAME_W / v.videoWidth);
    canvas.width = Math.max(2, Math.round(v.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(v.videoHeight * scale));
    const g = canvas.getContext("2d");
    if (!g) return;
    g.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size > FRAME_MAX_BYTES) return;
        blob
          .arrayBuffer()
          .then((buf) => {
            const cur = useGB.getState().activeCall;
            if (!cur || cur.phase === "ended" || !ctx.relay) return;
            sig(cur.user.id, { t: "frame", callId: cur.callId, data: buf });
          })
          .catch(() => {});
      },
      "image/jpeg",
      0.42
    );
  } catch {
    /* skip a bad frame */
  }
}

function stopVideoRelay(): void {
  if (ctx.frameTimer) {
    clearInterval(ctx.frameTimer);
    ctx.frameTimer = null;
  }
  if (ctx.frameVideo) {
    try {
      ctx.frameVideo.srcObject = null;
      ctx.frameVideo.remove();
    } catch {
      /* ignore */
    }
  }
  ctx.frameVideo = null;
  ctx.frameCanvas = null;
  window.dispatchEvent(new CustomEvent("gb-relay-video", { detail: { active: false } }));
}

/** rebuild the media path with a REAL ICE-restart offer (restartIce() alone never
 *  fires an offer — the renegotiation was silently missing before) */
async function sendIceRestartOffer(): Promise<void> {
  const pc = ctx.pc;
  const c = useGB.getState().activeCall;
  if (!pc || !c || ctx.ended || ctx.restartBusy || !ctx.remoteSet) return;
  ctx.restartBusy = true;
  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    sig(c.user.id, { t: "offer", callId: c.callId, restart: true, sdp: pc.localDescription?.toJSON() });
  } catch {
    /* best effort — the relay fallback still protects the call */
  } finally {
    setTimeout(() => {
      ctx.restartBusy = false;
    }, 3000);
  }
}

/** switch this call into relay mode — audio (always) + camera frames (video calls)
 *  guaranteed through the socket, so the call NEVER dies on a bad network */
function enterRelay(signalPeer: boolean): void {
  const c = useGB.getState().activeCall;
  if (!c || ctx.ended || ctx.relay) return;
  if (c.role !== "caller" && c.role !== "callee") return;
  const s = sock();
  if (!s || !s.connected) {
    endCall("Connection lost");
    return;
  }
  if (signalPeer) sig(c.user.id, { t: "relay", callId: c.callId });
  stopRing();
  if (!ctx.startedAt) ctx.startedAt = Date.now();
  patchCall({ relayMode: true, phase: "active" });
  relayStartSend();
  if (c.video) startVideoRelay(); // data-saver video — both directions
  toast(
    c.video ? "Low connection — data-saver video mode" : "Low connection — switched to voice mode",
    "info"
  );
}

function clearWatchdogs(): void {
  if (ctx.mediaWatch) {
    clearTimeout(ctx.mediaWatch);
    ctx.mediaWatch = null;
  }
  if (ctx.iceGrace) {
    clearTimeout(ctx.iceGrace);
    ctx.iceGrace = null;
  }
}

/* ---------------- ringtones (unchanged engine) ---------------- */
const ctx: Ctx = {
  pc: null,
  local: null,
  remote: null,
  pendingIce: [],
  remoteSet: false,
  timer: null,
  mediaWatch: null,
  iceGrace: null,
  ringTone: null,
  ringBucket: null,
  vibrate: null,
  startedAt: 0,
  answered: false,
  ended: false,
  restarts: 0,
  relay: null,
  peerId: "",
  restartBusy: false,
  frameTimer: null,
  frameVideo: null,
  frameCanvas: null,
};

/* ---------------- audio: unlock + ringtones ---------------- */
let AC: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    if (!AC) {
      const W = window as unknown as {
        AudioContext?: new (ctx?: AudioContextOptions) => AudioContext;
        webkitAudioContext?: new (ctx?: AudioContextOptions) => AudioContext;
      };
      const Ctor = W.AudioContext || W.webkitAudioContext;
      AC = Ctor ? new Ctor() : null;
    }
    if (AC && AC.state === "suspended") void AC.resume();
    return AC;
  } catch {
    return null;
  }
}
/** browsers only allow sound after a user gesture — unlock eagerly on first tap */
if (typeof document !== "undefined") {
  const unlock = () => {
    ac();
    for (const ev of ["pointerdown", "touchend", "keydown"] as const) {
      document.removeEventListener(ev, unlock);
    }
  };
  for (const ev of ["pointerdown", "touchend", "keydown"] as const) {
    document.addEventListener(ev, unlock, { once: true });
  }
}

function beep(freq: number, dur: number, vol = 0.09, delay = 0) {
  const a = ac();
  if (!a) return;
  try {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime + delay);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + delay + 0.04);
    g.gain.setValueAtTime(vol, a.currentTime + delay + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, a.currentTime + delay + dur);
    osc.connect(g).connect(a.destination);
    osc.start(a.currentTime + delay);
    osc.stop(a.currentTime + delay + dur + 0.02);
  } catch {
    /* ignore */
  }
}

/* --- melody player (selectable ringtones) --- */
type Note = [number, number, number, number?];

function scheduleNotes(
  a: AudioContext,
  notes: Note[],
  wave: OscillatorType,
  vol: number,
  bucket: OscillatorNode[]
): void {
  for (const [freq, start, dur, mult] of notes) {
    try {
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      const peak = vol * (mult ?? 1);
      const t0 = a.currentTime + start;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
      g.gain.setValueAtTime(peak, t0 + Math.max(0.03, dur - 0.04));
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
      bucket.push(osc);
      osc.onended = () => {
        const i = bucket.indexOf(osc);
        if (i >= 0) bucket.splice(i, 1);
      };
    } catch {
      /* ignore */
    }
  }
}

function hardStop(bucket: OscillatorNode[]) {
  for (const o of bucket.splice(0)) {
    try {
      o.onended = null;
      o.stop(0);
    } catch {
      /* already stopped */
    }
  }
}

function startRing(kind: "in" | "out") {
  stopRing();
  const a = ac();
  if (!a) return;
  if (kind === "in") {
    // INCOMING → the user's SELECTED ringtone (Settings → Notifications → Ringtone),
    // looping WhatsApp-style + vibration
    const n = useGB.getState().me?.settings.notifications;
    const def = ringtoneByKey(n?.callRingtone);
    const bucket: OscillatorNode[] = [];
    const cycle = () => scheduleNotes(a, def.notes, def.wave, 0.24, bucket);
    cycle();
    ctx.ringTone = setInterval(cycle, def.period * 1000);
    ctx.ringBucket = bucket;
    if ((n?.callVibrate ?? true) && navigator.vibrate) {
      const vib = () => navigator.vibrate!([600, 450]);
      vib();
      ctx.vibrate = setInterval(vib, Math.min(2400, def.period * 1000));
    }
  } else {
    // OUTGOING → standard network ringback tone (like WhatsApp): one long beep every 3s
    const tone = () => beep(425, 1.2, 0.08);
    tone();
    ctx.ringTone = setInterval(tone, 3000);
  }
}

function stopRing() {
  if (ctx.ringTone) {
    clearInterval(ctx.ringTone);
    ctx.ringTone = null;
  }
  if (ctx.ringBucket) {
    hardStop(ctx.ringBucket);
    ctx.ringBucket = null;
  }
  if (ctx.vibrate) {
    clearInterval(ctx.vibrate);
    ctx.vibrate = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    /* ignore */
  }
}

/* --- ringtone preview (Settings → Notifications → Ringtone) --- */
let previewTimer: ReturnType<typeof setInterval> | null = null;
let previewBucket: OscillatorNode[] = [];

export function previewRingtone(key: string): void {
  stopRingtonePreview();
  const a = ac();
  if (!a) return;
  const def = ringtoneByKey(key);
  const cycle = () => scheduleNotes(a, def.notes, def.wave, 0.24, previewBucket);
  cycle();
  previewTimer = setInterval(cycle, def.period * 1000);
}

export function stopRingtonePreview(): void {
  if (previewTimer) {
    clearInterval(previewTimer);
    previewTimer = null;
  }
  hardStop(previewBucket);
}

/* ---------------- helpers ---------------- */
function sock(): {
  connected?: boolean;
  emit: (e: string, d: unknown) => void;
} | null {
  return (window as unknown as { __gbSocket?: { connected?: boolean; emit: (e: string, d: unknown) => void } })
    .__gbSocket ?? null;
}

function sig(to: string, payload: Record<string, unknown>) {
  const s = sock();
  if (!s || !s.connected) return false;
  s.emit("call:signal", { to, ...payload });
  return true;
}

function patchCall(p: Partial<ActiveCall>) {
  const cur = useGB.getState().activeCall;
  if (!cur) return;
  useGB.setState({ activeCall: { ...cur, ...p } });
}

function toast(text: string, kind: "info" | "error" = "info") {
  useGB.getState().toast(text, kind);
}

function miniUser(u: PublicUser | null): PublicUser | null {
  if (!u) return null;
  const { id, name, username, about, avatarColor, avatarEmoji, avatarUrl, isBot, isOnline, lastSeen, gbNumber } = u;
  return { id, name, username, about, avatarColor, avatarEmoji, avatarUrl, isBot, isOnline, lastSeen, gbNumber };
}

async function logCall(peerId: string, type: "audio" | "video", outcome: string, duration: number) {
  try {
    await api("/api/calls", {
      method: "POST",
      body: { receiverId: peerId, type, outcome, duration },
    });
    useGB.getState().refreshCalls();
  } catch {
    /* logging is best effort */
  }
}

function media(userVideo: boolean): MediaStreamConstraints {
  return userVideo
    ? { audio: true, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } }
    : { audio: true, video: false };
}

async function getLocalStream(userVideo: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(media(userVideo));
  } catch {
    if (userVideo) {
      // camera denied/unavailable → voice call fallback
      toast("Camera not available — continuing as voice call", "error");
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      patchCall({ video: false });
      return s;
    }
    throw new Error("Microphone access denied — allow mic permission to call 🎙️");
  }
}

function onMediaConnected(): void {
  clearWatchdogs();
  stopRing();
  // WebRTC took over → the relay is no longer needed
  if (ctx.relay) {
    stopRelayVoice();
    patchCall({ relayMode: false });
    toast("Connection restored — full quality", "info");
  }
  stopVideoRelay();
  // ⏱️ timer starts HERE — after the call is truly answered & connected
  if (!ctx.startedAt) ctx.startedAt = Date.now();
  patchCall({ phase: "active" });
}

function onMediaTrouble(kind: "disconnected" | "failed"): void {
  const cur = useGB.getState().activeCall;
  if (!cur || ctx.ended) return;
  if (ctx.iceGrace) {
    clearTimeout(ctx.iceGrace);
    ctx.iceGrace = null;
  }
  // try to rebuild the ICE path first (network switch, NAT rebinding, …)
  try {
    ctx.pc?.restartIce();
  } catch {
    /* older browsers */
  }
  void sendIceRestartOffer(); // REAL renegotiation — restartIce() alone does nothing
  ctx.restarts += 1;
  const giveUp = kind === "failed" ? 8_000 : DISCONNECT_GRACE_MS;
  ctx.iceGrace = setTimeout(() => {
    ctx.iceGrace = null;
    const st = ctx.pc?.connectionState;
    const alive = st === "connected";
    if (alive || ctx.ended) return;
    if (ctx.restarts <= 3) void sendIceRestartOffer();
    // last resort — keep the CALL alive with socket-relayed voice (+ video frames)
    enterRelay(true);
  }, giveUp);
}

function buildPC(callId: string, peerId: string): RTCPeerConnection {
  const pc = new RTCPeerConnection(RTC_CFG);
  ctx.pc = pc;
  ctx.peerId = peerId;
  ctx.remoteSet = false;
  ctx.pendingIce = [];
  ctx.restarts = 0;
  ctx.remote = null;

  pc.onicecandidate = (e) => {
    if (e.candidate) sig(peerId, { t: "ice", callId, cand: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    // accumulate EVERY remote track into one persistent stream — survives
    // renegotiation and never loses the audio track when video re-attaches.
    // ⚠️ ROUND 12 ROOT-CAUSE FIX: Chrome does NOT start rendering a track that is
    // added to a MediaStream AFTER the stream was bound to a <video>/<audio>
    // element (the element keeps readyState 0 forever — "sirf apna camera
    // dikhta hai"). The store must receive a NEW stream object per track so the
    // overlay re-assigns srcObject and the fresh track actually decodes.
    if (!ctx.remote) ctx.remote = new MediaStream();
    try {
      ctx.remote.addTrack(e.track);
    } catch {
      /* already added */
    }
    patchCall({ remoteStream: new MediaStream(ctx.remote.getTracks()) });
  };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    const cur = useGB.getState().activeCall;
    if (!cur || cur.callId !== callId) return;
    if (st === "connected") {
      // test hook: keep the relay path alive when forcing the fallback in E2E checks
      if (!(window as unknown as { __gbForceRelay?: boolean }).__gbForceRelay) onMediaConnected();
    } else if (st === "failed") {
      onMediaTrouble("failed");
    } else if (st === "disconnected") {
      onMediaTrouble("disconnected");
    }
  };
  if (ctx.local) for (const t of ctx.local.getTracks()) pc.addTrack(t, ctx.local);
  return pc;
}

/** arm the "media never connected" watchdog → voice/data-saver relay instead of a dead call */
function armMediaWatchdog(): void {
  clearWatchdogs();
  const force = (window as unknown as { __gbForceRelay?: boolean }).__gbForceRelay;
  ctx.mediaWatch = setTimeout(
    () => {
      ctx.mediaWatch = null;
      const st = ctx.pc?.connectionState;
      if (ctx.ended || (st === "connected" && !force)) return;
      enterRelay(true);
    },
    force ? 2_500 : MEDIA_CONNECT_TIMEOUT_MS
  );
}

/* ---------------- start (caller) ---------------- */
export function startCall(user: PublicUser, video: boolean): void {
  const cur = useGB.getState().activeCall;
  if (cur && cur.phase !== "ended") {
    toast("Already in a call", "error");
    return;
  }
  const isSim = user.isBot || String(user.id).startsWith("dial-");
  const callId = `c${Date.now()}${Math.floor(Math.random() * 1e5)}`;

  ctx.ended = false;
  ctx.answered = false;
  ctx.startedAt = 0;
  ctx.local = null;
  ctx.remote = null;
  ctx.restarts = 0;
  ctx.relay = null;
  ctx.pendingIce = [];
  ctx.frameTimer = null;
  ctx.frameVideo = null;
  ctx.frameCanvas = null;
  ctx.restartBusy = false;

  useGB.setState({
    activeCall: {
      user,
      video,
      incoming: false,
      callId,
      role: isSim ? "sim" : "caller",
      phase: "ringing-out",
      muted: false,
      camOff: false,
      localStream: null,
      remoteStream: null,
      relayMode: false,
    },
  });

  if (isSim) {
    // bot / dialpad demo call — rings, "answers", runs the timer (never before answer)
    startRing("out");
    ctx.timer = setTimeout(async () => {
      stopRing();
      try {
        const s = await getLocalStream(video);
        ctx.local = s;
        patchCall({ localStream: s, phase: "connecting" });
        ctx.timer = setTimeout(() => {
          ctx.startedAt = Date.now();
          patchCall({ phase: "active" });
        }, 900);
      } catch (e) {
        endCall((e as Error).message);
      }
    }, 2600);
    return;
  }

  // REAL user call
  const s = sock();
  if (!s || !s.connected) {
    useGB.setState({ activeCall: null });
    toast("Can't call right now — check your internet connection", "error");
    return;
  }
  startRing("out");
  sig(user.id, { t: "invite", callId, video, from: miniUser(useGB.getState().me) });
  ctx.timer = setTimeout(() => {
    // never answered → cancel (receiver's phone shows it as a missed call)
    endCall("No answer");
    // WhatsApp behaviour: even a no-answer dial leaves the receiver a red
    // "Missed call" row + notification for when they return
    void api("/api/calls/missed", {
      method: "POST",
      body: { receiverId: user.id, type: video ? "video" : "audio" },
    }).catch(() => {});
  }, RING_TIMEOUT_MS);
}

/* ---------------- incoming ---------------- */
export function onIncoming(d: {
  from: PublicUser;
  callId: string;
  video: boolean;
}): void {
  const cur = useGB.getState().activeCall;
  if (cur && cur.phase !== "ended") {
    sig(d.from.id, { t: "busy", callId: d.callId });
    return;
  }
  if (useGB.getState().me?.settings.gb.dnd) {
    sig(d.from.id, { t: "busy", callId: d.callId });
    return;
  }
  ctx.ended = false;
  ctx.answered = false;
  ctx.startedAt = 0;
  ctx.local = null;
  ctx.remote = null;
  ctx.restarts = 0;
  ctx.relay = null;
  ctx.pendingIce = [];
  ctx.frameTimer = null;
  ctx.frameVideo = null;
  ctx.frameCanvas = null;
  ctx.restartBusy = false;
  useGB.setState({
    activeCall: {
      user: d.from,
      video: d.video,
      incoming: true,
      callId: d.callId,
      role: "callee",
      phase: "ringing-in",
      muted: false,
      camOff: false,
      localStream: null,
      remoteStream: null,
      relayMode: false,
    },
  });
  startRing("in");
  // unanswered incoming call → auto-dismiss as missed
  ctx.timer = setTimeout(() => {
    const c = useGB.getState().activeCall;
    if (c && c.phase === "ringing-in") {
      stopRing();
      useGB.setState({ activeCall: { ...c, phase: "ended", endedLabel: "Missed call" } });
      clearCallSoon();
    }
  }, 35_000);
}

export function acceptCall(): void {
  const c = useGB.getState().activeCall;
  if (!c || c.phase !== "ringing-in") return;
  stopRing();
  if (ctx.timer) {
    clearTimeout(ctx.timer);
    ctx.timer = null;
  }
  patchCall({ phase: "connecting" });
  // tell the caller, then wait for their WebRTC offer
  sig(c.user.id, { t: "accept", callId: c.callId });
}

export function rejectCall(): void {
  const c = useGB.getState().activeCall;
  if (!c) return;
  stopRing();
  sig(c.user.id, { t: "reject", callId: c.callId });
  useGB.setState({ activeCall: { ...c, phase: "ended", endedLabel: "Call declined" } });
  clearCallSoon();
}

/* ---------------- signaling handlers (wired in AppShell) ---------------- */
export async function handleSignal(d: {
  from?: string | PublicUser;
  t?: string;
  callId?: string;
  video?: boolean;
  sdp?: RTCSessionDescriptionInit;
  cand?: RTCIceCandidateInit;
  duration?: number;
  restart?: boolean;
  data?: ArrayBuffer;
}): Promise<void> {
  const cur = useGB.getState().activeCall;
  switch (d.t) {
    case "invite": {
      // the relay spreads the caller's own payload, so d.from IS the caller's profile
      if (!d.from || typeof d.from !== "object" || !d.callId) return;
      onIncoming({ from: d.from as PublicUser, callId: d.callId, video: !!d.video });
      break;
    }
    case "accept": {
      // callee agreed → caller creates the offer
      if (!cur || cur.callId !== d.callId || cur.role !== "caller") return;
      if (ctx.timer) {
        clearTimeout(ctx.timer);
        ctx.timer = null;
      }
      stopRing();
      ctx.answered = true;
      patchCall({ phase: "connecting" });
      try {
        const s = await getLocalStream(cur.video);
        ctx.local = s;
        patchCall({ localStream: s });
        const pc = buildPC(d.callId!, cur.user.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sig(cur.user.id, { t: "offer", callId: cur.callId, sdp: pc.localDescription?.toJSON() });
        armMediaWatchdog();
      } catch (e) {
        endCall((e as Error).message || "Couldn't start the call");
      }
      break;
    }
    case "offer": {
      if (!cur || cur.callId !== d.callId || !d.sdp) return;
      // ICE-restart renegotiation (either role can send it after a hiccup) —
      // the pc already exists, so just roll into a fresh answer
      if (d.restart) {
        const pc = ctx.pc;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(d.sdp)); // implicit rollback if needed
          ctx.remoteSet = true;
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          sig(cur.user.id, { t: "answer", callId: cur.callId, sdp: pc.localDescription?.toJSON() });
          for (const cd of ctx.pendingIce.splice(0)) await pc.addIceCandidate(cd).catch(() => {});
        } catch {
          /* keep the call on the relay path */
        }
        return;
      }
      if (cur.role !== "callee") return;
      try {
        const s = await getLocalStream(cur.video);
        ctx.local = s;
        patchCall({ localStream: s });
        const pc = buildPC(d.callId!, cur.user.id);
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        ctx.remoteSet = true;
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        sig(cur.user.id, { t: "answer", callId: cur.callId, sdp: pc.localDescription?.toJSON() });
        for (const c of ctx.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        armMediaWatchdog();
      } catch (e) {
        sig(cur.user.id, { t: "reject", callId: cur.callId });
        endCall((e as Error).message || "Couldn't start the call");
      }
      break;
    }
    case "answer": {
      if (!cur || cur.callId !== d.callId || !d.sdp || !ctx.pc) return;
      if (ctx.pc.signalingState !== "have-local-offer") return;
      await ctx.pc.setRemoteDescription(new RTCSessionDescription(d.sdp)).catch(() => {});
      ctx.remoteSet = true;
      for (const c of ctx.pendingIce.splice(0)) await ctx.pc.addIceCandidate(c).catch(() => {});
      break;
    }
    case "ice": {
      if (!d.cand) return;
      if (!ctx.pc) {
        // candidates can arrive before the offer/answer builds our PC — never drop them
        ctx.pendingIce.push(d.cand);
        return;
      }
      if (ctx.remoteSet) await ctx.pc.addIceCandidate(d.cand).catch(() => {});
      else ctx.pendingIce.push(d.cand);
      break;
    }
    case "relay": {
      // peer gave up on direct media → mirror them into voice/data-saver relay mode
      if (!cur || cur.callId !== d.callId || cur.role === "sim") return;
      enterRelay(false);
      break;
    }
    case "frame": {
      // data-saver video: peer camera frames over the socket
      if (!cur || cur.callId !== d.callId || !(d.data instanceof ArrayBuffer)) return;
      window.dispatchEvent(new CustomEvent("gb-relay-frame", { detail: d.data }));
      break;
    }
    case "pcm": {
      if (!cur || cur.callId !== d.callId || !ctx.relay || !(d.data instanceof ArrayBuffer)) return;
      relayRecv(d.data);
      break;
    }
    case "reject": {
      if (!cur || cur.callId !== d.callId) return;
      finishCall("Call declined", { log: cur.role === "caller" ? { outcome: "outgoing" } : undefined });
      break;
    }
    case "busy": {
      if (!cur || cur.callId !== d.callId) return;
      finishCall("Busy — try again later", { log: cur.role === "caller" ? { outcome: "outgoing" } : undefined });
      break;
    }
    case "offline": {
      // the relay checked the target's socket — they're not connected, so the
      // call auto-cuts immediately instead of ringing into the void.
      // WhatsApp behaviour: the offline user STILL gets a red "Missed call" row
      // + a notification the moment they come back online. The single shared
      // row (callerId = us) shows "Outgoing" on our side, "Missed" on theirs —
      // so we deliberately do NOT log a second caller row here.
      if (!cur || cur.callId !== d.callId || cur.role !== "caller") return;
      const offUser = cur.user;
      const offType = cur.video ? "video" : "audio";
      finishCall("User is unavailable — they're offline");
      try {
        await api("/api/calls/missed", {
          method: "POST",
          body: { receiverId: offUser.id, type: offType },
        });
        toast(`Missed call notification sent to ${offUser.name}`);
      } catch {
        /* best effort */
      }
      break;
    }
    case "end": {
      if (!cur || cur.callId !== d.callId) return;
      finishCall("Call ended");
      break;
    }
  }
}

/* ---------------- end ---------------- */
function finishCall(
  label: string,
  opts: { log?: { outcome: string } } = {}
): void {
  const c = useGB.getState().activeCall;
  if (!c || ctx.ended) return;
  ctx.ended = true;
  clearWatchdogs();
  if (ctx.timer) {
    clearTimeout(ctx.timer);
    ctx.timer = null;
  }
  stopRing();
  stopRelayVoice();
  stopVideoRelay();

  const answered = ctx.startedAt > 0;
  const duration = answered ? Math.round((Date.now() - ctx.startedAt) / 1000) : 0;

  // real calls: let the peer know (ignored if they already ended)
  if (c.role === "caller" || c.role === "callee") {
    sig(c.user.id, { t: "end", callId: c.callId, duration });
  }
  // log the row — only the caller writes it (one row per call, WhatsApp-style).
  // The receiver's UI shows duration===0 & !outgoing as red "Missed".
  if (opts.log) void logCall(c.user.id, c.video ? "video" : "audio", opts.log.outcome, duration);

  // cleanup media
  try {
    ctx.pc?.close();
  } catch {
    /* ignore */
  }
  ctx.pc = null;
  ctx.local?.getTracks().forEach((t) => t.stop());
  ctx.local = null;
  ctx.remote = null;
  ctx.pendingIce = [];
  ctx.startedAt = 0;

  useGB.setState({
    activeCall: {
      ...c,
      phase: "ended",
      endedLabel: label,
      localStream: null,
      remoteStream: null,
      relayMode: false,
    },
  });
  clearCallSoon();
}

/** manual hang-up (red button) */
export function endCall(label?: string): void {
  const c = useGB.getState().activeCall;
  if (!c) return;
  // real caller + bot demo calls log a row (dialpad fake numbers don't exist in DB)
  const isBotDemo = c.role === "sim" && !String(c.user.id).startsWith("dial-");
  const shouldLog = c.role === "caller" || isBotDemo;
  finishCall(label || "Call ended", {
    log: shouldLog ? { outcome: "outgoing" } : undefined,
  });
}

function clearCallSoon() {
  setTimeout(() => {
    const c = useGB.getState().activeCall;
    if (c && c.phase === "ended") useGB.setState({ activeCall: null });
  }, 1200);
}

/* ---------------- in-call controls ---------------- */
export function toggleMute(): void {
  const c = useGB.getState().activeCall;
  if (!c) return;
  const track = ctx.local?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  patchCall({ muted: !track.enabled });
}

export function toggleCam(): void {
  const c = useGB.getState().activeCall;
  if (!c) return;
  const track = ctx.local?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  patchCall({ camOff: !track.enabled });
}

export async function switchCam(): Promise<void> {
  const c = useGB.getState().activeCall;
  if (!c || !ctx.local) return;
  const cur = ctx.local.getVideoTracks()[0]?.getSettings().facingMode;
  const next = cur === "environment" ? "user" : "environment";
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: next } },
      audio: false,
    });
    const nt = s.getVideoTracks()[0];
    const sender = ctx.pc?.getSenders().find((x) => x.track?.kind === "video");
    if (sender && nt) await sender.replaceTrack(nt);
    const old = ctx.local.getVideoTracks()[0];
    old?.stop();
    ctx.local.removeTrack(old!);
    ctx.local.addTrack(nt);
    patchCall({ localStream: ctx.local });
  } catch {
    /* device has only one camera — ignore */
  }
}

/** seconds the (simulated or real) call has been active */
export function activeSeconds(): number {
  return ctx.startedAt ? Math.round((Date.now() - ctx.startedAt) / 1000) : 0;
}

export function currentCallId(): string | null {
  return useGB.getState().activeCall?.callId ?? null;
}
