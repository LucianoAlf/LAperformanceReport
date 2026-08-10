-- CP8 parte 2: o MOTIVO DE SAÍDA chega à retenção do professor.
--
-- `professor_matricula_disciplina_periodos_v1.motivo_saida_id` e
-- `.conta_retencao_professor` sempre foram gravados como NULL pela reconstrução
-- (`_shared/reconstrucao-periodos-professor.mjs`, linhas 727-728). Resultado: todo
-- encerramento pós-corte caía em "pendência" por falta de motivo atribuível.
--
-- ONDE LIGAR — na VIEW, não copiando para a tabela:
--   * `movimentacoes_admin` é a fonte de verdade do motivo e muda por decisão
--     administrativa, independente do histórico de aulas. Um snapshot semanal (que é a
--     cadência da reconstrução) ficaria até 7 dias velho — e o fluxo de curadoria é
--     exatamente "registrei o motivo, quero ver a pendência sumir".
--   * Copiar criaria uma segunda cópia do mesmo fato — o oposto da regra de DRY do projeto.
--   * A view já tinha a cadeia `COALESCE(transição, período)`; a movimentação entra como
--     terceiro elo, DEPOIS do período, e a revisão humana continua ganhando de todos no
--     nível efetivo. Precedência final: revisão > transição > período > movimentação.
--     (provado: 0 casos de revisão perdendo para a movimentação)
--
-- COMO CASAR — medido em 09/08/2026 sobre os 4.457 períodos encerrados não-troca:
--   por `aluno_id` do período ............ 120 casam (o campo é NULL em 3.404 deles, 76%)
--   por `pessoa_chave` ................... 256, mas **8 evasões seriam reclamadas por DOIS
--                                          professores** — uma saída penalizando duas pessoas
--   por `pessoa_chave` + `curso_id` ...... derruba a ambiguidade para 1
--   por `pessoa_chave` + `professor_id` .. 220 atribuíveis, **ZERO ambíguas** ✅
-- O desempate certo estava no próprio dado: `movimentacoes_admin.professor_id` já diz de
-- quem é a saída. As 32 combinações em que ele diverge do professor do período são
-- corretamente descartadas — aquela saída é de outro professor.
--
-- REUSO (nada reinventado): o lookup FK-ou-texto de `motivos_saida` e a função
-- `is_movimentacao_admin_retencao_valida` vêm de `get_saidas_professor_periodo_canonicas_v1`.
-- ⚠️ Só 348 das 758 evasões têm o FK `motivo_saida_id`; o resto tem só o texto — por isso
-- o lookup precisa dos dois caminhos.
--
-- ⚠️ `troca%` fica de FORA. Trocar de professor não é o aluno sair — é o que o PR #104
-- corrigiu, e atribuir motivo ali reintroduziria o bug pela porta dos fundos.
--
-- ⚠️ ESTA VERSÃO TEM PROBLEMA DE DESEMPENHO, corrigido pelas duas migrations seguintes
-- (`…210605` e `…210703`). Mantida no histórico porque é onde mora o raciocínio do
-- casamento; o desenho final está na última.
do $mig$
declare
  v_def text;
  v_novo text;
  v_ancora_lateral constant text := E'                 LIMIT 1) t_fim ON true';
  v_ancora_motivo  constant text := 'COALESCE(t_fim.motivo_saida_id, p.motivo_saida_id) AS motivo_saida_id';
  v_ancora_conta   constant text := 'COALESCE(t_fim.conta_retencao_professor, p.conta_retencao_professor) AS conta_retencao_professor';
  v_ancora_atrib   constant text := 'WHEN p.motivo_saida_id IS NOT NULL AND p.conta_retencao_professor IS NOT NULL THEN true';
  v_lateral constant text :=
