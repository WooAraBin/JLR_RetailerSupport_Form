// 내 티켓 조회 — 티켓번호 + 작성자명이 모두 맞아야 한 건만 돌려준다.
// 목록 조회는 만들지 않는다(다른 리테일러사 건이 보이면 안 된다).

const { supabase, TABLE } = require('./_supabase');
const { identityMatches } = require('./_identity');

// 리테일러 화면에 내보내는 값 — 내부 식별자(id·notion_page_id 등)는 빼고 준다
function publicView(row) {
  return {
    ticket_number: row.ticket_number,
    workshop: row.workshop,
    repair_type: row.repair_type,
    vehicle_number: row.vehicle_number,
    author_name: row.author_name,
    comment: row.comment,
    planned_start_date: row.planned_start_date,
    total_repair_cost_before: row.total_repair_cost_before,
    total_parts_cost: row.total_parts_cost,
    retailer_support_cost: row.retailer_support_cost,
    jlrk_support_cost: row.jlrk_support_cost,
    rcsm_approval: row.rcsm_approval,
    file_name: row.file_name,
    approval_file_name: row.approval_file_name,
    invoice_file_name: row.invoice_file_name,
    estimate_check: row.estimate_check,
    request_date: row.request_date,
  };
}

async function findTicket(ticketNumber, authorName) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ticket_number', String(ticketNumber || '').trim().toUpperCase())
    .limit(1);

  if (error) throw error;
  const row = data && data[0];
  if (!row) return { error: '그 티켓번호를 찾지 못했습니다. 번호를 다시 확인해주세요.' };
  if (!identityMatches(row, authorName)) {
    // 있는 티켓인지 없는 티켓인지 알려주지 않는다(남의 번호를 훑는 것을 막는다)
    return { error: '티켓번호와 작성자명이 맞지 않습니다. 2026-09-23 이전에 접수하신 건은 작성자명 대신 차량번호를 넣어주세요.' };
  }
  return { row };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticketNumber, authorName } = req.body || {};
  if (!ticketNumber) return res.status(400).json({ error: '티켓번호를 입력해주세요.' });
  if (!authorName) return res.status(400).json({ error: '작성자명을 입력해주세요. 2026-09-23 이전 접수 건은 차량번호를 넣어주세요.' });

  try {
    const { row, error } = await findTicket(ticketNumber, authorName);
    if (error) return res.status(404).json({ error });
    return res.status(200).json({ ticket: publicView(row) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '조회 실패' });
  }
};

module.exports.findTicket = findTicket;
module.exports.publicView = publicView;
