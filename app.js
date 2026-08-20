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
const fileBtn = document.getElementById('fileBtn');
const fileNameEl = document.getElementById('fileName');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');
const loadingWrap = document.getElementById('loadingWrap');
const formWrap = document.getElementById('formWrap');

let selectedFile = null;

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
    fillSelect(repairTypeSelect, data.repairTypeOptions);

    loadingWrap.style.display = 'none';
    formWrap.style.display = 'flex';
  } catch (err) {
    loadingWrap.querySelector('.loading-text').textContent = '옵션 로딩 실패. 새로고침 해주세요.';
  }
}

// 파일 선택
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

  saveBtn.disabled = true;

  try {
    let filePath = null;
    let fileName = null;

    if (selectedFile) {
      setStatus('파일 업로드 중...', '');
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
        comment,
        plannedStartDate,
        totalRepairCostBefore,
        totalPartsCost,
        retailerSupportCost,
        jlrkSupportCost,
        filePath,
        fileName
      })
    });

    const data = await response.json();

    if (response.ok) {
      workshopSelect.value = '';
      repairTypeSelect.value = '';
      vehicleNumberInput.value = '';
      commentInput.value = '';
      plannedStartDateInput.value = '';
      totalRepairCostBeforeInput.value = '';
      totalPartsCostInput.value = '';
      retailerSupportCostInput.value = '';
      jlrkSupportCostInput.value = '';
      fileInput.value = '';
      selectedFile = null;
      fileNameEl.textContent = '선택된 파일 없음';
      setStatus(`✅ 티켓번호 ${data.ticketNumber}가 생성되었습니다.`, 'success');
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
