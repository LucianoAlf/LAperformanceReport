-- Terceiro e último ajuste de desempenho do motivo de saída na retenção.
--
-- Medições em sequência, mesma query (`count(*)` sobre a baseline, 8.341 linhas):
--   original (sem motivo) .............. 53,5 ms /   2.681 buffers
--   lateral correlacionado ............. 2.227 ms / 168.771 buffers  ← identidade por linha
--   CTE materializado .................. 556 ms /  88.795 buffers   ← ordem de junção ruim
--   dois CTEs (este) ...................  437 ms /   6.475 buffers  ✅
-- E a RPC que a tela chama (`get_professor_retencao_v3_governada`, consolidado, ciclo):
--   489 ms / 12.832 buffers, contra `statement_timeout` de 8 s do papel `authenticated`.
--
-- O que ainda doía: o planner dirigia da view de identidade (1.411 pessoas) PARA DENTRO
-- de `movimentacoes_admin`, refazendo um Bitmap Heap Scan a cada uma (72.721 heap blocks).
-- Materializar as saídas cruas ANTES força o caminho oposto: 489 linhas filtradas de uma
-- vez, e só então o encontro com a identidade (hash join, uma passada).
--
-- ⚠️ Por que não simplificar mais: seria tentador trocar
-- `vw_aluno_identidade_unidade_canonica` por um join direto em `alunos` — mas
-- `alunos.pessoa_chave` NÃO EXISTE, a identidade é derivada dentro da view. Duplicar essa
-- fórmula aqui é exatamente o que a regra de DRY do projeto proíbe. Os ~435 ms que sobram
-- são o preço de reusar a regra canônica em vez de copiá-la, e foi uma escolha consciente.
--
-- Paridade conferida: 119/119 linhas professor×escopo idênticas em todos os campos
-- (incluindo md5 do jsonb `detalhes`) entre esta versão e a anterior — só o plano mudou.
do $mig$
declare
  v_def text; v_novo text; v_ini int; v_fim int;
  v_marca constant text := E'        ), saidas_atribuiveis AS MATERIALIZED (';
  v_fecha constant text := E'        ), periodos_base AS (';
  v_ctes constant text :=
E'        ), saidas_brutas AS MATERIALIZED (
         SELECT m.id,
            m.unidade_id,
            m.aluno_id,
            m.professor_id,
            m.curso_id,
            m.data,
            m.motivo_saida_id,
            m.motivo
           FROM movimentacoes_admin m
          WHERE m.tipo = ANY (ARRAY[''evasao''::text, ''nao_renovacao''::text]) AND m.professor_id IS NOT NULL AND is_movimentacao_admin_retencao_valida(m.id)
        ), saidas_atribuiveis AS MATERIALIZED (
         SELECT sb.id,
            sb.unidade_id,
            idc.pessoa_chave,
            sb.professor_id,
            sb.curso_id,
            sb.data,
            mo.motivo_saida_id,
            mo.conta_score_professor
           FROM saidas_brutas sb
             JOIN vw_aluno_identidade_unidade_canonica idc ON idc.unidade_id = sb.unidade_id AND (sb.aluno_id = ANY (idc.aluno_ids_locais))
             LEFT JOIN LATERAL ( SELECT motivo.id AS motivo_saida_id,
                    motivo.conta_score_professor
                   FROM motivos_saida motivo
                  WHERE motivo.ativo = true AND (motivo.id = sb.motivo_saida_id OR sb.motivo_saida_id IS NULL AND sb.motivo IS NOT NULL AND lower(btrim(motivo.nome)) = lower(btrim(sb.motivo)))
                  ORDER BY (CASE WHEN motivo.id = sb.motivo_saida_id THEN 0 ELSE 1 END), motivo.id
                 LIMIT 1) mo ON true
          WHERE mo.motivo_saida_id IS NOT NULL
        ), periodos_base AS (';
begin
  v_def := pg_get_viewdef('public.vw_professor_periodos_baseline_v3_sombra'::regclass, true);

  if v_def like '%saidas_brutas%' then
    raise exception 'ABORTADO: a view ja tem saidas_brutas — migration ja aplicada';
  end if;

  v_ini := position(v_marca in v_def);
  v_fim := position(v_fecha in v_def);
  if v_ini = 0 or v_fim = 0 or v_fim <= v_ini then
    raise exception 'ABORTADO: nao localizei o bloco de CTEs (ini=%, fim=%)', v_ini, v_fim;
  end if;
  if (length(v_def) - length(replace(v_def, v_fecha, ''))) / length(v_fecha) <> 1 then
    raise exception 'ABORTADO: ancora periodos_base nao aparece exatamente 1x';
  end if;

  v_novo := left(v_def, v_ini - 1) || v_ctes || substr(v_def, v_fim + length(v_fecha));

  if (length(v_novo) - length(replace(v_novo, ') mv ON true', ''))) / length(') mv ON true') <> 1 then
    raise exception 'ABORTADO: o lateral mv se perdeu';
  end if;
  if v_novo not like '%FROM saidas_atribuiveis s%' then
    raise exception 'ABORTADO: o lateral nao le mais o CTE';
  end if;

  execute 'create or replace view public.vw_professor_periodos_baseline_v3_sombra as ' || v_novo;
end
$mig$;
