-- Professor novo no Emusys passa a chegar sozinho no LA Report.
--
-- Antes: o sync semanal so ABRIA divergencia `so_no_emusys` e nunca gravava o id do Emusys
-- em lugar nenhum. Professor novo dava aula por semanas sem aparecer no report (Gabriel Leao,
-- Recreio, desde 01/09/2026), e quem cadastrava a mao (Rodrigo, Barra, 26/09) ficava com o
-- vinculo sem id -- tudo o que vem do Emusys acha o professor por (unidade_id, emusys_id).
--
-- Agora a decisao mora aqui, numa fonte unica (`fn_decidir_vinculo_professor_emusys_v1`):
--   * nome identico a UM professor ativo            -> vincula (na unidade ou vindo de outra)
--   * nenhum professor com nome identico nem parecido -> cria o professor e o vinculo
--   * homonimo, nome parecido, inativo, ja com outro id, vinculo ignorado por humano
--                                                     -> NAO escreve; vira fila para humano
-- O "parecido" existe por um caso real: "Jonathan de Lima Santos (JOHN)" ja era professor;
-- criar por "nome nao encontrado" o teria duplicado. Errar para a fila e barato; duplicar
-- professor suja carteira, score e historico.

-- ---------------------------------------------------------------------------------------
-- 1. Chave de nome: minusculo, sem acento, sem apelido entre parenteses, so letras.
-- ---------------------------------------------------------------------------------------
create or replace function public.fn_professor_nome_chave(p_nome text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        lower(public.unaccent(regexp_replace(coalesce(p_nome, ''), '\([^)]*\)', ' ', 'g'))),
        '[^a-z ]', ' ', 'g'),
      '\s+', ' ', 'g')),
    '');
$$;

comment on function public.fn_professor_nome_chave(text) is
  'Chave de comparacao de nome de professor (minusculo, sem acento, sem "(apelido)", so letras). Usada so para DECIDIR vinculo com o Emusys -- nunca como identidade.';

-- Tokens significativos (sem particulas), para "mesmo primeiro e ultimo nome".
create or replace function public.fn_professor_nome_tokens(p_chave text)
returns text[]
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(t order by ord), '{}')
  from unnest(string_to_array(coalesce(p_chave, ''), ' ')) with ordinality as x(t, ord)
  where t <> '' and t not in ('de', 'da', 'do', 'das', 'dos', 'e');
$$;

