import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";
import { broadcast, userRoom } from "@/lib/realtime";

const BG_COLORS = ["0ea47a", "0288d1", "7b1fa2", "e91e63", "f57c00", "e53935", "3949ab", "607d8b"];

/** GET statuses grouped by user (mine first) */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);

  const now = new Date();
  const statuses = await db.statusUpdate.findMany({
    where: { expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    include: { user: true, views: { include: { viewer: true } } },
  });

  // only show statuses of users I share a chat with (contacts) + my own
  const myChats = await db.chatParticipant.findMany({
    where: { userId: me.id },
    include: { chat: { include: { participants: true } } },
  });
  const contactIds = new Set<string>();
  for (const p of myChats) {
    for (const cp of p.chat.participants) contactIds.add(cp.userId);
  }

  // per-account custom names (e.g. renamed bot) for status authors + reactors/viewers
  const myContacts = await db.contact.findMany({ where: { ownerId: me.id } });
  const nameOf = new Map(myContacts.map((c) => [c.userId, c.customName || null]));
  const shown = (id: string, realName: string) => nameOf.get(id) || realName;

  const groups: Record<string, unknown> = {};
  for (const s of statuses) {
    if (s.userId !== me.id && !contactIds.has(s.userId)) continue;
    if (!groups[s.userId]) {
      groups[s.userId] = {
        user: {
          id: s.user.id,
          name: shown(s.user.id, s.user.name),
          username: s.user.username,
          about: s.user.about,
          avatarColor: s.user.avatarColor,
          avatarEmoji: s.user.avatarEmoji,
          avatarUrl: s.user.avatarUrl,
          isBot: s.user.isBot,
          isOnline: s.user.isOnline,
          lastSeen: s.user.lastSeen.toISOString(),
        },
        allViewed: true,
        items: [] as unknown[],
      };
    }
    const g = groups[s.userId] as { allViewed: boolean; items: unknown[] };
    const myView = s.views.find((v) => v.viewerId === me.id);
    const viewed = !!myView;
    if (!viewed && s.userId !== me.id) g.allViewed = false;
    g.items.push({
      id: s.id,
      userId: s.userId,
      type: s.type,
      content: s.content,
      mediaSeed: s.mediaSeed,
      bg: s.bg,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      viewed,
      myReaction: myView?.reaction || null,
      reactions: s.views
        .filter((v) => v.reaction)
        .map((v) => ({ emoji: v.reaction, viewerId: v.viewerId, name: shown(v.viewerId, v.viewer.name) })),
      viewCount: s.views.length,
      viewers: s.views.map((v) => ({
        id: v.viewerId,
        name: shown(v.viewerId, v.viewer.name),
        avatarUrl: v.viewer.avatarUrl,
        avatarColor: v.viewer.avatarColor,
        viewedAt: v.viewedAt.toISOString(),
      })),
      user: {
        id: s.user.id,
        name: shown(s.user.id, s.user.name),
        username: s.user.username,
        avatarColor: s.user.avatarColor,
        avatarEmoji: s.user.avatarEmoji,
        avatarUrl: s.user.avatarUrl,
      },
    });
  }

  const list = Object.values(groups).sort((a, b) => {
    const aMine = (a as { user: { id: string } }).user.id === me.id;
    const bMine = (b as { user: { id: string } }).user.id === me.id;
    if (aMine !== bMine) return aMine ? -1 : 1;
    return 0;
  });

  return jsonOk({ groups: list });
}

/** POST create a status. body.asUserId = post as that user (owner access, bots only — e.g. Zoya) */
export async function POST(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const body = await req.json();
  const type = body.type === "image" ? "image" : body.type === "video" ? "video" : "text";
  const content = String(body.content || "").slice(0, 700);
  if (type === "text" && !content.trim()) return jsonError("Status text is empty");
  const bg = BG_COLORS.includes(String(body.bg)) ? String(body.bg) : BG_COLORS[0];

  // owner access: post a status on behalf of the bot account (e.g. Zoya)
  let userId = me.id;
  if (body.asUserId && body.asUserId !== me.id) {
    const target = await db.user.findUnique({ where: { id: String(body.asUserId) } });
    if (!target) return jsonError("User not found", 404);
    if (!target.isBot) return jsonError("You can only post as your AI contact", 403);
    userId = target.id;
  }

  const status = await db.statusUpdate.create({
    data: {
      userId,
      type,
      content,
      mediaSeed: body.mediaSeed ? String(body.mediaSeed).slice(0, 200) : null,
      bg,
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  broadcast(userRoom(me.id), "status:invalidate", { statusId: status.id });
  broadcast(userRoom(userId), "status:invalidate", { statusId: status.id });
  return jsonOk({ ok: true, id: status.id });
}
