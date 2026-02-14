/**
 * Gera SQL de correção de cursos baseado no CSV original
 * Estratégia: todo mundo é T (Turma), CSV é a fonte da verdade
 * 
 * IMPORTANTE: Este script gera o SQL mas NÃO executa.
 * O SQL deve ser revisado antes de aplicar.
 */
const fs = require('fs');

// Mapeamento: nome do curso no CSV → ID correto no banco (variante T)
const CSV_CURSO_TO_ID = {
  'Bateria': 27,              // Bateria T
  'Canto': 6,                 // Canto T
  'Cavaquinho': 35,           // Cavaquinho T (só existe T)
  'Contrabaixo': 21,          // Contrabaixo T
  'Flauta Transversal': 37,   // Flauta Transversa (único)
  'Guitarra': 14,             // Guitarra T
  'Musicalização para Bebês': 2,  // Musicalização para Bebês T
  'Musicalização Preparatória': 4, // Musicalização Infantil T (nome diferente no banco)
  'Piano': 18,                // Piano T
  'Produção Musical': 36,     // Home Studio (nome diferente no banco)
  'Saxofone': 31,             // SAX T (só existe T)
  'Teclado': 16,              // Teclado T
  'Ukulele': 8,               // Ukulelê T
  'Violão': 10,               // Violão T
  'Violino': 12,              // Violino T
};

// IDs que o script de importação usou (ERRADOS)
const SCRIPT_IDS_ERRADOS = {
  'BATERIA': 1, 'CANTO': 2, 'CAVAQUINHO': 3, 'CONTRABAIXO': 4, 
  'FLAUTA TRANSVERSAL': 5, 'GUITARRA': 6, 'MUSICALIZAÇÃO PARA BEBÊS': 7, 
  'MUSICALIZAÇÃO PREPARATÓRIA': 8, 'PIANO': 9, 'PRODUÇÃO MUSICAL': 10, 
  'SAXOFONE': 11, 'TECLADO': 12, 'TEORIA MUSICAL': 13, 'UKULELE': 14, 
  'VIOLÃO': 15, 'VIOLINO': 16
};

// Nomes reais no banco para cada ID
const CURSOS_BANCO = {
  1: 'Musicalização para Bebês IND', 2: 'Musicalização para Bebês T',
  3: 'Musicalização Infantil IND', 4: 'Musicalização Infantil T',
  5: 'Canto IND', 6: 'Canto T', 7: 'Ukulelê IND', 8: 'Ukulelê T',
  9: 'Violão IND', 10: 'Violão T', 11: 'Violino IND', 12: 'Violino T',
  13: 'Guitarra IND', 14: 'Guitarra T', 15: 'Teclado IND', 16: 'Teclado T',
  17: 'Piano IND', 18: 'Piano T', 19: 'Flauta Doce IND', 20: 'Flauta Doce T',
  21: 'Contrabaixo T', 22: 'Contrabaixo IND', 23: 'Percussion Kids',
  24: 'Singer Kids', 25: 'Power Kids', 26: 'Bateria IND', 27: 'Bateria T',
  31: 'SAX T', 33: 'Minha Banda Para Sempre T', 34: 'Teoria Musical IND',
  35: 'Cavaquinho T', 36: 'Home Studio', 37: 'Flauta Transversa',
};

const UNIDADES = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e'
};

// Ler CSV
const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

console.log(`\n📊 GERADOR DE CORREÇÃO DE CURSOS`);
console.log(`${'='.repeat(60)}`);
console.log(`Alunos no CSV: ${linhas.length}`);
console.log(`Estratégia: todo mundo → variante T (Turma)\n`);

// Construir lista de alunos do CSV com curso correto
const alunosCSV = [];
linhas.forEach((linha, i) => {
  const c = linha.split(',');
  const nome = c[0].trim();
  const curso = c[3].trim();
  const professor = c[4].trim();
  const unidade = c[8].trim();
  const unidadeId = UNIDADES[unidade];
  const cursoIdCorreto = CSV_CURSO_TO_ID[curso];
  const cursoIdErrado = SCRIPT_IDS_ERRADOS[curso.toUpperCase()];
  
  if (!cursoIdCorreto) {
    console.log(`⚠️  Curso não mapeado: "${curso}" (aluno: ${nome})`);
    return;
  }
  if (!unidadeId) {
    console.log(`⚠️  Unidade não mapeada: "${unidade}" (aluno: ${nome})`);
    return;
  }
  
  alunosCSV.push({
    nome,
    curso,
    professor,
    unidade,
    unidadeId,
    cursoIdCorreto,
    cursoIdErrado,
    cursoErradoNome: CURSOS_BANCO[cursoIdErrado] || '?',
    cursoCorretoNome: CURSOS_BANCO[cursoIdCorreto] || '?',
  });
});

