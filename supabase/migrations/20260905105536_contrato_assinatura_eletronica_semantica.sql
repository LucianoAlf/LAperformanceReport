begin;

-- contrato_assinado=true e evidencia positiva do fluxo eletronico do Emusys.
-- false tambem cobre contratos assinados manualmente e nunca pode virar pendencia.
-- A persistencia, a reconciliacao e os campos de frescor permanecem inalterados.

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
  matriculas_relevantes as (
    select o.pessoa_chave,
           a.id as aluno_id,
           nullif(btrim(a.emusys_matricula_id::text), '') as emusys_matricula_id,
           obs.id as observacao_id,
           obs.contrato_emusys_id,
           obs.contrato_assinado,
           obs.contrato_status_observado_em
    from antigos o
    cross join lateral unnest(o.aluno_ids_locais) aid(aluno_id)
    join public.alunos a on a.id = aid.aluno_id and a.arquivado_em is null
    join public.vw_alunos_estado_operacional_v131 eo
      on eo.aluno_id = a.id and eo.entra_base_ativa = true
    left join public.cursos c on c.id = a.curso_id
    left join lateral (
      select ace.id, ace.contrato_emusys_id, ace.contrato_assinado,
             ace.contrato_status_observado_em
      from public.aluno_contratos_emusys ace
      where ace.unidade_id = p_unidade_id
        and ace.emusys_matricula_id = a.emusys_matricula_id::text
      order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
      limit 1
    ) obs on a.emusys_matricula_id is not null
    where not coalesce(c.is_projeto_banda, false)
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
        when s.contratos_nao_assinados > 0 then 'sem_assinatura_eletronica'
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

revoke all on function public.get_situacao_alunos_v1(uuid, date, boolean) from public, anon;
grant execute on function public.get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

create or replace function public.get_contrato_assinatura_aluno_v1(p_aluno_id integer)
returns table (
  contrato_assinatura_status text,
  contratos_assinados_todos boolean,
  contratos_relevantes integer,
  contratos_assinados integer,
  contratos_nao_assinados integer,
  contratos_sem_contrato integer,
  contratos_nao_verificados integer,
  contrato_status_observado_em timestamptz,
  contrato_reconciliado_em timestamptz,
  contrato_dado_fresco boolean,
  matricula_contrato_status text,
  matricula_contrato_emusys_id text,
  matricula_contrato_assinado boolean,
  matricula_status_observado_em timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_aluno public.alunos%rowtype;
  v_curso_banda boolean;
  v_sync_em timestamptz;
  v_obs public.aluno_contratos_emusys%rowtype;
begin
  select a.* into v_aluno
  from public.alunos a
  where a.id = p_aluno_id and a.arquivado_em is null;

  if v_aluno.id is null then
    raise exception 'aluno_nao_encontrado' using errcode = 'P0002';
  end if;

  if not public.fn_contrato_assinatura_pode_ler_v1(v_aluno.unidade_id) then
    raise exception 'papel nao autorizado para consultar contrato do aluno'
      using errcode = '42501';
  end if;

  select coalesce(c.is_projeto_banda, false) into v_curso_banda
  from public.cursos c
  where c.id = v_aluno.curso_id;
  v_curso_banda := coalesce(v_curso_banda, false);

  select e.completed_at into v_sync_em
  from public.contrato_assinatura_sync_execucoes e
  where e.unidade_id = v_aluno.unidade_id
    and e.status = 'succeeded'
    and (e.completed_at at time zone 'America/Sao_Paulo')::date =
        (now() at time zone 'America/Sao_Paulo')::date
  order by e.completed_at desc
  limit 1;

  if v_aluno.emusys_matricula_id is not null then
    select ace.* into v_obs
    from public.aluno_contratos_emusys ace
    where ace.unidade_id = v_aluno.unidade_id
      and ace.emusys_matricula_id = v_aluno.emusys_matricula_id::text
    order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
    limit 1;
  end if;

  return query
  with pessoa as (
    select s.*
    from public.get_situacao_alunos_v1(
      v_aluno.unidade_id,
      (now() at time zone 'America/Sao_Paulo')::date,
      false
    ) s
    where p_aluno_id = any(s.aluno_ids_locais)
    limit 1
  )
  select p.contrato_assinatura_status,
         p.contratos_assinados_todos,
         p.contratos_relevantes,
         p.contratos_assinados,
         p.contratos_nao_assinados,
         p.contratos_sem_contrato,
         p.contratos_nao_verificados,
         p.contrato_status_observado_em,
         p.contrato_reconciliado_em,
         p.contrato_dado_fresco,
         case
           when v_curso_banda then 'dispensado'
           when v_sync_em is null or v_aluno.emusys_matricula_id is null or v_obs.id is null
             then 'nao_verificado'
           when v_obs.contrato_emusys_id is null then 'sem_contrato'
           when v_obs.contrato_assinado is true then 'assinado'
           when v_obs.contrato_assinado is false then 'sem_assinatura_eletronica'
           else 'nao_verificado'
         end,
         v_obs.contrato_emusys_id,
         v_obs.contrato_assinado,
         v_obs.contrato_status_observado_em
  from pessoa p;
end;
$$;

revoke all on function public.get_contrato_assinatura_aluno_v1(integer) from public, anon;
grant execute on function public.get_contrato_assinatura_aluno_v1(integer)
  to authenticated, service_role, sol_acesso_restrito;

commit;
