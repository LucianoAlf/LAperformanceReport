import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('--- vw_kpis_professor_mensal (Mes 3) ---');
  let { data: mensal3, error: e1 } = await supabase
    .from('vw_kpis_professor_mensal')
    .select('professor_nome, ano, mes, experimentais, matriculas, taxa_conversao, renovacoes, evasoes')
    .eq('ano', 2026)
    .eq('mes', 3)
    .limit(5);
  console.log(mensal3, e1);

  console.log('--- vw_kpis_professor_mensal (Mes 4) ---');
  let { data: mensal4, error: e2 } = await supabase
    .from('vw_kpis_professor_mensal')
    .select('professor_nome, ano, mes, experimentais, matriculas, taxa_conversao, renovacoes, evasoes')
    .eq('ano', 2026)
    .eq('mes', 4)
    .limit(5);
  console.log(mensal4, e2);
  
  console.log('--- vw_kpis_professor_historico (Mes 3) ---');
  let { data: hist3, error: e3 } = await supabase
    .from('vw_kpis_professor_historico')
    .select('professor_nome, ano, mes, experimentais, matriculas, taxa_conversao, renovacoes, evasoes')
    .eq('ano', 2026)
    .eq('mes', 3)
    .limit(5);
  console.log(hist3, e3);

  console.log('--- vw_kpis_professor_historico (Mes 4) ---');
  let { data: hist4, error: e4 } = await supabase
    .from('vw_kpis_professor_historico')
    .select('professor_nome, ano, mes, experimentais, matriculas, taxa_conversao, renovacoes, evasoes')
    .eq('ano', 2026)
    .eq('mes', 4)
    .limit(5);
  console.log(hist4, e4);
}

checkData();
