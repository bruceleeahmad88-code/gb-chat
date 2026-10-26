import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import crypto from "crypto";
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

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

/** POST /api/upload — device se real file (photo/video/document/audio) upload */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Invalid file data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("No file received", 400);
  if (file.size === 0) return jsonError("File is empty", 400);
  if (file.size > MAX_SIZE) return jsonError("File is too large (max 50MB)", 413);

  const mime = file.type || "application/octet-stream";
  // original naam se extension nikaalo (sanitized)
  const origName = (file.name || "file").replace(/[^\w.\-() ]+/g, "_").slice(0, 100);
  let ext = (origName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext || ext.length > 6 || !origName.includes(".")) ext = MIME_EXT[mime] || "bin";

  const key = `${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
  const stored = `${key}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  // Store IN the database (durable on cloud hosts with ephemeral disks).
  await db.gbMedia.create({
    data: { name: stored, mime, size: buf.length, data: buf },
  });

  return jsonOk({
    url: `/api/files/${stored}`,
    name: origName,
    size: file.size,
    mime,
  });
}
