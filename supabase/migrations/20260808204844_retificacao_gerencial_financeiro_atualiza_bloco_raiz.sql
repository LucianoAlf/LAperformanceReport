-- Retificacao do bloco FINANCEIRO do snapshot gerencial (versao vigente).
--
-- Existia `aplicar_retificacao_relatorio_comercial_mensal_v1` para o comercial,
-- mas nada equivalente para o gerencial -- que e onde mora faturamento e
-- inadimplencia. Sem isso, corrigir julho exigiria UPDATE direto, e o trigger
-- `proteger_fechamento_mensal_snapshot_imutavel_v1` (corretamente) bloqueia.
--
-- Mesmo desenho do comercial: o snapshot NAO e alterado. O payload corrigido vai
-- para fechamento_mensal_retificacoes e a leitura o sobrepoe, validando os dois
-- hashes. Correcao por sobreposicao, com trilha em fechamento_mensal_auditoria.
--
-- O PAYLOAD GUARDA O BLOCO FINANCEIRO EM DOIS LUGARES:
--   {financeiro_faturas_emusys,totais}        <- nivel raiz
--   {kpis_gestao,0,financeiro_faturas_emusys} <- dentro do array de gestao
--
-- A leitura resolve por coalesce e tenta o RAIZ primeiro. A versao 20260808201841
-- so atualizava o de kpis_gestao, entao a retificacao era gravada, lida e
-- ignorada: o coalesce pegava o bloco raiz antigo e o relatorio seguia publicando
-- o numero congelado. Pego na validacao pos-aplicacao, conferindo o retorno da
-- RPC de leitura em vez de confiar no "sucesso" da funcao.
--
-- POR QUE JULHO/2026 PRECISOU DISSO
-- O sync de faturas so cobria a competencia corrente e nao tinha cron, entao
-- julho congelou em 23/07. Pagamento de julho feito em agosto nunca chegava, e o
-- fechamento roda dia 1 as 01:00 UTC -- antes de qualquer pagamento tardio
-- existir. Medido: R$ 15.942,90 a menos nas 3 unidades. O cron foi criado em
-- 20260808185259.
--
-- O bloco corrigido vem de get_financeiro_faturas_emusys (fonte canonica), nunca
-- de valor digitado. A funcao recusa retificar se algo alem do financeiro mudou
-- (base de alunos, evasoes, kpis_alunos_canonicos): isso seria refazer o mes, que
-- e outra decisao.

create or replace function public.aplicar_retificacao_relatorio_gerencial_financeiro_v1(
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
  v_bloco jsonb;
  v_payload_corrigido jsonb;
  v_payload_corrigido_hash text;
  v_retificacao_id uuid;
  v_inserida boolean := false;
  v_pagantes integer;
  v_inad_alunos integer;
  v_inad_valor numeric;
  v_inad_pct numeric;
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

  v_bloco := public.get_financeiro_faturas_emusys(p_unidade_id, p_ano, p_mes)#>'{totais}';
  if jsonb_typeof(v_bloco) <> 'object' or v_bloco = '{}'::jsonb then
    raise exception 'RETIFICACAO_MENSAL_FONTE_FINANCEIRA_INDISPONIVEL';
  end if;

  select count(distinct f.emusys_student_id), coalesce(sum(f.valor_original), 0)
    into v_inad_alunos, v_inad_valor
  from public.emusys_faturas f
  where f.unidade_id = p_unidade_id
    and f.competencia = make_date(p_ano, p_mes, 1)
    and f.descricao ilike 'Parcela %' and f.status = 'aberta';

  v_pagantes := coalesce((v_snapshot.payload#>'{kpis_gestao,0}'->>'alunos_pagantes')::integer, 0);
  v_inad_pct := round(case when v_pagantes > 0 then v_inad_alunos::numeric / v_pagantes * 100 else 0 end, 2);

  v_payload_corrigido := v_snapshot.payload;

  -- Bloco raiz: e o que a leitura tenta PRIMEIRO no coalesce.
  if v_payload_corrigido#>'{financeiro_faturas_emusys,totais}' is not null then
    v_payload_corrigido := jsonb_set(v_payload_corrigido, '{financeiro_faturas_emusys,totais}', v_bloco, true);
  end if;

  -- Bloco dentro de kpis_gestao e os agregados que o relatorio gerencial le.
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,financeiro_faturas_emusys}', v_bloco, true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,faturamento_realizado}', v_bloco->'mrr_atual', true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,faturamento_previsto}', v_bloco->'faturamento_previsto', true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,inadimplentes}', to_jsonb(v_inad_alunos), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,inadimplencia_valor}', to_jsonb(v_inad_valor), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,inadimplencia}', to_jsonb(v_inad_pct), true);
  v_payload_corrigido := jsonb_set(v_payload_corrigido, '{kpis_gestao,0,inadimplencia_pct}', to_jsonb(v_inad_pct), true);

  if coalesce((v_snapshot.payload#>>'{kpis_gestao,0,alunos_ativos}')::integer, -1)
       <> coalesce((v_payload_corrigido#>>'{kpis_gestao,0,alunos_ativos}')::integer, -2)
     or coalesce((v_snapshot.payload#>>'{kpis_gestao,0,alunos_pagantes}')::integer, -1)
       <> coalesce((v_payload_corrigido#>>'{kpis_gestao,0,alunos_pagantes}')::integer, -2)
     or coalesce((v_snapshot.payload#>>'{kpis_gestao,0,total_evasoes}')::integer, -1)
       <> coalesce((v_payload_corrigido#>>'{kpis_gestao,0,total_evasoes}')::integer, -2)
     or v_snapshot.payload#>'{kpis_alunos_canonicos,totais}'
       is distinct from v_payload_corrigido#>'{kpis_alunos_canonicos,totais}' then
    raise exception 'RETIFICACAO_MENSAL_INVARIANTE_DIVERGENTE';
  end if;

  v_payload_corrigido_hash := public.hash_jsonb_canonico(v_payload_corrigido);
  if v_payload_corrigido_hash = v_snapshot.payload_hash then
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
        'origem', 'financeiro_faturas_emusys',
        'retificacao_id', v_retificacao_id,
        'base_payload_hash', v_snapshot.payload_hash,
        'payload_corrigido_hash', v_payload_corrigido_hash,
        'motivo', btrim(p_motivo),
        'evidencias', coalesce(p_evidencias, '{}'::jsonb),
        'antes', jsonb_build_object(
          'faturamento_realizado', v_snapshot.payload#>'{kpis_gestao,0,faturamento_realizado}',
          'inadimplentes', v_snapshot.payload#>'{kpis_gestao,0,inadimplentes}'
        ),
        'depois', jsonb_build_object(
          'faturamento_realizado', v_payload_corrigido#>'{kpis_gestao,0,faturamento_realizado}',
          'inadimplentes', v_payload_corrigido#>'{kpis_gestao,0,inadimplentes}'
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
    'faturamento_realizado', v_bloco->'mrr_atual',
    'inadimplentes', v_inad_alunos
  );
end;
$function$;

revoke all on function public.aplicar_retificacao_relatorio_gerencial_financeiro_v1(uuid, integer, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_retificacao_relatorio_gerencial_financeiro_v1(uuid, integer, integer, text, text, jsonb)
  to service_role;
