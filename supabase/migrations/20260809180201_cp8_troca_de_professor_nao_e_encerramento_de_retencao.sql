-- CP8 (parte 1) — troca de professor nao e evasao: nao penaliza e nao vira pendencia.
--
-- Regra do negocio (Hugo/Alf, 09/08/2026): "nao e porque um aluno saiu de um professor
-- e foi para outro que ele saiu da escola. Isso nao e evasao e nem penaliza o professor."
--
-- Medido em producao antes de aplicar (ciclo 2026-JUN-AGO, consolidado):
--   tipo_fim               | penalizando | aluno segue ativo | com evasao registrada
--   fim_jornada            |     92      |        0          |         43
--   troca_confirmada_*     |     41      |       36          |          0
--   troca_sustentada       |     25      |       23          |          0
--   fim_evidencia_historica|      1      |        0          |          0
-- Os 66 encerramentos da familia `troca%` NAO tem uma unica evasao registrada em
-- movimentacoes_admin, e 59 deles tem o aluno ATIVO no Emusys com outro professor.
-- O `tipo_fim` ja separava as duas coisas; a funcao de governanca e que nunca olhou.
--
-- A origem de `troca_confirmada_transicao` e o proprio webhook de troca de professor:
-- vw_professor_periodos_baseline_v3_sombra sintetiza o fim quando o periodo esta 'ativo'
-- na tabela-base e existe linha em aluno_professor_transicoes (t_fim.data_transicao).
--
-- Efeito medido (mesmo recorte): retencao 88,10% -> 93,04%;
-- encerramentos pos-corte pendentes 15 -> 0.
--
-- Editada via pg_get_functiondef + replace com guarda de unicidade (padrao do projeto):
-- transcrever a mao uma funcao desse tamanho e como o erro entra.
do $$
declare
  v_def text;
  v_novo text;
  v_a constant text := E'          between p.periodo_inicio and p.fim_recorte\n        and (\n          (\n';
  v_b constant text := E'          between greatest(p.periodo_inicio, date ''2026-08-03'')\n          and p.fim_recorte\n        and (\n';
  v_c constant text := E'    ''modo_pos_corte'', ''somente_atribuicao_confirmada_e_motivo_atribuivel'',\n';
  v_guarda constant text := E'        and coalesce(pe.tipo_fim, '''') not like ''troca%''\n';
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'get_professor_retencao_v3_governada';

  if v_def is null then
    raise exception 'get_professor_retencao_v3_governada nao encontrada';
  end if;

  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1
     or (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1
     or (length(v_def) - length(replace(v_def, v_c, ''))) / length(v_c) <> 1 then
    raise exception 'ancoras nao bateram exatamente 1x: a funcao mudou desde a leitura';
  end if;

  if position('not like ''troca%''' in v_def) > 0 then
    raise exception 'guarda de troca ja aplicada: migration nao e idempotente por desenho';
  end if;

  v_novo := replace(v_def, v_a, E'          between p.periodo_inicio and p.fim_recorte\n' || v_guarda || E'        and (\n          (\n');
  v_novo := replace(v_novo, v_b, E'          between greatest(p.periodo_inicio, date ''2026-08-03'')\n          and p.fim_recorte\n' || v_guarda || E'        and (\n');
  v_novo := replace(v_novo, v_c, v_c || E'    ''troca_de_professor'', ''nao_e_encerramento_de_retencao'',\n');

  if (length(v_novo) - length(replace(v_novo, 'not like ''troca%''', ''))) / length('not like ''troca%''') <> 2 then
    raise exception 'esperava 2 guardas inseridas, encontrei outra quantidade';
  end if;

  execute v_novo;
end $$;
