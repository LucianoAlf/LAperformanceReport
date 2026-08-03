-- Analise das respostas da pesquisa de evasao.
--
-- Contexto: a pesquisa de evasao NAO tem nota (a resposta e texto livre ou
-- audio), entao a analise dela nao pode copiar a da pos-1a aula. O que ela
-- responde e outra coisa: o motivo que a ESCOLA registrou bate com o motivo que
-- a PESSOA declarou? Isso importa porque 3 dos 16 motivos_saida penalizam o
-- professor no score.
--
-- Nada aqui escreve fora de pesquisa_evasao.categoria_resposta.

create or replace function public.get_respostas_evasao(
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
  categoria_resposta text,
  resposta_texto text,
  resposta_tipo text,
  tem_audio boolean,
  transcrita boolean,
  revisada boolean,
  respondido_em timestamptz,
  enviado_em timestamptz
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select
    pe.id                                     as pesquisa_id,
    pe.aluno_id,
    pe.aluno_nome,
    pe.aluno_curso,
    pe.aluno_professor,
    pe.unidade_id,
    u.nome                                    as unidade_nome,
    pe.data_evasao,
    pe.tempo_permanencia_meses,
    pe.motivo_cadastrado,
    ms.categoria                              as motivo_categoria,
    coalesce(ms.conta_score_professor, false) as motivo_conta_score,
    pe.categoria_resposta,
    -- O texto oficial e o consolidado da revisao. Como a fila de revisao nunca
    -- foi concluida (0 'revisada' em 03/08/2026), sem o fallback a tela
    -- nasceria vazia e continuaria vazia.
    coalesce(nullif(btrim(a.texto_consolidado), ''), pe.resposta_texto) as resposta_texto,
    pe.resposta_tipo,
    coalesce(m.tem_audio, false)              as tem_audio,
    coalesce(m.transcrita, false)             as transcrita,
    coalesce(a.status = 'revisada', false)    as revisada,
    pe.respondido_em,
    pe.enviado_em
  from public.pesquisa_evasao pe
  left join public.unidades u on u.id = pe.unidade_id
  -- Casa pelo NOME porque pesquisa_evasao guarda o motivo como snapshot de
  -- texto, nao como FK. `nome_normalizado` ja e o nome em caixa alta.
  left join public.motivos_saida ms
    on ms.nome_normalizado = upper(btrim(pe.motivo_cadastrado))
  -- Analise mais recente da pesquisa (as rodadas sao versionadas).
  left join lateral (
    select pea.texto_consolidado, pea.status
    from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id
    order by pea.versao desc
    limit 1
  ) a on true
  left join lateral (
    select
      bool_or(msg.audio_storage_path is not null) as tem_audio,
      bool_or(t.status = 'concluida')             as transcrita
    from public.pesquisa_evasao_mensagens msg
    left join public.pesquisa_evasao_transcricoes t on t.mensagem_id = msg.id
    where msg.pesquisa_id = pe.id and msg.direcao = 'entrada'
  ) m on true
  where
    -- Modo teste nunca entra na analise: 9 das 13 linhas de hoje sao piloto e
    -- inflariam qualquer percentual.
    pe.modo_teste = false
    and pe.status = 'respondido'
    and coalesce(btrim(coalesce(nullif(btrim(a.texto_consolidado), ''), pe.resposta_texto)), '') <> ''
    and (p_unidade_id is null or pe.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from pe.data_evasao) = p_ano)
    and (p_mes is null or extract(month from pe.data_evasao) = p_mes)
  order by pe.respondido_em desc nulls last;
$$;

comment on function public.get_respostas_evasao(uuid, integer, integer) is
  'Respostas de producao da pesquisa de evasao, com o motivo registrado ao lado do tema declarado. Exclui modo_teste. SECURITY INVOKER: depende da policy pesquisa_evasao_leitura_interna.';

-- SECURITY DEFINER porque a policy de pesquisa_evasao so concede SELECT; o
-- UPDATE passa por aqui, com a mesma checagem de usuario interno ativo.
create or replace function public.classificar_resposta_evasao(
  p_pesquisa_id uuid,
  p_categoria text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_categoria text;
  v_afetadas integer;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'acesso_negado';
  end if;

  -- null/vazio limpa a classificacao (desmarcar o chip).
  v_categoria := nullif(btrim(coalesce(p_categoria, '')), '');

  if v_categoria is not null and v_categoria not in (
    'financeiro', 'horario', 'professor_metodo', 'mudanca',
    'saude', 'sem_motivo_claro', 'outro'
  ) then
    raise exception 'categoria_invalida';
  end if;

  update public.pesquisa_evasao
  set categoria_resposta = v_categoria,
      updated_at = now()
  where id = p_pesquisa_id
    and modo_teste = false;

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'pesquisa_nao_encontrada';
  end if;

  return jsonb_build_object('success', true, 'pesquisa_id', p_pesquisa_id, 'categoria', v_categoria);
end;
$$;

comment on function public.classificar_resposta_evasao(uuid, text) is
  'Marca o tema declarado de uma resposta de evasao. Unica escrita da analise; nao toca no fluxo de revisao.';

revoke execute on function public.get_respostas_evasao(uuid, integer, integer) from public, anon;
revoke execute on function public.classificar_resposta_evasao(uuid, text) from public, anon;
grant execute on function public.get_respostas_evasao(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.classificar_resposta_evasao(uuid, text) to authenticated, service_role;
