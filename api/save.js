const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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

// 같은 날짜 + 같은 워크샵 + 같은 수리유형 조합으로 순번을 매겨 티켓번호 생성
// 예: 260629KCCSCA01
async function generateTicketNumber(workshop, repairType) {
  const datePart = getKstDateCode();
  const workshopCode = workshop.replace(/\s+/g, ''); // Workshop Select 값에서 공백만 제거해 그대로 코드로 사용
  const typeCode = REPAIR_TYPE_CODE[repairType] || 'X';
  const prefix = `${datePart}${workshopCode}${typeCode}`;

  const existing = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
    filter: {
      property: 'Ticket number',
      rich_text: { starts_with: prefix }
    },
    page_size: 100
  });

  const seq = existing.results.length + 1;
  return `${prefix}${String(seq).padStart(2, '0')}`;
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
    comment,
    plannedStartDate,
    totalRepairCostBefore,
    totalPartsCost,
    retailerSupportCost,
    jlrkSupportCost,
    fileUploadId,
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

  try {
    const ticketNumber = await generateTicketNumber(workshop, repairType);

    const properties = {
      // Vehicle Number = 이 데이터베이스의 Title 속성
      'Vehicle Number': {
        title: [{ text: { content: vehicleNumber.trim() } }]
      },
      'Workshop Select': {
        select: { name: workshop }
      },
      'Repair Type': {
        select: { name: repairType }
      },
      'Ticket number': {
        rich_text: [{ text: { content: ticketNumber } }]
      }
    };

    if (comment && comment.trim() !== '') {
      properties['Comment'] = {
        rich_text: [{ text: { content: comment.trim() } }]
      };
    }

    if (plannedStartDate) {
      properties['Planned Repair Start Date'] = {
        date: { start: plannedStartDate }
      };
    }

    if (totalRepairCostBefore !== undefined && totalRepairCostBefore !== '' && totalRepairCostBefore !== null) {
      properties['Total Repair Cost (Before)'] = { number: Number(totalRepairCostBefore) };
    }

    if (totalPartsCost !== undefined && totalPartsCost !== '' && totalPartsCost !== null) {
      properties['Total Parts Cost'] = { number: Number(totalPartsCost) };
    }

    if (retailerSupportCost !== undefined && retailerSupportCost !== '' && retailerSupportCost !== null) {
      properties['Retailer Support Cost'] = { number: Number(retailerSupportCost) };
    }

    if (jlrkSupportCost !== undefined && jlrkSupportCost !== '' && jlrkSupportCost !== null) {
      properties['JLRK Support Cost'] = { number: Number(jlrkSupportCost) };
    }

    // Total Repair Cost (After), JLRK Parts DC 는 Notion Formula 속성 → 자동 계산, API로 쓰지 않음
    // RCSM Request Date 는 Created time(자동) 속성으로 추정 → API로 쓰지 않음

    if (fileUploadId) {
      properties['Files & media'] = {
        files: [
          {
            type: 'file_upload',
            file_upload: { id: fileUploadId },
            name: fileName || 'attachment'
          }
        ]
      };
    }

    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties
    });

    return res.status(200).json({ success: true, ticketNumber });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '저장 실패. 다시 시도해주세요.' });
  }
};
