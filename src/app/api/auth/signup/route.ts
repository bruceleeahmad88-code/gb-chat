import { db } from "@/lib/db";
import { createSession, hashPassword, jsonError, jsonOk } from "@/lib/auth";
import { parseSettings } from "@/lib/settings";
import { ensureBots, seedUserChats } from "@/lib/bots";
import { genGbNumber, findByNumberOrCode } from "@/lib/gb-number";
import crypto from "crypto";

const AVATAR_COLORS = ["0ea47a", "0288d1", "7b1fa2", "e91e63", "f57c00", "e53935", "3949ab", "00897b"];

function genInviteCode(): string {
  // human-friendly: GB-XXXXXX (no confusing chars)
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = Array.from(crypto.randomBytes(6))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `gb${code}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const avatarColor = String(body.avatarColor || AVATAR_COLORS[0]);
    const invite = String(body.invite || "").trim().toLowerCase();

    // Validation
    if (!/^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/.test(email)) {
      return jsonError("Only a valid Gmail address is allowed (e.g. youremail@gmail.com)");
    }
    if (name.length < 2) return jsonError("Name must be at least 2 characters");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return jsonError("Username: lowercase letters, numbers and _ only (3-20 chars)");
    }
    if (password.length < 4) return jsonError("Password must be at least 4 characters");

    const emailTaken = await db.user.findUnique({ where: { email } });
    if (emailTaken) return jsonError("This Gmail is already registered — please log in");
    const usernameTaken = await db.user.findUnique({ where: { username } });
    if (usernameTaken) return jsonError("This username is already taken");

    // invite (optional but validated if given) — invite code OR friend's GB number
    let inviter: { id: string; name: string } | null = null;
    if (invite) {
      const found = await findByNumberOrCode(invite);
      if (!found) return jsonError("Invite code is not valid — check it or leave it empty");
      inviter = { id: found.id, name: found.name };
    }

    await ensureBots();

    // unique invite code for the new user
    let inviteCode = genInviteCode();
    while (await db.user.findUnique({ where: { inviteCode } })) inviteCode = genInviteCode();

    // permanent GB number — WhatsApp-style identity, shareable like a phone number
    let gbNumber = genGbNumber();
    while (await db.user.findUnique({ where: { gbNumber } })) gbNumber = genGbNumber();

    const user = await db.user.create({
      data: {
        email,
        name,
        username,
        password: hashPassword(password),
        avatarColor: AVATAR_COLORS.includes(avatarColor) ? avatarColor : AVATAR_COLORS[0],
        inviteCode,
        gbNumber,
        isOnline: true,
      },
    });

    // INVITE LINKAGE: inviter <-> new user become each other's private contacts
    if (inviter) {
      await db.contact.createMany({
        data: [
          { ownerId: inviter.id, userId: user.id },
          { ownerId: user.id, userId: inviter.id },
        ],
      });
    }

    // Seed demo chats so the app feels alive right away (Zoya only)
    await seedUserChats(user.id);

    const token = await createSession(user.id);
    return jsonOk({
      token,
      invitedBy: inviter?.name || null,
      me: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        about: user.about,
        avatarColor: user.avatarColor,
        avatarEmoji: user.avatarEmoji,
        avatarUrl: user.avatarUrl,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen.toISOString(),
        inviteCode,
        gbNumber,
        settings: parseSettings(user.settingsJson),
      },
    });
  } catch (e) {
    console.error("signup error", e);
    return jsonError("Signup failed — please try again", 500);
  }
}
