import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";

/** DELETE message: ?scope=me|everyone */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "everyone" ? "everyone" : "me";

  const msg = await db.message.findUnique({ where: { id }, include: { chat: { include: { participants: true } } } });
  if (!msg) return jsonError("Message not found", 404);
  const isMember = msg.chat.participants.some((p) => p.userId === me.id);
  if (!isMember) return jsonError("Unauthorized", 403);

  if (scope === "everyone") {
    if (msg.senderId !== me.id) return jsonError("You can only delete your own message", 403);
    await db.message.update({ where: { id }, data: { deletedForAll: true, content: "" } });
  } else {
    const ids = new Set(msg.deletedForIds.split(",").filter(Boolean));
    ids.add(me.id);
    await db.message.update({ where: { id }, data: { deletedForIds: Array.from(ids).join(",") } });
  }

  const participantIds = msg.chat.participants.map((p) => p.userId);
  broadcast(
    [chatRoom(msg.chatId), ...participantIds.map(userRoom)],
    "message:deleted",
    { chatId: msg.chatId, messageId: id, scope, by: me.id }
  );
  broadcast(chatRoom(msg.chatId), "chats:invalidate", { chatId: msg.chatId });
  return jsonOk({ ok: true });
}

/** PUT star/unstar message */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { id } = await ctx.params;
  const body = await req.json();
  const starred = Boolean(body.starred);
  const msg = await db.message.findUnique({ where: { id }, include: { chat: { include: { participants: true } } } });
  if (!msg) return jsonError("Message not found", 404);
  const isMember = msg.chat.participants.some((p) => p.userId === me.id);
  if (!isMember) return jsonError("Unauthorized", 403);
  await db.message.update({ where: { id }, data: { starred } });
  broadcast(userRoom(me.id), "starred:invalidate", {});
  return jsonOk({ ok: true });
}
