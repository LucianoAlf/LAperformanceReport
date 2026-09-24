-- LAPE-43 · RETENCAO DE sync_run_items · PASSO 1 de 3: HISTORICO COMPACTO
--
-- O QUE ESTE PASSO FAZ (e o que NAO faz):
--   Cria o historico compacto das faturas e a funcao que o alimenta. NAO apaga nada, NAO
--   mexe em sync_run_items, NAO muda o que nenhuma tela le.
--
-- POR QUE EXISTE:
--   sync_run_items guarda uma FOTO COMPLETA por run (~1.100 faturas) e os crons tiram ~270
--   fotos/dia. Medido em 23/09/2026: 8,45 milhoes de linhas para 20.892 conteudos distintos
--   (~400 copias identicas por fatura). O passo 2 passa a guardar so os ultimos 7 dias de
--   foto; ESTE historico e' o que preserva, para sempre, QUANDO cada fatura mudou.
--
-- GRAO: uma linha por "ilha" -- sequencia CONTIGUA de runs em que a fatura teve o mesmo
--   conteudo. Aberta -> paga -> aberta (estorno) vira TRES linhas, nao duas.
--   ⚠️ E' por isso que isto NAO reaproveita sync_run_items_dedup (fase 2): la o
--   min/max(created_at) por conteudo junta as duas passagens por "aberta" num intervalo so,
--   que atravessa o periodo em que ela estava paga.
--
-- IDENTIDADE da fatura: (competencia, unidade_id, emusys_fatura_id) -- a mesma de
--   sync_run_items_identidade_uniq sem o run_id.
-- CONTEUDO (entra no hash): todas as colunas de negocio + payload. FORA do hash: id, run_id,
--   created_at e source_last_seen_at (muda a cada run; com ela nada deduplicaria).
-- TEMPO: sync_runs.completed_at -- o mesmo campo que os leitores usam para eleger o run.
--
-- ALIMENTACAO: sync_run_items_consolidar_historico_v1(p_max_runs). Uma funcao so para a
--   carga inicial (chamada em lotes ate devolver 'nada_a_fazer') e para a rodada diaria
--   (passo 3). Processa runs em ordem de completed_at e NUNCA fora de ordem: run elegivel
--   mais antigo que um ja consolidado da mesma competencia aborta com erro explicito.
--
-- ROLLBACK:
--   drop function if exists public.sync_run_items_historico_conferir_v1(integer);
--   drop function if exists public.sync_run_items_consolidar_historico_v1(integer);
--   drop table if exists public.sync_run_items_historico;
--   drop table if exists public.sync_run_retencao;
--   drop function if exists public.fn_sync_run_items_historico_guard();

-- ── Controle por run: consolidado no historico? itens podados? ──────────────────────────
-- ⚠️ Nao da para marcar isto em sync_runs: trg_sync_runs_guard recusa UPDATE em run finalizado.
create table public.sync_run_retencao (
  run_id              uuid primary key references public.sync_runs(id),
  competencia         date not null,
  completed_at        timestamptz not null,
  itens_consolidados  integer not null,
  consolidado_em      timestamptz not null default now(),
  itens_expurgados    integer,
  expurgado_em        timestamptz
);
create index sync_run_retencao_competencia_idx
  on public.sync_run_retencao (competencia, completed_at desc);

comment on table public.sync_run_retencao is
  'LAPE-43. Uma linha por run ja consolidado em sync_run_items_historico. expurgado_em preenchido = os itens desse run foram podados de sync_run_items (o cabecalho em sync_runs continua). Run expurgado NAO significa "o Emusys devolveu zero faturas".';

