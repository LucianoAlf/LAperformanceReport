-- Comercial automático ainda não tem cron Hermes-native validado.
-- Mantém Comercial no modo manual via Sol/Hermes e impede UI antiga de religar flag falsa.

create or replace function public.toggle_relatorio_comercial_cron(
  p_unidade_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado';
  end if;

  if p_ativo is true then
    raise exception 'Comercial automatico ainda nao esta habilitado. Use envio manual via Sol/Hermes.';
  end if;

  update public.unidades
     set relatorio_comercial_diario_cron_ativo = false
   where id = p_unidade_id;
end;
$$;

update public.unidades
   set relatorio_comercial_diario_cron_ativo = false
 where coalesce(relatorio_comercial_diario_cron_ativo, false) = true;
