-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 009-presenca-do-registro.sql — Fase 1: presença nasce do registro do Fábio + conserta lockout da chamada.
alter table public.aluno_presenca drop constraint if exists aluno_presenca_respondido_por_check;
alter table public.aluno_presenca add constraint aluno_presenca_respondido_por_check
  check (respondido_por is null or respondido_por in
    ('professor_whatsapp','professor_la_teacher','manual','sistema','emusys','fabio_audio'));

create or replace function public.fn_registrar_presencas_core(
  p_aula_ancora_id integer, p_professor_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[],
  p_respondido_por text default 'professor_la_teacher', p_estrito boolean default true
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_aula public.aulas_emusys%rowtype; v_roster_total integer; v_sem_vinculo integer;
  v_inseridos integer; v_promovidos integer;
begin
  if p_respondido_por not in ('professor_la_teacher','fabio_audio') then
    raise exception 'respondido_por_invalido: %', p_respondido_por; end if;
  select * into v_aula from public.aulas_emusys where id = p_aula_ancora_id;
  if not found then
    if p_estrito then raise exception 'aula_nao_encontrada'; end if;
    return jsonb_build_object('aula_id',p_aula_ancora_id,'aplicado',false,'motivo','aula_nao_encontrada'); end if;
  if coalesce(v_aula.cancelada,false) then
    if p_estrito then raise exception 'aula_cancelada'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','aula_cancelada'); end if;
  if v_aula.professor_id is distinct from p_professor_id then
    if p_estrito then raise exception 'aula_nao_pertence_ao_professor' using errcode='42501'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','professor_divergente'); end if;
  if p_estrito then
    if v_aula.data_hora_inicio > now() + interval '15 minutes' then raise exception 'chamada_ainda_nao_disponivel'; end if;
    if coalesce(v_aula.data_hora_fim, v_aula.data_hora_inicio) < now() - interval '24 hours' then raise exception 'janela_de_chamada_encerrada'; end if;
  end if;
  select count(*), count(*) filter (where aluno_id is null) into v_roster_total, v_sem_vinculo
    from public.aula_alunos_emusys where aula_emusys_id = v_aula.id;
  if v_roster_total = 0 then
    if p_estrito then raise exception 'roster_nao_sincronizado'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','roster_nao_sincronizado'); end if;
  if v_sem_vinculo > 0 then
    if p_estrito then raise exception 'roster_incompleto'; end if;
    return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','roster_incompleto'); end if;
  if exists (select 1 from unnest(coalesce(p_alunos_ausentes,'{}'::integer[])) a(aluno_id)
      where not exists (select 1 from public.aula_alunos_emusys r where r.aula_emusys_id=v_aula.id and r.aluno_id=a.aluno_id)) then
    if p_estrito then raise exception 'aluno_ausente_fora_do_roster';
    else return jsonb_build_object('aula_id',v_aula.id,'aplicado',false,'motivo','aluno_ausente_fora_do_roster'); end if; end if;
  with up as (
    insert into public.aluno_presenca (aluno_id,aula_emusys_id,professor_id,unidade_id,data_aula,horario_aula,
      status,status_presenca,curso_nome,turma_nome,sala_nome,respondido_por,respondido_em)
    select distinct r.aluno_id, v_aula.id, p_professor_id, v_aula.unidade_id, v_aula.data_aula,
      (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
      case when r.aluno_id = any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'ausente' else 'presente' end,
      case when r.aluno_id = any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'falta' else 'presente' end,
      v_aula.curso_nome, v_aula.turma_nome, v_aula.sala_nome, p_respondido_por, now()
    from public.aula_alunos_emusys r where r.aula_emusys_id=v_aula.id and r.aluno_id is not null
    on conflict (aluno_id, aula_emusys_id) do update
      set status=excluded.status, status_presenca=excluded.status_presenca,
          respondido_por=excluded.respondido_por, respondido_em=excluded.respondido_em
      where aluno_presenca.respondido_por is null or aluno_presenca.respondido_por in ('emusys','sistema')
    returning (xmax=0) as inserido)
  select count(*) filter (where inserido), count(*) filter (where not inserido) into v_inseridos, v_promovidos from up;
  return jsonb_build_object('aula_id',v_aula.id,'total_roster',v_roster_total,'inseridos',coalesce(v_inseridos,0),
    'promovidos',coalesce(v_promovidos,0),'ja_havia_forte',v_roster_total-coalesce(v_inseridos,0)-coalesce(v_promovidos,0),'aplicado',true);
end $function$;

create or replace function public.app_registrar_presencas_aula(
  p_aula_emusys_id integer, p_alunos_ausentes integer[] default '{}'::integer[]
) returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario(); v_aula public.aulas_emusys%rowtype;
  v_turma_irma integer; v_roster_total integer; v_sem_vinculo integer; v_res jsonb;
begin
  if v_prof is null then raise exception 'sem_professor_vinculado' using errcode='42501'; end if;
  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found or v_aula.professor_id is distinct from v_prof then
    raise exception 'aula_nao_pertence_ao_professor' using errcode='42501'; end if;
  if coalesce(v_aula.cancelada,false) then raise exception 'aula_cancelada'; end if;
  if coalesce(v_aula.tipo,'') <> 'turma' then
    select t.id into v_turma_irma from public.aulas_emusys t
     where t.tipo='turma' and t.unidade_id=v_aula.unidade_id and t.data_hora_inicio=v_aula.data_hora_inicio
       and t.professor_id is not distinct from v_aula.professor_id and coalesce(t.cancelada,false)=false limit 1;
    if v_turma_irma is not null then raise exception 'chamada_somente_na_aula_ancora (use a aula % deste horario)', v_turma_irma; end if;
  end if;
  select count(*) filter (where aluno_id is not null), count(*) filter (where aluno_id is null)
    into v_roster_total, v_sem_vinculo from public.aula_alunos_emusys where aula_emusys_id=v_aula.id;
  if v_roster_total > 0 and v_sem_vinculo = 0 and not exists (
       select 1 from public.aula_alunos_emusys r where r.aula_emusys_id=v_aula.id and r.aluno_id is not null
         and not exists (select 1 from public.aluno_presenca ap where ap.aula_emusys_id=v_aula.id and ap.aluno_id=r.aluno_id
             and ap.respondido_por in ('professor_la_teacher','fabio_audio','manual'))) then
    return jsonb_build_object('aula_id',v_aula.id,'total_roster',v_roster_total,'inseridos',0,
      'ignorados_first_write_wins',v_roster_total,'ja_havia_registros',true,'chamada_ja_enviada',true);
  end if;
  v_res := public.fn_registrar_presencas_core(v_aula.id, v_prof, p_alunos_ausentes, 'professor_la_teacher', true);
  return v_res || jsonb_build_object('chamada_ja_enviada',false,
    'ignorados_first_write_wins', coalesce((v_res->>'total_roster')::int,0)-coalesce((v_res->>'inseridos')::int,0),
    'ja_havia_registros', (coalesce((v_res->>'total_roster')::int,0)-coalesce((v_res->>'inseridos')::int,0))>0);
end $function$;

create or replace function public.fabio_emitir_presenca_por_registro(p_registro_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_reg public.fabio_registros_aula%rowtype; v_aula_reg public.aulas_emusys%rowtype;
  v_ausentes integer[]; v_ancora integer; v_roster_ind integer; v_tem_sinal boolean; v_res jsonb;
begin
  select * into v_reg from public.fabio_registros_aula where id=p_registro_id and parent_id is null;
  if not found then return jsonb_build_object('aplicado',false,'motivo','registro_nao_encontrado'); end if;
  select * into v_aula_reg from public.aulas_emusys where id=v_reg.aula_id;
  if not found then
    update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
      'presenca_emitida',true,'presenca_emitida_em',now(),'presenca_aplicado',false,'presenca_erro','aula_do_registro_nao_encontrada')
     where id=p_registro_id;
    return jsonb_build_object('aula_id',v_reg.aula_id,'aplicado',false,'motivo','aula_do_registro_nao_encontrada'); end if;
  if v_reg.aluno_id is not null then
    v_ancora := v_reg.aula_id;
    select count(*) into v_roster_ind from public.aula_alunos_emusys where aula_emusys_id=v_ancora and aluno_id is not null;
    if coalesce(v_roster_ind,0) > 1 then
      update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
        'presenca_emitida',true,'presenca_emitida_em',now(),'presenca_aplicado',false,'presenca_erro','registro_individual_em_aula_de_turma')
       where id=p_registro_id;
      return jsonb_build_object('aula_id',v_ancora,'aplicado',false,'motivo','registro_individual_em_aula_de_turma'); end if;
    v_tem_sinal := (v_reg.campos->>'presenca') is not null;
    v_ausentes := case when coalesce(v_reg.campos->>'presenca','presente')='ausente' then array[v_reg.aluno_id] else '{}'::integer[] end;
  else
    if coalesce(v_aula_reg.tipo,'') = 'turma' then
      v_ancora := v_reg.aula_id;
    else
      select coalesce((select t.id from public.aulas_emusys t where t.tipo='turma'
         and t.unidade_id=v_aula_reg.unidade_id and t.data_hora_inicio=v_aula_reg.data_hora_inicio
         and t.professor_id is not distinct from v_reg.professor_id and coalesce(t.cancelada,false)=false limit 1), v_reg.aula_id) into v_ancora;
    end if;
    select coalesce(array_agg(f.aluno_id) filter (where coalesce(f.campos->>'presenca','presente')='ausente' and f.aluno_id is not null),'{}'::integer[])
      into v_ausentes from public.fabio_registros_aula f where f.parent_id=p_registro_id;
    v_tem_sinal := exists (select 1 from public.fabio_registros_aula f where f.parent_id=p_registro_id and (f.campos->>'presenca') is not null);
  end if;
  if not coalesce(v_tem_sinal,false) then
    return jsonb_build_object('aula_id',v_ancora,'aplicado',false,'motivo','sem_sinal_de_presenca_no_registro'); end if;
  begin
    v_res := public.fn_registrar_presencas_core(v_ancora, v_reg.professor_id, v_ausentes, 'fabio_audio', false);
  exception when others then v_res := jsonb_build_object('aula_id',v_ancora,'aplicado',false,'erro',sqlerrm); end;
  update public.fabio_registros_aula set campos=coalesce(campos,'{}'::jsonb)||jsonb_build_object(
    'presenca_emitida',true,'presenca_emitida_em',now(),'presenca_aplicado',coalesce((v_res->>'aplicado')::boolean,false),'presenca_erro',v_res->>'erro')
   where id=p_registro_id;
  return v_res || jsonb_build_object('ausentes', to_jsonb(coalesce(v_ausentes,'{}'::integer[])));
end $function$;

create or replace function public.app_confirmar_registro(p_registro_id uuid, p_modo text default 'novo'::text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario(); v_reg public.fabio_registros_aula%rowtype;
  v_fatia record; v_user_id integer; v_gravadas integer := 0; v_puladas integer := 0;
  v_pend jsonb := '[]'::jsonb; v_alvo integer; v_texto text; v_presenca jsonb;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_modo not in ('novo','substituir','complementar') then raise exception 'Modo inválido: %', p_modo; end if;
  select u.id into v_user_id from public.usuarios u where u.auth_user_id = auth.uid();
  select * into v_reg from public.fabio_registros_aula where id=p_registro_id and parent_id is null;
  if not found then raise exception 'Registro % não encontrado', p_registro_id; end if;
  if v_reg.professor_id is distinct from v_prof then raise exception 'Registro não pertence a este professor'; end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then raise exception 'Status % não permite confirmação', v_reg.status; end if;
  if v_reg.aluno_id is not null then
    v_texto := coalesce(public.fn_compor_texto_prontuario(v_reg.campos, v_reg.campos), nullif(btrim(v_reg.texto_consolidado),''));
    if v_texto is null then raise exception 'Registro sem conteúdo'; end if;
    v_alvo := public.fn_aula_individual_do_aluno(v_reg.aula_id, v_reg.aluno_id);
    perform public.registrar_aula_fabio(p_aula_id=>v_alvo, p_texto=>v_texto,
      p_origem=>case when v_reg.origem in ('audio','texto') then v_reg.origem else 'audio' end,
      p_professor_id=>v_reg.professor_id, p_modo=>p_modo);
    v_gravadas := 1;
    update public.fabio_registros_aula set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id where id=p_registro_id;
  else
    for v_fatia in select * from public.fabio_registros_aula where parent_id=p_registro_id loop
      v_texto := coalesce(public.fn_compor_texto_prontuario(v_reg.campos, v_fatia.campos), nullif(btrim(v_fatia.texto_consolidado),''));
      if coalesce(v_fatia.campos->>'presenca','presente')='ausente' then
        v_puladas := v_puladas + 1;
        update public.fabio_registros_aula set status='confirmado', confirmado_em=now(), confirmado_por=v_user_id where id=v_fatia.id;
      elsif v_fatia.aula_id is null or v_fatia.aluno_id is null or v_texto is null then
        v_pend := v_pend || jsonb_build_object('fatia_id',v_fatia.id,'aluno_id',v_fatia.aluno_id,
          'motivo', case when v_fatia.aula_id is null then 'sem aula vinculada' when v_fatia.aluno_id is null then 'sem aluno vinculado' else 'sem conteúdo' end);
      else
        v_alvo := public.fn_aula_individual_do_aluno(v_fatia.aula_id, v_fatia.aluno_id);
        perform public.registrar_aula_fabio(p_aula_id=>v_alvo, p_texto=>v_texto,
          p_origem=>case when v_fatia.origem in ('audio','texto') then v_fatia.origem else 'audio' end,
          p_professor_id=>v_reg.professor_id, p_modo=>p_modo);
        v_gravadas := v_gravadas + 1;
        update public.fabio_registros_aula set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id,
          aula_id=v_alvo, campos=campos||jsonb_build_object('aula_alvo_resolvida',v_alvo) where id=v_fatia.id;
      end if;
    end loop;
    if v_gravadas = 0 then raise exception 'Nada gravável neste registro. Pendências: %', v_pend::text; end if;
    update public.fabio_registros_aula set status=case when jsonb_array_length(v_pend)=0 then 'gravado_emusys' else 'confirmado' end,
      confirmado_em=now(), confirmado_por=v_user_id where id=p_registro_id;
  end if;
  begin
    v_presenca := public.fabio_emitir_presenca_por_registro(p_registro_id);
  exception when others then v_presenca := jsonb_build_object('aplicado',false,'erro',sqlerrm); end;
  return jsonb_build_object('registro_id',p_registro_id,'modo',p_modo,'gravadas',v_gravadas,
    'ausentes_puladas',v_puladas,'pendencias',v_pend,'presenca',v_presenca);
end $function$;
