-- Retificacao do bloco RENOVACOES do relatorio administrativo mensal.
--
-- O bloco de renovacoes vem de DOIS snapshots congelados diferentes:
--   dominio='relatorio_admin_mensal' -> a LISTA de nomes (payload.renovacoes) e
--                                       payload.resumo.renovacoes_realizadas
--   dominio='relatorio_gerencial'    -> os agregados previstas/realizadas/taxa
--                                       (payload.kpis_retencao[0], mesmo
--                                       snapshot que ja tem retificacao de
--                                       financeiro aplicada)
-- Esta funcao cobre o primeiro. A do gerencial vai em outra migration.
--
-- MESMO DESENHO do financeiro (20260808204844): o snapshot NAO e alterado. O
-- payload corrigido vai para fechamento_mensal_retificacoes e a leitura o
-- sobrepoe, validando os dois hashes.
--
-- ⚠️ ENCADEIA em vez de partir do snapshot puro: se ja existir uma retificacao
-- para este snapshot, usa o payload_corrigido dela como base e aplica esta
-- correcao POR CIMA. O leitor sempre pega a retificacao MAIS RECENTE (created_at
-- desc limit 1) -- se esta funcao partisse do payload original, uma segunda
-- retificacao apagaria silenciosamente a primeira. Ainda nao existe retificacao
-- para o dominio relatorio_admin_mensal, mas o desenho protege o proximo caso.
--
-- A lista corrigida reproduz EXATAMENTE a query de
-- montar_relatorio_admin_mensal_payload_base_v1 (mesmos campos, mesmos joins,
-- mesmo filtro de status), lendo de movimentacoes_admin_vigentes (que ja
-- desconta as duplicatas anuladas e ja tem a competencia da Catarina corrigida)
-- e travada em `created_at <= capturado_em` do proprio snapshot -- corrige o
-- que deveria ter sido capturado, sem puxar renovacoes lancadas depois.
--
-- Rodado para Recreio/jul-2026: lista 23 -> 19, resumo.renovacoes_realizadas
-- 23 -> 19. Financeiro (retificacao ja existente no mesmo snapshot gerencial)
-- confirmado byte a byte identico depois.

create or replace function public.aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_payload_hash_esperado text,
  p_motivo text,
  p_evidencias jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_base_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_base jsonb;
  v_lista jsonb;
  v_qtd integer;
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
    and s.escopo = 'unidade' and s.dominio = 'relatorio_admin_mensal' and s.status = 'fechado'
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

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb)
    into v_lista
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'aluno_nome', m.aluno_nome,
      'valor_parcela_anterior', m.valor_parcela_anterior,
      'valor_parcela_novo', m.valor_parcela_novo,
      'forma_pagamento', fp.sigla,
      'agente_comercial', m.agente_comercial,
      'curso', c.nome,
      'professor', pr.nome,
      'status', m.renovacao_status,
      'antecipada', coalesce(m.renovacao_antecipada, false)
    ) as item
    from public.movimentacoes_admin_vigentes m
    left join public.formas_pagamento fp on fp.id = m.forma_pagamento_id
    left join public.cursos c on c.id = m.curso_id
    left join public.professores pr on pr.id = m.professor_id
    where m.unidade_id = p_unidade_id
      and m.tipo = 'renovacao'
      and coalesce(m.competencia_referencia, m.data) >= make_date(p_ano, p_mes, 1)
      and coalesce(m.competencia_referencia, m.data) < (make_date(p_ano, p_mes, 1) + interval '1 month')::date
      and m.created_at <= v_snapshot.capturado_em
      and (
        m.renovacao_status in ('confirmada', 'antecipada_confirmada')
        or (
          m.renovacao_status is null
          and nullif(btrim(coalesce(m.agente_comercial, '')), '') is not null
          and (
            m.valor_parcela_anterior is not null
            or m.valor_parcela_novo is not null
            or m.forma_pagamento_id is not null
          )
        )
      )
  ) q;

  v_qtd := jsonb_array_length(v_lista);

  v_payload_corrigido := jsonb_set(v_base, '{renovacoes}', v_lista, true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{resumo,renovacoes_realizadas}', to_jsonb(v_qtd), true);

  v_payload_corrigido_hash := public.hash_jsonb_canonico(v_payload_corrigido);
  if v_payload_corrigido_hash = coalesce(v_base_retificacao.payload_corrigido_hash, v_snapshot.payload_hash) then
    raise exception 'RETIFICACAO_MENSAL_SEM_DIFERENCA';
  end if;

  insert into public.fechamento_mensal_retificacoes (
    snapshot_id, base_payload_hash, payload_corrigido, payload_corrigido_hash,
    motivo, evidencias, created_by
  ) values (
    v_snapshot.id, v_snapshot.payload_hash, v_payload_corrigido, v_payload_corrigido_hash,
    btrim(p_motivo), coalesce(p_evidencias, '{}'::jsonb), auth.uid()
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
        'origem', 'relatorio_admin_mensal.renovacoes',
        'retificacao_id', v_retificacao_id,
        'base_payload_hash', v_snapshot.payload_hash,
        'payload_corrigido_hash', v_payload_corrigido_hash,
        'motivo', btrim(p_motivo),
        'evidencias', coalesce(p_evidencias, '{}'::jsonb),
        'antes', jsonb_build_object('renovacoes_realizadas', jsonb_array_length(coalesce(v_base#>'{renovacoes}', '[]'::jsonb))),
        'depois', jsonb_build_object('renovacoes_realizadas', v_qtd)
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
    'renovacoes_realizadas', v_qtd
  );
end;
$function$;

revoke all on function public.aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1(uuid, integer, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1(uuid, integer, integer, text, text, jsonb)
  to service_role;
