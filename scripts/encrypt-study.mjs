import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// Study material, including ciphertext, stays on the author's PC.
const source = new URL('../.private/library.json', import.meta.url);
const passwordFile = new URL('../.private/password.txt', import.meta.url);
const library = JSON.parse(await readFile(source, 'utf8'));
const password = (await readFile(passwordFile, 'utf8')).trim();
if (!password) throw new Error('The local password file is empty.');
const iterations = 600000;
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(library)));
const base64 = value => Buffer.from(value).toString('base64');
const encrypted = { version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: base64(salt), iv: base64(iv), ciphertext: base64(ciphertext) };
await mkdir(new URL('../.private/', import.meta.url), { recursive: true });
await writeFile(new URL('../.private/study.encrypted.json', import.meta.url), JSON.stringify(encrypted));
const catalog = library.songs.map(({ captions, notes, ...metadata }) => ({ ...metadata, captions: [], notes: [] }));
await writeFile(new URL('../src/catalog.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Encrypted study material for ${catalog.length} songs. No password is included in output.`);
