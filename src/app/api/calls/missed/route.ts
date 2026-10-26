import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, userRoom } from "@/lib/realtime";

/** ROUND 12 — caller reports the receiver was OFFLINE when they dialed.
 *  WhatsApp behaviour: the offline user still gets a red "Missed call" row in
 *  their call log AND a notification the moment they come back online.
 *  The caller is authenticated; this endpoint writes the CALLEE-side row. */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const receiverId = String(body.receiverId || "");
  const type = body.type === "video" ? "video" : "audio";
  if (!receiverId || receiverId === me.id) return jsonError("Invalid receiver", 400);

  const receiver = await db.user.findUnique({ where: { id: receiverId } });
  if (!receiver) return jsonError("User not found", 404);
  if (receiver.isBot) return jsonOk({ ok: true, skipped: "bot" }); // bots have no feed

  const call = await db.callLog.create({
    data: { callerId: me.id, receiverId, type, outcome: "missed", duration: 0 },
  });

  // live ping if the user is actually online on another device/tab
  broadcast(userRoom(receiverId), "call:missed", {
    callId: call.id,
    from: {
      id: me.id,
      name: me.name,
      avatarColor: me.avatarColor,
      avatarEmoji: me.avatarEmoji,
      avatarUrl: me.avatarUrl,
    },
    type,
    at: call.createdAt.toISOString(),
  });

  return jsonOk({ ok: true, id: call.id });
}
