import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Disc3, Headphones, Link2, ListMusic, Music2, PencilLine, Play, Plus, Repeat2, Search, Shuffle, Sparkles, X } from 'lucide-react';
import { starterSongs as catalog } from './data';
import type { StudyLibrary } from './studyCrypto';
import { compactSong } from './compactLyrics';
import { captionAt, captionTimeline, categoryLabel, formatTime, mergeLibrary, parseYouTubeUrl, readLibrary, shuffledIds, STORAGE_KEY, validateLibrary } from './lib';
import type { Caption, LearningNote, Song } from './types';
import { YouTubePlayer, type PlayerHandle } from './YouTubePlayer';
import Modal from './Modal';
import LessonEditor from './LessonEditor';

const themes = {
  terracotta: { accent: '#a64b32', soft: '#f2e5dc', ink: '#79412f', label: 'A LITTLE EPIC, A LITTLE NOSTALGIC' },
  sage: { accent: '#4f7156', soft: '#e5ece2', ink: '#3b5940', label: 'GOOD FRIENDS, GOOD WORDS' },
  ocean: { accent: '#326b78', soft: '#e0ebec', ink: '#295765', label: 'TAKE IT SLOW, LET IT FLOW' },
};

function initialSongId(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('song') || 'viva-la-vida';
}

function NoteContent({ note }: { note: LearningNote }) {
  return <div className="note-content" key={note.id}>
    <span className="note-category"><span className="small-dot" />{categoryLabel[note.category]}</span>
    <h3>{note.expression}</h3>
    <p className="note-meaning">{note.meaning}</p>
    <p className="note-explanation">{note.explanation}</p>
    {note.example && <div className="example-box"><span className="eyebrow">MAKE IT YOURS</span><p>{note.example}</p>{note.exampleKo && <span>{note.exampleKo}</span>}</div>}
  </div>;
}

function LyricText({ caption, translated }: { caption: Caption; translated: boolean }) {
  const translations = caption.korean.split('\n');
  return <>{caption.english.split('\n').map((line, i) => <span className="lyric-line" key={i}><span className="caption-english" lang="en">{line}</span>{translated && <span className="caption-korean">{translations[i] ?? ''}</span>}</span>)}</>;
}

