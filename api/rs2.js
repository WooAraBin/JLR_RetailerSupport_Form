// 수리비 지원 프로그램(신규, 2026-10-08 보스) — 새 접수 폼 /rs 의 서버.
// 기존 /api/save·lookup·update 와 기존 표(repair_support_requests)는 그대로 두고, 새 표 rs2_requests 에만 쓴다.
// 새 표는 잠겨 있어서(사이트 출입증만) 여기서는 service role 키로 쓴다 — 리테일러는 이 서버를 거쳐서만 읽고 쓴다.
//
// POST { action: 'save' | 'lookup' | 'close' , ... }
//  save   — ① 접수: RO 필수, 같은 차량 같은 날 / 같은 지점+RO 중복 차단, 견적서 판독(못 읽으면 「읽지 못함」)
//  lookup — 티켓번호 + 작성자명으로 본인 건 조회
//  close  — ② 마감 보고: 고객 청구액(일반 합계) · JLRK 지원금(코리아청구) · 리테일러 부담, 인보이스 PDF 선택
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { readDmsPdf } = require('./_rs2pdf');
const { normalizeName } = require('./_identity');
const { WORKSHOP_OPTIONS } = require('./options');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TABLE = 'rs2_requests';
const BUCKET = 'repair-support';
const RO_RE = /^RO\d{10}$/;

function kstDate() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}
function kstDayRangeUtc() {
  const d = kstDate();
  const start = new Date(`${d}T00:00:00+09:00`).toISOString();
  const end = new Date(`${d}T24:00:00+09:00`).toISOString();
  return { start, end };
}
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const normCar = (v) => String(v || '').replace(/\s+/g, '');
const normRo = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

