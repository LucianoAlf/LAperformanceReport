-- A guarda de escopo de aplicar_retificacao_relatorio_gerencial_retencao_v1
-- disparou em producao: total_evasoes do snapshot gerencial (5) nao bate com o
-- recalculo no mesmo corte de tempo (7). Investigado -- e um bug DIFERENTE e
-- ja existente, nao introduzido por esta correcao:
--
--   snapshot relatorio_admin_mensal: resumo.evasoes = 7, mas a LISTA
--     payload.evasoes so tem 5 itens -- o mesmo padrao de bug das renovacoes
--     (cabecalho diferente da lista), so que no bloco de evasoes.
--   snapshot relatorio_gerencial:     kpis_retencao[0].total_evasoes = 5
--   texto do WhatsApp publicado:      "Saidas totais: 7"
--
-- Tres numeros para a mesma coisa, e nenhum e culpa da correcao de renovacao.
-- Fica registrado como pendencia separada -- nao e tocado aqui.
--
-- A funcao NUNCA escreve em total_evasoes/avisos_previos/mrr_perdido/churn_rate
-- (conferido: so 4 jsonb_set, todos dentro de kpis_retencao.0 nos campos de
-- renovacao). A guarda e so um sinal de alerta, nao limite de escopo -- por
-- isso e seguro dar um jeito explicito de confirmar "sei da divergencia, nao e
-- desta correcao, pode seguir" em vez de reescrever a guarda para sumir com o
-- alerta. Sem o parametro, o comportamento continua o mesmo: aborta.
--
-- Rodado para Recreio/jul-2026 com p_confirma_divergencia_alheia=true:
-- renovacoes_previstas 27->21, renovacoes_realizadas 23->19, taxa_renovacao
-- 85.19->90.48. avisos_previos bateu (8=8); so total_evasoes divergiu (5 vs 7),
-- registrado em evidencias.divergencia_alheia_confirmada na auditoria.

