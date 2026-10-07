-- Devolver experimental e matricula ao Meta pelo pixel, casando pelo TELEFONE (LAPE-62, 06/10/2026).
--
-- POR QUE ASSIM, E NAO PELO ctwa_clid: o retorno pelo codigo do clique (Conversions API para
-- mensagens, action_source=business_messaging) exige o numero do anuncio na Cloud API. Os anuncios
-- levam aos numeros das Milas (WAHA, WhatsApp comum) -- conferido na Graph API em 06/10: nenhuma das
-- 8 contas WhatsApp do Grupo L.A tem esses numeros na Cloud API. Decisao do Hugo: opcao 1, pixel +
-- telefone em hash. Da relatorio por campanha e publico de matriculados; NAO muda a otimizacao dos
-- conjuntos atuais, que otimizam para CONVERSATIONS.
--
-- ⚠️ ESTA MIGRATION NAO ENVIA NADA. Quem envia e a edge `enviar-conversoes-meta`, que nasce em dry run.
-- ⚠️ Evento enviado ao Meta nao se apaga. Por isso a unicidade abaixo.
--
-- Escopo: lead "do Meta" = marca de anuncio (meta_ad_source_id/meta_ctwa_clid) OU canal Instagram (1),
-- Facebook (2) ou Status do WhatsApp (13). Medido em 06/10: 155 matriculas no total, 32 nos ultimos
-- 62 dias; 67 experimentais feitas nos ultimos 62 dias (45 marcadas como feitas nao tem data e ficam fora).

create table if not exists public.meta_conversoes (
  id           bigserial primary key,
  lead_id      integer      not null references public.leads(id) on delete cascade,
  aluno_id     integer      references public.alunos(id) on delete set null,
  tipo         text         not null check (tipo in ('experimental', 'matricula')),
  event_name   text         not null,
  event_id     text         not null,
  valor        numeric(12,2),
  ocorrido_em  timestamptz  not null,
  enviado_em   timestamptz,
  tentativas   integer      not null default 0,
  ultimo_erro  text,
  resposta     jsonb,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),
  constraint meta_conversoes_unica unique (lead_id, tipo)
);

-- Dois leads (um por unidade) podem apontar para o mesmo aluno: a matricula vai uma vez so.
create unique index if not exists meta_conversoes_matricula_aluno
  on public.meta_conversoes (aluno_id) where tipo = 'matricula';

comment on table public.meta_conversoes is
  'Eventos devolvidos ao Meta (Conversions API, pixel) pela edge enviar-conversoes-meta. Uma linha por lead+tipo, so de envio REAL (o modo teste, com test_event_code, nao grava aqui). enviado_em nulo + ultimo_erro = tentou e falhou.';

alter table public.meta_conversoes enable row level security;
revoke all on public.meta_conversoes from anon, authenticated;

-- A FILA. Sem filtro de janela de proposito: quem esta velho demais aparece e e contado como
-- descartado pela edge, em vez de sumir em silencio (mesma regra da fila do Google).
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
       'Schedule'::text                        as event_name,
       -- Data da experimental + horario (BRT). Sem horario: meio-dia, para nao cair no dia anterior em UTC.
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
       -- Mesmo valor que vai ao Google: passaporte + 12 mensalidades (ver 20260918010000_google_ads_conversoes.sql).
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

comment on view public.meta_conversoes_fila is
  'Experimentais feitas e matriculas de leads do Meta que ainda nao foram devolvidas ao pixel. Fila da edge enviar-conversoes-meta. Sem filtro de janela: a edge conta quem esta fora do prazo do Meta.';

revoke all on public.meta_conversoes_fila from anon, authenticated;

-- Carimbo de cada execucao da edge (inclusive as que nao fizeram nada e as de teste/dry run).
create table if not exists public.meta_conversoes_execucao (
  id            bigserial primary key,
  run_id        text        not null,
  modo          text        not null check (modo in ('diagnostico', 'dry_run', 'teste', 'enviar')),
  iniciado_em   timestamptz not null default now(),
  terminado_em  timestamptz,
  na_fila       integer,
  elegiveis     integer,
  enviados      integer,
  falhas        integer,
  descartes     jsonb,
  lead_ids      integer[],
  resposta_meta jsonb,
  desfecho      text check (desfecho in ('ok', 'erro', 'parcial')),
  erro          text
);
comment on table public.meta_conversoes_execucao is
  'Uma linha por chamada da edge enviar-conversoes-meta. descartes = contagem por motivo; lead_ids = quem foi enviado (ou iria, no dry run). Ultima rodada: select * from meta_conversoes_execucao order by id desc limit 5;';
alter table public.meta_conversoes_execucao enable row level security;
revoke all on public.meta_conversoes_execucao from anon, authenticated;
