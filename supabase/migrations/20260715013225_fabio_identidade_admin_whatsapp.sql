-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- LIBERACAO DO ALF (E FUTURO QUINTELA/JULIANA) NO WHATSAPP DO FABIO.
-- Nao criamos professor fake nem allowlist em .env — o sistema de permissao ja existe
-- (usuarios.perfil='admin'), so faltava telefone.
--
-- Colisao achada e corrigida: 5521981278047 estava em usuarios.id=3 ("Equipe Campo Grande"),
-- conta real mas NUNCA usada (ultimo_acesso null) — numero do Alf usado como contato
-- provisorio na criacao, nunca removido. Limpando antes de atribuir ao dono de verdade.
update public.usuarios set telefone = null where id = 3 and telefone = '5521981278047';

update public.usuarios set telefone = '5521981278047' where id = 2;  -- Luciano Alf

-- RESOLVEDOR GERAL: professor OU admin. Mesmo padrao anti-adivinhacao do
-- fn_professor_por_whatsapp (recusa colisao, nunca escolhe arbitrario).
create or replace function public.fabio_identidade_whatsapp(p_telefone text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_canonico text := public.fn_celular_canonico(p_telefone);
  v_prof     jsonb;
  v_admins   jsonb;
  v_qtd_admin integer;
begin
  -- 1) tenta professor primeiro (caminho mais comum, ja tem toda a logica de com/sem 55/9)
  v_prof := public.fn_professor_por_whatsapp(p_telefone);
  if (v_prof->>'ok')::boolean then
    return v_prof || jsonb_build_object('tipo','professor');
  end if;

  -- 2) tenta admin/coordenacao em usuarios
  select jsonb_agg(jsonb_build_object('usuario_id',id,'nome',nome,'perfil',perfil))
    into v_admins
  from public.usuarios
  where public.fn_celular_canonico(telefone) = v_canonico
    and coalesce(ativo,true)
    and perfil in ('admin');

  v_qtd_admin := coalesce(jsonb_array_length(v_admins),0);

  if v_qtd_admin = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'numero_nao_cadastrado');
  elsif v_qtd_admin > 1 then
    -- mesma regra de sempre: colisao NUNCA vira adivinhacao
    return jsonb_build_object('ok', false, 'motivo', 'numero_em_colisao_admin');
  end if;

  return jsonb_build_object('ok', true, 'tipo', 'admin') || (v_admins->0);
end;
$function$;

revoke all on function public.fabio_identidade_whatsapp(text) from public, anon, authenticated;
grant execute on function public.fabio_identidade_whatsapp(text) to service_role, fabio_agent;

-- CONTEXTO ADMIN: visao ampla, mas o PERFIL E' VERIFICADO DENTRO DO SQL — nao e o Hermes
-- que decide se pode responder largo. Mesmo principio do dia inteiro: guardrail no dado.
create or replace function public.fabio_contexto_admin(p_usuario_id integer)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_nome text; v_perfil text; v_res jsonb;
begin
  select nome, perfil into v_nome, v_perfil from public.usuarios where id = p_usuario_id and coalesce(ativo,true);
  if v_perfil is null or v_perfil <> 'admin' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_admin');
  end if;

  select jsonb_build_object(
    'ok', true, 'usuario_id', p_usuario_id, 'nome', v_nome, 'primeiro_nome', split_part(btrim(v_nome),' ',1),
    'visao_geral', jsonb_build_object(
      'professores_ativos', (select count(*) from public.professores where coalesce(ativo,true)),
      'professores_com_pendencia_cobravel', (
        select count(distinct professor_id) from public.vw_registro_pendencia where cobravel),
      'total_aulas_pendentes_cobraveis', (
        select count(*) from public.vw_registro_pendencia where cobravel)
    )
  ) into v_res;

  return v_res;
end;
$function$;

-- PRONTUARIO SEM ESCOPO DE PROFESSOR — mas so libera se o perfil for admin de verdade.
create or replace function public.fabio_prontuario_aluno_admin(p_usuario_id integer, p_aluno_id integer, p_limite integer default 40)
returns jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  v_perfil text;
begin
  select perfil into v_perfil from public.usuarios where id = p_usuario_id and coalesce(ativo,true);
  if v_perfil is null or v_perfil <> 'admin' then
    raise exception 'nao_e_admin' using errcode = '42501';
  end if;
  return public.coord_prontuario_aluno(p_aluno_id, p_limite);
end;
$function$;

revoke all on function public.fabio_contexto_admin(integer) from public, anon, authenticated;
revoke all on function public.fabio_prontuario_aluno_admin(integer,integer,integer) from public, anon, authenticated;
grant execute on function public.fabio_contexto_admin(integer) to service_role, fabio_agent;
grant execute on function public.fabio_prontuario_aluno_admin(integer,integer,integer) to service_role, fabio_agent;
