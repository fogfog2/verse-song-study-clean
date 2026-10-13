// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { YouTubePlayer, type PlayerHandle } from './YouTubePlayer';
import { starterSongs } from './data';

let instances: FakePlayer[];
let latestEvents: { onReady(event: { target: FakePlayer }): void; onError(event: { data: number }): void; onStateChange(event: { data: number }): void };
class FakePlayer {
  time = 0;
  state = 1;
  destroy = vi.fn();
  getCurrentTime = () => this.time;
  getDuration = () => 240;
  getPlayerState = () => this.state;
  getAvailablePlaybackRates = () => [.5, 1, 1.5];
  setPlaybackRate = vi.fn();
  seekTo = vi.fn((time: number) => { this.time = time; });
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  constructor(_element: HTMLElement, options: { events: typeof latestEvents }) {
    instances.push(this); latestEvents = options.events;
  }
}
beforeEach(() => {
  instances = []; vi.useFakeTimers();
  window.YT = { Player: FakePlayer } as unknown as NonNullable<Window['YT']>;
});
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.YT; });

describe('YouTube player lifecycle and repeat', () => {
  it('starts an automatic next song and only reports actual playback endings once', async () => {
    const onEnded = vi.fn();
    const view = render(<YouTubePlayer song={starterSongs[0]} autoplay onEnded={onEnded} onTime={vi.fn()} onState={vi.fn()} onRates={vi.fn()} />);
    await act(async () => {});
    act(() => latestEvents.onReady({ target: instances[0] }));
    expect(instances[0].playVideo).toHaveBeenCalledOnce();
    act(() => { latestEvents.onStateChange({ data: 2 }); latestEvents.onStateChange({ data: 3 }); });
    expect(onEnded).not.toHaveBeenCalled();
    act(() => { latestEvents.onStateChange({ data: 0 }); latestEvents.onStateChange({ data: 0 }); });
    expect(onEnded).toHaveBeenCalledOnce();
    view.unmount();
    act(() => latestEvents.onStateChange({ data: 0 }));
    expect(onEnded).toHaveBeenCalledOnce();
  });
  it('loads only after a request, repeats the selected interval, and destroys the player', async () => {
    const onTime = vi.fn(); const onRates = vi.fn();
    const view = render(<YouTubePlayer song={starterSongs[0]} onTime={onTime} onState={vi.fn()} onRates={onRates} repeat={{ start: 10, end: 14 }} />);
    expect(instances).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Viva la Vida 재생' }));
    await act(async () => {});
    expect(instances).toHaveLength(1);
    act(() => latestEvents.onReady({ target: instances[0] }));
    expect(onRates).toHaveBeenCalledWith([.5, 1, 1.5]);
    instances[0].time = 14.1;
    act(() => { vi.advanceTimersByTime(150); });
    expect(instances[0].seekTo).toHaveBeenCalledWith(10, true);
    instances[0].state = 2; instances[0].time = 14.2;
    instances[0].seekTo.mockClear();
    act(() => { vi.advanceTimersByTime(150); });
    expect(instances[0].seekTo).not.toHaveBeenCalled();
    view.unmount();
    expect(instances[0].destroy).toHaveBeenCalledOnce();
    const timeCalls = onTime.mock.calls.length;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onTime.mock.calls).toHaveLength(timeCalls);
  });

  it('honors a seek requested before ready and can pause while buffering', async () => {
    const ref = createRef<PlayerHandle>();
    render(<YouTubePlayer ref={ref} song={starterSongs[0]} onTime={vi.fn()} onState={vi.fn()} onRates={vi.fn()} />);
    act(() => ref.current?.seek(13.5));
    await act(async () => {});
    act(() => latestEvents.onReady({ target: instances[0] }));
    expect(instances[0].seekTo).toHaveBeenCalledWith(13.5, true);
    instances[0].state = 3;
    act(() => ref.current?.toggle());
    expect(instances[0].pauseVideo).toHaveBeenCalledOnce();
    act(() => ref.current?.setRate(.5));
    expect(instances[0].setPlaybackRate).toHaveBeenCalledWith(.5);
  });

  it('shows an external-playback restriction and original YouTube link', async () => {
    render(<YouTubePlayer song={starterSongs[0]} onTime={vi.fn()} onState={vi.fn()} onRates={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Viva la Vida 재생' }));
    await act(async () => {});
    act(() => latestEvents.onError({ data: 150 }));
    expect(screen.getByRole('alert').textContent).toContain('외부 사이트 재생이 제한');
    expect(screen.getByRole('link', { name: 'YouTube에서 열기' }).getAttribute('href')).toContain(starterSongs[0].videoId);
  });
});
