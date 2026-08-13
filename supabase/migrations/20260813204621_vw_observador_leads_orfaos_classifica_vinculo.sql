-- v2 da vw_observador_leads_orfaos: separa PERDA de VINCULO FALTANDO.
--
-- DROP + CREATE porque `create or replace view` nao permite mudar nome/ordem de coluna.
-- Seguro: a v1 (20260813204146) tinha minutos de vida e nenhum consumidor.
--
-- POR QUE A v1 NAO SERVIA
-- Ela comparava so por `emusys_lead_id` e marcava como orfao TODO lead que existe na
-- base sem esse campo preenchido — o caso de quem foi criado pelo n8n antes da virada
-- de 12/08 ou recuperado no backfill. Medido em 13/08: dos 23 "orfaos" de `lead_criado`,
-- **22 existiam por telefone** e 1 era lixo de teste (`ZZTESTE OBSERVADOR V11 IGNORAR`).
-- ZERO perdas. Uma view que grita 115 quando o numero real e 0 ensina a ignorar a view.
--
-- COMO USAR
--   alerta real  -> situacao = 'perdido' AND evento = 'lead_criado'
--   passivo frio -> situacao = 'vinculo_faltando' (o lead existe; falta so o
--                   emusys_lead_id, o que enfraquece o matching futuro)
--   'perdido' em `lead_editado` normalmente e edicao de lead antigo do Emusys que nunca
--   existiu aqui — nao e perda.
--
-- Todo 'perdido' e RECUPERAVEL: o payload bruto e gravado no passo (1) do observador,
-- antes de qualquer processamento. Foi assim que o lead "Arielly" (emusys 14812) voltou
-- em 13/08 -> lead_id 13032.
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
    -- 8 digitos finais: imune a variacao de 55/DDD/9 entre o payload e a base
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

-- ALTER DEFAULT PRIVILEGES no schema public da `authenticated=arwdDxtm` a toda relacao
-- nova — inclusive VIEW. `grant select` depois NAO tira o resto. Revogar primeiro.
revoke all on public.vw_observador_leads_orfaos from public, anon, authenticated;
grant select on public.vw_observador_leads_orfaos to authenticated, service_role;

comment on view public.vw_observador_leads_orfaos is
  'Webhooks de lead recebidos pelo observador, classificados: ok (existe por emusys_lead_id), vinculo_faltando (existe por telefone, so falta o emusys_lead_id) e perdido (nao existe de jeito nenhum — payload salvo, recuperavel via upsert_lead). Alerta = situacao perdido em lead_criado.';
