begin;

-- A conciliação Emusys é uma fila de trabalho da operação atual. Encerrar uma
-- matrícula não pode apagar a trilha da divergência, mas deve encerrá-la para
-- que ex-aluno/inativo não continue aparecendo como pendência da equipe.
create or replace function public.resolver_pendencias_conciliacao_fora_escopo_operacional(
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_atributos integer := 0;
  v_matriculas integer := 0;
begin
  update public.alunos_emusys_atributos_divergencias d
  set resolvido = true,
      decisao = 'fora_escopo_operacional',
      decidido_por = 'sync_escopo_operacional',
      decidido_em = now(),
      updated_at = now()
  from public.alunos a
  where d.aluno_id = a.id
    and d.unidade_id = p_unidade_id
    and d.resolvido is false
    and (
      a.status in ('inativo', 'evadido')
      or coalesce(a.is_ex_aluno, false) = true
    );
  get diagnostics v_atributos = row_count;

  update public.matriculas_divergencias d
  set resolvido = true,
      analise_sol = 'Resolvida automaticamente: aluno fora do escopo operacional.',
      updated_at = now()
  from public.alunos a
  where d.aluno_id = a.id
    and d.unidade_id = p_unidade_id
    and d.resolvido is false
    and (
      a.status in ('inativo', 'evadido')
      or coalesce(a.is_ex_aluno, false) = true
    );
  get diagnostics v_matriculas = row_count;

  return jsonb_build_object(
    'atributos', v_atributos,
    'matriculas', v_matriculas
  );
end;
$function$;

revoke all on function public.resolver_pendencias_conciliacao_fora_escopo_operacional(uuid)
  from public, anon, authenticated;
grant execute on function public.resolver_pendencias_conciliacao_fora_escopo_operacional(uuid)
  to service_role;

-- Fecha o passivo já criado nas três unidades sem excluir qualquer evidência.
select public.resolver_pendencias_conciliacao_fora_escopo_operacional(u.id)
from public.unidades u;

-- Defesa no leitor: se houver uma corrida entre a mudança de ciclo de vida e
-- o próximo sync, uma divergência vinculada a aluno fora da operação não volta
-- para a aba de Conciliação. Itens sem aluno local continuam visíveis, pois são
-- justamente casos genuínos de vínculo a investigar.
create or replace function public.get_conciliacao_matriculas(p_unidade_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_resumo jsonb;
  v_items jsonb;
begin
  select coalesce(jsonb_agg(t order by t.severidade, t.detectado_em), '[]'::jsonb)
  into v_items
  from (
    select d.id, d.aluno_id, a.nome as aluno_nome, d.unidade_id, u.nome as unidade_nome,
           d.tipo_divergencia, d.campo, d.valor_nosso, d.valor_api, d.sugestao,
           d.severidade, d.detectado_em, d.emusys_matricula_id,
           d.fonte, d.analise_sol,
           a.curso_id, c.nome as curso_nome
    from public.matriculas_divergencias d
    left join public.alunos a on a.id = d.aluno_id
    left join public.unidades u on u.id = d.unidade_id
    left join public.cursos c on c.id = a.curso_id
    left join public.matriculas_divergencias_decisoes dec on dec.divergencia_id = d.id
    where d.resolvido = false
      and dec.id is null
      and (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and (
        a.id is null
        or (
          coalesce(a.status, 'ativo') not in ('inativo', 'evadido')
          and coalesce(a.is_ex_aluno, false) = false
        )
      )
      and not (
        d.tipo_divergencia = 'valor_divergente'
        and exists (
          select 1
          from public.matriculas_divergencias n
          left join public.matriculas_divergencias_decisoes ndec on ndec.divergencia_id = n.id
          where n.aluno_id = d.aluno_id
            and n.id <> d.id
            and n.tipo_divergencia = 'auto_preview'
            and n.resolvido = false
            and ndec.id is null
        )
      )
  ) t;

  select coalesce(jsonb_object_agg(tipo, qtd), '{}'::jsonb)
  into v_resumo
  from (
    select d.tipo_divergencia as tipo, count(*) as qtd
    from public.matriculas_divergencias d
    left join public.alunos a on a.id = d.aluno_id
    left join public.matriculas_divergencias_decisoes dec on dec.divergencia_id = d.id
    where d.resolvido = false
      and dec.id is null
      and (p_unidade_id is null or d.unidade_id = p_unidade_id)
      and (
        a.id is null
        or (
          coalesce(a.status, 'ativo') not in ('inativo', 'evadido')
          and coalesce(a.is_ex_aluno, false) = false
        )
      )
      and not (
        d.tipo_divergencia = 'valor_divergente'
        and exists (
          select 1
          from public.matriculas_divergencias n
          left join public.matriculas_divergencias_decisoes ndec on ndec.divergencia_id = n.id
          where n.aluno_id = d.aluno_id
            and n.id <> d.id
            and n.tipo_divergencia = 'auto_preview'
            and n.resolvido = false
            and ndec.id is null
        )
      )
    group by d.tipo_divergencia
  ) s;

  return jsonb_build_object('resumo', v_resumo, 'items', v_items);
end;
$function$;

commit;
