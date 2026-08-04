-- Subprojeto C: contratos governados de classificacao e leitura analitica.

create or replace function public.fn_pesquisa_evasao_c_classificacao_vigente(
  p_pesquisa_id uuid,
  p_classificacao_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.pesquisa_evasao pe
    join public.pesquisa_evasao_classificacoes pc
      on pc.pesquisa_id = pe.id and pc.id = p_classificacao_id
    join lateral (
      select pea.versao, pea.status
      from public.pesquisa_evasao_analises pea
      where pea.pesquisa_id = pe.id
      order by pea.versao desc
      limit 1
    ) ultima_analise on true
    where pe.id = p_pesquisa_id
      and pe.modo_teste = false
      and pc.id = (
        select pc2.id
        from public.pesquisa_evasao_classificacoes pc2
        where pc2.pesquisa_id = pe.id
        order by pc2.versao desc
        limit 1
      )
      and pc.analise_versao_max = ultima_analise.versao
      and ultima_analise.status = 'revisada'
  )
$$;

create or replace function public.registrar_classificacao_pesquisa_evasao_v1(
  p_pesquisa_id uuid,
  p_analise_id uuid,
  p_categorias text[],
  p_relacao_motivo text,
  p_justificativa text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_pesquisa public.pesquisa_evasao%rowtype;
  v_analise public.pesquisa_evasao_analises%rowtype;
  v_anterior public.pesquisa_evasao_classificacoes%rowtype;
  v_categorias text[];
  v_id uuid;
  v_versao integer;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;

  select * into strict v_usuario
  from public.usuarios
  where auth_user_id = auth.uid() and ativo = true;

  select * into strict v_pesquisa
  from public.pesquisa_evasao
  where id = p_pesquisa_id
  for update;

  if v_pesquisa.modo_teste then
    raise exception 'PESQUISA_EVASAO_C_TESTE_PROIBIDO' using errcode = '22023';
  end if;

  select * into strict v_analise
  from public.pesquisa_evasao_analises
  where pesquisa_id = p_pesquisa_id
  order by versao desc
  limit 1;

  if v_analise.id is distinct from p_analise_id
     or v_analise.status <> 'revisada' then
    raise exception 'PESQUISA_EVASAO_C_CONVERSA_ATUALIZADA' using errcode = '40001';
  end if;

  select array_agg(distinct categoria order by categoria)
  into v_categorias
  from unnest(p_categorias) categoria;

  if coalesce(cardinality(v_categorias), 0) = 0 then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_OBRIGATORIA' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_categorias) c
    where c not in (
      'financeiro', 'tempo_horario', 'saude', 'desanimo',
      'pedagogico_professor', 'atendimento_experiencia', 'mudanca_endereco',
      'familia_estudos_trabalho', 'outro', 'inconclusivo', 'resposta_invalida'
    )
  ) then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_INVALIDA' using errcode = '22023';
  end if;

  if ('inconclusivo' = any(v_categorias)
      or 'resposta_invalida' = any(v_categorias))
     and cardinality(v_categorias) <> 1 then
    raise exception 'PESQUISA_EVASAO_C_CATEGORIA_EXCLUSIVA' using errcode = '22023';
  end if;

  if 'outro' = any(v_categorias)
     and nullif(btrim(p_justificativa), '') is null then
    raise exception 'PESQUISA_EVASAO_C_JUSTIFICATIVA_OBRIGATORIA' using errcode = '22023';
  end if;

  if char_length(coalesce(p_justificativa, '')) > 1000 then
    raise exception 'PESQUISA_EVASAO_C_JUSTIFICATIVA_LONGA' using errcode = '22023';
  end if;

  if p_relacao_motivo not in (
    'confirmou', 'confirmou_parcialmente', 'complementou', 'divergiu',
    'sem_motivo_anterior', 'inconclusivo', 'invalido'
  ) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INVALIDA' using errcode = '22023';
  end if;

  if p_relacao_motivo = 'sem_motivo_anterior'
     and nullif(btrim(v_pesquisa.motivo_cadastrado), '') is not null then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if p_relacao_motivo = 'inconclusivo'
     and not ('inconclusivo' = any(v_categorias)) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if p_relacao_motivo = 'invalido'
     and not ('resposta_invalida' = any(v_categorias)) then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if 'inconclusivo' = any(v_categorias)
     and p_relacao_motivo <> 'inconclusivo' then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;
  if 'resposta_invalida' = any(v_categorias)
     and p_relacao_motivo <> 'invalido' then
    raise exception 'PESQUISA_EVASAO_C_RELACAO_INCOERENTE' using errcode = '22023';
  end if;

  select * into v_anterior
  from public.pesquisa_evasao_classificacoes
  where pesquisa_id = p_pesquisa_id
  order by versao desc
  limit 1;

  v_versao := coalesce(v_anterior.versao, 0) + 1;

  insert into public.pesquisa_evasao_classificacoes (
    pesquisa_id,
    versao,
    analise_id,
    analise_versao_max,
    relacao_motivo,
    justificativa,
    sucede_classificacao_id,
    revisor_usuario_id,
    revisor_auth_user_id
  ) values (
    p_pesquisa_id,
    v_versao,
    v_analise.id,
    v_analise.versao,
    p_relacao_motivo,
    coalesce(p_justificativa, ''),
    v_anterior.id,
    v_usuario.id,
    auth.uid()
  ) returning id into v_id;

  insert into public.pesquisa_evasao_classificacao_categorias (
    classificacao_id,
    categoria
  )
  select v_id, categoria
  from unnest(v_categorias) categoria;

  return jsonb_build_object(
    'classificacao_id', v_id,
    'pesquisa_id', p_pesquisa_id,
    'versao', v_versao,
    'analise_versao_max', v_analise.versao
  );
