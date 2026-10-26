import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { serializeMsg } from "@/lib/bots";

/** GET all starred messages of current user */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const memberships = await db.chatParticipant.findMany({
    where: { userId: me.id },
    select: { chatId: true },
  });
  const chatIds = memberships.map((m) => m.chatId);

  const messages = await db.message.findMany({
    where: { starred: true, chatId: { in: chatIds } },
    orderBy: { createdAt: "desc" },
    include: { sender: true },
    take: 200,
  });

  return jsonOk({ messages: messages.map(serializeMsg) });
}
