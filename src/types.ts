export type Theme = 'terracotta' | 'sage' | 'ocean';

export interface LearningNote {
  id: string;
  expression: string;
  category: 'grammar' | 'vocabulary' | 'pronunciation';
  meaning: string;
  explanation: string;
  example: string;
  exampleKo: string;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  english: string;
  korean: string;
  noteIds: string[];
  repeats?: { start: number; end: number }[];
}

export interface Song {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  year: string;
  level: string;
  theme: Theme;
  genre: string;
  description: string;
  focus: string[];
  captions: Caption[];
  notes: LearningNote[];
  custom?: boolean;
}
