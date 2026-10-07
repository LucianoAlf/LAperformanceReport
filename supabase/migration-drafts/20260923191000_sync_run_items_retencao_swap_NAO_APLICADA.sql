-- LAPE-43 · RETENCAO DE sync_run_items · PASSO 2 de 3: REGRA DE PROTECAO + TROCA
--
-- 🔴 ESTE E' O PASSO QUE MUDA O QUE FICA GUARDADO. Rodar com `psql -1` (tudo ou nada).
--
-- PRE-REQUISITOS (a guarda de entrada recusa se faltar):
--   1. Passo 1 aplicado e a carga inicial do historico CONCLUIDA:
--        select public.sync_run_items_consolidar_historico_v1(300);  -- repetir ate 'nada_a_fazer'
--   2. Conferencia limpa: select public.sync_run_items_historico_conferir_v1(50);
--        -> so_na_foto = 0 e so_no_historico = 0
--   3. Janela quieta: 09:00-10:59 UTC (06h-07h BRT). Nenhum cron de faturas roda nela
--      (282: fora de 9-10h; 283/284: fora de 5h e 9-10h; 285: horas pares exceto 10h;
--      286: 05h). So o refresh sob demanda do Super Folha pode publicar -- e ele espera o
--      lock (ou falha e a fila refaz com backoff).
--
-- O QUE FICA na tabela nova (regra unica, sync_run_items_runs_protegidos_v1 -- a MESMA que a
-- poda diaria do passo 3 usa):
--   - o ultimo run de cada competencia pela regra dos LEITORES (live/succeeded/snapshot
--     completo/3 unidades, completed_at desc) -- e' o unico run que as telas leem;
--   - o baseline da PUBLICACAO (succeeded com itens, live primeiro) -- e' contra ele que
--     publish_financeiro_sync_run compara o proximo run e copia os tombstones;
--   - todo run dos ultimos 7 dias (e os ainda sem completed_at);
--   - todo run citado em sync_run_overrides (hoje zero).
--   O resto sai. O cabecalho em sync_runs continua e o conteudo continua no historico.
--
-- COMO (para as telas nao esperarem): a tabela nova e' montada INTEIRA ao lado -- dados,
-- indices com nome provisorio, FKs, grants, RLS, policies, trigger -- sob um lock que so
-- bloqueia ESCRITA. O unico trecho que bloqueia leitura e' o rename final, que so mexe em
-- catalogo. ⚠️ Nao criar indice depois do rename: o ACCESS EXCLUSIVE seguraria as telas.
--
-- TRIGGER: a nova continua append-only, com UMA excecao: DELETE quando a transacao declara
-- set_config('app.poda_sync_run_items','on',true) -- so sync_run_items_podar_v1 faz isso.
-- ⚠️ Nao e' fronteira de seguranca: so o dono (postgres) tem DELETE; o flag protege contra
-- DELETE acidental, nao contra quem ja e' superusuario. A funcao compartilhada
-- fn_financeiro_snapshot_append_only NAO foi tocada (sync_runs/overrides/source_events a usam).
--
-- A ANTIGA fica como sync_run_items_antiga (12 GB, com o trigger append-only original) ate
-- decisao explicita de apagar. O espaco so volta ao disco com o DROP dela.
--
-- ROLLBACK (enquanto a antiga existir; os runs gravados DEPOIS da troca estao so na nova):
--   begin;
--     lock table public.sync_run_items in access exclusive mode;
--     insert into public.sync_run_items_antiga
--       select n.* from public.sync_run_items n
--       where not exists (select 1 from public.sync_run_items_antiga a where a.id = n.id);
--     alter table public.sync_run_items rename to sync_run_items_retida;
--     alter table public.sync_run_items_antiga rename to sync_run_items;
--     -- depois: renomear de volta constraints/indices *_antiga e apagar sync_run_items_retida
--   commit;

set local lock_timeout = '30s';
-- O global e' 2min; copiar ~2 mi de linhas e montar 5 indices passa disso.
set local statement_timeout = '15min';

