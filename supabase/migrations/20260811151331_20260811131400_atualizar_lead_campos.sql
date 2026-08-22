-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-11 — RPC para atualizar campos do lead direto na Chamada
--
-- Permite que a equipe (secretaria ou comercial) complete os campos do lead
-- direto no drawer da Chamada, sem precisar ir na ficha do lead. Campos
-- editáveis: telefone, canal_origem_id, curso_interesse_id, faixa_etaria,
-- professor_experimental_id.
--
-- Atualiza leads (se lead_id existe) e lead_experimentais (sempre).

create or replace function public.app_atualizar_lead_campos(
  p_experimental_id integer,
  p_telefone text default null,
  p_canal_origem_id integer default null,
  p_curso_interesse_id integer default null,
  p_faixa_etaria text default null,
  p_professor_experimental_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_experimental public.lead_experimentais%rowtype;
  v_lead_id integer;
  v_campos_atualizados text[] := '{}';
begin
  -- Autenticação
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  -- Busca a experimental
  select * into v_experimental
  from public.lead_experimentais
  where id = p_experimental_id;

  if not found then
    raise exception 'experimental_nao_encontrada' using errcode = 'P0002';
  end if;

  -- Permissão por unidade
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_experimental.unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  v_lead_id := v_experimental.lead_id;

  -- Atualiza lead_experimentais
  update public.lead_experimentais
  set curso_interesse_id = coalesce(p_curso_interesse_id, curso_interesse_id),
      professor_experimental_id = coalesce(p_professor_experimental_id, professor_experimental_id),
      updated_at = now()
  where id = p_experimental_id;

  if p_curso_interesse_id is not null then
    v_campos_atualizados := array_append(v_campos_atualizados, 'curso_interesse_id');
  end if;
  if p_professor_experimental_id is not null then
    v_campos_atualizados := array_append(v_campos_atualizados, 'professor_experimental_id');
  end if;

  -- Atualiza leads (se houver lead vinculado)
  if v_lead_id is not null then
    update public.leads
    set telefone = coalesce(p_telefone, telefone),
        canal_origem_id = coalesce(p_canal_origem_id, canal_origem_id),
        faixa_etaria = coalesce(p_faixa_etaria, faixa_etaria),
        updated_at = now()
    where id = v_lead_id;

    if p_telefone is not null then
      v_campos_atualizados := array_append(v_campos_atualizados, 'telefone');
    end if;
    if p_canal_origem_id is not null then
      v_campos_atualizados := array_append(v_campos_atualizados, 'canal_origem_id');
    end if;
    if p_faixa_etaria is not null then
      v_campos_atualizados := array_append(v_campos_atualizados, 'faixa_etaria');
    end if;
  end if;

  return jsonb_build_object(
    'atualizado', true,
    'experimental_id', p_experimental_id,
    'lead_id', v_lead_id,
    'campos', v_campos_atualizados
  );
end;
$$;

revoke all on function public.app_atualizar_lead_campos(integer, text, integer, integer, text, integer) from public, anon;
grant execute on function public.app_atualizar_lead_campos(integer, text, integer, integer, text, integer) to authenticated;
