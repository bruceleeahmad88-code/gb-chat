import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";
import { scheduleBotReply, serializeMsg } from "@/lib/bots";
import { parseSettings } from "@/lib/settings";

/** GET messages of a chat */
export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
  });
  if (!membership) return jsonError("Unauthorized", 403);

  const messages = await db.message.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { sender: true },
  });

  return jsonOk({
    messages: messages
      .filter((m) => !m.deletedForIds.split(",").filter(Boolean).includes(me.id))
      .map(serializeMsg),
  });
}

/** POST send a message */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const body = await req.json();

  const membership = await db.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
    include: { chat: { include: { participants: true } } },
  });
  if (!membership) return jsonError("Unauthorized", 403);

  const type = ["text", "image", "video", "audio", "document", "location", "contact", "gif"].includes(body.type)
    ? body.type
    : "text";
  const content = String(body.content || "").slice(0, 4000);
  if (type === "text" && !content.trim()) return jsonError("Message is empty");

  // Scheduled message (GB feature): deliver after N ms
  const scheduleMs = Math.max(0, Math.min(parseInt(body.scheduleMs) || 0, 3600_000));
  if (scheduleMs > 0) {
    const replyId = body.replyToId ? String(body.replyToId) : null;
    setTimeout(() => {
      (async () => {
        try {
          const stillMember = await db.chatParticipant.findUnique({
            where: { chatId_userId: { chatId, userId: me.id } },
          });
          if (!stillMember) return;
          const scheduled = await db.message.create({
            data: { chatId, senderId: me.id, type, content, status: "sent" },
            include: { sender: true },
          });
          await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
          const otherIds2 = (
            await db.chatParticipant.findMany({ where: { chatId } })
          )
            .map((p) => p.userId)
            .filter((id) => id !== me.id);
          const s = serializeMsg(scheduled);
          broadcast([chatRoom(chatId), userRoom(me.id), ...otherIds2.map(userRoom)], "message:new", {
            message: s,
          });
          broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
          void replyId;
        } catch {
          /* ignore */
        }
      })();
    }, scheduleMs);
    return jsonOk({ scheduled: true, deliverAt: new Date(Date.now() + scheduleMs).toISOString() });
  }

  // reply context
  let reply: {
    replyToId: string;
    replyToContent: string;
    replyToSender: string;
    replyToType: string;
  } | null = null;
  if (body.replyToId) {
    const orig = await db.message.findUnique({ where: { id: String(body.replyToId) }, include: { sender: true } });
    if (orig && orig.chatId === chatId) {
      reply = {
        replyToId: orig.id,
        replyToContent: orig.content || `[${orig.type}]`,
        replyToSender: orig.sender.name,
        replyToType: orig.type,
      };
    }
  }

  const msg = await db.message.create({
    data: {
      chatId,
      senderId: me.id,
      type,
      content,
      mediaSeed: body.mediaSeed ? String(body.mediaSeed).slice(0, 200) : null,
      mediaName: body.mediaName ? String(body.mediaName).slice(0, 120) : null,
      mediaMeta: body.mediaMeta ? String(body.mediaMeta).slice(0, 60) : null,
      ...(reply || {}),
    },
    include: { sender: true },
  });

  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  await db.chatParticipant.update({
    where: { chatId_userId: { chatId, userId: me.id } },
    data: { lastReadAt: new Date() },
  });

  const serialized = serializeMsg(msg);
  // notify everyone in the chat room + user rooms of other participants
  const otherIds = membership.chat.participants.map((p) => p.userId).filter((id) => id !== me.id);
  broadcast([chatRoom(chatId), ...otherIds.map(userRoom)], "message:new", { message: serialized });
  broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
  for (const id of otherIds) broadcast(userRoom(id), "chats:invalidate", { chatId });

  // simulate delivery tick for individual chats
  if (membership.chat.type === "individual") {
    setTimeout(() => {
      db.message
        .update({ where: { id: msg.id }, data: { status: "delivered" } })
        .then(() => {
          broadcast(chatRoom(chatId), "message:status", {
            chatId,
            senderId: me.id,
            status: "delivered",
            messageId: msg.id,
          });
        })
        .catch(() => {});
    }, 600);
  }

  // bot auto-reply in individual chats with bots
  const botMember = membership.chat.participants.find((p) => p.userId !== me.id);
  if (botMember && membership.chat.type === "individual") {
    const otherUser = await db.user.findUnique({ where: { id: botMember.userId } });
    if (otherUser?.isBot) {
      // media messages get marker text (Jannat reacts per media type)
      let marker =
        type === "image"
          ? "[photo]"
          : type === "video"
            ? "[video]"
            : type === "document"
              ? "[document]"
              : type === "audio"
                ? "[audio]"
                : type === "gif"
                  ? "[gif]"
                  : content;
      if (body.statusReply) marker = `${marker} (he is replying to your status)`;
      scheduleBotReply(chatId, botMember.userId, me.id, marker, {
        clientTime: typeof body.clientTime === "number" ? body.clientTime : undefined,
        tzOffset: typeof body.tzOffset === "number" ? body.tzOffset : undefined,
      });
    }
  }

  // Auto Reply (GB feature): jab aap busy hon aur koi user (non-bot) aapko msg bheje
  const mySettings = parseSettings(me.settingsJson);
  if (mySettings.gb.autoReply && membership.chat.type === "individual" && otherIds.length === 1) {
    const sender = await db.user.findUnique({ where: { id: otherIds[0] } });
    if (sender && !sender.isBot) {
      setTimeout(() => {
        db.message
          .create({
            data: {
              chatId,
              senderId: me.id,
              content: `[Auto-Reply] ${mySettings.gb.autoReplyText}`,
              status: "delivered",
            },
          })
          .then((auto) => {
            const s = serializeMsg(auto as never);
            broadcast(chatRoom(chatId), "message:new", { message: s });
            broadcast(userRoom(otherIds[0]), "message:new", { message: s });
          })
          .catch(() => {});
      }, 2500);
    }
  }

  return jsonOk({ message: serialized });
}
