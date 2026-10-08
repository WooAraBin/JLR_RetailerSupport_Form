// 수리비 지원 프로그램(신규, 2026-10-08) — 접수(①)와 내 티켓 조회·마감 보고(②).
// 서버는 /api/rs2(새 표 rs2_requests). 첨부는 기존 /api/upload로 임시 경로에 올리고 서버가 옮긴다.
const $ = (id) => document.getElementById(id);
const RO_RE = /^RO\d{10}$/;
// 티켓 상태 = 프로세스 5단계(10-08 보스). 폼으로 접수하면 1단계(이메일 승인)는 끝난 것이라 2단계부터 시작한다.
const FLOW = ['1. 이메일 승인 요청', '2. 접수 진행', '3. 인보이스 마감 및 청구 진행', '4. JLRK 검토', '5. 지원금 지급'];
const STEP_OF = { received: 1, closed: 2, review: 3, done: 3, paid: 4 };
const STATUS_LABEL = { received: '2. 접수 진행', closed: '3. 인보이스 마감 및 청구 진행', review: '4. JLRK 검토', done: '4. JLRK 검토', paid: '5. 지원금 지급', cancelled: '취소' };

const digits = (v) => String(v == null ? '' : v).replace(/[^\d]/g, '');
const won = (v) => (v === null || v === undefined || v === '' ? '-' : Number(v).toLocaleString() + '원');
document.querySelectorAll('.money').forEach((el) => {
  el.addEventListener('input', () => {
    const d = digits(el.value);
    el.value = d ? Number(d).toLocaleString() : '';
  });
});

// 탭
document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
    $('newWrap').classList.toggle('hidden', b.dataset.tab !== 'new');
    $('mineWrap').classList.toggle('hidden', b.dataset.tab !== 'mine');
  }),
);

// 파일 선택
const picked = {};
document.querySelectorAll('[data-pick]').forEach((btn) => {
  const input = $(btn.dataset.pick);
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    picked[input.id] = input.files[0] || null;
    $(input.id + 'Name').textContent = picked[input.id] ? picked[input.id].name : '선택된 파일 없음';
  });
});

// RO 형식 안내(입력하면서 바로)
$('ro').addEventListener('input', () => {
  const v = $('ro').value.replace(/\s+/g, '').toUpperCase();
  const hint = $('roHint');
  if (!v) { hint.textContent = '필수 · RO + 숫자 10자리'; hint.className = 'label-sub'; return; }
  const ok = RO_RE.test(v);
  hint.textContent = ok ? '필수 · 형식 확인 ✓' : '형식이 맞지 않습니다 — RO + 숫자 10자리';
  hint.className = 'label-sub' + (ok ? '' : ' bad');
});

