-- Mantem o relatorio consolidado e a proveniencia da fila coerentes com o
-- rollout. Em sombra/legado, o consolidado inteiro permanece legado; somente
-- quando todas as unidades estiverem canonico_v2 ele publica o corpo v2.

create or replace function public.fn_texto_relatorio_presenca_consolidado_legado_v1(
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_u record;
  v_corpo text := '';
  v_alguma_unidade boolean := false;
begin
  for v_u in
    select u.id
      from public.unidades u
     where exists (
       select 1 from public.aulas_emusys ae
        where ae.unidade_id = u.id
          and ae.data_aula = p_data
          and ae.data_hora_fim < now()
          and coalesce(ae.categoria, 'normal') = 'normal'
          and not coalesce(ae.cancelada, false)
          and ae.professor_id is not null
     )
     order by u.nome
  loop
    v_alguma_unidade := true;
    v_corpo := v_corpo || E'\n'
      || public.fn_texto_relatorio_presenca_legado_v1(v_u.id, p_data);
  end loop;
  if not v_alguma_unidade then return null; end if;
  return 'PRESENCA - PENDENCIAS CONSOLIDADO' || E'\n'
    || to_char(p_data, 'DD/MM/YYYY') || E'\n' || v_corpo;
end;
$$;

create or replace function public.fn_texto_relatorio_presenca_consolidado_canonico_v2(
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_u record;
  v_corpo text := '';
  v_alguma_unidade boolean := false;
begin
  for v_u in
    select u.id
      from public.unidades u
     where exists (
       select 1 from public.aulas_emusys ae
        where ae.unidade_id = u.id
          and ae.data_aula = p_data
          and ae.data_hora_fim < now()
          and coalesce(ae.categoria, 'normal') = 'normal'
          and not coalesce(ae.cancelada, false)
          and ae.professor_id is not null
     )
     order by u.nome
  loop
    v_alguma_unidade := true;
    v_corpo := v_corpo || E'\n'
      || public.fn_texto_relatorio_presenca_canonica_v2(v_u.id, p_data);
  end loop;
  if not v_alguma_unidade then return null; end if;
  return 'PRESENCA - PENDENCIAS CONSOLIDADO' || E'\n'
    || to_char(p_data, 'DD/MM/YYYY') || E'\n' || v_corpo;
end;
$$;

create or replace function public.fn_texto_relatorio_presenca_consolidado(
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text := public.fn_presenca_rollout_modo_escopo_interno_v1(null, 'sol');
begin
  if v_modo = 'canonico_v2' then
    return public.fn_texto_relatorio_presenca_consolidado_canonico_v2(p_data);
  end if;
  if v_modo = 'sombra' then
    begin
      perform public.fn_texto_relatorio_presenca_consolidado_canonico_v2(p_data);
    exception when others then
      null;
    end;
  end if;
  return public.fn_texto_relatorio_presenca_consolidado_legado_v1(p_data);
end;
$$;

revoke all on function public.fn_texto_relatorio_presenca_consolidado_legado_v1(date)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_texto_relatorio_presenca_consolidado_canonico_v2(date)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_texto_relatorio_presenca_consolidado(date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca_consolidado(date)
  to service_role;

create or replace function public.fn_presenca_fila_proveniencia_rollout_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text;
begin
  if new.tipo_relatorio not in ('presenca_pendencias', 'presenca_pendencias_consolidado')
     or coalesce(new.metadata ->> 'regra_versao', '') <> 'presenca-v2' then
    return new;
  end if;
  v_modo := public.fn_presenca_rollout_modo_escopo_interno_v1(new.unidade_id, 'sol');
  if v_modo <> 'canonico_v2' then
    new.metadata := jsonb_set(
      jsonb_set(coalesce(new.metadata, '{}'::jsonb),
        '{regra_versao}', '"presenca-legado-v1"'::jsonb, true),
      '{fonte}', '"fn_texto_relatorio_presenca_legado_v1"'::jsonb, true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.fn_presenca_fila_proveniencia_rollout_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_presenca_fila_proveniencia_rollout
  on public.fila_relatorios_sol_hermes;
create trigger trg_presenca_fila_proveniencia_rollout
before insert or update of tipo_relatorio, unidade_id, metadata
on public.fila_relatorios_sol_hermes
for each row execute function public.fn_presenca_fila_proveniencia_rollout_v1();

comment on function public.fn_texto_relatorio_presenca_consolidado(date) is
  'Consolidado governado: sombra calcula v2 e entrega legado; so publica v2 quando todas as unidades em sol estao canonico_v2.';
