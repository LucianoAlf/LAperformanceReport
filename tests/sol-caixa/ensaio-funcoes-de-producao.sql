-- Definições VIVAS de produção que o replay das migrations NÃO reproduz.
-- Foto tirada em 09/09/2026 por `pg_get_functiondef` (leitura pura).
--
-- 🔴 O QUE ISTO DENUNCIA. O ledger do banco tem **2.229 migrations**; o
--    repositório tem **2.128 arquivos**. Produção está **101 migrations à
--    frente**, e a última é de hoje. Ou seja: replayar `supabase/migrations/`
--    num banco limpo NÃO reconstrói produção — e um ensaio montado assim testa
--    código que não existe em lugar nenhum.
--
-- ⚠️ MEDIDO, e o resultado é melhor do que parecia: das 14 funções da cadeia,
--    **8 são byte-idênticas** e 6 divergem. As 8 pareciam divergir por causa de
--    CRLF (os arquivos vieram do Windows via tar) — o delta era proporcional ao
--    número de LINHAS, não ao tamanho. Removendo `chr(13)`, os md5 batem.
--    Lição: diferença que cresce com a contagem de linhas é fim de linha, não
--    semântica.
--
-- ⚠️ A CAUSA DO `tipo_fatura` NULO ESTÁ AQUI, e o Alfredo apontou certo: o
--    wrapper `get_faturas_alunos_financeiro_v1` de produção COMPÕE os dois
--    enriquecimentos — chama o de lote (`_contrato_tipo_20260817`) e depois
--    aplica o de TIPO sobre `items` e sobre `reconciliation.items`. A versão que
--    o replay produz é a implementação ANTIGA, de 7.072 bytes, sem a etapa de
--    tipo. Sem tipo, a composta não acha "parcela" e recusa com
--    `composicao_exige_duas_faturas` — que era o vermelho do item 2.
--    ⚠️ Em produção não há nada a "restaurar": a composição já está lá. O que
--       falta é no REPOSITÓRIO.
--
-- ⚠️ ESTE ARQUIVO NÃO É PARA RODAR EM PRODUÇÃO. Ele existe para o banco
--    isolado. Versionar estas definições como migration é decisão separada — eu
--    não vou reconstruir 101 migrations por conta própria.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.get_faturas_alunos_financeiro_v1(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_modo_periodo text DEFAULT 'janela_3'::text, p_status text DEFAULT 'todas'::text, p_as_of_date date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );
  v_payload := jsonb_set(
    v_payload,
    '{items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload->'items', '[]'::jsonb)),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{reconciliation,items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)),
    true
  );
  return v_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sol_caixa_aluno_da_fatura_v1(p_unidade_id uuid, p_fatura_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select a.id
  from public.emusys_faturas f
  join public.alunos a
    on a.emusys_matricula_id = f.emusys_matricula_id::text
   and a.unidade_id = f.unidade_id
  where f.id = p_fatura_id
    and f.unidade_id = p_unidade_id
    and f.emusys_matricula_id is not null
  order by a.id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.sol_caixa_normalizar_competencia_v1(p_competencia text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when nullif(btrim(coalesce(p_competencia, '')), '') is null then null
    when btrim(p_competencia) ~ '^(0[1-9]|1[0-2])/[0-9]{4}$' then btrim(p_competencia)
    when btrim(p_competencia) ~ '^[0-9]{4}-(0[1-9]|1[0-2])(-[0-9]{2})?$'
      then substring(btrim(p_competencia) from 6 for 2) || '/' || substring(btrim(p_competencia) from 1 for 4)
    else null
  end;
$function$
;

-- 🔴 UM TESTE QUE IMPEDE UMA MIGRATION FUTURA DE APAGAR UMA ETAPA.
--    Foi o pedido do Alfredo, e o defeito que ele descreve é real: uma migration
--    redefiniu o wrapper e o pipeline perdeu o enriquecimento de tipo em
--    silêncio — nada quebrou, o `tipo_fatura` só passou a sair nulo, e quem
--    percebeu foi a composta recusando lançamento semanas depois.
do $guarda$
declare
  v_def text := pg_get_functiondef('public.get_faturas_alunos_financeiro_v1'::regproc);
  v_falta text[] := '{}';
begin
  if v_def not like '%financeiro_enriquecer_tipos_fatura_v1%' then
    v_falta := v_falta || 'enriquecimento de TIPO';
  end if;
  if v_def not like '%get_faturas_alunos_financeiro_v1_contrato_tipo_20260817%' then
    v_falta := v_falta || 'enriquecimento em LOTE';
  end if;
  -- o de tipo tem de rodar nos DOIS arrays: `items` e `reconciliation.items`
  if (length(v_def) - length(replace(v_def, 'financeiro_enriquecer_tipos_fatura_v1', '')))
     / length('financeiro_enriquecer_tipos_fatura_v1') < 2 then
    v_falta := v_falta || 'enriquecimento de TIPO em reconciliation.items';
  end if;
  if array_length(v_falta,1) > 0 then
    raise exception 'PIPELINE INCOMPLETO em get_faturas_alunos_financeiro_v1 — falta: %',
      array_to_string(v_falta, ', ');
  end if;
  raise notice 'pipeline de enriquecimento: lote + tipo (items e reconciliation) — ok';
end $guarda$;
