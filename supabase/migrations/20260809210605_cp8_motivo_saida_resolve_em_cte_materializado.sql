-- Correção de desempenho da migration irmã (motivo de saída na retenção).
--
-- A primeira versão punha `vw_aluno_identidade_unidade_canonica` DENTRO de um LATERAL
-- correlacionado, então ela era reexecutada por linha — com um Seq Scan em `alunos`
-- (1.632 linhas) a cada laço. Medido: baseline foi de **53,5 ms / 2.681 buffers** para
-- **2.227 ms / 168.771 buffers** (63× mais buffers). Não se sobe isso.
--
-- Agora as saídas atribuíveis são resolvidas UMA VEZ num CTE `MATERIALIZED` (~758
-- movimentações, ~220 atribuíveis) e o LATERAL só varre esse conjunto pequeno.
-- `MATERIALIZED` é explícito de propósito: desde o PG12 o planner inlineia CTE usada uma
-- vez, e inlinear aqui traria o problema de volta.
do $mig$
declare
  v_def text; v_novo text; v_ini int; v_fim int;
  v_marca constant text := 'LEFT JOIN LATERAL ( SELECT mo.motivo_saida_id';
  v_fecha constant text := ') mv ON true';
  v_ancora_cte constant text := E'        ), periodos_base AS (';
  v_lateral_novo constant text :=
E'LEFT JOIN LATERAL ( SELECT s.motivo_saida_id,
                    s.conta_score_professor
                   FROM saidas_atribuiveis s
                  WHERE p.status_periodo = ''encerrado''::text AND p.data_fim IS NOT NULL AND t_fim.id IS NULL AND COALESCE(p.tipo_fim, ''''::text) NOT LIKE ''troca%'' AND s.unidade_id = p.unidade_id AND s.pessoa_chave = p.pessoa_chave AND s.professor_id = p.professor_id AND s.data >= (p.data_fim::date - 45) AND s.data <= (p.data_fim::date + 45)
                  ORDER BY (s.curso_id IS NOT DISTINCT FROM p.curso_id) DESC, abs(s.data - p.data_fim::date), s.id
                 LIMIT 1) mv ON true';
  v_cte_novo constant text :=
E'        ), saidas_atribuiveis AS MATERIALIZED (
         SELECT m.id,
            m.unidade_id,
            idc.pessoa_chave,
            m.professor_id,
            m.curso_id,
            m.data,
            mo.motivo_saida_id,
            mo.conta_score_professor
           FROM movimentacoes_admin m
             JOIN vw_aluno_identidade_unidade_canonica idc ON idc.unidade_id = m.unidade_id AND (m.aluno_id = ANY (idc.aluno_ids_locais))
             LEFT JOIN LATERAL ( SELECT motivo.id AS motivo_saida_id,
                    motivo.conta_score_professor
                   FROM motivos_saida motivo
                  WHERE motivo.ativo = true AND (motivo.id = m.motivo_saida_id OR m.motivo_saida_id IS NULL AND m.motivo IS NOT NULL AND lower(btrim(motivo.nome)) = lower(btrim(m.motivo)))
                  ORDER BY (CASE WHEN motivo.id = m.motivo_saida_id THEN 0 ELSE 1 END), motivo.id
                 LIMIT 1) mo ON true
          WHERE m.tipo = ANY (ARRAY[''evasao''::text, ''nao_renovacao''::text]) AND m.professor_id IS NOT NULL AND mo.motivo_saida_id IS NOT NULL AND is_movimentacao_admin_retencao_valida(m.id)
        ), periodos_base AS (';
begin
  v_def := pg_get_viewdef('public.vw_professor_periodos_baseline_v3_sombra'::regclass, true);

  if v_def like '%saidas_atribuiveis%' then
    raise exception 'ABORTADO: a view ja usa o CTE saidas_atribuiveis — migration ja aplicada';
  end if;

  v_ini := position(v_marca in v_def);
  v_fim := position(v_fecha in v_def);
  if v_ini = 0 or v_fim = 0 or v_fim <= v_ini then
    raise exception 'ABORTADO: nao localizei o lateral da movimentacao (ini=%, fim=%)', v_ini, v_fim;
  end if;
  if (length(v_def) - length(replace(v_def, v_fecha, ''))) / length(v_fecha) <> 1 then
    raise exception 'ABORTADO: fecho do lateral nao aparece exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora_cte, ''))) / length(v_ancora_cte) <> 1 then
    raise exception 'ABORTADO: ancora do CTE periodos_base nao bateu exatamente 1x';
  end if;

  v_novo := left(v_def, v_ini - 1) || v_lateral_novo || substr(v_def, v_fim + length(v_fecha));
  v_novo := replace(v_novo, v_ancora_cte, v_cte_novo);

  if v_novo like '%vw_aluno_identidade_unidade_canonica idc ON idc.unidade_id = m.unidade_id%'
     and v_novo not like '%saidas_atribuiveis AS MATERIALIZED%' then
    raise exception 'ABORTADO: a view de identidade ficou fora do CTE';
  end if;
  if (length(v_novo) - length(replace(v_novo, ') mv ON true', ''))) / length(') mv ON true') <> 1 then
    raise exception 'ABORTADO: esperava exatamente 1 lateral mv';
  end if;

  execute 'create or replace view public.vw_professor_periodos_baseline_v3_sombra as ' || v_novo;
end
$mig$;
