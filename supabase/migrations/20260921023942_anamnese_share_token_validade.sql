-- Prazo e revogacao dos links publicos de anamnese.
-- Legados: maximo entre criacao + 180 dias e 30 dias apos esta migration.
-- Novos/regenerados: 90 dias. Nenhum token ou dado de anamnese e registrado.

alter table public.anamneses
  add column if not exists share_token_expira_em timestamptz,
  add column if not exists share_token_revogado_em timestamptz;

update public.anamneses
   set share_token_expira_em = greatest(
     coalesce(created_at, now()) + interval '180 days',
     now() + interval '30 days'
   )
 where share_token is not null
   and share_token_expira_em is null;

create or replace function private.aplicar_validade_share_token()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.share_token is not null and new.share_token_expira_em is null then
      new.share_token_expira_em := now() + interval '90 days';
    end if;
  elsif new.share_token is distinct from old.share_token then
    if new.share_token is null then
      new.share_token_expira_em := null;
    else
      new.share_token_expira_em := now() + interval '90 days';
      new.share_token_revogado_em := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.aplicar_validade_share_token() from public, anon, authenticated;

drop trigger if exists trg_anamneses_validade_share_token on public.anamneses;
create trigger trg_anamneses_validade_share_token
before insert or update of share_token on public.anamneses
for each row
execute function private.aplicar_validade_share_token();
create or replace function public.get_anamnese_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_anam public.anamneses%rowtype;
  v_unidade_nome text;
  v_aluno_nome text;
  v_aluno_data_nascimento date;
  v_respostas jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32}$' then
    return null;
  end if;

  perform private.consumir_rate_limit_anamnese('perfil');

  select *
    into v_anam
    from public.anamneses
   where share_token = lower(p_token)
     and status = 'completa'
     and share_token_revogado_em is null
     and (share_token_expira_em is null or share_token_expira_em > now())
   limit 1;

  if not found then
    return null;
  end if;

  select nome into v_unidade_nome from public.unidades where id = v_anam.unidade_id;

  if v_anam.aluno_id is not null then
    select a.nome, a.data_nascimento
      into v_aluno_nome, v_aluno_data_nascimento
      from public.alunos a
     where a.id = v_anam.aluno_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pergunta_numero', pergunta_numero,
        'resposta_posicao', resposta_posicao
      ) order by pergunta_numero
    ),
    '[]'::jsonb
  )
  into v_respostas
  from public.anamnese_respostas_perfil
  where anamnese_id = v_anam.id;

  return jsonb_build_object(
    'id', v_anam.id,
    'tipo_formulario', v_anam.tipo_formulario,
    'created_at', v_anam.created_at,
    'modo_resposta', v_anam.modo_resposta,
    'nome_aluno', v_anam.nome_aluno,
    'data_nascimento', v_aluno_data_nascimento,
    'genero', v_anam.genero,
    'telefone_aluno', v_anam.telefone_aluno,
    'aluno_nome_oficial', v_aluno_nome,
    'professor_nome', null,
    'unidade_nome', v_unidade_nome,
    'cursos_escolhidos', v_anam.cursos_escolhidos,
    'possui_instrumento', v_anam.possui_instrumento,
    'objetivos', v_anam.objetivos,
    'tempo_para_metas', v_anam.tempo_para_metas,
    'tempo_disponivel_estudo', v_anam.tempo_disponivel_estudo,
    'generos_musicais', v_anam.generos_musicais,
    'instrumentos_toca', v_anam.instrumentos_toca,
    'experiencia_anterior', v_anam.experiencia_anterior,
    'nivel_conhecimento_musical', v_anam.nivel_conhecimento_musical,
    'nivel_habilidade_instrumento', v_anam.nivel_habilidade_instrumento,
    'interesse_bandas', v_anam.interesse_bandas,
    'motivo_procura_pais', v_anam.motivo_procura_pais,
    'metas_pais', v_anam.metas_pais,
    'fonte_exposicao_musical', v_anam.fonte_exposicao_musical,
    'musicos_na_familia', v_anam.musicos_na_familia,
    'interesse_instrumento_cantar', v_anam.interesse_instrumento_cantar,
    'exposicao_telas', v_anam.exposicao_telas,
    'comunicacao_crianca', v_anam.comunicacao_crianca,
    'sono_crianca', v_anam.sono_crianca,
    'estereotipias', v_anam.estereotipias,
    'situacao_responsaveis', v_anam.situacao_responsaveis,
    'filiacao', v_anam.filiacao,
    'quem_traz_crianca', v_anam.quem_traz_crianca,
    'diagnosticos', v_anam.diagnosticos,
    'diagnosticos_outro', v_anam.diagnosticos_outro,
    'cuidado_medico', v_anam.cuidado_medico,
    'medicacao_continua', v_anam.medicacao_continua,
    'necessidade_apoio', v_anam.necessidade_apoio,
    'perfil_baby', v_anam.perfil_baby,
    'temperamento_primario', v_anam.temperamento_primario,
    'temperamento_secundario', v_anam.temperamento_secundario,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'respostas_perfil', v_respostas,
    'observacoes_entrevistador', v_anam.observacoes_entrevistador
  );
