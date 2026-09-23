// 티켓 수정 — 수치 고치기 + 최종 마감 인보이스 첨부.
//
// · 지급 완료(Paid)는 서버에서 막는다. 화면만 잠그면 요청을 직접 보내 고칠 수 있다.
// · 인보이스가 처음 붙으면 상태를 '인보이스 마감'(In progress)으로 올린다.
//   이미 검토 완료·지급 완료로 올라간 건은 되돌리지 않는다.
// · 수치가 바뀌면 1차 견적서와 다시 대조해 결과를 갱신한다.

const path = require('path');
const { supabase, TABLE, BUCKET } = require('./_supabase');
const { findTicket, publicView } = require('./lookup');
const { checkEstimate } = require('./_estimate');

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    ticketNumber,
    authorName,
    comment,
    totalRepairCostBefore,
    totalPartsCost,
    retailerSupportCost,
    jlrkSupportCost,
    invoicePath,
    invoiceName,
  } = req.body || {};

  if (!ticketNumber || !authorName) {
    return res.status(400).json({ error: '티켓번호와 작성자명이 필요합니다.' });
  }

  try {
    const { row, error } = await findTicket(ticketNumber, authorName);
    if (error) return res.status(404).json({ error });

    if (row.rcsm_approval === 'Paid') {
      return res.status(403).json({ error: '지급이 끝난 건이라 수정할 수 없습니다. JLRK 담당자에게 연락해주세요.' });
    }

    const patch = {
      comment: comment && comment.trim() !== '' ? comment.trim() : null,
      total_repair_cost_before: toNumber(totalRepairCostBefore),
      total_parts_cost: toNumber(totalPartsCost),
      retailer_support_cost: toNumber(retailerSupportCost),
      jlrk_support_cost: toNumber(jlrkSupportCost),
      updated_at: new Date().toISOString(),
    };

    // 인보이스 첨부 — 임시 경로에 올라온 파일을 티켓번호 이름으로 옮긴다
    if (invoicePath) {
      const ext = path.extname(invoiceName || invoicePath) || '';
      const target = `${row.ticket_number}-invoice${ext}`;
      const { error: moveError } = await supabase.storage.from(BUCKET).move(invoicePath, target);
      if (moveError) {
        // 같은 이름이 이미 있으면 덮어쓰기 대신 시각을 붙여 새로 둔다
        const alt = `${row.ticket_number}-invoice-${Date.now()}${ext}`;
        const { error: retryError } = await supabase.storage.from(BUCKET).move(invoicePath, alt);
        patch.invoice_file_path = retryError ? invoicePath : alt;
      } else {
        patch.invoice_file_path = target;
      }
      patch.invoice_file_name = invoiceName || '인보이스';
      patch.invoice_uploaded_at = new Date().toISOString();
      if (row.rcsm_approval === 'Not started') patch.rcsm_approval = 'In progress';
    }

    // 수치가 바뀌었으면 1차 견적서와 다시 대조한다
    const amountsChanged =
      patch.total_repair_cost_before !== row.total_repair_cost_before ||
      patch.total_parts_cost !== row.total_parts_cost ||
      patch.retailer_support_cost !== row.retailer_support_cost ||
      patch.jlrk_support_cost !== row.jlrk_support_cost;

    if (amountsChanged && row.file_path) {
      try {
        const { data: file } = await supabase.storage.from(BUCKET).download(row.file_path);
        if (file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          patch.estimate_check = await checkEstimate(buffer, row.file_name || row.file_path, {
            total_repair_cost_before: patch.total_repair_cost_before,
            total_parts_cost: patch.total_parts_cost,
            retailer_support_cost: patch.retailer_support_cost,
            jlrk_support_cost: patch.jlrk_support_cost,
          });
        }
      } catch (err) {
        console.error('견적서 재대조 실패:', err);
      }
    }

    const { data, error: updateError } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('ticket_number', row.ticket_number)
      .select('*');

    if (updateError) throw updateError;

    return res.status(200).json({ success: true, ticket: publicView(data[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '저장 실패' });
  }
};
