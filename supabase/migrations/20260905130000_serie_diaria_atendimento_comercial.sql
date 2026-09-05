-- SÉRIE DIÁRIA DE ATENDIMENTO — o tijolo que falta para dizer "está caindo".
--
-- `atendimento_conversa_estado` tem `conversa_id` como CHAVE PRIMÁRIA e é
-- reescrita de hora em hora pelo cron `calor-atendimento-horario` (jobid 199).
-- É uma FOTO, não uma série: dá para dizer "a Kailane tem 12 conversas com o
-- cliente esperando AGORA" e é impossível dizer "está piorando".
--
-- 🔴 É exatamente o que a liderança comercial mais pede — "a performance da
-- fulana está caindo, ela está demorando para responder" — e a única frase que
-- hoje não podemos sustentar. Esta migration guarda um instantâneo por dia.
--
-- ⚠️ NÃO É MÉDIA DE TEMPO DE RESPOSTA. Isso já existe ao vivo em
-- `chatwoot-atendimento-insights` (mediana de `first_response`/`reply_time` do
-- `reporting_events`) e não se acumula aqui — duas fontes para o mesmo número é
-- o erro que gerou as duplicatas de renovação. O que se guarda aqui é o que a
-- foto sabe e o outro não: quantas conversas ficaram COM O CLIENTE ESPERANDO no
-- fim do dia, por pessoa. Estoque, não velocidade.
--
-- ⚠️ O BOT TAMBÉM É "ASSIGNEE". As caixas têm dono chamado "Milla CG",
-- "Mila Recreio", "Milla Barra" — é a Mila SDR, não uma pessoa; ela responde na
-- hora e nunca aparece com cliente esperando (medido: 126 conversas dela, ZERO
-- esperando). Misturar isso com gente diluiria o número de todo mundo, então
-- `e_bot` separa e a leitura só devolve humano.
--
-- ⚠️ FOTO DAS 19:10 BRT, e o texto tem de dizer isso. Não é "o dia inteiro":
-- é como a caixa estava ao fim do expediente. Conversa aberta e respondida às
-- 15h não aparece aqui — e é assim que tem de ser, o que interessa é o que
-- ficou pendurado.

create table if not exists public.atendimento_consultor_diario (
  dia                 date not null,
  unidade_id          uuid references public.unidades(id),
  unidade_nome        text,
  assignee_nome       text not null,
  e_bot               boolean not null default false,
  conversas           int  not null default 0,
  abertas             int  not null default 0,
  esperando_cliente   int  not null default 0,   -- último a falar foi o contato
  esperando_4h        int  not null default 0,
  esperando_24h       int  not null default 0,
  horas_max_espera    numeric,
  so_falou_com_bot    int  not null default 0,
  novas_no_dia        int  not null default 0,
  min_ate_humano_p50  numeric,                    -- só das que ganharam humano NO dia
  capturado_em        timestamptz not null default now(),
  primary key (dia, unidade_id, assignee_nome)
);

comment on table public.atendimento_consultor_diario is
  'Instantâneo diário (19:10 BRT) de atendimento_conversa_estado por pessoa. ESTOQUE do que ficou pendurado, não velocidade de resposta — velocidade é do chatwoot-atendimento-insights, ao vivo.';
comment on column public.atendimento_consultor_diario.esperando_cliente is
  'Conversas em que o ÚLTIMO a falar foi o cliente. É a definição operacional de "ninguém respondeu".';
comment on column public.atendimento_consultor_diario.e_bot is
  'Dono é a Mila SDR (caixas "Mila*"/"Milla*"), não pessoa. A leitura devolve só humano.';

-- 🔴 ALTER DEFAULT PRIVILEGES deste projeto dá TODOS os privilégios a
-- `authenticated` em relação nova. Tabela de desempenho por pessoa não pode
-- nascer legível (nem gravável) pelo app.
revoke all on table public.atendimento_consultor_diario from public, anon, authenticated;
alter table public.atendimento_consultor_diario enable row level security;

create index if not exists atendimento_consultor_diario_pessoa_idx
  on public.atendimento_consultor_diario (assignee_nome, dia desc) where not e_bot;

