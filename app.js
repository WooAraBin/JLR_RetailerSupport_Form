const workshopSelect = document.getElementById('workshopSelect');
const repairTypeSelect = document.getElementById('repairTypeSelect');
const vehicleNumberInput = document.getElementById('vehicleNumberInput');
const commentInput = document.getElementById('commentInput');
const plannedStartDateInput = document.getElementById('plannedStartDateInput');
const totalRepairCostBeforeInput = document.getElementById('totalRepairCostBeforeInput');
const totalPartsCostInput = document.getElementById('totalPartsCostInput');
const retailerSupportCostInput = document.getElementById('retailerSupportCostInput');
const jlrkSupportCostInput = document.getElementById('jlrkSupportCostInput');
const fileInput = document.getElementById('fileInput');
const approvalInput = document.getElementById('approvalInput');
const approvalBtn = document.getElementById('approvalBtn');
const approvalNameEl = document.getElementById('approvalName');
const fileBtn = document.getElementById('fileBtn');
const fileNameEl = document.getElementById('fileName');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');
const loadingWrap = document.getElementById('loadingWrap');
const formWrap = document.getElementById('formWrap');
const menuWrap = document.getElementById('menuWrap');
const forecastWrap = document.getElementById('forecastWrap');
const backBtn = document.getElementById('backBtn');
const titleSub = document.getElementById('titleSub');
const repairTypeField = document.getElementById('repairTypeField');
const fcWorkshopSelect = document.getElementById('fcWorkshop');
const authorNameInput = document.getElementById('authorNameInput');
const lookupWrap = document.getElementById('lookupWrap');
const containerEl = document.querySelector('.container');

// 프로그램 3개를 한 사이트에서 고른다. 지원금 두 개는 같은 폼을 쓰고 Repair Type만 고정된다.
const PROGRAMS = {
  accident: { title: '사고차 지원금 프로그램', sub: 'Accident Repair', repairType: 'Accident Repair' },
  repair: { title: '수리 지원 프로그램', sub: 'Repair Support', repairType: 'Repair Support' },
  forecast: { title: 'Parts Wholesale 예상마감치 입력', sub: '매월 1회 · 지점 단위 제출' },
  lookup: { title: '내 티켓 조회', sub: '자료 첨부 · 수치 수정' },
};

// 수리 지원 프로그램만 2026-09-23 개편 대상 — 작성자명·견적서 필수, 티켓 조회
const REPAIR_KEY = 'repair';
let currentProgram = null;

function showMenu() {
  menuWrap.style.display = 'flex';
  backBtn.style.display = 'none';
  formWrap.style.display = 'none';
  forecastWrap.style.display = 'none';
  if (lookupWrap) lookupWrap.style.display = 'none';
  containerEl.classList.remove('wide');
  titleSub.textContent = 'Retailer Programme';
  currentProgram = null;
  setStatus('');
}

function openProgram(key) {
  const prog = PROGRAMS[key];
  if (!prog) return;
  menuWrap.style.display = 'none';
  backBtn.style.display = '';
  titleSub.textContent = prog.title + ' · ' + prog.sub;

  currentProgram = key;

  if (key === 'forecast') {
    formWrap.style.display = 'none';
    forecastWrap.style.display = '';
    if (lookupWrap) lookupWrap.style.display = 'none';
    return;
  }

  if (key === 'lookup') {
    formWrap.style.display = 'none';
    forecastWrap.style.display = 'none';
    lookupWrap.style.display = '';
    containerEl.classList.add('wide');
    return;
  }

  forecastWrap.style.display = 'none';
  if (lookupWrap) lookupWrap.style.display = 'none';
  formWrap.style.display = '';
  // 수리 지원만 넓은 2열 화면 + 작성자명·견적서 필수
  const isRepair = key === REPAIR_KEY;
  containerEl.classList.toggle('wide', isRepair);
  document.getElementById('stepsGuide').style.display = isRepair ? '' : 'none';
  document.getElementById('stepsNote').style.display = isRepair ? '' : 'none';
  document.getElementById('fileGuide').style.display = isRepair ? '' : 'none';
  document.getElementById('authorNameInput').closest('.field').style.display = isRepair ? '' : 'none';
  // 이메일 승인본 칸은 수리 지원 전용(사고차는 개편 전 그대로)
  document.getElementById('approvalField').style.display = isRepair ? '' : 'none';
  // 사고차 지원금은 이번 개편 대상이 아니다 — 개편 전 모습(1열·옛 라벨·옛 칸 순서) 그대로 둔다
  formWrap.classList.toggle('one-col', !isRepair);
  document.getElementById('fileLabel').firstChild.nodeValue = isRepair ? '② 1차 견적서' : 'Files & Media';
  commentInput.placeholder = isRepair ? '예: 우측 프론트 범퍼·펜더 교환, 고객 자비 부담 조정 요청' : '메모 / 차량 정보 등';
  // 개편 전 순서는 차량번호 → Comment → 수리 예정일이었다
  const commentField = commentInput.closest('.field');
  const dateField = plannedStartDateInput.closest('.field');
  if (isRepair) {
    commentField.parentNode !== formWrap && formWrap.insertBefore(commentField, dateField.parentNode.nextSibling);
  } else {
    dateField.parentNode.insertBefore(commentField, dateField);
  }
  document.getElementById('fileSub').textContent = isRepair ? '필수' : '선택';
  // 프로그램에서 유형이 이미 정해지므로 선택칸은 감추고 값만 박아둔다
  repairTypeSelect.value = prog.repairType;
  repairTypeField.style.display = 'none';
  setStatus('');
}