-- ---------------------------------------------------------------------------------------
-- 2. Candidatos por nome (fonte unica do sync, da fila e do formulario de cadastro).
--    Compara com o nome do cadastro E com o nome que o Emusys usa nas outras unidades.
-- ---------------------------------------------------------------------------------------
create or replace function public.fn_professores_candidatos_por_nome_v1(p_nome text)
returns table (
  professor_id integer,
  nome text,
  ativo boolean,
  tipo text,
  similaridade numeric,
  unidades text[]
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with alvo as (
    select public.fn_professor_nome_chave(p_nome) as chave,
           public.fn_professor_nome_tokens(public.fn_professor_nome_chave(p_nome)) as tokens
  ),
  nomes as (
    select p.id, p.nome, p.ativo, public.fn_professor_nome_chave(p.nome) as chave
    from public.professores p
    where p.mesclado_em_professor_id is null
    union
    select p.id, p.nome, p.ativo, public.fn_professor_nome_chave(pu.emusys_nome)
    from public.professores_unidades pu
    join public.professores p on p.id = pu.professor_id
    where p.mesclado_em_professor_id is null
      and pu.emusys_nome is not null
  ),
  avaliados as (
    select n.id, n.nome, n.ativo, n.chave,
           public.fn_professor_nome_tokens(n.chave) as tokens,
           similarity(n.chave, a.chave)::numeric as sim,
           a.chave as alvo_chave,
           a.tokens as alvo_tokens
    from nomes n
    cross join alvo a
    where a.chave is not null and n.chave is not null
  ),
  classificados as (
    select id, nome, ativo, sim,
      case
        when chave = alvo_chave then 'exato'
        when cardinality(tokens) >= 2 and cardinality(alvo_tokens) >= 2
             and tokens[1] = alvo_tokens[1]
             and tokens[cardinality(tokens)] = alvo_tokens[cardinality(alvo_tokens)]
          then 'parecido'
        when cardinality(tokens) >= 2 and cardinality(alvo_tokens) >= 2
             and (tokens <@ alvo_tokens or alvo_tokens <@ tokens)
          then 'parecido'
        -- Backtest contra os 77 vinculos reais (26/09/2026): sem estas duas regras o sync
        -- CRIARIA duplicata para "Lucas Souza dos Santos" (cadastro: "Lucas Amorim Souza")
        -- e "Leo Cabral de Castro" (cadastro: "Leonardo Castro").
        when cardinality(tokens) >= 2 and cardinality(alvo_tokens) >= 2
             and tokens[1] = alvo_tokens[1]
             and tokens[2:cardinality(tokens)] && alvo_tokens[2:cardinality(alvo_tokens)]
          then 'parecido'
        when cardinality(tokens) >= 2 and cardinality(alvo_tokens) >= 2
             and tokens[cardinality(tokens)] = alvo_tokens[cardinality(alvo_tokens)]
             and least(length(tokens[1]), length(alvo_tokens[1])) >= 3
             and (tokens[1] like alvo_tokens[1] || '%' or alvo_tokens[1] like tokens[1] || '%')
          then 'parecido'
        when sim >= 0.55 then 'parecido'
        when length(alvo_chave) >= 4 and position(alvo_chave in chave) > 0 then 'contem'
        else null
      end as tipo
    from avaliados
  ),
  melhor as (
    select distinct on (id) id, nome, ativo, tipo, sim
    from classificados
    where tipo is not null
    order by id, case tipo when 'exato' then 1 when 'parecido' then 2 else 3 end, sim desc
  )
  select m.id, m.nome, m.ativo, m.tipo, round(m.sim, 2),
         coalesce((
           select array_agg(distinct u.codigo order by u.codigo)
           from public.professores_unidades pu
           join public.unidades u on u.id = pu.unidade_id
           where pu.professor_id = m.id
         ), '{}')
  from melhor m
  order by case m.tipo when 'exato' then 1 when 'parecido' then 2 else 3 end, m.sim desc, m.nome
  limit 15;
$$;

-- ---------------------------------------------------------------------------------------
-- 3. Decisao (pura, nao escreve). Uma fonte unica para sync e simulacao.
-- ---------------------------------------------------------------------------------------
create or replace function public.fn_decidir_vinculo_professor_emusys_v1(
  p_unidade_id uuid,
  p_emusys_id integer,
  p_nome text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_chave text := public.fn_professor_nome_chave(p_nome);
  v_candidatos jsonb;
  v_exatos_ativos integer[];
  v_exatos_inativos integer;
  v_parecidos integer;
  v_prof integer;
  v_pu record;
  v_base jsonb;
begin
  if p_unidade_id is null or p_emusys_id is null or p_emusys_id <= 0 then
    return jsonb_build_object('acao', 'revisar', 'motivo', 'entrada_invalida');
  end if;

  select pu.id, pu.professor_id into v_pu
  from public.professores_unidades pu
  where pu.unidade_id = p_unidade_id and pu.emusys_id = p_emusys_id;
  if found then
    return jsonb_build_object('acao', 'ja_vinculado', 'professor_id', v_pu.professor_id, 'vinculo_id', v_pu.id);
  end if;

  if v_chave is null then
    return jsonb_build_object('acao', 'revisar', 'motivo', 'nome_vazio');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'professor_id', c.professor_id, 'nome', c.nome, 'ativo', c.ativo,
           'tipo', c.tipo, 'similaridade', c.similaridade, 'unidades', c.unidades)), '[]'::jsonb),
         array_agg(c.professor_id) filter (where c.tipo = 'exato' and c.ativo),
         count(*) filter (where c.tipo = 'exato' and not c.ativo),
         count(*) filter (where c.tipo in ('parecido', 'contem'))
    into v_candidatos, v_exatos_ativos, v_exatos_inativos, v_parecidos
  from public.fn_professores_candidatos_por_nome_v1(p_nome) c;

  v_base := jsonb_build_object('candidatos', v_candidatos);

  if cardinality(coalesce(v_exatos_ativos, '{}')) > 1 then
    return v_base || jsonb_build_object('acao', 'revisar', 'motivo', 'homonimos');
  end if;

  if cardinality(coalesce(v_exatos_ativos, '{}')) = 1 then
    v_prof := v_exatos_ativos[1];

    select pu.id, pu.emusys_id, pu.validacao_status into v_pu
    from public.professores_unidades pu
    where pu.unidade_id = p_unidade_id and pu.professor_id = v_prof;

    if not found then
      return v_base || jsonb_build_object('acao', 'vincular_de_outra_unidade', 'professor_id', v_prof);
    end if;
    if v_pu.emusys_id is not null then
      -- Mesma pessoa com dois ids do Emusys na mesma unidade: so humano sabe qual vale.
      return v_base || jsonb_build_object('acao', 'revisar', 'motivo', 'professor_ja_tem_outro_id_na_unidade',
                                          'professor_id', v_prof, 'vinculo_id', v_pu.id);
    end if;
    if v_pu.validacao_status = 'ignorado' then
      return v_base || jsonb_build_object('acao', 'revisar', 'motivo', 'vinculo_ignorado_por_humano',
                                          'professor_id', v_prof, 'vinculo_id', v_pu.id);
    end if;
    return v_base || jsonb_build_object('acao', 'vincular_existente_na_unidade',
                                        'professor_id', v_prof, 'vinculo_id', v_pu.id);
  end if;

  if v_exatos_inativos > 0 then
    return v_base || jsonb_build_object('acao', 'revisar', 'motivo', 'mesmo_nome_professor_inativo');
  end if;

  if v_parecidos > 0 then
    return v_base || jsonb_build_object('acao', 'revisar', 'motivo', 'nome_parecido');
  end if;

  return v_base || jsonb_build_object('acao', 'criar');
