-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 019 — presença é afirmação; pendência tem alvo e resposta.
-- Cabeçalho completo em supabase/migrations/019-presenca-declarada-e-pendencia-por-alvo.sql

create or replace function public.fn_presenca_declarada(p_campos jsonb)
returns text
language sql immutable parallel safe
as $function$
  select case
    when p_campos->>'presenca' = 'presente' then 'presente'
    when p_campos->>'presenca' = 'ausente'  then 'ausente'
    else 'nao_informada'
  end
$function$;

comment on function public.fn_presenca_declarada is
  'Presença como AFIRMACAO. Chave faltando ou valor estranho => nao_informada, nunca presente (migration 019).';

create or replace function public.fn_pendencia_presenca(
  p_registro_alvo_id uuid, p_tipo_alvo text, p_aluno_id integer)
returns jsonb
language sql stable
as $function$
  select jsonb_build_array(jsonb_build_object(
    'registro_alvo_id',  p_registro_alvo_id,
    'tipo_alvo',         p_tipo_alvo,
    'fatia_id',          p_registro_alvo_id,
    'aluno_id',          p_aluno_id,
    'aluno_nome',        (select a.nome from public.alunos a where a.id = p_aluno_id),
    'campo_obrigatorio', 'presenca',
    'valores_permitidos', jsonb_build_array('presente','ausente'),
    'motivo',            'presença não informada'))
$function$;

create or replace function public.app_confirmar_registro(p_registro_id uuid, p_modo text default 'novo')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario(); v_reg public.fabio_registros_aula%rowtype;
  v_fatia record; v_user_id integer; v_gravadas integer := 0; v_puladas integer := 0;
  v_pend jsonb := '[]'::jsonb; v_alvo integer; v_texto text; v_presenca jsonb;
  v_decl text;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_modo not in ('novo','substituir','complementar') then raise exception 'Modo inválido: %', p_modo; end if;
  select u.id into v_user_id from public.usuarios u where u.auth_user_id = auth.uid();
  select * into v_reg from public.fabio_registros_aula where id=p_registro_id and parent_id is null;
  if not found then raise exception 'Registro % não encontrado', p_registro_id; end if;
  if v_reg.professor_id is distinct from v_prof then raise exception 'Registro não pertence a este professor'; end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then raise exception 'Status % não permite confirmação', v_reg.status; end if;

  if v_reg.aluno_id is not null then
    v_decl := public.fn_presenca_declarada(v_reg.campos);
    if v_decl = 'nao_informada' then
      v_pend := v_pend || public.fn_pendencia_presenca(v_reg.id, 'raiz', v_reg.aluno_id);
    elsif v_decl = 'ausente' then
      v_puladas := 1;
      update public.fabio_registros_aula
         set status='confirmado', confirmado_em=now(), confirmado_por=v_user_id
       where id=p_registro_id;
    else
      v_texto := coalesce(public.fn_compor_texto_prontuario(v_reg.campos, v_reg.campos), nullif(btrim(v_reg.texto_consolidado),''));
      if v_texto is null then raise exception 'Registro sem conteúdo'; end if;
      v_alvo := public.fn_aula_individual_do_aluno(v_reg.aula_id, v_reg.aluno_id);
      perform public.registrar_aula_fabio(p_aula_id=>v_alvo, p_texto=>v_texto,
        p_origem=>case when v_reg.origem in ('audio','texto') then v_reg.origem else 'audio' end,
        p_professor_id=>v_reg.professor_id, p_modo=>p_modo);
      v_gravadas := 1;
      update public.fabio_registros_aula set status='gravado_emusys', confirmado_em=now(), confirmado_por=v_user_id where id=p_registro_id;
    end if;
  else
    for v_fatia in select * from public.fabio_registros_aula where parent_id=p_registro_id loop
      v_texto := coalesce(public.fn_compor_texto_prontuario(v_reg.campos, v_fatia.campos), nullif(btrim(v_fatia.texto_consolidado),''));
      v_decl := public.fn_presenca_declarada(v_fatia.campos);
      if v_decl = 'nao_informada' then
        v_pend := v_pend || public.fn_pendencia_presenca(v_fatia.id, 'fatia', v_fatia.aluno_id);
      elsif v_decl = 'ausente' then
        v_puladas := v_puladas + 1;
        update public.fabio_registros_aula set status='confirmado', confirmado_em=now(), confirmado_por=v_user_id where id=v_fatia.id;
      elsif v_fatia.aula_id is null or v_fatia.aluno_id is null or v_texto is null then
        v_pend := v_pend || jsonb_build_object(
          'registro_alvo_id', v_fatia.id, 'tipo_alvo', 'fatia',
          'fatia_id', v_fatia.id,
          'aluno_id', v_fatia.aluno_id,
          'aluno_nome', (select a.nome from public.alunos a where a.id = v_fatia.aluno_id),
          'campo_obrigatorio', null, 'valores_permitidos', null,
          'motivo', case when v_fatia.aula_id is null then 'sem aula vinculada'
                         when v_fatia.aluno_id is null then 'sem aluno vinculado'
                         else 'sem conteúdo' end);
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

    if v_gravadas = 0 and v_puladas = 0 and jsonb_array_length(v_pend) = 0 then
      raise exception 'Nada gravável neste registro. Pendências: %', v_pend::text;
    end if;

    if jsonb_array_length(v_pend) = 0 then
      update public.fabio_registros_aula set status='gravado_emusys',
        confirmado_em=now(), confirmado_por=v_user_id where id=p_registro_id;
    else
      update public.fabio_registros_aula set status='confirmado',
        confirmado_em=now(), confirmado_por=v_user_id where id=p_registro_id;
    end if;
  end if;

  begin
    v_presenca := public.fabio_emitir_presenca_por_registro(p_registro_id);
  exception when others then v_presenca := jsonb_build_object('aplicado',false,'erro',sqlerrm); end;

  return jsonb_build_object('registro_id',p_registro_id,'modo',p_modo,'gravadas',v_gravadas,
    'ausentes_puladas',v_puladas,'pendencias',v_pend,'presenca',v_presenca);
