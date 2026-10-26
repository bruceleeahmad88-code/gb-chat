/** GB Chat API client — original implementation */
const TOKEN_KEY = "gbchat_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || "Something went wrong", res.status);
  }
  return data as T;
}

/** multipart upload (real file device se) */
export async function apiForm<T = unknown>(path: string, fd: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || "Upload failed", res.status);
  }
  return data as T;
}

/** real uploaded file (/api/files/..) ya generated placeholder (/api/media/..)
 *  real files ko <img>/<video> tags ke liye token query param ke sath serve karo */
export function resolveMedia(seed: string | null | undefined): string {
  if (!seed) return mediaUrl("photo");
  if (seed.startsWith("/api/files/")) {
    if (typeof window === "undefined") return seed;
    const token = getToken();
    return token ? `${seed}?token=${encodeURIComponent(token)}` : seed;
  }
  return mediaUrl(seed);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 8831244567 → "+88 3123 44567" — WhatsApp-jaisa display for the permanent GB number */
export function formatGbNumber(num?: string | null): string {
  if (!num) return "";
  const d = String(num).replace(/\D/g, "");
  if (d.length >= 10) return `+88 ${d.slice(2, 6)} ${d.slice(6)}`;
  if (d.length > 0) return `+${d}`;
  return "";
}

/* ------------------------------------------------------------------
 *  REAL DEVICE TIME — the server clock and the user's device clock can
 *  differ (different country, wrong server clock, anything). The app
 *  measures that difference ONCE (deviceNow - serverNow via /api/time)
 *  and applies it to EVERY displayed timestamp, so the chat always
 *  shows exactly what the user's device clock shows — 12:44 on the
 *  device = 12:44 in the chat. Timezone is automatic (JS local getters
 *  follow the device settings: Pakistan → PK time, UK → UK time).
 * ------------------------------------------------------------------ */
let clockSkewMs = 0;
const SKEW_KEY = "gbchat_clock_skew";

/** restore the last known skew instantly (saved on every sync) */
if (typeof window !== "undefined") {
  const saved = Number(localStorage.getItem(SKEW_KEY));
  if (isFinite(saved) && Math.abs(saved) < 90 * 24 * 3600_000) clockSkewMs = saved;
}

/** set the measured skew (deviceNow - serverNow) and remember it */
export function setClockSkew(ms: number): void {
  if (!isFinite(ms)) return;
  clockSkewMs = ms;
  try {
    localStorage.setItem(SKEW_KEY, String(Math.round(ms)));
  } catch {
    /* private mode etc. */
  }
}

/** fetch the server clock and compute device-vs-server difference. Call on app boot. */
export async function syncClock(): Promise<void> {
  try {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const data = (await res.json()) as { now: number };
    // half the round-trip is a good estimate of one-way latency
    const rtt = Date.now() - t0;
    setClockSkew(t0 + rtt / 2 - data.now);
  } catch {
    /* keep the last known skew */
  }
}

/** a Date whose epoch is corrected so it READS as the device's wall clock */
export function devDate(iso: string | number | Date): Date {
  const d = iso instanceof Date ? iso : new Date(iso);
  return new Date(d.getTime() + clockSkewMs);
}

/** device se file pick karne ka helper — input element click */
export function pickFile(accept: string, onPick: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onPick(f);
    input.remove();
  });
  input.click();
}

export function mediaUrl(seed: string): string {
  return `/api/media/${encodeURIComponent(seed)}`;
}

/* ------------------------------------------------------------------
 *  GIF URLs — every gif (new AND old messages) renders through our
 *  /api/gifs/media/<id> proxy. Giphy's old media.giphy.com paths now
 *  serve the "THIS CONTENT IS NOT AVAILABLE" placeholder, so:
 *   - new messages already store proxy URLs,
 *   - OLD messages (direct giphy URLs stored in mediaSeed) are rewritten
 *     here on the fly — history repairs itself with zero migration.
 * ------------------------------------------------------------------ */

/** append the session token for <img> tags (they can't send headers) */
export function withMediaToken(u: string): string {
  if (typeof window === "undefined") return u;
  const t = getToken();
  if (!t || u.includes("token=")) return u;
  return `${u}${u.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}`;
}

/** extract a giphy gif id from any known URL shape (or a bare id / proxy path) */
export function gifIdFrom(seed: string | null | undefined): string | null {
  const s = String(seed || "");
  if (!s) return null;
  let id: string | null = null;
  const m1 = /giphy\.com\/(?:media|gifs)\/([a-zA-Z0-9_-]{8,64})/.exec(s); // media.giphy.com/media/ID/…, giphy.com/gifs/…
  const m2 = /i\.giphy\.com\/(?:media\/)?([a-zA-Z0-9_-]{8,64})/.exec(s); // i.giphy.com/ID.gif, i.giphy.com/media/ID/…
  if (m1) id = m1[1];
  else if (m2) id = m2[1];
  else if (s.startsWith("/api/gifs/media/")) id = s.split("/").pop()?.split("?")[0] || null;
  else if (/^[a-zA-Z0-9_-]{8,40}$/.test(s)) id = s;
  if (!id) return null;
  if (id.includes("-")) id = id.split("-").pop() || id; // giphy page slugs end with the id
  return /^[a-zA-Z0-9_-]{8,40}$/.test(id) ? id : null;
}

/** proxy URL (with token) for a gif id/seed — null if the seed isn't giphy-ish */
export function gifProxyUrl(seed: string | null | undefined, preview = false): string | null {
  const id = gifIdFrom(seed);
  if (!id) return null;
  return withMediaToken(`/api/gifs/media/${id}${preview ? "?v=preview" : ""}`);
}

/** last-resort direct CDN url (used if our proxy itself fails) */
export function gifDirectUrl(seed: string | null | undefined): string | null {
  const id = gifIdFrom(seed);
  return id ? `https://i.giphy.com/${id}.gif` : null;
}

export function avatarStyle(color: string): { backgroundColor: string } {
  return { backgroundColor: `#${color || "0ea47a"}` };
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function formatTime(iso: string): string {
  const d = devDate(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export function formatListTime(iso: string): string {
  const d = devDate(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000
  );
  if (diffDays === 0) return formatTime(iso);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function formatDayLabel(iso: string): string {
  const d = devDate(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yest = new Date(now.getTime() - 86400000);
  if (sameDay(d, now)) return "TODAY";
  if (sameDay(d, yest)) return "YESTERDAY";
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function lastSeenText(isOnline: boolean, lastSeen: string): string {
  if (isOnline) return "online";
  const d = devDate(lastSeen);
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `last seen today at ${formatTime(lastSeen)}`;
  const yest = new Date(now.getTime() - 86400000);
  if (sameDay(d, yest)) return `last seen yesterday at ${formatTime(lastSeen)}`;
  return `last seen ${formatDayLabel(lastSeen)}`;
}
