// LAPE-19 — alunos.anamnese_preenchida vira espelho da anamnese da PESSOA.
// Plano: docs/superpowers/plans/2026-09-01-anamnese-por-pessoa.md (Task 2)
//
// Roda sem rede e sem banco.
//   node --test tests/anamneseEspelhoPessoa.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260902093000_anamnese_espelho_por_pessoa.sql',
  import.meta.url,
);
const sql = () => (existsSync(migrationUrl) ? readFileSync(migrationUrl, 'utf8') : '');

test('o espelho e recalculado tambem quando o vinculo Emusys chega DEPOIS', () => {
  // Bug identico ao de motivo_saida_id (corrigido em 20/08/2026): trigger so de
  // INSERT deixa para tras a linha que ganhou emusys_student_id pelo sync.
  assert.ok(existsSync(migrationUrl), 'migration do espelho deve existir');
  assert.match(sql(), /update of emusys_student_id on public\.alunos/i);
});

test('o espelho so LIGA o flag, nunca desliga em massa', () => {
  const source = sql();
  const inicio = source.indexOf('fn_sincronizar_anamnese_preenchida_pessoa');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /set\s+anamnese_preenchida\s*=\s*true/i);
  assert.doesNotMatch(fn, /anamnese_preenchida\s*=\s*false/i);
});

test('a propagacao e escopada por unidade E pessoa, nunca so por pessoa', () => {
  // 91 emusys_student_id se repetem entre unidades, com nomes diferentes.
  const source = sql();
  const inicio = source.indexOf('fn_sincronizar_anamnese_preenchida_pessoa');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  const update = fn.slice(fn.indexOf('update public.alunos'));
  assert.match(update, /unidade_id\s*=\s*p_unidade_id/i);
  assert.match(update, /pessoa_chave\s*=\s*p_pessoa_chave/i);
});

test('a anamnese vigente e a completa mais recente', () => {
  const source = sql();
  assert.match(source, /status\s*=\s*'completa'/i);
  assert.match(source, /order by created_at desc/i);
});

test('vincular anamnese pendente por nome continua exigindo unidade e tipo', () => {
  // nome sozinho nunca e chave: o predicado antigo (unidade + tipo) permanece.
  const source = sql();
  const inicio = source.indexOf('fn_vincular_anamnese_pendente');
  const fn = source.slice(inicio, source.indexOf('$function$;', inicio) + 11);
  assert.match(fn, /unidade_id\s*=\s*new\.unidade_id/i);
  assert.match(fn, /tipo_formulario\s*=\s*new\.classificacao/i);
});

test('a funcao do espelho nao fica executavel por anon', () => {
  const source = sql();
  assert.match(
    source,
    /revoke execute on function public\.fn_sincronizar_anamnese_preenchida_pessoa\(uuid, text\) from anon/i,
  );
});
