const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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

  try {
    const db = await notion.databases.retrieve({
      database_id: process.env.NOTION_DATABASE_ID
    });

    const workshopOptions = db.properties['Workshop Select']?.select?.options?.map(o => o.name) ?? [];
    const repairTypeOptions = db.properties['Repair Type']?.select?.options?.map(o => o.name) ?? [];

    return res.status(200).json({ workshopOptions, repairTypeOptions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '옵션 로딩 실패' });
  }
};
