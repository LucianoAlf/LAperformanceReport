-- AGENDA DE RETOMADA (o "bumerangue") — 🧱 alicerce + 1️⃣ + 3️⃣
--
-- O PROBLEMA REAL: a consultora atende muita gente e o lead que disse "volto a
-- falar em janeiro" some. Hoje o sistema sabe POR QUE o lead não fechou (a edge
-- `classificar-desinteresse` lê a conversa e extrai preço/horário/distância/
-- concorrente) e NÃO SABE QUANDO ele pediu para voltar. É a informação mais
-- valiosa do funil frio e a única que ninguém guarda.
--
-- 🔴 A FRASE ORIGINAL É OBRIGATÓRIA (`frase` é NOT NULL). Lembrete sem a frase
-- é ruído: a consultora não lembra do caso, ignora, e em duas semanas a
-- ferramenta morre. O lembrete tem de ser
--   "a Juliana te disse em 12/06 que voltaria a falar em setembro porque o filho
--    estava em prova"
-- e não "retomar contato com a Juliana".
--
-- ⚠️ POR QUE TABELA PRÓPRIA E NÃO `radar_sinais`: sinal do radar significa "aja
--    AGORA" — a pauta, a cutucada e o teto por turno todos assumem isso. Uma
--    retomada marcada para janeiro ficaria 4 meses ocupando fila e ensinando a
--    equipe a ignorar a pauta. Aqui a linha dorme até o dia e só então aparece.
--
-- ⚠️ A DATA É RESOLVIDA POR REGRA DETERMINÍSTICA, NUNCA PELO MODELO. O LLM
--    descreve o que a pessoa disse ("em janeiro", "daqui a 3 meses"); quem
--    converte para data é `fn_resolver_prazo_retomada`. Modelo fazendo
--    aritmética de calendário erra em silêncio, e um lembrete no mês errado é
--    pior que nenhum. Quando a expressão é vaga ("depois das férias"), a data
--    fica NULL e a linha vai para o balde "sem data" — que a consultora tria.
--    Inventar data seria mentir com cara de dado.