-- ── Regra unica de protecao (usada aqui e na poda diaria) ────────────────────────────────
create or replace function public.sync_run_items_runs_protegidos_v1(p_dias integer default 7)
returns table (run_id uuid, motivo text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  (select distinct on (r.competencia) r.id, 'ultimo_run_leitores'
   from public.sync_runs r
   where r.run_type = 'live' and r.status = 'succeeded' and r.snapshot_complete is true
     and r.unidades_concluidas = 3 and r.completed_at is not null
   order by r.competencia, r.completed_at desc, r.id desc)
  union all
  (select distinct on (r.competencia) r.id, 'baseline_publicacao'
   from public.sync_runs r
   where r.status = 'succeeded'
     and exists (select 1 from public.sync_run_items i where i.run_id = r.id)
   order by r.competencia, (r.run_type = 'live') desc, r.completed_at desc, r.id desc)
  union all
  select r.id, 'janela_' || greatest(p_dias, 1) || '_dias'
  from public.sync_runs r
  where r.completed_at is null or r.completed_at >= now() - make_interval(days => greatest(p_dias, 1))
  union all
  select o.run_id, 'override' from public.sync_run_overrides o
  union all
  select o.baseline_run_id, 'override_baseline' from public.sync_run_overrides o
  where o.baseline_run_id is not null
$$;

revoke all on function public.sync_run_items_runs_protegidos_v1(integer) from public, anon, authenticated;
grant execute on function public.sync_run_items_runs_protegidos_v1(integer) to service_role;

-- ── Trigger da nova: append-only com a porta da poda ─────────────────────────────────────
create or replace function public.fn_sync_run_items_append_only_com_poda()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' and current_setting('app.poda_sync_run_items', true) = 'on' then
    return old;
  end if;
  raise exception 'FINANCEIRO_SYNC_IMUTAVEL: % e append-only (DELETE so pela poda de retencao, run %)',
    tg_table_name, coalesce(old.run_id::text, '?');
end;
$$;

-- ── Guarda de entrada ───────────────────────────────────────────────────────────────────
do $$
declare
  v_nao_consolidados jsonb;
begin
  if to_regclass('public.sync_run_items_historico') is null
     or to_regclass('public.sync_run_retencao') is null then
    raise exception 'PRE-REQUISITO: passo 1 (historico) nao aplicado';
  end if;
  if to_regclass('public.sync_run_items_antiga') is not null then
    raise exception 'PRE-REQUISITO: sync_run_items_antiga ja existe (troca ja feita?)';
  end if;

  -- Todo run que VAI SAIR precisa estar no historico, senao o conteudo dele se perde.
  select jsonb_agg(r.id) into v_nao_consolidados
  from public.sync_runs r
  where exists (select 1 from public.sync_run_items i where i.run_id = r.id)
    and r.id not in (select p.run_id from public.sync_run_items_runs_protegidos_v1(7) p)
    and not exists (select 1 from public.sync_run_retencao t where t.run_id = r.id);
  if v_nao_consolidados is not null then
    raise exception 'PRE-REQUISITO: runs que sairiam sem estar no historico: %', v_nao_consolidados;
  end if;
end $$;

-- Bloqueia ESCRITA (publish espera ou falha e a fila refaz). Leitura segue livre.
lock table public.sync_run_items in share row exclusive mode;

-- ── Montagem da nova, inteira, ao lado ──────────────────────────────────────────────────
create temporary table _defs on commit drop as
select 'constraint'::text as tipo, c.conname::text as nome, c.contype::text as contype,
       pg_get_constraintdef(c.oid) as def, c.conindid as indexrelid
from pg_constraint c
where c.conrelid = 'public.sync_run_items'::regclass and c.contype in ('p', 'u', 'f')
union all
select 'index', ic.relname::text, null, pg_get_indexdef(i.indexrelid), i.indexrelid
from pg_index i
join pg_class ic on ic.oid = i.indexrelid
where i.indrelid = 'public.sync_run_items'::regclass
  and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid);

