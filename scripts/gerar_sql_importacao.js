/**
 * Gera SQL de importação de alunos
 */
import fs from 'fs';

const PROFESSORES = {
  'ALEXANDRE DE SÁ': 43, 'ANTONIO MARCOS': 1, 'CAIO TENÓRIO': 2, 'DAIANA PACÍFICO': 3,
  'ELLIABH HENRIQUE': 4, 'FELIPE GEVEZIER': 5, 'GABRIEL ANTONY': 6, 'GABRIEL BARBOSA': 7,
  'GABRIEL LEÃO': 8, 'GUILHERME OVÍDIO': 9, 'ISAQUE MENDES': 10, 'ISRAEL ROCHA': 11,
  'JEYSON GAIA': 12, 'JOEL DE SALLES': 13, 'JORDAN BARBOSA': 14, 'JULIANA BALTAZAR': 44,
  'KAIO FELIPE': 15, 'LARISSA BHEATTRIZ': 16, 'LÉO CASTRO': 19, 'LETICIA FERNANDES': 17,
  'LETICIA PALMEIRA': 18, 'LOHANA LEOPOLDO': 20, 'LUCAS GUIMARÃES': 21, 'LUCAS LISBOA': 22,
  'MARCOS SATURNINO': 23, 'MARIANA CARNEIRO': 24, 'MATHEUS FELIPE': 25, 'MATHEUS LANA': 26,
  'MATHEUS SANTOS': 27, 'MATHEUS STERQUE': 28, 'MIQUEIAS DE OLIVEIRA': 29, 'PEDRO SÉRGIO': 30,
  'PETERSON BIANCAMANO': 31, 'RAFAEL AKEEM': 32, 'RAMON PINA': 33, 'RENAM AMORIM': 34,
  'RODRIGO PINHEIRO': 35, 'VALDO DELFINO': 36, 'VICENTE PINHEIRO': 37, 'VINICIUS PINHEIRO': 38,
  'WELLERSON DE LIMA': 39, 'WILLER ARRUDA': 40, 'WILLIAN DE ANDRADE': 41, 'WILLIAN RIBEIRO': 42
};

const CURSOS = {
  'BATERIA': 1, 'CANTO': 2, 'CAVAQUINHO': 3, 'CONTRABAIXO': 4, 'FLAUTA TRANSVERSAL': 5,
  'GUITARRA': 6, 'MUSICALIZAÇÃO PARA BEBÊS': 7, 'MUSICALIZAÇÃO PREPARATÓRIA': 8,
  'PIANO': 9, 'PRODUÇÃO MUSICAL': 10, 'SAXOFONE': 11, 'TECLADO': 12, 'TEORIA MUSICAL': 13,
  'UKULELE': 14, 'VIOLÃO': 15, 'VIOLINO': 16
};

const UNIDADES = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e'
};

function converterData(d) {
  if (!d || !d.trim()) return 'NULL';
  const p = d.split('/');
  if (p.length !== 3) return 'NULL';
  return `'${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}'`;
}

function escape(s) {
  return s ? s.replace(/'/g, "''") : '';
}

const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

let valores = [];
let erros = [];

linhas.forEach((linha, i) => {
  const c = linha.split(',');
  if (c.length < 12) {
    erros.push(`Linha ${i+2}: campos insuficientes`);
    return;
  }
  
  const nome = escape(c[0].trim());
  const dataNasc = converterData(c[1]);
  const dataMatr = converterData(c[2]);
  const cursoId = CURSOS[c[3].toUpperCase().trim()];
  const profId = PROFESSORES[c[4].toUpperCase().trim()];
  const valor = parseFloat(c[5]) || 0;
  const tipoMatrId = 1;
  const status = c[7].toLowerCase().trim();
  const unidadeId = UNIDADES[c[8].trim()];
  const diaAula = c[9] ? `'${c[9]}'` : 'NULL';
  const horario = c[10] ? `'${c[10]}:00'` : 'NULL';
  const presenca = c[11] && c[11].trim() ? parseInt(c[11]) : 'NULL';
  
  if (!cursoId) { erros.push(`Linha ${i+2}: curso não encontrado: ${c[3]}`); return; }
  if (!profId) { erros.push(`Linha ${i+2}: professor não encontrado: ${c[4]}`); return; }
  if (!unidadeId) { erros.push(`Linha ${i+2}: unidade não encontrada: ${c[8]}`); return; }
  
  valores.push(
    `('${nome}', ${dataNasc}, ${dataMatr}, ${cursoId}, ${profId}, ${valor}, ${tipoMatrId}, '${status}', '${unidadeId}', ${diaAula}, ${horario}, ${presenca})`
  );
});

// Gerar SQL em batches de 100
const batchSize = 100;
let sql = '-- Importação de Alunos LA Music\n-- Gerado em: ' + new Date().toISOString() + '\n\n';

for (let i = 0; i < valores.length; i += batchSize) {
  const batch = valores.slice(i, i + batchSize);
  sql += `-- Batch ${Math.floor(i/batchSize) + 1}\n`;
  sql += 'INSERT INTO alunos (nome, data_nascimento, data_matricula, curso_id, professor_atual_id, valor_parcela, tipo_matricula_id, status, unidade_id, dia_aula, horario_aula, percentual_presenca) VALUES\n';
  sql += batch.join(',\n') + ';\n\n';
}

fs.writeFileSync('./scripts/importar_alunos.sql', sql);

console.log('✅ SQL gerado com sucesso!');
console.log(`📊 Total de registros: ${valores.length}`);
console.log(`📦 Batches: ${Math.ceil(valores.length/batchSize)}`);
if (erros.length > 0) {
  console.log(`⚠️ Erros: ${erros.length}`);
  erros.forEach(e => console.log(`  - ${e}`));
}
