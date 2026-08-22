-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Responsável FINANCEIRO do aluno (pedido da Fernanda/Rose 17/08/2026): o preview e o
-- lançamento passam a dizer de quem é a parcela. Read-only, mesma busca do casador.
create or replace function public.sol_caixa_responsavel_aluno(p_unidade_id uuid, p_aluno text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $function$
declare
  v_in text := unaccent(lower(coalesce(p_aluno,'')));
  v_alu record;
begin
  if length(btrim(v_in)) < 2 then return jsonb_build_object('ok', false, 'motivo','sem_nome'); end if;
  select a.id, a.nome, a.responsavel_nome, a.responsavel_parentesco,
         word_similarity(v_in, unaccent(lower(a.nome_normalizado))) sim
    into v_alu
  from alunos a
  where a.unidade_id = p_unidade_id
    and a.nome_normalizado is not null
    and (a.status ilike 'ativo%' or a.status is null)
  order by word_similarity(v_in, unaccent(lower(a.nome_normalizado))) desc,
           (a.status ilike 'ativo%') desc
  limit 1;
  if v_alu.id is null or coalesce(v_alu.sim,0) < 0.45 then
    return jsonb_build_object('ok', false, 'motivo','aluno_nao_encontrado');
  end if;
  return jsonb_build_object('ok', true, 'aluno_nome', v_alu.nome,
    'responsavel_nome', nullif(btrim(coalesce(v_alu.responsavel_nome,'')),''),
    'responsavel_parentesco', nullif(btrim(coalesce(v_alu.responsavel_parentesco,'')),''),
    'confianca_nome', round(v_alu.sim,2));
end $function$;
revoke all on function public.sol_caixa_responsavel_aluno(uuid, text) from public, anon, authenticated;
grant execute on function public.sol_caixa_responsavel_aluno(uuid, text) to service_role;