end;
$$;
create or replace function public.regenerar_anamnese_share_token(p_anamnese_id integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_anamnese public.anamneses%rowtype;
  v_token text;
  v_expira_em timestamptz;
begin
  select *
    into v_usuario
    from public.usuarios
   where auth_user_id = auth.uid()
     and ativo = true;

  if not found then
    raise exception 'operador nao autenticado' using errcode = '42501';
  end if;

  select *
    into v_anamnese
    from public.anamneses
   where id = p_anamnese_id
     and status = 'completa'
   for update;

  if not found then
    raise exception 'anamnese indisponivel' using errcode = '22023';
  end if;

  if v_usuario.perfil is distinct from 'admin'
     and v_usuario.unidade_id is distinct from v_anamnese.unidade_id then
    raise exception 'unidade fora do alcance do operador' using errcode = '42501';
  end if;

  loop
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    begin
      update public.anamneses
         set share_token = v_token,
             share_token_expira_em = now() + interval '90 days',
             share_token_revogado_em = null
       where id = v_anamnese.id
      returning share_token_expira_em into v_expira_em;
      exit;
    exception when unique_violation then
      -- Uma colisao de 128 bits e improvavel; tenta outro token sem expor o atual.
      null;
    end;
  end loop;

  return jsonb_build_object('token', v_token, 'expira_em', v_expira_em);
end;
$$;

create or replace function public.revogar_anamnese_share_token(p_anamnese_id integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_anamnese public.anamneses%rowtype;
  v_revogado_em timestamptz;
begin
  select *
    into v_usuario
    from public.usuarios
   where auth_user_id = auth.uid()
     and ativo = true;

  if not found then
    raise exception 'operador nao autenticado' using errcode = '42501';
  end if;

  select *
    into v_anamnese
    from public.anamneses
   where id = p_anamnese_id
     and status = 'completa'
   for update;

  if not found then
    raise exception 'anamnese indisponivel' using errcode = '22023';
  end if;

  if v_usuario.perfil is distinct from 'admin'
     and v_usuario.unidade_id is distinct from v_anamnese.unidade_id then
    raise exception 'unidade fora do alcance do operador' using errcode = '42501';
  end if;

  update public.anamneses
     set share_token_revogado_em = coalesce(share_token_revogado_em, now())
   where id = v_anamnese.id
  returning share_token_revogado_em into v_revogado_em;

  return jsonb_build_object('revogado_em', v_revogado_em);
end;
$$;

revoke all on function public.regenerar_anamnese_share_token(integer) from public, anon;
revoke all on function public.revogar_anamnese_share_token(integer) from public, anon;
grant execute on function public.regenerar_anamnese_share_token(integer) to authenticated, service_role;
grant execute on function public.revogar_anamnese_share_token(integer) to authenticated, service_role;

notify pgrst, 'reload schema';