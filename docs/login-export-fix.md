# 배포 파일 로그인 수정 검수

2026-10-14

## 원인과 변경

배포용 index.html의 iframe이 `sandbox="allow-scripts"`로 내보내져 폼 제출 처리가 차단되었다. `allow-forms`만 추가하고, same-origin 접근은 허용하지 않으며 기존 CSP의 네트워크 폼 전송 차단은 유지했다.

## 검증

- 수정 전 동일한 배포 HTML을 로컬 HTTP 서버로 열어 김하늘 / 1234 입력 후 로그인 화면에 남는 현상을 재현했다.
- 수정 후 브라우저에서 학생 로그인을 수행하고 김하늘 대시보드 표시를 확인했다.
- 로그아웃 후 교사 비밀번호로 로그인하여 선생님 교실 표시를 확인했다.
- 교사 일괄 칭찬을 제출하여 가상 학생 3명의 자주적 칭찬이 각각 1개 증가하는 것을 확인했다.
- 학생으로 다시 로그인하여 일괄 칭찬 반영을 확인했다.
- 오늘의 코드로 긍정적 스티커를 적립하여 1/30, 오늘 1/2회 표시를 확인했다.
- 기존 모델 검사 12개와 추가 배포 iframe 회귀 검사 1개가 통과했다.

실제 Netlify 주소는 검사 시 `Team protection / This site is private`로 이동했다. 따라서 위 브라우저 검증은 수정된 로컬 배포 파일에 대해 수행했으며, Netlify 공개 URL의 로그인 성공으로 간주하지 않는다. Netlify 접근 보호는 변경하지 않았다. 서버 인증·영구 저장·기기 간 동기화 역시 이번 수정 범위에 포함하지 않는다.

참고: [MDN iframe sandbox allow-forms](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#allow-forms).
