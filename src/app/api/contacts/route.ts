import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** PUT /api/contacts — update MY private contact entry for a user:
 *  body: { userId, favourite?: boolean, customName?: string }  (customName "" = reset)
 *  Works for the AI contact (bot) and for invited contacts only. */
export async function PUT(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json().catch(() => ({}));

  const userId = String(body.userId || "");
  if (!userId || userId === me.id) return jsonError("Invalid user", 400);

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return jsonError("User not found", 404);

  // privacy: only bot or already-linked contacts can be saved
  const allowed =
    target.isBot ||
    (await db.contact.findFirst({
      where: { OR: [{ ownerId: me.id, userId }, { ownerId: userId, userId: me.id }] },
    }));
  if (!allowed) return jsonError("You can only save people you've invited", 403);

  const data: { favourite?: boolean; customName?: string | null } = {};
  if (typeof body.favourite === "boolean") data.favourite = body.favourite;
  if (typeof body.customName === "string") {
    const name = body.customName.trim().slice(0, 40);
    data.customName = name || null; // "" resets to the real name
  }

  const contact = await db.contact.upsert({
    where: { ownerId_userId: { ownerId: me.id, userId } },
    update: data,
    create: { ownerId: me.id, userId, ...data },
  });

  return jsonOk({
    contact: {
      userId: contact.userId,
      favourite: contact.favourite,
      customName: contact.customName,
    },
  });
}

/** GET /api/contacts — my contact list with meta (private) */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (userId) {
    const c = await db.contact.findUnique({
      where: { ownerId_userId: { ownerId: me.id, userId } },
    });
    return jsonOk({
      contact: c
        ? { userId: c.userId, favourite: c.favourite, customName: c.customName }
        : { userId, favourite: false, customName: null },
    });
  }

  const rows = await db.contact.findMany({
    where: { ownerId: me.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  return jsonOk({
    contacts: rows.map((c) => ({
      userId: c.userId,
      favourite: c.favourite,
      customName: c.customName,
      name: c.user.name,
      username: c.user.username,
      avatarUrl: c.user.avatarUrl,
      avatarColor: c.user.avatarColor,
      isBot: c.user.isBot,
    })),
  });
}