exception
  when no_data_found then
    raise exception 'PESQUISA_EVASAO_C_NAO_ENCONTRADA' using errcode = 'P0002';
end
$$;

create or replace function public.obter_dados_classificacao_pesquisa_evasao_v1(
  p_pesquisa_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'pesquisa_id', pe.id,
    'motivo_cadastrado', pe.motivo_cadastrado,
    'modo_teste', pe.modo_teste,
    'analise_atual', case when ua.id is null then null else jsonb_build_object(
      'id', ua.id,
      'versao', ua.versao,
      'status', ua.status,
      'texto_consolidado', ua.texto_consolidado,
      'revisado_em', ua.revisado_em
    ) end,
    'classificacao_atual', case when uc.id is null then null else jsonb_build_object(
      'id', uc.id,
      'versao', uc.versao,
      'analise_versao_max', uc.analise_versao_max,
      'relacao_motivo', uc.relacao_motivo,
      'justificativa', uc.justificativa,
      'categorias', coalesce(categorias.itens, '[]'::jsonb),
      'revisor_usuario_id', uc.revisor_usuario_id,
      'revisor_nome', ru.nome,
      'revisado_em', uc.revisado_em
    ) end,
    'classificacao_desatualizada',
      uc.id is not null
      and not public.fn_pesquisa_evasao_c_classificacao_vigente(pe.id, uc.id),
    'historico_classificacoes', coalesce(historico.itens, '[]'::jsonb),
    'acoes', coalesce(acoes.itens, '[]'::jsonb),
    'desfecho_atual', desfecho.item
  ) into v_resultado
  from public.pesquisa_evasao pe
  left join lateral (
    select pea.*
    from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id
    order by pea.versao desc
    limit 1
  ) ua on true
  left join lateral (
    select pc.*
    from public.pesquisa_evasao_classificacoes pc
    where pc.pesquisa_id = pe.id
    order by pc.versao desc
    limit 1
  ) uc on true
  left join public.usuarios ru on ru.id = uc.revisor_usuario_id
  left join lateral (
    select jsonb_agg(pcc.categoria order by pcc.categoria) itens
    from public.pesquisa_evasao_classificacao_categorias pcc
    where pcc.classificacao_id = uc.id
  ) categorias on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', pc.id,
        'versao', pc.versao,
        'analise_versao_max', pc.analise_versao_max,
        'relacao_motivo', pc.relacao_motivo,
        'justificativa', pc.justificativa,
        'categorias', coalesce((
          select jsonb_agg(pcc.categoria order by pcc.categoria)
          from public.pesquisa_evasao_classificacao_categorias pcc
          where pcc.classificacao_id = pc.id
        ), '[]'::jsonb),
        'revisor_usuario_id', pc.revisor_usuario_id,
        'revisor_nome', hru.nome,
        'revisado_em', pc.revisado_em
      ) order by pc.versao desc
    ) itens
    from public.pesquisa_evasao_classificacoes pc
    join public.usuarios hru on hru.id = pc.revisor_usuario_id
    where pc.pesquisa_id = pe.id
  ) historico on true
  left join lateral (
    select jsonb_agg(to_jsonb(aa) order by aa.created_at desc) itens
    from public.aluno_acoes aa
    where aa.pesquisa_evasao_id = pe.id
  ) acoes on true
  left join lateral (
    select to_jsonb(pd) item
    from public.pesquisa_evasao_desfechos pd
    where pd.pesquisa_id = pe.id
    order by pd.registrado_em desc
    limit 1
  ) desfecho on true
  where pe.id = p_pesquisa_id;

  if v_resultado is null then
    raise exception 'PESQUISA_EVASAO_C_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;
  return v_resultado;
