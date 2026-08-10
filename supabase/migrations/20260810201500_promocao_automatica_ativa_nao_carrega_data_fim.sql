-- A promocao automatica se auto-anulava, e por isso 12 vinculos VIVOS ficavam de fora da
-- retencao de 8 professores.
--
-- A revisao grava `snapshot_posterior.status_periodo = 'ativo'` com o motivo
-- "Promocao automatica: periodo ativo sustentado por jornada atual exata" -- ou seja, ela
-- CONFERIU contra a jornada do Emusys e concluiu que o vinculo esta vivo. Mas nao havia como
-- dizer "este periodo nao tem fim": `data_fim_efetiva` era
-- `COALESCE(rv.data_fim_corrigida, b.data_fim)` e `data_fim_corrigida` e NULL em todos os 12,
-- entao o COALESCE devolvia a data de fim do baseline.
--
-- Em seguida a propria regra de `publicavel` do ramo `promocao_automatica` exige
-- `status_efetivo = 'ativo' AND data_fim_efetiva IS NULL`. Resultado: ela aprovava o periodo
-- e se recusava no mesmo passo. Os 12 ficavam `publicavel = false` para sempre, contados como
-- "vinculo em revisao" e travando o fechamento do ciclo.
--
-- ⚠️ A contradicao aparecia no dado como `status_periodo = 'ativo'` COM `data_fim` preenchida
-- -- estado impossivel. Dois deles com data de fim em 2027 (Giselle Gomes Marques/Larissa em
-- 08/03/2027 e Guilherme Lauria Muniz/Matheus Sterque em 22/05/2027): isso e a ultima aula
-- AGENDADA do contrato, nao um encerramento.
--
-- CORRECAO: status e fim sao UM fato, nao dois. Se a revisao declara o periodo ativo e nao
-- corrigiu explicitamente uma data de fim, entao nao ha fim -- `data_fim` e `tipo_fim` viram
-- NULL. `data_fim_corrigida IS NULL` na guarda de proposito: se um humano digitou uma data de
-- fim, ela manda, e a gente nao a apaga.
--
-- EFEITO MEDIDO (ciclo 2026-JUN-AGO), 12 vinculos entram na base de 8 professores:
--   Gabriel Santos Teixeira   84,31 -> 84,62  (+1 vinculo)
--   Isaque Mendes da Silva    93,94 -> 94,29  (+2)
--   Larissa Bheattriz Barbosa 93,48 -> 93,62  (+1)
--   Leonardo Castro           90,48 -> 90,91  (+1)
--   Matheus Lana da Silva    100,00 -> 100,00 (+2)
--   Matheus Reis             100,00 -> 100,00 (+1)  estado_base: ok_com_pendencias -> ok
--   Matheus Sterque Mendes   100,00 -> 100,00 (+3, segue `sem_base_amostra`: 6 -> 9, precisa 10)
--   Vicente Pinheiro Neto    100,00 -> 100,00 (+1)  estado_base: ok_com_pendencias -> ok
-- Todos SOBEM ou ficam iguais -- nenhum professor perde. Maior movimento: +0,43 pp.
-- Consolidado do ciclo: publicaveis 5.404 -> 5.416, expostos 1.325 -> 1.337,
-- `vinculos_em_revisao` 61 -> 49, `ok` 8 -> 10.
--
-- ⚠️ Nenhum encerramento e afetado: os 12 sao `status_periodo = 'ativo'`, e tanto
-- `encerramentos_penalizadores` quanto `encerramentos_pos_corte_pendentes` filtram
-- `status_periodo = 'encerrado'`. So o DENOMINADOR cresce (penalizadores seguem 114).
--
-- Editada via pg_get_viewdef + replace com guarda de unicidade (padrao do projeto).
-- `create or replace view` preserva a ACL -- conferido depois: `{postgres=arwdDxtm, service_role=r}`.
do $mig$
declare
  v_def text;
  v_novo text;
  v_de_datafim constant text := E'            COALESCE(rv.data_fim_corrigida, b.data_fim) AS data_fim_efetiva,\n';
  v_para_datafim constant text :=
      E'                CASE\n'
   || E'                    WHEN (rv.decisao = ANY (ARRAY[''aprovado''::text, ''corrigido''::text]))\n'
   || E'                      AND (rv.snapshot_posterior ->> ''status_periodo''::text) = ''ativo''::text\n'
   || E'                      AND rv.data_fim_corrigida IS NULL THEN NULL::timestamptz\n'
   || E'                    ELSE COALESCE(rv.data_fim_corrigida, b.data_fim)\n'
   || E'                END AS data_fim_efetiva,\n';
  v_de_tipofim constant text :=
      E'        CASE\n'
   || E'            WHEN (decisao = ANY (ARRAY[''aprovado''::text, ''corrigido''::text])) AND NULLIF(snapshot_posterior ->> ''tipo_fim''::text, ''''::text) IS NOT NULL THEN snapshot_posterior ->> ''tipo_fim''::text\n'
   || E'            ELSE tipo_fim\n'
   || E'        END AS tipo_fim,\n';
  v_para_tipofim constant text :=
      E'        CASE\n'
   || E'            WHEN status_efetivo = ''ativo''::text AND data_fim_efetiva IS NULL THEN NULL::text\n'
   || E'            WHEN (decisao = ANY (ARRAY[''aprovado''::text, ''corrigido''::text])) AND NULLIF(snapshot_posterior ->> ''tipo_fim''::text, ''''::text) IS NOT NULL THEN snapshot_posterior ->> ''tipo_fim''::text\n'
   || E'            ELSE tipo_fim\n'
   || E'        END AS tipo_fim,\n';
  v_antes_publicaveis int;
  v_depois_publicaveis int;
  v_antes_inconsistentes int;
  v_depois_inconsistentes int;
