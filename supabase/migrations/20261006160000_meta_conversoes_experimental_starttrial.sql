-- LAPE-62: a experimental vai ao Meta como evento PADRAO `StartTrial` ("Iniciar teste gratuito"),
-- que descreve bem uma aula experimental. Antes (migration 20261006150000) tinha nome proprio
-- `ExperimentalRealizada`, mas no teste de 06/10 o Meta ACEITOU (events_received=5) e o canal
-- "Offline" de Eventos de teste NAO exibiu os eventos de nome personalizado, mesmo com o filtro
-- "Eventos personalizados" marcado. Os de nome padrao (Compra, Programar) aparecem.
-- Nada foi enviado de verdade ainda (so eventos de teste).

create or replace view public.meta_conversoes_fila
  with (security_invoker = on) as
with meta as (
  select l.*
    from public.leads l
   where coalesce(l.arquivado, false) = false
     and (l.meta_ad_source_id is not null
          or l.meta_ctwa_clid is not null
          or l.canal_origem_id in (1, 2, 13))
)
select m.id                                    as lead_id,
       null::integer                           as aluno_id,
       'experimental'::text                    as tipo,
       'StartTrial'::text                      as event_name,
       ((m.data_experimental + coalesce(m.horario_experimental, time '12:00'))
          at time zone 'America/Sao_Paulo')    as ocorrido_em,
       null::numeric                           as valor,
       m.nome::text                            as nome,
       coalesce(nullif(m.whatsapp, ''), m.telefone)::text as telefone,
       m.email::text                           as email
  from meta m
 where m.experimental_realizada
   and m.data_experimental is not null
   and not exists (select 1 from public.meta_conversoes e
                    where e.lead_id = m.id and e.tipo = 'experimental' and e.enviado_em is not null)
union all
select m.id,
       a.id,
       'matricula',
       'Purchase',
       a.created_at,
       round(coalesce(a.valor_passaporte, 0) + coalesce(a.valor_parcela, 0) * 12, 2),
       m.nome::text,
       coalesce(nullif(m.whatsapp, ''), nullif(m.telefone, ''), a.telefone)::text,
       m.email::text
  from meta m
  join public.alunos a on a.id = m.aluno_id
 where m.converteu
   and a.arquivado_em is null
   and not exists (select 1 from public.meta_conversoes e
                    where e.tipo = 'matricula' and e.enviado_em is not null
                      and (e.lead_id = m.id or e.aluno_id = a.id));

revoke all on public.meta_conversoes_fila from anon, authenticated;
