import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";

/** GET chat detail with participants */
export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;

  const chat = await db.chat.findUnique({
    where: { id: chatId },
    include: { participants: { include: { user: true } } },
  });
  if (!chat) return jsonError("Chat not found", 404);
  const isMember = chat.participants.some((p) => p.userId === me.id);
  if (!isMember) return jsonError("Unauthorized", 403);

  const others = chat.participants.filter((p) => p.userId !== me.id).map((p) => p.user);
  const cMeta =
    chat.type === "individual" && others[0]
      ? await db.contact.findUnique({
          where: { ownerId_userId: { ownerId: me.id, userId: others[0].id } },
        })
      : null;
  const shownName = cMeta?.customName || others[0]?.name || "Unknown";

  return jsonOk({
    chat: {
      id: chat.id,
      type: chat.type,
      name: chat.type === "group" ? chat.name : shownName,
      emoji: chat.emoji,
      color: chat.color,
      about: chat.about,
      createdAt: chat.createdAt.toISOString(),
      participants: chat.participants.map((p) => ({
        id: p.user.id,
        name: p.user.id === others[0]?.id ? shownName : p.user.name,
        username: p.user.username,
        about: p.user.about,
        avatarColor: p.user.avatarColor,
        avatarEmoji: p.user.avatarEmoji,
        avatarUrl: p.user.avatarUrl,
        isBot: p.user.isBot,
        isOnline: p.user.isOnline,
        lastSeen: p.user.lastSeen.toISOString(),
        gbNumber: p.user.gbNumber,
        role: p.role,
      })),
    },
    contactMeta: {
      favourite: cMeta?.favourite || false,
      customName: cMeta?.customName || null,
    },
    me: { id: me.id },
  });
}

/** Update group (name, about, emoji) — admin only */
export async function PUT(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const chat = await db.chat.findUnique({ where: { id: chatId }, include: { participants: true } });
  if (!chat || chat.type !== "group") return jsonError("Chat not found", 404);
  const myRole = chat.participants.find((p) => p.userId === me.id)?.role;
  if (myRole !== "admin") return jsonError("Only the admin can edit the group", 403);

  const body = await req.json();
  const data: Record<string, string> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (typeof body.about === "string") data.about = body.about.slice(0, 200);
  if (typeof body.emoji === "string" && body.emoji) data.emoji = body.emoji.slice(0, 4);
  await db.chat.update({ where: { id: chatId }, data });

  for (const p of chat.participants) {
    broadcast(userRoom(p.userId), "chats:invalidate", { chatId });
  }
  broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
  return jsonOk({ ok: true });
}

/** Add member to group (admin) */
export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const chat = await db.chat.findUnique({ where: { id: chatId }, include: { participants: true } });
  if (!chat || chat.type !== "group") return jsonError("Chat not found", 404);
  const myRole = chat.participants.find((p) => p.userId === me.id)?.role;
  if (myRole !== "admin") return jsonError("Only the admin can add members", 403);

  const body = await req.json();
  const userId = String(body.userId || "");
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return jsonError("User not found", 404);
  const already = chat.participants.some((p) => p.userId === userId);
  if (already) return jsonOk({ ok: true });

  await db.chatParticipant.create({ data: { chatId, userId, role: "member" } });
  await db.message.create({
    data: { chatId, senderId: me.id, type: "system", content: `${me.name} added ${u.name}` },
  });
  await db.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
  broadcast(userRoom(userId), "chats:invalidate", { chatId });
  broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
  return jsonOk({ ok: true });
}

/** Exit group */
export async function DELETE(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { chatId } = await ctx.params;
  const chat = await db.chat.findUnique({ where: { id: chatId }, include: { participants: true } });
  if (!chat || chat.type !== "group") return jsonError("Chat not found", 404);

  await db.chatParticipant.deleteMany({ where: { chatId, userId: me.id } });
  await db.message.create({
    data: { chatId, senderId: me.id, type: "system", content: `${me.name} left the group` },
  });
  for (const p of chat.participants) {
    if (p.userId !== me.id) broadcast(userRoom(p.userId), "chats:invalidate", { chatId });
  }
  broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
  return jsonOk({ ok: true });
}