-- Sem indices no LIKE: eles sao criados abaixo, depois dos dados (mais rapido) e com
-- nome provisorio (nome de indice e' unico no schema; o original ainda esta em uso).
create table public.sync_run_items_nova
  (like public.sync_run_items including all excluding indexes);

insert into public.sync_run_items_nova
select i.*
from public.sync_run_items i
where i.run_id in (select p.run_id from public.sync_run_items_runs_protegidos_v1(7) p);

do $$
declare d record;
begin
  -- Indices dos constraints PK/UNIQUE e indices simples, com nome provisorio *_nova.
  for d in
    select * from _defs where tipo = 'index' or contype in ('p', 'u')
  loop
    if d.tipo = 'constraint' then
      execute replace(
        replace(pg_get_indexdef(d.indexrelid), 'INDEX ' || quote_ident(d.nome) || ' ON', 'INDEX ' || quote_ident(d.nome || '_nova') || ' ON'),
        ' ON public.sync_run_items USING', ' ON public.sync_run_items_nova USING');
    else
      execute replace(
        replace(d.def, 'INDEX ' || quote_ident(d.nome) || ' ON', 'INDEX ' || quote_ident(d.nome || '_nova') || ' ON'),
        ' ON public.sync_run_items USING', ' ON public.sync_run_items_nova USING');
    end if;
  end loop;

  -- FKs: nome de constraint e' por tabela, entao ja nascem com o nome original.
  for d in select * from _defs where contype = 'f' loop
    execute format('alter table public.sync_run_items_nova add constraint %I %s', d.nome, d.def);
  end loop;
end $$;

-- Grants: copia EXATA da antiga. ⚠️ Default privileges deram tudo a anon/authenticated.
revoke all on public.sync_run_items_nova from public, anon, authenticated, service_role;
do $$
declare g record;
begin
  for g in
    select a.privilege_type,
           case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end as quem
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
    left join pg_roles r on r.oid = a.grantee
    where c.oid = 'public.sync_run_items'::regclass
      and a.grantee <> c.relowner
  loop
    execute format('grant %s on public.sync_run_items_nova to %s', g.privilege_type, g.quem);
  end loop;
end $$;

-- RLS + policies: copia da antiga.
alter table public.sync_run_items_nova enable row level security;
do $$
declare p record;
begin
  for p in select * from pg_policies where schemaname = 'public' and tablename = 'sync_run_items' loop
    execute format('create policy %I on public.sync_run_items_nova as %s for %s to %s%s%s',
      p.policyname, p.permissive, p.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(p.roles) x),
      case when p.qual is not null then ' using (' || p.qual || ')' else '' end,
      case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end);
  end loop;
end $$;

create trigger trg_sync_run_items_append_only
  before update or delete on public.sync_run_items_nova
  for each row execute function public.fn_sync_run_items_append_only_com_poda();

comment on table public.sync_run_items_nova is
  'Foto completa por run/competencia/unidade/fatura, incluindo tombstones de nao confirmacao pela origem. Append-only; RETENCAO (LAPE-43): ficam os runs de sync_run_items_runs_protegidos_v1 (ultimo run por competencia, baseline da publicacao, ultimos 7 dias, overrides) e a poda diaria remove o resto. Historico permanente de cada versao em sync_run_items_historico.';

-- Guarda antes do ponto de nao-retorno: cada run retido com a MESMA contagem.
do $$
declare v_div jsonb;
begin
  select jsonb_agg(x) into v_div
  from (
    select p.run_id,
           (select count(*) from public.sync_run_items i where i.run_id = p.run_id) as antiga,
           (select count(*) from public.sync_run_items_nova n where n.run_id = p.run_id) as nova
    from (select distinct run_id from public.sync_run_items_runs_protegidos_v1(7)) p
  ) x
  where x.antiga <> x.nova;
  if v_div is not null then
    raise exception 'GUARDA: contagem por run divergiu: %', v_div;
  end if;
end $$;

