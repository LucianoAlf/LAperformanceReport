-- ORÇAMENTO DE ATENÇÃO: quantas vezes um agente pode falar com a mesma
-- pessoa no mesmo dia (08/09/2026).
--
-- 🔴 O PEDIDO, literal: *"a equipe já está cercada de muitos agentes: tem o
--    Tom, tem o Fábio, tem a Mila. Senão a equipe só vai receber cobrança,
--    cobrança, cobrança, chega uma hora que dá vontade de — ah meu Deus."*
--
--    Medido nos últimos 30 dias, o grupo de CADA unidade já recebe da Sol:
--      presença 3,0/dia · aviso prévio 2,7/dia · caixa 1,6/dia
--    Ligar a pauta em dois turnos levaria isso a **4 ou 5 mensagens por dia**,
--    num único grupo, de um único agente. É exatamente o acúmulo descrito.
--
-- 🔴 O QUE ESTE TETO ALCANÇA, sem maquiagem: **só o que passa pela
--    `fila_relatorios_sol_hermes`**. Conferido: 100% do tráfego dessa fila é da
--    Sol (`auto_cron`, `cron`, `manual_caixa`, `manual`). O TOM e o Fábio têm
--    canal próprio e NÃO passam aqui, então dizer que existe um teto entre
--    agentes seria mentira.
--
--    O que dá para fazer — e está feito — é o teto existir num lugar só, com
--    UMA porta de entrada, e a coluna `externas` já preparada para o dia em que
--    o TOM e o Fábio registrarem o que mandam. A adoção deles é decisão, não
--    código que eu possa escrever no runtime alheio.
--
-- 🔴 O TETO CORTA NUDGE, NUNCA FATO OPERACIONAL. Suprimir "o caixa não fechou"
--    por orçamento seria trocar um problema de ruído por um de omissão. Quem
--    declara o próprio peso é o chamador: `essencial` passa sempre e só CONTA;
--    `nudge` (a pauta é nudge) cede a vez quando o dia já está cheio.
--
-- ⚠️ Teto de 4 por dia para grupo: hoje o grupo recebe 2-3 de fatos
--    operacionais, então sobra 1 para a pauta e o segundo turno cede em dia
--    cheio. É o comportamento desejado — a pauta é o que pode esperar.
--
-- ⚠️ DM tem teto menor (2): mensagem privada custa mais atenção que mensagem
--    de grupo, que a pessoa lê quando quiser.

create table if not exists agente_orcamento_config (
  destino_tipo text primary key check (destino_tipo in ('grupo','dm')),
  teto_dia     integer not null check (teto_dia between 1 and 20),
  atualizado_em timestamptz not null default now()
);
comment on table agente_orcamento_config is
  'Quantas mensagens por dia um destino aguenta antes de a Sol calar os nudges. Fato operacional (essencial) nunca e cortado — so contado.';

insert into agente_orcamento_config (destino_tipo, teto_dia) values ('grupo', 4), ('dm', 2)
on conflict (destino_tipo) do nothing;

alter table agente_orcamento_config enable row level security;
revoke all on table agente_orcamento_config from public, anon;
grant select on table agente_orcamento_config to authenticated, service_role;
drop policy if exists agente_orcamento_config_leitura on agente_orcamento_config;
create policy agente_orcamento_config_leitura on agente_orcamento_config
  for select to authenticated using (true);
-- ⚠️ RLS sem GRANT e letra morta; GRANT sem policy le zero linha em silencio.
--    As duas armadilhas ja documentadas nesta casa — por isso os dois.

-- ⚠️ Para agente que NAO passa pela fila (TOM, Fabio). Vazia hoje, de proposito:
--    prefiro a tabela existir e o numero ser honesto (0 externas) a inventar
--    cobertura que nao tenho.
create table if not exists agente_mensagens_externas (
  id         bigserial primary key,
  agente     text not null,
  destino    text not null,
  tipo       text,
  peso       text not null default 'essencial' check (peso in ('essencial','nudge')),
  enviada_em timestamptz not null default now()
);
comment on table agente_mensagens_externas is
  'Onde TOM/Fabio/Mila registram o que mandaram, para o orcamento de atencao contar todos. Vazia enquanto eles nao adotarem — e o numero diz isso, em vez de fingir cobertura.';
create index if not exists agente_mensagens_externas_destino_idx
  on agente_mensagens_externas (destino, enviada_em desc);

alter table agente_mensagens_externas enable row level security;
revoke all on table agente_mensagens_externas from public, anon;
grant select on table agente_mensagens_externas to authenticated, service_role;

