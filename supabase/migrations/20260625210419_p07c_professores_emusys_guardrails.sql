-- P07C - Guardrails for professor Emusys reconciliation.
-- Keeps the reconciliation queue from showing stale rows after a link exists.

create or replace function public.limpar_professores_emusys_divergencias_obsoletas()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sem_vinculo integer := 0;
  v_so_no_emusys integer := 0;
  v_pendentes integer := 0;
begin
  with resolvidas as (
    update public.professores_emusys_divergencias d
       set resolvido = true,
           decisao = 'resolvido_por_vinculo_existente',
           decidido_por = 'sync_professores_p07',
           decidido_em = now(),
           updated_at = now()
      from public.professores_unidades pu
     where d.resolvido = false
       and d.tipo_divergencia = 'sem_vinculo_la'
       and d.unidade_id = pu.unidade_id
       and d.professor_id = pu.professor_id
       and pu.emusys_id is not null
     returning d.id
  )
  select count(*) into v_sem_vinculo from resolvidas;

  with resolvidas as (
    update public.professores_emusys_divergencias d
       set resolvido = true,
           decisao = 'resolvido_por_vinculo_existente',
           decidido_por = 'sync_professores_p07',
           decidido_em = now(),
           updated_at = now()
      from public.professores_unidades pu
     where d.resolvido = false
       and d.tipo_divergencia = 'so_no_emusys'
       and d.unidade_id = pu.unidade_id
       and d.emusys_professor_id = pu.emusys_id
     returning d.id
  )
  select count(*) into v_so_no_emusys from resolvidas;

  select count(*)
    into v_pendentes
    from public.professores_emusys_divergencias
   where resolvido = false;

  return jsonb_build_object(
    'sem_vinculo_la_resolvidas', v_sem_vinculo,
    'so_no_emusys_resolvidas', v_so_no_emusys,
    'pendentes_restantes', v_pendentes
  );
end;
$$;

grant execute on function public.limpar_professores_emusys_divergencias_obsoletas() to anon, authenticated;

create or replace function public.get_conciliacao_professores_emusys(p_unidade_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'total_pendente', count(*) filter (where d.resolvido = false),
      'sem_vinculo_la', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'sem_vinculo_la'),
      'so_no_emusys', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'so_no_emusys'),
      'so_no_la', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'so_no_la'),
      'nome_divergente', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'nome_divergente'),
      'id_duplicado', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'id_duplicado'),
      'conflito_unidade', count(*) filter (where d.resolvido = false and d.tipo_divergencia = 'conflito_unidade')
    ),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'unidade_id', d.unidade_id,
          'unidade_codigo', u.codigo,
          'unidade_nome', u.nome,
          'professor_id', d.professor_id,
          'professores_unidade_id', d.professores_unidade_id,
          'emusys_professor_id', d.emusys_professor_id,
          'tipo_divergencia', d.tipo_divergencia,
          'nome_la', d.nome_la,
          'nome_emusys', d.nome_emusys,
          'valor_nosso', d.valor_nosso,
          'valor_emusys', d.valor_emusys,
          'sugestao', d.sugestao,
          'severidade', d.severidade,
          'detectado_em', d.detectado_em
        )
        order by d.severidade desc, u.codigo, d.tipo_divergencia, coalesce(d.nome_emusys, d.nome_la), d.detectado_em
      ) filter (where d.resolvido = false),
      '[]'::jsonb
    )
  )
  from public.professores_emusys_divergencias d
  join public.unidades u on u.id = d.unidade_id
  where (p_unidade_id is null or d.unidade_id = p_unidade_id);
$$;

grant execute on function public.get_conciliacao_professores_emusys(uuid) to anon, authenticated;
