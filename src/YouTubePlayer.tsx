import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ExternalLink, Play, RotateCcw, LoaderCircle } from 'lucide-react';
import type { Song } from './types';

interface YTPlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  seekTo(time: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
}
interface YTNamespace {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YTNamespace> | undefined;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => { reject(new Error('YouTube 연결 시간이 초과되었어요.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube 플레이어를 불러오지 못했어요.'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.id = 'youtube-api';
    script.async = true;
    script.onerror = () => { clearTimeout(timer); reject(new Error('YouTube에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.')); };
    document.getElementById('youtube-api')?.remove();
    document.head.append(script);
  }).catch(error => { apiPromise = undefined; throw error; });
  return apiPromise;
}

export interface PlayerHandle {
  seek(time: number): void;
  toggle(): void;
  setRate(rate: number): void;
}
interface Props {
  song: Song;
  autoplay?: boolean;
  onEnded?(): void;
  onTime(time: number, duration: number): void;
  onState(playing: boolean): void;
  onRates(rates: number[]): void;
  onRate?(rate: number): void;
  repeat?: { start: number; end: number };
}

export const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(props, ref) {
  const [activated, setActivated] = useState(props.autoplay ?? false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const requestedTime = useRef<number | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    seek(time) {
      requestedTime.current = time;
      if (player.current && ready) { player.current.seekTo(time, true); player.current.playVideo(); requestedTime.current = undefined; }
      else setActivated(true);
    },
    toggle() {
      if (!activated) setActivated(true);
      else if (player.current && ready) {
        if ([1, 3].includes(player.current.getPlayerState())) player.current.pauseVideo();
        else player.current.playVideo();
      }
    },
    setRate(rate) { if (player.current && ready) player.current.setPlaybackRate(rate); },
  }), [activated, ready]);

  useEffect(() => {
    if (!activated) return;
    let disposed = false;
    let interval: number | undefined;
    let readyTimer: number | undefined;
    let endedHandled = false;
    setReady(false); setError('');
    loadApi().then(YT => {
      if (disposed || !mount.current) return;
      const target = document.createElement('div');
      mount.current.replaceChildren(target);
      readyTimer = window.setTimeout(() => { if (!disposed) setError('영상 연결이 지연되고 있어요. 다시 시도하거나 YouTube에서 열어 주세요.'); }, 18000);
      player.current = new YT.Player(target, {
        videoId: props.song.videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            if (disposed) return;
            clearTimeout(readyTimer); setReady(true); setError('');
            const iframe = mount.current?.querySelector('iframe');
            if (iframe) { iframe.title = `${props.song.artist} — ${props.song.title} YouTube 플레이어`; iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture'); }
            latest.current.onRates(event.target.getAvailablePlaybackRates());
            if (requestedTime.current !== undefined) { event.target.seekTo(requestedTime.current, true); requestedTime.current = undefined; }
            event.target.playVideo();
            interval = window.setInterval(() => {
              const p = player.current;
              if (disposed || !p) return;
              const time = p.getCurrentTime();
              const repeat = latest.current.repeat;
              if (repeat && p.getPlayerState() === 1 && (time >= repeat.end || time < repeat.start - 0.5)) p.seekTo(repeat.start, true);
              latest.current.onTime(time, p.getDuration());
            }, 150);
          },
          onStateChange: (event: { data: number }) => {
            if (disposed) return;
            latest.current.onState(event.data === 1);
            if (event.data === 1) endedHandled = false;
            if (event.data === 0 && !endedHandled) {
              endedHandled = true;
              latest.current.onEnded?.();
            }
          },
          onPlaybackRateChange: (event: { data: number }) => { if (!disposed) latest.current.onRate?.(event.data); },
          onError: (event: { data: number }) => {
            if (disposed) return;
            clearTimeout(readyTimer); latest.current.onState(false);
            setError([101, 150].includes(event.data) ? '이 영상은 외부 사이트 재생이 제한되어 있어요.' : event.data === 100 ? '삭제되었거나 비공개인 영상이에요.' : event.data === 153 ? '이 환경에서는 YouTube 재생을 확인할 수 없어요. 브라우저에서 다시 열어 주세요.' : '영상을 재생하지 못했어요. 다시 시도해 주세요.');
          },
          onAutoplayBlocked: () => { if (!disposed) latest.current.onState(false); },
        },
      });
    }).catch(error => { if (!disposed) setError(error instanceof Error ? error.message : 'YouTube 연결에 실패했어요.'); });
    return () => {
      disposed = true; clearInterval(interval); clearTimeout(readyTimer);
      player.current?.destroy(); player.current = null;
    };
  }, [activated, attempt, props.song.videoId]);

  return <div className="video-frame">
    {!activated && <button className="video-poster" onClick={() => setActivated(true)} aria-label={`${props.song.title} 재생`}>
      <img src={`https://i.ytimg.com/vi/${props.song.videoId}/maxresdefault.jpg`} alt="" onError={e => { if (!e.currentTarget.src.endsWith('/hqdefault.jpg')) e.currentTarget.src = `https://i.ytimg.com/vi/${props.song.videoId}/hqdefault.jpg`; }} />
      <div className="poster-shade" />
      <span className="video-topline"><span className="live-dot" /> LISTEN & LEARN <span className="youtube-label">YouTube</span></span>
      <span className="poster-play"><Play size={27} fill="currentColor" /></span>
      <span className="poster-bottom"><span>{props.song.artist}<strong>{props.song.title}</strong></span><span className="poster-hint">음악으로 시작하기 <Play size={13} fill="currentColor" /></span></span>
    </button>}
    {activated && <div ref={mount} className="youtube-mount" />}
    {activated && !ready && !error && <div className="video-loading"><LoaderCircle className="spin" size={26} /><span>YouTube 연결 중</span></div>}
    {error && <div className="video-error" role="alert"><p>{error}</p><div><button onClick={() => setAttempt(a => a + 1)}><RotateCcw size={15} /> 다시 시도</button><a href={`https://www.youtube.com/watch?v=${props.song.videoId}`} target="_blank" rel="noopener noreferrer">YouTube에서 열기 <ExternalLink size={15} /></a></div></div>}
  </div>;
});
