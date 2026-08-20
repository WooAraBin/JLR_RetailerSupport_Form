// 저장처가 Notion에서 Supabase(CCSO Management와 같은 프로젝트)로 바뀌었다.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const TABLE = 'repair_support_requests';
const BUCKET = 'repair-support';

module.exports = { supabase, TABLE, BUCKET };
