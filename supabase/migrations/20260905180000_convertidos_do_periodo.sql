-- Insumo do estudo de passagem pelo WhatsApp (05/09/2026).
-- Convertidos do periodo, com a data da matricula — insumo do estudo de
-- passagem pelo WhatsApp. Separado da amostra pareada de proposito: aqui NAO se
-- pareia, porque a pergunta e sobre o universo de quem fechou, nao sobre
-- comparar com quem nao fechou.
create or replace function public.convertidos_do_periodo_v1(p_meses integer default 6)
returns table (lead_id bigint, telefone text, unidade text, canal text,
               data_conversao date, criado_em date)
language sql stable security definer set search_path to 'public' as $function$
  select l.id, regexp_replace(coalesce(l.telefone,''), '\D','','g'),
         u.nome, coalesce(c.nome,'(sem canal)'),
         l.data_conversao::date, l.created_at::date
  from leads l
  join unidades u on u.id = l.unidade_id
  left join canais_origem c on c.id = l.canal_origem_id
  where l.converteu
    and l.created_at >= now() - make_interval(months => p_meses)
    and length(regexp_replace(coalesce(l.telefone,''), '\D','','g')) >= 10
  order by l.id
$function$;
revoke all on function public.convertidos_do_periodo_v1(integer) from public, anon, authenticated;
grant execute on function public.convertidos_do_periodo_v1(integer) to service_role;
