import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260801143000_pesquisa_evasao_prosodia_v2.sql',
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8')
  : '';

test('migration cria os dois templates V2 sem apagar a V1', () => {
  assert.match(sql, /'evasao_aberta',\s*2,\s*'direto'/i);
  assert.match(sql, /'evasao_aberta',\s*2,\s*'responsavel'/i);
  assert.doesNotMatch(
    sql,
    /delete\s+from\s+public\.pesquisa_evasao_templates/i,
  );
  assert.match(sql, /versao\s*=\s*1[\s\S]*templates V1 ausentes/i);
});

test('templates V2 preservam a copia e a formatacao aprovadas', () => {
  assert.match(sql, /> \*Se você pudesse mudar alguma coisa aqui na LA/);
  assert.match(
    sql,
    /_Pedimos a gentileza de responder com sinceridade\. Sua opinião vai nos ajudar a oferecer uma experiência cada vez melhor aos nossos alunos\._/,
  );
  assert.match(
    sql,
    /Pode responder com texto ou áudio\. Fique à vontade\. 🙏/,
  );
  assert.doesNotMatch(sql, /^\s*-{3,}\s*$/m);
  assert.match(sql, /{{assinatura_com_artigo}}/);
  assert.match(sql, /{{aluno_com_preposicao}}/);
});

test('migration deixa exatamente uma V2 ativa por publico', () => {
  assert.match(sql, /set\s+ativo\s*=\s*false[\s\S]*ativo\s*=\s*true/i);
  assert.match(
    sql,
    /count\(\*\)[\s\S]*versao\s*=\s*2[\s\S]*publico\s+in\s*\(\s*'direto'\s*,\s*'responsavel'\s*\)/i,
  );
});

test('fila bloqueia data de nascimento ausente sem alterar outros contratos', () => {
  assert.match(
    sql,
    /when\s+data_nascimento\s+is\s+null\s+then\s+'data_nascimento_ausente'/i,
  );
  assert.match(
    sql,
    /when\s+a\.data_nascimento\s+is\s+null\s+then\s+'indeterminado'/i,
  );
  assert.match(sql, /'responsavel_sem_telefone'/i);
  assert.match(sql, /'motivo_nao_catalogado'/i);
  assert.match(sql, /'pesquisa_aberta_no_mesmo_numero'/i);
});
