/**
 * GB Chat — selectable call ringtones (pure data, no "use client" needed).
 *
 * Each ringtone is a short melody defined as notes:
 *   [frequency Hz, start offset s, duration s, volume multiplier?]
 * The player loops the whole sequence every `period` seconds (WhatsApp-style
 * ring loop). Rendered live with the Web Audio API — no audio files needed,
 * works offline, and the user can pick their favourite in
 * Settings → Notifications → Ringtone.
 */

export type RingWave = "sine" | "triangle" | "square" | "sawtooth";

export interface RingtoneDef {
  key: string;
  label: string;
  /** loop length in seconds */
  period: number;
  wave: RingWave;
  /** [freq Hz, start s, dur s, vol multiplier?] */
  notes: [number, number, number, number?][];
}

export const RINGTONES: RingtoneDef[] = [
  {
    key: "classic",
    label: "GB Classic",
    period: 2.6,
    wave: "triangle",
    notes: [
      [659, 0, 0.22],
      [880, 0.26, 0.22],
      [1046, 0.52, 0.42],
      [880, 1.05, 0.22],
      [659, 1.31, 0.42],
    ],
  },
  {
    key: "digital",
    label: "Digital Bell",
    period: 2.4,
    wave: "sine",
    notes: [
      [1318, 0, 0.1],
      [1318, 0.15, 0.1],
      [1046, 0.55, 0.1],
      [1046, 0.7, 0.1],
    ],
  },
  {
    key: "marimba",
    label: "Marimba",
    period: 2.8,
    wave: "triangle",
    notes: [
      [1046, 0, 0.16],
      [784, 0.2, 0.16],
      [659, 0.4, 0.16],
      [523, 0.6, 0.38],
      [784, 1.1, 0.16],
      [1046, 1.3, 0.4],
    ],
  },
  {
    key: "chimes",
    label: "Wind Chimes",
    period: 3.2,
    wave: "sine",
    notes: [
      [1568, 0, 0.32],
      [1174, 0.36, 0.32],
      [1760, 0.72, 0.32],
      [1318, 1.08, 0.32],
      [2093, 1.44, 0.5, 0.8],
    ],
  },
  {
    key: "retro",
    label: "Retro Phone",
    period: 3.0,
    wave: "square",
    notes: [
      [1000, 0, 0.05, 0.55],
      [800, 0.06, 0.05, 0.55],
      [1000, 0.12, 0.05, 0.55],
      [800, 0.18, 0.05, 0.55],
      [1000, 0.24, 0.05, 0.55],
      [800, 0.3, 0.05, 0.55],
    ],
  },
  {
    key: "pulse",
    label: "Pulse Pop",
    period: 2.6,
    wave: "sine",
    notes: [
      [523, 0, 0.12],
      [659, 0.14, 0.12],
      [784, 0.28, 0.12],
      [1046, 0.42, 0.32],
      [784, 0.95, 0.12],
      [659, 1.09, 0.12],
      [523, 1.23, 0.32],
    ],
  },
];

export function ringtoneByKey(key?: string | null): RingtoneDef {
  return RINGTONES.find((r) => r.key === key) || RINGTONES[0];
}
