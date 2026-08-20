const path = require('path');
const { supabase, BUCKET } = require('./_supabase');

// 첨부는 base64 JSON으로 받는다.
// (multipart는 Vercel Node 런타임이 요청 스트림을 먼저 소비해버려 파싱이 불가능했다)
const MAX_BYTES = 4 * 1024 * 1024;

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

  try {
    const { fileName, mimeType, dataBase64 } = req.body || {};

    if (!dataBase64) {
      return res.status(400).json({ error: '파일이 없습니다.' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ error: '파일이 비어 있습니다.' });
    }

    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: '파일이 너무 큽니다. 4MB 이하로 올려주세요.' });
    }

    // 티켓번호는 저장 시점에 정해지므로 일단 임시 경로에 올리고, save에서 옮긴다
    const ext = path.extname(fileName || '') || '';
    const tempPath = `incoming/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(tempPath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false
    });

    if (error) throw error;

    return res.status(200).json({ filePath: tempPath, fileName: fileName || 'attachment' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '파일 업로드 실패' });
  }
};
