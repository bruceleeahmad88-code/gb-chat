import { db } from "@/lib/db";
import { getAuthUser, jsonError, jsonOk } from "@/lib/auth";

/** GET /api/users — PRIVATE directory.
 *  Returns ONLY: your AI contact (bot) + people you invited / who invited you.
 *  No global user list — strangers can never see or message each other.
 *  Per-account contact meta (favourite, customName) is applied here. */
export async function GET(req: Request) {
  const me = await getAuthUser(req);
  if (!me) return jsonError("Unauthorized", 401);
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  // my contact rows (people/bot I saved) + rows where someone linked me (invited me)
  const [myContacts, linkedMe, bots] = await Promise.all([
    db.contact.findMany({ where: { ownerId: me.id }, include: { user: true } }),
    db.contact.findMany({ where: { userId: me.id }, include: { owner: true } }),
    db.user.findMany({ where: { isBot: true } }),
  ]);

  // merge + dedupe
  const meta = new Map<string, { favourite: boolean; customName: string | null }>();
  const pool: typeof bots = [];
  const pushUser = (u: (typeof bots)[number], favourite = false, customName: string | null = null) => {
    if (u.id === me.id) return;
    if (meta.has(u.id)) {
      // favourite wins, customName wins
      const prev = meta.get(u.id)!;
      meta.set(u.id, {
        favourite: prev.favourite || favourite,
        customName: prev.customName || customName,
      });
      return;
    }
    meta.set(u.id, { favourite, customName });
    pool.push(u);
  };

  for (const c of myContacts) pushUser(c.user, c.favourite, c.customName);
  for (const c of linkedMe) pushUser(c.owner);
  for (const b of bots) pushUser(b);

  const users = pool
    .filter((u) => {
      if (!q) return true;
      const m = meta.get(u.id)!;
      return (
        (m.customName || u.name).toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const fa = meta.get(a.id)!.favourite ? 1 : 0;
      const fb = meta.get(b.id)!.favourite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      if (a.isBot !== b.isBot) return a.isBot ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 80)
    .map((u) => {
      const m = meta.get(u.id)!;
      return {
        id: u.id,
        name: m.customName || u.name,
        username: u.username,
        about: u.about,
        avatarColor: u.avatarColor,
        avatarEmoji: u.avatarEmoji,
        avatarUrl: u.avatarUrl,
        isBot: u.isBot,
        isOnline: u.isOnline,
        lastSeen: u.lastSeen.toISOString(),
        gbNumber: u.gbNumber,
        favourite: m.favourite,
        isCustomNamed: !!m.customName,
      };
    });

  return jsonOk({ users });
}
