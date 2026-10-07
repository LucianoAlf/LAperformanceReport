-- 23/09/2026 — corrige get_financeiro_espelho_status:
-- "aggregate function calls cannot be nested" no card "Espelho do fluxo de
-- caixa" da pagina de faturas. jsonb_agg(jsonb_build_object(... count(*),
-- sum(...))) e' agregado dentro de agregado e o Postgres recusa.
-- Mesmo JSON de saida; so' muda a forma: agrega numa subquery primeiro e
-- o jsonb_agg consome a linha ja agregada.

create or replace function public.get_financeiro_espelho_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_admin boolean;
begin
  select coalesce(public.is_admin_usuario(), false) into v_admin;
  if not v_admin then
    raise exception using errcode = '42501', message = 'somente admin';
  end if;

  return jsonb_build_object(
    'gerado_em', now(),
    'unidades', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', u.id,
        'unidade_nome', u.nome,
        'janela_inicio', r.janela_inicio,
        'janela_fim', r.janela_fim,
        'ultima_varredura_completa_em', r.ultima_varredura_completa_em,
        'ultima_tentativa_em', r.ultima_tentativa_em,
        'dias_pendentes', r.dias_pendentes,
        'catalogos_erro', r.catalogos_erro,
        'ultimo_erro', r.ultimo_erro,
        'atualizado_em', r.atualizado_em
      ) order by u.nome), '[]'::jsonb)
      from public.unidades u
      left join public.financeiro_emusys_varredura_resumo r on r.unidade_id = u.id
      where u.ativo is distinct from false
    ),
    'dias_por_mes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', a.unidade_id,
        'mes', a.mes,
        'completos', a.completos,
        'erros', a.erros,
        'itens', a.itens
      ) order by a.unidade_id, a.mes), '[]'::jsonb)
      from (
        select
          d.unidade_id,
          to_char(d.data, 'YYYY-MM') as mes,
          count(*) filter (where d.status = 'completo') as completos,
          count(*) filter (where d.status = 'erro') as erros,
          sum(d.itens) as itens
        from public.financeiro_emusys_varredura_dias d
        where d.data >= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '9 months'
        group by d.unidade_id, to_char(d.data, 'YYYY-MM')
      ) a
    ),
    'totais_por_mes_natureza', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', a.unidade_id,
        'mes', a.mes,
        'natureza', a.natureza,
        'quantidade', a.quantidade,
        'valor_total', a.valor_total
      ) order by a.unidade_id, a.mes, a.natureza), '[]'::jsonb)
      from (
        select
          l.unidade_id,
          to_char(l.data, 'YYYY-MM') as mes,
          l.natureza,
          count(*) as quantidade,
          sum(l.valor) as valor_total
        from public.financeiro_emusys_lancamentos l
        where l.sumiu_em is null
        group by l.unidade_id, to_char(l.data, 'YYYY-MM'), l.natureza
      ) a
    ),
    'itens_sumidos', (
      select count(*) from public.financeiro_emusys_lancamentos where sumiu_em is not null
    ),
    'itens_alterados', (
      select count(*) from public.financeiro_emusys_lancamentos where alterado_em is not null
    )
  );
end;
$function$;

comment on function public.get_financeiro_espelho_status() is
  'Saúde do espelho financeiro Emusys (beta): varredura diária por unidade + totais do espelho por mês × natureza. Admin-only; nunca devolve lançamento linha a linha.';
