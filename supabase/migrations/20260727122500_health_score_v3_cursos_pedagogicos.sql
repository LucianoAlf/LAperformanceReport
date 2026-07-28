begin;

alter table public.cursos
  add column natureza_operacional text not null default 'pedagogica'
    check (natureza_operacional in ('pedagogica', 'comercial'));

comment on column public.cursos.natureza_operacional is
  'Classifica o curso para operacao pedagogica ou comercial. Aula Experimental (id 45) e evento comercial da conversao, nao carteira pedagogica.';

do $classificar_aula_experimental$
declare
  v_atualizadas integer;
begin
  if not exists (
    select 1
    from public.cursos
    where id = 45
  ) then
    raise exception
      'HEALTH_SCORE_V3_CURSO_INVALIDO: curso 45 (Aula Experimental) inexistente';
  end if;

  update public.cursos
  set natureza_operacional = 'comercial'
  where id = 45;
  get diagnostics v_atualizadas = row_count;

  if v_atualizadas <> 1 then
    raise exception
      'HEALTH_SCORE_V3_CURSO_INVALIDO: esperado exatamente um curso 45, atualizado %',
      v_atualizadas;
  end if;
end;
$classificar_aula_experimental$;

create or replace function public.fn_health_score_professor_v3_catalogo_segmentos_v1(
  p_config_id uuid
)
returns table (
  unidade_id uuid,
  unidade_nome text,
  curso_id integer,
  curso_nome text,
  modalidade text,
  emusys_disciplina_ids jsonb,
  disciplinas_emusys jsonb,
  professores_formais integer,
  formalmente_ofertado boolean,
  ultima_sincronizacao timestamptz,
  fonte text,
  config_meta_id uuid,
  estado_regra text,
  capacidade_maxima numeric,
  meta_media_turma numeric,
  meta_carteira_curso numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with catalogo_resolvido as (
    select
      catalogo.unidade_id,
      unidade.nome::text as unidade_nome,
      depara.curso_id,
      curso.nome::text as curso_nome,
      catalogo.modalidade,
      jsonb_agg(
        distinct catalogo.emusys_disciplina_id
        order by catalogo.emusys_disciplina_id
      ) as emusys_disciplina_ids,
      jsonb_agg(
        distinct jsonb_build_object(
          'emusys_disciplina_id', catalogo.emusys_disciplina_id,
          'nome', catalogo.nome_emusys,
          'ultima_execucao_id', catalogo.ultima_execucao_id
        )
      ) as disciplinas_emusys,
      count(distinct atribuicao.emusys_professor_id) filter (
        where atribuicao.ativo_origem
      )::integer as professores_formais,
      bool_or(coalesce(atribuicao.ativo_origem, false))
        as formalmente_ofertado,
      max(catalogo.sincronizado_em) as ultima_sincronizacao
    from public.emusys_disciplinas_catalogo catalogo
    join public.unidades unidade
      on unidade.id = catalogo.unidade_id
    join public.curso_emusys_depara depara
      on depara.unidade_id = catalogo.unidade_id
     and depara.emusys_disciplina_id = catalogo.emusys_disciplina_id
    join public.cursos curso
      on curso.id = depara.curso_id
     and not coalesce(curso.is_projeto_banda, false)
     and curso.natureza_operacional = 'pedagogica'
    left join public.emusys_professor_disciplinas atribuicao
      on atribuicao.unidade_id = catalogo.unidade_id
     and atribuicao.emusys_disciplina_id = catalogo.emusys_disciplina_id
    where catalogo.ativo_origem is true
    group by
      catalogo.unidade_id,
      unidade.nome,
      depara.curso_id,
      curso.nome,
      catalogo.modalidade
  )
  select
    c.unidade_id,
    c.unidade_nome,
    c.curso_id,
    c.curso_nome,
    c.modalidade,
    c.emusys_disciplina_ids,
    c.disciplinas_emusys,
    c.professores_formais,
    c.formalmente_ofertado,
    c.ultima_sincronizacao,
    'emusys'::text as fonte,
    m.id as config_meta_id,
    coalesce(m.estado, 'nao_configurada')::text as estado_regra,
    m.capacidade_maxima,
    m.meta_media_turma,
    m.meta_carteira_curso
  from catalogo_resolvido c
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = p_config_id
   and m.unidade_id = c.unidade_id
   and m.curso_id = c.curso_id
   and m.modalidade = c.modalidade
  order by c.unidade_nome, c.curso_nome, c.modalidade;
$function$;

create or replace function public.fn_health_score_professor_v3_catalogo_segmentos_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with config_atual as (
    select c.id
    from public.health_score_professor_v3_config_versoes c
    where c.status in ('rascunho', 'ativa')
    order by
      case c.status when 'rascunho' then 0 else 1 end,
      c.versao desc
    limit 1
  )
  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.unidade_nome, c.curso_nome, c.modalidade),
    '[]'::jsonb
  )
  from config_atual atual
  cross join lateral public.fn_health_score_professor_v3_catalogo_segmentos_v1(
    atual.id
  ) c;
$function$;

