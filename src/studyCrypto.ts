import type { LearningNote, Song } from './types';
import { validateLibrary } from './lib';

export interface StudyLibrary {
  songs: Song[];
  practiceNotes: Record<string, LearningNote[]>;
  prompts: Record<string, string[]>;
}
export interface EncryptedStudy {
  version: number;
  algorithm: string;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

export async function decryptStudy(envelope: EncryptedStudy, password: string, cryptoApi: Crypto = globalThis.crypto): Promise<StudyLibrary> {
  if (!cryptoApi?.subtle) throw new Error('암호를 풀려면 HTTPS 또는 localhost에서 열어 주세요.');
  if (envelope.version !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== 600000) throw new Error('지원하지 않는 학습 자료 형식이에요.');
  try {
    const salt = decode(envelope.salt);
    const iv = decode(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid encryption parameters');
    const material = await cryptoApi.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await cryptoApi.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: envelope.iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const clear = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, decode(envelope.ciphertext));
    const study = JSON.parse(new TextDecoder().decode(clear)) as StudyLibrary;
    validateLibrary(study.songs);
    if (!study.practiceNotes || !study.prompts) throw new Error('Incomplete study library');
    return study;
  } catch {
    throw new Error('암호가 맞지 않거나 학습 자료가 손상되었어요.');
  }
}

export async function loadStudy(password: string): Promise<StudyLibrary> {
  const response = await fetch(new URL('./study.encrypted.json', document.baseURI), { cache: 'no-store' });
  if (!response.ok) throw new Error('학습 자료는 로컬 개발 서버에서만 열 수 있어요. 로컬 자료를 준비한 뒤 다시 시도해 주세요.');
  return decryptStudy(await response.json(), password);
}
