-- A Mila "pulou" o relatório da manhã ao responder (16/09/2026)
--
-- O Alf mandou "Quero Mila" ao final do briefing de liderança, que fechava
-- com "Quer que eu puxe [130 pendências de cadastro] com o time hoje, um por
-- um?". A Mila respondeu montando um recado sobre COMUNIDADE para a Anne
-- Krissya — assunto de DOIS DIAS ATRÁS, sem relação com o que foi proposto
-- de manhã.
--
-- 🔴 RAIZ (lida em código, não em suposição): `chatwoot-mila-bridge.js` roda
-- a sessão interativa da Mila com o Hermes numa sessão PERSISTENTE por
-- telefone (`--continue chatwoot-consultor-v2-<telefone>`, `effectiveSessionId`
-- em `runHermesMeta`). O briefing de manhã, em compensação, é mandado direto
-- ao Chatwoot por `mila-proativa.py` (função `enviar`/`enviar_lideranca`),
-- SEM passar pelo Hermes — o cron não abre sessão nenhuma, só faz um POST.
-- Resultado: o que a Mila "lembra" ao ser chamada é o ÚLTIMO TURNO QUE
-- REALMENTE PASSOU PELO HERMES, não o último texto que apareceu na tela do
-- Alf. Se a última vez que ele conversou de verdade com ela (não só recebeu
-- um relatório) foi há dois dias, sobre comunidade, é ISSO que "sim" reabre.
--
-- O `consultor-gatilho.js` (24/08) não cobre este caso: ele guarda mensagens
-- INBOUND que a pessoa mandou e não foram respondidas, nunca o que a Mila
-- mandou por fora do Hermes. E o laço 1/2/3 (13/09) só cobre resposta de UM
-- DÍGITO a um item de cutucada com `sinal_id` — "Quero Mila" não é dígito, e
-- o briefing de liderança não tem `quentes_agora` (só as consultoras têm).
--
-- FIX: uma trilha mínima do que foi mandado por fora do Hermes.
-- `mila_registrar_envio_proativo_v1` grava (telefone, texto, origem) a cada
-- envio do cron. `mila_envio_proativo_pendente_v1` devolve o mais recente
-- ainda não reconciliado dos últimos 36h (cobre "responder de manhã ao fim
-- do dia de ontem"). O bridge injeta esse texto no prompt ANTES de chamar o
-- Hermes — rotulado, para o modelo não tratar como pedido novo — e
-- `mila_marcar_contexto_proativo_usado_v1` fecha o item depois de uma
-- resposta com sucesso, para não vazar para turnos futuros sem relação.
--
-- Provado em cadeia antes de aplicar: registrar → pendente devolve o texto →
-- marcar → pendente some. RLS ligada (só service_role executa as três).

create table if not exists public.mila_envio_proativo (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  texto text not null,
  origem text not null,
  enviado_em timestamptz not null default now(),
  reconhecido_em timestamptz
);

create index if not exists ix_mila_envio_proativo_pendente
  on public.mila_envio_proativo (telefone, enviado_em desc)
  where reconhecido_em is null;

alter table public.mila_envio_proativo enable row level security;

comment on table public.mila_envio_proativo is
  'O que a Mila mandou SOZINHA (cron, sem passar pela sessao interativa do Hermes) — '
  'briefing de manha/fim de dia, hoje. Existe porque o bridge interativo (chatwoot-mila-bridge.js) '
  'roda uma sessao Hermes PERSISTENTE por telefone (--continue chatwoot-consultor-v2-<telefone>), '
  'e essa sessao so "ouve" o que passa por ela mesma -- um envio direto do cron ao Chatwoot fica '
  'invisivel para a propria Mila. Sem isto, "sim"/"quero" respondido a um relatorio da manha '
  'reabre o TOPICO MAIS RECENTE que a sessao Hermes de fato processou, que pode ser de dois dias '
  'atras (caso real, 16/09/2026: Alf respondeu "Quero Mila" ao briefing da manha e a Mila retomou '
  'a conversa de comunidade de 14/09, porque foi o ultimo turno que passou pelo Hermes).';

create or replace function public.mila_registrar_envio_proativo_v1(
  p_telefone text, p_texto text, p_origem text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_tel text;
begin
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if v_tel = '' or coalesce(p_texto, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'telefone_ou_texto_vazio');
  end if;
  insert into public.mila_envio_proativo (telefone, texto, origem)
  values (v_tel, left(p_texto, 4000), coalesce(p_origem, 'desconhecido'));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.mila_registrar_envio_proativo_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.mila_registrar_envio_proativo_v1(text, text, text) to service_role;

create or replace function public.mila_envio_proativo_pendente_v1(p_telefone text, p_horas integer default 36)
returns jsonb
language sql security definer set search_path = public
as $$
  select coalesce(jsonb_build_object(
           'texto', texto, 'origem', origem,
           'enviado_em', to_char(enviado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')),
         null)
  from public.mila_envio_proativo
  where telefone = regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
    and reconhecido_em is null
    and enviado_em >= now() - make_interval(hours => greatest(coalesce(p_horas, 36), 1))
  order by enviado_em desc
  limit 1;
$$;
revoke all on function public.mila_envio_proativo_pendente_v1(text, integer) from public, anon, authenticated;
grant execute on function public.mila_envio_proativo_pendente_v1(text, integer) to service_role;

create or replace function public.mila_marcar_contexto_proativo_usado_v1(p_telefone text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  update public.mila_envio_proativo
     set reconhecido_em = now()
   where telefone = regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
     and reconhecido_em is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'marcados', v_n);
end;
$$;
revoke all on function public.mila_marcar_contexto_proativo_usado_v1(text) from public, anon, authenticated;
grant execute on function public.mila_marcar_contexto_proativo_usado_v1(text) to service_role;