create or replace function public.aplicar_retificacao_relatorio_gerencial_retencao_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_payload_hash_esperado text,
  p_motivo text,
  p_evidencias jsonb default '{}'::jsonb,
  p_confirma_divergencia_alheia boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_base_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_base jsonb;
  v_kpis_antes jsonb;
  v_realizadas integer;
  v_nao_renov integer;
  v_previstas integer;
  v_taxa numeric;
  v_taxa_nao numeric;
  v_evasoes_atual integer;
  v_avisos_atual integer;
  v_divergencia_alheia jsonb := null;
  v_payload_corrigido jsonb;
  v_payload_corrigido_hash text;
  v_retificacao_id uuid;
  v_inserida boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_RETIFICACAO_MENSAL';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 20 then
    raise exception 'RETIFICACAO_MENSAL_MOTIVO_OBRIGATORIO';
  end if;
  if jsonb_typeof(coalesce(p_evidencias, '{}'::jsonb)) <> 'object' then
    raise exception 'RETIFICACAO_MENSAL_EVIDENCIAS_INVALIDAS';
  end if;

  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.unidade_id = p_unidade_id and s.ano = p_ano and s.mes = p_mes
    and s.escopo = 'unidade' and s.dominio = 'relatorio_gerencial' and s.status = 'fechado'
  order by s.versao desc limit 1 for update;

  if v_snapshot.id is null then
    raise exception 'RETIFICACAO_MENSAL_SNAPSHOT_INDISPONIVEL';
  end if;
  if public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash
     or v_snapshot.payload_hash <> p_payload_hash_esperado then
    raise exception 'RETIFICACAO_MENSAL_HASH_BASE_DIVERGENTE';
  end if;

  select * into v_base_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = v_snapshot.id and r.base_payload_hash = v_snapshot.payload_hash
  order by r.created_at desc limit 1;

  v_base := coalesce(v_base_retificacao.payload_corrigido, v_snapshot.payload);

  if jsonb_typeof(v_base#>'{kpis_retencao}') <> 'array'
     or jsonb_array_length(v_base#>'{kpis_retencao}') <> 1 then
    raise exception 'RETIFICACAO_GERENCIAL_KPIS_RETENCAO_FORMATO_INESPERADO';
  end if;
  v_kpis_antes := v_base#>'{kpis_retencao,0}';

  with movimentacoes_retencao as (
    select m.id, m.tipo, m.data, m.competencia_referencia
    from public.movimentacoes_admin_vigentes m
    left join public.alunos a on a.id = m.aluno_id
    where m.unidade_id = p_unidade_id
      and m.created_at <= v_snapshot.capturado_em
      and not public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))
  )
  select
    count(*) filter (where mr.tipo = 'renovacao'),
    count(*) filter (where mr.tipo = 'nao_renovacao'),
    count(*) filter (where mr.tipo in ('renovacao', 'nao_renovacao'))
  into v_realizadas, v_nao_renov, v_previstas
  from movimentacoes_retencao mr
  where (mr.tipo = 'renovacao' or mr.tipo = 'nao_renovacao')
    and extract(year from coalesce(mr.competencia_referencia, mr.data)) = p_ano
    and extract(month from coalesce(mr.competencia_referencia, mr.data)) = p_mes;

  v_taxa := case when coalesce(v_previstas, 0) > 0 then round(v_realizadas::numeric / v_previstas * 100, 2) else 0 end;
  v_taxa_nao := case when coalesce(v_previstas, 0) > 0 then round(v_nao_renov::numeric / v_previstas * 100, 2) else 0 end;

  with movimentacoes_retencao as (
    select m.id, m.tipo, m.data, m.competencia_referencia
    from public.movimentacoes_admin_vigentes m
    left join public.alunos a on a.id = m.aluno_id
    where m.unidade_id = p_unidade_id
      and m.created_at <= v_snapshot.capturado_em
      and not public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))
  )
  select count(*) into v_evasoes_atual
  from movimentacoes_retencao mr
  where mr.tipo in ('evasao', 'nao_renovacao')
    and extract(year from mr.data) = p_ano and extract(month from mr.data) = p_mes;

  select count(*) into v_avisos_atual
  from public.movimentacoes_admin_vigentes m
  where m.unidade_id = p_unidade_id
    and m.created_at <= v_snapshot.capturado_em
    and m.tipo = 'aviso_previo'
    and extract(year from m.data) = p_ano and extract(month from m.data) = p_mes;

  if v_evasoes_atual <> coalesce((v_kpis_antes->>'total_evasoes')::integer, -1)
     or v_avisos_atual <> coalesce((v_kpis_antes->>'avisos_previos')::integer, -1) then
    if not p_confirma_divergencia_alheia then
      raise exception 'RETIFICACAO_GERENCIAL_ESCOPO_EXCEDIDO: total_evasoes ou avisos_previos mudaram por motivo alheio a renovacao (evasoes % vs %, avisos % vs %). Se a divergencia e conhecida e nao e desta correcao, chame com p_confirma_divergencia_alheia=true.',
        v_evasoes_atual, v_kpis_antes->>'total_evasoes', v_avisos_atual, v_kpis_antes->>'avisos_previos';
    end if;
    -- Confirmado pelo operador: registra a divergencia na auditoria em vez de
    -- escondê-la. NAO escreve nesses campos -- so documenta que ela existia
    -- no momento desta retificacao, para quem for investigar depois.
    v_divergencia_alheia := jsonb_build_object(
      'total_evasoes_frozen', v_kpis_antes->>'total_evasoes', 'total_evasoes_recalculado', v_evasoes_atual,
      'avisos_previos_frozen', v_kpis_antes->>'avisos_previos', 'avisos_previos_recalculado', v_avisos_atual
    );
  end if;

  v_payload_corrigido := jsonb_set(v_base, '{kpis_retencao,0,renovacoes_previstas}', to_jsonb(coalesce(v_previstas,0)), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_retencao,0,renovacoes_realizadas}', to_jsonb(coalesce(v_realizadas,0)), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_retencao,0,taxa_renovacao}', to_jsonb(v_taxa), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_retencao,0,taxa_nao_renovacao}', to_jsonb(v_taxa_nao), true);

  v_payload_corrigido_hash := public.hash_jsonb_canonico(v_payload_corrigido);
  if v_payload_corrigido_hash = coalesce(v_base_retificacao.payload_corrigido_hash, v_snapshot.payload_hash) then
    raise exception 'RETIFICACAO_MENSAL_SEM_DIFERENCA';
  end if;

  insert into public.fechamento_mensal_retificacoes (
    snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
    motivo, evidencias, created_by
  ) values (
    v_snapshot.id, v_snapshot.payload_hash, v_payload_corrigido, v_payload_corrigido_hash,
    btrim(p_motivo), coalesce(p_evidencias, '{}'::jsonb) || jsonb_build_object('divergencia_alheia_confirmada', v_divergencia_alheia), auth.uid()
  )
  on conflict (snapshot_id, payload_corrigido_hash) do nothing
  returning id into v_retificacao_id;

  if v_retificacao_id is not null then
    v_inserida := true;
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    ) values (
      v_snapshot.id, v_snapshot.ano, v_snapshot.mes, v_snapshot.escopo, v_snapshot.unidade_id,
      'retificacao_solicitada',
      jsonb_build_object(
        'status', 'aplicada',
        'origem', 'relatorio_gerencial.kpis_retencao',
        'retificacao_id', v_retificacao_id,
        'base_payload_hash', v_snapshot.payload_hash,
        'payload_corrigido_hash', v_payload_corrigido_hash,
        'motivo', btrim(p_motivo),
        'evidencias', coalesce(p_evidencias, '{}'::jsonb),
        'divergencia_alheia_confirmada', v_divergencia_alheia,
        'antes', jsonb_build_object(
          'renovacoes_previstas', v_kpis_antes->'renovacoes_previstas',
          'renovacoes_realizadas', v_kpis_antes->'renovacoes_realizadas',
          'taxa_renovacao', v_kpis_antes->'taxa_renovacao'
        ),
        'depois', jsonb_build_object(
          'renovacoes_previstas', v_previstas,
          'renovacoes_realizadas', v_realizadas,
          'taxa_renovacao', v_taxa
        )
      ),
      auth.uid()
    );
  else
    select r.id into v_retificacao_id
    from public.fechamento_mensal_retificacoes r
    where r.snapshot_id = v_snapshot.id and r.payload_corrigido_hash = v_payload_corrigido_hash;
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot.id,
    'retificacao_id', v_retificacao_id,
    'payload_corrigido_hash', v_payload_corrigido_hash,
    'inserida', v_inserida,
    'renovacoes_previstas', v_previstas,
    'renovacoes_realizadas', v_realizadas,
    'taxa_renovacao', v_taxa,
    'divergencia_alheia_confirmada', v_divergencia_alheia
  );
end;
$function$;
