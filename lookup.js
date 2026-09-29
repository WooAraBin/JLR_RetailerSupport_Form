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
  { key: 'Cancelled', label: '취소', cls: 's4' },
];

// 첨부 3칸 — 접수 때 ①②, 인보이스는 나중에. 파일 삭제는 JLRK(관리자)만 한다.
const SLOTS = [
  { key: 'approval', label: '① 이메일 승인본 캡처', nameField: 'approval_file_name' },
  { key: 'estimate', label: '② 견적서', nameField: 'file_name', hint: '할인 미적용 · One DMS 출력본만 가능' },
  { key: 'invoice', label: '③ 최종 마감 인보이스', nameField: 'invoice_file_name', hint: '할인 적용본 · One DMS 출력본만 가능' },
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

// 견적서 자동 확인 — 견적서(DMS 고정 양식)에서 읽은 금액과 적으신 금액을 항목별로 맞춘다.
// 지원금 두 개는 견적서에 없는 값(협의로 정하는 금액)이라 대조 대상이 아니다.
const STATE_MARK = {
  confirmed: '✅ 견적서에서 확인',
  different: '⚠️ 견적서와 다릅니다',
  not_in_estimate: '견적서에는 없는 금액입니다 (협의로 정하는 금액)',
  unknown: '',
};

function checkBox(t) {
  const check = t.estimate_check;

  if (!check || !check.status || check.status === 'skipped') {
    return '<div class="check-none"><b>견적서 자동 확인</b><br>아직 확인하지 않았습니다.</div>';
  }

  if (check.status === 'unreadable') {
    return `<div class="locked-note"><b>견적서 자동 확인 불가</b><br>
      · 올리신 파일: ${t.file_name || '-'}<br>
      · <b>필수 사항 — 견적서 및 인보이스는 One DMS 출력본만 사용 가능합니다.</b><br>
      · 할인 미적용 상태여야 하고, 금액은 부가세 제외 기준입니다.<br>
      「② 견적서」 칸에서 One DMS 출력본으로 다시 첨부해주세요.</div>`;
  }

  const lines = (check.lines || []).map((l) => {
    const amount = Number(l.amount || 0).toLocaleString() + '원';
    const mark = STATE_MARK[l.state] || '';
    const doc = l.state === 'different' && l.doc ? ` (견적서 ${Number(l.doc).toLocaleString()}원)` : '';
    return `· ${l.label} <b>${amount}</b>${mark ? ' — ' + mark : ''}${doc}`;
  });

  const s2 = check.summary;
  const docLine = s2
    ? `<br><span class="check-sub">견적서에서 읽은 값 — 부품 ${Number(s2['부품'] || 0).toLocaleString()}원 · 공임 ${Number(s2['공임'] || 0).toLocaleString()}원 · 합계 ${Number(s2['합계'] || 0).toLocaleString()}원 (부가세 제외)</span>`
    : '';

  if (check.status === 'ok') {
    return `<div class="check-ok"><b>견적서 자동 확인 — 이상 없습니다</b><br>${lines.join('<br>')}${docLine}</div>`;
  }

  return `<div class="locked-note"><b>보완 필요 — 적으신 금액이 견적서와 맞지 않습니다.</b><br>${lines.join('<br>')}${docLine}<br>
    금액을 고쳐 저장하시거나, 다른 견적서라면 <b>견적서를 다시 첨부</b>해주세요.</div>`;
}

// 인보이스 자동 판독 결과 — 어긋나면 무엇이 어긋났는지 한 줄씩
function invoiceBox(t) {
  const c = t.invoice_check;
  if (!c || !c.status) return '';
  if (c.status === 'ok') {
    const s = c.summary || {};
    return `<div class="check-ok"><b>인보이스 자동 확인 — 이상 없습니다</b><br>
      · 부품 <b>${(s['부품'] || 0).toLocaleString()}원</b> · 공임 <b>${(s['공임'] || 0).toLocaleString()}원</b><br>
      · 할인 <b>${(s['할인'] || 0).toLocaleString()}원</b> · 청구금액 <b>${(s['청구금액'] || 0).toLocaleString()}원</b></div>`;
  }
  if (c.status === 'needs_fix') {
    return `<div class="locked-note"><b>보완 필요 — 인보이스가 견적서·지원금과 맞지 않습니다.</b><br>
      ${(c.issues || []).map((i) => '· ' + i).join('<br>')}<br>
      고쳐서 다시 올려주시거나, 내용이 달라졌다면 <b>이 건을 취소하고 새로 접수</b>해주세요.</div>`;
  }
  return `<div class="locked-note"><b>인보이스 자동 확인 불가</b><br>
    · 올리신 파일: ${t.invoice_file_name || '-'}<br>
    · <b>필수 사항 — 견적서 및 인보이스는 One DMS 출력본만 사용 가능합니다.</b><br>
    · 인보이스는 할인이 적용된 상태로 올려주세요.<br>
    「③ 최종 마감 인보이스」 칸에서 One DMS 출력본으로 다시 첨부해주세요.</div>`;
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
  const locked = t.rcsm_approval === 'Paid' || t.rcsm_approval === 'Cancelled';

  lkResult.innerHTML = `
    <div class="ticket-head">
      <span class="ticket-no">${t.ticket_number}</span>
      <span class="badge ${st.cls}">${st.label}</span>
      <span class="ticket-meta">${t.workshop} · ${t.vehicle_number} · 작성자 ${t.author_name || '-'} · 접수 ${String(t.request_date || '').slice(0, 10)}</span>
    </div>

    ${locked ? `<div class="locked-note">${t.rcsm_approval === 'Cancelled' ? '취소된 건입니다. 새로 접수해주세요.' : '지급이 끝난 건이라 수정할 수 없습니다. 고칠 내용이 있으면 JLRK 담당자에게 연락해주세요.'}</div>` : ''}
    ${checkBox(t)}
    ${invoiceBox(t)}

    ${missingBox(t)}

    <div class="field">
      <label class="label">첨부 3종<span class="label-sub">파일 삭제는 JLRK 담당자만 할 수 있습니다</span></label>
      ${SLOTS.map((slot) => `
        <div class="slot-row">
          <div class="slot-name">
            <b>${slot.label}</b>${slot.hint ? `<span class="slot-hint">${slot.hint}</span>` : ''}
            <span class="${t[slot.nameField] ? 'slot-have' : 'slot-none'}">${t[slot.nameField] || '첨부 필요'}</span>
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
        <label class="label">견적서 금액<span class="label-sub">부가세 제외</span></label>
        <input type="text" id="lkBefore" class="date-input money" inputmode="numeric" value="${t.total_repair_cost_before == null ? '' : Number(t.total_repair_cost_before).toLocaleString()}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">부품 금액<span class="label-sub">부가세 제외</span></label>
        <input type="text" id="lkParts" class="date-input money" inputmode="numeric" value="${t.total_parts_cost == null ? '' : Number(t.total_parts_cost).toLocaleString()}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">리테일러 지원금<span class="label-sub">부가세 제외</span></label>
        <input type="text" id="lkRetailer" class="date-input money" inputmode="numeric" value="${t.retailer_support_cost == null ? '' : Number(t.retailer_support_cost).toLocaleString()}" ${locked ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label class="label">JLRK 지원금<span class="label-sub">리테일러 지원금보다 클 수 없습니다</span></label>
        <input type="text" id="lkJlrk" class="date-input money" inputmode="numeric" value="${t.jlrk_support_cost == null ? '' : Number(t.jlrk_support_cost).toLocaleString()}" ${locked ? 'disabled' : ''}>
      </div>
    </div>

    <div class="field">
      <label class="label">Comment<span class="label-sub">선택</span></label>
      <input type="text" id="lkComment" class="date-input" value="${(t.comment || '').replace(/"/g, '&quot;')}" ${locked ? 'disabled' : ''}>
    </div>

    ${locked ? '' : `
      <button id="lkSaveBtn" class="save-btn">저장</button>
      <button id="lkCancelBtn" class="cancel-btn">이 건 취소하고 새로 접수하기</button>`}
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

  lkResult.querySelectorAll('.money').forEach(bindMoneyInput); // app.js 의 콤마 입력을 그대로 쓴다
  document.getElementById('lkSaveBtn').addEventListener('click', saveTicket);
  document.getElementById('lkCancelBtn').addEventListener('click', cancelTicket);
}