function setStatus(id, msg, type = '') {
  $(id).textContent = msg;
  $(id).className = 'status ' + type;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    r.readAsDataURL(file);
  });
}
async function upload(file) {
  if (file.size > 4 * 1024 * 1024) throw new Error('파일이 너무 큽니다. 4MB 이하로 올려 주세요.');
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: await readAsBase64(file) }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || '파일 업로드 실패');
  return j;
}
async function api(body) {
  const res = await fetch('/api/rs2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || '처리 실패'); e.data = j; throw e; }
  return j;
}

function estimateHtml(er) {
  if (!er) return '';
  if (er.status === 'unreadable') return `<div class="box info"><b>견적서 자동 확인</b><br>${er.reason}</div>`;
  if (er.status === 'ok') return `<div class="box ok"><b>견적서 자동 확인 ✅</b><br>견적서의 부품 ${won(er.totals['부품'])} · 공임 ${won(er.totals['공임'])}과 적으신 금액이 같습니다.</div>`;
  return `<div class="box warn"><b>견적서 자동 확인 — 보완 필요</b><br>${(er.issues || []).map((s) => '· ' + s).join('<br>')}<br><span style="color:#64748b">접수는 되었습니다. 금액을 잘못 적으셨다면 담당 RCSM에게 알려 주세요.</span></div>`;
}

// 지점 목록
(async () => {
  try {
    const res = await fetch('/api/options');
    const j = await res.json();
    for (const w of j.workshopOptions) {
      const o = document.createElement('option');
      o.value = w; o.textContent = w;
      $('workshop').appendChild(o);
    }
  } catch { setStatus('saveStatus', '지점 목록을 불러오지 못했습니다. 새로고침해 주세요.', 'error'); }
})();

// ① 접수
$('saveBtn').addEventListener('click', async () => {
  const ro = $('ro').value.replace(/\s+/g, '').toUpperCase();
  const need = [
    [$('workshop').value, '지점'], [$('author').value.trim(), '작성자명'], [$('car').value.trim(), '차량번호'],
    [ro, 'RO 번호'], [digits($('estParts').value), '견적 부품 금액'], [digits($('estLabour').value) !== '' ? '0' : '', '견적 공임 금액'],
    [digits($('retailer').value), '리테일러 지원금'], [digits($('jlrk').value), 'JLRK 지원금'],
    [picked.approvalFile, '이메일 승인본'], [picked.estimateFile, '견적서'],
  ].filter(([v]) => !v).map(([, n]) => n);
  if (need.length) return setStatus('saveStatus', '입력해 주세요: ' + need.join(', '), 'error');
  if (!RO_RE.test(ro)) return setStatus('saveStatus', 'RO 번호 형식이 맞지 않습니다. 예: RO2609000335', 'error');
  if (Number(digits($('jlrk').value)) > Number(digits($('retailer').value))) return setStatus('saveStatus', 'JLRK 지원금은 리테일러 지원금보다 클 수 없습니다.', 'error');

  $('saveBtn').disabled = true;
  $('saveResult').innerHTML = '';
  try {
    setStatus('saveStatus', '첨부 올리는 중...');
    const ap = await upload(picked.approvalFile);
    const es = await upload(picked.estimateFile);
    setStatus('saveStatus', '접수 중... (견적서 확인에 몇 초 걸립니다)');
    const r = await api({
      action: 'save',
      workshop: $('workshop').value, authorName: $('author').value.trim(), vehicleNumber: $('car').value.trim(), roNumber: ro,
      plannedStartDate: $('planned').value || null, comment: $('comment').value,
      estParts: digits($('estParts').value), estLabour: digits($('estLabour').value) || '0',
      retailerSupport: digits($('retailer').value), jlrkSupport: digits($('jlrk').value),
      approvalPath: ap.filePath, approvalName: ap.fileName, estimatePath: es.filePath, estimateName: es.fileName,
    });
    setStatus('saveStatus', '', '');
    $('saveResult').innerHTML =
      `<div class="box ok"><b>접수되었습니다.</b><br>티켓번호 <b style="font-size:18px">${r.ticket}</b><br>이 번호와 작성자명으로 「내 티켓 조회」에서 마감 보고를 하실 수 있습니다. 꼭 메모해 주세요.</div>` +
      estimateHtml(r.estimateRead);
  } catch (e) {
    setStatus('saveStatus', e.message, 'error');
  } finally {
    $('saveBtn').disabled = false;
  }
});

// 내 티켓 조회
let current = null;
function renderTicket(row) {
  current = row;
  $('ticketView').classList.remove('hidden');
  const step = row.status === 'cancelled' ? -1 : STEP_OF[row.status] ?? 1;
  const flow = row.status === 'cancelled'
    ? '<div class="flow5"><span class="on">취소된 티켓</span></div>'
    : `<div class="flow5">${FLOW.map((f, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}">${f}</span>`).join('')}</div>`;
  $('ticketInfo').innerHTML = flow + `<div class="kv" style="margin-top:10px">
    <span>티켓번호</span><b>${row.ticket_number}</b>
    <span>상태</span><b>${STATUS_LABEL[row.status] || row.status}</b>
    <span>작성자</span><span>${row.author_name}</span>
    <span>지점 · RO</span><span>${row.workshop} · ${row.ro_number}</span>
    <span>차량번호</span><span>${row.vehicle_number}</span>
    <span>견적 부품 / 공임</span><span>${won(row.est_parts)} / ${won(row.est_labour)}</span>
    <span>리테일러 / JLRK 지원금</span><span>${won(row.retailer_support)} / ${won(row.jlrk_support)}</span>
    ${row.close_reported_at ? `<span>마감 보고</span><span>고객 ${won(row.close_customer)} · JLRK ${won(row.close_jlrk)} · 리테일러 ${won(row.close_retailer)}</span>` : ''}
  </div>`;
  $('estimateBox').innerHTML = estimateHtml(row.estimate_read);
  const editable = ['received', 'closed'].includes(row.status);
  $('closeForm').classList.toggle('hidden', !editable);
  if (editable && row.close_reported_at) {
    $('closeCustomer').value = Number(row.close_customer).toLocaleString();
    $('closeJlrk').value = Number(row.close_jlrk).toLocaleString();
    $('closeRetailer').value = Number(row.close_retailer).toLocaleString();
  }
}
$('lkBtn').addEventListener('click', async () => {
  $('ticketView').classList.add('hidden');
  try {
    setStatus('lkStatus', '조회 중...');
    const r = await api({ action: 'lookup', ticket: $('lkTicket').value.trim().toUpperCase(), author: $('lkAuthor').value.trim() });
    setStatus('lkStatus', '');
    renderTicket(r.row);
  } catch (e) { setStatus('lkStatus', e.message, 'error'); }
});

// ② 마감 보고
$('closeBtn').addEventListener('click', async () => {
  if (!current) return;
  const v = { c: digits($('closeCustomer').value), j: digits($('closeJlrk').value), r: digits($('closeRetailer').value) };
  if (!v.c || !v.j || !v.r) return setStatus('closeStatus', '고객 청구액 · JLRK 지원금 · 리테일러 부담을 모두 입력해 주세요.', 'error');
  $('closeBtn').disabled = true;
  try {
    let inv = null;
    if (picked.invoiceFile) { setStatus('closeStatus', '인보이스 올리는 중...'); inv = await upload(picked.invoiceFile); }
    setStatus('closeStatus', '저장 중...');
    const r = await api({
      action: 'close', ticket: current.ticket_number, author: $('lkAuthor').value.trim(),
      closeCustomer: v.c, closeJlrk: v.j, closeRetailer: v.r,
      invoicePath: inv ? inv.filePath : null, invoiceName: inv ? inv.fileName : null,
    });
    setStatus('closeStatus', '마감 보고를 저장했습니다. JLRK가 DMS 마감 자료와 맞춰 본 뒤 검토합니다.', 'success');
    renderTicket(r.row);
  } catch (e) { setStatus('closeStatus', e.message, 'error'); }
  finally { $('closeBtn').disabled = false; }
});
