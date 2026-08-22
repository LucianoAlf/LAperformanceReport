-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- v3: exige que o PRIMEIRO NOME do pagador apareça no responsável — sem isso
-- "Joao da Silva Santos" casava com "Patricia da Silva Santos" (0.75 só pelos sobrenomes).
create or replace function public.sol_caixa_identificar_por_pagador(p_unidade_id uuid, p_nome text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare
  v_in text := unaccent(lower(btrim(coalesce(p_nome,''))));
  v_rows jsonb; v_n int;
  v_comuns text[] := array['silva','santos','souza','sousa','oliveira','costa','lima','pereira',
    'rodrigues','ferreira','almeida','gomes','martins','araujo','ribeiro','alves','barbosa','nunes',
    'carvalho','dos','das','junior','filho','neto'];
  v_todos text[]; v_tokens text[]; v_primeiro text;
begin
  if length(v_in) < 3 then return jsonb_build_object('ok', false, 'motivo','sem_nome'); end if;
  v_todos := array_remove(string_to_array(regexp_replace(v_in,'[^a-z ]',' ','g'),' '), '');
  if v_todos is null or array_length(v_todos,1) < 1 then
    return jsonb_build_object('ok', false, 'motivo','sem_nome');
  end if;
  v_primeiro := v_todos[1];

  select coalesce(jsonb_agg(x order by (x->>'confianca')::numeric desc), '[]'::jsonb), count(*)
    into v_rows, v_n
  from (
    select jsonb_build_object('aluno_nome', a.nome, 'responsavel_nome', a.responsavel_nome,
             'confianca', round(word_similarity(v_in, unaccent(lower(a.responsavel_nome)))::numeric,2)) x
    from alunos a
    where a.unidade_id = p_unidade_id and a.responsavel_nome is not null
      and (a.status ilike 'ativo%' or a.status is null)
      and word_similarity(v_in, unaccent(lower(a.responsavel_nome))) >= 0.72
      and unaccent(lower(a.responsavel_nome)) ~ ('(^| )' || v_primeiro || '( |$)')
    order by word_similarity(v_in, unaccent(lower(a.responsavel_nome))) desc limit 5) t;
  if v_n > 0 then
    return jsonb_build_object('ok', true, 'via','responsavel','total', v_n,
      'ambiguo', v_n > 1, 'alunos', v_rows);
  end if;

  if array_length(v_todos,1) < 2 then return jsonb_build_object('ok', false, 'motivo','sem_sobrenome_util'); end if;
  select array_agg(tok) into v_tokens from (
    select distinct tok from unnest(v_todos[greatest(array_length(v_todos,1)-1,1):array_length(v_todos,1)]) tok
    where length(tok) >= 4 and not (tok = any(v_comuns))) s;
  if v_tokens is null then return jsonb_build_object('ok', false, 'motivo','sem_sobrenome_util'); end if;

  select coalesce(jsonb_agg(x order by x->>'aluno_nome'), '[]'::jsonb), count(*)
    into v_rows, v_n
  from (
    select distinct jsonb_build_object('aluno_nome', a.nome, 'responsavel_nome', a.responsavel_nome,
             'sobrenome', tok, 'confianca', 0.5) x
    from alunos a, unnest(v_tokens) tok
    where a.unidade_id = p_unidade_id
      and (a.status ilike 'ativo%' or a.status is null)
      and unaccent(lower(a.nome)) ~ ('(^| )' || tok || '( |$)')
    limit 5) t;
  if v_n = 0 then return jsonb_build_object('ok', false, 'motivo','pagador_nao_identificado'); end if;
  return jsonb_build_object('ok', true, 'via','familia', 'total', v_n,
    'ambiguo', v_n > 1, 'alunos', v_rows);
end $function$;
