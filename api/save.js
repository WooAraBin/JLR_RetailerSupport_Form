const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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

    // 참고: Total Repair Cost (After), JLRK Parts DC 는 Notion Formula 속성이라
    // API로 값을 쓸 수 없음(자동 계산됨) — 의도적으로 properties 에서 제외.
    // RCSM Request Date 는 Created time(자동) 속성으로 추정되어 마찬가지로 제외.

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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '저장 실패. 다시 시도해주세요.' });
  }
};