-- ── Troca (unico trecho que bloqueia leitura: so catalogo) ──────────────────────────────
alter table public.sync_run_items rename to sync_run_items_antiga;

do $$
declare d record;
begin
  -- Libera os nomes originais na antiga.
  for d in select * from _defs where tipo = 'constraint' loop
    execute format('alter table public.sync_run_items_antiga rename constraint %I to %I',
                   d.nome, d.nome || '_antiga');
  end loop;
  for d in select * from _defs where tipo = 'index' loop
    execute format('alter index public.%I rename to %I', d.nome, d.nome || '_antiga');
  end loop;
end $$;

alter table public.sync_run_items_nova rename to sync_run_items;

do $$
declare d record;
begin
  for d in select * from _defs where tipo = 'index' loop
    execute format('alter index public.%I rename to %I', d.nome || '_nova', d.nome);
  end loop;
  -- PK/UNIQUE reaproveitam o indice ja construido: so catalogo.
  for d in select * from _defs where contype = 'p' loop
    execute format('alter table public.sync_run_items add constraint %I primary key using index %I',
                   d.nome, d.nome || '_nova');
  end loop;
  for d in select * from _defs where contype = 'u' loop
    execute format('alter table public.sync_run_items add constraint %I unique using index %I',
                   d.nome, d.nome || '_nova');
  end loop;
end $$;

-- Marca no controle os runs que ficaram so no historico.
update public.sync_run_retencao t
   set expurgado_em = now(),
       itens_expurgados = t.itens_consolidados
 where t.expurgado_em is null
   and t.run_id not in (select p.run_id from public.sync_run_items_runs_protegidos_v1(7) p);

-- ── Guarda de saida ─────────────────────────────────────────────────────────────────────
do $$
declare
  v_nova oid := 'public.sync_run_items'::regclass;
  v_antiga oid := 'public.sync_run_items_antiga'::regclass;
begin
  if exists (
    (select a.grantee, a.privilege_type from pg_class c, aclexplode(c.relacl) a
      where c.oid = v_antiga and a.grantee <> c.relowner
     except
     select a.grantee, a.privilege_type from pg_class c, aclexplode(c.relacl) a
      where c.oid = v_nova and a.grantee <> c.relowner)
    union all
    (select a.grantee, a.privilege_type from pg_class c, aclexplode(c.relacl) a
      where c.oid = v_nova and a.grantee <> c.relowner
     except
     select a.grantee, a.privilege_type from pg_class c, aclexplode(c.relacl) a
      where c.oid = v_antiga and a.grantee <> c.relowner)
  ) then
    raise exception 'GUARDA: ACL da nova difere da antiga';
  end if;
  if not (select relrowsecurity from pg_class where oid = v_nova) then
    raise exception 'GUARDA: RLS desligado na nova';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'sync_run_items')
     <> (select count(*) from pg_policies where schemaname = 'public' and tablename = 'sync_run_items_antiga') then
    raise exception 'GUARDA: numero de policies difere';
  end if;
  if (select count(*) from pg_index where indrelid = v_nova)
     <> (select count(*) from pg_index where indrelid = v_antiga) then
    raise exception 'GUARDA: numero de indices difere';
  end if;
  if (select count(*) from pg_constraint where conrelid = v_nova)
     <> (select count(*) from pg_constraint where conrelid = v_antiga) then
    raise exception 'GUARDA: numero de constraints difere';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = v_nova and tgname = 'trg_sync_run_items_append_only') then
    raise exception 'GUARDA: trigger append-only ausente na nova';
  end if;
  -- Todo leitor tem de achar o seu run: o ultimo de cada competencia esta na nova.
  if exists (
    select 1
    from public.sync_run_items_runs_protegidos_v1(7) p
    where p.motivo = 'ultimo_run_leitores'
      and not exists (select 1 from public.sync_run_items i where i.run_id = p.run_id)
  ) then
    raise exception 'GUARDA: ultimo run de alguma competencia ficou sem itens';
  end if;
end $$;