end
$$;

create or replace function public.listar_respostas_evasao_analytics_v1(
  p_unidade_id uuid default null,
  p_ano integer default null,
  p_mes integer default null
)
returns table (
  pesquisa_id uuid,
  aluno_id integer,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  unidade_id uuid,
  unidade_nome text,
  data_evasao date,
  tempo_permanencia_meses integer,
  motivo_cadastrado text,
  motivo_categoria text,
  motivo_conta_score boolean,
  resposta_texto text,
  resposta_tipo text,
  tem_audio boolean,
  transcrita boolean,
  respondido_em timestamptz,
  enviado_em timestamptz,
  analise_id uuid,
  analise_versao integer,
  analise_status text,
  classificacao_id uuid,
  classificacao_versao integer,
  categorias text[],
  relacao_motivo text,
  justificativa text,
  classificacao_desatualizada boolean,
  total_acoes integer,
  acoes_pendentes integer,
  desfecho_atual text,
  estado_operacional text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'PESQUISA_EVASAO_C_ACESSO_NEGADO' using errcode = '42501';
  end if;

  return query
  select
    pe.id,
    pe.aluno_id,
    pe.aluno_nome,
    pe.aluno_curso,
    pe.aluno_professor,
    pe.unidade_id,
    u.nome,
    pe.data_evasao,
    pe.tempo_permanencia_meses,
    pe.motivo_cadastrado,
    ms.categoria,
    coalesce(ms.conta_score_professor, false),
    coalesce(nullif(btrim(ultima_analise.texto_consolidado), ''), pe.resposta_texto),
    pe.resposta_tipo,
    coalesce(midia.tem_audio, false),
    coalesce(midia.transcrita, false),
    pe.respondido_em,
    pe.enviado_em,
    ultima_analise.id,
    ultima_analise.versao,
    ultima_analise.status,
    ultima_classificacao.id,
    ultima_classificacao.versao,
    coalesce(categorias.itens, array[]::text[]),
    ultima_classificacao.relacao_motivo,
    ultima_classificacao.justificativa,
    ultima_classificacao.id is not null
      and not public.fn_pesquisa_evasao_c_classificacao_vigente(
        pe.id,
        ultima_classificacao.id
      ),
    coalesce(acoes.total, 0)::integer,
    coalesce(acoes.pendentes, 0)::integer,
    ultimo_desfecho.desfecho,
    case
      when ultima_analise.id is null or ultima_analise.status <> 'revisada'
        then 'aguardando_revisao_textual'
      when ultima_classificacao.id is null
        or not public.fn_pesquisa_evasao_c_classificacao_vigente(
          pe.id,
          ultima_classificacao.id
        )
        then 'aguardando_classificacao'
      when coalesce(acoes.pendentes, 0) > 0
        then 'acao_pendente'
      when ultimo_desfecho.id is null
        then 'em_acompanhamento'
      else 'encerrado'
    end
  from public.pesquisa_evasao pe
  left join public.unidades u on u.id = pe.unidade_id
  left join public.motivos_saida ms
    on ms.nome_normalizado = upper(btrim(pe.motivo_cadastrado))
  left join lateral (
    select pea.*
    from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id
    order by pea.versao desc
    limit 1
  ) ultima_analise on true
  left join lateral (
    select pc.*
    from public.pesquisa_evasao_classificacoes pc
    where pc.pesquisa_id = pe.id
    order by pc.versao desc
    limit 1
  ) ultima_classificacao on true
  left join lateral (
    select array_agg(pcc.categoria order by pcc.categoria) itens
    from public.pesquisa_evasao_classificacao_categorias pcc
    where pcc.classificacao_id = ultima_classificacao.id
  ) categorias on true
  left join lateral (
    select
      count(*)::integer total,
      count(*) filter (where aa.estado = 'pendente')::integer pendentes
    from public.aluno_acoes aa
    where aa.pesquisa_evasao_id = pe.id
  ) acoes on true
  left join lateral (
    select pd.*
    from public.pesquisa_evasao_desfechos pd
    where pd.pesquisa_id = pe.id
    order by pd.registrado_em desc
    limit 1
  ) ultimo_desfecho on true
  left join lateral (
    select
      bool_or(msg.audio_storage_path is not null) as tem_audio,
      bool_or(transcricao.status = 'concluida') as transcrita
    from public.pesquisa_evasao_mensagens msg
    left join public.pesquisa_evasao_transcricoes transcricao
      on transcricao.mensagem_id = msg.id
    where msg.pesquisa_id = pe.id and msg.direcao = 'entrada'
  ) midia on true
  where pe.modo_teste = false
    and pe.resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
    and (p_unidade_id is null or pe.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from pe.data_evasao)::integer = p_ano)
    and (p_mes is null or extract(month from pe.data_evasao)::integer = p_mes)
  order by pe.respondido_em desc nulls last;
