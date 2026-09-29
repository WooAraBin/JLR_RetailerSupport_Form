// 티켓 수정 — 수치 고치기 + 최종 마감 인보이스 첨부.
//
// · 지급 완료(Paid)는 서버에서 막는다. 화면만 잠그면 요청을 직접 보내 고칠 수 있다.
// · 인보이스가 처음 붙으면 상태를 '인보이스 마감'(In progress)으로 올린다.
//   이미 검토 완료·지급 완료로 올라간 건은 되돌리지 않는다.
// · 수치가 바뀌면 견적서와 다시 대조해 결과를 갱신한다.

const path = require('path');
const { supabase, TABLE, BUCKET } = require('./_supabase');
const { findTicket, publicView } = require('./lookup');
const { checkEstimate } = require('./_estimate');
const { checkInvoice } = require('./_invoice');

function toNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    ticketNumber,
    authorName,
    comment,
    totalRepairCostBefore,
    totalPartsCost,
    retailerSupportCost,
    jlrkSupportCost,
    invoicePath,
    invoiceName,
    approvalPath,
    approvalName,
    estimatePath,
    estimateName,
    cancel,
  } = req.body || {};

  if (!ticketNumber || !authorName) {
    return res.status(400).json({ error: '티켓번호와 작성자명이 필요합니다.' });
  }

  try {
    const { row, error } = await findTicket(ticketNumber, authorName);
    if (error) return res.status(404).json({ error });

    if (row.rcsm_approval === 'Paid') {
      return res.status(403).json({ error: '지급이 끝난 건이라 수정할 수 없습니다. JLRK 담당자에게 연락해주세요.' });
    }

    // 취소 — 규칙에 어긋나 다시 접수해야 할 때 리테일러가 직접 누른다(JLRK도 관리자 화면에서 가능)
    if (cancel) {
      const { data: cancelled, error: cancelError } = await supabase
        .from(TABLE)
        .update({ rcsm_approval: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('ticket_number', row.ticket_number)
        .select('*');
      if (cancelError) throw cancelError;
      return res.status(200).json({ success: true, ticket: publicView(cancelled[0]) });
    }

    if (row.rcsm_approval === 'Cancelled') {
      return res.status(403).json({ error: '취소된 건입니다. 새로 접수해주세요.' });
    }

    if (Number(jlrkSupportCost || 0) > Number(retailerSupportCost || 0)) {
      return res.status(400).json({ error: '보완 필요: JLRK 지원금은 리테일러 지원금보다 클 수 없습니다.' });
    }

    const patch = {
      comment: comment && comment.trim() !== '' ? comment.trim() : null,
      total_repair_cost_before: toNumber(totalRepairCostBefore),
      total_parts_cost: toNumber(totalPartsCost),
      retailer_support_cost: toNumber(retailerSupportCost),
      jlrk_support_cost: toNumber(jlrkSupportCost),
      updated_at: new Date().toISOString(),
    };

    // 첨부 교체 — 임시 경로에 올라온 파일을 티켓번호 이름으로 옮긴다(칸마다 이름이 다르다)
    async function moveInto(tempPath, originalName, suffix) {
      const ext = path.extname(originalName || tempPath) || '';
      const target = `${row.ticket_number}${suffix}${ext}`;
      const { error: moveError } = await supabase.storage.from(BUCKET).move(tempPath, target);
      if (!moveError) return target;
      // 같은 이름이 이미 있으면 덮어쓰기 대신 시각을 붙여 새로 둔다
      const alt = `${row.ticket_number}${suffix}-${Date.now()}${ext}`;
      const { error: retryError } = await supabase.storage.from(BUCKET).move(tempPath, alt);
      return retryError ? tempPath : alt;
    }

    if (approvalPath) {
      patch.approval_file_path = await moveInto(approvalPath, approvalName, '-approval');
      patch.approval_file_name = approvalName || '이메일 승인본';
      patch.approval_uploaded_at = new Date().toISOString();
    }

    if (estimatePath) {
      patch.file_path = await moveInto(estimatePath, estimateName, '-estimate');
      patch.file_name = estimateName || '견적서';
    }

    if (invoicePath) {
      patch.invoice_file_path = await moveInto(invoicePath, invoiceName, '-invoice');
      patch.invoice_file_name = invoiceName || '인보이스';
      patch.invoice_uploaded_at = new Date().toISOString();
      if (row.rcsm_approval === 'Not started') patch.rcsm_approval = 'In progress';

      // 올라온 인보이스를 바로 읽어 접수 금액과 맞춰본다(부가세 제외 기준)
      try {
        const { data: file } = await supabase.storage.from(BUCKET).download(patch.invoice_file_path);
        if (file) {
          patch.invoice_check = await checkInvoice(Buffer.from(await file.arrayBuffer()), patch.invoice_file_name, {
            total_repair_cost_before: patch.total_repair_cost_before,
            total_parts_cost: patch.total_parts_cost,
            retailer_support_cost: patch.retailer_support_cost,
            jlrk_support_cost: patch.jlrk_support_cost,
          });
        }
      } catch (err) {
        console.error('인보이스 판독 실패:', err);
      }
    }

    // 세 칸(이메일 승인본·견적서·인보이스)이 다 차면 「검토중」으로 올린다.
    // 이미 검토 완료·지급 완료로 넘어간 건은 되돌리지 않는다.
    const willHave = (slot, patched) => patched !== undefined ? patched : row[slot];
    const hasAll =
      willHave('approval_file_path', patch.approval_file_path) &&
      willHave('file_path', patch.file_path) &&
      willHave('invoice_file_path', patch.invoice_file_path);
    // 인보이스가 규칙에 어긋나면(보완 필요) 검토중으로 올리지 않는다 — 고쳐서 다시 올려야 한다
    const invoiceCheck = patch.invoice_check || row.invoice_check;
    const invoiceBlocks = invoiceCheck && invoiceCheck.status === 'needs_fix';
    if (hasAll && !invoiceBlocks && ['Not started', 'In progress'].includes(patch.rcsm_approval || row.rcsm_approval)) {
      patch.rcsm_approval = 'In review';
    }

    // 수치가 바뀌었으면 견적서와 다시 대조한다
    const amountsChanged =
      patch.total_repair_cost_before !== row.total_repair_cost_before ||
      patch.total_parts_cost !== row.total_parts_cost ||
      patch.retailer_support_cost !== row.retailer_support_cost ||
      patch.jlrk_support_cost !== row.jlrk_support_cost;

    const estimateForCheck = patch.file_path || row.file_path;
    if ((amountsChanged || estimatePath) && estimateForCheck) {
      try {
        const { data: file } = await supabase.storage.from(BUCKET).download(estimateForCheck);
        if (file) {
          const buffer = Buffer.from(await file.arrayBuffer());
          patch.estimate_check = await checkEstimate(buffer, patch.file_name || row.file_name || estimateForCheck, {
            total_repair_cost_before: patch.total_repair_cost_before,
            total_parts_cost: patch.total_parts_cost,
            retailer_support_cost: patch.retailer_support_cost,
            jlrk_support_cost: patch.jlrk_support_cost,
          });
        }
      } catch (err) {
        console.error('견적서 재대조 실패:', err);
      }
    }

    const { data, error: updateError } = await supabase
      .from(TABLE)
      .update(patch)
      .eq('ticket_number', row.ticket_number)
      .select('*');

    if (updateError) throw updateError;

    return res.status(200).json({ success: true, ticket: publicView(data[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || '저장 실패' });
  }
};
