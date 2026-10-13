import type { Caption, Song } from './types';
import boundaries from './captionBoundaries.json';

const timing = boundaries as Record<string, number[]>;

// Two English lines plus two translations form one compact reading sector.
// Short consecutive lines share a line, without dropping their translations.
export function compactSong(song: Song): Song {
  const captions: Caption[] = [];
  for (const caption of song.captions) {
    const en = caption.english.split('\n');
    const ko = caption.korean.split('\n');
    const groups: { english: string; korean: string; first: number; last: number }[] = [];
    en.forEach((english, i) => {
      const previous = groups.at(-1);
      if (previous && previous.english.length + english.length < 46 && previous.korean.length + (ko[i]?.length ?? 0) < 32) {
        previous.english += ` / ${english}`; previous.korean += ` / ${ko[i] ?? ''}`; previous.last = i;
      } else groups.push({ english, korean: ko[i] ?? '', first: i, last: i });
    });
    const occurrences = [{ start: caption.start, end: caption.end }, ...(caption.repeats ?? [])];
    const cueTimes = occurrences.map(cue => {
      const found = timing[`${song.videoId}:${caption.id}:${cue.start}`];
      if (found?.length === en.length + 1) return found;
      const weights = en.map(line => Math.max(1, line.split(/\s+/).length));
      const total = weights.reduce((a, b) => a + b, 0);
      let weight = 0;
      return [...weights.map(w => { const start = cue.start + (cue.end - cue.start) * weight / total; weight += w; return start; }), cue.end];
    });
    for (let i = 0; i < groups.length; i += 2) {
      const rows = groups.slice(i, i + 2);
      const cues = cueTimes.map(times => ({ start: times[rows[0].first], end: times[rows.at(-1)!.last + 1] }));
      captions.push({ ...caption, id: i === 0 ? caption.id : `${caption.id}-part-${i / 2 + 1}`, english: rows.map(r => r.english).join('\n'), korean: rows.map(r => r.korean).join('\n'), ...cues[0], repeats: cues.slice(1) });
    }
  }
  return { ...song, captions };
}
