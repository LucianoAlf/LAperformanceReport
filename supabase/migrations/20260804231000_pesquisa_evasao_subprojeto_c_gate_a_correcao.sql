-- Correcao do Gate A do Subprojeto C.
-- 1) `unidades.nome` e varchar(100), mas a RPC declara unidade_nome como text.
-- 2) TRUNCATE e TRIGGER ignoram a protecao esperada por RLS e nao podem ficar
--    disponiveis a clientes em nenhuma superficie da pesquisa de evasao.

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
    u.nome::text,
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

-- Fecha privilegios que ignoram RLS em toda a arvore de dados da pesquisa,
-- inclusive filhas criadas por fases anteriores. PUBLIC tambem e revogado para
-- impedir que uma permissao herdada reabra anon/authenticated.
do $$
declare
  v_tabela regclass;
begin
  for v_tabela in
    with recursive pesquisa_descendentes(oid) as (
      select 'public.pesquisa_evasao'::regclass::oid
      union
      select c.conrelid
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_namespace nchild on nchild.oid = child.relnamespace
      join pesquisa_descendentes pai on pai.oid = c.confrelid
      where c.contype = 'f' and nchild.nspname = 'public'
    )
    select oid::regclass from pesquisa_descendentes
    union all
    select to_regclass(format('public.%I', alvo.nome))
    from (values
      ('whatsapp_caixas'),
      ('lia_destinos_privados'),
      ('lia_alertas_privados'),
      ('lia_pesquisa_eventos'),
      ('webhook_debug_log'),
      ('pesquisa_evasao_classificacao_categorias')
    ) as alvo(nome)
    where to_regclass(format('public.%I', alvo.nome)) is not null
  loop
    continue when v_tabela is null;
    execute format(
      'revoke truncate, trigger on table %s from public, anon, authenticated',
      v_tabela
    );
  end loop;
end
$$;

-- Estes dois caminhos ainda tinham grants diretos residuais de cliente.
-- aluno_acoes e escrita exclusiva das RPCs governadas; webhook_debug_log e
-- escrito apenas pelo backend autorizado.
do $$
begin
  if to_regclass('public.aluno_acoes') is not null then
    revoke references, trigger, truncate on table public.aluno_acoes
      from public, anon, authenticated;
  end if;

  if to_regclass('public.webhook_debug_log') is not null then
    revoke insert, update, delete, references, trigger, truncate
      on table public.webhook_debug_log
      from public, anon, authenticated;
  end if;
end
$$;

comment on function public.listar_respostas_evasao_analytics_v1(uuid, integer, integer)
  is 'Subprojeto C: listagem analitica governada. unidade_nome e explicitamente text para compatibilidade com unidades.nome varchar.';
