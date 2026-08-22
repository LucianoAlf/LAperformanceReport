-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ACHADO DO ALF (12/07): depois de gravar, a tela nao mostra que a aula JA TEM registro.
-- O professor pode gravar de novo e SOBRESCREVER o relatorio anterior sem aviso
-- (registrar_aula_fabio, modo 'novo' = default, substitui anotacoes_fabio).
-- O texto antigo sobrevive em aula_registros_fabio_log, mas o professor nunca saberia.
--
-- Rede de protecao no banco: ao enfileirar o audio, a RPC agora AVISA que ja existe
-- registro, dizendo de quais alunos e quando. O front nao tem como "esquecer" de perguntar.
create or replace function public.app_enfileirar_audio(
  p_aula_id integer,
  p_storage_path text,
  p_duracao_segundos integer,
  p_registro_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prof     integer := public.fn_professor_do_usuario();
  v_aula     public.aulas_emusys%rowtype;
  v_unidade  uuid;
  v_id       uuid;
  v_ja       jsonb;
  v_qtd_ja   integer := 0;
begin
  if v_prof is null then raise exception 'Usuário sem professor vinculado'; end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage_path obrigatório';
  end if;

  select * into v_aula from public.aulas_emusys where id = p_aula_id;
  if not found then raise exception 'Aula % não encontrada', p_aula_id; end if;

  if v_aula.professor_id is distinct from v_prof then
    raise exception 'aula_nao_pertence_ao_professor';
  end if;
  if coalesce(v_aula.cancelada, false) then raise exception 'aula_cancelada'; end if;
  if v_aula.data_hora_inicio > now() + interval '15 minutes' then
    raise exception 'gravacao_ainda_nao_disponivel';
  end if;
  if coalesce(v_aula.data_hora_fim, v_aula.data_hora_inicio) < now() - interval '24 hours' then
    raise exception 'janela_de_gravacao_encerrada';
  end if;

  v_unidade := v_aula.unidade_id;

  if p_registro_id is not null then
    perform 1 from public.fabio_registros_aula
     where id = p_registro_id and professor_id = v_prof
       and status in ('rascunho','aguardando_confirmacao');
    if not found then
      raise exception 'Registro % não encontrado/permitido para complemento', p_registro_id;
    end if;
  end if;

  -- >>> AVISO DE REGRAVACAO: quem desta aula JA tem relatorio gravado?
  select coalesce(jsonb_agg(jsonb_build_object(
           'aluno_id', x.aluno_id,
           'aluno_nome', x.nome,
           'aula_id', x.aula_id,
           'registrado_em', x.criado_em,
           'previa', left(x.texto, 120)
         ) order by x.nome), '[]'::jsonb), count(*)
    into v_ja, v_qtd_ja
  from (
    select distinct on (r.aluno_id)
           r.aluno_id, a.nome, alvo.id as aula_id,
           alvo.anotacoes_fabio as texto,
           (select max(l.criado_em) from public.aula_registros_fabio_log l where l.aula_id = alvo.id) as criado_em
    from public.aula_alunos_emusys r
    join public.alunos a on a.id = r.aluno_id
    join lateral (
      select ae2.* from public.aulas_emusys ae2
      where ae2.id = public.fn_aula_individual_do_aluno(p_aula_id, r.aluno_id)
    ) alvo on true
    where r.aula_emusys_id = p_aula_id
      and nullif(btrim(coalesce(alvo.anotacoes_fabio,'')), '') is not null
    order by r.aluno_id, alvo.id
  ) x;

  insert into public.fabio_fila_audios
    (professor_id, unidade_id, aula_id, storage_path, duracao_segundos, origem, status)
  values (v_prof, v_unidade, p_aula_id, p_storage_path, p_duracao_segundos, 'app', 'pendente')
  returning id into v_id;

  if p_registro_id is not null then
    update public.fabio_registros_aula
       set campos = campos || jsonb_build_object('audio_complemento_id', v_id)
     where id = p_registro_id;
  end if;

  return jsonb_build_object(
    'audio_id', v_id,
    'status', 'pendente',
    'modo', case when p_registro_id is null then 'novo' else 'complementar' end,
    'registro_id', p_registro_id,
    -- o front DEVE perguntar antes de confirmar como 'novo' quando isto vier true
    'aula_ja_registrada', (v_qtd_ja > 0),
    'ja_registrados', v_ja
  );
end
$function$;

revoke all on function public.app_enfileirar_audio(integer, text, integer, uuid) from public, anon;
grant execute on function public.app_enfileirar_audio(integer, text, integer, uuid) to authenticated;
