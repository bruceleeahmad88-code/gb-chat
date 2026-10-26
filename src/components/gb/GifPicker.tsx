"use client";

/** GB Chat — Giphy-powered GIF picker (search + trending + category chips).
 *  GIFs come from /api/gifs (live giphy.com search with a verified offline
 *  fallback catalog) and render through OUR /api/gifs/media proxy —
 *  the old direct media.giphy.com URLs now show "THIS CONTENT IS NOT
 *  AVAILABLE", so they are never used again. Picking one sends a real "gif" message. */
import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { api, withMediaToken } from "@/lib/gb-api";

interface GifItem {
  id: string;
  preview: string;
  url: string;
  page: string;
}

const CATS = ["Trending", "Love", "LOL", "Hi", "Like", "Hug", "Sad", "Wow", "Morning", "Night", "Birthday"];

export function GifPicker({
  onPick,
  onClose,
}: {
  onPick: (gif: GifItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Trending");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (query: string) => {
    setLoading(true);
    setErr(null);
    try {
      const term = query.trim() ? query.trim() : cat === "Trending" ? "" : cat;
      const r = await api<{ gifs: GifItem[] }>(`/api/gifs?q=${encodeURIComponent(term)}`);
      setItems(r.gifs || []);
      if (!r.gifs?.length) setErr("No GIFs found — try another word");
    } catch {
      setErr("Couldn't reach GIPHY — check your internet");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
  }, [cat]);

  const onSearch = (v: string) => {
    setQ(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(v), 450);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--gb-panel)]">
      {/* header */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-3" style={{ background: "var(--gb-header)" }}>
        <button onClick={onClose} aria-label="close GIF picker" className="p-1.5 rounded-full hover:bg-white/10 text-white">
          <X size={20} />
        </button>
        <div className="flex-1 flex items-center h-9 bg-white/15 rounded-full px-3 gap-2">
          <Search size={15} className="text-white/80" />
          <input
            autoFocus
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search GIPHY..."
            className="flex-1 min-w-0 bg-transparent text-white text-[14px] outline-none placeholder:text-white/60"
          />
        </div>
      </div>

      {/* category chips */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0 border-b border-[var(--gb-border)]">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setQ("");
              setCat(c);
            }}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors ${
              cat === c && !q ? "text-black" : "text-[var(--gb-text-2)] bg-[var(--gb-panel-2)]"
            }`}
            style={cat === c && !q ? { background: "var(--gb-accent)" } : undefined}
          >
            {c}
          </button>
        ))}
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[var(--gb-text-2)]">
            <Loader2 size={26} className="animate-spin" />
          </div>
        ) : err ? (
          <div className="h-full flex items-center justify-center text-[13.5px] text-[var(--gb-text-2)] px-8 text-center">{err}</div>
        ) : (
          <div className="columns-2 gap-2">
            {items.map((g) => (
              <button
                key={g.id}
                onClick={() => onPick(g)}
                className="mb-2 w-full block rounded-lg overflow-hidden bg-black/20 hover:opacity-85 active:scale-[0.98] transition-all"
                aria-label="send this GIF"
              >
                <img
                  src={withMediaToken(g.preview)}
                  alt="GIF"
                  loading="lazy"
                  className="w-full h-auto block"
                  onError={(e) => {
                    // preview variant hiccup → full gif through the proxy
                    const el = e.currentTarget as HTMLImageElement;
                    if (!el.dataset.fb) {
                      el.dataset.fb = "1";
                      el.src = withMediaToken(g.url);
                    }
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* attribution (GIPHY brand requirement) */}
      <div className="h-8 shrink-0 flex items-center justify-end px-3 border-t border-[var(--gb-border)]">
        <span className="text-[10px] font-semibold tracking-wide text-[var(--gb-text-2)]">Powered by GIPHY</span>
      </div>
    </div>
  );
}