begin
  select count(*) filter (where publicavel),
         count(*) filter (where status_periodo = 'ativo' and data_fim is not null)
    into v_antes_publicaveis, v_antes_inconsistentes
    from public.vw_professor_periodos_efetivos_v3_sombra;

  if v_antes_inconsistentes <> 12 then
    raise exception 'ABORTADO: esperava 12 periodos ativos com data_fim, achei %', v_antes_inconsistentes;
  end if;

  v_def := pg_get_viewdef('public.vw_professor_periodos_efetivos_v3_sombra'::regclass, true);

  if (length(v_def) - length(replace(v_def, v_de_datafim, ''))) / length(v_de_datafim) <> 1
     or (length(v_def) - length(replace(v_def, v_de_tipofim, ''))) / length(v_de_tipofim) <> 1 then
    raise exception 'ABORTADO: ancoras nao bateram exatamente 1x; a view mudou desde a leitura';
  end if;

  v_novo := replace(v_def, v_de_datafim, v_para_datafim);
  v_novo := replace(v_novo, v_de_tipofim, v_para_tipofim);

  execute 'create or replace view public.vw_professor_periodos_efetivos_v3_sombra as ' || v_novo;

  select count(*) filter (where publicavel),
         count(*) filter (where status_periodo = 'ativo' and data_fim is not null)
    into v_depois_publicaveis, v_depois_inconsistentes
    from public.vw_professor_periodos_efetivos_v3_sombra;

  if v_depois_inconsistentes <> 0 then
    raise exception 'ABORTADO: ainda sobram % periodos ativos com data_fim', v_depois_inconsistentes;
  end if;

  if v_depois_publicaveis <> v_antes_publicaveis + 12 then
    raise exception 'ABORTADO: publicaveis foram de % para %, esperava +12',
      v_antes_publicaveis, v_depois_publicaveis;
  end if;

  raise notice 'publicaveis % -> %; inconsistentes % -> 0',
    v_antes_publicaveis, v_depois_publicaveis, v_antes_inconsistentes;
end
$mig$;