end;
$$;

comment on function public.fn_decidir_vinculo_professor_emusys_v1(uuid, integer, text) is
  'Decide o que fazer com um professor do Emusys sem vinculo: vincular, criar ou mandar para revisao humana. Nao escreve. Fonte unica usada por aplicar_vinculo_professor_emusys_v1.';

-- ---------------------------------------------------------------------------------------
-- 4. Efetivar um vinculo (interna): grava o id, corrige aulas orfas, fecha a divergencia.
-- ---------------------------------------------------------------------------------------
create or replace function public.fn_efetivar_vinculo_professor_emusys_v1(
  p_unidade_id uuid,
  p_emusys_id integer,
  p_nome_emusys text,
  p_professor_id integer,
  p_status text,
  p_origem text,
  p_autor text,
  p_decisao text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_vinculo_id integer;
  v_aulas integer := 0;
  v_divergencias integer := 0;
begin
  update public.professores_unidades pu
     set emusys_id = p_emusys_id,
         emusys_nome = p_nome_emusys,
         emusys_nome_normalizado = lower(public.unaccent(btrim(regexp_replace(coalesce(p_nome_emusys, ''), '\s+', ' ', 'g')))),
         emusys_ativo = true,
         identidade_historica_valida = false,
         validacao_status = p_status,
         validado_em = now(),
         validado_por = p_autor,
         payload_emusys = coalesce(p_payload, '{}'::jsonb),
         last_seen_em = now()
   where pu.unidade_id = p_unidade_id
     and pu.professor_id = p_professor_id
  returning pu.id into v_vinculo_id;

  if v_vinculo_id is null then
    insert into public.professores_unidades (
      professor_id, unidade_id, emusys_id, emusys_nome, emusys_nome_normalizado,
      emusys_ativo, identidade_historica_valida, validacao_status, validado_em,
      validado_por, origem, payload_emusys, last_seen_em
    ) values (
      p_professor_id, p_unidade_id, p_emusys_id, p_nome_emusys,
      lower(public.unaccent(btrim(regexp_replace(coalesce(p_nome_emusys, ''), '\s+', ' ', 'g')))),
      true, false, p_status, now(), p_autor, p_origem, coalesce(p_payload, '{}'::jsonb), now()
    )
    returning id into v_vinculo_id;
  end if;

  -- Aulas que ja chegaram sem professor. A flag avisa o gatilho de eventos que isto e
  -- vinculo resolvido, nao "professor trocado" -- senao o professor novo receberia um
  -- aviso de troca por aula que sempre foi dele.
  perform set_config('app.vinculo_professor_resolvido', 'on', true);
  update public.aulas_emusys ae
     set professor_id = p_professor_id
   where ae.unidade_id = p_unidade_id
     and ae.emusys_professor_id = p_emusys_id
     and ae.professor_id is null;
  get diagnostics v_aulas = row_count;
  perform set_config('app.vinculo_professor_resolvido', 'off', true);

  update public.professores_emusys_divergencias d
     set resolvido = true,
         decisao = p_decisao,
         decidido_por = p_autor,
         decidido_em = now(),
         professor_id = p_professor_id,
         professores_unidade_id = v_vinculo_id,
         updated_at = now()
   where d.unidade_id = p_unidade_id
     and d.emusys_professor_id = p_emusys_id
     and d.tipo_divergencia = 'so_no_emusys'
     and not d.resolvido;
  get diagnostics v_divergencias = row_count;

  insert into public.professores_sync_log (evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes)
  values (p_decisao, p_unidade_id, p_professor_id, p_emusys_id, p_nome_emusys,
          jsonb_build_object('vinculo_id', v_vinculo_id, 'status', p_status, 'autor', p_autor,
                             'aulas_corrigidas', v_aulas, 'divergencias_resolvidas', v_divergencias));

  return jsonb_build_object('professor_id', p_professor_id, 'vinculo_id', v_vinculo_id,
                            'aulas_corrigidas', v_aulas, 'divergencias_resolvidas', v_divergencias);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 5. Porta do sync (service_role): decide e, quando seguro, aplica.
-- ---------------------------------------------------------------------------------------
create or replace function public.aplicar_vinculo_professor_emusys_v1(
  p_unidade_id uuid,
  p_emusys_id integer,
  p_nome text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_decisao jsonb := public.fn_decidir_vinculo_professor_emusys_v1(p_unidade_id, p_emusys_id, p_nome);
  v_acao text := v_decisao ->> 'acao';
  v_prof integer;
  v_unidade text;
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  if v_acao not in ('vincular_existente_na_unidade', 'vincular_de_outra_unidade', 'criar') then
    return v_decisao;
  end if;

  begin
    if v_acao = 'criar' then
      select u.codigo into v_unidade from public.unidades u where u.id = p_unidade_id;
      insert into public.professores (nome, ativo, observacoes)
      values (
        v_nome,
        true,
        format('Criado automaticamente pelo sync do Emusys em %s (%s, id Emusys %s). Completar: WhatsApp, cursos, comissao, acesso ao LA Teacher.',
               to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), coalesce(v_unidade, '?'), p_emusys_id)
      )
      returning id into v_prof;
    else
      v_prof := (v_decisao ->> 'professor_id')::integer;
    end if;

    return v_decisao || public.fn_efetivar_vinculo_professor_emusys_v1(
      p_unidade_id, p_emusys_id, v_nome, v_prof,
      'auto_match',
      case when v_acao = 'criar' then 'emusys_auto_criado' else 'emusys_auto_vinculo' end,
      'sync_professores_emusys',
      case when v_acao = 'criar' then 'professor_criado_automatico' else 'vinculo_automatico' end,
      p_payload
    );
  exception when unique_violation then
    -- Outra execucao gravou o mesmo id no meio do caminho: nada foi escrito aqui.
    return jsonb_build_object('acao', 'revisar', 'motivo', 'corrida_id_ja_usado', 'candidatos', v_decisao -> 'candidatos');
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 6. Porta humana (fila de divergencias e formulario): vincula de verdade.
--    `decidir_professor_divergencia_emusys` so fechava a pendencia e nunca gravava o id.
-- ---------------------------------------------------------------------------------------
create or replace function public.vincular_professor_emusys_manual_v1(
  p_divergencia_id bigint,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_div public.professores_emusys_divergencias%rowtype;
  v_autor text;
  v_prof record;
  v_outro_id integer;
  v_prof_id integer := p_professor_id;
  v_nome text;
begin
  select * into v_div from public.professores_emusys_divergencias where id = p_divergencia_id;
  if not found then
    raise exception 'DIVERGENCIA_NAO_ENCONTRADA: id %', p_divergencia_id using errcode = 'P0002';
  end if;

  if not (select public.fn_pode_operar_fila_divergencias_professor()) then
    raise exception 'DIVERGENCIA_PERFIL_SEM_PERMISSAO: fila e de gestao (admin ou unidade)' using errcode = '42501';
  end if;
  if not ((select public.is_admin()) or v_div.unidade_id in (select public.get_user_unidade_ids())) then
    raise exception 'DIVERGENCIA_FORA_DO_ESCOPO: sem acesso a unidade desta divergencia' using errcode = '42501';
  end if;
  if v_div.resolvido then
    raise exception 'DIVERGENCIA_JA_RESOLVIDA: id %', p_divergencia_id using errcode = '23505';
  end if;
  if v_div.tipo_divergencia <> 'so_no_emusys' or v_div.emusys_professor_id is null then
    raise exception 'DIVERGENCIA_NAO_E_VINCULAVEL: so "existe so no Emusys" tem id para vincular' using errcode = '22023';
  end if;
  if exists (select 1 from public.professores_unidades
             where unidade_id = v_div.unidade_id and emusys_id = v_div.emusys_professor_id) then
    raise exception 'ID_EMUSYS_JA_VINCULADO: o id % ja pertence a um professor nesta unidade', v_div.emusys_professor_id
      using errcode = '23505';
  end if;

  v_autor := coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''),
    'usuario:' || coalesce(auth.uid()::text, 'desconhecido')
  );
  v_nome := btrim(regexp_replace(coalesce(v_div.nome_emusys, ''), '\s+', ' ', 'g'));

  if v_prof_id is null then
    if v_nome = '' then
      raise exception 'DIVERGENCIA_SEM_NOME: o Emusys nao informou nome para criar o professor' using errcode = '22023';
    end if;
    insert into public.professores (nome, ativo, observacoes)
    values (v_nome, true, format('Criado pela fila de divergencias por %s em %s.', v_autor,
                                 to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')))
    returning id into v_prof_id;
  else
    select id, ativo, mesclado_em_professor_id into v_prof from public.professores where id = v_prof_id;
    if not found or v_prof.mesclado_em_professor_id is not null then
      raise exception 'PROFESSOR_INVALIDO: professor % nao existe ou foi mesclado', v_prof_id using errcode = '22023';
    end if;
    if not v_prof.ativo then
      raise exception 'PROFESSOR_INATIVO: reative o cadastro antes de vincular' using errcode = '22023';
    end if;
    select emusys_id into v_outro_id from public.professores_unidades
    where unidade_id = v_div.unidade_id and professor_id = v_prof_id;
    if v_outro_id is not null then
      raise exception 'PROFESSOR_JA_TEM_OUTRO_ID_NA_UNIDADE: professor % ja usa o id % nesta unidade', v_prof_id, v_outro_id
        using errcode = '23505';
    end if;
  end if;

  return public.fn_efetivar_vinculo_professor_emusys_v1(
    v_div.unidade_id, v_div.emusys_professor_id, v_nome, v_prof_id,
    'validado_humano', 'validacao_humana_fila', v_autor,
    case when p_professor_id is null then 'professor_criado_manual' else 'vinculado_manual' end,
    coalesce(v_div.valor_emusys, '{}'::jsonb)
  );
end;
$$;

-- Busca para a tela (formulario de cadastro e fila): mesmos candidatos que o sync usa.
create or replace function public.buscar_professores_parecidos_v1(p_nome text)
returns table (
  professor_id integer,
  nome text,
  ativo boolean,
  tipo text,
  similaridade numeric,
  unidades text[]
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.*
  from public.fn_professores_candidatos_por_nome_v1(p_nome) c
  where (select public.fn_pode_operar_fila_divergencias_professor());
$$;

-- ---------------------------------------------------------------------------------------
-- 7. Gatilho de eventos: vinculo resolvido nao e "professor trocado".
-- ---------------------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.trg_eventos_operacionais_professor_aula()'::regprocedure);
  v_ancora text := E'begin\n  if not public.fn_eventos_operacionais_na_janela_aula(';
  v_novo text;
begin
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'ANCORA_GATILHO_PROFESSOR_AULA: esperava 1 ocorrencia';
  end if;
  v_novo := replace(v_def, v_ancora,
    E'begin\n  -- Vinculo de professor novo resolvido (null -> id): nao e troca de professor.\n'
    || E'  if old.professor_id is null\n'
    || E'     and coalesce(current_setting(''app.vinculo_professor_resolvido'', true), '''') = ''on'' then\n'
    || E'    return new;\n  end if;\n\n'
    || E'  if not public.fn_eventos_operacionais_na_janela_aula(');
  execute v_novo;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 8. Permissoes (ALTER DEFAULT PRIVILEGES concede EXECUTE a anon: revogar nominalmente).
-- ---------------------------------------------------------------------------------------
revoke all on function public.fn_professor_nome_chave(text) from public, anon;
revoke all on function public.fn_professor_nome_tokens(text) from public, anon;
revoke all on function public.fn_professores_candidatos_por_nome_v1(text) from public, anon, authenticated;
revoke all on function public.fn_decidir_vinculo_professor_emusys_v1(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.fn_efetivar_vinculo_professor_emusys_v1(uuid, integer, text, integer, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.aplicar_vinculo_professor_emusys_v1(uuid, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.vincular_professor_emusys_manual_v1(bigint, integer) from public, anon;
revoke all on function public.buscar_professores_parecidos_v1(text) from public, anon;

grant execute on function public.fn_professor_nome_chave(text) to authenticated, service_role;
grant execute on function public.fn_professor_nome_tokens(text) to authenticated, service_role;
grant execute on function public.fn_professores_candidatos_por_nome_v1(text) to service_role;
grant execute on function public.fn_decidir_vinculo_professor_emusys_v1(uuid, integer, text) to service_role;
grant execute on function public.fn_efetivar_vinculo_professor_emusys_v1(uuid, integer, text, integer, text, text, text, text, jsonb) to service_role;
grant execute on function public.aplicar_vinculo_professor_emusys_v1(uuid, integer, text, jsonb) to service_role;
grant execute on function public.vincular_professor_emusys_manual_v1(bigint, integer) to authenticated, service_role;
grant execute on function public.buscar_professores_parecidos_v1(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- 9. Sync diario (era semanal): 3 chamadas a API, 07:42 BRT, fora da janela dos outros syncs.
-- ---------------------------------------------------------------------------------------
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-professores-emusys-semanal'),
  schedule => '42 10 * * *'
);
