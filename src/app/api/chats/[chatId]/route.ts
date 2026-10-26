import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";

/** POST /api/chats/[chatId] — CLEAR chat (WhatsApp-style): chat list me rehta hai,
 *  andar ke saare messages delete ho jate hain. */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
    include: { chat: { include: { participants: true } } },
  });
  if (!membership) return jsonError("Chat not found", 404);

  const res = await db.message.deleteMany({ where: { chatId } });
  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  await db.chatParticipant.update({
    where: { chatId_userId: { chatId, userId: me.id } },
    data: { lastReadAt: new Date() },
  });

  const otherIds = membership.chat.participants.map((p) => p.userId).filter((id) => id !== me.id);
  broadcast([chatRoom(chatId), userRoom(me.id), ...otherIds.map(userRoom)], "chats:invalidate", {
    chatId,
    cleared: true,
  });

  return jsonOk({ ok: true, cleared: res.count });
}

/** DELETE chat — mere liye chat list se hamesha ke liye hata do */
export async function DELETE(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
    include: { chat: { include: { participants: true } } },
  });
  if (!membership) return jsonError("Chat not found", 404);

  const otherIds = membership.chat.participants.map((p) => p.userId).filter((id) => id !== me.id);

  await db.chatParticipant.delete({
    where: { chatId_userId: { chatId, userId: me.id } },
  });

  // agar koi participant nahi bacha to poora chat (messages samet) delete
  const remaining = await db.chatParticipant.count({ where: { chatId } });
  if (remaining === 0) {
    await db.chat.delete({ where: { id: chatId } }); // cascade: messages
  }

  broadcast([chatRoom(chatId), userRoom(me.id), ...otherIds.map(userRoom)], "chats:invalidate", {
    chatId,
    deleted: true,
  });

  return jsonOk({ ok: true });
}
