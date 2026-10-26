"use client";

/** GB Chat — forward dialog (original implementation) */
import { useEffect, useMemo, useState } from "react";
import { Search, SendHorizontal } from "lucide-react";
import { useGB } from "@/lib/gb-store";
import { api } from "@/lib/gb-api";
import { GbAvatar } from "@/components/gb/ui-bits";
import type { ChatMessage } from "@/lib/gb-types";

/* Forward dialog — pick chats and forward */
export function ForwardDialog() {
  const forwarding = useGB((s) => s.forwarding);
  const setForwarding = useGB((s) => s.setForwarding);
  const chats = useGB((s) => s.chats);
  const toast = useGB((s) => s.toast);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (forwarding) {
      setSelected(new Set());
      setQ("");
    }
  }, [forwarding]);

  const filtered = useMemo(
    () => chats.filter((c) => !c.archived && c.name.toLowerCase().includes(q.toLowerCase())),
    [chats, q]
  );

  if (!forwarding) return null;

  const msg: ChatMessage = forwarding;

  const send = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api("/api/messages/forward", {
        method: "POST",
        body: { messageId: msg.id, chatIds: Array.from(selected) },
      });
      toast(`Forwarded to ${selected.size} chat(s) ↗️`);
      setForwarding(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-5" onClick={() => setForwarding(null)}>
      <div
        className="w-full max-w-[340px] rounded-2xl overflow-hidden bg-[var(--gb-panel)] shadow-2xl flex flex-col max-h-[80%]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 pb-2">
          <h3 className="font-semibold text-[var(--gb-text)] mb-3">Forward to</h3>
          <div className="flex items-center gap-2 h-10 rounded-full px-3 bg-[var(--gb-panel-2)]">
            <Search size={16} className="text-[var(--gb-text-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats"
              className="flex-1 bg-transparent outline-none text-[14px] text-[var(--gb-text)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--gb-panel-2)] text-left"
            >
              <GbAvatar name={c.type === "group" ? c.emoji : c.name} color={c.color} emoji={c.type === "group" ? c.emoji : c.otherUser?.avatarEmoji} url={c.type === "individual" ? c.otherUser?.avatarUrl : undefined} size={40} />
              <span className="flex-1 text-[15px] text-[var(--gb-text)] truncate">{c.name}</span>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-[11px] ${
                  selected.has(c.id) ? "border-[var(--gb-accent)]" : "border-[var(--gb-text-2)]"
                }`}
                style={selected.has(c.id) ? { background: "var(--gb-accent)" } : {}}
              >
                {selected.has(c.id) ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
        <div className="p-3 flex justify-end gap-2 border-t border-[var(--gb-border)]">
          <button onClick={() => setForwarding(null)} className="px-4 h-10 rounded-full text-[14px] text-[var(--gb-text-2)]">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={busy || selected.size === 0}
            className="px-5 h-10 rounded-full text-[14px] font-medium text-white flex items-center gap-2 disabled:opacity-50"
            style={{ background: "var(--gb-accent)" }}
          >
            <SendHorizontal size={15} /> {busy ? "Sending..." : `Send (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
