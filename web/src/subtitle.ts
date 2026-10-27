export interface Cue {
  start: number;
  end: number;
  /** Original-language line: the one wrapped in `<b>` in the merged file. */
  orig: string;
  /** Translation line. */
  trans: string;
}

const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

/**
 * Parses WebVTT and SRT with the same code: both are blank-line separated blocks
 * whose first line (after an optional index) holds `start --> end`.
 * Handles the spec's one-file-two-languages format, where `<b>` marks the original.
 */
export function parseSubs(source: string): Cue[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const arrow = lines.findIndex((l) => l.includes('-->'));
    if (arrow < 0) continue;
    const [rawStart, rawEnd] = lines[arrow].split('-->');
    const start = parseTime(rawStart);
    const end = parseTime(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    let orig = '';
    let trans = '';
    for (const line of lines.slice(arrow + 1)) {
      const plain = stripMarkup(line);
      if (!plain) continue;
      if (!orig && /<\/?b>/i.test(line)) orig = plain;
      else trans = trans ? `${trans} ${plain}` : plain;
    }
    cues.push({ start, end, orig, trans });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Tags and SRT positioning blocks are dropped, so the overlay renders plain text. */
function stripMarkup(line: string): string {
  return line
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseTime(raw: string): number {
  const m = TIME.exec(raw.trim());
  if (!m) return NaN;
  const [, h, mm, ss, frac] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(frac.padEnd(3, '0')) / 1000;
}

/** Index of the cue covering `t`, or -1 in a gap. Cues are sorted by start. */
export function findCueIndex(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && t < cues[found].end ? found : -1;
}

/** Indices of cues whose original or translation contains `query`. */
export function searchCues(cues: Cue[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: number[] = [];
  cues.forEach((cue, i) => {
    if (`${cue.orig} ${cue.trans}`.toLowerCase().includes(q)) hits.push(i);
  });
  return hits;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
