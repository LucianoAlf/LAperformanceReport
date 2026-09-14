-- Leitura agregada da saúde do espelho financeiro Emusys (beta) para a tela.
-- Só AGREGADOS (contagens e somas por natureza) saem daqui: o ledger linha a
-- linha fica no backend (decisão Alf 14/09/2026 — Super Folha consome o
-- espelho; o LA Report mostra só a saúde da cópia). Admin-only.

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
        'unidade_id', d.unidade_id,
        'mes', to_char(d.data, 'YYYY-MM'),
        'completos', count(*) filter (where d.status = 'completo'),
        'erros', count(*) filter (where d.status = 'erro'),
        'itens', sum(d.itens)
      ) order by d.unidade_id, to_char(d.data, 'YYYY-MM')), '[]'::jsonb)
      from public.financeiro_emusys_varredura_dias d
      where d.data >= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '9 months'
      group by d.unidade_id, to_char(d.data, 'YYYY-MM')
    ),
    'totais_por_mes_natureza', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'unidade_id', l.unidade_id,
        'mes', to_char(l.data, 'YYYY-MM'),
        'natureza', l.natureza,
        'quantidade', count(*),
        'valor_total', sum(l.valor)
      ) order by l.unidade_id, to_char(l.data, 'YYYY-MM'), l.natureza), '[]'::jsonb)
      from public.financeiro_emusys_lancamentos l
      where l.sumiu_em is null
      group by l.unidade_id, to_char(l.data, 'YYYY-MM'), l.natureza
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

revoke all on function public.get_financeiro_espelho_status() from public, anon;
grant execute on function public.get_financeiro_espelho_status() to authenticated;
