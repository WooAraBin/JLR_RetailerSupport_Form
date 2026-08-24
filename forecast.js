/* Parts Wholesale 예상마감치 입력 — CCSO Management(P&A Business)의 Month Forecast에 바로 반영된다.
   저장소는 관리자 앱과 같은 Supabase 테이블(parts_forecast_manual)이고, 여기서는 REST로 직접 쓴다.
   forecast1 = 리테일러사 제출 수치, extra1/extra2 = 재고 / NCE·DMS. */

const RCSM_SUPABASE_URL = 'https://kqodcsnwkdohblnlgwtl.supabase.co';
const RCSM_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxb2Rjc253a2RvaGJsbmxnd3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODM2NzUsImV4cCI6MjEwMDM1OTY3NX0.woZUyX7PFfQCxrNmzLqm1oVB8YmBRfaQOPnLJRyRuU0';

const fcEls = {
  wrap: document.getElementById('forecastWrap'),
  month: document.getElementById('forecastMonth'),
  workshop: document.getElementById('fcWorkshop'),
  parts: document.getElementById('fcParts'),
  warranty: document.getElementById('fcWarranty'),
  stock: document.getElementById('fcStock'),
  nce: document.getElementById('fcNce'),
  dms: document.getElementById('fcDms'),
  saveBtn: document.getElementById('fcSaveBtn'),
  status: document.getElementById('fcStatus'),
};

let FC_MONTH = null;

function fcStatus(msg, type = '') {
  fcEls.status.textContent = msg;
  fcEls.status.className = 'status ' + type;
}

// 금액칸은 치는 대로 천단위 콤마를 붙여준다 (0 하나 더 치는 실수 방지)
[fcEls.parts, fcEls.warranty, fcEls.stock, fcEls.nce, fcEls.dms].forEach((el) => {
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/[^\d]/g, '');
    el.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });
});

function fcNumber(el) {
  const digits = (el.value || '').replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

/** 관리자 앱이 올려둔 최신 리포트의 기준 월을 가져온다 */
async function fcLoadMonth() {
  try {
    const res = await fetch(
      `${RCSM_SUPABASE_URL}/rest/v1/parts_wholesale_snapshots?select=report_month,uploaded_at&order=uploaded_at.desc&limit=1`,
      { headers: { apikey: RCSM_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + RCSM_SUPABASE_ANON_KEY } }
    );
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length && rows[0].report_month) {
      FC_MONTH = rows[0].report_month;
      fcEls.month.textContent = `기준 월 · ${FC_MONTH} — 이번달 마감 시점에 예상되는 금액을 넣어주세요.`;
      return;
    }
    fcEls.month.textContent = '아직 이번달 리포트가 올라오지 않았습니다. JLRK 담당자에게 문의해주세요.';
  } catch (e) {
    fcEls.month.textContent = '기준 월을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
  }
}

async function fcSubmit() {
  if (!FC_MONTH) {
    fcStatus('기준 월을 불러오지 못해 제출할 수 없습니다.', 'error');
    return;
  }
  const workshop = fcEls.workshop.value;
  if (!workshop) {
    fcStatus('Workshop을 선택해주세요.', 'error');
    return;
  }

  const now = new Date().toISOString();
  const rows = [
    {
      report_month: FC_MONTH,
      category: 'PARTS',
      workshop,
      forecast1: fcNumber(fcEls.parts),
      extra1: fcNumber(fcEls.stock),
      submitted_by: workshop,
      submitted_at: now,
      updated_at: now,
    },
    {
      report_month: FC_MONTH,
      category: 'WAR',
      workshop,
      forecast1: fcNumber(fcEls.warranty),
      extra1: fcNumber(fcEls.nce),
      extra2: fcNumber(fcEls.dms),
      submitted_by: workshop,
      submitted_at: now,
      updated_at: now,
    },
  ];

  fcEls.saveBtn.disabled = true;
  fcStatus('제출 중...');
  try {
    const res = await fetch(
      `${RCSM_SUPABASE_URL}/rest/v1/parts_forecast_manual?on_conflict=report_month,category,workshop`,
      {
        method: 'POST',
        headers: {
          apikey: RCSM_SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + RCSM_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    [fcEls.parts, fcEls.warranty, fcEls.stock, fcEls.nce, fcEls.dms].forEach((el) => (el.value = ''));
    fcStatus(`✅ ${workshop} · ${FC_MONTH} 제출 완료되었습니다.`, 'success');
  } catch (e) {
    fcStatus('❌ 제출 실패: ' + (e.message || e), 'error');
  } finally {
    fcEls.saveBtn.disabled = false;
  }
}

if (fcEls.saveBtn) fcEls.saveBtn.addEventListener('click', fcSubmit);

fcLoadMonth();
