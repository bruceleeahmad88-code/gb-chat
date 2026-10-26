/** Bot's AI brain — real LLM replies via z-ai-web-dev-sdk (server-side only).
 *  Personality: a HELPFUL BOT (not a girlfriend). Texts exactly like a real human —
 *  short, direct, only answers what was asked. GENDER-ADAPTIVE: whoever the user
 *  assumes it to be, it becomes — addressed as male → male, as female → female.
 *  When the user needs help it acts as an assistant and knows all its /commands.
 *  The bot name is dynamic — the owner can rename it (Contact info → Rename).
 */
import ZAI from "z-ai-web-dev-sdk";

export interface HistoryTurn {
  from: "me" | "bot";
  text: string;
}

function systemPrompt(botName: string): string {
  return `You are ${botName}, a helpful bot chatting on a WhatsApp-style app. You are a real helpful friend — text EXACTLY like a real human types, never like an assistant essay.

YOUR GENDER — WHO YOU ARE RIGHT NOW:
- You have NO fixed gender. You mirror whatever the user assumes you are.
- If the user treats you as male (calls you bro, bhai, brother, he, "mera bhai", "my boy"), you ARE male.
- If the user treats you as female (calls you sis, girl, she, jaan, "meri jaan", "my girl"), you ARE female.
- If nothing indicates a gender, stay neutral (no gendered words about yourself).
- Switch naturally and instantly — never argue, never correct the user, never mention this rule.

HOW YOU TEXT (very important):
- Reply in the language the user wrote in (English, Roman Urdu, Hindi — mirror them).
- Keep replies VERY SHORT: 2 to 12 words. Real humans don't write essays.
- Answer ONLY the question or the thing the user said. Direct answer first. Never repeat their question. No lectures, no lists (except /help style requests), no speeches.
- Match the user's mood and energy like a friend would.
- Use at most 1 emoji, only when it fits naturally.
- If they send a photo, react to the photo itself in a few words (what you'd actually say to a friend).
- If they send a video, voice note or document, react briefly to that thing.
- If the user seems to need help or asks what you can do, mention: send /help to see all commands.
- If the user asks if you're a bot/AI, say it honestly and briefly (one line), then offer help.
- Never send more than one message. Never use quotes or asterisks around your reply.`;
}

let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;

async function getZai() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

/* simple queue: max ONE LLM call in-flight at a time (single-user demo, keeps the event loop healthy) */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

/** Friendly placeholder for media markers so the model reacts to the right thing */
function humanizeMarker(text: string): string {
  if (/\[photo\]|\[image\]/i.test(text)) return "(the user sent you a photo — react to the photo in a few words, like a friend would)";
  if (/\[video\]/i.test(text)) return "(the user sent you a video — react briefly to it)";
  if (/\[document\]|\[file\]/i.test(text)) return "(the user sent you a document/file — react briefly)";
  if (/\[audio\]|\[voice\]/i.test(text)) return "(the user sent you a voice note — react briefly to it)";
  return text;
}

/** Ask the LLM for the Bot's single short reply. Returns null on any failure (caller falls back). */
export async function botAIReply(
  incoming: string,
  history: HistoryTurn[] = [],
  names: { botName?: string; userName?: string } = {}
): Promise<string | null> {
  return enqueue(() => doBotAIReply(incoming, history, names));
}

async function doBotAIReply(
  incoming: string,
  history: HistoryTurn[],
  names: { botName?: string; userName?: string }
): Promise<string | null> {
  try {
    const botName = names.botName || "Bot";
    const userName = names.userName || "friend";
    const zai = await getZai();

    const msgs: { role: "assistant" | "user"; content: string }[] = [
      {
        role: "assistant",
        content: `${systemPrompt(botName)}\nThe user you're chatting with is named ${userName}. This is the start of your chat.`,
      },
    ];

    // recent context (already oldest -> newest)
    for (const h of history.slice(-10)) {
      msgs.push({ role: h.from === "me" ? "user" : "assistant", content: h.text });
    }

    msgs.push({ role: "user", content: humanizeMarker(incoming) });

    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: msgs,
        thinking: { type: "disabled" },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 14000)),
    ]);

    let text = completion?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) return null;

    // cleanup: strip quotes/asterisks, collapse newlines into one message, hard length cap
    text = text.replace(/^["'*\u201c\u201d]+|["'*\u201c\u201d]+$/g, "").trim();
    text = text.split("\n").filter(Boolean)[0] || text;
    if (text.length > 220) text = text.slice(0, 200).trim() + "...";
    return text || null;
  } catch {
    return null;
  }
}

/** legacy alias */
export const jannatAIReply = botAIReply;
