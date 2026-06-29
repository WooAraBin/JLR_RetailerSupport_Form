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
    customerVehicleNo,
    plannedStartDate,
    totalRepairCost,
    jlrSupportCost,
    jlrPortion,
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

    if (customerVehicleNo && customerVehicleNo.trim() !== '') {
      properties['Customer Vehicle No'] = {
        rich_text: [{ text: { content: customerVehicleNo.trim() } }]
      };
    }

    if (plannedStartDate) {
      properties['Planned Repair Start Date'] = {
        date: { start: plannedStartDate }
      };
    }

    if (totalRepairCost !== undefined && totalRepairCost !== '' && totalRepairCost !== null) {
      properties['Total Repair Cost'] = { number: Number(totalRepairCost) };
    }

    if (jlrSupportCost !== undefined && jlrSupportCost !== '' && jlrSupportCost !== null) {
      properties['JLR Support Cost'] = { number: Number(jlrSupportCost) };
    }

    if (jlrPortion !== undefined && jlrPortion !== '' && jlrPortion !== null) {
      properties['JLR Portion'] = { number: Number(jlrPortion) };
    }

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