create table if not exists public.lead_retomada (
  id                uuid primary key default gen_random_uuid(),
  lead_id           bigint not null references public.leads(id) on delete cascade,
  unidade_id        uuid   not null references public.unidades(id),
  prometido_em      date   not null,                 -- quando a pessoa disse isso
  prazo_texto       text,                            -- "em janeiro", nas palavras dela
  retomar_em        date,                            -- resolvido; NULL = indefinido
  frase             text   not null,                 -- 🔴 a frase original
  motivo            text,                            -- preco/horario/... quando houver
  origem            text   not null default 'consultora'
                    check (origem in ('consultora', 'llm_conversa')),
  conversation_id   bigint,
  status            text   not null default 'aguardando'
                    check (status in ('aguardando', 'lembrado', 'retomado', 'descartado')),
  lembrado_em       timestamptz,
  desfecho          text check (desfecho in ('matriculou', 'segue_interessado', 'nao_quer', 'sem_resposta')),
  desfecho_em       timestamptz,
  desfecho_nota     text,
  criado_por        text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table public.lead_retomada is
  'Agenda de retomada ("bumerangue"): quando o lead pediu para voltar a falar, POR QUE, e a frase original. Dorme ate o dia. Desfecho fecha o laco 3o->2o andar.';
comment on column public.lead_retomada.frase is
  'A frase original da pessoa. NOT NULL de proposito: lembrete sem a frase e ruido — a consultora nao lembra do caso e ignora.';
comment on column public.lead_retomada.retomar_em is
  'Resolvido por fn_resolver_prazo_retomada, nunca pelo modelo. NULL = expressao vaga; vai para o balde "sem data" em vez de virar data inventada.';
comment on column public.lead_retomada.desfecho is
  'O que aconteceu quando ela retomou. E o MEDIR do 3o andar: sem isso nao da para aprender se retomar no prazo converte mais.';

-- 🔴 ALTER DEFAULT PRIVILEGES deste projeto da tudo a `authenticated` em
-- relacao nova. Agenda com telefone e frase de cliente nao nasce aberta.
revoke all on table public.lead_retomada from public, anon, authenticated;
alter table public.lead_retomada enable row level security;

-- um lead tem UMA retomada viva: a mais recente vence (a pessoa mudou de ideia)
create unique index if not exists lead_retomada_viva_uidx
  on public.lead_retomada (lead_id) where status = 'aguardando';
create index if not exists lead_retomada_dia_idx
  on public.lead_retomada (retomar_em, unidade_id) where status = 'aguardando';

-- ── a régua determinística de prazo ─────────────────────────────────────────
-- ⚠️ Só converte o que é inequívoco. "Depois das férias" devolve NULL de
-- propósito: não sabemos quando são as férias DELA.
create or replace function public.fn_resolver_prazo_retomada(
  p_texto text, p_base date default (now() at time zone 'America/Sao_Paulo')::date
) returns date
language plpgsql immutable as $function$
declare t text; n int; m int; v_ano int;
begin
  if coalesce(trim(p_texto), '') = '' then return null; end if;
  t := lower(unaccent(trim(p_texto)));
  -- numero por extenso: a pessoa fala "duas semanas", nao "2 semanas". Sem isto
  -- a expressao mais comum da fala cai no balde "sem data".
  t := regexp_replace(t, '\muma?\M',   '1',  'g');
  t := regexp_replace(t, '\mdois\M|\mduas\M',  '2',  'g');
  t := regexp_replace(t, '\mtres\M',   '3',  'g');
  t := regexp_replace(t, '\mquatro\M', '4',  'g');
  t := regexp_replace(t, '\mcinco\M',  '5',  'g');
  t := regexp_replace(t, '\mseis\M',   '6',  'g');
  t := regexp_replace(t, '\msete\M',   '7',  'g');
  t := regexp_replace(t, '\moito\M',   '8',  'g');
  t := regexp_replace(t, '\mnove\M',   '9',  'g');
  t := regexp_replace(t, '\mdez\M',    '10', 'g');
  t := regexp_replace(t, '\mquinze\M', '15', 'g');
  t := regexp_replace(t, '\mvinte\M',  '20', 'g');

  -- "daqui a N dias/semanas/meses", "em N meses", "N meses"
  n := nullif(substring(t from '(\d+)\s*(dia|dias)'), '')::int;
  if n is not null then return p_base + n; end if;
  n := nullif(substring(t from '(\d+)\s*(semana|semanas)'), '')::int;
  if n is not null then return p_base + (n * 7); end if;
  n := nullif(substring(t from '(\d+)\s*(mes|meses)'), '')::int;
  if n is not null then return (p_base + make_interval(months => n))::date; end if;

  if t ~ 'semana que vem|proxima semana' then return p_base + 7; end if;
  if t ~ 'mes que vem|proximo mes'       then return (date_trunc('month', p_base) + interval '1 month')::date; end if;
  if t ~ 'ano que vem|proximo ano'       then return make_date(extract(year from p_base)::int + 1, 1, 1); end if;

  -- nome do mês: o PRÓXIMO mês com esse nome (se já passou, vai para o ano seguinte)
  m := case
         when t ~ 'janeiro'   then 1  when t ~ 'fevereiro' then 2  when t ~ 'marco'    then 3
         when t ~ 'abril'     then 4  when t ~ 'maio'      then 5  when t ~ 'junho'    then 6
         when t ~ 'julho'     then 7  when t ~ 'agosto'    then 8  when t ~ 'setembro' then 9
         when t ~ 'outubro'   then 10 when t ~ 'novembro'  then 11 when t ~ 'dezembro' then 12
       end;
  if m is not null then
    v_ano := extract(year from p_base)::int;
    if m <= extract(month from p_base)::int then v_ano := v_ano + 1; end if;
    return make_date(v_ano, m, 1);
  end if;

  -- ⚠️ "depois das ferias", "quando eu me organizar", "mais pra frente":
  -- vago de verdade. NULL, e a consultora decide.
  return null;
end $function$;

-- ── 3️⃣ AÇÃO: registrar a retomada ──────────────────────────────────────────
create or replace function public.mila_registrar_retomada_v1(
  p_solicitante_telefone text, p_lead_id bigint, p_frase text,
  p_prazo_texto text default null, p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; l record; v_data date; v_id uuid; v_antes record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_frase), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'frase_vazia',
      'nota', 'preciso do que a pessoa DISSE. Sem a frase o lembrete vira ruido e ela ignora.');
  end if;

  select l2.id, l2.nome, l2.unidade_id into l from leads l2
   where l2.id = p_lead_id and (q.unidade_id is null or l2.unidade_id = q.unidade_id);
  if l.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado_no_seu_escopo');
  end if;

  v_data := public.fn_resolver_prazo_retomada(p_prazo_texto);

  -- a pessoa pode ter mudado de ideia: a retomada nova substitui a viva
  select * into v_antes from lead_retomada where lead_id = p_lead_id and status = 'aguardando';
  if v_antes.id is not null then
    update lead_retomada set status = 'descartado', atualizado_em = now(),
           desfecho_nota = 'substituida por combinado mais novo'
     where id = v_antes.id;
  end if;

  insert into lead_retomada (lead_id, unidade_id, prometido_em, prazo_texto, retomar_em,
                             frase, motivo, origem, criado_por)
  values (l.id, l.unidade_id, (now() at time zone 'America/Sao_Paulo')::date,
          nullif(trim(coalesce(p_prazo_texto,'')), ''), v_data,
          trim(p_frase), nullif(trim(coalesce(p_motivo,'')), ''), 'consultora', q.nome)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'retomada_id', v_id, 'lead', l.nome,
    'retomar_em', v_data, 'prazo_texto', p_prazo_texto,
    'substituiu_anterior', v_antes.id is not null,
    'nota', case when v_data is null
      then 'guardei SEM data — "' || coalesce(p_prazo_texto,'(sem prazo)') || '" nao da para virar dia. Pergunte a ela quando lembrar, ou deixe no balde sem data.'
      else 'guardado. Eu te lembro no dia, com a frase dele junto.' end);
