// 내 티켓 조회 — 티켓번호 + 작성자명으로 본인 건만 연다.
// 여러 리테일러사가 같은 주소를 쓰므로 목록을 훑는 화면은 두지 않는다.
// 지급 완료(Paid) 건은 서버에서도 수정을 막는다(여기 화면 잠금은 안내용).

const lkTicket = document.getElementById('lkTicket');
const lkAuthor = document.getElementById('lkAuthor');
const lkSearchBtn = document.getElementById('lkSearchBtn');
const lkStatus = document.getElementById('lkStatus');
const lkResult = document.getElementById('lkResult');

const STATUS_STEPS = [
  { key: 'Not started', label: '접수 완료', cls: 's1' },
  { key: 'In progress', label: '인보이스 마감', cls: 's2' },
  { key: 'In review', label: '검토중', cls: 's2' },
  { key: 'Done', label: '검토 완료', cls: 's3' },
  { key: 'Paid', label: '지급 완료', cls: 's4' },
];

// 첨부 3칸 — 접수 때 ①②, 인보이스는 나중에. 파일 삭제는 JLRK(관리자)만 한다.
const SLOTS = [
  { key: 'approval', label: '① 이메일 승인본 캡처', nameField: 'approval_file_name' },
  { key: 'estimate', label: '② 1차 견적서', nameField: 'file_name' },
  { key: 'invoice', label: '③ 최종 마감 인보이스', nameField: 'invoice_file_name' },
];

function statusOf(key) {
  return STATUS_STEPS.find((s) => s.key === key) || STATUS_STEPS[0];
}

function setLkStatus(message, type = '') {
  lkStatus.textContent = message;
  lkStatus.className = 'status ' + type;
}

function won(v) {
  return v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString();
}

let current = null;              // 조회된 티켓
const pendingFiles = {};         // 칸별로 새로 고른 파일 { approval, estimate, invoice }

function checkBox(check) {
  if (!check || !check.status) {
    return '<div class="check-none">견적서 수치 자동 대조: 아직 확인하지 않았습니다.</div>';
  }
  if (check.status === 'match') {
    return '<div class="check-ok">✅ 적으신 금액이 1차 견적서에서 모두 확인되었습니다.</div>';
  }
  if (check.status === 'mismatch') {
    // 견적서 양식이 지점마다 달라 자동으로 못 찾는 경우가 많다(실측 20건 중 14건).
    // 리테일러에게 틀렸다고 알리면 오해를 주므로, 확인된 것만 알리고 나머지는 JLRK가 본다.
    const okList = (check.matched || []).join(', ');
    return `<div class="check-none">견적서 자동 확인: ${okList ? okList + ' 는 견적서에서 확인되었습니다. ' : ''}나머지 금액은 JLRK가 견적서를 보고 직접 확인합니다.</div>`;
  }
  return `<div class="check-none">견적서 수치 자동 대조: ${check.reason || '확인 불가'} — JLRK가 직접 확인합니다.</div>`;
}

// 빠진 첨부를 그대로 알려준다 — 무엇을 더 올려야 하는지가 이 화면의 핵심이다
function missingBox(t) {
  const missing = SLOTS.filter((s) => !t[s.nameField]);
  if (missing.length === 0) {
    return '<div class="check-ok">✅ 첨부 3종이 모두 들어왔습니다. JLRK 검토 순서입니다.</div>';
  }
  return `<div class="locked-note">
    <b>보완이 필요합니다.</b> 아래 ${missing.length}가지를 올려주셔야 검토가 진행됩니다.<br>
    ${missing.map((s) => `· ${s.label}`).join('<br>')}
  </div>`;
}

// 최종 JLRK 지원 금액 — 리테일러사 지원금이 더 적으면 빨간 글씨로 경고한다(보스 지시)
function supportBox(t) {
  const jlrk = Number(t.jlrk_support_cost || 0);
  const retailer = Number(t.retailer_support_cost || 0);
  const warn = jlrk > 0 && retailer < jlrk;
  return `<div class="support-box${warn ? ' warn' : ''}">
    <div>
      <div class="support-label">최종 JLRK 지원 금액</div>
      <div class="support-value">${jlrk ? jlrk.toLocaleString() + '원' : '-'}</div>
    </div>
    <div class="support-side">
      <div>리테일러사 지원금 <b>${retailer ? retailer.toLocaleString() + '원' : '-'}</b></div>
      ${warn ? '<div class="support-warn">⚠️ 리테일러사 지원금이 더 낮습니다</div>' : ''}
    </div>
  </div>`;
}

