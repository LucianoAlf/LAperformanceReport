import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('ERRO: SUPABASE_SERVICE_ROLE_KEY não definida');
  console.log('Execute: $env:SUPABASE_SERVICE_ROLE_KEY="sua_chave"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapeamento de unidades para UUIDs
const UNIDADE_MAP = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

// Ler CSV
const csvPath = path.join(__dirname, '..', 'docs', 'LA_MUSIC_HISTORICO_LTV.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split('\n').filter(line => line.trim());
const dataLines = lines.slice(1);

console.log('Total de registros no CSV:', dataLines.length);

// Parsear registros
const records = dataLines.map(line => {
  const cols = line.split(',');
  return {
    nome: cols[0]?.trim() || '',
    tempo_permanencia_meses: parseInt(cols[1]) || 0,
    categoria_saida: cols[2]?.trim() || null,
    mes_saida: cols[3]?.trim() || null,
    unidade_id: UNIDADE_MAP[cols[4]?.trim()] || null,
  };
}).filter(r => r.unidade_id && r.nome);

console.log('Registros válidos:', records.length);

// Inserir em batches
const BATCH_SIZE = 100;
let inserted = 0;
let errors = 0;

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  
  const { data, error } = await supabase
    .from('alunos_historico')
    .insert(batch);
  
  if (error) {
    console.error('Erro no batch ' + batchNum + ':', error.message);
    errors++;
  } else {
    inserted += batch.length;
    console.log('Batch ' + batchNum + ' inserido: ' + batch.length + ' registros');
  }
}

console.log('\n=== RESULTADO ===');
console.log('Inseridos:', inserted);
console.log('Erros:', errors);

// Validar contagens
const { data: contagem } = await supabase
  .from('alunos_historico')
  .select('unidade_id, unidades(nome)')
  .then(async () => {
    const { data } = await supabase.rpc('exec_sql', {
      sql: `SELECT u.nome, COUNT(*) as total, ROUND(AVG(ah.tempo_permanencia_meses)::numeric, 1) as ltv
            FROM alunos_historico ah 
            JOIN unidades u ON ah.unidade_id = u.id 
            GROUP BY u.nome`
    });
    return { data };
  });

console.log('\nContagem por unidade:', contagem);
