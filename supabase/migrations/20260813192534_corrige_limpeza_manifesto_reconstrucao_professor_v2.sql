-- Correção da função criada em 20260813191600 (mesmo dia): a v1 tentava comparar 6 colunas
-- entre manifesto e professor_periodos_reconstrucoes_v1 pra achar "a vencedora" e
-- preservá-la — o match falhou (nenhuma linha bateu) e apagou o manifesto inteiro,
-- inclusive o vigente, ao ser testada em produção. Não corrompeu nada (Health Score lê de
-- professor_matricula_disciplina_periodos_v1, que não foi tocado, e o manifesto se remonta
-- sozinho a partir do staging bruto na próxima reconstrução) — mas não é o comportamento
-- pretendido, então corrigindo antes do cron rodar sozinho.
--
-- Regra nova, mais simples e sem depender de match fino de colunas: manifesto e partições
-- só têm função ENQUANTO a reconstrução daquela unidade está em andamento
-- (status IN ('pendente','executando')). Uma vez 'concluido', o resultado já está seguro em
-- professor_matricula_disciplina_periodos_v1 — não importa mais se era vencedora ou não,
-- pode apagar. Isso também corrige o efeito colateral da v1: nunca mais precisa reconstruir
-- o manifesto do zero desnecessariamente, só apaga o que é de fato de reconstrução finalizada.
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
  -- manifesto/particoes: preserva só o que pertence a reconstrução ainda EM ANDAMENTO
  -- (chave completa: sem isso, um manifesto de reconstrução travada/pausada também some,
  -- mas o próprio orquestrador já trata pausado/falhou como "requer retomada humana" e não
  -- reaproveita — então mesmo nesse caso, perder o manifesto só custa remontar).
  with em_andamento as (
    select unidade_id, data_inicio, data_fim, versao_reconstrucao, execucao_backfill_id, total_particoes
    from professor_periodos_reconstrucoes_v1
    where status in ('pendente', 'executando')
  )
  delete from professor_periodos_reconstrucao_manifesto_v1 m
  where not exists (
    select 1 from em_andamento e
    where e.unidade_id = m.unidade_id and e.data_inicio = m.data_inicio and e.data_fim = m.data_fim
      and e.versao_reconstrucao = m.versao_reconstrucao and e.execucao_backfill_id = m.execucao_backfill_id
      and e.total_particoes = m.total_particoes
  );
  get diagnostics v_manifesto_apagados = row_count;

  with em_andamento as (
    select unidade_id, data_inicio, data_fim, versao_reconstrucao, execucao_backfill_id, total_particoes
    from professor_periodos_reconstrucoes_v1
    where status in ('pendente', 'executando')
  )
  delete from professor_periodos_reconstrucao_particoes_v1 pp
  where not exists (
    select 1 from em_andamento e
    where e.unidade_id = pp.unidade_id and e.data_inicio = pp.data_inicio and e.data_fim = pp.data_fim
      and e.versao_reconstrucao = pp.versao_reconstrucao and e.execucao_backfill_id = pp.execucao_backfill_id
      and e.total_particoes = pp.total_particoes
  );
  get diagnostics v_particoes_apagadas = row_count;

  -- períodos: aqui SIM importa vencedora vs perdedora, porque a linha perdedora é
  -- resultado de cálculo (não scratch) e o critério é por reconstrucao_id, não por
  -- comparação de colunas — mais simples e já validado manualmente em 13/08.
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

revoke all on function public.limpar_manifesto_periodos_obsoletos_v1() from public, anon, authenticated;
