/** GB Chat contacts & seeding — original implementation
 *  Only one bot, simply named "Bot". NOT a girlfriend — a helpful assistant that
 *  texts like a real human (short, direct, gender-adaptive via the LLM persona).
 *  Its DP spot is EMPTY by default (plain default avatar) — the owner can rename
 *  the bot AND set any DP anytime (Contact info → Rename / camera icon).
 *  Reply rule: one message burst = exactly ONE reply. Slash-commands handled first.
 */
import { db } from "@/lib/db";
import { broadcast, chatRoom, userRoom } from "@/lib/realtime";
import { hashPassword } from "@/lib/auth";
import { botAIReply } from "@/lib/jannat-ai";
import { handleBotCommand, isBotCommand } from "@/lib/bot-commands";
import { BOT_GB_NUMBER } from "@/lib/gb-number";

export interface BotDef {
  email: string;
  username: string;
  name: string;
  about: string;
  avatarColor: string;
  avatarEmoji: string;
  avatarUrl?: string;
  opener: string[];
}

/** The one and only bot — "Bot". DP stays EMPTY (no photo) by default; the owner can
 *  set any photo from Contact info → camera icon. email unchanged since v1 so the
 *  same account row (and chats) survive across renames. */
export const BOT: BotDef = {
  email: "jannat@gbchat.demo",
  username: "bot",
  name: "Bot",
  about: "Here to help ⚡ Send /help",
  avatarColor: "6a7175",
  avatarEmoji: "",
  avatarUrl: "",
  opener: ["Hi! I'm your Bot 🤖 Send /help to see everything I can do."],
};

/** default DP — EMPTY (the plain default avatar) — used when the owner resets the photo */
export const BOT_DEFAULT_AVATAR: string = "";

/** legacy export name kept for compatibility */
export const JANNAT = BOT;

const DEMO_DOMAIN = "@gbchat.demo";

/** No demo user/bot other than Bot may exist — delete all others */
async function removeLegacyBots(): Promise<void> {
  const legacy = await db.user.findMany({
    where: { email: { endsWith: DEMO_DOMAIN }, NOT: { email: BOT.email } },
  });
  for (const u of legacy) {
    await db.user.delete({ where: { id: u.id } }); // cascades: chats/messages/status/calls links
  }
  // remove chats left without any member
  const orphans = await db.chat.findMany({
    where: { participants: { none: {} } },
    select: { id: true },
  });
  if (orphans.length) {
    await db.chat.deleteMany({ where: { id: { in: orphans.map((c) => c.id) } } });
  }
}

