// Script para verificar dados mensais de matrículas e leads por unidade
import { createClient } from '@supabase/supabase-js';

// SEGURANÇA: Credenciais via variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente não definidas!');
  console.log('Execute:');
  console.log('  set SUPABASE_URL=sua_url_aqui');
  console.log('  set SUPABASE_ANON_KEY=sua_chave_aqui');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verificarDados() {
  console.log('=== VERIFICAÇÃO DE DADOS MENSAIS 2025 ===\n');

  const { data, error } = await supabase
    .from('dados_comerciais')
    .select('*')
    .gte('competencia', '2025-01-01')
    .lte('competencia', '2025-12-31')
    .order('competencia', { ascending: true })
    .order('unidade', { ascending: true });

  if (error) {
    console.error('Erro:', error);
    return;
  }

  // Agrupar por mês e unidade
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const unidades = ['Campo Grande', 'Recreio', 'Barra'];

  console.log('MATRÍCULAS POR MÊS E UNIDADE:');
  console.log('─'.repeat(80));
  
  for (let mesIdx = 0; mesIdx < 12; mesIdx++) {
    const mesStr = `2025-${String(mesIdx + 1).padStart(2, '0')}`;
    const dadosMes = data.filter(d => d.competencia.startsWith(mesStr));
    
    console.log(`\n${meses[mesIdx]} (${mesStr}):`);
    
    let totalMat = 0;
    let totalLeads = 0;
    
    for (const unidade of unidades) {
      const dadosUnidade = dadosMes.filter(d => d.unidade === unidade);
      const mat = dadosUnidade.reduce((sum, d) => sum + (d.novas_matriculas_total || 0), 0);
      const leads = dadosUnidade.reduce((sum, d) => sum + (d.total_leads || 0), 0);
      
      console.log(`  ${unidade.padEnd(15)}: ${mat} matrículas | ${leads} leads`);
      totalMat += mat;
      totalLeads += leads;
    }
    
    console.log(`  ${'TOTAL'.padEnd(15)}: ${totalMat} matrículas | ${totalLeads} leads`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('TOTAIS ANUAIS POR UNIDADE:');
  console.log('─'.repeat(80));
  
  for (const unidade of unidades) {
    const dadosUnidade = data.filter(d => d.unidade === unidade);
    const totalMat = dadosUnidade.reduce((sum, d) => sum + (d.novas_matriculas_total || 0), 0);
    const totalLeads = dadosUnidade.reduce((sum, d) => sum + (d.total_leads || 0), 0);
    
    console.log(`${unidade.padEnd(15)}: ${totalMat} matrículas | ${totalLeads} leads`);
  }
  
  const totalGeralMat = data.reduce((sum, d) => sum + (d.novas_matriculas_total || 0), 0);
  const totalGeralLeads = data.reduce((sum, d) => sum + (d.total_leads || 0), 0);
  console.log(`${'TOTAL GERAL'.padEnd(15)}: ${totalGeralMat} matrículas | ${totalGeralLeads} leads`);
}

verificarDados();
