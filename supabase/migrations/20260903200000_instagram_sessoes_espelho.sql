-- Mapa de Sinais / A1 (fatia do Instagram).
--
-- O Instagram da LA NUNCA passou pelo Chatwoot — a inbox 209 está morta desde
-- 21/07/2026 (85 conversas na vida inteira, zero em 30 dias). O canal real é
-- uma bridge própria na la-hq: `instagram-comments-bridge.js`, systemd
-- `instagram-comments-bridge.service`, porta 3212, tunnel Cloudflare em
-- ig-webhook.maestrosdagestao.com.br. Meta → bridge → Graph API, direto.
--
-- E ele é MOVIMENTADO: 516 eventos úteis só em agosto/2026, nas DUAS contas
-- (@lamusickids 264, @lamusicschool 252). Só que o estado inteiro mora em
-- `/home/mila/.openclaw/workspace/memory/ig_sessions.json` — 141 kB de arquivo
-- solto num VPS, sem banco, sem backup e invisível para qualquer relatório.
--
-- Medido em 03/09/2026 sobre as 104 sessões do arquivo:
--   transferidas 54 | paradas no meio 50 (ask_name 23, ask_phone 13, ask_unit 13)
--   com telefone 54 | com interesse declarado 59
--   contas: @lamusickids 69, @lamusicschool 35
--   histórico: mediana de 6 mensagens por sessão, máximo 14
--
-- E o funil credita errado: dos leads que a bridge transferiu, **16 estão sem
-- origem** e 5 aparecem como "Visita/Placa" ou "Google". O canal produz e o
-- dashboard não sabe.

create table if not exists public.instagram_sessoes (
  ig_user_id           text not null,
  sender_id            text not null,
  conta                text not null,
  sender_name          text,
  interesse            text,
  estagio              text not null,
  unidade_nome         text,
  unidade_id           uuid references public.unidades(id),
  telefone             text,
  -- Chave canônica de telefone do projeto (IMMUTABLE, por isso pode ser gerada).
  -- É o que casa com `leads`/`alunos` e com radar_resolver_entidade_por_telefone.
  telefone_chave       text generated always as (
                         public.fn_normalizar_telefone_br_key(telefone)
                       ) stored,
  transferido          boolean not null default false,
  iniciada_em          timestamptz not null,
  ultima_atividade_em  timestamptz not null,
  -- a conversa, como a bridge guarda: [{role, content}]
  historico            jsonb not null default '[]'::jsonb,
  capturado_em         timestamptz not null default now(),
  primary key (ig_user_id, sender_id)
);

comment on table public.instagram_sessoes is
  'Espelho das sessões da bridge de Instagram (la-hq, instagram-comments-bridge.js). Uma linha por (conta, pessoa). Alimentado pela edge ingerir-instagram-sessoes; a bridge segue sendo a fonte de verdade viva — isto é foto para leitura, relatório e Mapa de Sinais.';
comment on column public.instagram_sessoes.estagio is
  'Onde a qualificação parou: done | ask_name | ask_phone | ask_unit. Diferente de done = lead que respondeu a DM e morreu no meio do funil.';
comment on column public.instagram_sessoes.transferido is
  'A bridge passou o contato para o WhatsApp/Chatwoot. Medido em 03/09: 54 de 104.';
comment on column public.instagram_sessoes.telefone_chave is
  'Coluna GERADA por fn_normalizar_telefone_br_key — não preencher à mão. É a junção com leads/alunos.';

create index if not exists idx_instagram_sessoes_telefone
  on public.instagram_sessoes (telefone_chave) where telefone_chave is not null;
create index if not exists idx_instagram_sessoes_atividade
  on public.instagram_sessoes (ultima_atividade_em desc);
create index if not exists idx_instagram_sessoes_parada
  on public.instagram_sessoes (estagio) where transferido = false;

alter table public.instagram_sessoes enable row level security;

-- ACL: ALTER DEFAULT PRIVILEGES neste schema dá `authenticated=arwdDxtm` a toda
-- relação nova. A tabela guarda conversa de pessoa real — revoke nominal, e
-- leitura só para quem já enxerga dado de aluno.
revoke all on public.instagram_sessoes from public, anon, authenticated;
grant select on public.instagram_sessoes to authenticated;

create policy instagram_sessoes_leitura_escopada on public.instagram_sessoes
  for select to authenticated
  using (
    (select public.is_admin())
    or unidade_id is null
    or unidade_id in (select public.get_user_unidade_ids())
  );

-- Leitura pronta: junta a sessão com quem a pessoa é hoje no LA Report.
create or replace view public.vw_instagram_sessoes_resolvidas as
select
  s.*,
  case
    when s.telefone_chave is null then null
    else public.radar_resolver_entidade_por_telefone(s.telefone)
  end as entidade,
  round(extract(epoch from now() - s.ultima_atividade_em) / 86400)::int as dias_parada
from public.instagram_sessoes s;

comment on view public.vw_instagram_sessoes_resolvidas is
  'Sessão do Instagram + quem é a pessoa hoje (aluno/família/lead/desconhecido), pela RPC canônica. Não reimplementar o casamento de telefone no consumidor.';

revoke all on public.vw_instagram_sessoes_resolvidas from public, anon, authenticated;
grant select on public.vw_instagram_sessoes_resolvidas to authenticated;
