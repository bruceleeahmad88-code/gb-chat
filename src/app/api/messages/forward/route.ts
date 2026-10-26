import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";
import { serializeMsg } from "@/lib/bots";

/** Forward a message to multiple chats */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json();
  const messageId = String(body.messageId || "");
  const chatIds: string[] = Array.isArray(body.chatIds) ? body.chatIds : [];
  if (!messageId || chatIds.length === 0) return jsonError("Select a message and chats");

  const original = await db.message.findUnique({ where: { id: messageId } });
  if (!original) return jsonError("Message not found", 404);

  for (const chatId of chatIds) {
    const membership = await db.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: me.id } },
      include: { chat: { include: { participants: true } } },
    });
    if (!membership) continue;

    const msg = await db.message.create({
      data: {
        chatId,
        senderId: me.id,
        type: original.type,
        content: original.content,
        mediaSeed: original.mediaSeed,
        mediaName: original.mediaName,
        mediaMeta: original.mediaMeta,
      },
      include: { sender: true },
    });
    await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    const otherIds = membership.chat.participants.map((p) => p.userId).filter((i) => i !== me.id);
    const s = serializeMsg(msg);
    broadcast([chatRoom(chatId), ...otherIds.map(userRoom)], "message:new", { message: s });
    broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
    for (const i of otherIds) broadcast(userRoom(i), "chats:invalidate", { chatId });

    if (membership.chat.type === "individual") {
      const botMember = membership.chat.participants.find((p) => p.userId !== me.id);
      if (botMember) {
        const otherUser = await db.user.findUnique({ where: { id: botMember.userId } });
        if (otherUser?.isBot) {
          const { scheduleBotReply } = await import("@/lib/bots");
          scheduleBotReply(chatId, botMember.userId, me.id, original.content);
        }
      }
    }
  }

  return jsonOk({ ok: true, count: chatIds.length });
}
