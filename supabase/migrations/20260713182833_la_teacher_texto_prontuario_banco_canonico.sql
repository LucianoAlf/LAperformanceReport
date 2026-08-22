-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================================
-- LA TEACHER · MIGRAÇÃO 007 — TEXTO DO PRONTUÁRIO CANÔNICO NO BANCO
--
-- Problema: a normalização/preview ainda podia persistir `texto_consolidado`
-- montado pelo LLM/app, com cabeçalho redundante, palavra "Aluno", cutucadas
-- e progresso repetindo atividade coletiva.
--
-- Regra canônica: o texto final do histórico é sempre composto pelo banco em
-- `fn_compor_texto_prontuario(tronco.campos, fatia.campos)`. O LLM/app só
-- preenche campos estruturados.
-- ============================================================================

create or replace function public.fabio_criar_registro(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_audio_id      uuid := (p_payload->>'audio_id')::uuid;
  v_aula_id       integer := (p_payload->>'aula_id')::integer;
  v_professor     integer := (p_payload->>'professor_id')::integer;
  v_unidade       uuid;
  v_molde         text := coalesce(p_payload->>'molde','C');
  v_tronco_id     uuid;
  v_tronco_campos jsonb := coalesce(p_payload->'tronco'->'campos','{}'::jsonb);
  v_fatia         jsonb;
  v_fatia_campos  jsonb;
  v_fatia_aula    integer;
  v_qtd_fatias    integer := 0;
begin
  if v_aula_id is null then raise exception 'aula_id obrigatório'; end if;
  if v_professor is null then raise exception 'professor_id obrigatório'; end if;

  select unidade_id into v_unidade from public.aulas_emusys where id = v_aula_id;
  if v_unidade is null then raise exception 'Aula % não encontrada', v_aula_id; end if;

  -- idempotência: se já existe registro pra esse audio_id, retorna o existente
  if v_audio_id is not null then
    select id into v_tronco_id from public.fabio_registros_aula
     where audio_id = v_audio_id and parent_id is null limit 1;
    if v_tronco_id is not null then
      return jsonb_build_object('status','ja_existe','registro_id',v_tronco_id);
    end if;
  end if;

  -- TRONCO: ignora texto livre vindo do LLM/app; texto é derivado dos campos.
  insert into public.fabio_registros_aula
    (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
     texto_consolidado, status, origem, audio_id)
  values
    (v_aula_id, v_unidade, v_professor, null, null, v_molde,
     v_tronco_campos,
     public.fn_compor_texto_prontuario(v_tronco_campos, '{}'::jsonb),
     'aguardando_confirmacao',
     coalesce(p_payload->>'origem','app'),
     v_audio_id)
  returning id into v_tronco_id;

  -- FATIAS: uma por aluno; texto também é derivado de tronco + fatia.
  for v_fatia in select * from jsonb_array_elements(coalesce(p_payload->'fatias','[]'::jsonb))
  loop
    v_fatia_aula := coalesce((v_fatia->>'aula_id')::integer, v_aula_id);
    v_fatia_campos := coalesce(v_fatia->'campos','{}'::jsonb);

    insert into public.fabio_registros_aula
      (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
       texto_consolidado, status, origem, audio_id)
    values
      (v_fatia_aula, v_unidade, v_professor,
       (v_fatia->>'aluno_id')::integer, v_tronco_id, v_molde,
       v_fatia_campos,
       public.fn_compor_texto_prontuario(v_tronco_campos, v_fatia_campos),
       'aguardando_confirmacao',
       coalesce(p_payload->>'origem','app'),
       v_audio_id);
    v_qtd_fatias := v_qtd_fatias + 1;
  end loop;

  if v_audio_id is not null then
    update public.fabio_fila_audios set status='normalizado', atualizado_em=now()
     where id = v_audio_id;
  end if;

  return jsonb_build_object('status','criado','registro_id',v_tronco_id,'fatias',v_qtd_fatias);
end $$;

create or replace function public.app_atualizar_fatia(
  p_id uuid,
  p_texto text default null,
  p_campos jsonb default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_prof         integer := public.fn_professor_do_usuario();
  v_reg          public.fabio_registros_aula%rowtype;
  v_prof_dono    integer;
  v_campos_novos jsonb;
  v_tronco       public.fabio_registros_aula%rowtype;
  v_out          jsonb;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;

  select * into v_reg from public.fabio_registros_aula where id = p_id;
  if not found then raise exception 'Registro % não encontrado', p_id; end if;

  v_prof_dono := v_reg.professor_id;
  if v_prof_dono is null and v_reg.parent_id is not null then
    select professor_id into v_prof_dono
      from public.fabio_registros_aula where id = v_reg.parent_id;
  end if;
  if v_prof_dono is distinct from v_prof then
    raise exception 'Registro não pertence a este professor';
  end if;
  if v_reg.status not in ('rascunho','aguardando_confirmacao') then
    raise exception 'Status % não permite edição', v_reg.status;
  end if;

  v_campos_novos := case when p_campos is null then v_reg.campos else v_reg.campos || p_campos end;

  if v_reg.parent_id is null then
    -- Atualiza tronco e regenera também as fatias, porque o comum mudou.
    update public.fabio_registros_aula
       set campos = v_campos_novos,
           texto_consolidado = public.fn_compor_texto_prontuario(v_campos_novos, '{}'::jsonb)
     where id = p_id
     returning * into v_reg;

    update public.fabio_registros_aula f
       set texto_consolidado = public.fn_compor_texto_prontuario(v_campos_novos, f.campos)
     where f.parent_id = p_id;
  else
    select * into v_tronco from public.fabio_registros_aula where id = v_reg.parent_id;
    if not found then raise exception 'Tronco do registro % não encontrado', p_id; end if;

    update public.fabio_registros_aula
       set campos = v_campos_novos,
           texto_consolidado = public.fn_compor_texto_prontuario(v_tronco.campos, v_campos_novos)
     where id = p_id
     returning * into v_reg;
  end if;

  select to_jsonb(v_reg) into v_out;
  return v_out;
end $$;

revoke all on function public.fabio_criar_registro(jsonb) from public, anon;
grant execute on function public.fabio_criar_registro(jsonb) to authenticated, service_role;

revoke all on function public.app_atualizar_fatia(uuid,text,jsonb) from public, anon;
grant execute on function public.app_atualizar_fatia(uuid,text,jsonb) to authenticated;
