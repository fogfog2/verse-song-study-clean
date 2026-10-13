import { useRef, useState, type FormEvent } from 'react';
import { LockKeyhole, UnlockKeyhole } from 'lucide-react';
import StudyApp from './StudyApp';
import { loadStudy, type StudyLibrary } from './studyCrypto';

export default function App() {
  const [study, setStudy] = useState<StudyLibrary | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy || !password) return;
    const current = ++request.current;
    setBusy(true); setError('');
    try {
      const result = await loadStudy(password);
      if (current === request.current) { setStudy(result); setPassword(''); }
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : '학습 자료를 열지 못했어요.');
    } finally { if (current === request.current) setBusy(false); }
  }
  const control = study ? <div className="unlock-success"><span><UnlockKeyhole size={17} /> 학습 자료가 열렸어요</span><button onClick={() => { request.current++; setStudy(null); setPassword(''); setError(''); }}>다시 잠그기 <LockKeyhole size={14} /></button></div>
    : import.meta.env.PROD ? <div className="unlock-success"><span><LockKeyhole size={17} /> 공개 사이트에는 가사와 번역이 포함되지 않아요. 개인 학습 자료는 로컬에서 열어 주세요.</span></div>
    : <form className="unlock-form" onSubmit={unlock} aria-label="학습 자료 암호 입력"><label htmlFor="study-password"><LockKeyhole size={17} /> 가사와 번역 열기</label><div className="unlock-fields"><input id="study-password" type="password" autoComplete="off" aria-label="학습 자료 암호" placeholder="암호 입력" value={password} disabled={busy} onChange={e => { setPassword(e.target.value); setError(''); }} /><button type="submit" disabled={busy || !password}>{busy ? '여는 중…' : '잠금 해제'}</button></div>{error && <p role="alert">{error}</p>}</form>;
  return <StudyApp key={study ? 'unlocked' : 'locked'} study={study} unlockControl={control} />;
}
