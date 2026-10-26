/** Bot slash-commands — the Bot is a helper, so it knows a fixed set of commands.
 *  /time and /date use the USER'S DEVICE clock (clientTime + tzOffset sent with each
 *  message), so everyone sees their own local time — Pakistan, UK, anywhere.
 *  Commands are handled BEFORE the LLM: instant, deterministic, always correct. */

export interface CommandCtx {
  /** device epoch ms sent by the client with the message */
  clientTime?: number;
  /** new Date().getTimezoneOffset() of the device (minutes, positive = west of UTC) */
  tzOffset?: number;
  /** current display name of the bot */
  botName: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** device wall-clock as a Date shifted so getUTC* getters read LOCAL device time */
function deviceDate(ctx: CommandCtx): Date {
  const epoch = typeof ctx.clientTime === "number" && isFinite(ctx.clientTime) ? ctx.clientTime : Date.now();
  const tz = typeof ctx.tzOffset === "number" && isFinite(ctx.tzOffset) ? ctx.tzOffset : 0;
  return new Date(epoch - tz * 60_000);
}

function fmtDeviceTime(ctx: CommandCtx): string {
  const d = deviceDate(ctx);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function fmtDeviceDate(ctx: CommandCtx): string {
  const d = deviceDate(ctx);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything! 😄",
  "I told my phone I needed a break... now it won't stop showing travel ads 😅",
  "Why did the math book look sad? Too many problems 📚",
  "Parallel lines have so much in common... shame they'll never meet 😄",
  "I'm reading a book about anti-gravity — impossible to put down!",
  "What do you call a fake noodle? An impasta 🍝",
  "Why did the scarecrow win an award? He was outstanding in his field 🌾",
  "My Wi-Fi and I have a lot in common — we both go down randomly 😅",
];

const QUOTES = [
  "Push yourself, because no one else is going to do it for you 💪",
  "Small steps every day beat one big step someday 🌱",
  "Don't watch the clock; do what it does — keep going ⏰",
  "It always seems impossible until it's done ✨",
  "Success is the sum of small efforts repeated daily 🔁",
  "Fall seven times, stand up eight 🙌",
  "Your future is created by what you do today, not tomorrow 🌅",
];

/** safe arithmetic evaluator for /calc — only digits and basic math chars allowed */
function calc(expr: string): string {
  const clean = expr.replace(/[×x]/gi, "*").replace(/[÷]/g, "/").trim();
  if (!clean) return "Usage: /calc 25*8+4";
  if (clean.length > 80 || !/^[\d\s+\-*/().%]+$/.test(clean)) {
    return "Only simple math is supported (numbers, + - * / ( ) . %)";
  }
  try {
    const val = new Function(`"use strict"; return (${clean})`)() as unknown;
    if (typeof val !== "number" || !isFinite(val)) return "Can't calculate that 🤔";
    const out = Math.round(val * 1e10) / 1e10;
    return `${clean} = ${out}`;
  } catch {
    return "That math doesn't work 🤔 try like /calc (12+8)*3";
  }
}

/** try to handle `text` as a slash command. Returns the reply text, or null if
 *  the message is not a command (then the LLM handles it like normal chat). */
export function handleBotCommand(text: string, ctx: CommandCtx): string | null {
  const t = text.trim();
  if (!t.startsWith("/")) return null;
  const [rawCmd, ...rest] = t.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "help":
    case "commands":
    case "start":
      return [
        "🤖 Commands I know:",
        "/time — your device time",
        "/date — today's date",
        "/calc 25*8+4 — quick calculator",
        "/joke — random joke",
        "/quote — daily motivation",
        "/flip — coin flip",
        "/roll — dice roll",
        "/about — who I am",
        "",
        "Or just text me anything — I reply like a human 🙂",
      ].join("\n");

    case "time":
      return `🕐 It's ${fmtDeviceTime(ctx)} on your device (${fmtDeviceDate(ctx)})`;

    case "date":
      return `📅 Today is ${fmtDeviceDate(ctx)}`;

    case "calc":
      return calc(arg);

    case "joke":
      return pick(JOKES);

    case "quote":
      return pick(QUOTES);

    case "flip":
      return pick(["🪙 Heads!", "🪙 Tails!"]);

    case "roll":
      return `🎲 You rolled a ${1 + Math.floor(Math.random() * 6)}!`;

    case "about":
      return `I'm ${ctx.botName} — your helper bot ⚡ I can answer questions, chat like a human, and run commands. Send /help to see everything.`;

    case "echo":
      return arg || "Usage: /echo hello";

    default:
      return `Unknown command "/${cmd}" 🤔 Send /help to see what I can do.`;
  }
}

/** quick check — is this message a command? (used to skip LLM typing-lag) */
export function isBotCommand(text: string): boolean {
  return text.trim().startsWith("/");
}
