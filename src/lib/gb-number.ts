/** GB Chat — permanent GB number identity (WhatsApp-style).
 *  Every account gets ONE fixed number (e.g. 8831244567 → shown as +88 3123 44567).
 *  Share it like a phone number: anyone who adds it becomes a mutual contact —
 *  no link needed. Invite codes still work everywhere too. */
import crypto from "crypto";
import { db } from "@/lib/db";

/** the Bot's fixed number (never changes) */
export const BOT_GB_NUMBER = "8800000000";

/** generate a fresh unique 10-digit GB number (starts with the 88 service code) */
export function genGbNumber(): string {
  let n = "88";
  for (let i = 0; i < 8; i++) n += String(crypto.randomBytes(1)[0] % 10);
  return n;
}

/** "+88 3123 44567", spaces, dashes — sab digits nikal kar compare karo */
export function normalizeGbInput(input: string): string {
  return String(input || "").replace(/[^0-9]/g, "");
}

/** backfill for accounts created before the GB number system — runs on login/me */
export async function ensureGbNumber(user: { id: string; gbNumber: string | null }): Promise<string> {
  if (user.gbNumber) return user.gbNumber;
  let n = genGbNumber();
  while (await db.user.findUnique({ where: { gbNumber: n } })) n = genGbNumber();
  await db.user.update({ where: { id: user.id }, data: { gbNumber: n } });
  return n;
}

/** find a user by GB number (forgiving: last 8 digits match) OR invite code */
export async function findByNumberOrCode(code: string) {
  const raw = String(code || "").trim().toLowerCase();
  if (!raw) return null;

  // invite code form: gbxxxxxx (letters) — demo/bot accounts excluded for safety
  if (/^gb[a-z0-9]{4,10}$/.test(raw)) {
    const u = await db.user.findUnique({ where: { inviteCode: raw } });
    if (!u || u.email.endsWith("@gbchat.demo")) return null;
    return u;
  }

  // GB number form: digits only (accept with/without +88, spaces, dashes)
  const digits = normalizeGbInput(raw);
  if (digits.length < 8) return null;
  const tail = digits.slice(-8);
  const u = await db.user.findFirst({ where: { gbNumber: { endsWith: tail } } });
  return u;
}
