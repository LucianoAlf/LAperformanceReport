-- RPC get_pix_migracao_v1: levantamento de migração para Pix Automático por cliente pagante.
--
-- Regra final v6 (auditoria cruzada LA Report × Super Folha) + 3 ajustes do Alf:
--   1. Sem nenhum pagamento de mensalidade em 90 dias → NÃO entra na migração
--      (inadimplência, cobrança primeiro). Exceção: matrícula < 45 dias entra pela
--      forma cadastrada.
--   2. Cartão sem bandeira e com tarifa pago DEPOIS do vencimento continua
--      recorrente (retentativa da operadora). Só migra por cartão quem tem
--      bandeira, tarifa 0, ou pagou mensalidade por outra forma.
--   3. Aluno TRANCADO que continua pagando entra no universo (igual ao ativo).
--
-- Contagem por CLIENTE PAGANTE (responsável; senão o próprio aluno adulto).
-- Banda funde no cliente. Não pagante e exceção vêm com categoria própria.
--
-- Arquitetura: snapshot por unidade/dia atualizado por cron horário (o espelho
-- de faturas é diário). A RPC só LÊ o snapshot. Fallback de cálculo só se o
-- snapshot do dia não existir. Data de referência = São Paulo (não UTC) para
-- não virar o dia às 21:00.
--
-- Permissão: service_role (o TOM), igual à get_situacao_alunos_v1.
-- Sem telefone, CPF, e-mail ou endereço. Só nomes.

-- ============================================================
-- 1. Tabela de snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pix_migracao_snapshot (
  unidade_id uuid NOT NULL,
  referencia date NOT NULL,
  pagador_chave text NOT NULL,
  pagador_nome text,
  alunos text[],
  matriculas bigint[],
  categoria text NOT NULL CHECK (
    categoria IN ('nao_mexe', 'ja_migrou', 'autorizacao_pendente', 'migrar',
                  'inadimplente', 'nao_pagante', 'excecao')
  ),
  fatia text CHECK (
    fatia IS NULL OR fatia IN ('pix_avulso', 'cheque', 'boleto', 'dinheiro', 'cartao_avulso')
  ),
  forma_ultima_mensalidade text,
  formas_90d text[],
  mensalidades_pagas_90d integer,
  ultima_mensalidade_em date,
  forma_cadastrada text,
  cobranca_automatica_cadastrada text,
  migrou_em date,
  dado_atualizado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, referencia, pagador_chave)
);

CREATE INDEX IF NOT EXISTS idx_pix_migracao_snapshot_unidade_ref
  ON public.pix_migracao_snapshot (unidade_id, referencia);

CREATE INDEX IF NOT EXISTS idx_pix_migracao_snapshot_fatia
  ON public.pix_migracao_snapshot (unidade_id, referencia, categoria, fatia)
  WHERE categoria = 'migrar';

ALTER TABLE public.pix_migracao_snapshot ENABLE ROW LEVEL SECURITY;
-- service_role bypassa RLS; a RPC é SECURITY DEFINER com checagem de permissão.

REVOKE ALL ON TABLE public.pix_migracao_snapshot FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.pix_migracao_snapshot TO service_role;

-- ============================================================
-- 2. Função _compute (cálculo completo — a regra v6 + 3 ajustes)
-- ============================================================

