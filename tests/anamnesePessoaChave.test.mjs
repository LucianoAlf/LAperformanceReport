// LAPE-19 — a anamnese passa a pertencer a pessoa, nao a matricula.
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 1)
//
// Roda sem rede e sem banco: le a migration e afere o contrato dela.
//   node --test tests/anamnesePessoaChave.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902090000_anamnese_pessoa_chave.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('a regra de identidade vive em UM lugar (a view), e a funcao le a view', () => {
  assert.ok(existsSync(migrationUrl), 'migration do pessoa_chave deve existir');
  const source = sql();
  assert.match(source, /create or replace view public\.vw_aluno_pessoa_chave/i);

  // A funcao NAO reimplementa o case: ela consulta a view. Duas fontes de escrita
  // com regras proprias para o mesmo campo foi a causa-raiz das duplicatas de
  // renovacao -- nao repetir o padrao na identidade.
  const inicioFn = source.indexOf('function public.fn_pessoa_chave_aluno');
  assert.ok(inicioFn > -1, 'fn_pessoa_chave_aluno deve existir');
  const corpoFn = source.slice(inicioFn, source.indexOf('$function$;', inicioFn) + 11);
  assert.match(corpoFn, /from public\.vw_aluno_pessoa_chave/i);
  assert.doesNotMatch(corpoFn, /emusys_student_id/i);
});

test('sem id do Emusys a chave e local: e nunca cai em nome', () => {
  const source = sql();
  assert.match(source, /'local:'\s*\|\|/i);
  // nome + unidade e fallback de reconciliacao, nunca chave de identidade
  assert.doesNotMatch(source, /nome_normalizado|lower\(btrim\(a\.nome\)\)/i);
});

test('pessoa_chave da anamnese e derivada por trigger, nunca escrita a mao', () => {
  const source = sql();
  assert.match(source, /before insert or update of aluno_id on public\.anamneses/i);
});

test('view de leitura nao nasce com privilegio de escrita (ALTER DEFAULT PRIVILEGES)', () => {
  // Toda relacao nova em public nasce com authenticated=arwdDxtm neste projeto.
  // View simples e auto-atualizavel: sem o revoke, qualquer autenticado escreveria.
  const source = sql();
  assert.match(source, /revoke all on public\.vw_aluno_pessoa_chave from public, anon, authenticated/i);
  assert.match(source, /grant select on public\.vw_aluno_pessoa_chave to authenticated, service_role/i);
});

test('funcao nova revoga anon nominalmente, nao so public', () => {
  const source = sql();
  assert.match(source, /revoke execute on function public\.fn_pessoa_chave_aluno\(integer\) from anon/i);
});

test('a view tambem e revogada dos papeis de agente', () => {
  // Medido em 02/09/2026: o ALTER DEFAULT PRIVILEGES deste schema e mais amplo do
  // que o CLAUDE.md registra -- concede SELECT em toda relacao nova a
  // sol_acesso_restrito, mila_acesso_restrito, fabio_agent e lia_acesso_restrito.
  // Revogar em public/anon/authenticated NAO alcanca esses quatro.
  const aclUrl = new URL(
    '../supabase/migrations/20260902090100_anamnese_pessoa_chave_acl_agentes.sql',
    import.meta.url,
  );
  assert.ok(existsSync(aclUrl), 'migration de ACL dos agentes deve existir');
  const acl = readFileSync(aclUrl, 'utf8');
  for (const papel of ['sol_acesso_restrito', 'mila_acesso_restrito', 'fabio_agent', 'lia_acesso_restrito']) {
    assert.match(acl, new RegExp(`revoke all on public\\.vw_aluno_pessoa_chave from ${papel}`, 'i'));
  }
});

test('o indice cobre o par (unidade_id, pessoa_chave), nunca a chave sozinha', () => {
  // 91 emusys_student_id aparecem em 2+ unidades, os 91 com NOMES DIFERENTES.
  const source = sql();
  assert.match(source, /on public\.anamneses \(unidade_id, pessoa_chave\)/i);
});