create or replace function public.agente_pode_falar_v1(
  p_destino text,
  p_peso    text default 'nudge',
  p_agente  text default 'sol',
  p_dia     date default null
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_tipo text := case when p_destino like '%@g.us' then 'grupo' else 'dm' end;
  v_teto int; v_fila int; v_ext int; v_total int;
begin
  select teto_dia into v_teto from agente_orcamento_config where destino_tipo = v_tipo;
  v_teto := coalesce(v_teto, 4);

  select count(*) into v_fila from fila_relatorios_sol_hermes
   where jid = p_destino and data_dia = v_dia and status <> 'erro';

  select count(*) into v_ext from agente_mensagens_externas
   where destino = p_destino
     and (enviada_em at time zone 'America/Sao_Paulo')::date = v_dia;

  v_total := v_fila + v_ext;

  -- 🔴 Fato operacional passa SEMPRE. Calar "o caixa nao fechou" por orcamento
  --    trocaria ruido por omissao, que e pior.
  if coalesce(p_peso,'nudge') = 'essencial' then
    return jsonb_build_object('pode', true, 'peso', 'essencial',
      'ja_hoje', v_total, 'teto', v_teto, 'destino_tipo', v_tipo,
      'nota', 'fato operacional nao e cortado por orcamento — apenas contado');
  end if;

  return jsonb_build_object(
    'pode', v_total < v_teto, 'peso', 'nudge',
    'ja_hoje', v_total, 'teto', v_teto, 'destino_tipo', v_tipo,
    'da_fila', v_fila, 'de_outros_agentes', v_ext,
    'motivo', case when v_total < v_teto then null else 'orcamento_de_atencao_esgotado' end);
end; $function$;

comment on function public.agente_pode_falar_v1(text, text, text, date) is
  'Porta unica do orcamento de atencao: quantas mensagens aquele destino ja recebeu hoje, e se cabe mais um NUDGE. Fato operacional (`essencial`) sempre passa e so e contado. Hoje conta a fila da Sol + `agente_mensagens_externas` (vazia ate TOM/Fabio adotarem).';

revoke all on function public.agente_pode_falar_v1(text, text, text, date) from public, anon;
grant execute on function public.agente_pode_falar_v1(text, text, text, date)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── a pauta passa a pedir licença ──────────────────────────────────────────
do $pauta$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_enfileirar_pauta_v1' and pronamespace='public'::regnamespace;

  velho := '    if exists (select 1 from fila_relatorios_sol_hermes';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA da idempotencia: esperava 1, achei %', n; end if;

  v_def := replace(v_def, velho,
    '    -- 🔴 ORCAMENTO DE ATENCAO: a pauta e NUDGE e cede a vez quando o grupo' || chr(10) ||
    '    --    ja recebeu o bastante hoje. Medido: presenca 3,0/dia + aviso previo' || chr(10) ||
    '    --    2,7 + caixa 1,6 — sem isto, dois turnos de pauta levariam o grupo a' || chr(10) ||
    '    --    5 mensagens diarias de um agente so.' || chr(10) ||
    '    v_orc := agente_pode_falar_v1(v_jid, ''nudge'', ''sol'', v_dia);' || chr(10) ||
    '    if not coalesce((v_orc->>''pode'')::bool, true) then' || chr(10) ||
    '      v_out := v_out || jsonb_build_object(''unidade'', v_b->>''destinatario'',' || chr(10) ||
    '        ''pulado'', ''orcamento_de_atencao'',' || chr(10) ||
    '        ''ja_hoje'', v_orc->>''ja_hoje'', ''teto'', v_orc->>''teto'');' || chr(10) ||
    '      continue;' || chr(10) ||
    '    end if;' || chr(10) || chr(10) ||
    velho);

  velho := '  v_out jsonb := ''[]''::jsonb; v_enviados int := 0; v_repetidos int;';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA das declaracoes: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    '  v_out jsonb := ''[]''::jsonb; v_enviados int := 0; v_repetidos int; v_orc jsonb;');

  execute v_def;
  raise notice 'radar_enfileirar_pauta_v1: passa a respeitar o orcamento de atencao';
end $pauta$;

revoke all on function public.radar_enfileirar_pauta_v1(boolean, date) from public, anon;
grant execute on function public.radar_enfileirar_pauta_v1(boolean, date) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_jid text; v jsonb; v_dia date := current_date; i int;
begin
  select jid into v_jid from fila_relatorios_sol_hermes
   where grupo_nome ilike 'RELAT%DI%RIOS%' and jid is not null limit 1;
  if v_jid is null then raise exception 'sem grupo para exercitar a prova'; end if;

  -- 🔴 fato operacional passa mesmo com o dia estourado
  v := agente_pode_falar_v1(v_jid, 'essencial', 'sol', v_dia);
  if not (v->>'pode')::bool then
    raise exception 'fato operacional foi cortado por orcamento — inaceitavel: %', v;
  end if;

  -- nudge com o dia vazio passa
  v := agente_pode_falar_v1(v_jid, 'nudge', 'sol', v_dia);
  if not (v->>'pode')::bool then
    raise exception 'com o dia vazio o nudge deveria passar: %', v;
  end if;

  -- ⚠️ enche o dia num dia FUTURO ficticio, para nao sujar hoje
  for i in 1..5 loop
    insert into fila_relatorios_sol_hermes
      (tipo_relatorio, origem, jid, grupo_nome, unidade_nome, texto, status, data_dia, tentativas)
    values ('__prova_orcamento__','prova', v_jid, 'prova', 'prova', 'x', 'enviada', v_dia + 30, 0);
    -- ⚠️ `unidade_nome` e NOT NULL na fila; a 1a versao da prova omitiu.
  end loop;

  v := agente_pode_falar_v1(v_jid, 'nudge', 'sol', v_dia + 30);
  if (v->>'pode')::bool then
    raise exception 'com 5 mensagens e teto 4 o nudge deveria ceder: %', v;
  end if;
  if v->>'motivo' is distinct from 'orcamento_de_atencao_esgotado' then
    raise exception 'a recusa nao disse o motivo: %', v;
  end if;

  -- e o essencial continua passando por cima
  v := agente_pode_falar_v1(v_jid, 'essencial', 'sol', v_dia + 30);
  if not (v->>'pode')::bool then
    raise exception 'essencial cortado com o dia cheio — o ramo inverteu: %', v;
  end if;

  delete from fila_relatorios_sol_hermes where tipo_relatorio='__prova_orcamento__';

  raise notice 'prova: essencial sempre passa · nudge passa com dia vazio e CEDE com dia cheio (teto %)',
    (agente_pode_falar_v1(v_jid,'nudge','sol',v_dia)->>'teto');
end $prova$;
