begin;

-- alunos.id e uma linha operacional. Quando a mesma pessoa possui mais de uma
-- linha local, nem todas necessariamente conservam emusys_matricula_id. A
-- jornada canonica, no entanto, guarda a identidade exata da matricula para
-- todos os aluno_ids_locais da pessoa.
create or replace function public.get_situacao_alunos_v1(
  p_unidade_id uuid,
  p_referencia date default current_date,
  p_apenas_pendentes boolean default false
)
returns table (
  pessoa_chave text, aluno_id_canonico integer, aluno_ids_locais integer[], nome text,
  unidade_id uuid, classificacao text, status_operacional text, matriculas_ativas integer,
  cursos text[], entrou_em date, matricula_recente_em date, responsavel_nome text,
  professores text[], aulas_resumo text[], anamnese_preenchida boolean, anamnese_em date,
  anamnese_tipo text, anamnese_flag_sem_registro boolean, anamnese_orfa_candidata_id integer,
  anamnese_orfa_match text, tem_instagram boolean, instagram_nao_possui boolean,
  tem_telefone boolean, tem_responsavel boolean, tem_foto boolean, tem_data_contrato boolean,
  contrato_vencido boolean, cadastro_completo boolean, cadastro_faltando text[],
  presenca_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer,
  chamadas_indeterminadas integer, presenca_taxa_geral numeric, presenca_confianca text,
  presenca_regra_versao text, ultima_aula_em date, dias_desde_ultima_aula integer,
  inadimplente boolean, faturas_vencidas_abertas integer, em_aviso_previo boolean,
  aviso_previo_mes_saida date, proxima_renovacao_em date, vence_em_30d boolean,
  na_comunidade_wa boolean, comunidade_status text, comunidade_capturado_em timestamptz,
  pendencias text[], fonte text, regra_versao text,
  contrato_assinatura_status text, contratos_assinados_todos boolean,
  contratos_relevantes integer, contratos_assinados integer,
  contratos_nao_assinados integer, contratos_sem_contrato integer,
  contratos_nao_verificados integer, contrato_status_observado_em timestamptz,
  contrato_reconciliado_em timestamptz, contrato_dado_fresco boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with antigos as materialized (
    select *
    from public.get_situacao_alunos_sem_contrato_assinado_v1(
      p_unidade_id, p_referencia, p_apenas_pendentes
    )
  ),
  sync_fresco as (
    select max(e.completed_at) as reconciliado_em
    from public.contrato_assinatura_sync_execucoes e
    where e.unidade_id = p_unidade_id
      and e.status = 'succeeded'
      and (e.completed_at at time zone 'America/Sao_Paulo')::date = p_referencia
  ),
  matriculas_locais_relevantes as materialized (
    select o.pessoa_chave,
           a.id as aluno_id,
           nullif(btrim(a.emusys_matricula_id::text), '') as emusys_matricula_id
    from antigos o
    cross join lateral unnest(o.aluno_ids_locais) aid(aluno_id)
    join public.alunos a on a.id = aid.aluno_id and a.arquivado_em is null
    join public.vw_alunos_estado_operacional_v131 eo
      on eo.aluno_id = a.id and eo.entra_base_ativa = true
    left join public.cursos c on c.id = a.curso_id
    where not coalesce(c.is_projeto_banda, false)
  ),
  matriculas_jornada_relevantes as materialized (
    select o.pessoa_chave,
           min(j.aluno_id)::integer as aluno_id,
           j.emusys_matricula_id::text as emusys_matricula_id
    from antigos o
    join public.aluno_jornada_matricula_disciplina j
      on j.unidade_id = p_unidade_id
     and j.aluno_id = any(o.aluno_ids_locais)
    left join public.cursos c on c.id = j.curso_id
    where j.emusys_matricula_id is not null
      and coalesce(nullif(btrim(j.status_emusys), ''), j.status_matricula) = 'ativa'
    group by o.pessoa_chave, j.emusys_matricula_id
    having bool_or(not coalesce(c.is_projeto_banda, false))
  ),
  cobertura_identidade as (
    select o.pessoa_chave,
           count(distinct ml.aluno_id)::integer as matriculas_locais,
           count(distinct mj.emusys_matricula_id)::integer as matriculas_jornada
    from antigos o
    left join matriculas_locais_relevantes ml
      on ml.pessoa_chave = o.pessoa_chave
    left join matriculas_jornada_relevantes mj
      on mj.pessoa_chave = o.pessoa_chave
    group by o.pessoa_chave
  ),
  matriculas_escolhidas as (
    -- Sem cobertura integral da jornada, conserva o comportamento anterior.
    select ml.pessoa_chave, ml.aluno_id, ml.emusys_matricula_id
    from matriculas_locais_relevantes ml
    join cobertura_identidade ci on ci.pessoa_chave = ml.pessoa_chave
    where ci.matriculas_locais <> ci.matriculas_jornada
       or ci.matriculas_locais = 0

    union all

    -- A igualdade de cardinalidade prova que nenhuma matricula local relevante
    -- foi ocultada antes de usarmos as identidades exatas da jornada.
    select mj.pessoa_chave, mj.aluno_id, mj.emusys_matricula_id
    from matriculas_jornada_relevantes mj
    join cobertura_identidade ci on ci.pessoa_chave = mj.pessoa_chave
    where ci.matriculas_locais = ci.matriculas_jornada
      and ci.matriculas_locais > 0
  ),
  matriculas_relevantes as (
    select me.pessoa_chave,
           me.aluno_id,
           me.emusys_matricula_id,
           obs.id as observacao_id,
           obs.contrato_emusys_id,
           obs.contrato_assinado,
           obs.contrato_status_observado_em
    from matriculas_escolhidas me
    left join lateral (
      select ace.id, ace.contrato_emusys_id, ace.contrato_assinado,
             ace.contrato_status_observado_em
      from public.aluno_contratos_emusys ace
      where ace.unidade_id = p_unidade_id
        and ace.emusys_matricula_id = me.emusys_matricula_id
      order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
      limit 1
    ) obs on me.emusys_matricula_id is not null
  ),
  stats as (
    select o.pessoa_chave,
           count(m.aluno_id)::integer as contratos_relevantes,
           count(*) filter (where m.contrato_assinado is true)::integer as contratos_assinados,
           bool_and(m.contrato_assinado is true)
             filter (where m.aluno_id is not null) as todas_assinadas,
           count(*) filter (where m.contrato_assinado is false)::integer as contratos_nao_assinados,
           count(*) filter (
             where m.observacao_id is not null and m.contrato_emusys_id is null
           )::integer as contratos_sem_contrato,
           count(*) filter (
             where m.aluno_id is not null and (
               m.emusys_matricula_id is null or m.observacao_id is null
             )
           )::integer as contratos_nao_verificados,
           min(m.contrato_status_observado_em) as observado_em,
           sf.reconciliado_em
    from antigos o
    left join matriculas_relevantes m on m.pessoa_chave = o.pessoa_chave
    cross join sync_fresco sf
    group by o.pessoa_chave, sf.reconciliado_em
  ),
  classificados as (
    select s.*,
      case
        when s.contratos_relevantes = 0 then 'dispensado'
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then 'nao_verificado'
        when s.contratos_sem_contrato > 0 then 'sem_contrato'
        when s.contratos_nao_assinados > 0 then 'nao_assinado'
        when s.contratos_assinados = s.contratos_relevantes then 'assinado'
        else 'nao_verificado'
      end as status,
      case
        when s.contratos_relevantes = 0 then null
        when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then null
        else coalesce(s.todas_assinadas, false)
             and s.contratos_assinados = s.contratos_relevantes
      end as assinados_todos
    from stats s
  )
  select o.*,
         c.status,
         c.assinados_todos,
         c.contratos_relevantes,
         c.contratos_assinados,
         c.contratos_nao_assinados,
         c.contratos_sem_contrato,
         c.contratos_nao_verificados,
         c.observado_em,
         c.reconciliado_em,
         (c.reconciliado_em is not null and c.contratos_nao_verificados = 0)
  from antigos o
  join classificados c on c.pessoa_chave = o.pessoa_chave
  order by o.nome;
$$;

revoke all on function public.get_situacao_alunos_v1(uuid, date, boolean)
  from public, anon;
grant execute on function public.get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

comment on function public.get_situacao_alunos_v1(uuid, date, boolean) is
  'Situacao canonica por pessoa; contratos usam todas as linhas locais e a jornada para recuperar matriculas Emusys com cobertura integral.';

commit;