end $function$;

-- ── 1️⃣ CONTEXTO: o que retomar hoje ────────────────────────────────────────
create or replace function public.mila_retomadas_do_dia_v1(
  p_solicitante_telefone text, p_data date default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_dia date; v_out jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_dia := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);

  select jsonb_build_object(
    'ok', true, 'dia', v_dia, 'solicitante', q.nome,
    'hoje', coalesce((
      select jsonb_agg(jsonb_build_object(
               'retomada_id', r.id, 'lead_id', r.lead_id, 'lead', l.nome, 'telefone', l.telefone,
               'unidade', u.nome,
               'ele_disse', r.frase,                       -- 🔴 sempre presente
               'quando_disse', to_char(r.prometido_em, 'DD/MM/YYYY'),
               'ha_quantos_dias', (v_dia - r.prometido_em),
               'combinou_para', r.prazo_texto, 'motivo', r.motivo)
             order by r.prometido_em)
      from lead_retomada r
      join leads l on l.id = r.lead_id
      join unidades u on u.id = r.unidade_id
      where r.status = 'aguardando' and r.retomar_em is not null and r.retomar_em <= v_dia
        and (q.unidade_id is null or r.unidade_id = q.unidade_id)), '[]'::jsonb),
    'sem_data', coalesce((
      select jsonb_agg(jsonb_build_object('retomada_id', r.id, 'lead', l.nome,
               'ele_disse', r.frase, 'combinou_para', r.prazo_texto,
               'quando_disse', to_char(r.prometido_em, 'DD/MM/YYYY'))
             order by r.prometido_em)
      from lead_retomada r
      join leads l on l.id = r.lead_id
      where r.status = 'aguardando' and r.retomar_em is null
        and (q.unidade_id is null or r.unidade_id = q.unidade_id)), '[]'::jsonb),
    'como_usar', 'SEMPRE cite `ele_disse` — a frase da pessoa — e ha quantos dias foi. '
              || 'Sem isso ela nao lembra do caso e ignora o lembrete. '
              || 'Em `sem_data` estao os que combinaram algo vago: pergunte a ela quando quer ser lembrada.'
  ) into v_out;
  return v_out;
