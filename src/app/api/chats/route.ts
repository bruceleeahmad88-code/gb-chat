import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, userRoom } from "@/lib/realtime";
import { ChatSummary } from "@/lib/types";

function displayName(
  chat: { type: string; name: string | null },
  others: { name: string }[]
): string {
  if (chat.type === "group") return chat.name || "Group";
  return others[0]?.name || "Unknown";
}

export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  // my per-account contact overrides (custom names / favourites) in one shot
  const myContacts = await db.contact.findMany({ where: { ownerId: me.id } });
  const contactByUser = new Map(myContacts.map((c) => [c.userId, c]));

  const myParticipations = await db.chatParticipant.findMany({
    where: { userId: me.id },
    include: {
      chat: {
        include: {
          participants: { include: { user: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: true } },
        },
      },
    },
  });

  const chats: ChatSummary[] = [];
  for (const p of myParticipations) {
    const chat = p.chat;
    const others = chat.participants.filter((cp) => cp.userId !== me.id).map((cp) => cp.user);

    const unread = await db.message.count({
      where: {
        chatId: chat.id,
        senderId: { not: me.id },
        createdAt: { gt: p.lastReadAt },
        deletedForAll: false,
      },
    });

    const last = chat.messages[0];
    const other = others[0];
    const cMeta = other ? contactByUser.get(other.id) : undefined;
    const shownName = cMeta?.customName || other?.name || "Unknown";

    chats.push({
      id: chat.id,
      type: chat.type === "group" ? "group" : "individual",
      name: chat.type === "group" ? displayName(chat, others) : shownName,
      emoji: chat.emoji,
      color: chat.color,
      about: chat.about || undefined,
      pinned: p.pinned,
      muted: p.muted,
      archived: p.archived,
      unread,
      updatedAt: chat.updatedAt.toISOString(),
      otherUser: other
        ? {
            id: other.id,
            name: cMeta?.customName || other.name,
            username: other.username,
            about: other.about,
            avatarColor: other.avatarColor,
            avatarEmoji: other.avatarEmoji,
            avatarUrl: other.avatarUrl,
            isBot: other.isBot,
            isOnline: other.isOnline,
            lastSeen: other.lastSeen.toISOString(),
            gbNumber: other.gbNumber,
            favourite: cMeta?.favourite || false,
          }
        : undefined,
      participants: chat.participants.map((cp) => ({
        id: cp.user.id,
        name: cp.user.id === other?.id ? shownName : cp.user.name,
        username: cp.user.username,
        about: cp.user.about,
        avatarColor: cp.user.avatarColor,
        avatarEmoji: cp.user.avatarEmoji,
        avatarUrl: cp.user.avatarUrl,
        isBot: cp.user.isBot,
        isOnline: cp.user.isOnline,
        lastSeen: cp.user.lastSeen.toISOString(),
        gbNumber: cp.user.gbNumber,
        role: cp.role,
      })) as never,
      lastMessage: last
        ? {
            id: last.id,
            type: last.type,
            content: last.deletedForAll ? "This message was deleted" : last.content,
            senderId: last.senderId,
            senderName: last.senderId === other?.id ? shownName : last.sender.name,
            status: last.status,
            deletedForAll: last.deletedForAll,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    });
  }

  // pinned first, then most recent
  chats.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return jsonOk({ chats });
}

/** Create chat: individual (with username) or group (name + member ids) */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json();

  if (body.type === "group") {
    const name = String(body.name || "").trim();
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : [];
    if (name.length < 2) return jsonError("Enter a group name");
    const members = await db.user.findMany({ where: { id: { in: memberIds } } });
    if (members.length === 0) return jsonError("Select at least 1 member");

    const chat = await db.chat.create({
      data: {
        type: "group",
        name,
        about: typeof body.about === "string" ? body.about.slice(0, 200) : undefined,
        emoji: typeof body.emoji === "string" && body.emoji ? body.emoji.slice(0, 4) : "👥",
        color: typeof body.color === "string" && body.color ? body.color : "7b1fa2",
        createdBy: me.id,
      },
    });
    await db.chatParticipant.createMany({
      data: [
        { chatId: chat.id, userId: me.id, role: "admin" },
        ...members.map((m) => ({ chatId: chat.id, userId: m.id, role: "member" })),
      ],
    });
    await db.message.create({
      data: {
        chatId: chat.id,
        senderId: me.id,
        type: "system",
        content: `${me.name} created group "${name}"`,
      },
    });
    for (const m of members) broadcast(userRoom(m.id), "chats:invalidate", { chatId: chat.id });
    return jsonOk({ chatId: chat.id });
  }

  // individual
  const username = String(body.username || "").trim().toLowerCase();
  const other = await db.user.findUnique({ where: { username } });
  if (!other) return jsonError("No user found with this username");
  if (other.id === me.id) return jsonError("You can't chat with yourself");

  // PRIVACY: sirf bot ya invited/linked contacts — koi random user chat start nahi kar sakta
  if (!other.isBot) {
    const linked = await db.contact.findFirst({
      where: { OR: [{ ownerId: me.id, userId: other.id }, { ownerId: other.id, userId: me.id }] },
    });
    if (!linked)
      return jsonError("You can only chat with people you've invited (or who invited you)");
  }

  // find existing individual chat
  const myChats = await db.chatParticipant.findMany({
    where: { userId: me.id },
    include: { chat: { include: { participants: true } } },
  });
  const existing = myChats.find(
    (p) =>
      p.chat.type === "individual" &&
      p.chat.participants.some((cp) => cp.userId === other.id)
  );
  if (existing) return jsonOk({ chatId: existing.chatId });

  const chat = await db.chat.create({
    data: { type: "individual", createdBy: me.id },
  });
  await db.chatParticipant.createMany({
    data: [
      { chatId: chat.id, userId: me.id },
      { chatId: chat.id, userId: other.id },
    ],
  });
  broadcast(userRoom(other.id), "chats:invalidate", { chatId: chat.id });
  return jsonOk({ chatId: chat.id });
}
