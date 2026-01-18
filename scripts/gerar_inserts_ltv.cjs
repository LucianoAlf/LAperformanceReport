const fs = require('fs');
const path = require('path');

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
    nome: (cols[0] || '').trim(),
    tempo_permanencia_meses: parseInt(cols[1]) || 0,
    categoria_saida: (cols[2] || '').trim() || null,
    mes_saida: (cols[3] || '').trim() || null,
    unidade_id: UNIDADE_MAP[(cols[4] || '').trim()] || null,
  };
}).filter(r => r.unidade_id && r.nome);

console.log('Registros validos:', records.length);

// Contar por unidade
const contagem = {};
records.forEach(r => {
  const unidade = Object.keys(UNIDADE_MAP).find(k => UNIDADE_MAP[k] === r.unidade_id);
  contagem[unidade] = (contagem[unidade] || 0) + 1;
});
console.log('Contagem por unidade:', contagem);

// Gerar JSON para importacao
const outputPath = path.join(__dirname, 'historico_ltv_data.json');
fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf8');
console.log('JSON gerado em:', outputPath);
