import { db } from "@/lib/db";
import { createSession, hashPassword, jsonError, jsonOk } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { ensureBots, seedUserChats } from "@/lib/bots";
import { ensureGbNumber } from "@/lib/gb-number";
import crypto from "crypto";

/** Login with username only (no phone number needed) */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!username || !password) return jsonError("Both username and password are required");

    const user = await db.user.findUnique({ where: { username } });
    if (!user || user.password !== hashPassword(password)) {
      return jsonError("Wrong username or password", 401);
    }

    await db.user.update({ where: { id: user.id }, data: { isOnline: true, lastSeen: new Date() } });
    // ensure fresh seed (Zoya + chats) + personal invite code for older accounts
    await ensureBots();
    await seedUserChats(user.id);
    let inviteCode = user.inviteCode;
    if (!inviteCode) {
      const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
      inviteCode = `gb${Array.from(crypto.randomBytes(6)).map((b) => alphabet[b % alphabet.length]).join("")}`;
      await db.user.update({ where: { id: user.id }, data: { inviteCode } });
    }
    // permanent GB number (WhatsApp-style identity) — backfill for older accounts
    const gbNumber = await ensureGbNumber(user);
    const token = await createSession(user.id);

    return jsonOk({
      token,
      me: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        about: user.about,
        avatarColor: user.avatarColor,
        avatarEmoji: user.avatarEmoji,
        avatarUrl: user.avatarUrl,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        inviteCode,
        gbNumber,
        settings: parseSettings(user.settingsJson),
      },
    });
  } catch (e) {
    console.error("login error", e);
    return jsonError("Login failed — please try again", 500);
  }
}

