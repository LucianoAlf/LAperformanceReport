-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.app_cancelar_aula(
  p_aula_emusys_id integer,
  p_motivo text,
  p_evidencia_path text default null,
  p_escopo text default 'aula'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
  v_afetadas integer := 0;
  v_creditos integer := 0;
begin
  if p_escopo not in ('aula', 'unidade_dia') then
    raise exception 'escopo_invalido';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'motivo_obrigatorio_cancelamento';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found then
    raise exception 'aula_nao_encontrada';
  end if;

  if v_usuario_id is null
     or not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if p_escopo = 'unidade_dia' and not public.is_admin() then
    raise exception 'cancelamento_em_massa_requer_admin' using errcode = '42501';
  end if;

  with afetadas as (
    update public.aulas_emusys ae
    set cancelada = true,
        cancelada_origem = 'agenda_secretaria',
        cancelada_motivo = btrim(p_motivo),
        cancelada_evidencia_path = nullif(btrim(coalesce(p_evidencia_path, '')), ''),
        cancelada_por_usuario_id = v_usuario_id,
        cancelada_em = now()
    where not coalesce(ae.cancelada, false)
      and (
        (p_escopo = 'aula'
          and ae.unidade_id = v_aula.unidade_id
          and ae.data_hora_inicio = v_aula.data_hora_inicio
          and ae.sala_nome is not distinct from v_aula.sala_nome
          and ae.curso_nome is not distinct from v_aula.curso_nome
          and ae.turma_nome is not distinct from v_aula.turma_nome
          and ae.professor_nome is not distinct from v_aula.professor_nome)
        or (p_escopo = 'unidade_dia'
          and ae.unidade_id = v_aula.unidade_id
          and ae.data_aula = v_aula.data_aula)
      )
    returning ae.id, ae.unidade_id
  )
  insert into public.aluno_reposicoes (unidade_id, aluno_id, aula_origem_id, origem, motivo, evidencia_path)
  select a.unidade_id, r.aluno_id, a.id, 'cancelamento', btrim(p_motivo),
         nullif(btrim(coalesce(p_evidencia_path, '')), '')
  from afetadas a
  join public.aula_alunos_emusys r on r.aula_emusys_id = a.id
  where r.aluno_id is not null
  on conflict (aluno_id, aula_origem_id, origem) do nothing;

  get diagnostics v_creditos = row_count;

  select count(*) into v_afetadas
  from public.aulas_emusys ae
  where ae.cancelada
    and ae.cancelada_origem = 'agenda_secretaria'
    and ae.cancelada_em > now() - interval '1 minute'
    and ae.unidade_id = v_aula.unidade_id
    and ae.data_aula = v_aula.data_aula;

  return jsonb_build_object(
    'escopo', p_escopo,
    'aulas_canceladas', v_afetadas,
    'creditos_gerados', v_creditos
  );
end;
$$;
