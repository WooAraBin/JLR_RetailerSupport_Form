const categorySelect = document.getElementById('categorySelect');
const codingSelect = document.getElementById('codingSelect');
const codingField = document.getElementById('codingField');
const dueBySelect = document.getElementById('dueBySelect');
const specificDateField = document.getElementById('specificDateField');
const specificDateInput = document.getElementById('specificDateInput');
const alarmField = document.getElementById('alarmField');
const alarmButtons = document.querySelectorAll('.toggle-btn');
const noteInput = document.getElementById('noteInput');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');
const loadingWrap = document.getElementById('loadingWrap');
const formWrap = document.getElementById('formWrap');

let alarmValue = '';

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

// 옵션 로드
async function loadOptions() {
  try {
    const res = await fetch('/api/options');
    const data = await res.json();

    fillSelect(categorySelect, data.categoryOptions);
    fillSelect(codingSelect, data.codingOptions);
    fillSelect(dueBySelect, data.dueByOptions);

    loadingWrap.style.display = 'none';
    formWrap.style.display = 'flex';
  } catch (err) {
    loadingWrap.querySelector('.loading-text').textContent = '옵션 로딩 실패. 새로고침 해주세요.';
  }
}

// Category 선택 시 Program-Coding 표시/숨김
categorySelect.addEventListener('change', () => {
  if (categorySelect.value === 'Program - Coding') {
    codingField.style.display = 'flex';
  } else {
    codingField.style.display = 'none';
    codingSelect.value = '';
  }
});

// Due by 선택 시 Specific Date / Alarm 표시 처리
dueBySelect.addEventListener('change', () => {
  if (dueBySelect.value === 'Specific Date') {
    specificDateField.style.display = 'flex';
    alarmField.style.display = 'flex';
  } else {
    specificDateField.style.display = 'none';
    alarmField.style.display = 'none';
    specificDateInput.value = '';
    alarmValue = '';
    alarmButtons.forEach(btn => btn.classList.remove('active'));
  }
});

// Alarm Y/N 토글
alarmButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    alarmValue = btn.dataset.value;
    alarmButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// 저장
saveBtn.addEventListener('click', async () => {
  const content = noteInput.value.trim();
  const category = categorySelect.value;
  const programCoding = codingSelect.value;
  const dueBy = dueBySelect.value;
  const specificDate = specificDateInput.value;

  if (!category) {
    setStatus('Category를 선택해주세요.', 'error');
    return;
  }

  if (category === 'Program - Coding' && !programCoding) {
    setStatus('Program - Coding을 선택해주세요.', 'error');
    return;
  }

  if (!dueBy) {
    setStatus('Due by를 선택해주세요.', 'error');
    return;
  }

  if (dueBy === 'Specific Date' && !specificDate) {
    setStatus('날짜를 입력해주세요.', 'error');
    return;
  }

  if (dueBy === 'Specific Date' && !alarmValue) {
    setStatus('Alarm 요청 여부를 선택해주세요.', 'error');
    return;
  }

  if (!content) {
    setStatus('내용을 입력해주세요.', 'error');
    return;
  }

  saveBtn.disabled = true;
  setStatus('저장 중...', '');

  try {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        category,
        programCoding,
        dueBy,
        specificDate,
        alarm: alarmValue
      })
    });

    const data = await response.json();

    if (response.ok) {
      setStatus('✅ 저장되었습니다!', 'success');
      noteInput.value = '';
      categorySelect.value = '';
      codingSelect.value = '';
      dueBySelect.value = '';
      specificDateInput.value = '';
      codingField.style.display = 'none';
      specificDateField.style.display = 'none';
      alarmField.style.display = 'none';
      alarmValue = '';
      alarmButtons.forEach(btn => btn.classList.remove('active'));
      setTimeout(() => setStatus(''), 3000);
    } else {
      setStatus('❌ ' + (data.error || '저장 실패'), 'error');
    }
  } catch (err) {
    setStatus('❌ 네트워크 오류. 다시 시도해주세요.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

// Cmd+Enter 저장
noteInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    saveBtn.click();
  }
});

loadOptions();
