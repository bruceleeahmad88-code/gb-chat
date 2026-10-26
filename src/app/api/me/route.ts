import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { ensureGbNumber } from "@/lib/gb-number";
import crypto from "crypto";

function genInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = Array.from(crypto.randomBytes(6))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `gb${code}`;
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  // backfill an invite code for accounts created before the invite system
  let inviteCode = user.inviteCode;
  if (!inviteCode) {
    inviteCode = genInviteCode();
    while (await db.user.findUnique({ where: { inviteCode } })) inviteCode = genInviteCode();
    await db.user.update({ where: { id: user.id }, data: { inviteCode } });
  }

  // permanent GB number (WhatsApp-style identity) — backfill for older accounts
  const gbNumber = await ensureGbNumber(user);

  return jsonOk({
    me: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      about: user.about,
      avatarColor: user.avatarColor,
      avatarEmoji: user.avatarEmoji,
      avatarUrl: user.avatarUrl,
      isBot: user.isBot,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen.toISOString(),
      inviteCode,
      gbNumber,
      settings: parseSettings(user.settingsJson),
    },
  });
}

/** Update profile: name, about, avatar */
export async function PUT(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return jsonError("Unauthorized", 401);
  const body = await req.json();
  const data: Record<string, string | null> = {};
  if (typeof body.name === "string" && body.name.trim().length >= 2) data.name = body.name.trim();
  if (typeof body.about === "string" && body.about.length <= 139) data.about = body.about;
  if (typeof body.avatarColor === "string") data.avatarColor = body.avatarColor;
  if (typeof body.avatarEmoji === "string") data.avatarEmoji = body.avatarEmoji.slice(0, 4);
  if (typeof body.avatarUrl === "string") {
    const url = body.avatarUrl;
    // ya to chhoti data-URI image (uploaded DP) ya internal /avatars path
    if (url === "") data.avatarUrl = null;
    else if (url.startsWith("data:image/") && url.length <= 400_000) data.avatarUrl = url;
    else if (url.startsWith("/avatars/") && url.length <= 200) data.avatarUrl = url;
    else return jsonError("Photo is too large — please choose a smaller one");
  }
  if (typeof body.username === "string") {
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return jsonError("Invalid username (a-z, 0-9, _ only)");
    if (username !== user.username) {
      const taken = await db.user.findUnique({ where: { username } });
      if (taken) return jsonError("This username is already taken");
      data.username = username;
    }
  }
  const updated = await db.user.update({ where: { id: user.id }, data });
  return jsonOk({
    me: {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      email: updated.email,
      about: updated.about,
      avatarColor: updated.avatarColor,
      avatarEmoji: updated.avatarEmoji,
      avatarUrl: updated.avatarUrl,
      isOnline: updated.isOnline,
      lastSeen: updated.lastSeen.toISOString(),
      inviteCode: updated.inviteCode,
      gbNumber: updated.gbNumber,
      settings: parseSettings(updated.settingsJson),
    },
  });
}
