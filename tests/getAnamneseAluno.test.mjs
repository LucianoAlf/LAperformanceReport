// LAPE-19 — fonte unica de leitura da anamnese (ficha, link publico, WhatsApp).
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 3)
//
// Roda sem rede e sem banco.
//   node --test tests/getAnamneseAluno.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902100000_get_anamnese_aluno.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('a RPC devolve procedencia junto com a anamnese', () => {
  assert.ok(existsSync(migrationUrl), 'migration da RPC de leitura deve existir');
  const source = sql();
  assert.match(source, /create or replace function public\.get_anamnese_aluno\(p_aluno_id integer\)/i);
  assert.match(source, /'procedencia'/);
  assert.match(source, /'e_esta_matricula'/);
});

test('a RPC resolve por pessoa, nunca por aluno_id direto', () => {
  const source = sql();
  const inicio = source.indexOf('function public.get_anamnese_aluno');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /vw_aluno_pessoa_chave/i);
  assert.doesNotMatch(fn, /where an\.aluno_id = p_aluno_id/i);
});

test('anteriores sao expostas como historico, sem sumir', () => {
  // decisao do Luciano: a mais recente vence, a antiga fica no historico
  assert.match(sql(), /'anteriores'/);
});

test('link publico deixa de expor professor da matricula de origem', () => {
  // a pagina e aberta por TOKEN e nao sabe quem esta do outro lado, entao nao
  // existe "professor do contexto de quem abriu" -- exibir o da origem mostraria
  // o professor do outro curso.
  const source = sql();
  const inicio = source.indexOf('function public.get_anamnese_publica');
  assert.ok(inicio > -1, 'get_anamnese_publica deve ser recriada aqui');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /'professor_nome',\s*null/i);
});

test('a RPC da ficha revoga anon; a publica MANTEM anon (app externo depende)', () => {
  const source = sql();
  assert.match(source, /revoke execute on function public\.get_anamnese_aluno\(integer\) from anon/i);
  assert.match(source, /grant execute on function public\.get_anamnese_publica\(text\) to anon/i);
});

test('a RPC tambem e revogada dos papeis de agente', () => {
  // pg_default_acl deste schema concede EXECUTE em funcao nova so a
  // anon/authenticated/service_role, mas a anamnese carrega dado sensivel:
  // deixar explicito quem executa evita surpresa quando o default mudar.
  const source = sql();
  assert.match(source, /grant execute on function public\.get_anamnese_aluno\(integer\) to authenticated, service_role/i);
});
