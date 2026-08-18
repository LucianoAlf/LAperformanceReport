begin;

-- A primeira versao da RPC cadastral ja esta publicada, mas ainda nao ha
-- chamador em producao. Esta assinatura substitui a chamada insegura por uma
-- que exige a matricula Emusys vista pelo sync e a revalida sob o mesmo lock.
-- A assinatura antiga deixa de ser executavel para evitar qualquer uso futuro
-- sem essa protecao de identidade.
revoke all on function public.aplicar_cadastro_emusys_canonico(uuid, integer, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.aplicar_cadastro_emusys_canonico(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_emusys_matricula_id text,
  p_patch jsonb
)
returns table (
  aluno_id integer,
  campos_aplicados text[]
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_aluno_id integer;
  v_campos_aplicados text[] := array[]::text[];
begin
  if nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'MATRICULA_EMUSYS_OBRIGATORIA_PARA_PATCH_CADASTRO';
  end if;

  if coalesce(jsonb_typeof(p_patch), '') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_INVALIDO';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as chave(campo)
    where chave.campo not in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_COM_CAMPO_NAO_PERMITIDO';
  end if;

  -- O lock cobre a identidade e a decisao humana. Uma religacao que terminar
  -- antes deste ponto e percebida aqui; uma religacao posterior aguardara este
  -- patch e sera corrigida pelo proximo snapshot da nova matricula.
  select a.id
    into v_aluno_id
  from public.alunos a
  where a.id = p_aluno_id
    and a.unidade_id = p_unidade_id
    and a.emusys_matricula_id = p_emusys_matricula_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'IDENTIDADE_MATRICULA_EMUSYS_DIVERGENTE';
  end if;

  select coalesce(array_agg(chave.campo order by chave.campo), array[]::text[])
    into v_campos_aplicados
  from jsonb_object_keys(p_patch) as chave(campo)
  where chave.campo in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone'
    )
    and nullif(btrim(p_patch ->> chave.campo), '') is not null
    and not exists (
      select 1
      from public.matriculas_campos_fixados f
      where f.aluno_id = v_aluno_id
        and f.campo = chave.campo
    );

  if cardinality(v_campos_aplicados) = 0 then
    return query select v_aluno_id, v_campos_aplicados;
    return;
  end if;

  update public.alunos a
  set telefone = case when 'telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'telefone'), '') else a.telefone end,
      email = case when 'email' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'email'), '') else a.email end,
      responsavel_nome = case when 'responsavel_nome' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_nome'), '') else a.responsavel_nome end,
      responsavel_telefone = case when 'responsavel_telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_telefone'), '') else a.responsavel_telefone end,
      updated_at = now(),
      updated_by = 'sync-matriculas-emusys'
  where a.id = v_aluno_id
    and a.unidade_id = p_unidade_id
    and a.emusys_matricula_id = p_emusys_matricula_id;

  return query select v_aluno_id, v_campos_aplicados;
end;
$function$;

revoke all on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb)
  to service_role;

