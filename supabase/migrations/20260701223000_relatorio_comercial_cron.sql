-- P0R1: Toggle independente do envio automatico do relatorio diario comercial.
-- O cron existente chama relatorio-admin-whatsapp; a edge passa a enfileirar
-- tambem o relatorio comercial quando esta flag estiver ativa.

alter table public.unidades
  add column if not exists relatorio_comercial_diario_cron_ativo boolean not null default false;

comment on column public.unidades.relatorio_comercial_diario_cron_ativo is
  'Controla envio automatico do relatorio diario comercial por WhatsApp. Independente do relatorio administrativo.';

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

  update public.unidades
     set relatorio_comercial_diario_cron_ativo = p_ativo
   where id = p_unidade_id;
end;
$$;

grant execute on function public.toggle_relatorio_comercial_cron(uuid, boolean) to authenticated;

-- O Comercial usa os mesmos grupos dos relatorios diarios, mas com tipo logico
-- proprio para permitir evoluir permissao/roteamento sem misturar flags.
insert into public.whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id, ativo)
select
  'relatorio_comercial' as tipo,
  nome,
  jid,
  unidade_id,
  ativo
from public.whatsapp_destinatarios_relatorio admin_dest
where admin_dest.tipo = 'relatorio_admin'
  and not exists (
    select 1
    from public.whatsapp_destinatarios_relatorio comercial_dest
    where comercial_dest.tipo = 'relatorio_comercial'
      and comercial_dest.unidade_id is not distinct from admin_dest.unidade_id
      and comercial_dest.jid = admin_dest.jid
  );