E'                 LIMIT 1) t_fim ON true
             LEFT JOIN LATERAL ( SELECT mo.motivo_saida_id,
                    mo.conta_score_professor
                   FROM movimentacoes_admin m
                     JOIN vw_aluno_identidade_unidade_canonica idc ON idc.unidade_id = m.unidade_id AND m.aluno_id = ANY (idc.aluno_ids_locais)
                     LEFT JOIN LATERAL ( SELECT motivo.id AS motivo_saida_id,
                            motivo.conta_score_professor
                           FROM motivos_saida motivo
                          WHERE motivo.ativo = true AND (motivo.id = m.motivo_saida_id OR m.motivo_saida_id IS NULL AND m.motivo IS NOT NULL AND lower(btrim(motivo.nome)) = lower(btrim(m.motivo)))
                          ORDER BY (CASE WHEN motivo.id = m.motivo_saida_id THEN 0 ELSE 1 END), motivo.id
                         LIMIT 1) mo ON true
                  WHERE p.status_periodo = ''encerrado''::text AND p.data_fim IS NOT NULL AND t_fim.id IS NULL AND COALESCE(p.tipo_fim, ''''::text) NOT LIKE ''troca%'' AND m.unidade_id = p.unidade_id AND idc.pessoa_chave = p.pessoa_chave AND m.professor_id = p.professor_id AND m.tipo = ANY (ARRAY[''evasao''::text, ''nao_renovacao''::text]) AND m.data >= (p.data_fim::date - 45) AND m.data <= (p.data_fim::date + 45) AND is_movimentacao_admin_retencao_valida(m.id) AND mo.motivo_saida_id IS NOT NULL
                  ORDER BY (m.curso_id IS NOT DISTINCT FROM p.curso_id) DESC, abs(m.data - p.data_fim::date), m.id
                 LIMIT 1) mv ON true';
begin
  v_def := pg_get_viewdef('public.vw_professor_periodos_baseline_v3_sombra'::regclass, true);

  if v_def like '%) mv ON true%' then
    raise exception 'ABORTADO: a view ja resolve motivo por movimentacao — migration ja aplicada';
  end if;
  if v_def not like '%chave_natural%' then
    raise exception 'ABORTADO: a view nao tem chave_natural — aplicar 20260809195007 antes';
  end if;

  if (length(v_def) - length(replace(v_def, v_ancora_lateral, ''))) / length(v_ancora_lateral) <> 1 then
    raise exception 'ABORTADO: ancora do lateral t_fim nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora_motivo, ''))) / length(v_ancora_motivo) <> 1 then
    raise exception 'ABORTADO: ancora de motivo_saida_id nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora_conta, ''))) / length(v_ancora_conta) <> 1 then
    raise exception 'ABORTADO: ancora de conta_retencao_professor nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_ancora_atrib, ''))) / length(v_ancora_atrib) <> 1 then
    raise exception 'ABORTADO: ancora de atribuicao_confirmada nao bateu exatamente 1x';
  end if;

  v_novo := v_def;
  v_novo := replace(v_novo, v_ancora_lateral, v_lateral);
  v_novo := replace(v_novo, v_ancora_motivo,
    'COALESCE(t_fim.motivo_saida_id, p.motivo_saida_id, mv.motivo_saida_id) AS motivo_saida_id');
  v_novo := replace(v_novo, v_ancora_conta,
    'COALESCE(t_fim.conta_retencao_professor, p.conta_retencao_professor, mv.conta_score_professor) AS conta_retencao_professor');
  v_novo := replace(v_novo, v_ancora_atrib,
    v_ancora_atrib || E'\n                    WHEN mv.motivo_saida_id IS NOT NULL THEN true');

  if (length(v_novo) - length(replace(v_novo, ') mv ON true', ''))) / length(') mv ON true') <> 1 then
    raise exception 'ABORTADO: o lateral da movimentacao nao foi inserido exatamente 1x';
  end if;

  execute 'create or replace view public.vw_professor_periodos_baseline_v3_sombra as ' || v_novo;
end
$mig$;
