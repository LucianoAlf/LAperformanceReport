-- Fix das 3 regras de classificação + schema para novas fatias + flag migracao_parcial
-- + bloco de segurança (revokes/grants das funções internas e snapshots).
--
-- Correções auditoria 2026-09-16:
--   1. ORDEM: 'inadimplente' antes de 'pouco histórico'. 'pouco histórico → não mexe'
--      só vale com 0 mensalidades pagas E matrícula < 45 dias. Com 1 mensalidade fora
--      do padrão recorrente (Pix, cheque, etc.) → migrar.
--   2. FALLBACK de fatia: nunca cair em 'pix_avulso' por padrão.
--      - 'cartao_com_falha': última mensalidade 'Cartão de Crédito' sem bandeira com
--        tarifa, mas cliente é 'migrar' (tem vencida > 5d, misturou formas, ou só 1
--        mensalidade).
--      - 'sem_historico': sem nenhum pagamento E sem forma cadastrada.
--      - 'Transferência' mapeia para 'pix_avulso'.
--   3. migracao_parcial: flag boolean. True quando Pix Automático cadastrado E
--      qtde_pix_com_tarifa > 0 (o automático cobrou de verdade pelo menos uma vez)
--      mas a categoria final é autorizacao_pendente (última mensalidade Pix sem
--      tarifa ou outra forma). Distingue "registrado mas nunca autorizado" de
--      "automático funcionou e depois caiu pra baixa manual".
--
-- Versão: 20260916160000_pix_migracao_regras_fix (banco) = este arquivo (repo).

-- ============================================================
-- 1. Alterar tabela: novas fatias + coluna migracao_parcial
-- ============================================================

ALTER TABLE public.pix_migracao_snapshot DROP CONSTRAINT IF EXISTS pix_migracao_snapshot_fatia_check;
ALTER TABLE public.pix_migracao_snapshot ADD CONSTRAINT pix_migracao_snapshot_fatia_check
  CHECK (fatia IS NULL OR fatia IN ('pix_avulso','cheque','boleto','dinheiro','cartao_avulso','cartao_com_falha','sem_historico'));

ALTER TABLE public.pix_migracao_snapshot ADD COLUMN IF NOT EXISTS migracao_parcial boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. _compute_pix_migracao_v1: versão corrigida
-- ============================================================
-- 2. Recriar _compute com novas fatias + migracao_parcial
--    (DROP necessário: o RETURNS mudou — nova coluna migracao_parcial)
-- ============================================================

DROP FUNCTION IF EXISTS public._compute_pix_migracao_v1(uuid, date);

