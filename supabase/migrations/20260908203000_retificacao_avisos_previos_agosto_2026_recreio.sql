-- Retificação append-only do bloco `avisos_previos` do fechamento de agosto/2026 do Recreio.
--
-- POR QUE: os avisos prévios de Manuela Borges Garcia Souza e Maria Isabel Madureira Gouvêa
-- foram lançados em 28 e 31/08 com `mes_saida = 2026-09-01` (errado — pela régua da casa,
-- aviso dado em agosto cumpre agosto + setembro, então o primeiro mês fora é OUTUBRO, que é
-- como os outros 9 da mesma lista estão gravados). O fechamento foi capturado em 01/09 e
-- congelou os registros errados. Em 04/09 a equipe excluiu os dois (foram para
-- `movimentacoes_admin_arquivadas`) e relançou com outubro — mas as retificações seguintes
-- (v5 a v8) são append-only e só reescrevem o bloco que corrigem, então a lista de avisos
-- nunca foi remontada e o relatório seguiu publicando 11 nomes onde a base já tinha 9.
--
-- O QUE MUDA: apenas `payload.avisos_previos` (11 -> 9) e `payload.resumo.avisos_previos`.
-- Os dois andam juntos porque `formatarRelatorioAdminMensalCanonico` valida um contra o
-- outro (`validarQuantidade`): se divergirem, o relatório deixa de sair, com erro.
--
-- O QUE NÃO MUDA: evasões, churn, renovação, financeiro. Aviso prévio não é evasão
-- (REGRAS-DE-NEGOCIO §5.3) e não entra em nenhum outro cálculo do relatório — conferido:
-- as duas alunas não aparecem em `evasoes` nem em `nao_renovacoes` do payload, e seguem
-- ativas. A guarda de escopo abaixo aborta se qualquer outra chave mudar.
--
-- O predicado é cópia literal do de `montar_relatorio_admin_mensal_payload_base_v1`,
-- inclusive o corte `created_at <= capturado_em` — é ele que mantém fora os avisos criados
-- depois do fechamento, preservando a foto do mês.

do $$
declare
  v_unidade_id uuid := '95553e96-971b-4590-a6eb-0201d013c14d'; -- Recreio
  v_snap public.fechamento_mensal_snapshots%rowtype;
  v_corte timestamptz;
  v_lista jsonb;
  v_qtd integer;
  v_qtd_anterior integer;
  v_novo jsonb;
  v_novo_id uuid;
begin
  select * into v_snap
  from public.fechamento_mensal_snapshots
  where ano = 2026 and mes = 8 and escopo = 'unidade'
    and unidade_id = v_unidade_id and dominio = 'relatorio_admin_mensal'
  order by versao desc
  limit 1;

  if v_snap.id is null then
    raise exception 'RETIFICACAO_AVISOS_SNAPSHOT_AUSENTE';
  end if;

  -- Não retificar em cima de payload adulterado.
  if v_snap.payload_hash is null
     or public.hash_jsonb_canonico(v_snap.payload) <> v_snap.payload_hash then
    raise exception 'RETIFICACAO_AVISOS_SNAPSHOT_HASH_DIVERGENTE';
  end if;

  v_qtd_anterior := jsonb_array_length(coalesce(v_snap.payload->'avisos_previos', '[]'::jsonb));
  v_corte := (v_snap.payload->>'capturado_em')::timestamptz;
  if v_corte is null then
    raise exception 'RETIFICACAO_AVISOS_SEM_CAPTURADO_EM';
  end if;

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb), count(*)
    into v_lista, v_qtd
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'mes_saida', m.mes_saida,
      'aluno_nome', m.aluno_nome,
      'valor_parcela', coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior),
      'motivo', m.motivo,
      'curso', c.nome,
      'professor', p.nome
    ) as item
    from public.movimentacoes_admin_vigentes m
    left join public.cursos c on c.id = m.curso_id
    left join public.professores p on p.id = m.professor_id
    where m.unidade_id = v_unidade_id
      and m.tipo = 'aviso_previo'
      and m.mes_saida >= date '2026-09-01'
      and m.mes_saida <  date '2026-10-01'
      and m.created_at <= v_corte
  ) q;

  -- Ensaiado contra o banco antes de escrever: 9 é o número esperado. Qualquer outro valor
  -- significa que a base mudou desde o ensaio — melhor abortar do que publicar às cegas.
  if v_qtd <> 9 then
    raise exception 'RETIFICACAO_AVISOS_QTD_INESPERADA: esperado 9, obtido %', v_qtd;
  end if;

  v_novo := jsonb_set(v_snap.payload, '{avisos_previos}', v_lista);
  v_novo := jsonb_set(v_novo, '{resumo,avisos_previos}', to_jsonb(v_qtd));
  v_novo := jsonb_set(v_novo, '{retificacao_avisos_previos_agosto_2026}', jsonb_build_object(
    'aplicado_em', now(),
    'de', v_qtd_anterior,
    'para', v_qtd,
    'snapshot_anterior', v_snap.id,
    'motivo', 'Avisos previos de Manuela Borges Garcia Souza e Maria Isabel Madureira Gouvea '
              || 'foram arquivados em 04/09/2026 e relancados com mes_saida outubro/2026; o '
              || 'fechamento de 01/09 havia congelado os registros antigos (setembro).'
  ));

  -- Guarda de escopo: fora as três chaves que esta retificação declara mexer, o payload
  -- precisa sair byte a byte igual ao que entrou.
  if (v_novo - 'avisos_previos' - 'retificacao_avisos_previos_agosto_2026' #- '{resumo,avisos_previos}')
     is distinct from
     (v_snap.payload - 'avisos_previos' - 'retificacao_avisos_previos_agosto_2026' #- '{resumo,avisos_previos}')
  then
    raise exception 'RETIFICACAO_AVISOS_ESCOPO_EXCEDIDO';
  end if;

  insert into public.fechamento_mensal_snapshots (
    ano, mes, escopo, unidade_id, dominio, versao, status,
    fonte, payload, payload_hash, financeiro_realizado_disponivel,
    observacao, capturado_em, capturado_por,
    aprovado_em, aprovado_por, fechado_em, fechado_por
  ) values (
    2026, 8, 'unidade', v_unidade_id, 'relatorio_admin_mensal', v_snap.versao + 1, 'fechado',
    'retificacao_avisos_previos_agosto_2026_recreio_v1', v_novo,
    public.hash_jsonb_canonico(v_novo), v_snap.financeiro_realizado_disponivel,
    format('retificacao append-only; snapshot anterior: %s', v_snap.id),
    v_snap.capturado_em, v_snap.capturado_por,
    now(), auth.uid(), now(), auth.uid()
  ) returning id into v_novo_id;

  insert into public.fechamento_mensal_auditoria (
    snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
  ) values (
    v_novo_id, 2026, 8, 'unidade', v_unidade_id, 'snapshot_gravado',
    jsonb_build_object(
      'dominio', 'relatorio_admin_mensal',
      'snapshot_anterior_id', v_snap.id,
      'payload_anterior_hash', v_snap.payload_hash,
      'avisos_previos_de', v_qtd_anterior,
      'avisos_previos_para', v_qtd
    ), auth.uid()
  );

  raise notice 'Retificacao de avisos previos aplicada: v% -> v% (% -> %)',
    v_snap.versao, v_snap.versao + 1, v_qtd_anterior, v_qtd;
end $$;