create or replace function public.fn_health_score_professor_v3_segmentos_faltantes_v1(
  p_config_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'unidade_id', c.unidade_id,
        'unidade_nome', c.unidade_nome,
        'curso_id', c.curso_id,
        'curso_nome', c.curso_nome,
        'modalidade', c.modalidade,
        'estado_regra', coalesce(m.estado, 'nao_configurada')
      )
      order by c.unidade_nome, c.curso_nome, c.modalidade
    ),
    '[]'::jsonb
  )
  from public.fn_health_score_professor_v3_catalogo_segmentos_v1(
    p_config_id
  ) c
  left join public.health_score_professor_v3_config_metas_curso_modalidade m
    on m.config_id = p_config_id
   and m.unidade_id = c.unidade_id
   and m.curso_id = c.curso_id
   and m.modalidade = c.modalidade
  where m.id is null
     or m.estado not in ('configurada', 'nao_ofertada');
$function$;

alter function public.get_health_score_professor_v3_metricas_segmentadas_v1(
  date,
  uuid,
  uuid,
  text
)
  rename to hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1;

create or replace function public.get_health_score_professor_v3_metricas_segmentadas_v1(
  p_competencia date,
  p_config_id uuid,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  curso_id integer,
  curso_nome text,
  modalidade text,
  config_meta_segmento_id uuid,
  atribuicao_id uuid,
  atribuicao_formal boolean,
  atribuicao_pontuavel boolean,
  pessoas_unicas integer,
  pessoas_unicas_total numeric,
  pessoas_fechamentos integer,
  meses_com_base integer,
  meses_com_base_consolidado integer,
  meses_no_periodo integer,
  vinculos_ativos integer,
  turmas_elegiveis integer,
  ocupacoes_unicas integer,
  valor_observado numeric,
  capacidade_maxima numeric,
  meta_aplicada numeric,
  numerador numeric,
  denominador numeric,
  nota_segmento numeric,
  estado_base text,
  publicavel boolean,
  capacidade_excedida boolean,
  alertas_capacidade jsonb,
  fonte text,
  regra_versao text,
  linha_diagnostico boolean,
  dados_sem_resolucao integer,
  estados_resolucao jsonb,
  divergencias jsonb,
  detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select d.*
  from public.hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1(
    p_competencia,
    p_config_id,
    p_unidade_id,
    p_periodicidade
  ) d
  left join public.cursos c
    on c.id = d.curso_id
  where d.metrica not in ('media_turma', 'numero_alunos')
     or c.natureza_operacional = 'pedagogica'
  order by
    d.professor_id,
    d.unidade_id,
    d.metrica,
    d.curso_id nulls last,
    d.modalidade nulls last;
$function$;

alter function public.salvar_health_score_professor_v3_config_rascunho(
  uuid,
  date,
  text,
  jsonb,
  jsonb
)
  rename to salvar_health_score_v3_config_pre_cursos_pedagogicos_v1;

create or replace function public.salvar_health_score_professor_v3_config_rascunho(
  p_config_id uuid,
  p_vigencia_inicio date,
  p_justificativa text,
  p_metricas jsonb,
  p_metas_segmentadas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
begin
  if exists (
    select 1
    from jsonb_to_recordset(
      coalesce(p_metas_segmentadas, '[]'::jsonb)
    ) as r(
      unidade_id uuid,
      curso_id integer,
      modalidade text,
      estado text,
      capacidade_maxima numeric,
      meta_media_turma numeric,
      meta_carteira_curso numeric,
      parametros jsonb
    )
    join public.cursos c
      on c.id = r.curso_id
    where c.natureza_operacional = 'comercial'
  ) then
    raise exception
      'HEALTH_SCORE_V3_CONFIG_INVALIDA: curso comercial nao pode receber meta pedagogica';
  end if;

  return public.salvar_health_score_v3_config_pre_cursos_pedagogicos_v1(
    p_config_id,
    p_vigencia_inicio,
    p_justificativa,
    p_metricas,
    p_metas_segmentadas
  );
end;
$function$;

revoke all on function
  public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.fn_health_score_professor_v3_segmentos_faltantes_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function
  public.hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1(
    date,
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.salvar_health_score_v3_config_pre_cursos_pedagogicos_v1(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  from public, anon, authenticated, service_role;
revoke all on function
  public.salvar_health_score_professor_v3_config_rascunho(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  from public, anon, authenticated, service_role;

grant execute on function
  public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid)
  to service_role;
grant execute on function
  public.fn_health_score_professor_v3_catalogo_segmentos_v1()
  to service_role;
grant execute on function
  public.fn_health_score_professor_v3_segmentos_faltantes_v1(uuid)
  to service_role;
grant execute on function
  public.hs_v3_metricas_segmentadas_pre_cursos_pedagogicos_v1(
    date,
    uuid,
    uuid,
    text
  )
  to service_role;
grant execute on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  )
  to service_role;
grant execute on function
  public.salvar_health_score_v3_config_pre_cursos_pedagogicos_v1(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  to service_role;
grant execute on function
  public.salvar_health_score_professor_v3_config_rascunho(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  )
  to authenticated, service_role;

comment on function
  public.fn_health_score_professor_v3_catalogo_segmentos_v1(uuid) is
  'Catalogo pedagogico oficial por unidade, curso e modalidade; cursos comerciais ficam fora de media e carteira.';
comment on function
  public.get_health_score_professor_v3_metricas_segmentadas_v1(
    date,
    uuid,
    uuid,
    text
  ) is
  'Detalhe segmentado V3: media_turma e numero_alunos aceitam somente cursos pedagogicos; conversao permanece em sua fonte comercial.';
comment on function
  public.salvar_health_score_professor_v3_config_rascunho(
    uuid,
    date,
    text,
    jsonb,
    jsonb
  ) is
  'Salva o rascunho segmentado e rejeita metas pedagogicas para cursos comerciais.';

commit;