export async function ensureBots(): Promise<void> {
  await removeLegacyBots();

  await db.user.upsert({
    where: { email: BOT.email },
    update: {
      name: BOT.name,
      username: BOT.username,
      about: BOT.about,
      avatarColor: BOT.avatarColor, // neutral fallback colour behind the (empty) DP
      isBot: true,
      gbNumber: BOT_GB_NUMBER, // permanent identity — the Bot can be added by number too
      // NOTE: avatarUrl intentionally NOT reset here — the owner may have set a custom DP
    },
    create: {
      email: BOT.email,
      username: BOT.username,
      name: BOT.name,
      about: BOT.about,
      avatarColor: BOT.avatarColor,
      avatarEmoji: BOT.avatarEmoji,
      avatarUrl: BOT.avatarUrl,
      password: hashPassword(BOT.email),
      isBot: true,
      gbNumber: BOT_GB_NUMBER,
      isOnline: true,
      lastSeen: new Date(),
    },
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ------------------------------------------------------------------ */
/*  Fallback reply engine (LLM offline ke waqt) — helpful bot, human  */
/*  texting style. MEDIA MARKERS FIRST so a photo never gets a wrong  */
/*  canned line.                                                      */
/* ------------------------------------------------------------------ */

const BOT_DEFAULTS = [
  "Send /help to see what I can do 🙂",
  "Got it 👍",
  "Tell me more",
  "I'm here if you need anything ⚡",
  "Hmm, say that again?",
  "Okay 👌",
  "What else?",
];

function botFallbackReply(incoming: string): string {
  const t = incoming.toLowerCase().trim();

  // 1) MEDIA MARKERS FIRST
  if (/(\[photo\]|\[image\])/.test(t))
    return pickRandom(["Got the photo 👍", "Nice pic!", "Looks great 🔥"]);
  if (/\[video\]/.test(t))
    return pickRandom(["Got the video 👍", "Watched it — nice!"]);
  if (/\[document\]|\[file\]/.test(t))
    return pickRandom(["Got the file 👍", "Got it, checking 📄"]);
  if (/\[audio\]|\[voice\]/.test(t))
    return pickRandom(["Heard your voice note 🎙️", "Got your voice note 👍"]);
  if (/\[gif\]/.test(t))
    return pickRandom(["Haha nice GIF 😄", "That GIF made my day 😂", "Loved the GIF 🔥"]);

  // 2) conversation patterns — short, human, helpful
  if (/^(salam|assalam|asalam|aoa|slam|hi|hello|hey)\b/.test(t))
    return pickRandom(["Hey! How can I help?", "Hello 👋 what's up?"]);

  if (/(how are you|how r u|kaise ho|kya haal|how's it going|hows it going)/.test(t))
    return pickRandom(["I'm good! You?", "All good here — you?"]);

  if (/(help|madad|command|what can you do|kya kar sakte)/.test(t))
    return "Send /help to see all my commands 🙂";

  if (/(what are you doing|whatcha doing|kya kar)/.test(t))
    return pickRandom(["Waiting to help you ⚡", "Nothing much — need something?"]);

  if (/(good ?night|gud ?night|gn|sleep|so ja|going to bed)/.test(t))
    return pickRandom(["Good night 🌙", "Sleep well 🌙 talk tomorrow"]);

  if (/(good ?morning|gud ?morning|woke up|subha)/.test(t))
    return pickRandom(["Good morning ☀️", "Morning! Ready for the day?"]);

  if (/(sad|upset|tension|depress|alone|crying|cry|tired|stressed|worried)/.test(t))
    return pickRandom(["What happened? Tell me.", "Don't worry — I'm here. What's up?"]);

  if (/(thanks|thank you|thx)/.test(t))
    return pickRandom(["Anytime! 🙂", "Happy to help ⚡"]);

  if (/(bye|goodbye|see you|ttyl|talk later|gotta go|going now)/.test(t))
    return pickRandom(["Bye! Text me anytime 👋", "See you 👋"]);

  if (/(study|exam|test|work|office|duty|class|assignment|project)/.test(t))
    return pickRandom(["You've got this 💪", "Good luck! Tell me after 👍"]);

  if (/(haha|lol|hehe|😂|🤣|lmao)/.test(t))
    return pickRandom(["Hahaha 😄", "Glad I could amuse 😄"]);

  if (/^(ok|okay|hmm|hnm|fine|ji|achha|acha|theek)\.?$/.test(t))
    return pickRandom(["Ok 👍", "Alright 🙂"]);

  if (t.endsWith("?"))
    return pickRandom(["Let me think... probably yes 🙂", "Hmm, good question — what do you think?"]);

  return pickRandom(BOT_DEFAULTS);
}

export { botFallbackReply as jannatFallbackReply };

/** Create starter chat, status and call log for a brand-new (or wiped) user — only Bot */
export async function seedUserChats(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const existing = await db.chatParticipant.count({ where: { userId } });
  if (existing > 0) return;

  await ensureBots();

  const bot = await db.user.findUnique({ where: { email: BOT.email } });
  const now = Date.now();

  /* ---- Bot's chat (pinned, 1 unread) ---- */
  if (bot) {
    const chat = await db.chat.create({
      data: { type: "individual", createdBy: userId, updatedAt: new Date(now - 5 * 60_000) },
    });
    await db.chatParticipant.createMany({
      data: [
        { chatId: chat.id, userId, pinned: true, lastReadAt: new Date(now - 40 * 60_000) },
        { chatId: chat.id, userId: bot.id },
      ],
    });
    await db.message.create({
      data: {
        chatId: chat.id,
        senderId: bot.id,
        content: BOT.opener[0],
        status: "delivered",
        createdAt: new Date(now - 5 * 60_000),
      },
    });
  }

  /* ---- Bot's status ---- */
  if (bot) {
    await db.statusUpdate.create({
      data: {
        userId: bot.id,
        type: "text",
        content: "Your helper bot is ready ⚡ Type /help in chat",
        bg: "0ea47a",
        createdAt: new Date(now - 3 * 3600_000),
        expiresAt: new Date(now + 86_400_000),
      },
    });
  }

  /* ---- Call log: Bot's missed call ---- */
  if (bot) {
    await db.callLog.create({
      data: {
        callerId: bot.id,
        receiverId: userId,
        type: "audio",
        outcome: "missed",
        duration: 0,
        createdAt: new Date(now - 2 * 3600_000),
      },
    });
  }

  broadcast(userRoom(userId), "chats:invalidate", { reason: "seed" });
}

/** Bot's auto-reply — ONE burst = ONE reply (like a real human).
 *  clientTime/tzOffset = the user's DEVICE clock (for /time, /date). */
const pendingReplies = new Map<
  string,
  { latestText: string; active: boolean; clientTime?: number; tzOffset?: number }
>();

export function scheduleBotReply(
  chatId: string,
  botId: string,
  userId: string,
  incomingText: string,
  device: { clientTime?: number; tzOffset?: number } = {}
): void {
  // if a reply is already pending on this chat, just update the latest text —
  // a burst (photo + text) gets exactly ONE reply, never three
  const pending = pendingReplies.get(chatId);
  if (pending && pending.active) {
    pending.latestText = incomingText;
    if (device.clientTime) pending.clientTime = device.clientTime;
    if (typeof device.tzOffset === "number") pending.tzOffset = device.tzOffset;
    return;
  }
  pendingReplies.set(chatId, { latestText: incomingText, active: true, ...device });

  // commands are instant; normal messages get a small "reading" delay
  const isCommand = isBotCommand(incomingText);
  const readDelay = isCommand ? 350 : 800 + Math.random() * 1500;
  setTimeout(async () => {
    try {
      const state = pendingReplies.get(chatId);
      if (!state) return;
      const botUser = await db.user.findUnique({ where: { id: botId } });
      if (!botUser || !botUser.isBot) {
        pendingReplies.delete(chatId);
        return;
      }
      const human = await db.user.findUnique({ where: { id: userId } });

      // SLASH COMMANDS FIRST — deterministic, instant, no LLM needed
      if (isCommand) {
        const content =
          handleBotCommand(state.latestText, {
            clientTime: state.clientTime,
            tzOffset: state.tzOffset,
            botName: botUser.name,
          }) || "Send /help to see what I can do 🙂";
        await sendBotMessage(chatId, botId, userId, botUser.name, content);
        pendingReplies.delete(chatId);
        return;
      }

      // real conversation history for context (oldest -> newest, WITHOUT the just-sent msg)
      const hist = await db.message.findMany({
        where: { chatId, deletedForAll: false },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const history = hist
        .reverse()
        .slice(0, -1)
        .map((m) => ({
          from: m.senderId === botId ? ("bot" as const) : ("me" as const),
          text: m.content || "",
        }));

      // LLM reply first, pattern fallback if the brain is unavailable
      const ai = await botAIReply(state.latestText, history, {
        botName: botUser.name,
        userName: human?.name || "friend",
      });
      const content = ai || botFallbackReply(state.latestText);

      await sendBotMessage(chatId, botId, userId, botUser.name, content);

      // grace period after a reply, then the next burst may trigger a new one
      setTimeout(() => pendingReplies.delete(chatId), 2500);
    } catch {
      pendingReplies.delete(chatId);
    }
  }, readDelay);
}

/** create + broadcast one bot message (with natural typing time) */
async function sendBotMessage(
  chatId: string,
  botId: string,
  userId: string,
  botName: string,
  content: string
): Promise<void> {
  // typing time proportional to reply length (natural feel) — shorter for commands
  const typingMs = Math.min(3600, 500 + content.length * (22 + Math.random() * 14));

  broadcast(chatRoom(chatId), "typing", { chatId, userId: botId, name: botName, isTyping: true });
  await new Promise((r) => setTimeout(r, typingMs));

  const msg = await db.message.create({
    data: { chatId, senderId: botId, content, status: "delivered" },
    include: { sender: true },
  });
  broadcast(chatRoom(chatId), "message:new", { message: serializeMsg(msg) });
  broadcast(userRoom(userId), "message:new", { message: serializeMsg(msg) });
  broadcast(chatRoom(chatId), "typing", { chatId, userId: botId, name: botName, isTyping: false });

  // the bot read the user's messages
  await db.message.updateMany({
    where: { chatId, senderId: userId, status: { not: "read" } },
    data: { status: "read" },
  });
  broadcast(chatRoom(chatId), "message:status", {
    chatId,
    senderId: userId,
    status: "read",
  });
  broadcast(chatRoom(chatId), "chats:invalidate", { chatId });
  broadcast(userRoom(userId), "chats:invalidate", { chatId });
}

export function serializeMsg(m: {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  content: string;
  mediaSeed: string | null;
  mediaName: string | null;
  mediaMeta: string | null;
  status: string;
  starred: boolean;
  deletedForAll: boolean;
  deletedForIds: string;
  replyToId: string | null;
  replyToContent: string | null;
  replyToSender: string | null;
  replyToType: string | null;
  createdAt: Date;
  sender: { id: string; name: string; username: string; avatarColor: string; avatarEmoji: string; avatarUrl: string | null; isBot: boolean };
}) {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    type: m.type,
    content: m.deletedForAll ? "" : m.content,
    mediaSeed: m.mediaSeed,
    mediaName: m.mediaName,
    mediaMeta: m.mediaMeta,
    status: m.status,
    starred: m.starred,
    deletedForAll: m.deletedForAll,
    deletedForIds: m.deletedForIds,
    replyToId: m.replyToId,
    replyToContent: m.replyToContent,
    replyToSender: m.replyToSender,
    replyToType: m.replyToType,
    createdAt: m.createdAt.toISOString(),
    sender: {
      id: m.sender.id,
      name: m.sender.name,
      username: m.sender.username,
      avatarColor: m.sender.avatarColor,
      avatarEmoji: m.sender.avatarEmoji,
      avatarUrl: m.sender.avatarUrl,
      isBot: m.sender.isBot,
    },
  };
}
