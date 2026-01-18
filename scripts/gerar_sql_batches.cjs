const fs = require('fs');
const path = require('path');

// Mapeamento de unidades para UUIDs
const UNIDADE_MAP = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

// Escapar string para SQL
function escapeSql(str) {
  if (!str) return 'NULL';
  return "'" + str.replace(/'/g, "''") + "'";
}

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
    nome: (cols[0] || '').trim(),
    tempo: parseInt(cols[1]) || 0,
    categoria: (cols[2] || '').trim() || null,
    mes: (cols[3] || '').trim() || null,
    unidade_id: UNIDADE_MAP[(cols[4] || '').trim()] || null,
  };
}).filter(r => r.unidade_id && r.nome);

console.log('Registros validos:', records.length);

// Gerar arquivos SQL separados por batch de 50
const BATCH_SIZE = 50;
const outputDir = path.join(__dirname, 'batches');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  
  let sql = 'INSERT INTO alunos_historico (nome, tempo_permanencia_meses, categoria_saida, mes_saida, unidade_id) VALUES\n';
  
  const values = batch.map(r => {
    const nome = escapeSql(r.nome);
    const categoria = r.categoria ? escapeSql(r.categoria) : 'NULL';
    const mes = r.mes ? escapeSql(r.mes) : 'NULL';
    return `(${nome}, ${r.tempo}, ${categoria}, ${mes}, '${r.unidade_id}')`;
  });
  
  sql += values.join(',\n') + ';';
  
  const filePath = path.join(outputDir, `batch_${String(batchNum).padStart(2, '0')}.sql`);
  fs.writeFileSync(filePath, sql, 'utf8');
}

console.log('Batches gerados em:', outputDir);
console.log('Total de batches:', Math.ceil(records.length / BATCH_SIZE));
