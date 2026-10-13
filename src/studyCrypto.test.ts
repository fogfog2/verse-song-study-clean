import { expect, it } from 'vitest';
import { decryptStudy, type EncryptedStudy } from './studyCrypto';
import { testStudy } from './testFixtures';

const cryptoApi = globalThis.crypto;
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
const password = 'test-only-passphrase';
async function encryptFixture(): Promise<EncryptedStudy> {
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const material = await cryptoApi.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await cryptoApi.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cipher = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(testStudy)));
  return { version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: 600000, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(cipher)) };
}

it('decrypts all study data with the matching key and rejects a wrong key', async () => {
  const encrypted = await encryptFixture();
  expect(JSON.stringify(encrypted)).not.toContain(testStudy.songs[0].captions[0].english);
  expect(await decryptStudy(encrypted, password, cryptoApi)).toEqual(testStudy);
  await expect(decryptStudy(encrypted, 'wrong-key', cryptoApi)).rejects.toThrow('암호가 맞지');
});

it('rejects altered ciphertext and unsupported encryption parameters', async () => {
  const encrypted = await encryptFixture();
  const bytes = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0)); bytes[0] ^= 1;
  await expect(decryptStudy({ ...encrypted, ciphertext: encode(bytes) }, password, cryptoApi)).rejects.toThrow('손상');
  await expect(decryptStudy({ ...encrypted, iterations: 1 }, password, cryptoApi)).rejects.toThrow('지원하지');
});
