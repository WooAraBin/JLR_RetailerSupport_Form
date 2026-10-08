// 수리비 지원(신규, 2026-10-08) — One DMS 견적서·인보이스 합계표 판독.
// 기존 판독기(_invoice.js)는 그대로 두고 새로 만든다. 다른 점:
//  ① 글자가 한 글자씩 따로 저장된 PDF(「부」「품」, 「2」「,」「7」…)도 읽는다 — 같은 줄에서 붙어 있는 글자를 이어 붙인다.
//  ② 분할 「INVOICE」 양식(합계 칸 이름이 「계」)도 읽는다.
//  ③ RO 번호(RO+10자리)·차대번호(17자리)를 같이 뽑는다.
// 못 읽으면 null — 호출하는 쪽은 0원으로 비교하지 말고 「읽지 못함」으로 처리한다.

const LABELS = ['부품', '공임', '기타', 'Surcharge', 'Surcharge할인', '할인', '합계', '계', '청구금액', '부가가치세', '총액'];

function toNum(s) {
  const t = String(s || '').replace(/[^\d.-]/g, '');
  if (!t || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// 같은 줄의 조각을 x 순서로 놓고, 앞 조각 끝과 다음 조각 시작이 가까우면 한 덩어리로 붙인다
function tokensOf(items) {
  // 공백만 있는 조각은 칸 사이를 메우는 구분자라 버린다(폭이 커서 남기면 옆 칸 글자까지 붙어 버린다)
  const sorted = items.filter((it) => it.s.trim() !== '').sort((a, b) => a.x - b.x);
  const out = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    const gap = last ? it.x - (last.x + last.w) : Infinity;
    if (last && gap < Math.max(3, it.h * 0.6)) {
      last.s += it.s;
      last.w = it.x + it.w - last.x;
    } else {
      out.push({ x: it.x, w: it.w, h: it.h, s: it.s });
    }
  }
  return out.map((t) => ({ ...t, s: t.s.replace(/\s+/g, ''), cx: t.x + t.w / 2 }));
}

async function readDmsPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  } catch {
    /* 기본값 */
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let allText = '';
  let found = null;

  for (let pg = 1; pg <= doc.numPages; pg += 1) {
    const content = await (await doc.getPage(pg)).getTextContent();
    const rows = {};
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const h = Math.abs(it.transform[3]) || it.height || 8;
      (rows[y] = rows[y] || []).push({ x: it.transform[4], w: it.width || 0, h, s: it.str });
    }
    // 1px 차이로 갈라진 줄은 합친다
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    const lines = [];
    for (const y of ys) {
      const prev = lines[lines.length - 1];
      if (prev && Math.abs(prev.y - y) <= 2) prev.items.push(...rows[y]);
      else lines.push({ y, items: rows[y].slice() });
    }
    const tokLines = lines.map((l) => ({ y: l.y, toks: tokensOf(l.items) }));
    allText += tokLines.map((l) => l.toks.map((t) => t.s).join(' ')).join('\n') + '\n';

    if (found) continue;
    for (let i = 0; i < tokLines.length; i += 1) {
      const heads = tokLines[i].toks.filter((t) => LABELS.includes(t.s));
      const names = heads.map((h) => h.s);
      if (!names.includes('부품') || !names.includes('공임') || !(names.includes('합계') || names.includes('계'))) continue;
      // 바로 아래 숫자 줄
      const valueLine = tokLines.slice(i + 1, i + 4).find((l) => l.toks.filter((t) => toNum(t.s) !== null).length >= 2);
      if (!valueLine) continue;
      const vals = valueLine.toks.filter((t) => toNum(t.s) !== null);
      const res = {};
      for (const h of heads) {
        let best = null;
        let bd = Infinity;
        for (const v of vals) {
          const d = Math.abs(v.cx - h.cx);
          if (d < bd) { bd = d; best = v; }
        }
        if (best && bd < 45) res[h.s === '계' ? '합계' : h.s] = toNum(best.s);
      }
      if (res['부품'] != null && res['공임'] != null) {
        res.form = names.includes('청구금액') ? '청구서' : 'INVOICE';
        found = res;
      }
    }
  }

  const flat = allText.replace(/\s+/g, '');
  const ro = (flat.match(/RO\d{10}/) || [])[0] || null;
  const vin = (flat.match(/SA[A-HJ-NPR-Z0-9]{15}/) || [])[0] || null;
  return { totals: found, ro, vin };
}

module.exports = { readDmsPdf };
