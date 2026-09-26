import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Professor novo no Emusys chega sozinho no report (26/09/2026).
// A regra de decisao mora no banco; aqui travamos as garantias que um refactor apagaria calado.

const migration = readFileSync(
  new URL('../supabase/migrations/20260926170000_professor_novo_emusys_auto_vinculo.sql', import.meta.url),
  'utf8',
);
const sync = readFileSync(
  new URL('../supabase/functions/sync-professores-emusys/index.ts', import.meta.url),
  'utf8',
);
const hook = readFileSync(new URL('../src/hooks/useProfessoresDivergencias.ts', import.meta.url), 'utf8');
const tela = readFileSync(
  new URL('../src/components/App/Professores/TabDivergenciasProfessores.tsx', import.meta.url),
  'utf8',
);
const modal = readFileSync(new URL('../src/components/App/Professores/ModalProfessor.tsx', import.meta.url), 'utf8');

test('o sync delega a decisao ao banco e nao reimplementa a regra de nome', () => {
  assert.match(sync, /rpc\(\s*'aplicar_vinculo_professor_emusys_v1'/);
  assert.doesNotMatch(sync, /\.from\('professores'\)\s*\.insert/);
  assert.doesNotMatch(sync, /\.from\('professores_unidades'\)\s*\.insert/);
});

test('duvida nunca escreve: vira divergencia para humano', () => {
  assert.match(sync, /registrarDivergencia\([\s\S]*?tipo:\s*'so_no_emusys'/);
  assert.match(migration, /if v_acao not in \('vincular_existente_na_unidade', 'vincular_de_outra_unidade', 'criar'\) then\s+return v_decisao;/);
});

test('criar so quando nao ha nome identico NEM parecido (caso Jonathan "(JOHN)")', () => {
  const ordem = ['homonimos', 'vincular_de_outra_unidade', 'mesmo_nome_professor_inativo', 'nome_parecido', "'acao', 'criar'"]
    .map((marca) => migration.indexOf(marca));
  assert.ok(ordem.every((pos) => pos > 0), 'marcas da decisao presentes');
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, 'criar e o ultimo recurso');
  assert.match(migration, /'\\\(\[\^\)\]\*\\\)'/, 'apelido entre parenteses sai da chave');
});

test('regras de parecido que o backtest real exigiu continuam la', () => {
  // "Lucas Souza dos Santos" x "Lucas Amorim Souza" e "Leo Cabral de Castro" x "Leonardo Castro"
  assert.match(migration, /tokens\[2:cardinality\(tokens\)\] && alvo_tokens\[2:cardinality\(alvo_tokens\)\]/);
  assert.match(migration, /tokens\[1\] like alvo_tokens\[1\] \|\| '%'/);
});

test('vinculo resolvido nao dispara aviso de "professor trocado"', () => {
  assert.match(migration, /set_config\('app\.vinculo_professor_resolvido', 'on', true\)/);
  assert.match(migration, /set_config\('app\.vinculo_professor_resolvido', 'off', true\)/);
  assert.match(migration, /ANCORA_GATILHO_PROFESSOR_AULA/);
});

test('permissoes: portas internas fora do alcance do app e de anon', () => {
  for (const fn of [
    'fn_decidir_vinculo_professor_emusys_v1',
    'fn_efetivar_vinculo_professor_emusys_v1',
    'aplicar_vinculo_professor_emusys_v1',
    'fn_professores_candidatos_por_nome_v1',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
  }
  assert.match(migration, /revoke all on function public\.vincular_professor_emusys_manual_v1\(bigint, integer\) from public, anon;/);
});

test('a tela vincula de verdade (grava o id), nao so fecha a pendencia', () => {
  assert.match(hook, /rpc\('vincular_professor_emusys_manual_v1'/);
  assert.match(tela, /PainelVincular/);
  assert.match(tela, /onVincular\(null\)/, 'opcao de criar professor novo');
});

test('cadastro manual avisa quando ja existe professor parecido', () => {
  assert.match(modal, /buscarProfessoresParecidos/);
  assert.match(modal, /modo !== 'novo'/);
});

test('sync resiste ao 429 do Emusys', () => {
  assert.match(sync, /response\.status === 429/);
  assert.match(sync, /ESPERAS_429_MS/);
});
