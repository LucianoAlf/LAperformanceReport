-- 2026-08-12 — Calendário provisório para contratos rolling
--
-- Um contrato que começa em outubro/2026 projeta até setembro/2027 — e o
-- calendário 2027 da escola talvez ainda não exista. O motor precisa suportar
-- calendário provisório: feriados nacionais do ano seguinte (conhecidos por lei)
-- mais o padrão de recessos da escola do ano anterior.
--
-- Quando o calendário oficial de 2027 for lançado, recálculo em massa.

-- 1. Adicionar is_provisional em projecao_aulas
alter table projecao_aulas add column if not exists is_provisional boolean not null default false;
comment on column projecao_aulas.is_provisional is
  'True quando a projeção usa calendário provisório (ano seguinte ainda não oficializado)';

-- 2. Função que retorna o calendário provisório de um ano
--    Usa feriados nacionais do ano + padrão de recessos do ano anterior
create or replace function public.get_calendario_provisorio(
  p_unidade_id uuid,
  p_ano integer
)
returns table(
  data date,
  tipo text, -- 'feriado', 'recesso', 'emenda'
  nome text,
  fonte text -- 'nacional', 'padrao_ano_anterior'
)
language sql
stable
set search_path to 'public'
as $function$
  -- Feriados nacionais do ano (sempre existem, são por lei)
  select
    f.data,
    'feriado' as tipo,
    f.nome,
    'nacional' as fonte
  from feriados f
  where f.ativo = true
    and extract(year from f.data) = p_ano

  union all

  -- Padrão de recessos do ano anterior (Carnaval, julho, dezembro)
  select
    (ce.data_inicio + interval '1 year')::date as data,
    'recesso' as tipo,
    ce.nome,
    'padrao_ano_anterior' as fonte
  from calendario_escolar ce
  where ce.unidade_id = p_unidade_id
    and ce.ano = p_ano - 1
    and ce.tipo = 'recesso'
    and ce.status = 'confirmado'

  union all

  -- Padrão de emendas do ano anterior
  select
    (ce.data_inicio + interval '1 year')::date as data,
    'emenda' as tipo,
    ce.nome,
    'padrao_ano_anterior' as fonte
  from calendario_escolar ce
  where ce.unidade_id = p_unidade_id
    and ce.ano = p_ano - 1
    and ce.tipo = 'emenda'
    and ce.status = 'confirmado'

  order by data;
$function$;

revoke all on function public.get_calendario_provisorio(uuid, integer) from public;
revoke all on function public.get_calendario_provisorio(uuid, integer) from anon;
grant execute on function public.get_calendario_provisorio(uuid, integer) to authenticated;
grant execute on function public.get_calendario_provisorio(uuid, integer) to service_role;
