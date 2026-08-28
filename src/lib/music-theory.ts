export const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const NOTE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export const QUALITY_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  "9": [0, 2, 4, 7, 10],
  add9: [0, 2, 4, 7],
  min6: [0, 3, 7, 9],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
};

export const QUALITY_DISPLAY: Record<string, string> = {
  maj: "",
  min: "m",
  "7": "7",
  maj7: "maj7",
  min7: "m7",
  dim: "dim",
  dim7: "dim7",
  m7b5: "m7b5",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  "6": "6",
  "9": "9",
  add9: "add9",
  min6: "m6",
  maj9: "maj9",
  min9: "m9",
};

export function nameToPitchClass(name: string): number {
  const norm = name.trim();
  const sharpIdx = NOTE_SHARP.indexOf(norm as typeof NOTE_SHARP[number]);
  if (sharpIdx !== -1) return sharpIdx;
  const flatIdx = NOTE_FLAT.indexOf(norm as typeof NOTE_FLAT[number]);
  if (flatIdx !== -1) return flatIdx;
  return -1;
}

export function pcToName(pc: number, preferFlats: boolean = false): string {
  const normalizedPc = ((pc % 12) + 12) % 12;
  return preferFlats ? NOTE_FLAT[normalizedPc] : NOTE_SHARP[normalizedPc];
}

export const CHORD_REGEX = /^([A-G](?:#|b)?)(maj9|maj7|maj6|min9|min7|min6|m7b5|m7|m9|m6|dim7|dim|aug|sus2|sus4|add9|maj|min|m|M|7|6|9)?(?:\/([A-G](?:#|b)?))?$/;

export interface ParsedChord {
  rootPc: number;
  quality: string;
  bassPc: number | null;
}

export function parseChord(chordStr: string): ParsedChord | null {
  const raw = chordStr.trim();
  if (raw === "N" || raw === "") {
    return null;
  }

  const match = raw.match(CHORD_REGEX);
  if (!match) {
    return null;
  }

  const rootName = match[1];
  let qual = match[2] || "maj";
  const bassName = match[3] || null;

  const rootPc = nameToPitchClass(rootName);
  if (rootPc === -1) return null;

  let bassPc: number | null = null;
  if (bassName) {
    bassPc = nameToPitchClass(bassName);
    if (bassPc === -1) return null;
  }

  // Normalize shorthand qualities
  if (qual === "m") qual = "min";
  if (qual === "M") qual = "maj";
  if (qual === "m7") qual = "min7";
  if (qual === "m9") qual = "min9";
  if (qual === "m6") qual = "min6";
  if (qual === "maj6") qual = "6";

  if (!QUALITY_INTERVALS[qual]) {
    qual = "maj";
  }

  return { rootPc, quality: qual, bassPc };
}

export function formatChord(
  rootPc: number,
  quality: string,
  bassPc: number | null = null,
  keyPreferFlat: boolean = false
): string {
  const rootStr = pcToName(rootPc, keyPreferFlat);
  const qualSuffix = QUALITY_DISPLAY[quality] ?? quality;
  let formatted = `${rootStr}${qualSuffix}`;

  if (bassPc !== null && bassPc !== rootPc) {
    const bassStr = pcToName(bassPc, keyPreferFlat);
    formatted += `/${bassStr}`;
  }

  return formatted;
}

export function transposeChord(chordStr: string, semitones: number, keyPreferFlat: boolean = false): string {
  const parsed = parseChord(chordStr);
  if (!parsed) return chordStr;

  const newRootPc = ((parsed.rootPc + semitones) % 12 + 12) % 12;
  const newBassPc = parsed.bassPc !== null ? ((parsed.bassPc + semitones) % 12 + 12) % 12 : null;

  return formatChord(newRootPc, parsed.quality, newBassPc, keyPreferFlat);
}

export function chordToPitchClasses(quality: string): number[] {
  return QUALITY_INTERVALS[quality] || [0, 4, 7];
}

export function fifthsDistance(a: number, b: number): number {
  const posA = (a * 7) % 12;
  const posB = (b * 7) % 12;
  const diff = Math.abs(posA - posB);
  return Math.min(diff, 12 - diff);
}
