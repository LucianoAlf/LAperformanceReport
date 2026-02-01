// Script para aplicar a migration do critério de vídeos de renovação
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Aplicando migration: Envio de Vídeos de Renovação...');

  // 1. Inserir novo critério de bônus
  const { data: existing, error: checkError } = await supabase
    .from('professor_360_criterios')
    .select('id')
    .eq('codigo', 'videos_renovacao')
    .single();

  if (existing) {
    console.log('✅ Critério "videos_renovacao" já existe');
  } else {
    const { error: insertError } = await supabase
      .from('professor_360_criterios')
      .insert({
        codigo: 'videos_renovacao',
        nome: 'Envio de Vídeos de Renovação',
        descricao: 'Envio de vídeos para renovação de alunos',
        tipo: 'bonus',
        peso: 0,
        pontos_perda: 5,
        tolerancia: 0,
        regra_detalhada: 'O professor que enviar os vídeos de renovação para os pais dos alunos ganha pontos extras. Se enviar 100% dos vídeos previstos no mês, ganha a pontuação completa. Se enviar 70% ou mais, ganha metade dos pontos.',
        ordem: 8,
        ativo: true
      });

    if (insertError) {
      console.error('❌ Erro ao inserir critério:', insertError);
    } else {
      console.log('✅ Critério "videos_renovacao" criado com sucesso');
    }
  }

  // 2. Atualizar critério de projetos para ter pontos_perda configurável
  const { error: updateError } = await supabase
    .from('professor_360_criterios')
    .update({ pontos_perda: 5 })
    .eq('codigo', 'projetos')
    .or('pontos_perda.is.null,pontos_perda.eq.0');

  if (updateError) {
    console.error('❌ Erro ao atualizar critério projetos:', updateError);
  } else {
    console.log('✅ Critério "projetos" atualizado');
  }

  console.log('🎉 Migration concluída!');
}

applyMigration();
