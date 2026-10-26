import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** GET: export user's data as JSON (backup feature) */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const myChats = await db.chatParticipant.findMany({
    where: { userId: me.id },
    include: {
      chat: { include: { messages: { orderBy: { createdAt: "asc" }, include: { sender: true } } } },
    },
  });

  const backup = {
    app: "GB Chat",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    profile: { name: me.name, username: me.username, email: me.email, about: me.about },
    chats: myChats.map((p) => ({
      chatId: p.chatId,
      type: p.chat.type,
      name: p.chat.type === "group" ? p.chat.name : undefined,
      messages: p.chat.messages
        .filter((m) => !m.deletedForIds.split(",").includes(me.id))
        .map((m) => ({
          from: m.sender.username,
          type: m.type,
          content: m.content,
          starred: m.starred,
          at: m.createdAt.toISOString(),
        })),
    })),
  };

  return jsonOk(backup);
}
