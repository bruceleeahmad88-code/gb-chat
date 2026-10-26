import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom } from "@/lib/realtime";

/** Mark chat as read (updates lastReadAt + notifies sender ticks) */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
    include: { chat: { include: { participants: true } } },
  });
  if (!membership) return jsonError("Unauthorized", 403);

  const now = new Date();
  await db.chatParticipant.update({
    where: { chatId_userId: { chatId, userId: me.id } },
    data: { lastReadAt: now },
  });

  // mark others' messages as read and notify
  const otherIds = membership.chat.participants.map((p) => p.userId).filter((id) => id !== me.id);
  const updated = await db.message.updateMany({
    where: { chatId, senderId: { in: otherIds }, status: { not: "read" } },
    data: { status: "read" },
  });
  if (updated.count > 0) {
    broadcast(chatRoom(chatId), "message:status", {
      chatId,
      senderId: otherIds[0],
      status: "read",
      by: me.id,
    });
  }
  return jsonOk({ ok: true });
}
