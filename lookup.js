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
  { key: 'Done', label: '검토 완료', cls: 's3' },
  { key: 'Paid', label: '지급 완료', cls: 's4' },
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

let current = null;        // 조회된 티켓
let invoiceFile = null;    // 새로 붙일 인보이스

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

function renderTicket(t) {
  current = t;
  invoiceFile = null;
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

    <div class="field">
      <label class="label">첨부 현황</label>
      <ul class="filelist">
        <li><b>1차 견적서</b> — ${t.file_name ? t.file_name : '<span style="color:#A32B43">없음</span>'}</li>
        <li><b>최종 마감 인보이스</b> — ${t.invoice_file_name ? t.invoice_file_name : '<span style="color:#A32B43">아직 첨부되지 않았습니다</span>'}</li>
      </ul>
      ${locked ? '' : `
      <div class="file-wrap">
        <input type="file" id="lkInvoiceInput" class="file-input-hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx">
        <button type="button" id="lkInvoiceBtn" class="file-btn">${t.invoice_file_name ? '인보이스 다시 첨부' : '최종 인보이스 첨부'}</button>
        <span id="lkInvoiceName" class="file-name">선택된 파일 없음</span>
      </div>`}
    </div>

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

  const invoiceInput = document.getElementById('lkInvoiceInput');
  const invoiceBtn = document.getElementById('lkInvoiceBtn');
  const invoiceName = document.getElementById('lkInvoiceName');
  invoiceBtn.addEventListener('click', () => invoiceInput.click());
  invoiceInput.addEventListener('change', () => {
    invoiceFile = invoiceInput.files[0] || null;
    invoiceName.textContent = invoiceFile ? invoiceFile.name : '선택된 파일 없음';
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
    let invoicePath = null;
    let invoiceName = null;
    if (invoiceFile) {
      setLkStatus('인보이스 업로드 중...');
      const uploaded = await uploadFile(invoiceFile); // app.js 의 업로드를 그대로 쓴다
      invoicePath = uploaded.filePath;
      invoiceName = uploaded.fileName;
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
        invoicePath,
        invoiceName,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setLkStatus('❌ ' + (data.error || '저장 실패'), 'error');

    renderTicket(data.ticket);
    setLkStatus(
      invoiceName
        ? '✅ 저장했습니다. 인보이스가 첨부되어 「인보이스 마감」 단계로 넘어갔습니다.'
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
