const { Client } = require('@notionhq/client');
const Busboy = require('busboy');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// multipart/form-data 요청에서 파일 1개를 추출
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({ headers: req.headers });
    } catch (err) {
      return reject(err);
    }

    let chunks = [];
    let filename = '';
    let mimeType = '';
    let fileFound = false;

    bb.on('file', (_name, file, info) => {
      fileFound = true;
      filename = info.filename;
      mimeType = info.mimeType;

      file.on('data', (chunk) => chunks.push(chunk));
      file.on('limit', () => reject(new Error('파일이 너무 큽니다.')));
    });

    bb.on('finish', () => {
      if (!fileFound) {
        return resolve({ buffer: null, filename: null, mimeType: null });
      }
      resolve({ buffer: Buffer.concat(chunks), filename, mimeType });
    });

    bb.on('error', reject);

    req.pipe(bb);
  });
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

  try {
    const { buffer, filename, mimeType } = await parseMultipart(req);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: '파일이 없습니다.' });
    }

    // 1) Notion에 파일 업로드 객체 생성 (단일 파트, 20MB 이하)
    const created = await notion.fileUploads.create({});

    // 2) 실제 파일 바이트 전송
    await notion.fileUploads.send({
      file_upload_id: created.id,
      file: {
        filename: filename || 'attachment',
        data: new Blob([buffer], { type: mimeType || 'application/octet-stream' })
      }
    });

    return res.status(200).json({ fileUploadId: created.id, fileName: filename });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || '파일 업로드 실패' });
  }
};

// multipart/form-data 요청을 직접 파싱해야 하므로 Vercel의 기본 body parser를 비활성화
module.exports.config = {
  api: {
    bodyParser: false
  }
};
