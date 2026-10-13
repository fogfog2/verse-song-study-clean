# Verse — 노래로 배우는 영어

YouTube 영상과 개인 학습 자료로 영어를 공부하는 React + TypeScript + Vite 앱입니다. 저장소에는 10곡의 제목·가수·영상 ID 등 메타데이터와 앱 코드만 포함합니다.

## 실행과 검증

Node.js 22.12 이상 또는 24와 pnpm 10을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

개발 서버는 기본적으로 `127.0.0.1`에서만 열립니다. `pnpm preview`는 가사가 없는 배포 결과를 확인합니다.

## 로컬 학습 자료

원본 `lyrics/`, `.private/library.json`, `.private/password.txt`는 사용자 PC에서만 관리합니다. `pnpm encrypt-study`는 `.private/study.encrypted.json`을 만들고 공개 메타데이터인 `src/catalog.json`을 갱신합니다. 암호화 파일도 Git과 배포 결과에 포함하지 않습니다.

`pnpm dev`에서 암호를 입력하면 로컬 개발 서버가 제공한 암호화 파일을 브라우저에서 해독합니다. AES-256-GCM, PBKDF2-SHA256 600,000회 및 무작위 salt/IV를 사용합니다. 암호는 서버나 브라우저 저장소에 저장하지 않습니다. 새로고침하거나 ‘다시 잠그기’를 누르면 자료가 닫힙니다. 개발 서버의 `.private/`, `lyrics/`, `.git/` 직접 접근은 차단합니다. 개발 서버를 외부에 노출하지 마세요.

자료가 없는 새 체크아웃에서는 곡 메타데이터와 영상 기능만 사용하며 잠금 해제는 불가능합니다. 개인 자료는 기존 PC 폴더에서 별도로 관리합니다.

## 사용법

- 노래·가수 검색, YouTube 링크 추가, 이전/다음 곡 선택을 지원합니다.
- 로컬에서 잠금을 해제한 뒤 자막 선택으로 구간 이동, 번역 보기, 표현 해설, 학습 자료 편집을 사용할 수 있습니다.
- 사용자 편집과 JSON 백업은 가사·번역을 포함할 수 있습니다. 편집 자료는 브라우저 localStorage에 평문으로 저장되므로 공유 PC에서는 사용하지 마세요. 화면 잠금은 이 저장 자료를 암호화하지 않습니다.
- 내보낸 JSON, 스크린샷, 원본 및 암호화 파일을 저장소나 공개 호스팅에 업로드하지 마세요.

## 공개 방지

기존 저장소 `fogfog2/verse-song-study`는 이전 기록 보관용 비공개 저장소이며 Pages와 Actions를 중단했습니다. 새 저장소 `fogfog2/verse-song-study-clean`은 과거 커밋을 승계하지 않는 비공개 코드 저장소입니다.

CI는 테스트와 빌드만 수행하며 사이트 배포나 빌드 파일 업로드를 하지 않습니다. `pnpm build`는 추적 파일 경로, 카탈로그와 `public/` 허용 목록, 빌드 결과를 검사합니다. 새 정적 자산을 추가하려면 `scripts/check-public-content.mjs`의 허용 목록을 검토해야 합니다. 이 검사는 임의의 가사나 비밀을 모두 식별하는 도구는 아니므로 새 콘텐츠는 별도 검토가 필요합니다.

암호화나 저장소 비공개 설정은 이미 내려받은 사본을 회수하지 않습니다. 상세 조치는 [공개 노출 점검 기록](docs/privacy-audit.md)을 참조하세요.

## 구조

- `src/catalog.json`: 가사와 해설이 비어 있는 곡 메타데이터
- `src/App.tsx`, `src/studyCrypto.ts`: 암호 입력과 브라우저 복호화
- `src/StudyApp.tsx`: 학습 화면
- `scripts/encrypt-study.mjs`: 로컬 자료 암호화
- `scripts/check-public-content.mjs`: 콘텐츠 경계 검사
- `vite.config.ts`: 로컬 전용 자료 제공, 개발 서버 경로 차단
- `docs/timing-audit.md`: 타이밍 검증 기록
