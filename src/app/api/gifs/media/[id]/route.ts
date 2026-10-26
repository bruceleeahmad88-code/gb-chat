import { getAuthUser, jsonError } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";

/**
 * GIF media proxy — THE fix for "THIS CONTENT IS NOT AVAILABLE".
 *
 * Root cause: Giphy's old CDN path media.giphy.com/media/<id>/giphy-downsized-medium.gif
 * now serves a byte-identical "THIS CONTENT IS NOT AVAILABLE" placeholder for EVERY id
 * (HTTP 200, image/gif — so HEAD checks can't catch it). Real gifs live on
 * i.giphy.com/<id>.gif now.
 *
 * This route:
 *  1. fetches the REAL bytes from i.giphy.com (server-side, so the user's ISP/device
 *     never needs to reach giphy directly — giphy is blocked on some networks),
 *  2. REJECTS the placeholder by its known byte signature (md5 of first 4 KB /
 *     full body — the placeholder is always byte-identical),
 *  3. caches good gifs in an in-memory LRU so repeat views are instant and the
 *     gif keeps working in chat history even if giphy hiccups later.
 *
 * Auth: ?token= (img tags can't send headers) or Authorization: Bearer.
 */

const UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

/** byte signatures of Giphy's "THIS CONTENT IS NOT AVAILABLE" placeholder */
const PLACEHOLDER_PREFIX_MD5 = "0d7fa3546c3b1e93d3dfa7a352da5916"; // md5 of first 4096 bytes of the gif placeholder
const PLACEHOLDER_FULL_MD5 = new Set([
  "42c4349b611a739a8317f17ae74b7587", // gif placeholder (239321 bytes, 480x270)
  "b2d844b49607a99a794d8d0ff5308170", // webp placeholder (134250 bytes, 480x270)
]);

interface CacheEntry {
  type: string;
  body: ArrayBuffer;
  at: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 80;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h

function respond(hit: CacheEntry): Response {
  return new Response(new Uint8Array(hit.body), {
    headers: {
      "Content-Type": hit.type,
      "Content-Length": String(hit.body.byteLength),
      "Cache-Control": "public, max-age=86400",
      "X-Gif-Source": "i.giphy.com",
    },
  });
}

function cachePut(key: string, entry: CacheEntry) {
  if (cache.size >= MAX_CACHE) {
    // drop the oldest entry
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, entry);
}

/** md5 of the first `n` bytes (or the whole buffer when smaller) */
function md5(buf: ArrayBuffer, n = Infinity): string {
  const slice = buf.byteLength > n ? buf.slice(0, n) : buf;
  return createHash("md5").update(Buffer.from(slice)).digest("hex");
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // auth — img tags can't send headers, so accept ?token= like /api/files does
  const url = new URL(req.url);
  const qToken = url.searchParams.get("token");
  let me: { id: string } | null = null;
  if (qToken) {
    const session = await db.session.findUnique({ where: { token: qToken }, include: { user: true } });
    if (session) me = session.user;
  }
  if (!me) me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const { id: rawId } = await ctx.params;
  const id = String(rawId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!/^[a-zA-Z0-9_-]{8,40}$/.test(id)) return jsonError("Invalid gif id", 400);

  const preview = url.searchParams.get("v") === "preview";
  const key = `${id}${preview ? "|p" : ""}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return respond(hit);

  // real gif bytes come from i.giphy.com (the only CDN path that still serves content)
  const upstream = preview
    ? `https://i.giphy.com/media/${id}/giphy.webp`
    : `https://i.giphy.com/${id}.gif`;
  const type = preview ? "image/webp" : "image/gif";

  let body: ArrayBuffer;
  try {
    const res = await fetch(upstream, {
      headers: { "User-Agent": UA, Accept: "image/gif, image/webp, image/*" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return jsonError("GIF not found", 404);
    body = await res.arrayBuffer();
  } catch {
    return jsonError("Couldn't reach GIPHY", 502);
  }

  // placeholder rejection — Giphy serves the SAME bytes for missing/deleted gifs
  const full = md5(body);
  if (PLACEHOLDER_FULL_MD5.has(full) || (body.byteLength > 4096 && md5(body, 4096) === PLACEHOLDER_PREFIX_MD5)) {
    return jsonError("This GIF is no longer available on GIPHY", 404);
  }
  if (body.byteLength < 600) return jsonError("Invalid GIF data", 404);

  const entry: CacheEntry = { type, body, at: Date.now() };
  cachePut(key, entry);
  return respond(entry);
}