-- ── Historico compacto ──────────────────────────────────────────────────────────────────
create table public.sync_run_items_historico (
  id                          bigint generated always as identity primary key,
  competencia                 date not null,
  unidade_id                  uuid not null,
  emusys_fatura_id            bigint not null,
  canonical_fatura_id         uuid,
  unidade_codigo              text,
  emusys_matricula_id         bigint,
  emusys_contrato_id          bigint,
  emusys_student_id           bigint,
  descricao                   text,
  status                      text,
  data_vencimento             date,
  data_pagamento              date,
  valor_original              numeric,
  valor_pago                  numeric,
  juros_e_multa               numeric,
  desconto_aplicado           numeric,
  desconto_fixo               numeric,
  desconto_condicional        numeric,
  payload                     jsonb,
  source_missing              boolean,
  source_missing_reason       text,
  source_missing_detected_at  timestamptz,
  source_missing_resolved_at  timestamptz,
  conteudo_hash               text not null,
  primeira_vez_visto          timestamptz not null,
  ultima_vez_visto            timestamptz not null,
  primeiro_run_id             uuid not null,
  ultimo_run_id               uuid not null,
  n_runs                      integer not null check (n_runs >= 1),
  check (ultima_vez_visto >= primeira_vez_visto)
);
create index sync_run_items_historico_fatura_idx
  on public.sync_run_items_historico (competencia, unidade_id, emusys_fatura_id, ultima_vez_visto desc);
create index sync_run_items_historico_canonical_idx
  on public.sync_run_items_historico (canonical_fatura_id, primeira_vez_visto);

comment on table public.sync_run_items_historico is
  'LAPE-43. Historico permanente das faturas vistas pelo sync: uma linha por ILHA (runs contiguos com o mesmo conteudo). Para "o que o Emusys dizia em T": a linha da fatura com primeira_vez_visto <= T <= ultima_vez_visto. Conteudo imutavel; so a ponta (ultima_vez_visto/ultimo_run_id/n_runs) estende. Alimentado so por sync_run_items_consolidar_historico_v1.';

-- Conteudo imutavel: a unica escrita permitida depois do INSERT e' estender a ponta da ilha.
create or replace function public.fn_sync_run_items_historico_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'SYNC_HISTORICO_IMUTAVEL: delete recusado (id %)', old.id;
  end if;
  if (new.competencia, new.unidade_id, new.emusys_fatura_id, new.conteudo_hash,
      new.primeira_vez_visto, new.primeiro_run_id)
     is distinct from
     (old.competencia, old.unidade_id, old.emusys_fatura_id, old.conteudo_hash,
      old.primeira_vez_visto, old.primeiro_run_id)
     or new.ultima_vez_visto < old.ultima_vez_visto
     or new.n_runs < old.n_runs then
    raise exception 'SYNC_HISTORICO_IMUTAVEL: so a ponta da ilha pode avancar (id %)', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_run_items_historico_guard
  before update or delete on public.sync_run_items_historico
  for each row execute function public.fn_sync_run_items_historico_guard();

-- ── Acesso: ⚠️ ALTER DEFAULT PRIVILEGES da authenticated=arwdDxtm a toda tabela nova ──────
revoke all on public.sync_run_items_historico from public, anon, authenticated, service_role;
revoke all on public.sync_run_retencao        from public, anon, authenticated, service_role;
grant select on public.sync_run_items_historico to service_role;
grant select on public.sync_run_retencao        to service_role;
alter table public.sync_run_items_historico enable row level security;
alter table public.sync_run_retencao        enable row level security;
create policy sync_run_items_historico_service_role_select
  on public.sync_run_items_historico for select to service_role using (true);
create policy sync_run_retencao_service_role_select
  on public.sync_run_retencao for select to service_role using (true);

-- ── Consolidacao (carga inicial E rodada diaria: a mesma funcao) ────────────────────────
create or replace function public.sync_run_items_consolidar_historico_v1(p_max_runs integer default 300)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '15min'
set work_mem to '64MB'
as $$
declare
  v_runs          integer;
  v_itens         integer;
  v_fora_ordem    jsonb;
  v_estendidas    integer := 0;
  v_novas         integer := 0;
  v_run_ids       uuid[];
