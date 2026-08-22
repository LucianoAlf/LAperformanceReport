-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- v2: separa PERDA de VINCULO FALTANDO. DROP porque create-or-replace nao muda colunas.
-- Seguro: view criada minutos antes, nenhum consumidor.
--
-- A v1 comparava so por `emusys_lead_id` e marcava como orfao todo lead que existe na
-- base sem esse campo preenchido — quem foi criado pelo n8n antes da virada ou
-- recuperado no backfill de 12/08. Medido em 13/08: dos 23 "orfaos" de lead_criado, 22
-- existiam por telefone e 1 era lixo de teste. ZERO perdas. Uma view que grita 115
-- quando o numero real e 0 ensina a ignorar a view.
drop view if exists public.vw_observador_leads_orfaos;

create view public.vw_observador_leads_orfaos as
with base as (
  select
    l.id as automacao_log_id,
    l.created_at,
    (l.created_at at time zone 'America/Sao_Paulo') as recebido_brt,
    l.evento,
    nullif(regexp_replace(coalesce(l.payload_bruto->'lead'->>'id',''), '\D', '', 'g'), '')::bigint as emusys_lead_id,
    l.payload_bruto->'lead'->>'nome_aluno'            as nome,
    l.payload_bruto->'lead'->>'telefone'              as telefone_bruto,
    l.payload_bruto->'lead'->>'email'                 as email,
    l.payload_bruto->>'escola_id'                     as escola_id,
    l.payload_bruto->'lead'->>'instrumento'           as instrumento,
    l.payload_bruto->'lead'->>'data_hora_criacao'     as data_hora_criacao,
    l.payload_bruto->'lead'->>'data_nascimento_aluno' as data_nascimento,
    case l.payload_bruto->>'escola_id'
      when '39'  then '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid
      when '40'  then '95553e96-971b-4590-a6eb-0201d013c14d'::uuid
      when '316' then '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid
    end as unidade_id,
    -- 8 digitos finais: imune a variacao de 55/DDD/9 entre payload e base
    nullif(right(regexp_replace(coalesce(l.payload_bruto->'lead'->>'telefone',''),'\D','','g'), 8),'') as fone8
  from automacao_log l
  where l.acao = 'webhook_observado_direto'
    and l.evento in ('lead_criado', 'lead_editado')
    and l.payload_bruto->'lead'->>'id' ~ '^\d+$'
)
select b.*,
       (select l.id from leads l
         where b.fone8 is not null
           and right(regexp_replace(coalesce(l.telefone,''),'\D','','g'),8) = b.fone8
           and (b.unidade_id is null or l.unidade_id = b.unidade_id)
         order by l.id limit 1) as lead_id_por_telefone,
       case
         when exists (select 1 from leads l where l.emusys_lead_id = b.emusys_lead_id)
           then 'ok'
         when exists (select 1 from leads l
                       where b.fone8 is not null
                         and right(regexp_replace(coalesce(l.telefone,''),'\D','','g'),8) = b.fone8
                         and (b.unidade_id is null or l.unidade_id = b.unidade_id))
           then 'vinculo_faltando'
         else 'perdido'
       end as situacao
from base b;

revoke all on public.vw_observador_leads_orfaos from public, anon, authenticated;
grant select on public.vw_observador_leads_orfaos to authenticated, service_role;

comment on view public.vw_observador_leads_orfaos is
  'Webhooks de lead recebidos pelo observador, classificados: ok (existe por emusys_lead_id), vinculo_faltando (existe por telefone, so falta o emusys_lead_id) e perdido (nao existe de jeito nenhum — payload salvo, recuperavel via upsert_lead). Alerta = situacao perdido em lead_criado.';