function renderTicket(t) {
  current = t;
  SLOTS.forEach((s) => { pendingFiles[s.key] = null; });
  const st = statusOf(t.rcsm_approval);
  const locked = t.rcsm_approval === 'Paid';

  lkResult.innerHTML = `
    <div class="ticket-head">
      <span class="ticket-no">${t.ticket_number}</span>
      <span class="badge ${st.cls}">${st.label}</span>
      <span class="ticket-meta">${t.workshop} · ${t.vehicle_number} · 작성자 ${t.author_name || '-'} · 접수 ${String(t.request_date || '').slice(0, 10)}</span>
    </div>

    ${locked ? '<div class="locked-note">지급이 끝난 건이라 수정할 수 없습니다. 고칠 내용이 있으면 JLRK 담당자에게 연락해주세요.</div>' : ''}
    ${checkBox(t.estimate_check)}

    ${missingBox(t)}

    <div class="field">
      <label class="label">첨부 3종<span class="label-sub">파일 삭제는 JLRK 담당자만 할 수 있습니다</span></label>
      ${SLOTS.map((slot) => `
        <div class="slot-row">
          <div class="slot-name">
            <b>${slot.label}</b>
            <span class="${t[slot.nameField] ? 'slot-have' : 'slot-none'}">${t[slot.nameField] || '아직 없습니다'}</span>
          </div>
          ${locked ? '' : `
          <div class="file-wrap">
            <input type="file" id="lkIn-${slot.key}" class="file-input-hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx">
            <button type="button" class="file-btn" data-slot="${slot.key}">${t[slot.nameField] ? '다시 첨부' : '첨부'}</button>
            <span id="lkName-${slot.key}" class="file-name">선택된 파일 없음</span>
          </div>`}
        </div>`).join('')}
    </div>

    ${supportBox(t)}

    <div class="grid2">
      <div class="field">
        <label class="label">Total Repair Cost (Before)<span class="label-sub">원</span></label>
        <input type="number" id="lkBefore" class="date-input" value="${t.total_repair_cost_before ?? ''}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">Total Parts Cost<span class="label-sub">원</span></label>
        <input type="number" id="lkParts" class="date-input" value="${t.total_parts_cost ?? ''}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">Retailer Support Cost<span class="label-sub">원</span></label>
        <input type="number" id="lkRetailer" class="date-input" value="${t.retailer_support_cost ?? ''}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">JLRK Support Cost<span class="label-sub">원</span></label>
        <input type="number" id="lkJlrk" class="date-input" value="${t.jlrk_support_cost ?? ''}" ${locked ? 'disabled' : ''}>
      </div>
    </div>

    <div class="field">
      <label class="label">Comment<span class="label-sub">선택</span></label>
      <input type="text" id="lkComment" class="date-input" value="${(t.comment || '').replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
    </div>

    ${locked ? '' : '<button id="lkSaveBtn" class="save-btn">저장</button>'}
  `;
  lkResult.style.display = '';

  if (locked) return;

  SLOTS.forEach((slot) => {
    const input = document.getElementById(`lkIn-${slot.key}`);
    const btn = lkResult.querySelector(`button[data-slot="${slot.key}"]`);
    const nameEl = document.getElementById(`lkName-${slot.key}`);
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      pendingFiles[slot.key] = input.files[0] || null;
      nameEl.textContent = pendingFiles[slot.key] ? pendingFiles[slot.key].name : '선택된 파일 없음';
    });
  });

  document.getElementById('lkSaveBtn').addEventListener('click', saveTicket);
}

async function searchTicket() {
  const ticketNumber = lkTicket.value.trim();
  const authorName = lkAuthor.value.trim();
  if (!ticketNumber) return setLkStatus('티켓번호를 입력해주세요.', 'error');
  if (!authorName) return setLkStatus('작성자명을 입력해주세요.', 'error');

  lkSearchBtn.disabled = true;
  setLkStatus('조회 중...');
  try {
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNumber, authorName }),
    });
    const data = await res.json();
    if (!res.ok) {
      lkResult.style.display = 'none';
      return setLkStatus('❌ ' + (data.error || '조회 실패'), 'error');
    }
    setLkStatus('');
    renderTicket(data.ticket);
  } catch (err) {
    setLkStatus('❌ ' + (err.message || '네트워크 오류'), 'error');
  } finally {
    lkSearchBtn.disabled = false;
  }
}

async function saveTicket() {
  if (!current) return;
  const btn = document.getElementById('lkSaveBtn');
  btn.disabled = true;
  try {
    const uploaded = {};
    for (const slot of SLOTS) {
      const file = pendingFiles[slot.key];
      if (!file) continue;
      setLkStatus(`${slot.label} 업로드 중...`);
      const up = await uploadFile(file); // app.js 의 업로드를 그대로 쓴다
      uploaded[slot.key] = up;
    }

    setLkStatus('저장 중...');
    const res = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: current.ticket_number,
        authorName: lkAuthor.value.trim(),
        comment: document.getElementById('lkComment').value.trim(),
        totalRepairCostBefore: document.getElementById('lkBefore').value,
        totalPartsCost: document.getElementById('lkParts').value,
        retailerSupportCost: document.getElementById('lkRetailer').value,
        jlrkSupportCost: document.getElementById('lkJlrk').value,
        approvalPath: uploaded.approval?.filePath ?? null,
        approvalName: uploaded.approval?.fileName ?? null,
        estimatePath: uploaded.estimate?.filePath ?? null,
        estimateName: uploaded.estimate?.fileName ?? null,
        invoicePath: uploaded.invoice?.filePath ?? null,
        invoiceName: uploaded.invoice?.fileName ?? null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setLkStatus('❌ ' + (data.error || '저장 실패'), 'error');

    SLOTS.forEach((s) => { pendingFiles[s.key] = null; });
    renderTicket(data.ticket);
    setLkStatus(
      data.ticket.rcsm_approval === 'In review'
        ? '✅ 저장했습니다. 첨부 3종이 모두 들어와 「검토중」으로 넘어갔습니다.'
        : '✅ 저장했습니다.',
      'success'
    );
  } catch (err) {
    setLkStatus('❌ ' + (err.message || '네트워크 오류'), 'error');
  } finally {
    btn.disabled = false;
  }
}

lkSearchBtn.addEventListener('click', searchTicket);
[lkTicket, lkAuthor].forEach((el) =>
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchTicket();
  })
);
