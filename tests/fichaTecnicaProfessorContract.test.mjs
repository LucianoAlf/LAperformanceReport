import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = path.join(root, 'supabase', 'functions', 'ficha-tecnica', 'index.ts');
const logicPath = path.join(root, 'supabase', 'functions', 'ficha-tecnica', 'logic.mjs');
const migrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260815120000_ficha_tecnica_submit_transacional.sql',
);
const modalPath = path.join(root, 'src', 'components', 'App', 'Time', 'ModalAdicionarPessoa.tsx');

const edgeSource = fs.readFileSync(edgePath, 'utf8');

test('a função possui o módulo de contrato puro', () => {
  assert.equal(fs.existsSync(logicPath), true);
});

test('o banco PROFESSOR contém os 13 cenários fixos e os 2 desempates', () => {
  const fixedTitles = [
    'O aluno novo',
    'O aluno que não praticou',
    'A aula que saiu do plano',
    'Feedback de execução',
    'O aluno travado',
    'Aula em grupo',
    'O responsável quer saber',
    'O aluno que desafia',
    'A preparação da aula',
    'A apresentação',
    'O erro na hora',
    'O final de semestre',
    'O colega pediu ajuda',
  ];
  const tieTitles = ['A aula ideal', 'O que te frustra'];

  assert.match(edgeSource, /PROFESSOR\s*:/);
  for (const title of [...fixedTitles, ...tieTitles]) assert.match(edgeSource, new RegExp(title));
  assert.match(edgeSource, /BLOCO_A\[cargo\]/);
  assert.match(edgeSource, /DESEMPATE_A\[cargo\]/);
});

test('o submit valida cargo, payload dinâmico e usa ordens B/D próprias', () => {
  assert.match(edgeSource, /cargo sem banco/i);
  assert.match(edgeSource, /validarEscolhas/);
  assert.match(edgeSource, /fixos\.length\s*\+\s*desempates\.length/);
  assert.match(edgeSource, /ORDEM_B/);
  assert.match(edgeSource, /ORDEM_D/);
});

test('a conclusão é delegada à RPC transacional e não a inserts soltos', () => {
  assert.match(edgeSource, /ficha_concluir_tecnica/);
  assert.doesNotMatch(edgeSource, /\.from\(['"]professor_perfil_testes['"]\)\s*\n?\s*\.insert/);
  assert.doesNotMatch(edgeSource, /\.from\(['"]professor_perfil_respostas['"]\)\s*\n?\s*\.insert/);
});

test('a migração fecha duplicidade por ficha_token_id e trava o token', () => {
  assert.equal(fs.existsSync(migrationPath), true);
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /ficha_token_id/);
  assert.match(migration, /unique.*ficha_token_id|ficha_token_id.*unique/is);
  assert.match(migration, /for update/i);
  assert.match(migration, /grant execute.*service_role/is);
});

test('a garantia de JWT da ficha permanece explícita no repositório', () => {
  const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
  assert.match(config, /\[functions\.ficha-tecnica\][\s\S]*?verify_jwt\s*=\s*false/);
});

test('a UI mantém Professores bloqueado até o teste real', () => {
  const modalSource = fs.readFileSync(modalPath, 'utf8');
  assert.match(modalSource, /Professores/);
  assert.match(modalSource, /em breve/);
  assert.match(modalSource, /disabled/);
});

if (fs.existsSync(logicPath)) {
  const logic = await import('../supabase/functions/ficha-tecnica/logic.mjs');

  test('validação aceita contagens de A definidas pelo cargo', () => {
    const result = logic.validarEscolhas({
      fixosCount: 2,
      desempatesCount: 1,
      blocoBCount: 2,
      blocoDCount: 2,
      escolhasA: ['1.0', '2.3', '3.1'],
      escolhasB: ['1.a', '2.b'],
      escolhasD: ['1.b', '2.a'],
    });
    assert.equal(result.escolhasA.length, 3);

    const semDesempate = logic.validarEscolhas({
      fixosCount: 2,
      desempatesCount: 0,
      blocoBCount: 2,
      blocoDCount: 2,
      escolhasA: ['1.0', '2.3'],
      escolhasB: ['1.a', '2.b'],
      escolhasD: ['1.b', '2.a'],
    });
    assert.equal(semDesempate.escolhasA.length, 2);
  });

  test('cargo sem cenários é rejeitado antes do submit', () => {
    assert.throws(
      () => logic.validarCargo('CARGO_NOVO', [], []),
      /cargo sem banco/i,
    );
  });

  test('validação rejeita pergunta repetida ou opção fora do intervalo', () => {
    assert.throws(
      () => logic.validarEscolhas({
        fixosCount: 2,
        desempatesCount: 1,
        blocoBCount: 2,
        blocoDCount: 2,
        escolhasA: ['1.0', '1.1', '3.1'],
        escolhasB: ['1.a', '2.b'],
        escolhasD: ['1.b', '2.a'],
      }),
      /pergunta/i,
    );
    assert.throws(
      () => logic.validarEscolhas({
        fixosCount: 2,
        desempatesCount: 1,
        blocoBCount: 2,
        blocoDCount: 2,
        escolhasA: ['1.0', '2.4', '3.1'],
        escolhasB: ['1.a', '2.b'],
        escolhasD: ['1.b', '2.a'],
      }),
      /opção/i,
    );
  });

  test('ranking B e D usa a ordem declarada em empate', () => {
    const empateB = logic.rankingDeterministico(
      { CELEBRACAO: 1, PALAVRAS: 1, APOIO: 1, SIMBOLO: 1, TEMPO: 1 },
      logic.ORDEM_B,
    );
    const empateD = logic.rankingDeterministico(
      { PAIXAO: 1, CORAGEM: 1, EMPATIA: 1, EXCELENCIA: 1 },
      logic.ORDEM_D,
    );
    assert.deepEqual(empateB.map(([key]) => key), logic.ORDEM_B);
    assert.deepEqual(empateD.map(([key]) => key), logic.ORDEM_D);
  });
}