CREATE FUNCTION public._compute_pix_migracao_v1(
  p_unidade_id uuid, p_referencia date DEFAULT NULL
)
RETURNS TABLE(
  pagador_chave text, pagador_nome text, alunos text[], matriculas bigint[],
  categoria text, fatia text, migracao_parcial boolean,
  forma_ultima_mensalidade text, formas_90d text[],
  mensalidades_pagas_90d integer, ultima_mensalidade_em date,
  forma_cadastrada text, cobranca_automatica_cadastrada text,
  migrou_em date, dado_atualizado_em timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET work_mem TO '32MB'
AS $function$
  with ref as (
    select coalesce(p_referencia, (now() at time zone 'America/Sao_Paulo')::date) as ref_date
  ),
  mat as (
    select
      m.unidade_id,
      m.emusys_matricula_id,
      m.payload_snapshot->'cobranca_automatica'->>'forma_pagamento' as ca_forma,
      m.payload_snapshot->'cobranca_automatica'->>'status'           as ca_status,
      coalesce(m.payload_snapshot->'responsavel'->>'id', m.payload_snapshot->'aluno'->>'id') as pagador_id,
      coalesce(m.payload_snapshot->'responsavel'->>'nome', m.payload_snapshot->'aluno'->>'nome') as pagador_nome,
      m.payload_snapshot->'aluno'->>'nome' as aluno_nome,
      m.payload_snapshot->'contrato_atual'->>'forma_pagamento' as contrato_forma,
      nullif(m.payload_snapshot->'contrato_atual'->>'valor_mensalidade', '')::numeric as valor_mensalidade,
      coalesce((m.payload_snapshot->'contrato_atual'->>'bolsa')::boolean, false) as bolsa,
      nullif(m.payload_snapshot->'contrato_atual'->>'data_primeira_fatura', '')::date as data_primeira_fatura,
      exists(
        select 1
        from jsonb_array_elements(
          coalesce(m.payload_snapshot->'contrato_atual'->'disciplinas', '[]'::jsonb)
        ) d
        join public.curso_emusys_depara c
          on c.unidade_id = m.unidade_id
         and c.emusys_disciplina_id::text = d->>'disciplina_id'
        join public.cursos cu on cu.id = c.curso_id
        where cu.is_projeto_banda = true
      ) as tem_banda
    from public.emusys_matriculas_estado_atual m
    cross join ref
    where m.unidade_id = p_unidade_id
      and m.status_emusys in ('ativa', 'trancada')
      and coalesce(m.payload_snapshot->'responsavel'->>'id', m.payload_snapshot->'aluno'->>'id') is not null
  ),
  pagador as (
    select
      unidade_id,
      pagador_id,
      max(pagador_nome) as pagador_nome,
      bool_or(ca_forma = 'Cartão de Crédito' and ca_status = 'A') as tem_ca_cartao,
      bool_or(ca_forma = 'Pix Automático'    and ca_status = 'A') as tem_ca_pix_auto,
      coalesce(bool_or(ca_forma = 'Pix'      and ca_status = 'A'), false) as tem_ca_pix,
      coalesce(bool_or(ca_forma = 'Boleto'   and ca_status = 'A'), false) as tem_ca_boleto,
      coalesce(bool_and(ca_forma is null or ca_forma = ''), true) as toda_ca_vazia,
      coalesce(bool_or(contrato_forma = 'Pgto Recorrente'), false) as tem_pgto_recorrente,
      bool_or(valor_mensalidade is not null and valor_mensalidade > 0) as tem_mensalidade_positiva,
      count(*) as total_matriculas,
      count(*) filter (where tem_banda) as matriculas_banda,
      max(data_primeira_fatura) as data_primeira_fatura_max,
      array_agg(distinct aluno_nome order by aluno_nome) as alunos_nomes,
      array_agg(emusys_matricula_id order by emusys_matricula_id) as matriculas_ids,
      (array_agg(contrato_forma order by case when contrato_forma = '' then 1 else 0 end, emusys_matricula_id))[1] as forma_cadastrada,
      (array_agg(ca_forma order by
        case ca_forma
          when 'Pix Automático' then 1
          when 'Cartão de Crédito' then 2
          when 'Pix' then 3
          when 'Boleto' then 4
          else 5 end,
        emusys_matricula_id)
      )[1] as ca_cadastrada
    from mat
    group by unidade_id, pagador_id
  ),
  mensalidades as (
    select
      f.unidade_id,
      f.emusys_matricula_id,
      f.payload->>'forma_pagamento_transacao' as forma,
      nullif(f.payload->>'tarifa_meio_pagamento', '')::numeric as tarifa,
      nullif(f.payload->>'valor_pago', '')::numeric as valor_pago,
      f.data_vencimento,
      f.data_pagamento,
      f.competencia
    from public.emusys_faturas f
    cross join ref
    join mat m on m.unidade_id = f.unidade_id and m.emusys_matricula_id = f.emusys_matricula_id
    where f.unidade_id = p_unidade_id
      and f.payload->>'status' = 'paga'
      and f.payload->>'numero_parcela' is not null
      and f.payload->>'numero_parcela' <> ''
      and f.data_pagamento is not null
      and f.data_pagamento >= ref.ref_date - interval '90 days'
      and f.data_pagamento <= ref.ref_date
  ),
  vencidas as (
    select
      f.unidade_id,
      f.emusys_matricula_id,
      f.data_vencimento
    from public.emusys_faturas f
    cross join ref
    join mat m on m.unidade_id = f.unidade_id and m.emusys_matricula_id = f.emusys_matricula_id
    where f.unidade_id = p_unidade_id
      and f.payload->>'status' = 'aberta'
      and f.payload->>'numero_parcela' is not null
      and f.payload->>'numero_parcela' <> ''
      and f.data_vencimento < ref.ref_date - 5
  ),
  pagador_mens as (
    select
      mat.unidade_id,
      mat.pagador_id,
      count(*)::integer as qtde_mensalidades,
      (array_agg(m.forma order by m.data_pagamento desc, m.competencia desc))[1] as ultima_forma,
      (array_agg(m.tarifa order by m.data_pagamento desc, m.competencia desc))[1] as ultima_tarifa,
      max(m.data_pagamento) as ultima_mensalidade_em,
      array_agg(distinct m.forma order by m.forma) as formas_90d,
      count(*) filter (where m.forma = 'Cartão de Crédito') as qtde_credito_sem_bandeira,
      count(*) filter (where m.forma like 'Cartão de Crédito %') as qtde_credito_com_bandeira,
      count(*) filter (where m.forma like 'Cartão de Crédito%' and coalesce(m.tarifa, 0) = 0) as qtde_credito_tarifa_zero,
      count(*) filter (where m.forma like 'Cartão de Crédito%' and m.tarifa > 0) as qtde_credito_com_tarifa,
      count(*) filter (where m.forma = 'Pix') as qtde_pix,
      count(*) filter (where m.forma = 'Pix' and m.tarifa > 0) as qtde_pix_com_tarifa,
      count(*) filter (where m.forma = 'Pix' and coalesce(m.tarifa, 0) = 0) as qtde_pix_sem_tarifa,
      count(*) filter (where m.forma = 'Cheque Pré Datado') as qtde_cheque,
      count(*) filter (where m.forma = 'Boleto') as qtde_boleto,
      count(*) filter (where m.forma = 'Dinheiro') as qtde_dinheiro,
      count(*) filter (where m.forma like 'Cartão de Débito%') as qtde_debito,
      bool_and(m.forma = 'Cartão de Crédito' and m.tarifa > 0) as toda_credito_sem_bandeira_com_tarifa,
      bool_or(m.forma is distinct from 'Cartão de Crédito' or coalesce(m.tarifa, 0) = 0) as tem_forma_fora_padrao,
      min(m.data_pagamento) filter (where m.forma = 'Pix' and m.tarifa > 0) as primeira_pix_com_tarifa
    from mensalidades m
    join mat on mat.unidade_id = m.unidade_id and mat.emusys_matricula_id = m.emusys_matricula_id
    group by mat.unidade_id, mat.pagador_id
  ),
  pagador_venc as (
    select
      mat.unidade_id,
      mat.pagador_id,
      count(*)::integer as qtde_vencidas_gt_5d
    from vencidas v
    join mat on mat.unidade_id = v.unidade_id and mat.emusys_matricula_id = v.emusys_matricula_id
    group by mat.unidade_id, mat.pagador_id
  ),
  classificado as (
    select
      p.unidade_id,
      p.pagador_id,
      p.unidade_id::text || ':' || p.pagador_id as pagador_chave,
      p.pagador_nome,
      p.alunos_nomes as alunos,
      p.matriculas_ids as matriculas,
      coalesce(pm.qtde_mensalidades, 0) as mensalidades_pagas_90d,
      pm.ultima_forma as forma_ultima_mensalidade,
      coalesce(pm.formas_90d, ARRAY[]::text[]) as formas_90d,
      pm.ultima_mensalidade_em,
      p.forma_cadastrada,
      p.ca_cadastrada as cobranca_automatica_cadastrada,
      pm.primeira_pix_com_tarifa as migrou_em,
      -- Flag: Pix Automático funcionou pelo menos uma vez mas a última veio manual/outra
      coalesce(p.tem_ca_pix_auto, false)
        and coalesce(pm.qtde_pix_com_tarifa, 0) > 0 as migracao_parcial,
      case
        -- #1 EXCEÇÃO: empresa/convênio
        when p.pagador_nome ~ '(?i)(\ysbacem\y|\yfinanceiro\y|\yltda\y|\yeireli\y)' then 'excecao'
        -- #2 NÃO PAGANTE: sem mensalidade positiva
        when not p.tem_mensalidade_positiva then 'nao_pagante'
        -- #3 JÁ MIGROU
        when p.tem_ca_pix_auto
             and coalesce(pm.ultima_forma, '') = 'Pix'
             and coalesce(pm.ultima_tarifa, 0) > 0
        then 'ja_migrou'
        -- #4 AUTORIZAÇÃO PENDENTE
        when p.tem_ca_pix_auto then 'autorizacao_pendente'
        -- #5 NÃO MEXE recorrente: 2+ mensalidades todas cartão sem bandeira com tarifa, sem vencida > 5d
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and coalesce(pm.toda_credito_sem_bandeira_com_tarifa, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        then 'nao_mexe'
        -- #6 NÃO MEXE recorrente por cadastro: 2+ mensalidades sem bandeira nem tarifa 0 nem outra forma,
        --    com ca_cartão ou Pgto Recorrente, sem vencida > 5 dias
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and (p.tem_ca_cartao or p.tem_pgto_recorrente)
             and coalesce(pm.qtde_credito_com_bandeira, 0) = 0
             and coalesce(pm.qtde_credito_tarifa_zero, 0) = 0
             and not coalesce(pm.tem_forma_fora_padrao, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        then 'nao_mexe'
        -- #7 INADIMPLENTE: 0 mensalidades pagas + matrícula ≥ 45 dias.
        --    VEM ANTES do pouco-histórico (fix 1): quem nunca pagou e o contrato já é velho
        --    não é 'cliente novo recorrente', é inadimplente — vai pra cobrança.
        when coalesce(pm.qtde_mensalidades, 0) = 0
             and p.data_primeira_fatura_max is not null
             and p.data_primeira_fatura_max < (select ref_date from ref) - 45
        then 'inadimplente'
        -- #8 NÃO MEXE pouco histórico SÓ com 0 mensalidades (fix 1) E matrícula nova (< 45d)
        --    E forma cadastrada cartão. Cliente acabou de entrar, cadastro diz cartão,
        --    ainda não tem uma mensalidade paga — assume recorrente até prova contrária.
        when coalesce(pm.qtde_mensalidades, 0) = 0
             and p.data_primeira_fatura_max is not null
             and p.data_primeira_fatura_max >= (select ref_date from ref) - 45
             and (p.tem_ca_cartao or p.tem_pgto_recorrente
                  or p.forma_cadastrada ilike '%Cartão%')
        then 'nao_mexe'
        -- #9 MIGRAR: todo o resto.
        --    Inclui: 1 mensalidade paga por forma não-cartão (foi pouco-histórico demais? fix 1
        --    diz que 1 mensalidade fora do cartão vai pra migrar).
        --    Inclui: cliente novo (< 45d) com forma cadastrada não-cartão.
        --    Inclui: cliente novo com forma vazia (sem_historico).
        else 'migrar'
      end as categoria,
      -- Fatia: lógica invertida para evitar NULL handling bug.
      -- Se o cliente NÃO é 'migrar' (match de alguma condição non-migrar) → null.
      -- Senão (é migrar) → computa fatia. NULL em condições não match → cai pra ELSE (computa).
      case
        -- non-migrar conditions (mesmas do categoria CASE #1-#8)
        when p.pagador_nome ~ '(?i)(\ysbacem\y|\yfinanceiro\y|\yltda\y|\yeireli\y)' then null
        when not p.tem_mensalidade_positiva then null
        when p.tem_ca_pix_auto then null
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and coalesce(pm.toda_credito_sem_bandeira_com_tarifa, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0 then null
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and (p.tem_ca_cartao or p.tem_pgto_recorrente)
             and coalesce(pm.qtde_credito_com_bandeira, 0) = 0
             and coalesce(pm.qtde_credito_tarifa_zero, 0) = 0
             and not coalesce(pm.tem_forma_fora_padrao, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0 then null
        when coalesce(pm.qtde_mensalidades, 0) = 0
             and p.data_primeira_fatura_max is not null
             and p.data_primeira_fatura_max < (select ref_date from ref) - 45 then null
        when coalesce(pm.qtde_mensalidades, 0) = 0
             and p.data_primeira_fatura_max is not null
             and p.data_primeira_fatura_max >= (select ref_date from ref) - 45
             and (p.tem_ca_cartao or p.tem_pgto_recorrente
                  or p.forma_cadastrada ilike '%Cartão%') then null
        -- é migrar → computa fatia (fix 2: nunca cai em 'pix_avulso' por padrão)
        else
          case
            when pm.ultima_forma is not null then
              case
                when pm.ultima_forma = 'Pix' then 'pix_avulso'
                when pm.ultima_forma like 'Transferência%' or pm.ultima_forma = 'Transferência' then 'pix_avulso'
                when pm.ultima_forma like 'Cheque%' then 'cheque'
                when pm.ultima_forma = 'Boleto' then 'boleto'
                when pm.ultima_forma = 'Dinheiro' then 'dinheiro'
                when pm.ultima_forma = 'Cartão de Crédito' and coalesce(pm.ultima_tarifa, 0) > 0 then 'cartao_com_falha'
                when pm.ultima_forma like 'Cartão de Crédito%'
                  or pm.ultima_forma like 'Cartão de Débito%'
                then 'cartao_avulso'
                else 'sem_historico'
              end
            else
              case
                when p.forma_cadastrada ilike '%Pix%' then 'pix_avulso'
                when p.forma_cadastrada ilike '%Transferência%' then 'pix_avulso'
                when p.forma_cadastrada ilike '%Cheque%' then 'cheque'
                when p.forma_cadastrada ilike '%Boleto%' then 'boleto'
                when p.forma_cadastrada ilike '%Dinheiro%' then 'dinheiro'
                when p.forma_cadastrada ilike '%Cartão%' then 'cartao_com_falha'
                else 'sem_historico'
              end
          end
      end as fatia
    from pagador p
    left join pagador_mens pm on pm.unidade_id = p.unidade_id and pm.pagador_id = p.pagador_id
    left join pagador_venc pv on pv.unidade_id = p.unidade_id and pv.pagador_id = p.pagador_id
  )
  select
    c.pagador_chave, c.pagador_nome, c.alunos, c.matriculas,
    c.categoria, c.fatia, c.migracao_parcial,
    c.forma_ultima_mensalidade, c.formas_90d,
    c.mensalidades_pagas_90d, c.ultima_mensalidade_em,
    c.forma_cadastrada, c.cobranca_automatica_cadastrada,
    c.migrou_em,
    (select max(synced_at)
     from public.emusys_faturas f2
     where f2.unidade_id = p_unidade_id
       and f2.payload->>'status' = 'paga'
       and f2.data_pagamento >= (select ref_date from ref) - interval '90 days'
    ) as dado_atualizado_em
  from classificado c
  order by c.categoria, c.fatia nulls last, c.pagador_nome;
$function$;

-- Permissões: só service_role (fix P0)
REVOKE EXECUTE ON FUNCTION public._compute_pix_migracao_v1(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compute_pix_migracao_v1(uuid, date) TO service_role;

-- ============================================================
-- 3. refresh_pix_migracao_snapshot: atualizado com nova coluna
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_pix_migracao_snapshot(
  p_unidade_id uuid, p_referencia date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
  v_ref date := coalesce(p_referencia, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if current_user not in ('service_role', 'postgres')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'papel nao autorizado para refresh de snapshot' using errcode = '42501';
  end if;
  delete from public.pix_migracao_snapshot where unidade_id = p_unidade_id and referencia = v_ref;
  insert into public.pix_migracao_snapshot (
    unidade_id, referencia, pagador_chave, pagador_nome, alunos, matriculas,
    categoria, fatia, migracao_parcial, forma_ultima_mensalidade, formas_90d,
    mensalidades_pagas_90d, ultima_mensalidade_em,
    forma_cadastrada, cobranca_automatica_cadastrada, migrou_em,
    dado_atualizado_em, atualizado_em
  )
  select p_unidade_id, v_ref, c.pagador_chave, c.pagador_nome, c.alunos, c.matriculas,
    c.categoria, c.fatia, c.migracao_parcial, c.forma_ultima_mensalidade, c.formas_90d,
    c.mensalidades_pagas_90d, c.ultima_mensalidade_em,
    c.forma_cadastrada, c.cobranca_automatica_cadastrada, c.migrou_em,
    c.dado_atualizado_em, now()
  from public._compute_pix_migracao_v1(p_unidade_id, v_ref) c;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_pix_migracao_snapshot(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_pix_migracao_snapshot(uuid, date) TO service_role;

-- ============================================================
-- 4. get_pix_migracao_v1: nova coluna migracao_parcial no retorno
-- ============================================================

-- Precisa dropar porque o RETURNS TABLE mudou (adicionou migracao_parcial)
DROP FUNCTION IF EXISTS public.get_pix_migracao_v1(uuid, text);

CREATE FUNCTION public.get_pix_migracao_v1(
  p_unidade_id uuid, p_fatia text DEFAULT NULL
)
RETURNS TABLE(
  pagador_chave text, pagador_nome text, alunos text[], matriculas bigint[],
  categoria text, fatia text, migracao_parcial boolean,
  forma_ultima_mensalidade text, formas_90d text[],
  mensalidades_pagas_90d integer, ultima_mensalidade_em date,
  forma_cadastrada text, cobranca_automatica_cadastrada text,
  migrou_em date, dado_atualizado_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_autorizado boolean := false;
  v_tem_snapshot boolean;
  v_ref date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fatia_lower text := lower(coalesce(p_fatia, ''));
begin
  if current_user in ('service_role', 'postgres')
     or coalesce(auth.role(), '') = 'service_role' then
    v_autorizado := true;
  end if;
  if not v_autorizado then
    raise exception 'papel nao autorizado para consultar migracao pix' using errcode = '42501';
  end if;
  select exists(select 1 from public.pix_migracao_snapshot s where s.unidade_id = p_unidade_id and s.referencia = v_ref limit 1) into v_tem_snapshot;
  if v_tem_snapshot then
    return query select
      s.pagador_chave, s.pagador_nome, s.alunos, s.matriculas,
      s.categoria, s.fatia, s.migracao_parcial,
      s.forma_ultima_mensalidade, s.formas_90d,
      s.mensalidades_pagas_90d, s.ultima_mensalidade_em,
      s.forma_cadastrada, s.cobranca_automatica_cadastrada,
      s.migrou_em, s.dado_atualizado_em
    from public.pix_migracao_snapshot s
    where s.unidade_id = p_unidade_id
      and s.referencia = v_ref
      and (p_fatia is null
        or (v_fatia_lower = 'autorizacao_pendente' and s.categoria = 'autorizacao_pendente')
        or (v_fatia_lower not in ('autorizacao_pendente') and s.categoria = 'migrar' and s.fatia = v_fatia_lower))
    order by s.categoria, s.fatia nulls last, s.pagador_nome;
  else
    return query select
      c.pagador_chave, c.pagador_nome, c.alunos, c.matriculas,
      c.categoria, c.fatia, c.migracao_parcial,
      c.forma_ultima_mensalidade, c.formas_90d,
      c.mensalidades_pagas_90d, c.ultima_mensalidade_em,
      c.forma_cadastrada, c.cobranca_automatica_cadastrada,
      c.migrou_em, c.dado_atualizado_em
    from public._compute_pix_migracao_v1(p_unidade_id, v_ref) c
    where p_fatia is null
      or (v_fatia_lower = 'autorizacao_pendente' and c.categoria = 'autorizacao_pendente')
      or (v_fatia_lower not in ('autorizacao_pendente') and c.categoria = 'migrar' and c.fatia = v_fatia_lower)
    order by c.categoria, c.fatia nulls last, c.pagador_nome;
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pix_migracao_v1(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pix_migracao_v1(uuid, text) TO service_role;

-- ============================================================
-- 4b. Segurança (aplicada ao banco em 16/09 via MCP, registrada aqui
--     para alinhar repo↔banco). Idempotente.
--
--     Funções INTERNAS (_compute_* e refresh_*) rodam SECURITY DEFINER
--     sem checar papel — EXECUTE para anon/authenticated expõe nomes,
--     alunos e formas de pagamento pela anon key pública do PostgREST.
--     Fechado: EXECUTE só para service_role (o postgres dono já tem).
--
--     Tabelas snapshot são internas: leitura só via RPC pública, então
--     REVOKE ALL de public/anon/authenticated.
--
--     RPCs PÚBLICAS (get_situacao_alunos_v1, _resumo_v1) mantêm o
--     contrato original: authenticated + service_role + sol_acesso_restrito.
--     get_pix_migracao_v1 é só service_role (o TOM).
-- ============================================================

REVOKE EXECUTE ON FUNCTION public._compute_pix_migracao_v1(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compute_pix_migracao_v1(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_pix_migracao_snapshot(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_pix_migracao_snapshot(uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public._compute_situacao_alunos_v1(uuid, date, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compute_situacao_alunos_v1(uuid, date, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_situacao_alunos_snapshot(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_situacao_alunos_snapshot(uuid, date) TO service_role;

REVOKE ALL ON TABLE public.pix_migracao_snapshot FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.pix_migracao_snapshot TO service_role;

REVOKE ALL ON TABLE public.situacao_alunos_snapshot FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.situacao_alunos_snapshot TO service_role;

-- Reafirma o contrato das RPCs públicas (o revoke de segurança anterior
-- tirou 'authenticated' de mais; aqui fica explícito o estado alvo).
REVOKE EXECUTE ON FUNCTION public.get_situacao_alunos_v1(uuid, date, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_situacao_alunos_resumo_v1(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_situacao_alunos_v1(uuid, date, boolean) TO authenticated, service_role, sol_acesso_restrito;
GRANT EXECUTE ON FUNCTION public.get_situacao_alunos_resumo_v1(uuid, date) TO authenticated, service_role, sol_acesso_restrito;

-- ============================================================
-- 5. Repovoar snapshots com as regras corrigidas
-- ============================================================

SELECT public.refresh_pix_migracao_snapshot('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid);
SELECT public.refresh_pix_migracao_snapshot('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid);
SELECT public.refresh_pix_migracao_snapshot('95553e96-971b-4590-a6eb-0201d013c14d'::uuid);