begin
  -- A rodada diaria chama esta funcao em laco DENTRO de uma transacao; sem isto a 2a volta
  -- esbarra nas temporarias da 1a (on commit drop so limpa no commit).
  drop table if exists _lote, _itens, _ponta, _ilhas;

  -- Duas consolidacoes simultaneas (carga manual + cron) leriam a mesma ponta e gravariam
  -- a mesma ilha duas vezes. A 2a desiste, com status proprio -- nunca espera nem duplica.
  if not pg_try_advisory_xact_lock(hashtext('sync_run_items_consolidar_historico')) then
    return jsonb_build_object('status', 'outra_consolidacao_em_curso', 'runs', 0);
  end if;

  -- Runs elegiveis: publicados, com itens, fechados ha mais de 15 min (publish tem teto de
  -- 60s; a margem impede consolidar enquanto um publish mais antigo ainda esta commitando).
  create temporary table _lote on commit drop as
  select r.id as run_id, r.competencia, r.completed_at
  from public.sync_runs r
  where r.status = 'succeeded'
    and r.completed_at is not null
    and r.completed_at < now() - interval '15 minutes'
    and not exists (select 1 from public.sync_run_retencao t where t.run_id = r.id)
    and exists (select 1 from public.sync_run_items i where i.run_id = r.id)
  order by r.completed_at, r.id
  limit greatest(p_max_runs, 1);

  get diagnostics v_runs = row_count;
  -- Sem estatistica o planner chuta o tamanho da temporaria; na carga inicial (milhares de
  -- runs) isso decide entre ler a tabela em sequencia ou pular de indice em indice.
  analyze _lote;
  if v_runs = 0 then
    return jsonb_build_object('status', 'nada_a_fazer', 'runs', 0);
  end if;

  -- Guarda de ORDEM: consolidar um run mais velho que a ponta ja gravada da mesma
  -- competencia estenderia/abriria ilha no lugar errado. Recusa com os ids, nunca em silencio.
  select jsonb_agg(jsonb_build_object('run_id', l.run_id, 'competencia', l.competencia,
                                      'completed_at', l.completed_at, 'ponta', t.ponta))
    into v_fora_ordem
  from _lote l
  join (select competencia, max(completed_at) as ponta
        from public.sync_run_retencao group by competencia) t
    on t.competencia = l.competencia and l.completed_at <= t.ponta;
  if v_fora_ordem is not null then
    raise exception 'SYNC_HISTORICO_FORA_DE_ORDEM: %', v_fora_ordem;
  end if;

  -- So identidade + hash (~80 bytes/linha). O conteudo completo so e' lido de novo, pela
  -- PK, para o 1o item de cada ilha nova. Carregar payload aqui fazia a temporaria passar de
  -- temp_buffers e cada passada sobre ela virar leitura de disco.
  create temporary table _itens on commit drop as
  select
    i.competencia, i.unidade_id, i.emusys_fatura_id, l.completed_at as t, i.run_id,
    i.id as item_id,
    md5(row(
      i.canonical_fatura_id, i.unidade_codigo, i.emusys_matricula_id, i.emusys_contrato_id,
      i.emusys_student_id, i.descricao, i.status, i.data_vencimento, i.data_pagamento,
      i.valor_original, i.valor_pago, i.juros_e_multa, i.desconto_aplicado, i.desconto_fixo,
      i.desconto_condicional, i.payload, i.source_missing, i.source_missing_reason,
      i.source_missing_detected_at, i.source_missing_resolved_at
    )::text) as h
  from public.sync_run_items i
  join _lote l on l.run_id = i.run_id;

  get diagnostics v_itens = row_count;
  analyze _itens;

  -- Ponta atual de cada fatura tocada pelo lote.
  create temporary table _ponta on commit drop as
  select distinct on (h.competencia, h.unidade_id, h.emusys_fatura_id)
         h.id, h.competencia, h.unidade_id, h.emusys_fatura_id, h.conteudo_hash
  from public.sync_run_items_historico h
  where (h.competencia, h.unidade_id, h.emusys_fatura_id) in
        (select distinct competencia, unidade_id, emusys_fatura_id from _itens)
  order by h.competencia, h.unidade_id, h.emusys_fatura_id, h.ultima_vez_visto desc, h.id desc;

  -- Ilhas: nova ilha quando o hash muda em relacao ao item anterior da mesma fatura;
  -- para o 1o item do lote, compara contra a ponta ja gravada. grp = 0 estende a ponta.
  create temporary table _ilhas on commit drop as
  with marcado as (
    select x.*,
           case
             when lag(x.h) over w is null then (p.conteudo_hash is distinct from x.h)
             else (x.h is distinct from lag(x.h) over w)
           end as abre_ilha,
           p.id as ponta_id
    from _itens x
    left join _ponta p using (competencia, unidade_id, emusys_fatura_id)
    window w as (partition by x.competencia, x.unidade_id, x.emusys_fatura_id order by x.t, x.run_id)
  )
  select m.*,
         sum(m.abre_ilha::int) over (partition by m.competencia, m.unidade_id, m.emusys_fatura_id
                                     order by m.t, m.run_id) as grp
  from marcado m;

  -- grp = 0: mesma fatura, mesmo conteudo da ponta -> so estende.
  with ext as (
    select ponta_id,
           max(t) as ult,
           (array_agg(run_id order by t desc, run_id desc))[1] as ult_run,
           count(*) as n
    from _ilhas
    where grp = 0 and ponta_id is not null
    group by ponta_id
  )
  update public.sync_run_items_historico h
     set ultima_vez_visto = ext.ult,
         ultimo_run_id    = ext.ult_run,
         n_runs           = h.n_runs + ext.n
    from ext
   where h.id = ext.ponta_id;
  get diagnostics v_estendidas = row_count;

  -- grp >= 1: ilha nova. Conteudo identico dentro da ilha por construcao; le o 1o item pela PK.
  insert into public.sync_run_items_historico (
    competencia, unidade_id, emusys_fatura_id, canonical_fatura_id, unidade_codigo,
    emusys_matricula_id, emusys_contrato_id, emusys_student_id, descricao, status,
    data_vencimento, data_pagamento, valor_original, valor_pago, juros_e_multa,
    desconto_aplicado, desconto_fixo, desconto_condicional, payload, source_missing,
    source_missing_reason, source_missing_detected_at, source_missing_resolved_at,
    conteudo_hash, primeira_vez_visto, ultima_vez_visto, primeiro_run_id, ultimo_run_id, n_runs
  )
  select
    x.competencia, x.unidade_id, x.emusys_fatura_id, s.canonical_fatura_id, s.unidade_codigo,
    s.emusys_matricula_id, s.emusys_contrato_id, s.emusys_student_id, s.descricao, s.status,
    s.data_vencimento, s.data_pagamento, s.valor_original, s.valor_pago, s.juros_e_multa,
    s.desconto_aplicado, s.desconto_fixo, s.desconto_condicional, s.payload, s.source_missing,
    s.source_missing_reason, s.source_missing_detected_at, s.source_missing_resolved_at,
    x.h, x.pri, x.ult, x.pri_run, x.ult_run, x.n
  from (
    select distinct on (competencia, unidade_id, emusys_fatura_id, grp)
      competencia, unidade_id, emusys_fatura_id, h, item_id,
      min(t)   over g as pri,
      max(t)   over g as ult,
      first_value(run_id) over (g order by t, run_id rows between unbounded preceding and unbounded following) as pri_run,
      first_value(run_id) over (g order by t desc, run_id desc rows between unbounded preceding and unbounded following) as ult_run,
      count(*) over g as n
    from _ilhas
    where grp >= 1
    window g as (partition by competencia, unidade_id, emusys_fatura_id, grp)
    order by competencia, unidade_id, emusys_fatura_id, grp, t, run_id
  ) x
  join public.sync_run_items s on s.id = x.item_id;
  get diagnostics v_novas = row_count;

  if v_novas <> (select count(*) from (select distinct competencia, unidade_id, emusys_fatura_id, grp
                                       from _ilhas where grp >= 1) z) then
    raise exception 'SYNC_HISTORICO_ILHA_PERDIDA: % ilhas gravadas, esperadas %', v_novas,
      (select count(*) from (select distinct competencia, unidade_id, emusys_fatura_id, grp
                             from _ilhas where grp >= 1) z);
  end if;

  -- Guarda: todo item do lote tem de ter ido para uma ilha (estendida ou nova).
  if (select count(*) from _ilhas where grp = 0 and ponta_id is null) > 0 then
    raise exception 'SYNC_HISTORICO_ITEM_SEM_ILHA: grp 0 sem ponta (defeito da funcao)';
  end if;

  -- ⚠️ Contagem AGRUPADA, nunca subconsulta por run: _itens passa de 150 MB e nao cabe em
  -- temp_buffers (8 MB), entao cada subconsulta relia a tabela do disco -- 100 runs = ~15 GB
  -- de leitura por lote. Medido em 23/09: lote de 6 min e o app inteiro lento junto.
  insert into public.sync_run_retencao (run_id, competencia, completed_at, itens_consolidados)
  select l.run_id, l.competencia, l.completed_at, coalesce(c.n, 0)
  from _lote l
  left join (select run_id, count(*)::int as n from _itens group by run_id) c
    on c.run_id = l.run_id;

  select array_agg(run_id order by completed_at) into v_run_ids from _lote;

  return jsonb_build_object(
    'status', 'ok',
    'runs', v_runs,
    'itens_lidos', v_itens,
    'ilhas_estendidas', v_estendidas,
    'ilhas_novas', v_novas,
    'primeiro_run', v_run_ids[1],
    'ultimo_run', v_run_ids[array_length(v_run_ids, 1)]
  );
