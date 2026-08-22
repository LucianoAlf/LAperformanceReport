-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Busca REVERSA: o comprovante traz o nome de quem PAGA (responsável financeiro), não o do
-- aluno. Caso real 17/08: Pix de "PAMELA CRISTINA G SERAFIM" = parcela do aluno Pedro Gonçalves.
-- Sem isso a Sol dizia "Categoria: outro" e não achava a parcela. Read-only, service_role.
create or replace function public.sol_caixa_aluno_por_responsavel(p_unidade_id uuid, p_nome text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare
  v_in text := unaccent(lower(coalesce(p_nome,'')));
  v_rows jsonb;
  v_n int;
begin
  if length(btrim(v_in)) < 3 then return jsonb_build_object('ok', false, 'motivo','sem_nome'); end if;
  select coalesce(jsonb_agg(x order by x->>'confianca' desc), '[]'::jsonb), count(*)
    into v_rows, v_n
  from (
    select jsonb_build_object(
             'aluno_id', a.id, 'aluno_nome', a.nome,
             'responsavel_nome', a.responsavel_nome,
             'confianca', round(word_similarity(v_in, unaccent(lower(a.responsavel_nome)))::numeric, 2)
           ) x
    from alunos a
    where a.unidade_id = p_unidade_id
      and a.responsavel_nome is not null
      and (a.status ilike 'ativo%' or a.status is null)
      and word_similarity(v_in, unaccent(lower(a.responsavel_nome))) >= 0.55
    order by word_similarity(v_in, unaccent(lower(a.responsavel_nome))) desc
    limit 5
  ) t;
  if v_n = 0 then return jsonb_build_object('ok', false, 'motivo','responsavel_nao_encontrado'); end if;
  return jsonb_build_object('ok', true, 'total', v_n, 'alunos', v_rows);
end $function$;
revoke all on function public.sol_caixa_aluno_por_responsavel(uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_aluno_por_responsavel(uuid, text) to service_role;
