-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Correcoes 5 e 6 da leva de revisao final: gerar_convite_anamnese
--
-- Achado 5: a funcao buscava o usuario so por auth_user_id, sem checar
-- usuarios.ativo. is_admin() e get_user_unidade_ids(), que governam a RLS
-- do resto do sistema, exigem ativo = true. Sem essa checagem aqui, um
-- funcionario desligado que ainda consiga autenticar continua emitindo
-- links publicos de anamnese. Passa a exigir ativo = true na busca do
-- usuario, tratando "nao encontrado" e "encontrado mas inativo" da mesma
-- forma (mesma mensagem/errcode, para nao vazar se o email existe).
--
-- Achado 6: a funcao validava a unidade contra o usuario, mas aceitava
-- qualquer p_aluno_id sem checar se aquele aluno pertence a p_unidade_id.
-- Pela interface isso nao e alcancavel, mas a RPC e exposta pelo PostgREST.
-- Acrescenta a validacao: quando p_aluno_id nao e nulo, o aluno precisa
-- pertencer a p_unidade_id, senao levanta excecao 42501.

create or replace function public.gerar_convite_anamnese(
  p_tipo_formulario varchar,
  p_unidade_id      uuid,
  p_nome_aluno      text,
  p_aluno_id        integer default null,
  p_telefone_aluno  text    default null,
  p_data_nascimento date    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_usuario usuarios%rowtype;
  v_convite anamnese_convites%rowtype;
  v_nome    text := btrim(coalesce(p_nome_aluno, ''));
  v_token   text;
  v_aluno_unidade uuid;
begin
  select * into v_usuario from usuarios where auth_user_id = auth.uid() and ativo = true;
  if not found then
    raise exception 'usuario nao autenticado' using errcode = '42501';
  end if;

  if v_usuario.perfil is distinct from 'admin'
     and v_usuario.unidade_id is distinct from p_unidade_id then
    raise exception 'unidade fora do alcance do usuario' using errcode = '42501';
  end if;

  if p_tipo_formulario not in ('EMLA', 'LAMK') then
    raise exception 'tipo_formulario invalido: %', p_tipo_formulario using errcode = '22023';
  end if;

  if v_nome = '' then
    raise exception 'nome_aluno obrigatorio' using errcode = '22023';
  end if;

  if p_aluno_id is not null then
    select unidade_id into v_aluno_unidade from alunos where id = p_aluno_id;
    if v_aluno_unidade is distinct from p_unidade_id then
      raise exception 'aluno nao pertence a unidade informada' using errcode = '42501';
    end if;
  end if;

  -- Ja existe convite vivo para este aluno?
  select * into v_convite
    from anamnese_convites
   where usado_em is null
     and revogado_em is null
     and (
       (p_aluno_id is not null and aluno_id = p_aluno_id)
       or (p_aluno_id is null and aluno_id is null
           and lower(nome_aluno) = lower(v_nome)
           and unidade_id = p_unidade_id)
     )
   order by criado_em desc
   limit 1
   for update;

  if found then
    if v_convite.expira_em > now() then
      return jsonb_build_object(
        'token',       v_convite.token,
        'expira_em',   v_convite.expira_em,
        'reutilizado', true
      );
    end if;
    update anamnese_convites set revogado_em = now() where id = v_convite.id;
  end if;

  -- pgcrypto vive no schema extensions; search_path fica restrito a 'public',
  -- entao a funcao precisa ser chamada com o schema qualificado.
  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into anamnese_convites (
    token, aluno_id, nome_aluno, telefone_aluno, data_nascimento,
    unidade_id, tipo_formulario, expira_em, criado_por
  ) values (
    v_token, p_aluno_id, v_nome, p_telefone_aluno, p_data_nascimento,
    p_unidade_id, p_tipo_formulario, now() + interval '7 days', v_usuario.id
  )
  returning * into v_convite;

  return jsonb_build_object(
    'token',       v_convite.token,
    'expira_em',   v_convite.expira_em,
    'reutilizado', false
  );
end;
$$;

revoke execute on function public.gerar_convite_anamnese(varchar, uuid, text, integer, text, date) from public;
grant  execute on function public.gerar_convite_anamnese(varchar, uuid, text, integer, text, date) to authenticated;
