// 자동 확인 다시 돌리기 (2026-09-29)
//
// JLRK(관리자 화면)에서 금액을 고치면 저장은 관리자 쪽에서 바로 하고, 이 엔드포인트로
// 「다시 확인」만 요청한다. 저장된 견적서·인보이스 파일을 다시 읽어 판정만 갱신한다.
// 입력값을 바꾸지 않으므로 이 호출만으로는 금액이 달라지지 않는다.

const { supabase, TABLE, BUCKET } = require('./_supabase');
const { checkEstimate } = require('./_estimate');
const { checkInvoice } = require('./_invoice');

async function download(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).download(path);
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticketNumber } = req.body || {};
  if (!ticketNumber) return res.status(400).json({ error: '티켓번호가 필요합니다.' });

  try {
    const { data, error } = await supabase.from(TABLE).select('*').eq('ticket_number', ticketNumber).limit(1);
    if (error) throw error;
    const row = data && data[0];
    if (!row) return res.status(404).json({ error: '그 티켓번호를 찾지 못했습니다.' });

    const amounts = {
      total_repair_cost_before: row.total_repair_cost_before,
      total_parts_cost: row.total_parts_cost,
      retailer_support_cost: row.retailer_support_cost,
      jlrk_support_cost: row.jlrk_support_cost,
    };

    const patch = { updated_at: new Date().toISOString() };

    const estBuf = await download(row.file_path);
    if (estBuf) patch.estimate_check = await checkEstimate(estBuf, row.file_name || row.file_path, amounts);

    const invBuf = await download(row.invoice_file_path);
    if (invBuf) patch.invoice_check = await checkInvoice(invBuf, row.invoice_file_name || row.invoice_file_path, amounts);

    // 보완 필요가 하나도 없고 첨부 3종이 다 있으면 검토중으로, 아니면 단계를 내린다.
    // 사람이 누른 검토 완료·지급 완료·취소는 건드리지 않는다.
    if (!['Done', 'Paid', 'Cancelled'].includes(row.rcsm_approval)) {
      const bad = (c) => !c || c.status === 'needs_fix' || c.status === 'unreadable';
      const hasAll = row.approval_file_path && row.file_path && row.invoice_file_path;
      const clean = hasAll && !bad(patch.estimate_check ?? row.estimate_check) && !bad(patch.invoice_check ?? row.invoice_check);
      if (clean) patch.rcsm_approval = 'In review';
      else if (row.invoice_file_path) patch.rcsm_approval = 'In progress';
      else patch.rcsm_approval = 'Not started';
    }

    const { data: updated, error: upError } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('ticket_number', ticketNumber)
      .select('ticket_number, rcsm_approval, estimate_check, invoice_check');
    if (upError) throw upError;

    return res.status(200).json({ success: true, ticket: updated[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '다시 확인하지 못했습니다' });
  }
};
