// 본인 확인 (2026-09-23)
//
// 이 폼은 로그인이 없고 여러 리테일러사가 같이 쓴다. 티켓번호는 날짜+지점+순번이라
// 남의 번호를 찍어볼 수 있으므로, 접수할 때 적은 작성자명까지 맞아야 티켓을 연다.
// 이름은 띄어쓰기·직급이 갈리기 쉬워서 비교 전에 털어낸다.

const TITLES = ['님', '씨', '과장', '차장', '부장', '대리', '사원', '팀장', '실장', '매니저', '주임', '소장'];

function normalizeName(name) {
  let v = String(name || '').trim().toLowerCase();
  v = v.replace(/\s+/g, '');
  for (const t of TITLES) {
    if (v.endsWith(t)) v = v.slice(0, -t.length);
  }
  return v;
}

/**
 * 작성자명이 맞는지 본다.
 * 개편 전에 들어온 티켓은 작성자명이 비어 있으므로, 그 건만 차량번호로도 열어준다.
 */
function identityMatches(row, input) {
  const given = normalizeName(input);
  if (!given) return false;

  if (row.author_name) return normalizeName(row.author_name) === given;

  const vehicle = String(row.vehicle_number || '').replace(/\s+/g, '').toLowerCase();
  return vehicle !== '' && vehicle === given;
}

module.exports = { normalizeName, identityMatches };
