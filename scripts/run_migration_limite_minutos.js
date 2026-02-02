// Script para executar a migração de limite_minutos_atraso
// Execute com: node scripts/run_migration_limite_minutos.cjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Executando migração: adicionar limite_minutos_atraso...');
  
  try {
    // Verificar se a coluna já existe
    const { data: columns, error: checkError } = await supabase
      .from('professor_360_criterios')
      .select('*')
      .limit(1);
    
    if (checkError) {
      console.error('❌ Erro ao verificar tabela:', checkError);
      return;
    }
    
    // Tentar adicionar a coluna via RPC ou update
    // Como não temos acesso direto ao DDL, vamos verificar se o campo existe
    const firstRow = columns?.[0];
    
    if (firstRow && 'limite_minutos_atraso' in firstRow) {
      console.log('✅ Coluna limite_minutos_atraso já existe!');
    } else {
      console.log('⚠️ Coluna limite_minutos_atraso não existe ainda.');
      console.log('📝 Execute o seguinte SQL no Supabase Dashboard:');
      console.log(`
ALTER TABLE professor_360_criterios 
ADD COLUMN IF NOT EXISTS limite_minutos_atraso INTEGER DEFAULT 10;

UPDATE professor_360_criterios 
SET limite_minutos_atraso = 10 
WHERE codigo = 'atrasos';
      `);
    }
    
    // Atualizar o critério de pontualidade para garantir que tem o valor
    const { error: updateError } = await supabase
      .from('professor_360_criterios')
      .update({ limite_minutos_atraso: 10 })
      .eq('codigo', 'atrasos');
    
    if (updateError) {
      if (updateError.message.includes('column') || updateError.code === '42703') {
        console.log('⚠️ Coluna não existe. Execute o SQL acima no Supabase Dashboard.');
      } else {
        console.error('❌ Erro ao atualizar:', updateError);
      }
    } else {
      console.log('✅ Critério de pontualidade atualizado com limite_minutos_atraso = 10');
    }
    
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

runMigration();
