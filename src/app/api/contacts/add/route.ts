import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { findByNumberOrCode } from "@/lib/gb-number";
import { broadcast, userRoom } from "@/lib/realtime";

/** POST /api/contacts/add — add a contact by GB number or invite code.
 *  Exactly like saving a phone number on WhatsApp: both sides become
 *  private contacts instantly and can chat right away. */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  if (!code) return jsonError("Enter your friend's GB number or invite code");

  const target = await findByNumberOrCode(code);
  if (!target) return jsonError("No account found with this number or code", 404);
  if (target.id === me.id) return jsonError("That's your own GB number 🙂");

  const existed = await db.contact.findUnique({
    where: { ownerId_userId: { ownerId: me.id, userId: target.id } },
  });

  // mutual private contacts — dono ke lists me ek sath
  await db.contact.upsert({
    where: { ownerId_userId: { ownerId: me.id, userId: target.id } },
    update: {},
    create: { ownerId: me.id, userId: target.id },
  });
  await db.contact.upsert({
    where: { ownerId_userId: { ownerId: target.id, userId: me.id } },
    update: {},
    create: { ownerId: target.id, userId: me.id },
  });

  broadcast(userRoom(me.id), "chats:invalidate", { reason: "contact-added" });
  broadcast(userRoom(target.id), "chats:invalidate", { reason: "contact-added" });

  return jsonOk({
    already: !!existed,
    user: {
      id: target.id,
      name: target.name,
      username: target.username,
      gbNumber: target.gbNumber,
      avatarColor: target.avatarColor,
      avatarEmoji: target.avatarEmoji,
      avatarUrl: target.avatarUrl,
      isBot: target.isBot,
    },
  });
}
