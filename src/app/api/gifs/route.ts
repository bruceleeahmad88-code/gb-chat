import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { createHash } from "crypto";

/**
 * GIF picker (Giphy-powered) — search + trending + categories.
 *
 * The classic free Giphy/Tenor API keys are dead (Giphy "BANNED", Tenor API
 * discontinued), so this route scrapes giphy.com's public search pages the way a
 * browser does and pulls the real GIF IDs from the markup.
 *
 * IMPORTANT (2025 CDN change): media.giphy.com/media/<id>/... now serves a
 * byte-identical "THIS CONTENT IS NOT AVAILABLE" placeholder for every id.
 * Real gifs only live on i.giphy.com/<id>.gif — so all picker URLs go through
 * OUR proxy (/api/gifs/media/<id>) which fetches i.giphy.com, rejects the
 * placeholder by byte signature, caches, and serves. Users never touch giphy
 * directly (giphy is ISP-blocked in some regions).
 *
 * Verification here: each candidate id gets a cheap 4 KB prefix GET from
 * i.giphy.com and the bytes are compared against the placeholder's known
 * signature — only real gifs survive (a plain HEAD can't tell, placeholder
 * also answers 200).
 *
 * A hand-verified offline catalog (80 real GIFs across 10 categories) is the
 * fallback if giphy.com is unreachable — so the picker NEVER comes back empty.
 */

const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

/** byte signature of Giphy's "THIS CONTENT IS NOT AVAILABLE" placeholder */
const PLACEHOLDER_PREFIX_MD5 = "0d7fa3546c3b1e93d3dfa7a352da5916"; // md5 of first 4096 bytes

export interface GifItem {
  id: string;
  preview: string; // proxy webp for the grid
  url: string; // proxy gif that goes into the message
  page?: string; // giphy.com page URL
}

/** verified offline catalog — real Giphy CDN IDs checked at build time */
const FALLBACK: Record<string, string[]> = {
  love: ["0igHDNPGNJ7jU9xcEZ", "4N1wOi78ZGzSB6H7vK", "4asRlBKdJaPeBahjcL", "7jJgzTGMrwrnHDl9cw", "9wYm6EKAnaDPIjfHek", "JLcCHfbRPDbw1yqurX", "MKuEHA4bHXUhwXhovI", "OTjlFt6m9KIPo4fJAI"],
  lol: ["26n6Gx9moCgs1pUuk", "3o6Zt4HU9uwXmXSAuI", "3o6ozvv0zsJskzOCbu", "3oEjHI8WJv4x6UPDB6", "H6bfaRHZ2MIfVfkNNx", "IhyGL914g9ShHdHVFy", "QZmvld1km1A0fZDmxK", "dtGIRL0FDp6nnOPGb5"],
  morning: ["AVygNA1jP5jfiAPwcN", "DMnQAyk56tfX0O436G", "HkGxrUHR0tRO32XCAs", "ItK5THepoZHLWQXqav", "Js7k1D3Jenq3MUp65Z", "KxbhQdZQ8Pvo47Hnti", "MWz9Dd3sETjoAhpQKS", "WaYIFw9ZiEn1fPcH8Y"],
  night: ["4ROYBUekIzcchudOu0", "5V5rtMFsw7DJZuxBGb", "5VW8fE6NwtLnWs1g0j", "5uxD3aVLKTfA6Z2Lvp", "9E5NiW8yNtRklE6x7M", "DRIVkLoKs8Gpi8QpXH", "GiZzkhK5bpTJn6y7ve", "IwXpyMicMBcx5P4wLB"],
  hi: ["28GHfhGFWpFgsQB4wR", "2oyfwkRTgdfMW7FTHd", "5FDfOtafB4Gnwr9dBm", "6EDGSznQA5kVCa0DfD", "CK0Eg2ymtfzTO2yVJD", "CKxQOrGaDqC5FhYr9v", "LPFNd1AJBoYcVUExmE", "S2IfEQqgWc0AH4r6Al"],
  like: ["3FXHMCthFKGGMwDbJv", "5MzzMebtfoTdwZJPd7", "8Fr8hmVNAg0GiQ6rI4", "BYoRqTmcgzHcL9TCy1", "MeChHLiJhQ6vANKlGn", "Od0QRnzwRBYmDU3eEO", "Q66ZEIpjEQddUOOKGW", "SShJcu4ySty1G6MX9A"],
  sad: ["3oEjI80DSa1grNPTDq", "AzAa23iNkA5I6jQKmG", "Lz6971fkGSgCMOOncl", "Qw1wF6hnNRYixpdgmH", "RI8sVAn6lEyQZFpZfb", "SrKbU4TRDgN8apkkES", "eEg1ziKuWI9m9jVv2a", "iJJ6E58EttmFqgLo96"],
  birthday: ["0rklWS4kRBUFUn2Jge", "3ohhwmQ0xIg8W3pHd6", "7NON3hH96H4InrrkPy", "7SH1HJhIi4F7MnGBpi", "8BNQlEqOLi50OaOrPb", "CNNK7s0oINp0SyenZL", "E6h7uDtoFrqpdS8O4P", "EjMxK3pUeAC1MN5W9H"],
  wow: ["3oz8xPIblfyMdZwM8w", "MQ4bWOjn8C9tT2dzIb", "QUENDfi6DEMLzQ0CKt", "RLkcGcTtWc7QyQZqSM", "Sqfu14lSonVN219Zb6", "b8RfbQFaOs1rO10ren", "dnMwfGJPdsqYEbmrD5", "kxei1ibnxITFUvvtJU"],
  hug: ["3oEdv4hwWTzBhWvaU0", "3oNMQtqpnse0dbFe06", "5OqXb948EBkyUcnwHt", "5zM3QKTv7F4FsJav9R", "IzXiddo2twMmdmU8Lv", "KG5oq4vesf9r8JbBEN", "PyhiwT9P9WmBF2u8rd", "RJEIl2fBX3jAJOqSau"],
};

