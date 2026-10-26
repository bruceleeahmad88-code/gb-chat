import { NextRequest } from "next/server";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Local media placeholder generator — returns a nice SVG "photo"
 * based on the seed. No external network needed.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ seed: string }> }) {
  const { seed } = await ctx.params;
  const clean = seed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) || "photo";
  const h = hashCode(clean);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h % 80)) % 360;
  const w = 640;
  const ht = 480;

  const circles: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cx = (h * (i + 3)) % w;
    const cy = (h * (i + 7)) % ht;
    const r = 30 + ((h * (i + 1)) % 90);
    const oh = (hue + i * 35) % 360;
    circles.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${oh} 65% 62%)" opacity="0.35"/>`
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 70% 55%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 70% 40%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${ht}" fill="url(#g)"/>
  ${circles.join("\n  ")}
  <text x="${w / 2}" y="${ht / 2}" font-family="Segoe UI, sans-serif" font-size="42" fill="rgba(255,255,255,0.85)" text-anchor="middle" font-weight="600">📷 ${clean}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
