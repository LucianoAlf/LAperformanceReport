// LAPE-19 — vinculo manual e convite raciocinam por pessoa.
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 4)
//
//   node --test tests/anamneseVinculoConvitePessoa.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902103000_anamnese_vinculo_e_convite_por_pessoa.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('vincular a outra matricula da MESMA pessoa vira no-op, nao erro', () => {
  assert.ok(existsSync(migrationUrl), 'migration de vinculo/convite deve existir');
  assert.match(sql(), /'ja_vale_para_esta_pessoa'/);
});

test('vincular a matricula de OUTRA pessoa continua recusado', () => {
  // a recusa existe para impedir roubo de vinculo -- nao pode cair junto
  assert.match(sql(), /'ja_vinculada_a_outro_aluno'/);
});

test('convite vivo e procurado por pessoa, senao a secretaria gera dois links', () => {
  const source = sql();
  const inicio = source.indexOf('function public.gerar_convite_anamnese');
  assert.ok(inicio > -1, 'gerar_convite_anamnese deve ser recriada aqui');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /vw_aluno_pessoa_chave/i);
});

test('assinaturas nao mudam: consumidor externo nao pode quebrar', () => {
  // parametro novo com DEFAULT criaria overload ambiguo -- e o incidente do
  // upsert_lead em 11/08/2026, que derrubou o webhook de leads por 21h com
  // "function is not unique".
  const source = sql();
  assert.match(
    source,
    /function public\.vincular_anamnese_aluno\(p_anamnese_id integer, p_aluno_id integer\)/i,
  );
  assert.match(
    source,
    /function public\.gerar_convite_anamnese\(\s*p_tipo_formulario character varying,\s*p_unidade_id uuid,\s*p_nome_aluno text,\s*p_aluno_id integer default null::integer,\s*p_telefone_aluno text default null::text,\s*p_data_nascimento date default null::date\s*\)/i,
  );
});

test('o vinculo delega o espelho a funcao canonica, sem UPDATE proprio em alunos', () => {
  const source = sql();
  const inicio = source.indexOf('function public.vincular_anamnese_aluno');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /fn_sincronizar_anamnese_preenchida_pessoa/i);
  assert.doesNotMatch(fn, /update\s+alunos\s+set/i);
});

test('as duas funcoes nao ficam executaveis por anon apos o replace', () => {
  const source = sql();
  assert.match(source, /revoke execute on function public\.vincular_anamnese_aluno\(integer, integer\) from anon/i);
  assert.match(source, /revoke execute on function public\.gerar_convite_anamnese\([^)]*\) from anon/i);
});
