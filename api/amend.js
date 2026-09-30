// 변경 접수 (2026-09-30 보스 확정)
//
// 견적 금액이나 지원금이 바뀌면 이메일 승인이 새로 나야 한다. 그래서 금액만 조용히
// 고치는 길을 막고, 이 경로로만 바꾸게 한다.
//   · 변경 사유 필수
//   · 새 이메일 승인본 + 새 견적서 재첨부 필수
//   · 변경 전후 금액을 이력(repair_support_amendments)에 남긴다
//   · 상태는 「접수 완료」로 되돌려 처음부터 다시 확인받는다
// 검토중부터는 변경 접수도 할 수 없다(수정 잠금과 같은 기준).

const path = require('path');
const { supabase, TABLE, BUCKET } = require('./_supabase');
const { findTicket, publicView } = require('./lookup');
const { checkEstimate } = require('./_estimate');

const AMEND_LOCKED = ['In review', 'Done', 'Paid', 'Cancelled'];

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^\d]/g, ''));
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
    reason,
    totalRepairCostBefore,
    totalPartsCost,
    retailerSupportCost,
    jlrkSupportCost,
    approvalPath,
    approvalName,
    estimatePath,
    estimateName,
  } = req.body || {};

  if (!ticketNumber || !authorName) return res.status(400).json({ error: '티켓번호와 작성자명이 필요합니다.' });
  if (!reason || !reason.trim()) return res.status(400).json({ error: '변경 사유를 입력해주세요.' });
  if (!approvalPath) return res.status(400).json({ error: '변경된 금액의 이메일 승인본을 첨부해주세요.' });
  if (!estimatePath) return res.status(400).json({ error: '변경된 견적서를 첨부해주세요.' });

  const jlrk = toNumber(jlrkSupportCost) ?? 0;
  const retailer = toNumber(retailerSupportCost) ?? 0;
  if (jlrk > retailer) {
    return res.status(400).json({ error: '보완 필요: JLRK 지원금은 리테일러 지원금보다 클 수 없습니다.' });
  }

  try {
    const { row, error } = await findTicket(ticketNumber, authorName);
    if (error) return res.status(404).json({ error });

    if (AMEND_LOCKED.includes(row.rcsm_approval)) {
      return res.status(403).json({ error: '검토가 시작된 뒤에는 변경 접수를 할 수 없습니다. 담당 RCSM에게 문의해주세요.' });
    }

    async function moveInto(tempPath, originalName, suffix) {
      const ext = path.extname(originalName || tempPath) || '';
      const target = `${row.ticket_number}${suffix}-v${(row.change_count || 0) + 1}${ext}`;
      const { error: moveError } = await supabase.storage.from(BUCKET).move(tempPath, target);
      return moveError ? tempPath : target;
    }

    const patch = {
      total_repair_cost_before: toNumber(totalRepairCostBefore),
      total_parts_cost: toNumber(totalPartsCost),
      retailer_support_cost: retailer,
      jlrk_support_cost: jlrk,
      approval_file_path: await moveInto(approvalPath, approvalName, '-approval'),
      approval_file_name: approvalName || '이메일 승인본',
      approval_uploaded_at: new Date().toISOString(),
      file_path: await moveInto(estimatePath, estimateName, '-estimate'),
      file_name: estimateName || '견적서',
      change_count: (row.change_count || 0) + 1,
      rcsm_approval: 'Not started', // 처음부터 다시 확인받는다
      invoice_check: null,          // 금액이 바뀌었으니 인보이스 판정도 무효
      updated_at: new Date().toISOString(),
    };

    // 새 견적서로 금액을 다시 대조한다
    try {
      const { data: file } = await supabase.storage.from(BUCKET).download(patch.file_path);
      if (file) {
        patch.estimate_check = await checkEstimate(Buffer.from(await file.arrayBuffer()), patch.file_name, {
          total_repair_cost_before: patch.total_repair_cost_before,
          total_parts_cost: patch.total_parts_cost,
          retailer_support_cost: patch.retailer_support_cost,
          jlrk_support_cost: patch.jlrk_support_cost,
        });
      }
    } catch (err) {
      console.error('변경 접수 견적서 대조 실패:', err);
    }

    const fields = ['total_repair_cost_before', 'total_parts_cost', 'retailer_support_cost', 'jlrk_support_cost'];
    const before = {};
    const after = {};
    for (const f of fields) {
      before[f] = row[f];
      after[f] = patch[f];
    }

    const { error: logError } = await supabase.from('repair_support_amendments').insert({
      ticket_number: row.ticket_number,
      reason: reason.trim(),
      before_values: before,
      after_values: after,
    });
    if (logError) throw logError;

    const { data, error: upError } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('ticket_number', row.ticket_number)
      .select('*');
    if (upError) throw upError;

    return res.status(200).json({ success: true, ticket: publicView(data[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '변경 접수에 실패했습니다' });
  }
};
