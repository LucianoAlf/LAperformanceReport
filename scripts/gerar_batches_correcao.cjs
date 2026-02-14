const fs = require('fs');

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

const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

const regs = [];
linhas.forEach(l => {
  const c = l.split(',');
  const nome = c[0].trim().replace(/'/g, "''");
  const curso = c[3].trim();
  const unidade = c[8].trim();
  const uid = UNIDADES[unidade];
  const cid = CSV_CURSO_TO_ID[curso];
  if (!cid || !uid) return;
  regs.push(`('${nome}', '${uid}', ${cid})`);
});

const batchSize = 150;
for (let i = 0; i < regs.length; i += batchSize) {
  const batch = regs.slice(i, i + batchSize);
  const n = Math.floor(i / batchSize) + 1;
  const filename = `./scripts/batches/correcao_batch_${String(n).padStart(2, '0')}.sql`;
  fs.writeFileSync(filename, `INSERT INTO csv_correcao (nome, unidade_id, curso_id_correto) VALUES\n${batch.join(',\n')};`);
}

console.log(`Batches: ${Math.ceil(regs.length / batchSize)} | Total: ${regs.length}`);