end $function$;

-- ── 3️⃣ MEDIR: o desfecho fecha o laço com o 2º andar ───────────────────────
-- ⚠️ Sem isto nao ha como aprender se retomar NO PRAZO converte mais que
-- retomar tarde. E o campo que transforma a pilha em ciclo.
create or replace function public.mila_desfecho_retomada_v1(
  p_solicitante_telefone text, p_retomada_id uuid, p_desfecho text, p_nota text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if p_desfecho not in ('matriculou','segue_interessado','nao_quer','sem_resposta') then
    return jsonb_build_object('ok', false, 'motivo', 'desfecho_invalido',
      'aceitos', array['matriculou','segue_interessado','nao_quer','sem_resposta']);
  end if;

  select * into r from lead_retomada
   where id = p_retomada_id and (q.unidade_id is null or unidade_id = q.unidade_id) for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'retomada_nao_encontrada'); end if;
  if r.status in ('retomado','descartado') then
    return jsonb_build_object('ok', false, 'motivo', 'ja_fechada', 'status', r.status);
  end if;

  update lead_retomada
     set status = 'retomado', desfecho = p_desfecho, desfecho_em = now(),
         desfecho_nota = nullif(trim(coalesce(p_nota,'')), ''), atualizado_em = now()
   where id = r.id;

  insert into automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
  values ('mila_retomada', p_desfecho, 'ok',
          coalesce((select nome from leads where id = r.lead_id), 'lead ' || r.lead_id),
          coalesce((select nome from unidades where id = r.unidade_id), 'Rede'),
          jsonb_build_object('retomada_id', r.id, 'por', q.nome,
                             'dias_entre_promessa_e_retomada', (current_date - r.prometido_em),
                             'no_prazo', (r.retomar_em is not null and current_date <= r.retomar_em + 3),
                             'frase', r.frase, 'nota', p_nota));

  return jsonb_build_object('ok', true, 'retomada_id', r.id, 'desfecho', p_desfecho,
    'nota', case when p_desfecho = 'segue_interessado'
                 then 'quer que eu marque uma nova data de retomada? me diz o que ele falou.'
                 else 'fechado. Isso alimenta o aprendizado de quanto vale retomar no prazo.' end);
end $function$;

revoke all on function public.fn_resolver_prazo_retomada(text,date)                    from public, anon, authenticated;
revoke all on function public.mila_registrar_retomada_v1(text,bigint,text,text,text)   from public, anon, authenticated;
revoke all on function public.mila_retomadas_do_dia_v1(text,date)                      from public, anon, authenticated;
revoke all on function public.mila_desfecho_retomada_v1(text,uuid,text,text)           from public, anon, authenticated;
grant execute on function public.fn_resolver_prazo_retomada(text,date)                    to service_role, mila_acesso_restrito;
grant execute on function public.mila_registrar_retomada_v1(text,bigint,text,text,text)   to service_role, mila_acesso_restrito;
grant execute on function public.mila_retomadas_do_dia_v1(text,date)                      to service_role, mila_acesso_restrito;
grant execute on function public.mila_desfecho_retomada_v1(text,uuid,text,text)           to service_role, mila_acesso_restrito;