async function searchTicket() {
  const ticketNumber = lkTicket.value.trim();
  const authorName = lkAuthor.value.trim();
  if (!ticketNumber) return setLkStatus('티켓번호를 입력해주세요.', 'error');
  if (!authorName) return setLkStatus('작성자명을 입력해주세요. 2026-09-23 이전 접수 건은 차량번호를 넣어주세요.', 'error');

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

    const jlrkV = Number(onlyDigits(document.getElementById('lkJlrk').value) || 0);
    const retV = Number(onlyDigits(document.getElementById('lkRetailer').value) || 0);
    if (jlrkV > retV) {
      return setLkStatus('보완 필요: JLRK 지원금은 리테일러 지원금보다 클 수 없습니다.', 'error');
    }

    setLkStatus('저장 중...');
    const res = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketNumber: current.ticket_number,
        authorName: lkAuthor.value.trim(),
        comment: document.getElementById('lkComment').value.trim(),
        totalRepairCostBefore: onlyDigits(document.getElementById('lkBefore').value),
        totalPartsCost: onlyDigits(document.getElementById('lkParts').value),
        retailerSupportCost: onlyDigits(document.getElementById('lkRetailer').value),
        jlrkSupportCost: onlyDigits(document.getElementById('lkJlrk').value),
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

async function cancelTicket() {
  if (!current) return;
  if (!confirm('이 건을 취소할까요?\n취소하면 수정할 수 없고, 새로 접수하셔야 합니다.')) return;
  setLkStatus('취소하는 중...');
  try {
    const res = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNumber: current.ticket_number, authorName: lkAuthor.value.trim(), cancel: true }),
    });
    const data = await res.json();
    if (!res.ok) return setLkStatus('❌ ' + (data.error || '취소 실패'), 'error');
    renderTicket(data.ticket);
    setLkStatus('취소했습니다. 새로 접수해주세요.', 'success');
  } catch (err) {
    setLkStatus('❌ ' + (err.message || '네트워크 오류'), 'error');
  }
}

lkSearchBtn.addEventListener('click', searchTicket);
[lkTicket, lkAuthor].forEach((el) =>
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchTicket();
  })
);
