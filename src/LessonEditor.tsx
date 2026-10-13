import { useState } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from './Modal';
import type { Caption, LearningNote, Song } from './types';
import { parseTime, validateLibrary } from './lib';

interface Row {
  id: string; start: string; end: string; english: string; korean: string;
  notes: LearningNote[]; expanded: boolean;
  repeats: { start: string; end: string }[];
}
const blankNote = (): LearningNote => ({ id: crypto.randomUUID(), expression: '', category: 'vocabulary', meaning: '', explanation: '', example: '', exampleKo: '' });
const blankRow = (): Row => ({ id: crypto.randomUUID(), start: '', end: '', english: '', korean: '', notes: [], expanded: false, repeats: [] });

export default function LessonEditor({ song, onClose, onSave }: { song: Song; onClose(): void; onSave(song: Song): void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [rows, setRows] = useState<Row[]>(() => song.captions.map(c => ({ ...c, start: String(c.start), end: String(c.end), repeats: (c.repeats ?? []).map(cue => ({ start: String(cue.start), end: String(cue.end) })), notes: song.notes.filter(n => c.noteIds.includes(n.id)), expanded: false })));
  const [error, setError] = useState('');
  function updateRow(id: string, changes: Partial<Row>) { setRows(current => current.map(row => row.id === id ? { ...row, ...changes } : row)); }
  function updateNote(row: Row, id: string, changes: Partial<LearningNote>) { updateRow(row.id, { notes: row.notes.map(n => n.id === id ? { ...n, ...changes } : n) }); }
  function save() {
    try {
      if (!title.trim() || !artist.trim()) throw new Error('노래 제목과 가수를 입력해 주세요.');
      const captions: Caption[] = rows.map((row, index) => {
        const start = parseTime(row.start); const end = parseTime(row.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) throw new Error(`${index + 1}번째 자막의 시작·종료 시간을 확인해 주세요.`);
        if (!row.english.trim()) throw new Error(`${index + 1}번째 영어 자막을 입력해 주세요.`);
        if (row.notes.some(n => !n.expression.trim() || !n.meaning.trim() || !n.explanation.trim())) throw new Error(`${index + 1}번째 자막의 표현·뜻·설명을 채워 주세요.`);
        return { id: row.id, start, end, english: row.english.trim(), korean: row.korean.trim(), noteIds: row.notes.map(n => n.id), repeats: row.repeats.map(cue => ({ start: parseTime(cue.start), end: parseTime(cue.end) })) };
      }).sort((a, b) => a.start - b.start);
      const usedNoteIds = new Set(rows.flatMap(r => r.notes.map(n => n.id)));
      const notes = [...new Map([...song.notes.filter(n => !song.captions.some(c => c.noteIds.includes(n.id)) && !usedNoteIds.has(n.id)), ...rows.flatMap(r => r.notes)].map(n => [n.id, n])).values()];
      const originalOrder = new Map(song.notes.map((n, i) => [n.id, i]));
      notes.sort((a, b) => (originalOrder.get(a.id) ?? 10000) - (originalOrder.get(b.id) ?? 10000));
      const edited = { ...song, title: title.trim(), artist: artist.trim(), captions, notes };
      validateLibrary([edited]); onSave(edited);
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요. 입력을 확인해 주세요.'); }
  }
  return <Modal title="나만의 학습 자료" subtitle="시간과 문장을 연결하고, 기억하고 싶은 표현을 적어 보세요." onClose={onClose} wide>
    <div className="form-grid"><label>노래 제목<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></label><label>가수<input value={artist} onChange={e => setArtist(e.target.value)} maxLength={200} /></label></div>
    <div className="editor-help">전체 가사와 번역을 한 줄씩 입력하세요. 시간은 초(13.5) 또는 분:초(0:13.5)로 입력합니다. 후렴은 새 문장을 만들지 말고 기존 줄에 ‘반복 구간 추가’로 시간만 연결하세요. 모든 구간은 서로 겹치지 않아야 합니다.</div>
    <div className="editor-rows">{rows.map((row, index) => <section className="editor-row" key={row.id}>
      <div className="editor-row-heading"><span>LINE {String(index + 1).padStart(2, '0')}</span><button className="icon-button" onClick={() => setRows(current => current.filter(r => r.id !== row.id))} aria-label={`${index + 1}번째 자막 삭제`}><Trash2 size={16} /></button></div>
      <div className="time-fields"><label>시작<input aria-label={`${index + 1}번째 시작 시간`} placeholder="0:13.5" value={row.start} onChange={e => updateRow(row.id, { start: e.target.value })} /></label><span>—</span><label>종료<input aria-label={`${index + 1}번째 종료 시간`} placeholder="0:17.2" value={row.end} onChange={e => updateRow(row.id, { end: e.target.value })} /></label></div>
      <label>영어 자막<textarea rows={2} maxLength={4000} value={row.english} onChange={e => updateRow(row.id, { english: e.target.value })} /></label>
      <label>한국어 해석<textarea rows={2} maxLength={4000} value={row.korean} onChange={e => updateRow(row.id, { korean: e.target.value })} /></label>
      <div className="repeat-editor">{row.repeats.map((cue, i) => <div className="time-fields" key={i}><label>반복 {i + 1} 시작<input aria-label={`${index + 1}번째 가사 반복 ${i + 1} 시작`} value={cue.start} onChange={e => updateRow(row.id, { repeats: row.repeats.map((r, j) => j === i ? { ...r, start: e.target.value } : r) })} /></label><label>반복 {i + 1} 종료<input aria-label={`${index + 1}번째 가사 반복 ${i + 1} 종료`} value={cue.end} onChange={e => updateRow(row.id, { repeats: row.repeats.map((r, j) => j === i ? { ...r, end: e.target.value } : r) })} /></label><button className="icon-button" aria-label={`${index + 1}번째 가사 반복 ${i + 1} 삭제`} onClick={() => updateRow(row.id, { repeats: row.repeats.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>)}<button className="text-button" onClick={() => updateRow(row.id, { repeats: [...row.repeats, { start: '', end: '' }] })}><Plus size={14} /> 반복 구간 추가</button></div>
      <button className="text-button note-expand" onClick={() => updateRow(row.id, { expanded: !row.expanded })}>표현 설명 {row.notes.length > 0 && `(${row.notes.length})`}{row.expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      {row.expanded && <div className="editor-notes">{row.notes.map(note => <div className="editor-note" key={note.id}>
        <div className="form-grid"><label>표현<input value={note.expression} onChange={e => updateNote(row, note.id, { expression: e.target.value })} maxLength={4000} /></label><label>분류<select value={note.category} onChange={e => updateNote(row, note.id, { category: e.target.value as LearningNote['category'] })}><option value="vocabulary">단어·표현</option><option value="grammar">문법</option><option value="pronunciation">발음</option></select></label></div>
        <label>뜻<input value={note.meaning} onChange={e => updateNote(row, note.id, { meaning: e.target.value })} maxLength={4000} /></label>
        <label>설명<textarea rows={2} value={note.explanation} onChange={e => updateNote(row, note.id, { explanation: e.target.value })} maxLength={4000} /></label>
        <label>새 영어 예문<input value={note.example} onChange={e => updateNote(row, note.id, { example: e.target.value })} maxLength={4000} /></label>
        <label>예문 해석<input value={note.exampleKo} onChange={e => updateNote(row, note.id, { exampleKo: e.target.value })} maxLength={4000} /></label>
        <button className="text-button danger" onClick={() => updateRow(row.id, { notes: row.notes.filter(n => n.id !== note.id) })}><Trash2 size={14} /> 표현 삭제</button>
      </div>)}<button className="outline-button" onClick={() => updateRow(row.id, { notes: [...row.notes, blankNote()] })}><Plus size={15} /> 표현 설명 추가</button></div>}
    </section>)}</div>
    <button className="outline-button full-width" onClick={() => setRows(current => [...current, blankRow()])}><Plus size={17} /> 자막 추가</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><span>이 브라우저에 저장됩니다.</span><button className="primary-button" onClick={save}><Save size={16} /> 저장하기</button></div>
  </Modal>;
}