end
$$;

comment on function public.registrar_classificacao_pesquisa_evasao_v1(uuid, uuid, text[], text, text) is
  'Registra nova versao multirrotulo sobre a analise textual revisada mais recente. Nao escreve nas colunas legadas.';
comment on function public.obter_dados_classificacao_pesquisa_evasao_v1(uuid) is
  'Envelope governado da classificacao, historico, acoes e desfecho de uma pesquisa.';
comment on function public.listar_respostas_evasao_analytics_v1(uuid, integer, integer) is
  'Read model produtivo do Subprojeto C; exclui modo teste e nao usa categoria_resposta ou sentimento legados.';

revoke all on function public.fn_pesquisa_evasao_c_classificacao_vigente(uuid, uuid)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
  fabio_agent, lia_acesso_restrito;
revoke all on function public.registrar_classificacao_pesquisa_evasao_v1(uuid, uuid, text[], text, text)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
  fabio_agent, lia_acesso_restrito;
revoke all on function public.obter_dados_classificacao_pesquisa_evasao_v1(uuid)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
  fabio_agent, lia_acesso_restrito;
revoke all on function public.listar_respostas_evasao_analytics_v1(uuid, integer, integer)
  from public, anon, authenticated, mila_acesso_restrito, sol_acesso_restrito,
  fabio_agent, lia_acesso_restrito;

grant execute on function public.fn_pesquisa_evasao_c_classificacao_vigente(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.registrar_classificacao_pesquisa_evasao_v1(uuid, uuid, text[], text, text)
  to authenticated, service_role;
grant execute on function public.obter_dados_classificacao_pesquisa_evasao_v1(uuid)
  to authenticated, service_role;
grant execute on function public.listar_respostas_evasao_analytics_v1(uuid, integer, integer)
  to authenticated, service_role;