// Agrupar por curso para entender o impacto
const porCurso = {};
alunosCSV.forEach(a => {
  if (!porCurso[a.curso]) porCurso[a.curso] = { total: 0, idErrado: a.cursoIdErrado, idCorreto: a.cursoIdCorreto, erradoNome: a.cursoErradoNome, corretoNome: a.cursoCorretoNome };
  porCurso[a.curso].total++;
});

console.log(`📋 MAPEAMENTO DE CORREÇÃO POR CURSO:`);
console.log(`${'─'.repeat(80)}`);
console.log(`${'Curso CSV'.padEnd(25)} ${'Qtd'.padEnd(5)} ${'ID Errado → Aparece como'.padEnd(35)} ${'ID Correto → Deveria ser'}`);
console.log(`${'─'.repeat(80)}`);

Object.entries(porCurso).sort((a, b) => b[1].total - a[1].total).forEach(([curso, info]) => {
  console.log(
    `${curso.padEnd(25)} ${String(info.total).padEnd(5)} ` +
    `${info.idErrado} → ${info.erradoNome.padEnd(30)} ` +
    `${info.idCorreto} → ${info.corretoNome}`
  );
});

// Gerar SQL de correção
// Estratégia: UPDATE por nome + unidade_id para alunos da importação (created_at = 09/01/2026)
let sql = `-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO DE CURSOS - LA Music
-- Gerado em: ${new Date().toISOString()}
-- Base: CSV original LA_MUSIC_ALUNOS_CONSOLIDADO.csv
-- Estratégia: todos os alunos → variante T (Turma)
-- Escopo: apenas alunos importados em 09/01/2026
-- ═══════════════════════════════════════════════════════════════

-- IMPORTANTE: Executar dentro de uma transação!
BEGIN;

`;

// Abordagem mais segura: UPDATE em batch por curso
// Para cada curso do CSV, atualizar todos os alunos que:
// 1. Foram importados em 09/01/2026 (created_at::date = '2026-01-09')
// 2. Têm o curso_id errado que o script atribuiu
// 3. Match por nome + unidade

// Mas há um complicador: a correção anterior já mudou curso_id=37 → 6 (Flauta → Canto T)
// E alguns alunos já foram corrigidos manualmente para IDs > 16
// Então não posso simplesmente trocar por ID errado — preciso fazer match por nome

// Gerar UPDATE individual por aluno (mais seguro)
let totalCorrecoes = 0;
let sqlUpdates = [];

alunosCSV.forEach(a => {
  const nomeEscaped = a.nome.replace(/'/g, "''");
  sqlUpdates.push(
    `  -- ${a.nome} | CSV: ${a.curso} | Correto: ${a.cursoCorretoNome} (${a.cursoIdCorreto})
  UPDATE alunos SET curso_id = ${a.cursoIdCorreto}
  WHERE nome = '${nomeEscaped}' 
    AND unidade_id = '${a.unidadeId}'
    AND created_at::date = '2026-01-09'
    AND curso_id != ${a.cursoIdCorreto};`
  );
  totalCorrecoes++;
});

sql += sqlUpdates.join('\n\n');

sql += `

-- ═══════════════════════════════════════════════════════════════
-- RESUMO: ${totalCorrecoes} alunos verificados
-- Apenas alunos com curso_id diferente do correto serão atualizados
-- A cláusula "AND curso_id != X" evita updates desnecessários
-- ═══════════════════════════════════════════════════════════════

COMMIT;
`;

// Salvar SQL
fs.writeFileSync('./scripts/correcao_cursos.sql', sql);
console.log(`\n✅ SQL gerado: scripts/correcao_cursos.sql`);
console.log(`📊 Total de UPDATEs: ${totalCorrecoes}`);
console.log(`\n⚠️  REVISAR ANTES DE EXECUTAR!`);
console.log(`   - O SQL usa transação (BEGIN/COMMIT)`);
console.log(`   - Cada UPDATE filtra por nome + unidade + data de importação`);
console.log(`   - Só atualiza se curso_id atual for diferente do correto`);

// Gerar também um CSV de diagnóstico para revisão humana
let csvDiag = 'nome,unidade,curso_csv,curso_id_correto,curso_correto_nome,curso_id_errado_script,curso_errado_nome\n';
alunosCSV.forEach(a => {
  csvDiag += `"${a.nome}",${a.unidade},${a.curso},${a.cursoIdCorreto},${a.cursoCorretoNome},${a.cursoIdErrado},${a.cursoErradoNome}\n`;
});
fs.writeFileSync('./docs/diagnostico_cursos_correcao.csv', csvDiag);
console.log(`\n📄 CSV de diagnóstico: docs/diagnostico_cursos_correcao.csv`);
