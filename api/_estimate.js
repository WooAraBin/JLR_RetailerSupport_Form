// 1차 견적서 수치 자동 대조 (2026-09-23)
//
// 접수자가 적은 금액이 실제 견적서에 있는 숫자인지 1차로 확인해 준다.
// JLRK가 승인 전에 다시 보는 것이 최종 확인이고, 여기서 틀렸다고 접수를 막지는 않는다.
//
// 읽을 수 있는 것: 글자가 들어 있는 PDF, 엑셀(xlsx/xls), CSV·텍스트.
// 읽을 수 없는 것: 스캔해서 사진으로 만든 PDF, 이미지 — 그때는 'unreadable'로 남기고 넘어간다.

const path = require('path');

function collectNumbers(text) {
  // 1,234,000 / 1 234 000 / 1234000원 → 숫자만 남겨 모은다(4자리 이상만 금액으로 본다)
  const found = new Set();
  const re = /\d[\d,]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[^\d]/g, '');
    if (digits.length >= 4) found.add(Number(digits));
  }
  return [...found];
}

// 실제 견적서를 열어보니 「수리비 합계」처럼 한 칸으로 안 찍히고 부품비+공임으로 나뉘어 있거나,
// 끝자리가 반올림돼 있는 경우가 많다. 그래서 다음 중 하나면 확인된 것으로 본다.
//   ① 같은 숫자가 있다  ② 1% 안쪽으로 차이가 난다(반올림)  ③ 견적서 숫자 둘을 더하면 같다
const TOLERANCE = 0.01;

function foundIn(numbers, value) {
  if (numbers.includes(value)) return 'exact';
  for (const n of numbers) {
    if (Math.abs(n - value) <= value * TOLERANCE) return 'rounded';
  }
  for (let i = 0; i < numbers.length; i += 1) {
    for (let j = i + 1; j < numbers.length; j += 1) {
      if (Math.abs(numbers[i] + numbers[j] - value) <= value * TOLERANCE) return 'sum';
    }
  }
  return null;
}

async function extractText(buffer, fileName) {
  const ext = path.extname(fileName || '').toLowerCase();

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const out = await pdfParse(buffer);
    return out.text || '';
  }

  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return wb.SheetNames.map((name) => XLSX.utils.sheet_to_csv(wb.Sheets[name])).join('\n');
  }

  if (ext === '.txt') return buffer.toString('utf8');

  return '';
}

const AMOUNT_LABELS = {
  total_repair_cost_before: 'Total Repair Cost (Before)',
  total_parts_cost: 'Total Parts Cost',
  retailer_support_cost: 'Retailer Support Cost',
  jlrk_support_cost: 'JLRK Support Cost',
};

/**
 * @returns {{status:'match'|'mismatch'|'unreadable'|'skipped', missing?:string[], checked?:string[], reason?:string, checkedAt:string}}
 */
async function checkEstimate(buffer, fileName, amounts) {
  const stamp = new Date().toISOString();
  const entered = Object.entries(AMOUNT_LABELS)
    .filter(([key]) => amounts[key] !== null && amounts[key] !== undefined && Number(amounts[key]) > 0)
    .map(([key, label]) => ({ key, label, value: String(Number(amounts[key])) }));

  if (entered.length === 0) {
    return { status: 'skipped', reason: '대조할 금액이 입력되지 않았습니다', checkedAt: stamp };
  }

  let text = '';
  try {
    text = await extractText(buffer, fileName);
  } catch (err) {
    return { status: 'unreadable', reason: '파일을 읽지 못했습니다', checkedAt: stamp };
  }

  if (!text || text.replace(/\s/g, '').length < 20) {
    return { status: 'unreadable', reason: '스캔 이미지라 글자를 읽을 수 없습니다', checkedAt: stamp };
  }

  const numbers = collectNumbers(text);
  const missing = [];
  const matched = [];
  for (const e of entered) {
    const how = foundIn(numbers, Number(e.value));
    if (how) matched.push(e.label);
    else missing.push(e.label);
  }

  return {
    status: missing.length === 0 ? 'match' : 'mismatch',
    checked: entered.map((e) => e.label),
    matched,
    missing,
    fileName: fileName || null,
    checkedAt: stamp,
  };
}

module.exports = { checkEstimate };