end $function$;

create or replace function public.app_responder_presenca(
  p_registro_alvo_id uuid, p_presenca text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prof integer := public.fn_professor_do_usuario();
  v_reg public.fabio_registros_aula%rowtype;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_presenca not in ('presente','ausente') then
    raise exception 'Presença inválida: % (use presente ou ausente)', p_presenca;
  end if;

  select * into v_reg from public.fabio_registros_aula where id = p_registro_alvo_id;
  if not found then raise exception 'Registro % não encontrado', p_registro_alvo_id; end if;
  if v_reg.professor_id is distinct from v_prof then
    raise exception 'Registro não pertence a este professor';
  end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao','confirmado') then
    raise exception 'Status % não aceita mais resposta de presença', v_reg.status;
  end if;

  update public.fabio_registros_aula
     set campos = coalesce(campos,'{}'::jsonb) || jsonb_build_object('presenca', p_presenca),
         atualizado_em = now()
   where id = p_registro_alvo_id;

  return jsonb_build_object('ok', true, 'registro_alvo_id', p_registro_alvo_id,
                            'presenca', p_presenca);
end $function$;

comment on function public.app_responder_presenca is
  'Grava a presença que o professor informou numa pendência, para ele reconfirmar o registro (migration 019).';

-- ACL: funcao nova nasce com grant padrao pra PUBLIC/anon. Fecha e concede o
-- necessario -- ver 018b, que existiu exatamente por eu ter esquecido isso.
revoke all on function
  public.app_responder_presenca(uuid, text),
  public.fn_presenca_declarada(jsonb),
  public.fn_pendencia_presenca(uuid, text, integer)
from public, anon;

grant execute on function public.app_responder_presenca(uuid, text) to authenticated, service_role;
grant execute on function public.fn_presenca_declarada(jsonb) to authenticated, service_role, fabio_agent;
grant execute on function public.fn_pendencia_presenca(uuid, text, integer) to authenticated, service_role, fabio_agent;