export default function StudyApp({ study, unlockControl }: { study: StudyLibrary | null; unlockControl: ReactNode }) {
  const starterSongs = study?.songs ?? catalog;
  const practiceNotes = study?.practiceNotes ?? {};
  const additionalPrompts = study?.prompts ?? {};
  const [stored] = useState(readLibrary);
  const [library, setLibrary] = useState<Song[]>(stored.songs);
  const songs = useMemo(() => {
    if (!study) return catalog;
    const edits = new Map(library.map(s => [s.videoId, s]));
    // Keep edits for a replaced recording as a separate personal song, without
    // letting its old starter ID shadow the updated default recording.
    const personal = library.filter(s => !starterSongs.some(base => base.videoId === s.videoId)).map(s =>
      starterSongs.some(base => base.id === s.id) ? { ...s, id: `video-${s.videoId}`, custom: true } : s);
    return [...starterSongs.map(s => edits.has(s.videoId) ? compactSong({ ...edits.get(s.videoId)!, id: s.id }) : s), ...personal.map(compactSong)];
  }, [library, starterSongs, study]);
  const [trail, setTrail] = useState<string[]>(() => [songs.some(s => s.id === initialSongId()) ? initialSongId() : 'viva-la-vida']);
  const [trailIndex, setTrailIndex] = useState(0);
  const currentId = trail[trailIndex];
  const song = songs.find(s => s.id === currentId) ?? songs[0];
  const practice = practiceNotes[starterSongs.find(s => s.videoId === song.videoId)?.id ?? ''] ?? [];
  const notes = [...new Map([...song.notes, ...practice].map(note => [note.id, note])).values()];
  const queue = useRef(shuffledIds(songs.map(s => s.id), song.id));
  const [direction, setDirection] = useState('next');
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [artistFilter, setArtistFilter] = useState('all');
  const [modal, setModal] = useState<'link' | 'editor' | 'help' | null>(null);
  const [mobileNote, setMobileNote] = useState(false);
  const [link, setLink] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [linkError, setLinkError] = useState('');
  const [toast, setToast] = useState(stored.warning ?? '');
  const [showTranslation, setShowTranslation] = useState(true);
  const [time, setTime] = useState(0);
  const [autoplaySongId, setAutoplaySongId] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | undefined>(song.captions[0]?.id);
  const [selectedNoteId, setSelectedNoteId] = useState<string | undefined>(song.captions[0]?.noteIds[0] ?? song.notes[0]?.id);
  const [noteTab, setNoteTab] = useState('all');
  const [follow, setFollow] = useState(true);
  const player = useRef<PlayerHandle>(null);
  const selector = useRef<HTMLDivElement>(null);
  const selectorButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const captionList = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeCaption = captionAt(song.captions, time);
  const [selectedCueStart, setSelectedCueStart] = useState<number | undefined>();
  const selectedCaption = captionTimeline(song.captions).find(c => c.id === selectedCaptionId && (selectedCueStart === undefined || c.start === selectedCueStart)) ?? song.captions[0];
  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? notes[0];
  const filteredNotes = notes.filter(n => noteTab === 'all' || n.category === noteTab);
  const filteredSongs = songs.filter(s => (artistFilter === 'all' || s.artist === artistFilter) && `${s.title} ${s.artist}`.toLowerCase().includes(search.toLowerCase()));
  const theme = themes[song.theme];
  const lastLyricEnd = Math.max(0, ...captionTimeline(song.captions).map(c => c.end));
  const lyricsFinished = lastLyricEnd > 0 && time >= lastLyricEnd;
  const recommendations = useMemo(() => shuffledIds(songs.map(s => s.id), song.id).slice(0, 2).map(id => songs.find(s => s.id === id)!), [songs, song.id]);

  const themeStyle = { '--accent': theme.accent, '--accent-soft': theme.soft, '--accent-ink': theme.ink } as CSSProperties;

  useEffect(() => {
    setTime(0);
    setSelectedCueStart(undefined); setSelectedCaptionId(song.captions[0]?.id); setSelectedNoteId(song.captions[0]?.noteIds[0] ?? song.notes[0]?.id); setNoteTab('all'); setMobileNote(false);
    const url = new URL(window.location.href); url.hash = `song=${encodeURIComponent(song.id)}`;
    window.history.replaceState(null, '', url);
    document.title = `${song.title} · ${song.artist} — Verse`;
    captionList.current?.scrollTo({ top: 0 });
  }, [song.id, song.videoId]);

  useEffect(() => {
    const onHashChange = () => {
      const id = new URLSearchParams(window.location.hash.slice(1)).get('song');
      if (!id) return;
      if (songs.some(s => s.id === id) && id !== currentId) { setTrail([id]); setTrailIndex(0); queue.current = shuffledIds(songs.map(s => s.id), id); }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [songs, currentId]);

  useEffect(() => {
    if (!menuOpen) return;
    searchInput.current?.focus();
    const close = (e: PointerEvent) => { if (!selector.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); selectorButton.current?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!follow || !activeCaption || !captionList.current) return;
    const element = captionList.current.querySelector<HTMLElement>(`[data-caption="${CSS.escape(activeCaption.id)}"]`);
    if (element) {
      const list = captionList.current;
      const top = element.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 24;
      list.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [activeCaption?.id, follow]);

  const closeModal = useCallback(() => setModal(null), []);
  const closeMobileNote = useCallback(() => setMobileNote(false), []);

  function selectSong(id: string, autoplay = false) {
    setAutoplaySongId(autoplay ? id : null);
    setDirection('next'); setTrail([id]); setTrailIndex(0);
    queue.current = shuffledIds(songs.map(s => s.id), id);
    setMenuOpen(false); setSearch('');
  }
  function nextSong() {
    setAutoplaySongId(null);
    if (songs.length < 2) return;
    setDirection('next');
    if (trailIndex < trail.length - 1) { setTrailIndex(i => i + 1); return; }
    queue.current = queue.current.filter(id => id !== currentId && songs.some(s => s.id === id));
    if (!queue.current.length) queue.current = shuffledIds(songs.map(s => s.id), currentId);
    const next = queue.current.shift();
    if (next) { setTrail(current => [...current, next]); setTrailIndex(i => i + 1); }
  }
  function previousSong() { if (trailIndex > 0) { setAutoplaySongId(null); setDirection('previous'); setTrailIndex(i => i - 1); } }
  function onSwipeStart(e: TouchEvent) {
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, .video-frame, .caption-list')) { touchStart.current = null; return; }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onSwipeEnd(e: TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) nextSong(); else previousSong(); }
    touchStart.current = null;
  }
  function selectNote(id: string) {
    setSelectedNoteId(id); setNoteTab('all');
    if (window.matchMedia('(max-width: 767px)').matches) setMobileNote(true);
  }
  function saveLibrary(updated: Song[]) {
    validateLibrary(updated);
    setLibrary(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); setToast('학습 자료를 이 브라우저에 저장했어요.'); }
    catch { setToast('브라우저 저장 공간이 부족해요. 자료를 내보내 백업해 주세요. 현재 화면에서는 계속 사용할 수 있어요.'); }
  }
  function saveSong(edited: Song) {
    saveLibrary(mergeLibrary(library, [edited])); setModal(null);
    setSelectedCueStart(undefined); setSelectedNoteId(edited.captions[0]?.noteIds[0] ?? edited.notes[0]?.id); setSelectedCaptionId(edited.captions[0]?.id);
  }
  function addLink(e: React.FormEvent) {
    e.preventDefault(); setLinkError('');
    const videoId = parseYouTubeUrl(link);
    if (!videoId) { setLinkError('올바른 YouTube 영상 주소를 입력해 주세요.'); return; }
    const existing = songs.find(s => s.videoId === videoId);
    if (existing) { selectSong(existing.id); setModal(null); setToast('이미 준비된 곡이에요. 학습 화면을 열었어요.'); return; }
    if (!newTitle.trim() || !newArtist.trim()) { setLinkError('새 영상의 노래 제목과 가수를 입력해 주세요.'); return; }
    const added: Song = { id: `video-${videoId}`, videoId, title: newTitle.trim(), artist: newArtist.trim(), year: '', level: '나의 곡', theme: 'terracotta', genre: 'Your personal playlist', description: '좋아하는 음악으로 채우는 나만의 영어 시간. 자막과 해석을 추가해 학습을 시작해 보세요.', focus: ['직접 만든 학습 자료'], captions: [], notes: [], custom: true };
    try {
      saveLibrary(mergeLibrary(library, [added])); setTrail([added.id]); setTrailIndex(0);
      queue.current = shuffledIds([...songs.map(s => s.id), added.id], added.id);
      setModal(null); setLink(''); setNewTitle(''); setNewArtist('');
    } catch (error) { setLinkError(error instanceof Error ? error.message : '곡을 추가하지 못했어요.'); }
  }
  function exportLibrary() {
    const blob = new Blob([JSON.stringify({ version: 1, songs: library }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'verse-library.json'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(library.length ? '학습 자료 백업을 내보냈어요.' : '아직 직접 저장한 자료가 없어요. 예시 곡을 편집하거나 새 곡을 추가해 주세요.');
  }
  async function importLibrary(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 백업 파일을 선택해 주세요.');
      const data: unknown = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('songs' in data)) throw new Error('Verse에서 내보낸 버전 1 백업 파일을 선택해 주세요.');
      const incoming = validateLibrary(data.songs).map(s => {
        const starter = starterSongs.find(base => base.videoId === s.videoId);
        return { ...s, id: starter?.id ?? `video-${s.videoId}`, custom: !starter };
      });
      const merged = mergeLibrary(library, incoming); saveLibrary(merged);
      queue.current = shuffledIds([...new Set([...songs.map(s => s.id), ...incoming.map(s => s.id)])], currentId);
    } catch (error) { setToast(error instanceof Error ? error.message : '백업 파일을 읽지 못했어요.'); }
    if (importInput.current) importInput.current.value = '';
  }
  function chooseCaption(id: string, start?: number) {
    const caption = captionTimeline(song.captions).find(c => c.id === id && (start === undefined || c.start === start));
    if (!caption) return;
    setSelectedCaptionId(id); setSelectedCueStart(caption.start); player.current?.seek(caption.start);
    if (caption.noteIds.length) setSelectedNoteId(caption.noteIds[0]);
  }
  const recommendationCards = lyricsFinished && recommendations.length > 0 ? <section className="end-recommendations" aria-label="마지막 가사 다음 추천곡"><h2>다음 곡도 들어볼까요?</h2><div>{recommendations.map(s => <button key={s.id} onClick={() => selectSong(s.id)} aria-label={`추천곡 ${s.title} · ${s.artist}`}><img src={`https://i.ytimg.com/vi/${s.videoId}/mqdefault.jpg`} alt="" /><strong>{s.title}</strong><span>{s.artist}</span></button>)}</div></section> : null;
  const notePanel = <>
    {recommendationCards}
    <div className="note-tabs" aria-label="설명 분류">{[['all', '전체'], ['vocabulary', '표현'], ['grammar', '문법'], ['pronunciation', '발음']].map(([value, label]) => <button key={value} className={noteTab === value ? 'active' : ''} aria-pressed={noteTab === value} onClick={() => { setNoteTab(value); const first = notes.find(n => value === 'all' || n.category === value); if (first) setSelectedNoteId(first.id); }}>{label}</button>)}</div>
    {filteredNotes.length ? <>
      <div className="note-picker">{filteredNotes.map(note => <button key={note.id} onClick={() => setSelectedNoteId(note.id)} className={selectedNote?.id === note.id ? 'selected' : ''}>{note.expression}<ChevronRight size={13} /></button>)}</div>
      {selectedNote && filteredNotes.some(n => n.id === selectedNote.id) && <NoteContent note={selectedNote} />}
    </> : <div className="empty-note"><BookOpen size={25} /><p>아직 이 분류의 설명이 없어요.</p><button className="text-button" onClick={() => { setMobileNote(false); setModal('editor'); }}>표현 설명 추가하기 <Plus size={14} /></button></div>}
    <div className="listening-tip"><Headphones size={20} /><div><strong>작은 듣기 습관</strong><p>한 번은 뜻을 보며, 한 번은 눈을 감고.<br />같은 문장이 다르게 들릴 거예요.</p></div></div>
  </>;

  return <div className="app" style={themeStyle}>
    <a className="skip-link" href="#lesson" onClick={e => { e.preventDefault(); const lesson = document.getElementById('lesson'); lesson?.focus(); lesson?.scrollIntoView({ block: 'start' }); }}>학습 내용으로 이동</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#song=viva-la-vida" onClick={e => { e.preventDefault(); selectSong('viva-la-vida'); }} aria-label="Verse 첫 곡으로"><span className="brand-record"><Disc3 size={26} strokeWidth={1.3} /></span>verse<span className="brand-period">.</span></a>
      <div className="header-divider" /><span className="brand-caption">좋아하는 노래가<br />영어가 되는 순간</span>
      <div className="song-selector" ref={selector}>
        <button className={`selector-button ${menuOpen ? 'open' : ''}`} ref={selectorButton} aria-expanded={menuOpen} aria-controls="song-menu" onClick={() => setMenuOpen(v => !v)}><Search size={17} /><span>노래 또는 가수 찾기</span><span className="selected-artist">{song.artist}</span><ChevronDown size={15} /></button>
        {menuOpen && <div className="song-menu" id="song-menu"><label className="search-field"><Search size={17} /><input ref={searchInput} aria-label="노래 또는 가수 검색" placeholder="어떤 노래가 듣고 싶나요?" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="artist-filter">가수<select aria-label="가수 필터" value={artistFilter} onChange={e => setArtistFilter(e.target.value)}><option value="all">모든 가수</option>{[...new Set(songs.map(s => s.artist))].map(artist => <option key={artist}>{artist}</option>)}</select></label><div className="song-results">{filteredSongs.map(s => <button key={s.id} onClick={() => selectSong(s.id)}><img src={`https://i.ytimg.com/vi/${s.videoId}/default.jpg`} alt="" /><span><strong>{s.title}</strong><small>{s.artist} · {s.level}</small></span>{s.id === song.id ? <Check size={17} /> : <ArrowRight size={16} />}</button>)}{!filteredSongs.length && <p className="search-empty">등록된 곡 중 일치하는 노래가 없어요.<br />YouTube 링크로 직접 추가할 수 있어요.</p>}</div></div>}
      </div>
      <button className="add-link-button" disabled={!study} onClick={() => { setLinkError(''); setModal('link'); }}><Plus size={17} /><span>YouTube 링크 추가</span></button>
    </div></header>
    <div className="unlock-bar">{unlockControl}</div>

    <main className="page-shell">
      <div className="page-intro"><span><span className="small-dot" /> A SOUNDTRACK FOR YOUR ENGLISH</span><button className="text-button" onClick={() => setModal('help')}>처음 오셨나요? <ArrowRight size={14} /></button></div>
      <section className={`song-stage direction-${direction}`} key={song.id} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
        <div className="song-hero">
          <div className="song-heading"><div className="song-eyebrow"><span>THE SONGBOOK</span><span className="hero-line" /><span>{String(songs.findIndex(s => s.id === song.id) + 1).padStart(2, '0')} / {String(songs.length).padStart(2, '0')}</span></div><h1>{song.title}</h1><div className="artist-line"><span>{song.artist}</span><span className="metadata-dot">·</span>{song.year && <><span>{song.year}</span><span className="metadata-dot">·</span></>}<span className="genre">{song.genre}</span></div></div>
          <div className="song-introduction"><span className="eyebrow">{theme.label}</span><p>{song.description}</p><div className="song-tags"><span className="level-tag"><span className="level-bars"><i /><i /><i /></span>{song.level}</span>{song.focus.map(f => <span key={f}>{f}</span>)}</div></div>
        </div>
        <div className="song-navigation"><div className="session-label"><Headphones size={16} /><span>오늘의 한 곡, 오늘의 한 문장.</span></div><div className="navigation-controls"><button className="icon-button" onClick={previousSong} disabled={trailIndex === 0} aria-label="이전에 본 곡"><ChevronLeft size={19} /></button><span className="navigation-label"><Shuffle size={13} /> 다른 곡 만나기</span><button className="icon-button" onClick={nextSong} disabled={songs.length < 2} aria-label="다음 추천곡"><ChevronRight size={19} /></button></div></div>

        <div className="study-grid" id="lesson" tabIndex={-1}>
          <div className="listening-column">
            <div className="pinned-player">
            <YouTubePlayer key={song.videoId} ref={player} song={song} autoplay={autoplaySongId === song.id} onEnded={() => { if (recommendations[0]) selectSong(recommendations[0].id, true); }} onTime={setTime} onState={() => {}} onRates={() => {}} />

            </div>
            {study ? <><section className="lyrics-section" aria-labelledby="lyrics-title"><h2 id="lyrics-title" className="sr-only">가사와 번역 {song.captions.length}개 구절</h2>
              {song.captions.length > 0 ? <>

                <div className="caption-list" role="region" aria-label="가사와 번역 목록" tabIndex={0} ref={captionList}>
                  {song.captions.map((caption, index) => <article key={caption.id} data-caption={caption.id} aria-current={activeCaption?.id === caption.id ? true : undefined} className={`caption-row ${activeCaption?.id === caption.id ? 'is-playing' : ''} ${selectedCaption?.id === caption.id ? 'is-selected' : ''}`}>
                    <span className="caption-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="caption-body"><button className="caption-jump" onClick={() => chooseCaption(caption.id)} aria-label={`${formatTime(caption.start)} 구절 재생: ${caption.english}`}><LyricText caption={caption} translated={showTranslation} /></button><div className="expression-chips">{caption.noteIds.map(id => { const note = song.notes.find(n => n.id === id); return note ? <button key={id} className={selectedNote?.id === id ? 'active' : ''} onClick={() => selectNote(id)}><Sparkles size={11} />{note.expression}<ArrowRight size={11} /></button> : null; })}</div></div>
                    <div className="caption-cues">{[{ start: caption.start, end: caption.end }, ...(caption.repeats ?? [])].map((cue, occurrence) => <button key={cue.start} className="caption-time" onClick={() => chooseCaption(caption.id, cue.start)} aria-label={`${formatTime(cue.start)}로 이동${occurrence ? ' (반복)' : ''}`}>{activeCaption?.id === caption.id && activeCaption.start === cue.start ? <span className="equalizer"><i /><i /><i /></span> : <>{formatTime(cue.start)}{occurrence > 0 && <Repeat2 size={11} />}</>}</button>)}</div>
                  </article>)}
                </div>


              </> : <div className="empty-captions"><ListMusic size={35} strokeWidth={1.3} /><h3>이 노래에 나만의 문장을 더해요</h3><p>자막과 해석을 입력하면 음악과 함께 따라갈 수 있어요.</p><button className="primary-button" onClick={() => setModal('editor')}><Plus size={16} /> 첫 자막 추가하기</button></div>}
              <div className="lyrics-footer"><span><Music2 size={14} /> 가사 아래에서 번역을 함께 읽어요.</span><button className="text-button" onClick={() => setModal('editor')}><PencilLine size={14} /> 학습 자료 편집</button></div>
            </section>
              {practice.length > 0 && <section className="practice-section" aria-labelledby="practice-title">
                <div className="practice-heading"><span className="eyebrow">MAKE IT YOURS</span><h2 id="practice-title">한 문장씩, 내 것으로 <span>{practice.length}개 문장</span></h2></div>
                <div className="practice-list" role="region" aria-label="응용 예문 목록" tabIndex={0}>
                  {practice.map((note, index) => <article className={`caption-row practice-row ${selectedNote?.id === note.id ? 'is-selected' : ''}`} key={note.id}>
                    <span className="caption-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="caption-body"><button className="caption-jump" aria-label={`예문 설명: ${note.example}`} onClick={() => selectNote(note.id)}><span className="caption-english" lang="en">{note.example}</span>{showTranslation && <span className="caption-korean">{note.exampleKo}</span>}</button><div className="expression-chips"><button className={selectedNote?.id === note.id ? 'active' : ''} onClick={() => selectNote(note.id)}><Sparkles size={11} />{note.expression}<ArrowRight size={11} /></button></div></div>
                  </article>)}
                </div>
              </section>}
              {practice.length > 0 && <section className="transfer-section" aria-labelledby="transfer-title"><span className="eyebrow">FROM THE SONG TO YOUR DAY</span><h2 id="transfer-title">주제에서 일상으로</h2><p>표현을 골랐다면, 이번에는 당신의 이야기를 영어로 바꿔 보세요.</p><div className="transfer-prompts">{(additionalPrompts[song.id] ?? (song.theme === 'terracotta' ? ['used to로 예전의 나와 지금의 나를 비교해 보세요.', 'look back on으로 기억에 남는 시절을 이야기해 보세요.', 'even though로 어려움을 이겨 낸 경험을 써 보세요.'] : song.theme === 'sage' ? ['If와 will을 사용해 친구에게 도움을 약속해 보세요.', 'Let me로 오늘 도와줄 수 있는 일을 제안해 보세요.', 'be there for로 고마운 사람에게 마음을 전해 보세요.'] : ['Let’s로 친구와 함께 할 작은 계획을 제안해 보세요.', 'take your time으로 상대를 안심시키는 말을 써 보세요.', '현재완료로 최근에 달라진 나의 모습을 이야기해 보세요.'])).map((prompt, i) => <article key={prompt}><span>{String(i + 1).padStart(2, '0')}</span><p>{prompt}</p></article>)}</div></section>}
            <div className="mobile-end-recommendations">{recommendationCards}</div>
            <button className="mobile-note-trigger" onClick={() => setMobileNote(true)}><BookOpen size={19} /><span>단어와 문법 설명</span><ArrowRight size={17} /></button></> : <div className="locked-study"><BookOpen size={25} /><h2>가사와 번역이 잠겨 있어요</h2><p>상단에서 암호를 입력하면 학습 자료가 열려요.</p></div>}
          </div>
          <aside className="study-sidebar" aria-label="단어와 문법 설명">{study ? notePanel : <div className="locked-study"><BookOpen size={25} /><p>암호를 입력하고<br />문장과 표현을 함께 배워 보세요.</p></div>}</aside>
        </div>
      </section>

      <section className="discovery-section"><div className="discovery-heading"><div><span className="eyebrow">KEEP YOUR CURIOSITY PLAYING</span><h2>다음엔 어떤 노래를 들어볼까요?</h2></div><span className="discovery-count">{songs.length} songs to explore</span></div><div className="song-cards">{songs.filter(s => s.id !== song.id).slice(0, 3).map(s => <button className="song-card" key={s.id} style={{ '--card-accent': themes[s.theme].accent } as CSSProperties} onClick={() => selectSong(s.id)}><div className="card-image"><img src={`https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`} alt="" loading="lazy" /><span><Play size={16} fill="currentColor" /></span></div><div className="card-copy"><span className="card-level">{s.level} · {s.focus[0]}</span><h3>{s.title}</h3><p>{s.artist}</p></div><ArrowRight className="card-arrow" size={21} /></button>)}</div></section>
      <div className="closing-note"><span className="closing-mark">“</span><p>좋아하는 노래 한 곡이,<br /><em>새로운 언어의 시작이 될 수 있으니까.</em></p><span className="closing-line" /></div>
    </main>

    <footer className="site-footer"><div className="footer-inner"><div><span className="footer-brand">verse.</span><span>Learn a language. Feel the music.</span></div><div className="backup-actions"><button disabled={!study} onClick={exportLibrary}><ArrowDownToLine size={14} /> 자료 내보내기</button><button disabled={!study} onClick={() => importInput.current?.click()}><ArrowUpFromLine size={14} /> 자료 가져오기</button><span>Made for your daily rhythm.</span></div></div>
      <section className="learning-settings" aria-label="학습 설정"><span className="settings-title">학습 설정</span><div className="settings-controls">
        <button className={`translation-toggle ${follow ? 'enabled' : ''}`} onClick={() => setFollow(v => !v)} role="switch" aria-checked={follow}><span>재생 구절 따라가기</span><span className="toggle-track" aria-hidden="true"><span /></span></button>
        <button className={`translation-toggle ${showTranslation ? 'enabled' : ''}`} onClick={() => setShowTranslation(v => !v)} role="switch" aria-checked={showTranslation}><span>해석 보기</span><span className="toggle-track" aria-hidden="true"><span /></span></button>
      </div></section>
    </footer>
    <input className="sr-only" type="file" accept="application/json,.json" ref={importInput} tabIndex={-1} aria-label="학습 자료 백업 파일" onChange={e => void importLibrary(e.target.files?.[0])} />
    {toast && <div className="toast" role="status"><Check size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="알림 닫기"><X size={15} /></button></div>}

    {modal === 'link' && <Modal title="좋아하는 노래를 가져오세요" subtitle="YouTube 링크 하나로, 나만의 플레이리스트에 한 곡 더." onClose={closeModal}><form onSubmit={addLink}><label>YouTube 영상 링크<div className="input-with-icon"><Link2 size={17} /><input type="url" required placeholder="https://www.youtube.com/watch?v=…" value={link} onChange={e => { setLink(e.target.value); setLinkError(''); }} /></div></label><div className="form-grid"><label>노래 제목<input placeholder="예: Yellow" value={newTitle} maxLength={200} onChange={e => setNewTitle(e.target.value)} /></label><label>가수<input placeholder="예: Coldplay" value={newArtist} maxLength={200} onChange={e => setNewArtist(e.target.value)} /></label></div><div className="link-info"><BookOpen size={18} /><p>새 노래의 자막과 해석은 직접 추가해 주세요.<br />준비된 예시 영상은 기존 학습 자료로 연결됩니다.</p></div>{linkError && <p className="form-error" role="alert">{linkError}</p>}<div className="modal-footer"><span>이 브라우저에 보관돼요.</span><button type="submit" className="primary-button">곡 추가하기 <ArrowRight size={16} /></button></div></form></Modal>}
    {study && modal === 'editor' && <LessonEditor song={song} onClose={closeModal} onSave={saveSong} />}
    {modal === 'help' && <Modal title="한 곡이면 충분해요" subtitle="오늘은 좋아하는 음악으로 영어를 만나보세요." onClose={closeModal}><div className="help-steps"><div><span>01</span><div><h3>먼저, 편안하게 들어요</h3><p>재생 버튼으로 음악을 시작하세요. 위에서 노래를 고르거나 좌우 버튼으로 다른 곡을 발견할 수 있어요.</p></div></div><div><span>02</span><div><h3>마음에 남는 문장을 골라요</h3><p>자막을 누르면 그 구간으로 이동해요. 유튜브 플레이어에서 재생을 조절하고 해석을 숨겨 다시 들어보세요.</p></div></div><div><span>03</span><div><h3>표현을 내 것으로 만들어요</h3><p>문장 아래 표현을 누르면 뜻과 문법, 새 예문이 열려요. 직접 추가한 자료는 내보내기로 백업하세요.</p></div></div></div><button className="primary-button full-width" onClick={closeModal}>음악으로 시작하기 <Headphones size={17} /></button></Modal>}
    {mobileNote && <Modal title="문장 사이의 이야기" onClose={closeMobileNote}><div className="mobile-note-panel">{notePanel}</div></Modal>}
  </div>;
}
