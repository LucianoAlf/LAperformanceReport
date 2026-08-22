-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Parte C: proteger o prontuario no PONTO DE ESCRITA, nao so na tela.
-- 1) helper reutilizavel  2) expor na app_registro_completo (pedido do Claude Code)
-- 3) TRAVA no registrar_aula_fabio: modo 'novo' NAO sobrescreve texto existente. Nunca.
--    Se o front (ou o Fabio, ou qualquer caller) esquecer de mandar substituir/complementar,
--    o banco RECUSA em vez de destruir o trabalho do professor.

create or replace function public.fn_aula_ja_registrada(p_aula_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'aluno_id',      x.aluno_id,
           'aluno_nome',    x.nome,
           'aula_id',       x.aula_id,
           'registrado_em', x.criado_em,
           'previa',        left(x.texto, 140)
         ) order by x.nome), '[]'::jsonb)
  from (
    select distinct on (r.aluno_id)
           r.aluno_id, a.nome, alvo.id as aula_id, alvo.anotacoes_fabio as texto,
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
  ) x
$$;

revoke all on function public.fn_aula_ja_registrada(integer) from public, anon;
grant execute on function public.fn_aula_ja_registrada(integer) to authenticated, service_role;

-- app_registro_completo: o sinal onde a tela de Confirmar realmente olha
create or replace function public.app_registro_completo(p_registro_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_prof   integer := public.fn_professor_do_usuario();
  v_tronco jsonb;
  v_fatias jsonb;
  v_aula   jsonb;
  v_ja     jsonb;
  v_aula_id integer;
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor'); end if;

  select to_jsonb(r) into v_tronco from public.fabio_registros_aula r
   where r.id = p_registro_id and r.parent_id is null and r.professor_id = v_prof;
  if v_tronco is null then return jsonb_build_object('erro','nao_encontrado'); end if;

  v_aula_id := (v_tronco->>'aula_id')::integer;

  select coalesce(jsonb_agg(
           to_jsonb(r)
           || jsonb_build_object(
                'aluno_nome',          a.nome,
                'aluno_primeiro_nome', split_part(btrim(a.nome), ' ', 1),
                'aluno_foto_url',      a.foto_url,
                'aula_id_alvo',        case when r.aluno_id is not null
                                            then public.fn_aula_individual_do_aluno(r.aula_id, r.aluno_id) end
              )
           order by a.nome), '[]'::jsonb)
    into v_fatias
    from public.fabio_registros_aula r
    left join public.alunos a on a.id = r.aluno_id
   where r.parent_id = p_registro_id;

  select jsonb_build_object(
           'data_aula', v.data_aula, 'hora', v.horario_inicio_brt,
           'turma', v.turma_nome, 'curso', v.curso_nome, 'tipo', v.aula_tipo)
    into v_aula
    from public.vw_fabio_aulas_contexto v
   where v.aula_local_id = v_aula_id limit 1;

  v_ja := public.fn_aula_ja_registrada(v_aula_id);

  return jsonb_build_object(
    'tronco', v_tronco,
    'fatias', v_fatias,
    'aula',   v_aula,
    'aula_ja_registrada', (jsonb_array_length(v_ja) > 0),
    'ja_registrados', v_ja,
    -- o front DEVE mandar 'substituir' ou 'complementar' quando aula_ja_registrada = true.
    -- Se mandar 'novo', o banco recusa (nao destroi o trabalho do professor).
    'modo_exigido', case when jsonb_array_length(v_ja) > 0 then 'substituir|complementar' else 'novo' end
  );
end $function$;

revoke all on function public.app_registro_completo(uuid) from public, anon;
grant execute on function public.app_registro_completo(uuid) to authenticated;

-- >>> A TRAVA: a unica porta de escrita recusa sobrescrever em modo 'novo'
create or replace function public.registrar_aula_fabio(
  p_aula_id integer, p_texto text, p_origem text default 'audio',
  p_professor_id integer default null, p_modo text default 'novo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_texto_anterior text;
  v_texto_novo     text;
  v_achou          boolean := false;
begin
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Texto do registro não pode ser vazio';
  end if;
  if p_origem not in ('audio','texto') then
    raise exception 'Origem inválida: % (use audio ou texto)', p_origem;
  end if;
  if p_modo not in ('novo','substituir','complementar') then
    raise exception 'Modo inválido: % (use novo, substituir ou complementar)', p_modo;
  end if;

  select anotacoes_fabio into v_texto_anterior
  from public.aulas_emusys where id = p_aula_id;
  get diagnostics v_achou = row_count;
  if not v_achou then raise exception 'Aula % não encontrada', p_aula_id; end if;

  -- idempotencia: texto identico -> nao regrava
  if v_texto_anterior is not distinct from p_texto then
    return jsonb_build_object('status','sem_mudanca','aula_id',p_aula_id,
      'mensagem','Texto idêntico ao já registrado; nada gravado');
  end if;

  -- TRAVA ANTI-SOBRESCRITA: ja existe registro e o caller mandou 'novo' -> RECUSA.
  -- O professor tem que dizer explicitamente 'substituir' ou 'complementar'.
  if p_modo = 'novo'
     and nullif(btrim(coalesce(v_texto_anterior,'')), '') is not null then
    raise exception 'registro_ja_existe_escolha_modo: a aula % já tem relatório gravado. Use modo=substituir (troca) ou modo=complementar (anexa). Nada foi apagado.', p_aula_id
      using errcode = '42501';
  end if;

  if p_modo = 'complementar'
     and nullif(btrim(coalesce(v_texto_anterior,'')), '') is not null then
    v_texto_novo := v_texto_anterior || E'\n\n--- (complemento) ---\n\n' || p_texto;
  else
    v_texto_novo := p_texto;
  end if;

  update public.aulas_emusys set anotacoes_fabio = v_texto_novo where id = p_aula_id;

  insert into public.aula_registros_fabio_log
    (aula_id, professor_id, texto_anterior, texto_novo, origem, modo)
  values (p_aula_id, p_professor_id, v_texto_anterior, v_texto_novo, p_origem, p_modo);

  return jsonb_build_object('status','gravado','aula_id',p_aula_id,'modo',p_modo,'origem',p_origem,
    'tinha_anterior', nullif(btrim(coalesce(v_texto_anterior,'')),'') is not null);
end
$function$;

revoke all on function public.registrar_aula_fabio(integer,text,text,integer,text) from public, anon;
grant execute on function public.registrar_aula_fabio(integer,text,text,integer,text) to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname='fabio_agent') then
    execute 'grant execute on function public.registrar_aula_fabio(integer,text,text,integer,text) to fabio_agent';
  end if;
end $$;
