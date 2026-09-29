// 견적서 수치 자동 확인 (2026-09-29 전면 교체)
//
// 견적서도 인보이스와 같은 DMS 고정 양식(자동차 점검·정비 청구서)이다.
// 처음엔 문서 전체 글자에서 숫자를 훑었는데, 표 칸이 서로 붙어 나와서
// (`100002746900` 안에 부품 2,746,900이 들어 있는 식) 멀쩡한 건도 「확인 안 됨」이 됐다.
// 그래서 인보이스와 같은 **좌표 판독**으로 바꿨다 — 합계 줄의 라벨 아래 값을 읽는다.
//
// 대조 기준(보스 확정)
//   · 견적서 금액 = 부품 + 공임 (= 합계, 부가세 제외)
//   · 부품 금액   = 부품
//   · 리테일러·JLRK 지원금은 견적서에 없는 값이라 대조 대상이 아니다(협의로 정하는 금액).

const { readInvoicePdf } = require('./_invoice');

const XLSX_EXT = ['.xlsx', '.xls', '.csv'];

function ext(name) {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

/** 엑셀·CSV 견적서는 표 구조가 제각각이라 숫자 목록으로만 확인한다(예전 방식 유지) */
function numbersFromSheet(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const text = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
  const found = new Set();
  const re = /\d[\d,]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[^\d]/g, '');
    if (digits.length >= 4) found.add(Number(digits));
  }
  return [...found];
}

function close(a, b) {
  if (!a || !b) return false;
  return Math.abs(a - b) <= Math.max(1000, b * 0.01);
}

/**
 * @returns {{status:'ok'|'needs_fix'|'unreadable'|'skipped', read?:object, lines?:Array, issues?:string[], reason?:string, checkedAt:string}}
 *  lines — 화면에 그대로 뿌릴 항목별 결과 [{key,label,amount,state}] state: confirmed | different | not_in_estimate | unknown
 */
async function checkEstimate(buffer, fileName, amounts) {
  const stamp = new Date().toISOString();
  const quote = Number(amounts.total_repair_cost_before || 0);
  const parts = Number(amounts.total_parts_cost || 0);
  const retailer = Number(amounts.retailer_support_cost || 0);
  const jlrk = Number(amounts.jlrk_support_cost || 0);

  if (!quote && !parts) {
    return { status: 'skipped', reason: '대조할 금액이 입력되지 않았습니다', checkedAt: stamp };
  }

  const base = [
    { key: 'quote', label: '견적서 금액', amount: quote },
    { key: 'parts', label: '그중 부품 금액', amount: parts },
    { key: 'retailer', label: '리테일러 지원금', amount: retailer, notInEstimate: true },
    { key: 'jlrk', label: 'JLRK 지원금', amount: jlrk, notInEstimate: true },
  ].filter((l) => l.amount > 0);

  const e = ext(fileName);

  // 엑셀 견적서 — 숫자 목록에 있는지만 본다
  if (XLSX_EXT.includes(e)) {
    let nums = [];
    try {
      nums = numbersFromSheet(buffer);
    } catch {
      return { status: 'unreadable', reason: '견적서를 읽지 못했습니다', checkedAt: stamp };
    }
    const lines = base.map((l) => ({
      ...l,
      state: l.notInEstimate ? 'not_in_estimate' : nums.some((n) => close(n, l.amount)) ? 'confirmed' : 'different',
    }));
    const issues = lines.filter((l) => l.state === 'different').map((l) => `${l.label} ${l.amount.toLocaleString()}원을 견적서에서 찾지 못했습니다`);
    return { status: issues.length ? 'needs_fix' : 'ok', lines, issues, checkedAt: stamp };
  }

  if (e !== '.pdf') {
    return { status: 'unreadable', reason: 'PDF나 엑셀로 올려주세요', checkedAt: stamp };
  }

  let read = null;
  try {
    read = await readInvoicePdf(buffer); // 같은 양식이라 판독기를 함께 쓴다
  } catch (err) {
    return { status: 'unreadable', reason: '견적서를 읽지 못했습니다 (' + (err.message || '') + ')', checkedAt: stamp };
  }
  if (!read) {
    return {
      status: 'unreadable',
      reason: '합계 줄을 찾지 못했습니다 — DMS에서 뽑은 견적서 원본인지 확인해주세요',
      checkedAt: stamp,
    };
  }

  const docParts = read['부품'] || 0;
  const docLabour = read['공임'] || 0;
  // 견적서의 「합계」 칸은 할인이 적용된 뒤 값이다(실측: 부품+공임 3,035,900 → 합계 2,486,520).
  // 견적서 금액은 **할인 전 부품 + 공임**으로 본다(보스 확정).
  const docTotal = docParts + docLabour;
  const docAfterDiscount = read['합계'] || 0;

  const lines = base.map((l) => {
    if (l.notInEstimate) return { ...l, state: 'not_in_estimate' };
    if (l.key === 'quote') return { ...l, state: close(docTotal, l.amount) ? 'confirmed' : 'different', doc: docTotal };
    if (l.key === 'parts') return { ...l, state: close(docParts, l.amount) ? 'confirmed' : 'different', doc: docParts };
    return { ...l, state: 'unknown' };
  });

  const issues = lines
    .filter((l) => l.state === 'different')
    .map((l) => `${l.label} ${l.amount.toLocaleString()}원이 견적서의 ${(l.doc || 0).toLocaleString()}원과 다릅니다`);

  if (retailer > 0 && jlrk > retailer) {
    issues.push('JLRK 지원금이 리테일러 지원금보다 큽니다');
  }

  return {
    status: issues.length ? 'needs_fix' : 'ok',
    read,
    lines,
    issues,
    summary: { 부품: docParts, 공임: docLabour, 합계: docTotal, 할인후: docAfterDiscount },
    fileName: fileName || null,
    checkedAt: stamp,
  };
}

module.exports = { checkEstimate };
