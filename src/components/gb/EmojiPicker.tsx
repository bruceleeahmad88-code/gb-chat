"use client";

/** GB Chat — emoji picker (original curated set) */
export const EMOJI_SET =
  "😀 😁 😂 🤣 😊 😍 😘 😎 🤩 🥳 😏 😭 😅 🙂 🙃 😉 🤗 🤔 🤨 😐 😴 🥺 😡 😱 🥶 🙏 👍 👎 👌 ✌️ 🤞 👏 🙌 💪 ❤️ 💔 💖 💙 💚 💛 🧡 💜 🔥 ⭐ ✨ ⚡ 🌈 ☀️ 🌙 🌸 🌺 🌻 🌹 🍀 🎉 🎊 🎁 🎈 ☕ 🍕 🍔 🍟 🍰 🍦 ⚽ 🏏 🎮 📚 🎵 📱 💻 🚗 ✈️ 🕌 🕋 💯 ✅ ❌ ❓ 💤 👋 🤝 🥰 😤 🫶 🖤 💯".split(
    " "
  );

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose?: () => void;
}) {
  return (
    <div className="h-56 overflow-y-auto bg-[var(--gb-panel)] border-t border-[var(--gb-border)]">
      <div className="grid grid-cols-8 gap-1 p-2">
        {EMOJI_SET.map((e, i) => (
          <button
            key={`${e}-${i}`}
            onClick={() => onPick(e)}
            className="text-[24px] p-1 rounded hover:bg-[var(--gb-panel-2)] transition-colors"
          >
            {e}
          </button>
        ))}
      </div>
      {onClose && (
        <button onClick={onClose} className="hidden" aria-hidden />
      )}
    </div>
  );
}
