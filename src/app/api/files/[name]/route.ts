import { getAuthUser, jsonError } from "@/lib/auth";
import { stat, readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "text/plain": "txt",
  "application/json": "json",
};

function contentTypeFor(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  for (const [mime, e] of Object.entries(MIME_EXT)) {
    if (e === ext) return mime;
  }
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function byteResponse(
  buf: Uint8Array,
  type: string,
  total: number,
  rangeHeader: string | null
): Response {
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start >= total || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const slice = buf.subarray(start, end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/** GET /api/files/[name] — uploaded real file serve (Range support for video/audio)
 *  <img>/<video>/<a download> headers nahi bhej sakte — is liye ?token= bhi accept karte hain
 *  Storage: pehle DATABASE (GbMedia — durable on cloud hosts), phir legacy disk fallback */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const url = new URL(req.url);
  const qToken = url.searchParams.get("token");
  let me: { id: string } | null = null;
  if (qToken) {
    const session = await db.session.findUnique({ where: { token: qToken }, include: { user: true } });
    if (session) me = session.user;
  }
  if (!me) me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const { name: raw } = await ctx.params;
  // security: sirf simple filename allowed
  const name = raw.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!name || name.includes("..")) return jsonError("Invalid file", 400);

  const type = contentTypeFor(name);
  const range = req.headers.get("range");

  // 1) Database (primary storage — uploads durable rehte hain)
  try {
    const row = await db.gbMedia.findUnique({ where: { name } });
    if (row) {
      const buf = Buffer.from(row.data);
      return byteResponse(buf, row.mime || type, buf.length, range);
    }
  } catch {
    // DB miss/hiccup — disk fallback try karo
  }

  // 2) Legacy disk fallback (sandbox ke purane uploads)
  const filePath = path.join(UPLOAD_DIR, name);
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return jsonError("File not found", 404);
  }
  if (!info.isFile()) return jsonError("Invalid file", 400);

  const buf = await readFile(filePath);
  return byteResponse(new Uint8Array(buf), type, info.size, range);
}
