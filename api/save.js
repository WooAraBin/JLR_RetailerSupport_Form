const path = require('path');
const { supabase, TABLE, BUCKET } = require('./_supabase');
const { checkEstimate } = require('./_estimate');

// Repair Type → 티켓번호 코드 매핑
// (※ Repair Type 옵션이 늘어나면 여기에 코드만 추가하면 됨)
const REPAIR_TYPE_CODE = {
  'Accident Repair': 'A',
  'Repair Support': 'B'
};

// 한국시간(KST) 기준 YYMMDD
function getKstDateCode() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = (type) => parts.find(p => p.type === type).value;
  return `${get('year')}${get('month')}${get('day')}`;
}

// 회계연도(4월 시작) 기준 분기 — 노션 Quarter 속성과 같은 기준
function getKstQuarter() {
  const month = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date())
  );
  if (month >= 4 && month <= 6) return '1Q';
  if (month >= 7 && month <= 9) return '2Q';
  if (month >= 10 && month <= 12) return '3Q';
  return '4Q';
}

// 같은 날짜 + 같은 워크샵 + 같은 수리유형 조합으로 순번을 매겨 티켓번호 생성
// 예: 260629KCCSCA01
async function generateTicketNumber(workshop, repairType) {
  const datePart = getKstDateCode();
  const workshopCode = workshop.replace(/\s+/g, ''); // Workshop 값에서 공백만 제거해 그대로 코드로 사용
  const typeCode = REPAIR_TYPE_CODE[repairType] || 'X';
  const prefix = `${datePart}${workshopCode}${typeCode}`;

  const { data, error } = await supabase
    .from(TABLE)
    .select('ticket_number')
    .like('ticket_number', `${prefix}%`);

  if (error) throw error;

  const seq = (data ? data.length : 0) + 1;
  return `${prefix}${String(seq).padStart(2, '0')}`;
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    workshop,
    repairType,
    vehicleNumber,
    authorName,
    comment,
    plannedStartDate,
    totalRepairCostBefore,
    totalPartsCost,
    retailerSupportCost,
    jlrkSupportCost,
    filePath,
    fileName
  } = req.body;

  if (!workshop) {
    return res.status(400).json({ error: 'Workshop을 선택해주세요.' });
  }

  if (!repairType) {
    return res.status(400).json({ error: 'Repair Type을 선택해주세요.' });
  }

  if (!vehicleNumber || vehicleNumber.trim() === '') {
    return res.status(400).json({ error: 'Vehicle Number를 입력해주세요.' });
  }

  // 수리 지원은 작성자명과 1차 견적서가 있어야 접수된다
  // (작성자명은 나중에 본인 티켓을 여는 열쇠로도 쓰인다)
  const isRepairSupport = repairType === 'Repair Support';
  if (isRepairSupport && (!authorName || authorName.trim() === '')) {
    return res.status(400).json({ error: '작성자명을 입력해주세요.' });
  }
  if (isRepairSupport && !filePath) {
    return res.status(400).json({ error: '1차 견적서를 첨부해주세요.' });
  }

  try {
    const ticketNumber = await generateTicketNumber(workshop, repairType);

    // 임시 경로에 올려둔 첨부를 티켓번호 이름으로 옮긴다
    let storedPath = null;
    if (filePath) {
      const ext = path.extname(fileName || filePath) || '';
      const target = `${ticketNumber}${ext}`;
      const { error: moveError } = await supabase.storage.from(BUCKET).move(filePath, target);
      storedPath = moveError ? filePath : target; // 옮기기 실패해도 원래 경로로 연결은 유지
      if (moveError) console.error('첨부 이동 실패:', moveError);
    }

    const payload = {
      ticket_number: ticketNumber,
      workshop,
      repair_type: repairType,
      vehicle_number: vehicleNumber.trim(),
      author_name: authorName && authorName.trim() !== '' ? authorName.trim() : null,
      comment: comment && comment.trim() !== '' ? comment.trim() : null,
      planned_start_date: plannedStartDate || null,
      total_repair_cost_before: toNumber(totalRepairCostBefore),
      total_parts_cost: toNumber(totalPartsCost),
      retailer_support_cost: toNumber(retailerSupportCost),
      jlrk_support_cost: toNumber(jlrkSupportCost),
      rcsm_approval: 'Not started',
      quarter: getKstQuarter(),
      file_name: fileName || null,
      file_path: storedPath
    };

    // Total Repair Cost (After) = Before − Retailer − JLRK,
    // JLRK Parts Support = JLRK ÷ Total Parts Cost 는 화면에서 계산한다(노션 수식과 동일).

    // 1차 견적서 수치 자동 대조 — 승인 전 1차 확인용. 실패해도 접수는 막지 않는다.
    let estimateCheck = null;
    if (storedPath) {
      try {
        const { data: file } = await supabase.storage.from(BUCKET).download(storedPath);
        if (file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          estimateCheck = await checkEstimate(buffer, fileName || storedPath, {
            total_repair_cost_before: payload.total_repair_cost_before,
            total_parts_cost: payload.total_parts_cost,
            retailer_support_cost: payload.retailer_support_cost,
            jlrk_support_cost: payload.jlrk_support_cost,
          });
          payload.estimate_check = estimateCheck;
        }
      } catch (err) {
        console.error('견적서 대조 실패:', err);
      }
    }

    const { error } = await supabase.from(TABLE).insert(payload);
    if (error) throw error;

    return res.status(200).json({ success: true, ticketNumber, estimateCheck });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '저장 실패. 다시 시도해주세요.' });
  }
};
