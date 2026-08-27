-- Detalhes regulares: preserva a consulta crua anterior durante sombra/rollback
-- e publica a ocorrência v2 somente quando `relatorios` for ativado.

do $clonar_detalhe_canonico$
declare
  v_def text;
begin
  select pg_get_functiondef(
    'public.get_presenca_ocorrencias_periodo_v2(uuid,date,date,integer,integer)'::regprocedure
  ) into v_def;
  v_def := regexp_replace(
    v_def,
    'FUNCTION public\.get_presenca_ocorrencias_periodo_v2\(',
    'FUNCTION public.get_presenca_ocorrencias_periodo_canonico_v2(',
    'i'
  );
  execute v_def;
end
$clonar_detalhe_canonico$;

revoke all on function public.get_presenca_ocorrencias_periodo_canonico_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.get_presenca_ocorrencias_periodo_legado_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table (
  slot_key text, aluno_id integer, aluno_nome text, unidade_id uuid,
  professor_id integer, professor_nome text, data_aula date,
  horario_aula time, curso_nome text, resultado_canonico text,
  fonte_decisao text, possui_conflito boolean, turma_nome text,
  sala_nome text, anotacoes text, duracao_minutos integer, tipo text,
  nr_da_aula integer, qtd_alunos integer, universo_eventos bigint,
  presentes bigint, faltas bigint, faltas_justificadas bigint,
  dados_status text, estado_publicacao text,
  sincronizado_em timestamptz, regra_versao text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with base as (
    select
      ('legado:' || coalesce(ap.aula_emusys_id::text, 'sem-aula') || ':'
        || ap.aluno_id::text || ':' || ap.data_aula::text || ':'
        || coalesce(ap.horario_aula::text, 'sem-hora'))::text as slot_key,
      ap.aluno_id,
      a.nome::text as aluno_nome,
      ap.unidade_id,
      ae.professor_id::integer,
      ae.professor_nome::text,
      ap.data_aula,
      ap.horario_aula::time,
      ap.curso_nome::text,
      case lower(ap.status::text)
        when 'presente' then 'presente'
        when 'ausente' then 'falta'
        else 'indeterminado'
      end::text as resultado_canonico,
      'legado_aluno_presenca'::text as fonte_decisao,
      false as possui_conflito,
      ap.turma_nome::text,
      ap.sala_nome::text,
      ae.anotacoes::text,
      ae.duracao_minutos::integer,
      ae.tipo::text,
      ae.nr_da_aula::integer,
      ae.qtd_alunos::integer
    from public.aluno_presenca ap
    join public.alunos a on a.id = ap.aluno_id
    left join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
    where ap.data_aula between p_data_inicio and p_data_fim
      and lower(ap.status::text) in ('presente', 'ausente')
      and coalesce(ae.categoria, 'normal') = 'normal'
      and (p_unidade_id is null or ap.unidade_id = p_unidade_id)
      and (p_professor_id is null or ae.professor_id = p_professor_id)
      and (p_aluno_id is null or ap.aluno_id = p_aluno_id)
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          current_setting('request.jwt.claim.role', true) = 'authenticated'
          and ((select public.is_admin()) or ap.unidade_id in (select public.get_user_unidade_ids()))
        )
      )
  )
  select
    b.*,
    count(*) over (partition by b.unidade_id)::bigint,
    count(*) filter (where b.resultado_canonico = 'presente')
      over (partition by b.unidade_id)::bigint,
    count(*) filter (where b.resultado_canonico = 'falta')
      over (partition by b.unidade_id)::bigint,
    0::bigint,
    'legado'::text,
    'publicado'::text,
    null::timestamptz,
    'presenca-legado-v1'::text
  from base b
  order by b.data_aula, b.horario_aula, b.aluno_nome, b.slot_key;
$$;

revoke all on function public.get_presenca_ocorrencias_periodo_legado_v1(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.get_presenca_ocorrencias_periodo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table (
  slot_key text, aluno_id integer, aluno_nome text, unidade_id uuid,
  professor_id integer, professor_nome text, data_aula date,
  horario_aula time, curso_nome text, resultado_canonico text,
  fonte_decisao text, possui_conflito boolean, turma_nome text,
  sala_nome text, anotacoes text, duracao_minutos integer, tipo text,
  nr_da_aula integer, qtd_alunos integer, universo_eventos bigint,
  presentes bigint, faltas bigint, faltas_justificadas bigint,
  dados_status text, estado_publicacao text,
  sincronizado_em timestamptz, regra_versao text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_modo text;
  v_tem_canonico boolean;
  v_tem_sombra boolean;
begin
  if p_unidade_id is not null then
    v_modo := public.fn_presenca_rollout_modo_interno_v1(p_unidade_id, 'relatorios');
    if v_modo = 'canonico_v2' then
      return query select * from public.get_presenca_ocorrencias_periodo_canonico_v2(
        p_unidade_id, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
      );
      return;
    end if;
    if v_modo = 'sombra' then
      begin
        perform * from public.get_presenca_ocorrencias_periodo_canonico_v2(
          p_unidade_id, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
        );
      exception when others then
        null;
      end;
    end if;
    return query select * from public.get_presenca_ocorrencias_periodo_legado_v1(
      p_unidade_id, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
    );
    return;
  end if;

  select
    bool_or(c.modo = 'canonico_v2'),
    bool_or(c.modo = 'sombra')
  into v_tem_canonico, v_tem_sombra
  from public.presenca_rollout_config c
  where c.superficie = 'relatorios';

  if not coalesce(v_tem_canonico, false) then
    if coalesce(v_tem_sombra, false) then
      begin
        perform * from public.get_presenca_ocorrencias_periodo_canonico_v2(
          null, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
        );
      exception when others then
        null;
      end;
    end if;
    return query select * from public.get_presenca_ocorrencias_periodo_legado_v1(
      null, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
    );
    return;
  end if;

  return query
  select c.*
  from public.get_presenca_ocorrencias_periodo_canonico_v2(
    null, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
  ) c
  where public.fn_presenca_rollout_modo_interno_v1(c.unidade_id, 'relatorios') = 'canonico_v2'
  union all
  select l.*
  from public.get_presenca_ocorrencias_periodo_legado_v1(
    null, p_data_inicio, p_data_fim, p_professor_id, p_aluno_id
  ) l
  where public.fn_presenca_rollout_modo_interno_v1(l.unidade_id, 'relatorios') <> 'canonico_v2';
end;
$$;

revoke all on function public.get_presenca_ocorrencias_periodo_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_ocorrencias_periodo_v2(
  uuid, date, date, integer, integer
) to authenticated, service_role;

comment on function public.get_presenca_ocorrencias_periodo_v2(
  uuid, date, date, integer, integer
) is 'Detalhe governado: sombra calcula v2 e entrega leitura legada; relatorios=canonico_v2 publica a ocorrência canônica.';
