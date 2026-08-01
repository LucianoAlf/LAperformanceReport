-- Retifica, apenas na leitura do relatório mensal, trancamentos sem identidade
-- de matrícula que foram corrigidos explicitamente após o fechamento.
-- O snapshot fechado permanece imutável e sua trilha de auditoria é preservada.

alter function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  rename to get_relatorio_admin_mensal_rico_base_v1;

revoke all on function public.get_relatorio_admin_mensal_rico_base_v1(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_relatorio_admin_mensal_rico_base_v1(uuid, integer, integer)
  to service_role;

create or replace function public.get_relatorio_admin_mensal_rico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
  v_snapshot_id uuid;
  v_capturado_em timestamptz;
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_item jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_retificacoes integer := 0;
  v_candidatos integer := 0;
  v_total_alunos integer := 0;
  v_total_matriculas integer := 0;
begin
  v_resultado := public.get_relatorio_admin_mensal_rico_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_snapshot_id := nullif(v_resultado->>'snapshot_id', '')::uuid;
  select s.capturado_em
  into v_capturado_em
  from public.fechamento_mensal_snapshots s
  where s.id = v_snapshot_id
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.dominio = 'relatorio_admin_mensal'
    and s.status = 'fechado';

  if v_capturado_em is null
     or jsonb_typeof(v_resultado#>'{payload,trancamentos_detalhados,itens}') <> 'array' then
    return v_resultado;
  end if;

  for v_item in
    select item
    from jsonb_array_elements(
      coalesce(v_resultado#>'{payload,trancamentos_detalhados,itens}', '[]'::jsonb)
    ) item
  loop
    v_candidatos := 0;

    -- A regra é deliberadamente estreita: somente um item sem qualquer
    -- identidade/detalhe de trancamento pode ser reconhecido como falso
    -- positivo, e apenas quando há uma correção auditada trancado -> ativo
    -- para uma única linha operacional, sem movimentação de trancamento.
    if nullif(btrim(coalesce(v_item->>'emusys_matricula_id', '')), '') is null
       and nullif(btrim(coalesce(v_item->>'curso_nome', '')), '') is null
       and nullif(btrim(coalesce(v_item->>'data_inicio', '')), '') is null
       and nullif(btrim(coalesce(v_item->>'data_final', '')), '') is null
       and nullif(btrim(coalesce(v_item->>'motivo', '')), '') is null
       and coalesce(v_item->>'faixa_politica', '') = 'data_ausente' then
      select count(distinct atual.id)::integer
      into v_candidatos
      from public.audit_log aud
      join public.alunos atual
        on atual.id::text = coalesce(
          nullif(aud.dados_novos->>'id', ''),
          nullif(aud.registro_id_text, '')
        )
      where aud.tabela = 'alunos'
        and aud.acao = 'UPDATE'
        and aud.created_at > v_capturado_em
        and coalesce(aud.dados_antigos->>'unidade_id', '') = p_unidade_id::text
        and coalesce(aud.dados_antigos->>'status', '') = 'trancado'
        and coalesce(aud.dados_novos->>'status', '') = 'ativo'
        and lower(btrim(coalesce(aud.dados_antigos->>'nome', '')))
          = lower(btrim(coalesce(v_item->>'aluno_nome', '')))
        and atual.unidade_id = p_unidade_id
        and atual.status = 'ativo'
        and lower(btrim(atual.nome))
          = lower(btrim(coalesce(v_item->>'aluno_nome', '')))
        and not exists (
          select 1
          from public.movimentacoes_admin m
          where m.unidade_id = p_unidade_id
            and m.aluno_id = atual.id
            and m.tipo = 'trancamento'
            and coalesce(m.competencia_referencia, m.data) >= v_inicio
            and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
            and m.created_at <= v_capturado_em
        );
    end if;

    if v_candidatos = 1 then
      v_retificacoes := v_retificacoes + 1;
    else
      v_itens := v_itens || jsonb_build_array(v_item);
    end if;
  end loop;

  if v_retificacoes = 0 then
    return v_resultado;
  end if;

  v_total_matriculas := jsonb_array_length(v_itens);
  select count(distinct lower(btrim(item->>'aluno_nome')))::integer
  into v_total_alunos
  from jsonb_array_elements(v_itens) item
  where nullif(btrim(coalesce(item->>'aluno_nome', '')), '') is not null;

  v_resultado := jsonb_set(
    v_resultado,
    '{payload,trancamentos_detalhados,itens}',
    v_itens,
    false
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,trancamentos_detalhados,total_alunos}',
    to_jsonb(v_total_alunos),
    false
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,trancamentos_detalhados,total_matriculas}',
    to_jsonb(v_total_matriculas),
    false
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,trancamentos_detalhados,retificacoes_auditadas}',
    to_jsonb(v_retificacoes),
    true
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,resumo,alunos_trancados}',
    to_jsonb(v_total_alunos),
    false
  );
  v_resultado := jsonb_set(
    v_resultado,
    '{payload,resumo,matriculas_trancadas}',
    to_jsonb(v_total_matriculas),
    false
  );

  return v_resultado;
end;
$$;

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Le o mensal fechado e aplica somente retificacoes auditadas de falsos trancamentos, sem alterar o snapshot.';
