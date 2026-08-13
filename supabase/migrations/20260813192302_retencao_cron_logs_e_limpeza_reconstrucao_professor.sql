-- Retenção do log de execução de cron (nunca teve limpeza; ~30 MB/mês e acelerando).
-- Mesmo padrão do job 12 (cleanup-audit-log), 90 dias em vez de 30 por decisão do usuário.
select cron.schedule(
  'cleanup-job-run-details',
  '0 6 * * 0',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '90 days'$$
);

-- Automatiza a limpeza que foi feita manualmente em 13/08/2026: manifesto e períodos de
-- reconstrução de professor acumulam um lote novo a cada ciclo semanal
-- (orquestrar-historico-professor) e nada apagava o lote anterior.
--
-- "Vencedora" = mesma regra da view vw_professor_periodos_baseline_v3_sombra: por
-- unidade, a reconstrução concluída mais recente (status='concluido', maior data_fim).
-- Como só considera status='concluido', nunca apaga uma reconstrução em andamento —
-- a antiga continua sendo a vencedora até a nova terminar de verdade.
--
-- Períodos referenciados por professor_periodos_revisoes_v1 (decisão humana ou automática
-- registrada em auditoria) são preservados mesmo se não vencedores — mesma trava que
-- bloqueou o DELETE manual em 13/08 e obrigou a adicionar esse cuidado.
--
-- ⚠️ Corrigida no mesmo dia por 20260813192500 — ver comentário lá. O match de 6 colunas
-- pra achar o manifesto vencedor falhou em produção e apagou o manifesto inteiro (sem
-- efeito visível: professor_matricula_disciplina_periodos_v1, que alimenta o Health Score,
-- não foi tocado). Mantido aqui só como registro histórico da v1.
create or replace function public.limpar_manifesto_periodos_obsoletos_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifesto_apagados integer;
  v_particoes_apagadas integer;
  v_periodos_apagados integer;
begin
  with vencedoras as (
    select unidade_id, data_inicio, data_fim, versao_reconstrucao, execucao_backfill_id, total_particoes
    from (
      select *, row_number() over (
        partition by unidade_id
        order by data_fim desc, data_inicio, concluido_em desc nulls last, created_at desc
      ) as ordem
      from professor_periodos_reconstrucoes_v1
      where status = 'concluido'
    ) x
    where ordem = 1
  )
  delete from professor_periodos_reconstrucao_manifesto_v1 m
  where not exists (
    select 1 from vencedoras v
    where v.unidade_id = m.unidade_id and v.data_inicio = m.data_inicio and v.data_fim = m.data_fim
      and v.versao_reconstrucao = m.versao_reconstrucao and v.execucao_backfill_id = m.execucao_backfill_id
      and v.total_particoes = m.total_particoes
  );
  get diagnostics v_manifesto_apagados = row_count;

  with vencedoras as (
    select unidade_id, data_inicio, data_fim, versao_reconstrucao, execucao_backfill_id, total_particoes
    from (
      select *, row_number() over (
        partition by unidade_id
        order by data_fim desc, data_inicio, concluido_em desc nulls last, created_at desc
      ) as ordem
      from professor_periodos_reconstrucoes_v1
      where status = 'concluido'
    ) x
    where ordem = 1
  )
  delete from professor_periodos_reconstrucao_particoes_v1 pp
  where not exists (
    select 1 from vencedoras v
    where v.unidade_id = pp.unidade_id and v.data_inicio = pp.data_inicio and v.data_fim = pp.data_fim
      and v.versao_reconstrucao = pp.versao_reconstrucao and v.execucao_backfill_id = pp.execucao_backfill_id
      and v.total_particoes = pp.total_particoes
  );
  get diagnostics v_particoes_apagadas = row_count;

  with vencedoras as (
    select id from (
      select id, row_number() over (
        partition by unidade_id
        order by data_fim desc, data_inicio, concluido_em desc nulls last, created_at desc
      ) as ordem
      from professor_periodos_reconstrucoes_v1
      where status = 'concluido'
    ) x
    where ordem = 1
  )
  delete from professor_matricula_disciplina_periodos_v1 p
  where p.reconstrucao_id not in (select id from vencedoras)
    and not exists (select 1 from professor_periodos_revisoes_v1 r where r.periodo_id = p.id);
  get diagnostics v_periodos_apagados = row_count;

  return jsonb_build_object(
    'manifesto_apagados', v_manifesto_apagados,
    'particoes_apagadas', v_particoes_apagadas,
    'periodos_apagados', v_periodos_apagados,
    'executado_em', now()
  );
end;
$$;

-- Recriar função SECURITY DEFINER reabre EXECUTE pra anon via ALTER DEFAULT PRIVILEGES
-- do schema (gotcha já documentado no CLAUDE.md do projeto) — fechar explicitamente.
revoke all on function public.limpar_manifesto_periodos_obsoletos_v1() from public, anon, authenticated;

-- Roda semanalmente, folga de dias em relação ao ciclo de 7 dias da reconstrução
-- (mas seguro rodar em qualquer horário, ver comentário acima sobre "vencedora").
select cron.schedule(
  'cleanup-reconstrucao-professor-obsoleta',
  '0 11 * * 2',
  $$select public.limpar_manifesto_periodos_obsoletos_v1()$$
);
