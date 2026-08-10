-- Expõe `chave_natural` na baseline. Aditivo: coluna nova no fim dos dois ramos do
-- UNION ALL, nenhuma coluna existente muda de posição ou de valor.
-- O ramo `transicao:` recebe NULL de propósito — revisão nunca aponta para transição
-- (o join sempre foi `'baseline:' || periodo_id`).
--
-- ⚠️ NÃO É IDEMPOTENTE por desenho: lê a definição vigente com pg_get_functiondef/
-- pg_get_viewdef e faz replace() guardado, em vez de transcrever a view à mão (ela tem
-- ~300 linhas e dois CTEs grandes). Reaplicar aborta na primeira guarda.
do $mig$
declare
  v_def text;
  v_novo text;
  v_a constant text := $a$'professor_matricula_disciplina_periodos_v1+transicoes_gate3'::text AS fonte$a$;
  v_b constant text := $b$'aluno_professor_transicoes_gate3'::text AS fonte$b$;
  v_c constant text := E'    periodos_base.fonte\n   FROM periodos_base';
  v_d constant text := E'    periodos_transicoes.fonte\n   FROM periodos_transicoes';
begin
  v_def := pg_get_viewdef('public.vw_professor_periodos_baseline_v3_sombra'::regclass, true);

  if v_def like '%chave_natural%' then
    raise exception 'ABORTADO: a view ja expoe chave_natural — migration provavelmente ja aplicada';
  end if;

  -- Cada âncora precisa existir EXATAMENTE uma vez; se a view mudou, a migration para.
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'ABORTADO: ancora A (fonte periodos_base) nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1 then
    raise exception 'ABORTADO: ancora B (fonte periodos_transicoes) nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_c, ''))) / length(v_c) <> 1 then
    raise exception 'ABORTADO: ancora C (select final periodos_base) nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_d, ''))) / length(v_d) <> 1 then
    raise exception 'ABORTADO: ancora D (select final periodos_transicoes) nao bateu exatamente 1x';
  end if;

  v_novo := v_def;
  v_novo := replace(v_novo, v_a, v_a || E',\n            public.fn_chave_natural_periodo_professor_v1(p.unidade_id, p.pessoa_chave, p.emusys_matricula_disciplina_id, p.emusys_professor_id, p.evidencias) AS chave_natural');
  v_novo := replace(v_novo, v_b, v_b || E',\n            NULL::text AS chave_natural');
  v_novo := replace(v_novo, v_c, E'    periodos_base.fonte,\n    periodos_base.chave_natural\n   FROM periodos_base');
  v_novo := replace(v_novo, v_d, E'    periodos_transicoes.fonte,\n    periodos_transicoes.chave_natural\n   FROM periodos_transicoes');

  -- 4 inserções, nem uma a mais.
  if (length(v_novo) - length(replace(v_novo, 'chave_natural', ''))) / length('chave_natural') <> 5 then
    raise exception 'ABORTADO: esperava 5 ocorrencias de chave_natural (1 na funcao + 4 colunas), veio outra coisa';
  end if;

  execute 'create or replace view public.vw_professor_periodos_baseline_v3_sombra as ' || v_novo;
end
$mig$;
