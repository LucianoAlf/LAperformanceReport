-- Fecha o ultimo caminho que ainda gerava snapshot de fantasma.
--
-- A migration irmã (`separa_duplicata_de_cadastro_de_ex_professor_no_score_v3`) filtrou os
-- dois wrappers de leitura e, por tabela, `materializar_health_score_professor_v3_escopo` e
-- `_escopo_diario` — que consomem o wrapper. Mas o caminho do CICLO
-- (`..._periodo_impl_base_202607`) calcula direto da fonte e nao passa por ali.
--
-- Foi ele quem criou 36 snapshots fantasma hoje as 15:56 UTC, na rematerializacao manual do
-- ciclo. Medido no mesmo dia, para nao confundir os dois caminhos:
--   06:30 (cron diario, mensal) ....... 86 snapshots / 43 professores / 0 fantasmas
--   15:54 + 15:56 (ciclo, manual) ..... 648 snapshots / 50 professores / 54 fantasmas
--
-- A intervencao e no LOOP que decide de quem sai snapshot, nao no calculo:
-- `health_score_v3_metricas_periodo_execucao` continua sendo populada igual, e a formula
-- do V3 nao e tocada. So deixamos de ABRIR snapshot para quem esta fora da pontuacao.
--
-- ⚠️ A funcao tem `#variable_conflict use_column`. Usar `p_competencia` dentro de SQL e
-- seguro aqui porque o proprio corpo ja faz isso (`date_trunc('month', p_competencia)` no
-- lookup da revisao anterior, algumas linhas abaixo).
do $mig$
declare
  v_def text;
  v_ancora constant text := E'for v_alvo in\n      select m.professor_id, max(m.professor_nome) as professor_nome,\n             m.unidade_id\n      from health_score_v3_metricas_periodo_execucao m\n      group by m.professor_id, m.unidade_id';
  v_novo constant text := E'for v_alvo in\n      select m.professor_id, max(m.professor_nome) as professor_nome,\n             m.unidade_id\n      from health_score_v3_metricas_periodo_execucao m\n      where not exists (\n        select 1\n        from public.fn_health_score_v3_professores_fora_da_pontuacao(p_competencia) f\n        where f.professor_id = m.professor_id\n      )\n      group by m.professor_id, m.unidade_id';
  v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname='materializar_health_score_professor_v3_periodo_impl_base_202607';

  if v_def is null then
    raise exception 'ABORTADO: funcao do ciclo nao encontrada';
  end if;
  if v_def like '%fora_da_pontuacao%' then
    raise exception 'ABORTADO: o caminho do ciclo ja esta filtrado';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='fn_health_score_v3_professores_fora_da_pontuacao') then
    raise exception 'ABORTADO: aplicar a migration irma antes (a regra ainda nao existe)';
  end if;

  v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_n <> 1 then
    raise exception 'ABORTADO: ancora do loop de alvos aparece % vez(es), esperava 1', v_n;
  end if;

  -- Guarda: existe exatamente 1 INSERT em snapshots; se mudar, o desenho mudou.
  v_n := (length(v_def) - length(replace(v_def, 'insert into public.health_score_professor_v3_snapshots', '')))
         / length('insert into public.health_score_professor_v3_snapshots');
  if v_n <> 1 then
    raise exception 'ABORTADO: esperava 1 insert em snapshots, achei %', v_n;
  end if;

  execute replace(v_def, v_ancora, v_novo);

  -- Confere que o resultado tem o filtro e continua com 1 insert so.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public'
     and p.proname='materializar_health_score_professor_v3_periodo_impl_base_202607';
  if v_def not like '%fora_da_pontuacao%' then
    raise exception 'ABORTADO: o filtro nao ficou na funcao';
  end if;
end
$mig$;
