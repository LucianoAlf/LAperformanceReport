-- A curadoria passa a ser resolvida pela CHAVE NATURAL do período, não pelo uuid.
--
-- Antes: LEFT JOIN ... ON b.periodo_chave = 'baseline:' || rv.periodo_id
--        → reconstruir gera uuids novos → 100% da curadoria vira órfã.
-- Agora: casa por (unidade, pessoa, matricula_disciplina, professor, 1a aula do Emusys),
--        com o uuid antigo de REDE onde não há âncora (período com evidências sem aula).
--        Assim a decisão humana sobrevive à reconstrução E nada regride hoje.
--
-- Paridade medida em 09/08/2026 com a reconstrução vigente (8.297 linhas da baseline):
--   idênticas 8.294 | ganham revisão 3 | perdem 0 | trocam 0
-- E, pela RPC get_professor_retencao_v3_governada, 120/120 linhas professor×escopo
-- idênticas em TODOS os campos, incluindo o md5 do jsonb `detalhes`.
-- As 3 que ganham são revisões humanas de 16/07/2026 que estavam órfãs desde uma
-- reconstrução anterior — recuperar isso é justamente o objetivo da mudança.
--
-- Efeito ao reconstruir (medido no mesmo dia, com a reconstrução até 09/08 ativa):
--   pela semântica antiga (uuid) ...... 0 de 8.341 linhas com curadoria
--   pela chave natural ................ 235 decisões atravessaram
--
-- ⚠️ NÃO É IDEMPOTENTE por desenho — ver a migration irmã 20260809195007.
do $mig$
declare
  v_def text;
  v_novo text;
  v_a constant text := $a$SELECT DISTINCT ON (rv.periodo_id) rv.id,$a$;
  v_b constant text := E'           FROM professor_periodos_revisoes_v1 rv\n          ORDER BY rv.periodo_id, rv.created_at DESC, rv.id DESC';
  v_c constant text := $c$LEFT JOIN revisoes_ultimas rv ON b.periodo_chave = ('baseline:'::text || rv.periodo_id::text)$c$;
  v_b_novo constant text := E'           FROM professor_periodos_revisoes_v1 rv\n             LEFT JOIN professor_matricula_disciplina_periodos_v1 pr ON pr.id = rv.periodo_id\n             CROSS JOIN LATERAL ( SELECT COALESCE(public.fn_chave_natural_periodo_professor_v1(pr.unidade_id, pr.pessoa_chave, pr.emusys_matricula_disciplina_id, pr.emusys_professor_id, pr.evidencias), ''baseline:''::text || rv.periodo_id::text) AS chave_res) x\n          ORDER BY x.chave_res, rv.created_at DESC, rv.id DESC';
begin
  v_def := pg_get_viewdef('public.vw_professor_periodos_efetivos_v3_sombra'::regclass, true);

  if v_def like '%chave_res%' then
    raise exception 'ABORTADO: a view ja resolve por chave_res — migration provavelmente ja aplicada';
  end if;

  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then
    raise exception 'ABORTADO: ancora A (DISTINCT ON periodo_id) nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1 then
    raise exception 'ABORTADO: ancora B (FROM revisoes + ORDER BY) nao bateu exatamente 1x';
  end if;
  if (length(v_def) - length(replace(v_def, v_c, ''))) / length(v_c) <> 1 then
    raise exception 'ABORTADO: ancora C (LEFT JOIN por periodo_id) nao bateu exatamente 1x';
  end if;

  v_novo := v_def;
  v_novo := replace(v_novo, v_a, $x$SELECT DISTINCT ON (x.chave_res) x.chave_res,
            rv.id,$x$);
  v_novo := replace(v_novo, v_b, replace(v_b_novo, '''''', ''''));
  v_novo := replace(v_novo, v_c, $y$LEFT JOIN revisoes_ultimas rv ON rv.chave_res = COALESCE(b.chave_natural, b.periodo_chave)$y$);

  -- o join por uuid tem que ter DESAPARECIDO
  if v_novo like '%b.periodo_chave = (''baseline:''%' then
    raise exception 'ABORTADO: o join antigo por uuid sobreviveu a substituicao';
  end if;

  execute 'create or replace view public.vw_professor_periodos_efetivos_v3_sombra as ' || v_novo;
end
$mig$;
