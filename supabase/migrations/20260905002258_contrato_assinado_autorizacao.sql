begin;

-- SECURITY DEFINER troca current_user pelo dono da funcao. A autorizacao deve
-- olhar os claims da requisicao; current_user='postgres' nao prova chamada tecnica.
create function public.fn_contrato_assinatura_pode_ler_v1(p_unidade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_jwt_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
begin
  if p_unidade_id is null then return false; end if;
  if v_jwt_role in ('service_role', 'sol_acesso_restrito') then return true; end if;

  if v_uid is not null then
    begin
      return coalesce(public.fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id), false);
    exception when others then
      return false;
    end;
  end if;

  -- Console/migration sem JWT. Nunca alcanca requisicao authenticated porque
  -- ela traz request.jwt.claim.role e/ou sub.
  return v_jwt_role = '' and session_user in ('postgres', 'service_role', 'sol_acesso_restrito');
end;
$$;

revoke all on function public.fn_contrato_assinatura_pode_ler_v1(uuid)
  from public, anon, authenticated;

alter function public.get_situacao_alunos_sem_contrato_assinado_v1(uuid, date, boolean)
  rename to get_situacao_alunos_sem_contrato_assinado_core_v1;
revoke all on function public.get_situacao_alunos_sem_contrato_assinado_core_v1(uuid, date, boolean)
  from public, anon, authenticated, service_role, sol_acesso_restrito;

create function public.get_situacao_alunos_sem_contrato_assinado_v1(
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
  pendencias text[], fonte text, regra_versao text
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not public.fn_contrato_assinatura_pode_ler_v1(p_unidade_id) then
    raise exception 'papel nao autorizado para consultar situacao de alunos'
      using errcode = '42501';
  end if;

  return query
  select core.*
  from public.get_situacao_alunos_sem_contrato_assinado_core_v1(
    p_unidade_id, p_referencia, p_apenas_pendentes
  ) core;
end;
$$;

revoke all on function public.get_situacao_alunos_sem_contrato_assinado_v1(uuid, date, boolean)
  from public, anon, authenticated, service_role, sol_acesso_restrito;

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
           when v_obs.contrato_assinado is false then 'nao_assinado'
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

-- Nao ha leitor pelo aluno_id; o indice aumentaria o custo de cada reconciliacao.
drop index if exists public.aluno_contratos_emusys_aluno_idx;

commit;