end;
$$;

-- ── Conferencia: reconstroi runs a partir do historico e compara com a foto real ───────
-- 0 divergencias nos dois sentidos = o historico responde "o que o Emusys dizia em T"
-- exatamente como a foto. Usada antes do passo 2 (swap) e pode rodar a qualquer momento.
create or replace function public.sync_run_items_historico_conferir_v1(p_amostra integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '15min'
as $$
declare
  v_resultado jsonb;
begin
  with amostra as (
    select t.run_id, t.completed_at
    from public.sync_run_retencao t
    where t.expurgado_em is null
    order by random()
    limit greatest(p_amostra, 1)
  ),
  foto as (
    select a.run_id, i.competencia, i.unidade_id, i.emusys_fatura_id,
           md5(row(
             i.canonical_fatura_id, i.unidade_codigo, i.emusys_matricula_id, i.emusys_contrato_id,
             i.emusys_student_id, i.descricao, i.status, i.data_vencimento, i.data_pagamento,
             i.valor_original, i.valor_pago, i.juros_e_multa, i.desconto_aplicado, i.desconto_fixo,
             i.desconto_condicional, i.payload, i.source_missing, i.source_missing_reason,
             i.source_missing_detected_at, i.source_missing_resolved_at
           )::text) as h
    from amostra a
    join public.sync_run_items i on i.run_id = a.run_id
  ),
  reconstruida as (
    select a.run_id, h.competencia, h.unidade_id, h.emusys_fatura_id, h.conteudo_hash as h
    from amostra a
    join public.sync_run_retencao t on t.run_id = a.run_id
    join public.sync_run_items_historico h
      on h.competencia = t.competencia
     and a.completed_at between h.primeira_vez_visto and h.ultima_vez_visto
  ),
  so_foto as (select * from foto except select * from reconstruida),
  so_hist as (select * from reconstruida except select * from foto)
  select jsonb_build_object(
    'runs_conferidos', (select count(*) from amostra),
    'linhas_foto', (select count(*) from foto),
    'so_na_foto', (select count(*) from so_foto),
    'so_no_historico', (select count(*) from so_hist),
    'exemplos_so_na_foto', (select jsonb_agg(to_jsonb(s)) from (select * from so_foto limit 5) s),
    'exemplos_so_no_historico', (select jsonb_agg(to_jsonb(s)) from (select * from so_hist limit 5) s)
  ) into v_resultado;
  return v_resultado;
end;
$$;

-- ⚠️ Funcao nova nasce com EXECUTE para anon via default privileges do dashboard; fechar nominal.
revoke all on function public.sync_run_items_consolidar_historico_v1(integer) from public, anon, authenticated;
revoke all on function public.sync_run_items_historico_conferir_v1(integer)   from public, anon, authenticated;
grant execute on function public.sync_run_items_consolidar_historico_v1(integer) to service_role;
grant execute on function public.sync_run_items_historico_conferir_v1(integer)   to service_role;

-- ── Guarda de saida ─────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_class c
    where c.oid in ('public.sync_run_items_historico'::regclass, 'public.sync_run_retencao'::regclass)
      and (not c.relrowsecurity or c.relacl::text ~ '(^|[{,])(anon|authenticated)=')
  ) then
    raise exception 'GUARDA: tabela nova com RLS desligado ou acesso de anon/authenticated';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.proname in ('sync_run_items_consolidar_historico_v1', 'sync_run_items_historico_conferir_v1')
      and (p.proacl is null or p.proacl::text ~ '(^|[{,])(anon|authenticated)?=X')
  ) then
    raise exception 'GUARDA: funcao nova executavel por anon/authenticated/public';
  end if;
end $$;