-- ── o instantâneo ───────────────────────────────────────────────────────────
create or replace function public.snapshot_atendimento_consultor_v1(
  p_dia date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare v_linhas int;
begin
  insert into public.atendimento_consultor_diario as d (
    dia, unidade_id, unidade_nome, assignee_nome, e_bot,
    conversas, abertas, esperando_cliente, esperando_4h, esperando_24h,
    horas_max_espera, so_falou_com_bot, novas_no_dia, min_ate_humano_p50, capturado_em)
  select
    p_dia, e.unidade_id, max(e.unidade_texto), coalesce(e.assignee_nome, '(sem dono)'),
    coalesce(e.assignee_nome, '(sem dono)') ~* '^mi?ll?a\s',  -- Mila SDR, nao gente. MESMA expressao do group by:
                                                              -- variar o coalesce quebra o agrupamento (42803)
    count(*),
    count(*) filter (where e.conversa_status = 'open'),
    count(*) filter (where e.ultimo_autor = 'contact'),
    count(*) filter (where e.ultimo_autor = 'contact' and e.horas_desde_ultima >= 4),
    count(*) filter (where e.ultimo_autor = 'contact' and e.horas_desde_ultima >= 24),
    max(e.horas_desde_ultima) filter (where e.ultimo_autor = 'contact'),
    count(*) filter (where e.so_falou_com_bot),
    count(*) filter (where (e.primeiro_contato_em at time zone 'America/Sao_Paulo')::date = p_dia),
    percentile_cont(0.5) within group (order by e.minutos_ate_humano)
      filter (where (e.primeiro_humano_em at time zone 'America/Sao_Paulo')::date = p_dia),
    now()
  from public.atendimento_conversa_estado e
  where e.departamento = 'comercial'
  group by e.unidade_id, coalesce(e.assignee_nome, '(sem dono)')
  on conflict (dia, unidade_id, assignee_nome) do update set
    unidade_nome = excluded.unidade_nome, e_bot = excluded.e_bot,
    conversas = excluded.conversas, abertas = excluded.abertas,
    esperando_cliente = excluded.esperando_cliente,
    esperando_4h = excluded.esperando_4h, esperando_24h = excluded.esperando_24h,
    horas_max_espera = excluded.horas_max_espera,
    so_falou_com_bot = excluded.so_falou_com_bot, novas_no_dia = excluded.novas_no_dia,
    min_ate_humano_p50 = excluded.min_ate_humano_p50, capturado_em = now();

  get diagnostics v_linhas = row_count;
  -- ⚠️ automacao_log.aluno_nome e NOT NULL: sem rotulo aqui a excecao
  -- derruba a funcao DEPOIS de gravar, e o snapshot volta atras em silencio
  insert into public.automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
  values ('atendimento_serie', 'snapshot', 'ok', 'serie de atendimento comercial', 'Rede',
          jsonb_build_object('dia', p_dia, 'linhas', v_linhas));
  return jsonb_build_object('ok', true, 'dia', p_dia, 'linhas', v_linhas);
end $function$;

-- ── a leitura: a série de UMA pessoa, com a tendência já calculada ──────────
-- ⚠️ Consultora vê só a PRÓPRIA linha; quem lidera (unidade_id nulo) vê a
-- equipe. Sem isso, a Kailane perguntaria "e a Vitória?" e a Mila responderia —
-- foi exatamente o vazamento de 04/09.
-- ⚠️ A tendência compara os 7 dias recentes com os 7 anteriores e SÓ fala em
-- piora/melhora com pelo menos 3 dias de cada lado. Com menos, devolve
-- 'serie_curta' — dizer "está caindo" com 2 pontos é chute com cara de dado.
create or replace function public.mila_atendimento_serie_v1(
  p_solicitante_telefone text, p_dias integer default 14
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_lidera boolean; v_de date; v_hoje date; v_primeiro text; v_out jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_lidera   := (q.unidade_id is null);
  v_hoje     := (now() at time zone 'America/Sao_Paulo')::date;
  v_de       := v_hoje - greatest(least(p_dias, 90), 3);
  -- casa pelo PRIMEIRO nome (Chatwoot tem "Kailane Barbosa", a governanca tem
  -- "Kailane"); primeiro-contra-primeiro e a regua de sol_nome_mesma_pessoa_v1
  v_primeiro := lower(split_part(regexp_replace(trim(q.nome), '\s*\(.*\)$', ''), ' ', 1));

  with dia_pessoa as (
    -- 🔴 SOMAR AS UNIDADES ANTES. A chave da tabela e (dia, unidade, pessoa) e
    -- ha quem atenda em duas: a Vitoria tem linha em CG (13) e no Recreio (1).
    -- Sem este passo a serie ganha dois pontos no mesmo dia e a leitura pega um
    -- deles — a lider veria "Vitoria: 1 esperando" onde o certo e 14.
    select s.assignee_nome, s.dia,
           sum(s.esperando_cliente)::int esperando,
           sum(s.esperando_24h)::int     mais_24h,
           sum(s.abertas)::int           abertas,
           string_agg(distinct s.unidade_nome, ', ' order by s.unidade_nome) unidades
    from public.atendimento_consultor_diario s
    where s.dia >= v_de and not s.e_bot and s.assignee_nome <> '(sem dono)'
      and (v_lidera or lower(split_part(s.assignee_nome, ' ', 1)) = v_primeiro)
    group by s.assignee_nome, s.dia
  ),
  por_pessoa as (
    select d.assignee_nome,
           max(d.esperando) filter (where d.dia = (select max(dia) from dia_pessoa)) esperando_agora,
           jsonb_build_object(
             'pessoa', d.assignee_nome,
             'unidades', string_agg(distinct d.unidades, ' / '),
             'dias_medidos', count(*),
             'serie', jsonb_agg(jsonb_build_object('dia', d.dia, 'esperando', d.esperando,
                                                   'mais_de_24h', d.mais_24h, 'abertas', d.abertas)
                                order by d.dia),
             'media_recente',  round(avg(d.esperando) filter (where d.dia >  v_hoje - 7)::numeric, 1),
             'media_anterior', round(avg(d.esperando) filter (where d.dia <= v_hoje - 7)::numeric, 1),
             'tendencia', case
               when count(*) filter (where d.dia >  v_hoje - 7) < 3
                 or count(*) filter (where d.dia <= v_hoje - 7) < 3 then 'serie_curta'
               when avg(d.esperando) filter (where d.dia >  v_hoje - 7)
                  > avg(d.esperando) filter (where d.dia <= v_hoje - 7) * 1.3 then 'piorando'
               when avg(d.esperando) filter (where d.dia >  v_hoje - 7)
                  < avg(d.esperando) filter (where d.dia <= v_hoje - 7) * 0.7 then 'melhorando'
               else 'estavel' end
           ) item
    from dia_pessoa d group by d.assignee_nome
  )
  select jsonb_build_object(
    'ok', true, 'solicitante', q.nome,
    'escopo', case when v_lidera then 'a equipe das 3 unidades' else 'só você' end,
    'janela_dias', greatest(least(p_dias, 90), 3),
    'medida', 'Conversas com o CLIENTE esperando resposta, na foto das 19:10 de cada dia. '
           || 'É estoque do que ficou pendurado, não velocidade de resposta.',
    'pessoas', coalesce(jsonb_agg(p.item order by p.esperando_agora desc nulls last), '[]'::jsonb)
  ) into v_out
  from por_pessoa p;

  return v_out;
end $function$;

revoke all on function public.snapshot_atendimento_consultor_v1(date) from public, anon, authenticated;
revoke all on function public.mila_atendimento_serie_v1(text,integer) from public, anon, authenticated;
grant execute on function public.snapshot_atendimento_consultor_v1(date) to service_role;
grant execute on function public.mila_atendimento_serie_v1(text,integer) to service_role, mila_acesso_restrito;

-- ⚠️ Cron em SQL direto, sem edge: cron chamando edge já morreu em 401
-- silencioso neste projeto mais de uma vez. 22:10 UTC = 19:10 BRT, cinco
-- minutos depois do `calor-atendimento-horario` das 19:05 — lê a foto fresca.
select cron.schedule('snapshot-atendimento-comercial-diario', '10 22 * * *',
                     $cron$select public.snapshot_atendimento_consultor_v1();$cron$);
