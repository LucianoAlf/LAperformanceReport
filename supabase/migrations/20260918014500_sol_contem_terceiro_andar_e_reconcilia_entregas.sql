-- Contenção fail-closed do Terceiro Andar da Sol.
--
-- Escopo:
--   1. desligar os dois switches independentes;
--   2. desativar os destinatários proativos da Sol;
--   3. fazer o status de radar_entregas acompanhar a fila real;
--   4. reconciliar apenas entregas com vínculo canônico fila:<id>.
--
-- Não envia mensagem, não altera sinais, Caixa, fatos financeiros ou filas.

create table if not exists public.sol_terceiro_andar_contencao_auditoria_v1 (
  run_id uuid primary key default gen_random_uuid(),
  migration_key text not null,
  captured_at timestamptz not null default now(),
  switches jsonb not null,
  recipients jsonb not null,
  deliveries jsonb not null,
  rolled_back_at timestamptz
);

create unique index if not exists sol_terceiro_andar_contencao_ativa_uidx
  on public.sol_terceiro_andar_contencao_auditoria_v1 (migration_key)
  where rolled_back_at is null;

alter table public.sol_terceiro_andar_contencao_auditoria_v1 enable row level security;
revoke all on table public.sol_terceiro_andar_contencao_auditoria_v1
  from public, anon, authenticated;
grant select on table public.sol_terceiro_andar_contencao_auditoria_v1 to service_role;

do $snapshot$
declare
  v_ativa integer;
  v_switches integer;
begin
  select count(*) into v_ativa
    from public.sol_terceiro_andar_contencao_auditoria_v1
   where migration_key = 'third_floor_containment_v1'
     and rolled_back_at is null;

  if v_ativa = 0 then
    select count(*) into v_switches
      from public.automacoes_config
     where slug in ('radar_pauta_grupo', 'radar_bloco_sinais_comercial');
    if v_switches <> 2 then
      raise exception 'TERCEIRO_ANDAR_SWITCHES_INCOMPLETOS esperado=2 atual=%', v_switches;
    end if;

    insert into public.sol_terceiro_andar_contencao_auditoria_v1
      (migration_key, switches, recipients, deliveries)
    select
      'third_floor_containment_v1',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'slug', c.slug, 'ativo', c.ativo, 'updated_at', c.updated_at
        ) order by c.slug)
          from public.automacoes_config c
         where c.slug in ('radar_pauta_grupo', 'radar_bloco_sinais_comercial')
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('id', d.id, 'ativo', d.ativo) order by d.id)
          from public.radar_destinatarios d
         where lower(d.agente) = 'sol'
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'status', e.status, 'erro', e.erro, 'enviado_em', e.enviado_em
        ) order by e.id)
          from public.radar_entregas e
          join public.fila_relatorios_sol_hermes f
            on e.mensagem = 'fila:' || f.id::text
         where lower(e.agente) = 'sol'
           and f.tipo_relatorio = 'radar_pauta'
           and f.status in ('enviada', 'erro')
      ), '[]'::jsonb);
  elsif v_ativa <> 1 then
    raise exception 'TERCEIRO_ANDAR_AUDITORIA_ATIVA_AMBIGUA total=%', v_ativa;
  end if;
end
$snapshot$;

update public.automacoes_config
   set ativo = false,
       updated_at = now()
 where slug in ('radar_pauta_grupo', 'radar_bloco_sinais_comercial');

update public.radar_destinatarios
   set ativo = false
 where lower(agente) = 'sol'
   and ativo;

create or replace function public.sol_sincronizar_radar_entrega_da_fila_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.tipo_relatorio is distinct from 'radar_pauta' then
    return new;
  end if;

  if new.status = 'enviada' then
    update public.radar_entregas
       set status = 'enviado',
           enviado_em = coalesce(new.enviada_em, clock_timestamp()),
           erro = null
     where lower(agente) = 'sol'
       and mensagem = 'fila:' || new.id::text
       and status in ('pendente', 'falhou');
  elsif new.status = 'erro' then
    update public.radar_entregas
       set status = 'falhou',
           erro = coalesce(nullif(new.erro, ''), 'fila_radar_pauta_erro'),
           enviado_em = null
     where lower(agente) = 'sol'
       and mensagem = 'fila:' || new.id::text
       and status in ('pendente', 'falhou');
  end if;

  return new;
end
$function$;

revoke all on function public.sol_sincronizar_radar_entrega_da_fila_v1()
  from public, anon, authenticated;

drop trigger if exists tr_sol_sincronizar_radar_entrega_da_fila_v1
  on public.fila_relatorios_sol_hermes;
create trigger tr_sol_sincronizar_radar_entrega_da_fila_v1
after update of status, enviada_em, erro on public.fila_relatorios_sol_hermes
for each row execute function public.sol_sincronizar_radar_entrega_da_fila_v1();

update public.radar_entregas e
   set status = case f.status when 'enviada' then 'enviado' else 'falhou' end,
       enviado_em = case when f.status = 'enviada' then f.enviada_em else null end,
       erro = case when f.status = 'erro'
                   then coalesce(nullif(f.erro, ''), 'fila_radar_pauta_erro')
                   else null end
  from public.fila_relatorios_sol_hermes f
 where lower(e.agente) = 'sol'
   and e.mensagem = 'fila:' || f.id::text
   and f.tipo_relatorio = 'radar_pauta'
   and f.status in ('enviada', 'erro')
   and e.status is distinct from case f.status when 'enviada' then 'enviado' else 'falhou' end;

do $proof$
declare
  v_switches_on integer;
  v_recipients_on integer;
  v_mismatch integer;
  v_ativa integer;
begin
  select count(*) into v_switches_on
    from public.automacoes_config
   where slug in ('radar_pauta_grupo', 'radar_bloco_sinais_comercial')
     and ativo;
  select count(*) into v_recipients_on
    from public.radar_destinatarios
   where lower(agente) = 'sol' and ativo;
  select count(*) into v_mismatch
    from public.radar_entregas e
    join public.fila_relatorios_sol_hermes f
      on e.mensagem = 'fila:' || f.id::text
   where lower(e.agente) = 'sol'
     and f.tipo_relatorio = 'radar_pauta'
     and ((f.status = 'enviada' and e.status <> 'enviado')
       or (f.status = 'erro' and e.status <> 'falhou'));
  select count(*) into v_ativa
    from public.sol_terceiro_andar_contencao_auditoria_v1
   where migration_key = 'third_floor_containment_v1'
     and rolled_back_at is null;

  if v_switches_on <> 0 or v_recipients_on <> 0 or v_mismatch <> 0 or v_ativa <> 1 then
    raise exception 'TERCEIRO_ANDAR_CONTENCAO_REPROVADA switches_on=% recipients_on=% mismatch=% audit=%',
      v_switches_on, v_recipients_on, v_mismatch, v_ativa;
  end if;
end
$proof$;

comment on function public.sol_sincronizar_radar_entrega_da_fila_v1() is
  'Sincroniza somente o recibo radar_pauta vinculado por mensagem=fila:<id>. Não envia e não altera sinais.';
