// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { testStudy, testSongs } from './testFixtures';
import { STORAGE_KEY } from './lib';

const playback = vi.hoisted(() => ({ ended: undefined as undefined | (() => void), time: undefined as undefined | ((time: number, duration: number) => void), seek: vi.fn() }));
const decrypt = vi.hoisted(() => vi.fn());
vi.mock('./studyCrypto', () => ({ loadStudy: decrypt }));
vi.mock('./YouTubePlayer', async () => {
  const React = await import('react');
  return { YouTubePlayer: React.forwardRef(function Player(props: { song: { videoId: string }; autoplay?: boolean; onEnded?(): void; onTime(time: number, duration: number): void }, ref) {
    playback.ended = props.onEnded; playback.time = props.onTime;
    React.useImperativeHandle(ref, () => ({ seek: playback.seek }));
    return <div aria-label="시험용 영상" data-video-id={props.song.videoId} data-autoplay={props.autoplay} />;
  }) };
});

beforeEach(() => {
  localStorage.clear(); window.history.replaceState(null, '', '/');
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  Element.prototype.scrollTo = vi.fn();
  vi.stubGlobal('CSS', { escape: (id: string) => id });
  decrypt.mockReset(); playback.seek.mockClear();
  decrypt.mockImplementation(async (key: string) => { if (key !== 'test-passphrase') throw new Error('암호가 맞지 않아요.'); return structuredClone(testStudy); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function unlock() {
  fireEvent.change(screen.getByLabelText('학습 자료 암호'), { target: { value: 'test-passphrase' } });
  fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
  await screen.findByText('학습 자료가 열렸어요');
}

it('keeps lyrics and saved personal edits hidden until unlocked, without storing the password', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(testSongs));
  const view = render(<App />);
  expect(screen.getByText('가사와 번역이 잠겨 있어요')).toBeTruthy();
  expect(screen.queryByText(testSongs[0].captions[0].english)).toBeNull();
  expect(screen.getByRole('button', { name: '자료 내보내기' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('학습 자료 암호'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(testSongs[0].captions[0].english)).toBeNull();
  await unlock();
  expect(screen.getByText(testSongs[0].captions[0].english)).toBeTruthy();
  expect(JSON.stringify(localStorage)).not.toContain('test-passphrase');
  expect(document.querySelector('input[type=password]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '다시 잠그기' }));
  expect(screen.queryByText(testSongs[0].captions[0].english)).toBeNull();
  view.unmount(); render(<App />);
  expect(screen.getByText('가사와 번역이 잠겨 있어요')).toBeTruthy();
});

it('preserves translations, caption seeking, notes, following and automatic next-song playback after unlock', async () => {
  render(<App />); await unlock();
  const lyrics = screen.getByRole('region', { name: '가사와 번역 목록' });
  expect(within(lyrics).getByText(testSongs[0].captions[0].korean)).toBeTruthy();
  fireEvent.click(within(lyrics).getByRole('button', { name: '0:10로 이동' }));
  expect(playback.seek).toHaveBeenCalledWith(10);
  expect(screen.getByRole('heading', { name: 'practice together' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: '재생 구절 따라가기' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('switch', { name: '해석 보기' }));
  expect(within(lyrics).queryByText(testSongs[0].captions[0].korean)).toBeNull();
  const video = screen.getByLabelText('시험용 영상').getAttribute('data-video-id');
  act(() => playback.time?.(45, 242));
  const recommendations = within(screen.getByLabelText('단어와 문법 설명')).getByRole('region', { name: '마지막 가사 다음 추천곡' });
  expect(within(recommendations).getAllByRole('button')).toHaveLength(2);
  expect(screen.getByLabelText('시험용 영상').getAttribute('data-video-id')).toBe(video);
  act(() => playback.ended?.());
  expect(screen.getByLabelText('시험용 영상').getAttribute('data-video-id')).not.toBe(video);
  expect(screen.getByLabelText('시험용 영상').getAttribute('data-autoplay')).toBe('true');
  act(() => playback.ended?.());
  expect(screen.getByLabelText('시험용 영상').getAttribute('data-autoplay')).toBe('true');
});

it('keeps song selection available while locked and opens the selected song on unlock', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /노래 또는 가수 찾기/ }));
  fireEvent.click(screen.getByRole('button', { name: /Love Story Taylor Swift/ }));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Love Story');
  await unlock();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Love Story');
  expect(screen.getByRole('region', { name: '가사와 번역 목록' })).toBeTruthy();
});

it('handles loading failures and allows retrying', async () => {
  decrypt.mockRejectedValueOnce(new Error('학습 자료를 불러오지 못했어요.'));
  render(<App />);
  fireEvent.change(screen.getByLabelText('학습 자료 암호'), { target: { value: 'test-passphrase' } });
  fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('불러오지'));
  await unlock();
  expect(screen.getByText(testSongs[0].captions[0].english)).toBeTruthy();
});