interface GifItemOut {
  id: string;
  preview: string;
  url: string;
  page: string;
}

/** all picker URLs go through our proxy (never the dead media.giphy.com paths) */
function fromIds(ids: string[]): GifItemOut[] {
  return ids.map((id) => ({
    id,
    preview: `/api/gifs/media/${id}?v=preview`,
    url: `/api/gifs/media/${id}`,
    page: `https://giphy.com/gifs/${id}`,
  }));
}

/** keyword → catalog category */
function matchCategory(q: string): string[] {
  const s = q.toLowerCase();
  const map: Record<string, string[]> = {
    love: ["love", "heart", "pyar", "ishq", "romantic", "kiss"],
    lol: ["lol", "funny", "laugh", "haha", "joke", "comedy", "meme"],
    morning: ["morning", "subah", "wake up", "coffee"],
    night: ["night", "good night", "gn", "sleep", "shab", "so jao"],
    hi: ["hi", "hello", "hey", "salam", "wave", "yo"],
    like: ["thumbs up", "like", "ok", "yes", "shabash", "great", "clap"],
    sad: ["sad", "cry", "crying", "upset", "sorry", "miss you"],
    birthday: ["birthday", "bday", "cake"],
    wow: ["wow", "omg", "shock", "surprise", "amazing"],
    hug: ["hug", "jhappi", "cuddle", "comfort"],
  };
  const cats: string[] = [];
  for (const [cat, words] of Object.entries(map)) {
    if (words.some((w) => s.includes(w))) cats.push(cat);
  }
  return cats;
}

/* ---------------- scraping cache ---------------- */
const cache = new Map<string, { at: number; items: GifItemOut[] }>();
const TTL = 30 * 60 * 1000;
const MAX_IDS = 40;

/** pull real gif ids out of a giphy.com page (they appear as quoted 16–22 char tokens) */
function extractIds(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /"([a-zA-Z0-9_-]{16,22})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    // Real giphy ids always contain a digit or uppercase letter (mixed-case base64-ish).
    // Filters all-lowercase tokens like "next-size-adjust" (giphy.com itself is Next.js)
    if (!/[0-9A-Z]/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

/** GET the first 4 KB from i.giphy.com and compare against the placeholder signature.
 *  (Placeholder answers HTTP 200 + image/gif too — only the BYTES tell the truth.) */
async function verifyId(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://i.giphy.com/${id}.gif`, {
      headers: { "User-Agent": UA, Range: "bytes=0-4095", Accept: "image/gif,image/*" },
      signal: AbortSignal.timeout(4500),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 512) return null;
    const digest = createHash("md5").update(Buffer.from(buf)).digest("hex");
    return digest === PLACEHOLDER_PREFIX_MD5 ? null : id;
  } catch {
    return null;
  }
}

async function scrape(query: string): Promise<GifItemOut[]> {
  const slug = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
  const url = slug ? `https://giphy.com/search/${encodeURIComponent(slug)}` : "https://giphy.com/explore/trending";
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`giphy ${res.status}`);
  const html = await res.text();
  const ids = extractIds(html);
  if (!ids.length) throw new Error("no ids found");
  // byte-verify each candidate against i.giphy.com — only real GIFs survive
  const checked = await Promise.all(ids.slice(0, 48).map(verifyId));
  const good = checked.filter((x): x is string => !!x);
  if (!good.length) throw new Error("no valid gifs");
  return fromIds(good);
}

export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").slice(0, 60);
  const key = q.toLowerCase().trim();

  // 1) cache
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return jsonOk({ gifs: hit.items, source: "cache" });
  }

  // 2) live scrape
  try {
    const items = await scrape(key);
    cache.set(key, { at: Date.now(), items });
    return jsonOk({ gifs: items, source: "giphy" });
  } catch {
    /* fall through to the offline catalog */
  }

  // 3) verified offline catalog
  const cats = key ? matchCategory(key) : Object.keys(FALLBACK);
  let pool: string[] = [];
  if (cats.length) {
    for (const c of cats.slice(0, 3)) pool = pool.concat(FALLBACK[c] || []);
  } else {
    // no keyword match → mix everything so the picker still shows something
    for (const ids of Object.values(FALLBACK)) {
      pool = pool.concat(ids.slice(0, 4));
    }
  }
  const items = fromIds(pool.slice(0, 32));
  cache.set(key, { at: Date.now(), items });
  return jsonOk({ gifs: items, source: "catalog" });
}
