-- Lia / Fase B: o renderer deve usar a composição congelada do resumo.
--
-- O read model fn_pesquisa_evasao_followup_estado é deliberadamente apenas
-- produtivo e exclui modo_teste=true. Consultá-lo dentro do renderer fazia o
-- piloto contar um item em lia_followup_resumo_itens, mas renderizar a lista
-- vazia. A composição do resumo já é governada e imutável; por isso a
-- renderização parte dos itens e resolve apenas os dados de exibição nas
-- fontes canônicas, de forma idêntica para ambiente teste e produção.

create or replace function public.fn_lia_renderizar_resumo_followup(
  p_resumo_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_total integer;
  v_lista text;
  v_restantes integer;
  v_base_url text;
begin
  select count(*)
  into v_total
  from public.lia_followup_resumo_itens item
  where item.resumo_id = p_resumo_id
    and item.cancelado_em is null;

  if v_total = 0 then
    return null;
  end if;

  select string_agg(
    format(
      '%s — %s — enviada em %s',
      caso.aluno_nome,
      caso.unidade_nome,
      to_char(caso.enviado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
    ),
    E'\n' order by caso.vencido_em, caso.pesquisa_id
  )
  into v_lista
  from (
    select
      pesquisa.id as pesquisa_id,
      coalesce(
        nullif(btrim(movimentacao.aluno_nome), ''),
        pesquisa.aluno_nome
      )::text as aluno_nome,
      unidade.nome::text as unidade_nome,
      pesquisa.enviado_em,
      item.vencido_em_snapshot as vencido_em
    from public.lia_followup_resumo_itens item
    join public.pesquisa_evasao pesquisa
      on pesquisa.id = item.pesquisa_id
    left join public.movimentacoes_admin movimentacao
      on movimentacao.id = pesquisa.evasao_id
    join public.unidades unidade
      on unidade.id = pesquisa.unidade_id
    where item.resumo_id = p_resumo_id
      and item.cancelado_em is null
    order by item.vencido_em_snapshot, pesquisa.id
    limit 10
  ) caso;

  v_restantes := greatest(v_total - 10, 0);

  select rtrim(config.app_base_url, '/')
  into v_base_url
  from public.lia_alertas_configuracao config
  where config.id = 1;

  return format(
    E'⏰ *Pesquisas aguardando follow-up — 3 dias*\n\nVocê tem %s pesquisa(s) enviada(s) sem resposta válida:\n\n%s%s\n\n👉 %s/app/sucesso-aluno?destino=pesquisas-evasao&filtro=followup_pendente',
    v_total,
    v_lista,
    case
      when v_restantes > 0 then format(E'\n\n... e mais %s caso(s).', v_restantes)
      else ''
    end,
    v_base_url
  );
end;
$function$;

revoke all on function public.fn_lia_renderizar_resumo_followup(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_lia_renderizar_resumo_followup(uuid)
  to service_role;

comment on function public.fn_lia_renderizar_resumo_followup(uuid) is
  'Renderiza a composição congelada do resumo diário, inclusive no piloto modo teste, sem depender do read model exclusivamente produtivo.';
