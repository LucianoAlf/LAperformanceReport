import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeamento de unidades para UUIDs
const UNIDADE_MAP = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e',
};

// Função para corrigir encoding UTF-8 com problemas (mojibake)
function fixEncoding(str) {
  if (!str) return str;
  
  // Mapeamento de caracteres com encoding quebrado para UTF-8 correto
  const replacements = [
    ['Ã¡', 'á'], ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã¤', 'ä'],
    ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
    ['Ã­', 'í'], ['Ã¬', 'ì'], ['Ã®', 'î'], ['Ã¯', 'ï'],
    ['Ã³', 'ó'], ['Ã²', 'ò'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã¶', 'ö'],
    ['Ãº', 'ú'], ['Ã¹', 'ù'], ['Ã»', 'û'], ['Ã¼', 'ü'],
    ['Ã§', 'ç'], ['Ã±', 'ñ'],
    ['Ã‰', 'É'], ['Ãˆ', 'È'], ['ÃŠ', 'Ê'],
    ['ÃŒ', 'Ì'], ['ÃŽ', 'Î'],
    ['Ã'', 'Ñ'],
    ['Ãš', 'Ú'], ['Ã™', 'Ù'], ['Ã›', 'Û'],
    ['Ã‡', 'Ç'],
    ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'],
    ['Ã"', 'Ó'], ['Ã"', 'Ô'], ['Ã•', 'Õ'],
    ['â€™', "'"], ['â€œ', '"'], ['â€', '"'],
    ['Â´', "'"], ['Â', ''],
  ];
  
  let result = str;
  for (const [broken, fixed] of replacements) {
    result = result.split(broken).join(fixed);
  }
  
  return result;
}

// Função para escapar aspas simples no SQL
function escapeSql(str) {
  if (!str) return 'NULL';
  const fixed = fixEncoding(str.trim());
  if (!fixed) return 'NULL';
  return `'${fixed.replace(/'/g, "''")}'`;
}

// Ler e parsear o CSV
const csvPath = path.join(__dirname, '..', 'docs', 'LA_MUSIC_HISTORICO_LTV.csv');
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split('\n').filter(line => line.trim());

// Pular header
const dataLines = lines.slice(1);

console.log(`Total de registros no CSV: ${dataLines.length}`);

// Parsear cada linha
const records = dataLines.map((line, index) => {
  // Tratar campos que podem conter vírgulas dentro de aspas
  const cols = line.split(',');
  
  const nome = cols[0]?.trim();
  const tempo = parseInt(cols[1]?.trim()) || 0;
  const categoria = cols[2]?.trim() || null;
  const mesSaida = cols[3]?.trim() || null;
  const unidade = cols[4]?.trim();
  
  return {
    nome: fixEncoding(nome),
    tempo_permanencia_meses: tempo,
    categoria_saida: categoria,
    mes_saida: mesSaida,
    unidade_id: UNIDADE_MAP[unidade] || null,
    unidade_nome: unidade,
  };
});

// Validar registros
const invalidos = records.filter(r => !r.unidade_id);
if (invalidos.length > 0) {
  console.log(`\n⚠️ Registros com unidade inválida: ${invalidos.length}`);
  invalidos.slice(0, 5).forEach(r => console.log(`  - ${r.nome}: "${r.unidade_nome}"`));
}

// Contar por unidade
const contagem = {};
records.forEach(r => {
  if (r.unidade_nome) {
    contagem[r.unidade_nome] = (contagem[r.unidade_nome] || 0) + 1;
  }
});
console.log('\nContagem por unidade:');
Object.entries(contagem).forEach(([u, c]) => console.log(`  ${u}: ${c}`));

// Gerar SQL em batches de 100
const BATCH_SIZE = 100;
const sqlPath = path.join(__dirname, 'importar_historico_ltv.sql');
let sql = '-- Importação de histórico LTV - Gerado automaticamente\n';
sql += '-- Total de registros: ' + records.length + '\n\n';

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  
  sql += `-- Batch ${batchNum} (registros ${i + 1}-${Math.min(i + BATCH_SIZE, records.length)})\n`;
  sql += 'INSERT INTO alunos_historico (nome, tempo_permanencia_meses, categoria_saida, mes_saida, unidade_id) VALUES\n';
  
  const values = batch.map(r => {
    const nome = escapeSql(r.nome);
    const tempo = r.tempo_permanencia_meses;
    const categoria = r.categoria_saida ? escapeSql(r.categoria_saida) : 'NULL';
    const mes = r.mes_saida ? escapeSql(r.mes_saida) : 'NULL';
    const unidadeId = r.unidade_id ? `'${r.unidade_id}'` : 'NULL';
    
    return `(${nome}, ${tempo}, ${categoria}, ${mes}, ${unidadeId})`;
  });
  
  sql += values.join(',\n') + ';\n\n';
}

fs.writeFileSync(sqlPath, sql, 'utf8');
console.log(`\n✅ SQL gerado em: ${sqlPath}`);
console.log(`   Total de batches: ${Math.ceil(records.length / BATCH_SIZE)}`);
