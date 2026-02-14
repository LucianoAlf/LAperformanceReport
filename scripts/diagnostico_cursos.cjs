/**
 * Diagnóstico de cursos: compara CSV original com banco de dados
 * Gera relatório de inconsistências e SQL de correção
 */
const fs = require('fs');

// Mapeamento errado do script de importação (o que FOI usado)
const SCRIPT_CURSOS = {
  'BATERIA': 1, 'CANTO': 2, 'CAVAQUINHO': 3, 'CONTRABAIXO': 4, 'FLAUTA TRANSVERSAL': 5,
  'GUITARRA': 6, 'MUSICALIZAÇÃO PARA BEBÊS': 7, 'MUSICALIZAÇÃO PREPARATÓRIA': 8,
  'PIANO': 9, 'PRODUÇÃO MUSICAL': 10, 'SAXOFONE': 11, 'TECLADO': 12, 'TEORIA MUSICAL': 13,
  'UKULELE': 14, 'VIOLÃO': 15, 'VIOLINO': 16
};

// IDs reais no banco de dados
const CURSOS_BANCO = {
  1: 'Musicalização para Bebês IND',
  2: 'Musicalização para Bebês T',
  3: 'Musicalização Infantil IND',
  4: 'Musicalização Infantil T',
  5: 'Canto IND',
  6: 'Canto T',
  7: 'Ukulelê IND',
  8: 'Ukulelê T',
  9: 'Violão IND',
  10: 'Violão T',
  11: 'Violino IND',
  12: 'Violino T',
  13: 'Guitarra IND',
  14: 'Guitarra T',
  15: 'Teclado IND',
  16: 'Teclado T',
  17: 'Piano IND',
  18: 'Piano T',
  19: 'Flauta Doce IND',
  20: 'Flauta Doce T',
  21: 'Contrabaixo T',
  22: 'Contrabaixo IND',
  23: 'Percussion Kids',
  24: 'Singer Kids',
  25: 'Power Kids',
  26: 'Bateria IND',
  27: 'Bateria T',
  28: 'Aula Inaugural',
  29: 'Circuito de Férias 1',
  30: 'Circuito de Férias 2',
  31: 'SAX T',
  32: 'Harmonia T',
  33: 'Minha Banda Para Sempre T',
  34: 'Teoria Musical IND',
  35: 'Cavaquinho T',
  36: 'Home Studio',
  37: 'Flauta Transversa',
  38: 'GarageBand',
};

// Mapeamento INVERTIDO: dado o ID que o script usou, qual era o curso REAL no CSV
const SCRIPT_ID_TO_CSV_CURSO = {};
Object.entries(SCRIPT_CURSOS).forEach(([nome, id]) => {
  SCRIPT_ID_TO_CSV_CURSO[id] = nome;
});

// Ler CSV
const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

console.log(`\n📊 DIAGNÓSTICO DE CURSOS - LA Music`);
console.log(`${'='.repeat(60)}`);
console.log(`Total de alunos no CSV: ${linhas.length}`);

// Construir mapa: nome_normalizado -> curso do CSV
const alunosCSV = {};
linhas.forEach(linha => {
  const c = linha.split(',');
  const nome = c[0].trim();
  const curso = c[3].trim();
  const professor = c[4].trim();
  const unidade = c[8].trim();
  const key = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  alunosCSV[key] = { nome, curso, professor, unidade };
});

// Mostrar o mapeamento errado
console.log(`\n🔴 MAPEAMENTO ERRADO DO SCRIPT DE IMPORTAÇÃO:`);
console.log(`${'─'.repeat(60)}`);
console.log(`${'Curso no CSV'.padEnd(30)} ${'ID Script'.padEnd(12)} ${'Curso Real no Banco (ID)'}`);
console.log(`${'─'.repeat(60)}`);

Object.entries(SCRIPT_CURSOS).forEach(([csvNome, scriptId]) => {
  const cursoReal = CURSOS_BANCO[scriptId];
  const errado = csvNome.toLowerCase() !== cursoReal.toLowerCase().replace(/ (IND|T)$/, '');
  console.log(`${csvNome.padEnd(30)} ${String(scriptId).padEnd(12)} ${cursoReal} ${errado ? '❌ ERRADO' : '✅'}`);
});

// Análise: para cada curso do CSV, qual ID DEVERIA ter sido usado?
console.log(`\n\n📋 MAPEAMENTO CORRETO (CSV → ID correto no banco):`);
console.log(`${'─'.repeat(60)}`);
console.log(`Nota: cursos no CSV não especificam IND/T`);
console.log(`Precisamos determinar IND vs T por outra via\n`);

const CURSO_CSV_TO_POSSIVEIS_IDS = {
  'Bateria': { IND: 26, T: 27 },
  'Canto': { IND: 5, T: 6 },
  'Cavaquinho': { T: 35 },
  'Contrabaixo': { IND: 22, T: 21 },
  'Flauta Transversal': { unico: 37 },
  'Guitarra': { IND: 13, T: 14 },
  'Musicalização para Bebês': { IND: 1, T: 2 },
  'Musicalização Preparatória': { IND: 3, T: 4 },  // Mus. Infantil no banco
  'Piano': { IND: 17, T: 18 },
  'Produção Musical': { unico: 36 },  // Home Studio
  'Saxofone': { T: 31 },
  'Teclado': { IND: 15, T: 16 },
  'Ukulele': { IND: 7, T: 8 },
  'Violão': { IND: 9, T: 10 },
  'Violino': { IND: 11, T: 12 },
};

Object.entries(CURSO_CSV_TO_POSSIVEIS_IDS).forEach(([csv, ids]) => {
  const opcoes = Object.entries(ids).map(([tipo, id]) => `${CURSOS_BANCO[id]} (${id})`).join(' | ');
  console.log(`  ${csv.padEnd(30)} → ${opcoes}`);
});

// Contagem por curso no CSV
console.log(`\n\n📊 DISTRIBUIÇÃO NO CSV ORIGINAL:`);
console.log(`${'─'.repeat(40)}`);
const contagem = {};
linhas.forEach(l => {
  const curso = l.split(',')[3]?.trim();
  if (curso) contagem[curso] = (contagem[curso] || 0) + 1;
});
Object.entries(contagem).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(30)} ${v}`);
});

console.log(`\n\n⚠️  PROBLEMA CENTRAL:`);
console.log(`${'─'.repeat(60)}`);
console.log(`O CSV não distingue IND vs T.`);
console.log(`Opções para resolver:`);
console.log(`  1. Usar o tipo_matricula_id do banco (1=Regular=IND? ou T?)`);
console.log(`  2. Usar o professor como guia (se leciona só IND ou só T)`);
console.log(`  3. Gerar relatório para correção manual`);
console.log(`  4. Assumir T como padrão (maioria dos alunos é turma)`);
console.log(`\nRecomendação: Gerar CSV com nome do aluno + curso do CSV`);
console.log(`para o Arthur/equipe validar e corrigir via sistema.`);
