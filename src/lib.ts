import type { Caption, LearningNote, Song } from './types';

export const STORAGE_KEY = 'verse-library-v1';

export function parseYouTubeUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/');
      id = url.pathname === '/watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[1]) ? parts[2] : null;
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function parseTime(value: string): number {
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\d+:\d{1,2}(\.\d+)?$/.test(trimmed)) {
    const [minutes, seconds] = trimmed.split(':').map(Number);
    return seconds < 60 ? minutes * 60 + seconds : NaN;
  }
  return NaN;
}

export function captionAt(captions: Caption[], time: number): Caption | undefined {
  return captionTimeline(captions).find(c => time >= c.start && time < c.end);
}

export function captionTimeline(captions: Caption[]): Caption[] {
  return captions.flatMap(c => [c, ...(c.repeats ?? []).map(cue => ({ ...c, ...cue }))]).sort((a, b) => a.start - b.start);
}

export function shuffledIds(ids: string[], current: string, random = Math.random): string[] {
  const shuffled = ids.filter(id => id !== current);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, max = 4000): value is string {
  return typeof value === 'string' && value.length <= max;
}

export function validateLibrary(value: unknown): Song[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('최대 100곡을 담은 곡 목록이어야 합니다.');
  const ids = new Set<string>();
  const videoIds = new Set<string>();
  for (const song of value) {
    if (!object(song) || !text(song.id, 100) || !song.id || ids.has(song.id) || !text(song.videoId, 11) || !/^[\w-]{11}$/.test(song.videoId) || videoIds.has(song.videoId)) throw new Error('곡 ID 또는 YouTube 영상 ID가 올바르지 않거나 중복됩니다.');
    ids.add(song.id); videoIds.add(song.videoId);
    if (!text(song.title, 200) || !song.title.trim() || !text(song.artist, 200) || !song.artist.trim() || !text(song.year, 20) || !text(song.level, 30) || !text(song.genre, 200) || !text(song.description) || !['terracotta', 'sage', 'ocean'].includes(String(song.theme))) throw new Error('곡 제목, 가수 또는 기본 정보가 올바르지 않습니다.');
    if (!Array.isArray(song.focus) || song.focus.length > 10 || !song.focus.every(x => text(x, 100))) throw new Error('학습 포인트가 올바르지 않습니다.');
    if (!Array.isArray(song.notes) || song.notes.length > 1000 || !Array.isArray(song.captions) || song.captions.length > 1000) throw new Error('자막과 표현 설명 목록이 올바르지 않습니다.');
    const noteIds = new Set<string>();
    for (const note of song.notes) {
      if (!object(note) || !text(note.id, 100) || !note.id || noteIds.has(note.id) || !['grammar', 'vocabulary', 'pronunciation'].includes(String(note.category)) || !['expression', 'meaning', 'explanation', 'example', 'exampleKo'].every(k => text(note[k]))) throw new Error('표현 설명의 형식이 올바르지 않습니다.');
      noteIds.add(note.id);
    }
    let lastEnd = -1;
    const captionIds = new Set<string>();
    for (const caption of song.captions) {
      if (!object(caption) || !text(caption.id, 100) || !caption.id || captionIds.has(caption.id) || typeof caption.start !== 'number' || typeof caption.end !== 'number' || !Number.isFinite(caption.start) || !Number.isFinite(caption.end) || caption.start < 0 || caption.end <= caption.start || caption.start < lastEnd || caption.end > 86400 || !text(caption.english) || !caption.english.trim() || !text(caption.korean) || !Array.isArray(caption.noteIds) || !caption.noteIds.every(id => typeof id === 'string' && noteIds.has(id))) throw new Error('자막 시간이 겹치거나 자막·설명 연결이 올바르지 않습니다.');
      captionIds.add(caption.id); lastEnd = caption.end;
      if (caption.repeats !== undefined && (!Array.isArray(caption.repeats) || caption.repeats.length > 1000 || !caption.repeats.every(cue => object(cue) && typeof cue.start === 'number' && typeof cue.end === 'number' && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.end <= 86400))) throw new Error('반복 가사 구간의 시간이 올바르지 않습니다.');
    }
    const timeline = captionTimeline(song.captions as unknown as Caption[]);
    if (timeline.length > 10000 || timeline.some((cue, i) => i > 0 && cue.start < timeline[i - 1].end)) throw new Error('반복 가사를 포함한 자막 시간이 겹칩니다.');
  }
  return value as Song[];
}

export function readLibrary(): { songs: Song[]; warning?: string } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return { songs: stored ? validateLibrary(JSON.parse(stored)) : [] };
  } catch { return { songs: [], warning: '저장한 자료를 읽지 못했어요. 백업 파일을 가져오거나 새로 저장해 주세요.' }; }
}

export function mergeLibrary(base: Song[], incoming: Song[]): Song[] {
  const map = new Map(base.map(song => [song.videoId, song]));
  incoming.forEach(song => map.set(song.videoId, song));
  return validateLibrary([...map.values()]);
}

export const categoryLabel: Record<LearningNote['category'], string> = {
  grammar: 'GRAMMAR', vocabulary: 'VOCABULARY', pronunciation: 'PRONUNCIATION',
};
