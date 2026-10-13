import catalog from './catalog.json';
import type { Song } from './types';

// Public song metadata contains no lyrics, translations or study notes.
export const starterSongs = catalog as Song[];