document.querySelectorAll('.menu-card[data-go]').forEach((card) => {
  card.addEventListener('click', () => openProgram(card.dataset.go));
});
document.querySelectorAll('.menu-btn[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => openProgram(btn.dataset.go));
});
backBtn.addEventListener('click', showMenu);

let selectedFile = null;      // ② 1차 견적서
let selectedApproval = null;  // ① 이메일 승인본 캡처

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = 'status ' + type;
}

function fillSelect(selectEl, options) {
  options.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  });
}

// 옵션 로드 (Workshop Select / Repair Type 은 Notion 데이터베이스의 실제 옵션을 그대로 불러옴)
async function loadOptions() {
  try {
    const res = await fetch('/api/options');
    const data = await res.json();

    fillSelect(workshopSelect, data.workshopOptions);
    if (fcWorkshopSelect) fillSelect(fcWorkshopSelect, data.workshopOptions);
    fillSelect(repairTypeSelect, data.repairTypeOptions);

    loadingWrap.style.display = 'none';
    showMenu();   // 옵션이 준비되면 프로그램 선택 화면부터 보여준다
  } catch (err) {
    loadingWrap.querySelector('.loading-text').textContent = '옵션 로딩 실패. 새로고침 해주세요.';
  }
}

// 파일 선택
approvalBtn.addEventListener('click', () => approvalInput.click());
approvalInput.addEventListener('change', () => {
  selectedApproval = approvalInput.files[0] || null;
  approvalNameEl.textContent = selectedApproval ? selectedApproval.name : '선택된 파일 없음';
});

fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    selectedFile = file;
    fileNameEl.textContent = file.name;
  } else {
    selectedFile = null;
    fileNameEl.textContent = '선택된 파일 없음';
  }
});

// 파일을 Supabase Storage에 올리고 저장 경로를 반환
function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file) {
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('파일이 너무 큽니다. 4MB 이하로 올려주세요.');
  }

  const dataBase64 = await readAsBase64(file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataBase64
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || '파일 업로드 실패');
  }

  return data; // { filePath, fileName }
}

// 저장
saveBtn.addEventListener('click', async () => {
  const workshop = workshopSelect.value;
  const repairType = repairTypeSelect.value;
  const vehicleNumber = vehicleNumberInput.value.trim();
  const authorName = authorNameInput.value.trim();
  const comment = commentInput.value.trim();
  const plannedStartDate = plannedStartDateInput.value;
  const totalRepairCostBefore = totalRepairCostBeforeInput.value;
  const totalPartsCost = totalPartsCostInput.value;
  const retailerSupportCost = retailerSupportCostInput.value;
  const jlrkSupportCost = jlrkSupportCostInput.value;

  if (!workshop) {
    setStatus('Workshop을 선택해주세요.', 'error');
    return;
  }

  if (!repairType) {
    setStatus('Repair Type을 선택해주세요.', 'error');
    return;
  }

  if (!vehicleNumber) {
    setStatus('Vehicle Number를 입력해주세요.', 'error');
    return;
  }

  // 수리 지원은 작성자명과 1차 견적서가 있어야 접수된다(조회·대조에 쓰인다)
  if (currentProgram === REPAIR_KEY) {
    if (!authorName) {
      setStatus('작성자명을 입력해주세요. 나중에 티켓을 찾을 때 씁니다.', 'error');
      return;
    }
    if (!selectedApproval) {
      setStatus('이메일 승인본 캡처를 첨부해주세요.', 'error');
      return;
    }
    if (!selectedFile) {
      setStatus('1차 견적서를 첨부해주세요.', 'error');
      return;
    }
  }

  saveBtn.disabled = true;

  try {
    let filePath = null;
    let fileName = null;

    let approvalPath = null;
    let approvalName = null;

    if (selectedApproval) {
      setStatus('이메일 승인본 업로드 중...', '');
      const up = await uploadFile(selectedApproval);
      approvalPath = up.filePath;
      approvalName = up.fileName;
    }

    if (selectedFile) {
      setStatus('견적서 업로드 중...', '');
      const uploaded = await uploadFile(selectedFile);
      filePath = uploaded.filePath;
      fileName = uploaded.fileName;
    }

    setStatus('저장 중...', '');

    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workshop,
        repairType,
        vehicleNumber,
        authorName,
        comment,
        plannedStartDate,
        totalRepairCostBefore,
        totalPartsCost,
        retailerSupportCost,
        jlrkSupportCost,
        filePath,
        fileName,
        approvalPath,
        approvalName
      })
    });

    const data = await response.json();

    if (response.ok) {
      workshopSelect.value = '';
      repairTypeSelect.value = '';
      vehicleNumberInput.value = '';
      authorNameInput.value = '';
      commentInput.value = '';
      plannedStartDateInput.value = '';
      totalRepairCostBeforeInput.value = '';
      totalPartsCostInput.value = '';
      retailerSupportCostInput.value = '';
      jlrkSupportCostInput.value = '';
      fileInput.value = '';
      selectedFile = null;
      fileNameEl.textContent = '선택된 파일 없음';
      approvalInput.value = '';
      selectedApproval = null;
      approvalNameEl.textContent = '선택된 파일 없음';
      setStatus(
        `✅ 티켓번호 ${data.ticketNumber} 가 생성되었습니다. 이 번호와 작성자명으로 「내 티켓 조회」에서 다시 여실 수 있습니다.`,
        'success'
      );
    } else {
      setStatus('❌ ' + (data.error || '저장 실패'), 'error');
    }
  } catch (err) {
    setStatus('❌ ' + (err.message || '네트워크 오류. 다시 시도해주세요.'), 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

// Cmd+Enter 저장
vehicleNumberInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    saveBtn.click();
  }
});

loadOptions();
