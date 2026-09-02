export const SQL_TABELAS = `
select c.relname as nome,
       case c.relkind when 'r' then 'tabela' else 'view' end as tipo,
       c.relrowsecurity as rls,
       case when c.relkind = 'r' then greatest(c.reltuples, 0)::bigint else null end as linhas,
       coalesce(obj_description(c.oid), '') as comentario
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by c.relname`;

export const SQL_COLUNAS = `
select c.relname as tabela, a.attname as coluna,
       format_type(a.atttypid, a.atttypmod) as tipo,
       not a.attnotnull as nulo,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '') as padrao,
       coalesce(col_description(c.oid, a.attnum), '') as comentario
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r', 'v')
order by c.relname, a.attnum`;

export const SQL_FKS = `
select src.relname as tabela, att.attname as coluna,
       tgt.relname as ref_tabela, att2.attname as ref_coluna
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace n on n.oid = src.relnamespace
join unnest(con.conkey) with ordinality as k(attnum, ord) on true
join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
join pg_attribute att on att.attrelid = src.oid and att.attnum = k.attnum
join pg_attribute att2 on att2.attrelid = tgt.oid and att2.attnum = fk.attnum
where con.contype = 'f' and n.nspname = 'public'
order by src.relname, att.attname`;

export const SQL_POLICIES = `
select tablename as tabela, count(*)::int as total
from pg_policies
where schemaname = 'public'
group by tablename`;

export const SQL_INDICES_UNICOS = `
select tablename as tabela, indexname as indice
from pg_indexes
where schemaname = 'public' and indexdef ilike 'create unique%'
order by tablename, indexname`;

export const SQL_TRIGGERS = `
select c.relname as tabela, t.tgname as trigger, p.proname as funcao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and n.nspname = 'public'
order by c.relname, t.tgname`;

export const SQL_FUNCOES = `
select p.proname as nome,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as secdef,
       p.prorettype::regtype::text as retorno,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado,
       coalesce(p.prosrc, '') as corpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  -- Funcao que pertence a uma extensao (pg_trgm, unaccent) nao e nossa: entra
  -- no schema public por instalacao e poluiria o catalogo com dezenas de
  -- entradas que ninguem mantem nem pode alterar.
  and not exists (
    select 1 from pg_depend d
    where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid)`;

export const SQL_VIEWS_DEF = `
select c.relname as nome, pg_get_viewdef(c.oid) as corpo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname`;

export const SQL_CRON = `
select jobname, command, active
from cron.job
order by jobname`;