-- A decisao humana e o sync usam a mesma ordem de locks: aluno, depois
-- divergencia. Assim, se o sync ganhar a corrida, a escolha "manter LA"
-- regrava o valor local e fixa o campo antes de encerrar a divergencia; se a
-- pessoa ganhar, o sync ve o campo fixado e nao o sobrescreve.
create or replace function public.aplicar_conciliacao_aluno_atributo(
  p_divergencia_id bigint,
  p_decisao text,
  p_decidido_por text default 'usuario_app'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_div public.alunos_emusys_atributos_divergencias%rowtype;
  v_aluno_id_lock integer;
  v_agora timestamptz := now();
  v_valor text;
  v_bool boolean;
  v_forma_nome text;
  v_forma_id integer;
  v_valor_aplicado jsonb := '{}'::jsonb;
  v_resolver boolean;
begin
  if p_decisao not in ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar') then
    raise exception 'decisao invalida: %', p_decisao;
  end if;

  -- Primeiro descobrimos a linha, depois travamos o aluno e so entao a
  -- divergencia. A ordem coincide com a RPC do sync e evita um deadlock entre
  -- "resolver" e "sincronizar".
  select aluno_id
    into v_aluno_id_lock
  from public.alunos_emusys_atributos_divergencias
  where id = p_divergencia_id;

  if not found then
    raise exception 'divergencia % nao encontrada', p_divergencia_id;
  end if;

  if v_aluno_id_lock is not null then
    perform 1
    from public.alunos
    where id = v_aluno_id_lock
    for update;

    if not found then
      raise exception 'aluno % da divergencia nao encontrado', v_aluno_id_lock;
    end if;
  end if;

  select *
    into v_div
  from public.alunos_emusys_atributos_divergencias
  where id = p_divergencia_id
  for update;

  if v_div.resolvido then
    return jsonb_build_object('ok', true, 'ja_resolvido', true, 'id', p_divergencia_id);
  end if;

  if p_decisao = 'aplicar_emusys' then
    if v_div.aluno_id is null then
      raise exception 'aluno_id obrigatorio para aplicar dado do Emusys';
    end if;

    case v_div.campo
      when 'foto_url' then
        v_valor := coalesce(v_div.sugestao->>'foto_url', v_div.valor_emusys->>'foto_url');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'foto_url do Emusys ausente';
        end if;
        update public.alunos set foto_url = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('foto_url', v_valor);

      when 'instagram' then
        v_valor := coalesce(v_div.sugestao->>'instagram', v_div.valor_emusys->>'instagram');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'instagram do Emusys ausente';
        end if;
        update public.alunos set instagram = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('instagram', v_valor);

      when 'telefone' then
        v_valor := coalesce(v_div.sugestao->>'telefone', v_div.valor_emusys->>'telefone');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'telefone do Emusys ausente';
        end if;
        update public.alunos set telefone = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('telefone', v_valor);

      when 'email' then
        v_valor := coalesce(v_div.sugestao->>'email', v_div.valor_emusys->>'email');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'email do Emusys ausente';
        end if;
        update public.alunos set email = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('email', v_valor);

      when 'responsavel_nome' then
        v_valor := coalesce(v_div.sugestao->>'responsavel_nome', v_div.valor_emusys->>'responsavel_nome');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'responsavel_nome do Emusys ausente';
        end if;
        update public.alunos set responsavel_nome = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('responsavel_nome', v_valor);

      when 'responsavel_telefone' then
        v_valor := coalesce(v_div.sugestao->>'responsavel_telefone', v_div.valor_emusys->>'responsavel_telefone');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'responsavel_telefone do Emusys ausente';
        end if;
        update public.alunos set responsavel_telefone = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('responsavel_telefone', v_valor);

      when 'status_pagamento' then
        v_valor := coalesce(v_div.sugestao->>'status_pagamento', v_div.valor_emusys->>'status_pagamento');
        if v_valor is null or btrim(v_valor) = '' then
          raise exception 'status_pagamento do Emusys ausente';
        end if;
        update public.alunos set status_pagamento = v_valor, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('status_pagamento', v_valor);

      when 'aguardando_renovacao' then
        if (v_div.sugestao ? 'aguardando_renovacao') then
          v_bool := (v_div.sugestao->>'aguardando_renovacao')::boolean;
        elsif (v_div.valor_emusys ? 'aguardando_renovacao') then
          v_bool := (v_div.valor_emusys->>'aguardando_renovacao')::boolean;
        else
          raise exception 'aguardando_renovacao do Emusys ausente';
        end if;
        update public.alunos set aguardando_renovacao = v_bool, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('aguardando_renovacao', v_bool);

      when 'forma_pagamento_id' then
        v_forma_nome := public._normalizar_forma_pagamento_conciliacao(
          coalesce(v_div.sugestao->>'forma_pagamento', v_div.valor_emusys->>'forma_pagamento')
        );
        select fp.id
          into v_forma_id
        from public.formas_pagamento fp
        where lower(fp.nome) = lower(v_forma_nome)
        limit 1;

        if v_forma_id is null then
          raise exception 'forma de pagamento nao mapeada: %', v_forma_nome;
        end if;

        update public.alunos set forma_pagamento_id = v_forma_id, updated_at = v_agora where id = v_div.aluno_id;
        v_valor_aplicado := jsonb_build_object('forma_pagamento_id', v_forma_id, 'forma_pagamento', v_forma_nome);

      else
        raise exception 'campo % nao pode ser aplicado automaticamente por esta RPC', v_div.campo;
    end case;

    v_resolver := true;

  elsif p_decisao = 'manter_la' then
    if v_div.aluno_id is not null then
      insert into public.matriculas_campos_fixados
        (aluno_id, campo, valor, fixado_por, fixado_em)
      values
        (v_div.aluno_id, v_div.campo, v_div.valor_nosso, coalesce(p_decidido_por, 'usuario_app'), v_agora)
      on conflict (aluno_id, campo) do update set
        valor = excluded.valor,
        fixado_por = excluded.fixado_por,
        fixado_em = excluded.fixado_em;

      -- Se o sync acabou poucos instantes antes, a decisao manual ainda vence:
      -- restaura o valor que a equipe confirmou e o campo passa a ficar fixado.
      case v_div.campo
        when 'telefone' then
          update public.alunos
          set telefone = nullif(btrim(v_div.valor_nosso->>'telefone'), ''),
              updated_at = v_agora,
              updated_by = coalesce(p_decidido_por, 'usuario_app')
          where id = v_div.aluno_id;
        when 'email' then
          update public.alunos
          set email = nullif(btrim(v_div.valor_nosso->>'email'), ''),
              updated_at = v_agora,
              updated_by = coalesce(p_decidido_por, 'usuario_app')
          where id = v_div.aluno_id;
        when 'responsavel_nome' then
          update public.alunos
          set responsavel_nome = nullif(btrim(v_div.valor_nosso->>'responsavel_nome'), ''),
              updated_at = v_agora,
              updated_by = coalesce(p_decidido_por, 'usuario_app')
          where id = v_div.aluno_id;
        when 'responsavel_telefone' then
          update public.alunos
          set responsavel_telefone = nullif(btrim(v_div.valor_nosso->>'responsavel_telefone'), ''),
              updated_at = v_agora,
              updated_by = coalesce(p_decidido_por, 'usuario_app')
          where id = v_div.aluno_id;
        else
          null;
      end case;
    end if;
    v_valor_aplicado := v_div.valor_nosso;
    v_resolver := true;

  elsif p_decisao = 'ignorar' then
    v_resolver := true;

  else
    v_resolver := false;
  end if;

  insert into public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  values
    (
      v_div.id,
      v_div.aluno_id,
      p_decisao,
      v_div.campo,
      coalesce(v_div.valor_nosso, '{}'::jsonb),
      coalesce(v_div.valor_emusys, '{}'::jsonb),
      coalesce(v_valor_aplicado, '{}'::jsonb),
      'Conciliacao atributo aluno: ' || p_decisao,
      coalesce(p_decidido_por, 'usuario_app'),
      jsonb_build_object(
        'tipo_divergencia', v_div.tipo_divergencia,
        'emusys_student_id', v_div.emusys_student_id,
        'emusys_matricula_id', v_div.emusys_matricula_id,
        'fonte', v_div.fonte
      )
    );

  update public.alunos_emusys_atributos_divergencias
  set resolvido = v_resolver,
      decisao = p_decisao,
      decidido_por = coalesce(p_decidido_por, 'usuario_app'),
      decidido_em = v_agora,
      updated_at = v_agora
  where id = v_div.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_div.id,
    'aluno_id', v_div.aluno_id,
    'decisao', p_decisao,
    'resolvido', v_resolver,
    'valor_aplicado', v_valor_aplicado
  );
end;
$function$;

commit;
