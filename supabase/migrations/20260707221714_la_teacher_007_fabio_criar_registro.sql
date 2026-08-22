-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RPC que o FÁBIO (via Hermes) chama para gravar o resultado do processamento.
-- Cria o tronco + as fatias de uma vez, em 'aguardando_confirmacao', para o app mostrar.
-- Recebe um JSON estruturado. Idempotente por audio_id (reprocessar não duplica).
create or replace function public.fabio_criar_registro(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_audio_id   uuid := (p_payload->>'audio_id')::uuid;
  v_aula_id    integer := (p_payload->>'aula_id')::integer;
  v_professor  integer := (p_payload->>'professor_id')::integer;
  v_unidade    uuid;
  v_molde      text := coalesce(p_payload->>'molde','C');
  v_tronco_id  uuid;
  v_fatia      jsonb;
  v_fatia_aula integer;
  v_qtd_fatias integer := 0;
begin
  -- validações
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

  -- TRONCO (conteúdo comum; aluno_id null)
  insert into public.fabio_registros_aula
    (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
     texto_consolidado, status, origem, audio_id)
  values
    (v_aula_id, v_unidade, v_professor, null, null, v_molde,
     coalesce(p_payload->'tronco'->'campos','{}'::jsonb),
     p_payload->'tronco'->>'texto',
     'aguardando_confirmacao',
     coalesce(p_payload->>'origem','app'),
     v_audio_id)
  returning id into v_tronco_id;

  -- FATIAS (uma por aluno; se vier vazio, é aula individual e o tronco já basta)
  for v_fatia in select * from jsonb_array_elements(coalesce(p_payload->'fatias','[]'::jsonb))
  loop
    -- resolve a aula do aluno: a fatia pode trazer sua própria aula_id (turma = 1 aula por aluno)
    v_fatia_aula := coalesce((v_fatia->>'aula_id')::integer, v_aula_id);
    insert into public.fabio_registros_aula
      (aula_id, unidade_id, professor_id, aluno_id, parent_id, molde, campos,
       texto_consolidado, status, origem, audio_id)
    values
      (v_fatia_aula, v_unidade, v_professor,
       (v_fatia->>'aluno_id')::integer, v_tronco_id, v_molde,
       coalesce(v_fatia->'campos','{}'::jsonb),
       v_fatia->>'texto',
       'aguardando_confirmacao',
       coalesce(p_payload->>'origem','app'),
       v_audio_id);
    v_qtd_fatias := v_qtd_fatias + 1;
  end loop;

  -- marca o áudio como normalizado (se veio audio_id)
  if v_audio_id is not null then
    update public.fabio_fila_audios set status='normalizado', atualizado_em=now()
     where id = v_audio_id;
  end if;

  return jsonb_build_object('status','criado','registro_id',v_tronco_id,'fatias',v_qtd_fatias);
end $$;

-- Quem pode chamar: o Fábio autentica com a chave de service role (que ignora RLS),
-- OU com um usuário de serviço. Por ora, concedemos a authenticated + service_role.
-- (a segurança real vem do HMAC no webhook do Hermes + o toolset mínimo da rota)
revoke all on function public.fabio_criar_registro(jsonb) from public, anon;
grant execute on function public.fabio_criar_registro(jsonb) to authenticated, service_role;
