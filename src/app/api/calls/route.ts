import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, userRoom } from "@/lib/realtime";

/** GET call log for current user */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const calls = await db.callLog.findMany({
    where: { OR: [{ callerId: me.id }, { receiverId: me.id }] },
    orderBy: { createdAt: "desc" },
    include: { caller: true, receiver: true },
    take: 100,
  });

  // per-account custom names (renamed contacts) in the call log
  const myContacts = await db.contact.findMany({ where: { ownerId: me.id } });
  const nameOf = new Map(myContacts.map((c) => [c.userId, c.customName || null]));

  return jsonOk({
    calls: calls.map((c) => {
      const outgoing = c.callerId === me.id;
      const other = outgoing ? c.receiver : c.caller;
      // WhatsApp perspective mapping: the caller never sees their own row as red
      // "Missed" — an offline/no-answer dial shows as plain "Outgoing" for them,
      // while the callee's view of the SAME row stays "Missed" (red).
      const outcome = outgoing && c.outcome === "missed" ? "outgoing" : c.outcome;
      return {
        id: c.id,
        type: c.type,
        outcome,
        duration: c.duration,
        createdAt: c.createdAt.toISOString(),
        outgoing,
        other: {
          id: other.id,
          name: nameOf.get(other.id) || other.name,
          username: other.username,
          about: other.about,
          avatarColor: other.avatarColor,
          avatarEmoji: other.avatarEmoji,
          avatarUrl: other.avatarUrl,
          isBot: other.isBot,
          isOnline: other.isOnline,
          lastSeen: other.lastSeen.toISOString(),
          gbNumber: other.gbNumber,
        },
      };
    }),
  });
}

/** POST: log a call (dialpad or chat call button) */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json();
  const receiverId = String(body.receiverId || "");
  const type = body.type === "video" ? "video" : "audio";
  const outcome = ["missed", "outgoing", "incoming", "declined", "ended"].includes(body.outcome)
    ? body.outcome
    : "ended";
  const duration = Math.max(0, Math.min(parseInt(body.duration) || 0, 7200));

  const receiver = await db.user.findUnique({ where: { id: receiverId } });
  if (!receiver) return jsonError("User not found", 404);

  const call = await db.callLog.create({
    data: { callerId: me.id, receiverId, type, outcome, duration },
  });
  broadcast(userRoom(receiverId), "calls:invalidate", { callId: call.id });
  return jsonOk({ ok: true, id: call.id });
}

/** DELETE: clear MY ENTIRE call history (WhatsApp "Clear call history") */
export async function DELETE(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const res = await db.callLog.deleteMany({
    where: { OR: [{ callerId: me.id }, { receiverId: me.id }] },
  });
  return jsonOk({ ok: true, cleared: res.count });
}
