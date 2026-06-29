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

  const { content, category, programCoding, dueBy, specificDate, alarm } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  if (!category) {
    return res.status(400).json({ error: 'Category를 선택해주세요.' });
  }

  if (!dueBy) {
    return res.status(400).json({ error: 'Due by를 선택해주세요.' });
  }

  if (dueBy === 'Specific Date' && !specificDate) {
    return res.status(400).json({ error: '날짜를 입력해주세요.' });
  }

  try {
    const properties = {
      Contents: {
        title: [{ text: { content: content.trim() } }]
      },
      Category: {
        select: { name: category }
      },
      Status: {
        status: { name: 'Ready!' }
      },
      'Due by': {
        select: { name: dueBy }
      }
    };

    if (category === 'Program - Coding' && programCoding) {
      properties['Program - Coding'] = {
        select: { name: programCoding }
      };
    }

    if (dueBy === 'Specific Date') {
      properties['Specific Date'] = {
        date: { start: specificDate }
      };

      if (alarm === 'Y' || alarm === 'N') {
        properties['Alarm'] = {
          multi_select: [{ name: alarm }]
        };
      }
    }

    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '저장 실패. 다시 시도해주세요.' });
  }
};
