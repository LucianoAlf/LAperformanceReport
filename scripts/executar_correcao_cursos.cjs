/**
 * Executa a correção de cursos via Supabase REST API
 * Lê o CSV, insere na tabela csv_correcao, e executa o UPDATE
 */
const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Defina SUPABASE_SERVICE_ROLE_KEY no ambiente');
  process.exit(1);
}

const CSV_CURSO_TO_ID = {
  'Bateria': 27, 'Canto': 6, 'Cavaquinho': 35, 'Contrabaixo': 21,
  'Flauta Transversal': 37, 'Guitarra': 14, 'Musicalização para Bebês': 2,
  'Musicalização Preparatória': 4, 'Piano': 18, 'Produção Musical': 36,
  'Saxofone': 31, 'Teclado': 16, 'Ukulele': 8, 'Violão': 10, 'Violino': 12,
};

const UNIDADES = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e'
};

async function executeSql(query) {
  return new Promise((resolve, reject) => {
    const url = new URL('/rest/v1/rpc/execute_sql', SUPABASE_URL);
    // Usar a API de SQL diretamente não funciona via REST, vou usar pg
    reject(new Error('Precisa usar pg diretamente'));
  });
}

// Abordagem: gerar SQL em batches e salvar para execução manual
const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

const registros = [];
linhas.forEach(linha => {
  const c = linha.split(',');
  const nome = c[0].trim().replace(/'/g, "''");
  const curso = c[3].trim();
  const unidade = c[8].trim();
  const unidadeId = UNIDADES[unidade];
  const cursoIdCorreto = CSV_CURSO_TO_ID[curso];
  if (!cursoIdCorreto || !unidadeId) return;
  registros.push(`('${nome}', '${unidadeId}', ${cursoIdCorreto})`);
});

// Gerar batches de 100 registros
const batchSize = 100;
const batches = [];
for (let i = 0; i < registros.length; i += batchSize) {
  const batch = registros.slice(i, i + batchSize);
  batches.push(
    `INSERT INTO csv_correcao (nome, unidade_id, curso_id_correto) VALUES\n${batch.join(',\n')};`
  );
}

// Salvar cada batch como arquivo separado
batches.forEach((sql, i) => {
  fs.writeFileSync(`./scripts/batches/correcao_batch_${String(i+1).padStart(2,'0')}.sql`, sql);
});

console.log(`✅ ${batches.length} batches gerados em scripts/batches/`);
console.log(`📊 Total de registros: ${registros.length}`);