async function newTicket(workshop) {
  const d = kstDate().replace(/-/g, '').slice(2); // YYMMDD
  const prefix = `${d}${workshop.replace(/\s+/g, '')}R`; // R = 수리비 지원(신규) — 기존 A/B 번호와 섞이지 않게
  const { data, error } = await sb.from(TABLE).select('ticket_number').like('ticket_number', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((data ? data.length : 0) + 1).padStart(2, '0')}`;
}

async function moveInto(tempPath, originalName, target) {
  if (!tempPath) return null;
  const ext = path.extname(originalName || tempPath) || '';
  const dest = `rs2/${target}${ext}`;
  const { error } = await sb.storage.from(BUCKET).move(tempPath, dest);
  if (error) {
    console.error('첨부 이동 실패:', error);
    return tempPath;
  }
  return dest;
}

/** 견적서 판독 + 접수 금액 대조. 못 읽으면 status 'unreadable' — 0원과 비교하지 않는다. */
async function checkEstimate(storedPath, fileName, estParts, estLabour) {
  const at = new Date().toISOString();
  if (!/\.pdf$/i.test(fileName || storedPath || '')) {
    return { status: 'unreadable', reason: 'PDF가 아닙니다 — One DMS 출력본(PDF)만 자동 확인됩니다. 담당 RCSM이 확인합니다.', at };
  }
  try {
    const { data: file } = await sb.storage.from(BUCKET).download(storedPath);
    const read = await readDmsPdf(Buffer.from(await file.arrayBuffer()));
    if (!read.totals) {
      return { status: 'unreadable', reason: '견적서 금액을 읽지 못했습니다 — 담당 RCSM이 확인합니다.', ro: read.ro, vin: read.vin, at };
    }
    const docParts = read.totals['부품'];
    const docLabour = read.totals['공임'];
    const lines = [
      { key: 'parts', label: '견적 부품', entered: estParts, doc: docParts },
      { key: 'labour', label: '견적 공임', entered: estLabour, doc: docLabour },
    ].map((l) => {
      let state = Math.abs(l.entered - l.doc) <= 1 ? 'ok' : 'different';
      if (state === 'different' && l.doc > 0 && Math.abs(l.entered - Math.round(l.doc * 1.1)) <= 2) state = 'vat';
      return { ...l, state };
    });
    const issues = lines
      .filter((l) => l.state !== 'ok')
      .map((l) =>
        l.state === 'vat'
          ? `${l.label} ${l.entered.toLocaleString()}원은 견적서 ${l.doc.toLocaleString()}원의 1.1배입니다 — 부가세를 포함해 적으신 것 같습니다(부가세 제외로 적어 주세요)`
          : `${l.label} ${l.entered.toLocaleString()}원이 견적서 ${l.doc.toLocaleString()}원과 다릅니다`,
      );
    return { status: issues.length ? 'needs_fix' : 'ok', totals: read.totals, ro: read.ro, vin: read.vin, lines, issues, at };
  } catch (err) {
    return { status: 'unreadable', reason: '견적서 금액을 읽지 못했습니다 — 담당 RCSM이 확인합니다.', at };
  }
}

function publicRow(r) {
  if (!r) return null;
  const { id, ...rest } = r; // eslint-disable-line no-unused-vars
  return rest;
}

async function findOwn(ticket, author) {
  const { data, error } = await sb.from(TABLE).select('*').eq('ticket_number', String(ticket || '').trim().toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (normalizeName(data.author_name) !== normalizeName(author)) return null;
  return data;
}

async function save(body, res) {
  const workshop = String(body.workshop || '').trim();
  const author = String(body.authorName || '').trim();
  const car = normCar(body.vehicleNumber);
  const ro = normRo(body.roNumber);
  const estParts = num(body.estParts);
  const estLabour = num(body.estLabour);
  const retailer = num(body.retailerSupport);
  const jlrk = num(body.jlrkSupport);

  if (!WORKSHOP_OPTIONS.includes(workshop)) return res.status(400).json({ error: '지점을 선택해 주세요.' });
  if (!author) return res.status(400).json({ error: '작성자명을 입력해 주세요.' });
  if (!car) return res.status(400).json({ error: '차량번호를 입력해 주세요.' });
  if (!ro) return res.status(400).json({ error: 'RO 번호를 입력해 주세요. RO 번호가 없으면 접수되지 않습니다.' });
  if (!RO_RE.test(ro)) return res.status(400).json({ error: 'RO 번호 형식이 맞지 않습니다. 예: RO2609000335 (RO + 숫자 10자리)' });
  if (estParts == null || estLabour == null) return res.status(400).json({ error: '견적서의 부품·공임 금액을 입력해 주세요(공임이 없으면 0).' });
  if (retailer == null || jlrk == null) return res.status(400).json({ error: '리테일러 지원금과 JLRK 지원금을 입력해 주세요.' });
  if (jlrk > retailer) return res.status(400).json({ error: 'JLRK 지원금은 리테일러 지원금보다 클 수 없습니다.' });
  if (!body.approvalPath) return res.status(400).json({ error: '이메일 승인본을 첨부해 주세요.' });
  if (!body.estimatePath) return res.status(400).json({ error: '견적서를 첨부해 주세요.' });

  // 중복 차단 — 같은 지점+RO(취소 제외), 같은 차량번호로 오늘(한국시간) 접수된 건
  const { data: sameRo } = await sb.from(TABLE).select('ticket_number').eq('workshop', workshop).eq('ro_number', ro).neq('status', 'cancelled').limit(1);
  if (sameRo && sameRo.length) {
    return res.status(409).json({ error: `이 지점·RO 번호(${ro})로 이미 접수된 건이 있습니다 (티켓 ${sameRo[0].ticket_number}). 새로 접수하지 말고 「내 티켓 조회」에서 그 건을 수정해 주세요.`, ticket: sameRo[0].ticket_number });
  }
  const { start, end } = kstDayRangeUtc();
  const { data: sameDay } = await sb.from(TABLE).select('ticket_number, vehicle_number').gte('created_at', start).lt('created_at', end).neq('status', 'cancelled');
  const dup = (sameDay || []).find((r) => normCar(r.vehicle_number) === car);
  if (dup) {
    return res.status(409).json({ error: `오늘 이 차량번호로 등록된 건이 있습니다 (티켓 ${dup.ticket_number}). 새로 접수하지 말고 「내 티켓 조회」에서 그 건을 수정해 주세요.`, ticket: dup.ticket_number });
  }

  const ticket = await newTicket(workshop);
  const approvalPath = await moveInto(body.approvalPath, body.approvalName, `${ticket}-approval`);
  const estimatePath = await moveInto(body.estimatePath, body.estimateName, `${ticket}-estimate`);
  const estimateRead = await checkEstimate(estimatePath, body.estimateName, estParts, estLabour);

  const row = {
    ticket_number: ticket,
    workshop,
    author_name: author,
    vehicle_number: String(body.vehicleNumber || '').trim(),
    ro_number: ro,
    planned_start_date: body.plannedStartDate || null,
    comment: body.comment && String(body.comment).trim() ? String(body.comment).trim() : null,
    est_parts: estParts,
    est_labour: estLabour,
    retailer_support: retailer,
    jlrk_support: jlrk,
    approval_file_path: approvalPath,
    approval_file_name: body.approvalName || null,
    estimate_file_path: estimatePath,
    estimate_file_name: body.estimateName || null,
    estimate_read: estimateRead,
  };
  const { error } = await sb.from(TABLE).insert(row);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `이 지점·RO 번호(${ro})로 이미 접수된 건이 있습니다. 「내 티켓 조회」에서 수정해 주세요.` });
    throw error;
  }
  return res.status(200).json({ success: true, ticket, estimateRead });
}

async function lookup(body, res) {
  const row = await findOwn(body.ticket, body.author);
  if (!row) return res.status(404).json({ error: '티켓번호와 작성자명이 맞는 건이 없습니다.' });
  return res.status(200).json({ row: publicRow(row) });
}

async function close(body, res) {
  const row = await findOwn(body.ticket, body.author);
  if (!row) return res.status(404).json({ error: '티켓번호와 작성자명이 맞는 건이 없습니다.' });
  if (['review', 'done', 'paid', 'cancelled'].includes(row.status)) {
    return res.status(409).json({ error: '검토가 시작된 건은 수정할 수 없습니다. 담당 RCSM에게 문의해 주세요.' });
  }
  const customer = num(body.closeCustomer);
  const cj = num(body.closeJlrk);
  const cr = num(body.closeRetailer);
  if (customer == null || cj == null || cr == null) return res.status(400).json({ error: '고객 청구액·JLRK 지원금·리테일러 부담을 모두 입력해 주세요.' });
  if (!body.invoicePath && !row.invoice_file_path) return res.status(400).json({ error: '최종 인보이스 PDF를 첨부해 주세요. 자료 검토용으로 제출이 필요합니다.' });
  const patch = {
    close_customer: customer,
    close_jlrk: cj,
    close_retailer: cr,
    close_reported_at: new Date().toISOString(),
    status: 'closed',
    updated_at: new Date().toISOString(),
  };
  if (body.invoicePath) {
    patch.invoice_file_path = await moveInto(body.invoicePath, body.invoiceName, `${row.ticket_number}-invoice-${Date.now()}`);
    patch.invoice_file_name = body.invoiceName || null;
  }
  // 조회한 뒤 남이 먼저 바꿨으면 덮어쓰지 않는다
  const { data, error } = await sb.from(TABLE).update(patch).eq('id', row.id).eq('updated_at', row.updated_at).select('*');
  if (error) throw error;
  if (!data || !data.length) return res.status(409).json({ error: '방금 다른 곳에서 이 건이 바뀌었습니다. 다시 조회해 주세요.' });
  return res.status(200).json({ row: publicRow(data[0]) });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    if (body.action === 'save') return await save(body, res);
    if (body.action === 'lookup') return await lookup(body, res);
    if (body.action === 'close') return await close(body, res);
    return res.status(400).json({ error: 'unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '처리 실패. 다시 시도해 주세요.' });
  }
};
