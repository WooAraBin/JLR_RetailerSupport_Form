// 최종 마감 인보이스 자동 판독 (2026-09-29 보스 지시)
//
// 인보이스는 DMS에서 뽑는 「자동차 점검·정비 청구서」 고정 양식이라, 합계 줄의 라벨
// (부 품 / 공 임 / Surcharge / 할 인 / 합 계 / 청구금액 / 부가가치세 / 총 액) 아래에
// 같은 x 위치로 값이 찍힌다. 글자만 훑으면 표 칸이 붙어 나와 못 읽지만(실측 확인),
// 좌표를 보면 정확히 읽힌다.
//
// ※ 금액은 전부 부가세 제외(공급가) 기준으로 본다 — 지원금에 부가세를 얹지 않기 때문에
//    비교 대상은 「합계 / 청구금액」이고 「총액」(부가세 포함)은 쓰지 않는다.

const LABELS = ['부품', '공임', 'Surcharge', 'Surcharge할인', '할인', '합계', '청구금액', '부가가치세', '총액'];

function toNum(v) {
  const n = Number(String(v || '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** PDF에서 합계 줄을 읽어 { 부품, 공임, 할인, 합계, 청구금액, ... } 을 돌려준다 */
async function readInvoicePdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const found = {};

  for (let pg = 1; pg <= doc.numPages; pg += 1) {
    const content = await (await doc.getPage(pg)).getTextContent();
    const rows = {};
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str.trim() });
    }
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (let i = 0; i < ys.length; i += 1) {
      const line = rows[ys[i]].sort((a, b) => a.x - b.x);
      const joined = line.map((l) => l.s).join(' ').replace(/\s+/g, '');
      if (!joined.includes('합계') || !joined.includes('청구금액')) continue;
      const values = (rows[ys[i + 1]] || []).sort((a, b) => a.x - b.x);
      for (const lab of line) {
        const key = lab.s.replace(/\s/g, '');
        if (!LABELS.includes(key)) continue;
        let best = null;
        let bestDist = Infinity;
        for (const v of values) {
          const d = Math.abs(v.x - lab.x);
          if (d < bestDist) {
            bestDist = d;
            best = v;
          }
        }
        if (best && bestDist < 40) found[key] = toNum(best.s);
      }
    }
  }
  return Object.keys(found).length ? found : null;
}

/**
 * 접수 때 적은 금액과 인보이스를 맞춰본다.
 *  ① 총 할인 ≥ 리테일러 지원 + JLRK 지원
 *  ② 청구금액 ≤ 견적서 금액 − 리테일러 지원 − JLRK 지원
 *  ③ 할인 전 부품 + 공임이 견적서와 같아야 한다(작업 범위가 그대로여야 하므로)
 * 어긋나면 「보완 필요」로 알린다 — 용어는 이것 하나로 통일한다(보스 지시).
 */
async function checkInvoice(buffer, fileName, amounts) {
  const stamp = new Date().toISOString();
  if (!/\.pdf$/i.test(fileName || '')) {
    return { status: 'unreadable', reason: 'PDF가 아닙니다 — DMS에서 PDF로 뽑아 올려주세요', checkedAt: stamp };
  }

  let read = null;
  try {
    read = await readInvoicePdf(buffer);
  } catch (err) {
    return { status: 'unreadable', reason: '인보이스를 읽지 못했습니다 (' + (err.message || '') + ')', checkedAt: stamp };
  }
  if (!read) {
    return { status: 'unreadable', reason: '합계 줄을 찾지 못했습니다 — DMS에서 뽑은 청구서 원본인지 확인해주세요', checkedAt: stamp };
  }

  const quote = Number(amounts.total_repair_cost_before || 0);   // 견적서 금액(청구금액, 부가세 제외)
  const parts = Number(amounts.total_parts_cost || 0);            // 견적서 부품 금액
  const retailer = Number(amounts.retailer_support_cost || 0);
  const jlrk = Number(amounts.jlrk_support_cost || 0);
  const support = retailer + jlrk;

  const invDiscount = (read['할인'] || 0) + (read['Surcharge할인'] || 0);
  const invBilled = read['청구금액'] !== undefined ? read['청구금액'] : (read['합계'] || 0);
  const invBeforeDiscount = (read['부품'] || 0) + (read['공임'] || 0);

  const issues = [];
  if (support > 0 && invDiscount < support) {
    issues.push(`인보이스 할인 ${invDiscount.toLocaleString()}원이 지원금 합계 ${support.toLocaleString()}원보다 적습니다`);
  }
  const expectedMax = quote - support;
  if (quote > 0 && invBilled > expectedMax) {
    issues.push(`인보이스 청구금액 ${invBilled.toLocaleString()}원이 견적서 금액 − 지원금(${expectedMax.toLocaleString()}원)보다 큽니다`);
  }
  if (quote > 0 && Math.abs(invBeforeDiscount - quote) > Math.max(1000, quote * 0.01)) {
    issues.push(
      `할인 전 부품+공임 ${invBeforeDiscount.toLocaleString()}원이 견적서 금액 ${quote.toLocaleString()}원과 다릅니다`
    );
  }
  if (parts > 0 && read['부품'] !== undefined && Math.abs(read['부품'] - parts) > Math.max(1000, parts * 0.01)) {
    issues.push(`인보이스 부품 ${read['부품'].toLocaleString()}원이 접수한 부품 금액 ${parts.toLocaleString()}원과 다릅니다`);
  }

  return {
    status: issues.length ? 'needs_fix' : 'ok',
    read,
    issues,
    summary: {
      부품: read['부품'] || 0,
      공임: read['공임'] || 0,
      할인: invDiscount,
      청구금액: invBilled,
      부가세제외합계: read['합계'] || 0,
    },
    checkedAt: stamp,
  };
}

module.exports = { checkInvoice, readInvoicePdf };