CREATE OR REPLACE FUNCTION public._compute_pix_migracao_v1(
  p_unidade_id uuid, p_referencia date DEFAULT NULL
)
RETURNS TABLE(
  pagador_chave text,
  pagador_nome text,
  alunos text[],
  matriculas bigint[],
  categoria text,
  fatia text,
  forma_ultima_mensalidade text,
  formas_90d text[],
  mensalidades_pagas_90d integer,
  ultima_mensalidade_em date,
  forma_cadastrada text,
  cobranca_automatica_cadastrada text,
  migrou_em date,
  dado_atualizado_em timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET work_mem TO '32MB'
AS $function$
  with ref as (
    select coalesce(p_referencia, (now() at time zone 'America/Sao_Paulo')::date) as ref_date
  ),
  -- ──────────────────────────────────────────────────────────
  -- Matrículas ativas E trancadas (ajuste 3: trancado que paga entra)
  -- ──────────────────────────────────────────────────────────
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
  -- ──────────────────────────────────────────────────────────
  -- Agregação por pagador (nível família — banda funde no cliente)
  -- ──────────────────────────────────────────────────────────
  pagador as (
    select
      unidade_id,
      pagador_id,
      max(pagador_nome) as pagador_nome,
      -- cobrança automática em nível família (qualquer matrícula)
      bool_or(ca_forma = 'Cartão de Crédito' and ca_status = 'A') as tem_ca_cartao,
      bool_or(ca_forma = 'Pix Automático'    and ca_status = 'A') as tem_ca_pix_auto,
      coalesce(bool_or(ca_forma = 'Pix'      and ca_status = 'A'), false) as tem_ca_pix,
      coalesce(bool_or(ca_forma = 'Boleto'   and ca_status = 'A'), false) as tem_ca_boleto,
      coalesce(bool_and(ca_forma is null or ca_forma = ''), true) as toda_ca_vazia,
      coalesce(bool_or(contrato_forma = 'Pgto Recorrente'), false) as tem_pgto_recorrente,
      -- pagante?
      bool_or(valor_mensalidade is not null and valor_mensalidade > 0) as tem_mensalidade_positiva,
      -- matrículas
      count(*) as total_matriculas,
      count(*) filter (where tem_banda) as matriculas_banda,
      -- data da primeira fatura mais recente (proxy para matrícula nova)
      max(data_primeira_fatura) as data_primeira_fatura_max,
      -- nomes e IDs
      array_agg(distinct aluno_nome order by aluno_nome) as alunos_nomes,
      array_agg(emusys_matricula_id order by emusys_matricula_id) as matriculas_ids,
      -- forma cadastrada mais comum (primeira não-vazia)
      (array_agg(contrato_forma order by case when contrato_forma = '' then 1 else 0 end, emusys_matricula_id))[1] as forma_cadastrada,
      -- cobrança automática cadastrada (prioridade: Pix Auto > Cartão > outros)
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
  -- ──────────────────────────────────────────────────────────
  -- Mensalidades pagas na janela de 90 dias (numero_parcela preenchido)
  -- ──────────────────────────────────────────────────────────
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
  -- ──────────────────────────────────────────────────────────
  -- Faturas vencidas em aberto há mais de 5 dias (mensalidades)
  -- ──────────────────────────────────────────────────────────
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
  -- ──────────────────────────────────────────────────────────
  -- Agregação de mensalidades por pagador
  -- ──────────────────────────────────────────────────────────
  pagador_mens as (
    select
      mat.unidade_id,
      mat.pagador_id,
      count(*)::integer as qtde_mensalidades,
      -- última mensalidade (mais recente por data_pagamento)
      (array_agg(m.forma order by m.data_pagamento desc, m.competencia desc))[1] as ultima_forma,
      (array_agg(m.tarifa order by m.data_pagamento desc, m.competencia desc))[1] as ultima_tarifa,
      max(m.data_pagamento) as ultima_mensalidade_em,
      -- todas as formas distintas
      array_agg(distinct m.forma order by m.forma) as formas_90d,
      -- sinais para classificação
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
      -- todas as mensalidades são cartão sem bandeira com tarifa? (ajuste 2: depois do vencimento ok)
      bool_and(m.forma = 'Cartão de Crédito' and m.tarifa > 0) as toda_credito_sem_bandeira_com_tarifa,
      -- tem alguma forma fora do padrão recorrente?
      bool_or(m.forma is distinct from 'Cartão de Crédito' or coalesce(m.tarifa, 0) = 0) as tem_forma_fora_padrao,
      -- primeira mensalidade Pix com tarifa (para migrou_em)
      min(m.data_pagamento) filter (where m.forma = 'Pix' and m.tarifa > 0) as primeira_pix_com_tarifa
    from mensalidades m
    join mat on mat.unidade_id = m.unidade_id and mat.emusys_matricula_id = m.emusys_matricula_id
    group by mat.unidade_id, mat.pagador_id
  ),
  -- ──────────────────────────────────────────────────────────
  -- Vencidas por pagador
  -- ──────────────────────────────────────────────────────────
  pagador_venc as (
    select
      mat.unidade_id,
      mat.pagador_id,
      count(*)::integer as qtde_vencidas_gt_5d
    from vencidas v
    join mat on mat.unidade_id = v.unidade_id and mat.emusys_matricula_id = v.emusys_matricula_id
    group by mat.unidade_id, mat.pagador_id
  ),
  -- ──────────────────────────────────────────────────────────
  -- Classificação final
  -- ──────────────────────────────────────────────────────────
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
      case
        -- EXCEÇÃO: empresa/convênio (Sbacem, Ltda, S.A., etc.)
        when p.pagador_nome ~ '(?i)(\ysbacem\y|\yfinanceiro\y|\yltda\y|\yeireli\y)' then 'excecao'
        -- NÃO PAGANTE: sem mensalidade positiva (bolsa integral / mensalidade 0 / sem fatura)
        when not p.tem_mensalidade_positiva then 'nao_pagante'
        -- JÁ MIGROU: Pix Automático cadastrado E última mensalidade Pix com tarifa
        when p.tem_ca_pix_auto
             and coalesce(pm.ultima_forma, '') = 'Pix'
             and coalesce(pm.ultima_tarifa, 0) > 0
        then 'ja_migrou'
        -- AUTORIZAÇÃO PENDENTE: Pix Automático cadastrado mas última mensalidade
        -- NÃO veio Pix com tarifa (Pix sem tarifa = baixa manual, ou outra forma)
        when p.tem_ca_pix_auto then 'autorizacao_pendente'
        -- NÃO MEXE: 2+ mensalidades, todas no cartão sem bandeira com tarifa,
        -- sem vencida > 5 dias (ajuste 2: pago depois do vencimento ok)
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and coalesce(pm.toda_credito_sem_bandeira_com_tarifa, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        then 'nao_mexe'
        -- NÃO MEXE: 2+ mensalidades sem bandeira nem tarifa 0, com ca_cartão ou Pgto Recorrente,
        -- sem vencida > 5 dias (cobrança automática vale para o pagador, não para a matrícula)
        when coalesce(pm.qtde_mensalidades, 0) >= 2
             and (p.tem_ca_cartao or p.tem_pgto_recorrente)
             and coalesce(pm.qtde_credito_com_bandeira, 0) = 0
             and coalesce(pm.qtde_credito_tarifa_zero, 0) = 0
             and not coalesce(pm.tem_forma_fora_padrao, false)
             and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        then 'nao_mexe'
        -- NÃO MEXE: pouco histórico (0-1 mensalidades) com forma cadastrada crédito
        -- (cobranca_automatica = Cartão OU contrato Pgto Recorrente OU contrato forma_pagamento contém "Cartão")
        when coalesce(pm.qtde_mensalidades, 0) < 2
             and (p.tem_ca_cartao or p.tem_pgto_recorrente
                  or p.forma_cadastrada ilike '%Cartão%')
        then 'nao_mexe'
        -- INADIMPLENTE: sem pagamento de mensalidade em 90 dias e matrícula >= 45 dias
        -- (ajuste 1: é cobrança primeiro, não migração)
        when coalesce(pm.qtde_mensalidades, 0) = 0
             and p.data_primeira_fatura_max is not null
             and p.data_primeira_fatura_max < (select ref_date from ref) - 45
        then 'inadimplente'
        -- MIGRAR: todo o resto (incluindo matrícula nova < 45 dias sem pagamento)
        else 'migrar'
      end as categoria,
      -- Fatia: só para 'migrar'. Base: última mensalidade (ou forma cadastrada se sem pagamento)
      case
        when (
          coalesce(pm.qtde_mensalidades, 0) >= 2
          and coalesce(pm.toda_credito_sem_bandeira_com_tarifa, false)
          and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        ) or (
          coalesce(pm.qtde_mensalidades, 0) >= 2
          and (p.tem_ca_cartao or p.tem_pgto_recorrente)
          and coalesce(pm.qtde_credito_com_bandeira, 0) = 0
          and coalesce(pm.qtde_credito_tarifa_zero, 0) = 0
          and not coalesce(pm.tem_forma_fora_padrao, false)
          and coalesce(pv.qtde_vencidas_gt_5d, 0) = 0
        ) or (
          coalesce(pm.qtde_mensalidades, 0) < 2
          and (p.tem_ca_cartao or p.tem_pgto_recorrente
               or p.forma_cadastrada ilike '%Cartão%')
        ) or p.tem_ca_pix_auto
          or not p.tem_mensalidade_positiva
          or p.pagador_nome ~ '(?i)(\ysbacem\y|\yfinanceiro\y|\yltda\y|\yeireli\y)'
          or (
            coalesce(pm.qtde_mensalidades, 0) = 0
            and p.data_primeira_fatura_max is not null
            and p.data_primeira_fatura_max < (select ref_date from ref) - 45
          )
        then null  -- não é 'migrar'
        else
          case
            -- Última mensalidade existe → usa ela
            when pm.ultima_forma is not null then
              case
                when pm.ultima_forma = 'Pix' then 'pix_avulso'
                when pm.ultima_forma like 'Cheque%' then 'cheque'
                when pm.ultima_forma = 'Boleto' then 'boleto'
                when pm.ultima_forma = 'Dinheiro' then 'dinheiro'
                when pm.ultima_forma like 'Cartão de Crédito %'
                  or pm.ultima_forma like 'Cartão de Débito%'
                  or coalesce(pm.ultima_tarifa, 0) = 0
                then 'cartao_avulso'
                else 'pix_avulso'  -- fallback
              end
            -- Sem mensalidade (matrícula nova < 45 dias) → usa forma cadastrada
            else
              case
                when p.forma_cadastrada ilike '%Pix%' then 'pix_avulso'
                when p.forma_cadastrada ilike '%Cheque%' then 'cheque'
                when p.forma_cadastrada ilike '%Boleto%' then 'boleto'
                when p.forma_cadastrada ilike '%Dinheiro%' then 'dinheiro'
                when p.forma_cadastrada ilike '%Cartão%' then 'cartao_avulso'
                else 'pix_avulso'  -- fallback mais comum
              end
          end
      end as fatia
    from pagador p
    left join pagador_mens pm on pm.unidade_id = p.unidade_id and pm.pagador_id = p.pagador_id
    left join pagador_venc pv on pv.unidade_id = p.unidade_id and pv.pagador_id = p.pagador_id
  )
  select
    c.pagador_chave,
    c.pagador_nome,
    c.alunos,
    c.matriculas,
    c.categoria,
    c.fatia,
    c.forma_ultima_mensalidade,
    c.formas_90d,
    c.mensalidades_pagas_90d,
    c.ultima_mensalidade_em,
    c.forma_cadastrada,
    c.cobranca_automatica_cadastrada,
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

-- ============================================================
-- 3. Função de refresh (chama _compute e faz upsert no snapshot)
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
  -- Só service_role ou postgres podem rodar o refresh
  if current_user not in ('service_role', 'postgres')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'papel nao autorizado para refresh de snapshot' using errcode = '42501';
  end if;

  -- Upsert atômico: insere todas as linhas calculadas, substituindo as antigas
  delete from public.pix_migracao_snapshot
  where unidade_id = p_unidade_id and referencia = v_ref;

  insert into public.pix_migracao_snapshot (
    unidade_id, referencia, pagador_chave, pagador_nome, alunos, matriculas,
    categoria, fatia, forma_ultima_mensalidade, formas_90d,
    mensalidades_pagas_90d, ultima_mensalidade_em,
    forma_cadastrada, cobranca_automatica_cadastrada, migrou_em,
    dado_atualizado_em, atualizado_em
  )
  select
    p_unidade_id, v_ref, c.pagador_chave, c.pagador_nome, c.alunos, c.matriculas,
    c.categoria, c.fatia, c.forma_ultima_mensalidade, c.formas_90d,
    c.mensalidades_pagas_90d, c.ultima_mensalidade_em,
    c.forma_cadastrada, c.cobranca_automatica_cadastrada, c.migrou_em,
    c.dado_atualizado_em, now()
  from public._compute_pix_migracao_v1(p_unidade_id, v_ref) c;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ============================================================
-- 4. RPC: lê do snapshot, filtra por p_fatia.
--    Fallback para _compute se snapshot ausente (transição segura).
--    p_fatia aceita: 'pix_avulso' | 'cheque' | 'boleto' | 'dinheiro' |
--       'cartao_avulso' | 'autorizacao_pendente' (filtro por categoria)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pix_migracao_v1(
  p_unidade_id uuid, p_fatia text DEFAULT NULL
)
RETURNS TABLE(
  pagador_chave text,
  pagador_nome text,
  alunos text[],
  matriculas bigint[],
  categoria text,
  fatia text,
  forma_ultima_mensalidade text,
  formas_90d text[],
  mensalidades_pagas_90d integer,
  ultima_mensalidade_em date,
  forma_cadastrada text,
  cobranca_automatica_cadastrada text,
  migrou_em date,
  dado_atualizado_em timestamptz
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
  -- Autorização: só service_role (o TOM), igual à get_situacao_alunos_v1
  if current_user in ('service_role', 'postgres')
     or coalesce(auth.role(), '') = 'service_role' then
    v_autorizado := true;
  end if;

  if not v_autorizado then
    raise exception 'papel nao autorizado para consultar migracao pix' using errcode = '42501';
  end if;

  -- Verifica se snapshot existe para esta unidade/referencia
  select exists(
    select 1 from public.pix_migracao_snapshot s
    where s.unidade_id = p_unidade_id and s.referencia = v_ref
    limit 1
  ) into v_tem_snapshot;

  if v_tem_snapshot then
    -- Caminho quente: lê do snapshot (SELECT simples, zero contenção)
    return query
    select s.pagador_chave, s.pagador_nome, s.alunos, s.matriculas,
           s.categoria, s.fatia, s.forma_ultima_mensalidade, s.formas_90d,
           s.mensalidades_pagas_90d, s.ultima_mensalidade_em,
           s.forma_cadastrada, s.cobranca_automatica_cadastrada, s.migrou_em,
           s.dado_atualizado_em
    from public.pix_migracao_snapshot s
    where s.unidade_id = p_unidade_id
      and s.referencia = v_ref
      and (
        p_fatia is null
        or (v_fatia_lower = 'autorizacao_pendente' and s.categoria = 'autorizacao_pendente')
        or (v_fatia_lower not in ('autorizacao_pendente') and s.categoria = 'migrar' and s.fatia = v_fatia_lower)
      )
    order by s.categoria, s.fatia nulls last, s.pagador_nome;
  else
    -- Fallback: cálculo ao vivo (snapshot ausente — primeira chamada ou cron falhou)
    return query
    select c.pagador_chave, c.pagador_nome, c.alunos, c.matriculas,
           c.categoria, c.fatia, c.forma_ultima_mensalidade, c.formas_90d,
           c.mensalidades_pagas_90d, c.ultima_mensalidade_em,
           c.forma_cadastrada, c.cobranca_automatica_cadastrada, c.migrou_em,
           c.dado_atualizado_em
    from public._compute_pix_migracao_v1(p_unidade_id, v_ref) c
    where p_fatia is null
      or (v_fatia_lower = 'autorizacao_pendente' and c.categoria = 'autorizacao_pendente')
      or (v_fatia_lower not in ('autorizacao_pendente') and c.categoria = 'migrar' and c.fatia = v_fatia_lower)
    order by c.categoria, c.fatia nulls last, c.pagador_nome;
  end if;
end;
$function$;

-- ============================================================
-- 5. Cron: refresh das 3 unidades a cada hora
--    (o espelho de faturas é diário; horário é suficiente)
-- ============================================================

-- Limpa schedules antigos se re-aplicado
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-pix-migracao-cg');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-pix-migracao-barra');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-pix-migracao-recreio');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Unidade CG: 2ec861f6-023f-4d7b-9927-3960ad8c2a92
SELECT cron.schedule(
  'refresh-pix-migracao-cg',
  '0 * * * *',
  $$select public.refresh_pix_migracao_snapshot('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid)$$
);

-- Unidade Barra: 368d47f5-2d88-4475-bc14-ba084a9a348e
SELECT cron.schedule(
  'refresh-pix-migracao-barra',
  '5 * * * *',
  $$select public.refresh_pix_migracao_snapshot('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid)$$
);

-- Unidade Recreio: 95553e96-971b-4590-a6eb-0201d013c14d
SELECT cron.schedule(
  'refresh-pix-migracao-recreio',
  '10 * * * *',
  $$select public.refresh_pix_migracao_snapshot('95553e96-971b-4590-a6eb-0201d013c14d'::uuid)$$
);

-- ============================================================
-- 6. Populate inicial do snapshot para as 3 unidades
-- ============================================================

SELECT public.refresh_pix_migracao_snapshot('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid);
SELECT public.refresh_pix_migracao_snapshot('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid);
SELECT public.refresh_pix_migracao_snapshot('95553e96-971b-4590-a6eb-0201d013c14d'::uuid);
