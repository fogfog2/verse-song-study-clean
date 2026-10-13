import { describe, expect, it } from 'vitest';
import { captionAt, mergeLibrary, parseTime, parseYouTubeUrl, shuffledIds, validateLibrary } from './lib';
import { testSongs as starterSongs } from './testFixtures';

describe('YouTube link parsing', () => {
  it.each([
    'https://www.youtube.com/watch?v=dvgZkm1xWPE&feature=share',
    'https://youtu.be/dvgZkm1xWPE?t=12',
    'https://m.youtube.com/watch?v=dvgZkm1xWPE',
    'https://www.youtube.com/shorts/dvgZkm1xWPE',
    'https://www.youtube.com/embed/dvgZkm1xWPE',
  ])('accepts supported video URLs: %s', url => { expect(parseYouTubeUrl(url)).toBe('dvgZkm1xWPE'); });
  it.each(['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=dvgZkm1xWPE', 'https://evil.test/dvgZkm1xWPE', 'https://youtube.com/watch?v=abc', 'https://youtube.com/playlist?list=xyz', 'not a url'])('rejects invalid or misleading URLs: %s', url => { expect(parseYouTubeUrl(url)).toBeNull(); });
});

describe('caption timing', () => {
  it('reuses one lyric line at repeated times and validates overlap across all occurrences', () => {
    const song = structuredClone(starterSongs[1]);
    song.captions = [{ id: 'fixture', start: 42, end: 45, english: 'We can help.', korean: '우리는 도울 수 있어요.', noteIds: [] }];
    song.captions[0].repeats = [{ start: 30, end: 34 }, { start: 60, end: 64 }];
    expect(validateLibrary([song])).toHaveLength(1);
    expect(captionAt(song.captions, 31)).toMatchObject({ id: song.captions[0].id, start: 30, english: song.captions[0].english });
    expect(captionAt(song.captions, 34)).toBeUndefined();
    expect(captionAt(song.captions, 61)?.id).toBe(song.captions[0].id);
    song.captions[0].repeats.push({ start: 43, end: 44 });
    expect(() => validateLibrary([song])).toThrow('겹');
    song.captions[0].repeats = [{ start: NaN, end: 40 }];
    expect(() => validateLibrary([song])).toThrow('반복');
  });

  it('supports decimal seconds and minute notation, rejects malformed time', () => {
    expect(parseTime('1:13.5')).toBe(73.5); expect(parseTime('13.5')).toBe(13.5);
    expect(parseTime('1:60')).toBeNaN(); expect(parseTime('')).toBeNaN(); expect(parseTime('-1')).toBeNaN();
  });
  it('uses an exclusive end boundary and leaves gaps empty', () => {
    const captions = [{ id: 'gap', start: 42, end: 45, english: 'We can help.', korean: '우리는 도울 수 있어요.', noteIds: [] }];
    expect(captionAt(captions, captions[0].start)?.id).toBe(captions[0].id);
    expect(captionAt(captions, captions[0].end)).toBeUndefined();
    expect(captionAt(captions, 0)).toBeUndefined();
  });
});

describe('lesson import validation', () => {
  it('accepts the demo, rejects overlaps and dangling note references', () => {
    expect(validateLibrary(starterSongs)).toHaveLength(10);
    const overlap = structuredClone(starterSongs); overlap[0].captions[1].start = overlap[0].captions[0].start;
    expect(() => validateLibrary(overlap)).toThrow();
    const dangling = structuredClone(starterSongs); dangling[0].captions[0].noteIds = ['missing'];
    expect(() => validateLibrary(dangling)).toThrow();
  });
  it('rejects duplicate IDs, invalid numbers, malformed notes and non-arrays', () => {
    expect(() => validateLibrary({ songs: [] })).toThrow();
    expect(() => validateLibrary([starterSongs[0], starterSongs[0]])).toThrow();
    const invalid = structuredClone(starterSongs); invalid[0].captions[0].end = Infinity;
    expect(() => validateLibrary(invalid)).toThrow();
    const note = structuredClone(starterSongs); (note[0].notes[0] as unknown as Record<string, unknown>).explanation = 123;
    expect(() => validateLibrary(note)).toThrow();
  });
  it('updates by video ID instead of duplicating the same video', () => {
    const edited = { ...starterSongs[0], title: 'Edited' };
    const merged = mergeLibrary(starterSongs, [edited]);
    expect(merged).toHaveLength(10); expect(merged[0].title).toBe('Edited');
  });
});

describe('recommendations', () => {
  it('includes every other song once and excludes the current song', () => {
    const ids = starterSongs.map(s => s.id);
    const queue = shuffledIds(ids, ids[0], () => .2);
    expect(queue).not.toContain(ids[0]); expect(new Set(queue).size).toBe(starterSongs.length - 1);
    expect([...queue].sort()).toEqual(ids.slice(1).sort());
  });
});
