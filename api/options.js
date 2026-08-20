// Workshop / Repair Type 선택지. 예전에는 Notion DB 속성에서 읽어왔지만
// 저장처를 Supabase로 옮기면서 목록을 여기서 관리한다 (노션에 있던 값 그대로).
const WORKSHOP_OPTIONS = [
  'AJ HN', 'AJ SS', 'AJ ICND', 'EN', 'JL', 'WB JJ', 'WB GJ',
  'HY', 'HS BC', 'HS US',
  'KCC SC', 'KCC SN', 'KCC BD', 'KCC WJ', 'KCC JJ', 'KCC GD', 'KCC IS',
  'CH SW', 'CH SS', 'CH DC', 'CH CA'
];

const REPAIR_TYPE_OPTIONS = ['Accident Repair', 'Repair Support'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    workshopOptions: WORKSHOP_OPTIONS,
    repairTypeOptions: REPAIR_TYPE_OPTIONS
  });
};

module.exports.WORKSHOP_OPTIONS = WORKSHOP_OPTIONS;
module.exports.REPAIR_TYPE_OPTIONS = REPAIR_TYPE_OPTIONS;
