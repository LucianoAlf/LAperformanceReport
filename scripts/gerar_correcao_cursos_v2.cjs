/**
 * Gera SQL de correção de cursos v2 — usando tabela temporária + UPDATE JOIN
 * Mais eficiente e seguro que 911 UPDATEs individuais
 */
const fs = require('fs');

const CSV_CURSO_TO_ID = {
  'Bateria': 27, 'Canto': 6, 'Cavaquinho': 35, 'Contrabaixo': 21,
  'Flauta Transversal': 37, 'Guitarra': 14, 'Musicalização para Bebês': 2,
  'Musicalização Preparatória': 4, 'Piano': 18, 'Produção Musical': 36,
  'Saxofone': 31, 'Teclado': 16, 'Ukulele': 8, 'Violão': 10, 'Violino': 12,
};

const CURSOS_BANCO = {
  2: 'Mus. Bebês T', 4: 'Mus. Infantil T', 6: 'Canto T', 8: 'Ukulelê T',
  10: 'Violão T', 12: 'Violino T', 14: 'Guitarra T', 16: 'Teclado T',
  18: 'Piano T', 21: 'Contrabaixo T', 27: 'Bateria T', 31: 'SAX T',
  35: 'Cavaquinho T', 36: 'Home Studio', 37: 'Flauta Transversa',
};

const UNIDADES = {
  'Campo Grande': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'Recreio': '95553e96-971b-4590-a6eb-0201d013c14d',
  'Barra': '368d47f5-2d88-4475-bc14-ba084a9a348e'
};

const csv = fs.readFileSync('./docs/LA_MUSIC_ALUNOS_CONSOLIDADO.csv', 'utf-8');
const linhas = csv.split('\n').filter(l => l.trim()).slice(1);

let sql = `-- ═══════════════════════════════════════════════════════════════
-- CORREÇÃO DE CURSOS - LA Music
-- Gerado em: ${new Date().toISOString()}
-- Base: CSV original LA_MUSIC_ALUNOS_CONSOLIDADO.csv (${linhas.length} alunos)
-- Estratégia: todos → variante T (Turma)
-- Escopo: apenas alunos importados em 09/01/2026
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- 1. Criar tabela temporária com dados do CSV
CREATE TEMP TABLE csv_correcao (
  nome TEXT NOT NULL,
  unidade_id UUID NOT NULL,
  curso_id_correto INTEGER NOT NULL
);

-- 2. Inserir dados do CSV
INSERT INTO csv_correcao (nome, unidade_id, curso_id_correto) VALUES
`;

const valores = [];
let erros = 0;

linhas.forEach(linha => {
  const c = linha.split(',');
  const nome = c[0].trim().replace(/'/g, "''");
  const curso = c[3].trim();
  const unidade = c[8].trim();
  const unidadeId = UNIDADES[unidade];
  const cursoIdCorreto = CSV_CURSO_TO_ID[curso];
  
  if (!cursoIdCorreto || !unidadeId) { erros++; return; }
  
  valores.push(`('${nome}', '${unidadeId}', ${cursoIdCorreto})`);
});

sql += valores.join(',\n') + ';\n\n';

sql += `-- 3. Verificar ANTES da correção: quantos serão afetados
-- (executar este SELECT antes do UPDATE para conferir)
SELECT 
  csv.curso_id_correto,
  c_correto.nome as curso_correto,
  a.curso_id as curso_atual,
  c_atual.nome as curso_atual_nome,
  COUNT(*) as total
FROM csv_correcao csv
JOIN alunos a ON LOWER(a.nome) = LOWER(csv.nome) 
  AND a.unidade_id = csv.unidade_id
  AND a.created_at::date = '2026-01-09'
  AND a.curso_id != csv.curso_id_correto
JOIN cursos c_correto ON c_correto.id = csv.curso_id_correto
JOIN cursos c_atual ON c_atual.id = a.curso_id
GROUP BY csv.curso_id_correto, c_correto.nome, a.curso_id, c_atual.nome
ORDER BY total DESC;

-- 4. APLICAR CORREÇÃO
UPDATE alunos a
SET curso_id = csv.curso_id_correto,
    updated_at = NOW()
FROM csv_correcao csv
WHERE LOWER(a.nome) = LOWER(csv.nome)
  AND a.unidade_id = csv.unidade_id
  AND a.created_at::date = '2026-01-09'
  AND a.curso_id != csv.curso_id_correto;

-- 5. Verificar DEPOIS: distribuição de cursos
SELECT c.nome as curso, COUNT(*) as total
FROM alunos a JOIN cursos c ON c.id = a.curso_id
WHERE a.status IN ('ativo', 'trancado')
GROUP BY c.nome
ORDER BY total DESC;

-- 6. Limpar
DROP TABLE csv_correcao;

COMMIT;
`;

fs.writeFileSync('./scripts/correcao_cursos_v2.sql', sql);

console.log(`✅ SQL gerado: scripts/correcao_cursos_v2.sql`);
console.log(`📊 Total de alunos no CSV: ${valores.length}`);
if (erros) console.log(`⚠️  ${erros} alunos ignorados (curso/unidade não mapeados)`);

// Resumo do impacto
console.log(`\n📋 RESUMO DO IMPACTO:`);
const impacto = {};
linhas.forEach(l => {
  const c = l.split(',');
  const curso = c[3]?.trim();
  const id = CSV_CURSO_TO_ID[curso];
  if (!id) return;
  if (!impacto[curso]) impacto[curso] = { correto: id, nome: CURSOS_BANCO[id], total: 0 };
  impacto[curso].total++;
});
Object.entries(impacto).sort((a,b) => b[1].total - a[1].total).forEach(([k, v]) => {
  console.log(`  ${k.padEnd(28)} → ${v.nome.padEnd(20)} (id=${v.correto}) | ${v.total} alunos`);
});
