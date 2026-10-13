import { starterSongs as catalog } from './data';
import type { Song } from './types';
import type { StudyLibrary } from './studyCrypto';

// Original test sentences; no real song lyrics or production password.
export const testSongs: Song[] = catalog.map(song => ({ ...song,
  captions: [
    { id: 'first', start: 10, end: 15, english: 'Today we practice together.', korean: '오늘 우리는 함께 연습해요.', noteIds: ['practice'] },
    { id: 'second', start: 20, end: 25, english: 'Tomorrow we will try a new lesson.', korean: '내일 우리는 새 수업을 해 볼 거예요.', noteIds: ['practice'], repeats: [{ start: 40, end: 45 }] },
  ],
  notes: [{ id: 'practice', expression: 'practice together', category: 'vocabulary', meaning: '함께 연습하다', explanation: '동사와 부사를 함께 연습해요.', example: 'We practice together every day.', exampleKo: '우리는 매일 함께 연습해요.' }],
}));
export const testStudy: StudyLibrary = { songs: testSongs, practiceNotes: {}, prompts: {} };
