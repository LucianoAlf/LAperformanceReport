begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- DDL curta: somente definições/ACL. NÃO executa regularização/backfill.
-- Decisão explícita: Jun-Ago/2026 só pode ser oficial em 30/09/2026 (fim + 30).
-- Não altera regras de comparabilidade nem exige todos os indicadores aptos.
do $gates_d30$
declare
  v_signature text;
  v_def text;
  v_before constant text := 'if current_date < v_ciclo.data_fim then';
  v_after constant text := 'if current_date < v_ciclo.data_fim + 30 then';
begin
  foreach v_signature in array array[
    'public.fechar_health_score_professor_v3_ciclo(text,text)',
    'public.retificar_coordenacao_jun_ago_2026()'
  ] loop
    v_def := pg_get_functiondef(v_signature::regprocedure);
    if position(v_after in v_def) > 0 then
      continue; -- DDL reexecutável; não duplica "+ 30".
    end if;
    if (length(v_def) - length(replace(v_def, v_before, ''))) / length(v_before) <> 1 then
      raise exception 'COORDENACAO_D30_GATE_FONTE_DIVERGENTE: %', v_signature;
    end if;
    v_def := replace(v_def, v_before, v_after);
    v_def := replace(v_def,
      'HEALTH_SCORE_V3_FECHAMENTO_BLOQUEADO: ciclo ainda aberto',
      'HEALTH_SCORE_V3_FECHAMENTO_D30_BLOQUEADO: aguarde data_fim + 30');
    v_def := replace(v_def,
      'RETIFICACAO_JUN_AGO_ANTES_DO_FIM',
      'RETIFICACAO_JUN_AGO_D30_BLOQUEADA');
    execute v_def;
  end loop;
end;
$gates_d30$;

-- Passar do dia D+30 não torna um retrato de 09/09 uma nova apuração. O closer
-- não recalcula fontes: exige persistência fresca da origem E da conversão dos
-- candidatos que já eram comparáveis. A data da métrica evita lavar evidência
-- copiada ao criar apenas um novo snapshot. Não requer apta_oficial=true (essa
-- flag inclui amostra/qualidade do indicador e não é veto ao HS global).
do $frescor_d30$
declare
  v_def text := pg_get_functiondef('public.fechar_health_score_professor_v3_ciclo(text,text)'::regprocedure);
  v_anchor text := E'    and p.score_comparavel is not null and p.score_exibivel;\n';
  v_guard text := $guard$

  if exists (
    select 1 from public.health_score_professor_v3_snapshots s
    where s.id = any(v_elegiveis)
      and (
        s.criado_em::date < v_ciclo.data_fim + 30
        or not exists (
          select 1 from public.health_score_professor_v3_snapshot_metricas m
          where m.snapshot_id = s.id and m.metrica = 'conversao'
            and m.criado_em::date >= v_ciclo.data_fim + 30
        )
      )
  ) then
    raise exception 'HEALTH_SCORE_V3_D30_FONTE_DESATUALIZADA: reapure o periodo apos D+30 antes do fechamento';
  end if;
$guard$;
begin
  if position('HEALTH_SCORE_V3_D30_FONTE_DESATUALIZADA' in v_def)>0 then
    return;
  end if;
  if (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'COORDENACAO_D30_FRESCOR_FONTE_DIVERGENTE';
  end if;
  execute replace(v_def,v_anchor,v_anchor || v_guard);
end;
$frescor_d30$;

-- CURRENT_DATE deve respeitar o dia civil de São Paulo mesmo em RPC/sessão UTC.
-- Escopo por função, restaurado ao retornar; não altera timezone global do banco.
alter function public.fechar_health_score_professor_v3_ciclo(text,text)
  set timezone = 'America/Sao_Paulo';
alter function public.retificar_coordenacao_jun_ago_2026()
  set timezone = 'America/Sao_Paulo';

-- Cerimônia separada, privada e deliberadamente limitada à publicação antecipada
-- auditada. Invocação futura explícita, em transação própria, após revisão.
-- em_maturacao é o ESTADO físico da nova revisão, não comparabilidade_estado.
-- O leitor V1/V3 aceita passado + parcial + em_maturacao e avalia comparabilidade
-- pelas MESMAS métricas/configuração: conserva 43 diagnósticos consolidados.
-- Não mudar comparabilidade/labels para "em maturação" por causa deste estado.
--
-- Os 4 documentos novos são RETIFICADOS (append-only). "finalizado=true" no
-- wrapper documental significa artefato imutável, NÃO publicação oficial do HS.
-- Não usar preview: o leitor prioriza finais históricos. Não chamar o produtor:
-- seu ramo "não oficial" reconsultaria fontes/presença históricas.
create or replace function public.regularizar_coordenacao_jun_ago_2026_d30(
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'America/Sao_Paulo'
as $regularizar_d30$
declare
  v_marker constant text := 'coordenacao-jun-ago-2026-d30-v1';
  v_ciclo public.health_score_professor_v3_ciclos%rowtype;
  v_scope record;
  v_lock record;
  v_old public.health_score_professor_v3_snapshots%rowtype;
  v_new public.health_score_professor_v3_snapshots%rowtype;
  v_metric public.health_score_professor_v3_snapshot_metricas%rowtype;
  v_doc public.fechamento_mensal_snapshots%rowtype;
  v_doc_new public.fechamento_mensal_snapshots%rowtype;
  v_origins uuid[];
  v_clones uuid[];
  v_old_docs uuid[] := array[]::uuid[];
  v_old_snapshot_evidence jsonb;
  v_old_document_evidence jsonb;
  v_doc_ids uuid[];
  v_n integer;
  v_done boolean;
  v_payload jsonb;
  v_teachers jsonb;
  v_mapping jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_control text := coalesce(current_setting('app.health_score_v3_mutacao_controlada', true), 'off');
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'COORDENACAO_D30_ACESSO_NEGADO' using errcode = '42501';
  end if;
  if nullif(btrim(p_justificativa), '') is null then
    raise exception 'COORDENACAO_D30_JUSTIFICATIVA_OBRIGATORIA' using errcode = '22023';
  end if;

  select * into strict v_ciclo
  from public.health_score_professor_v3_ciclos
  where codigo = '2026-JUN-AGO'
  for update;
  if v_ciclo.data_inicio <> date '2026-06-01' or v_ciclo.data_fim <> date '2026-08-31' then
    raise exception 'COORDENACAO_D30_CICLO_DIVERGENTE' using errcode = '22023';
  end if;
  -- Depois de D+30, nunca desoficializar uma nova cerimônia legítima.
  if current_date <= v_ciclo.data_fim or current_date >= v_ciclo.data_fim + 30 then
    raise exception 'COORDENACAO_D30_REGULARIZACAO_FORA_DA_JANELA' using errcode = '22023';
  end if;

  -- Mesma ordem/chaves do closer: ciclo -> competências -> famílias -> unidades.
  -- Nenhum LOCK TABLE / ACCESS EXCLUSIVE durante as cópias.
  for v_lock in
    with competencias as (
      select gs::date competencia from generate_series(
        date '2026-06-01', date '2026-08-01', interval '1 month') gs
    ), chaves as (
      select competencia, 0 ordem, null::uuid unidade_id,
        'health_score_v3_periodo:' || competencia::text || ':ciclo' chave from competencias
      union all
      select competencia, 1, null::uuid,
        'health_score_professor_v3:' || competencia::text || ':consolidado:rede' from competencias
      union all
      select competencia, 2, u.id,
        'health_score_professor_v3:' || competencia::text || ':unidade:' || u.id::text
      from competencias cross join public.unidades u where u.ativo
    ) select * from chaves order by competencia, ordem, unidade_id nulls first
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock.chave, 0));
  end loop;
  for v_scope in
    select * from (values
      (null::uuid), ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid),
      ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid),
      ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid)
    ) u(unidade_id) order by unidade_id nulls first
  loop
    perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',
      'relatorio-coordenacao-v4', 2026, 6, 'ciclo',
      case when v_scope.unidade_id is null then 'consolidado' else 'unidade' end,
      coalesce(v_scope.unidade_id::text, 'consolidado')), 0));
  end loop;

  -- Identidade de negócio + versão + hash congelado da auditoria aprovada.
  -- Não embutir IDs gerados de documentos: resolver e fixar os quatro na transação.
  for v_scope in
    select * from (values
      (null::uuid,12,'fe85fc8292ddc6e7858d2a89728c467df5e6a0a5bf8c440a18815421b884e29a'),
      ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid,12,'ab02a94d2030c07d0f74d6adc99585ccd688a1ba38080c8f623284b3fdcf13b4'),
      ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid,10,'b5bd0081f390287bb59bd697e1b84031bf5eb5d0d429f4e99932b0f851a2363a'),
      ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid,10,'108d507a5a5466c2cde83f7a4843244045c3cae80da422c8bdf525236087f3c1')
    ) u(unidade_id,versao,hash_esperado) order by unidade_id nulls first
  loop
    select count(*), (array_agg(d.id))[1] into v_n,v_doc_new.id
    from public.fechamento_mensal_snapshots d
    where d.ano=2026 and d.mes=6 and d.dominio='relatorio_coordenacao_ciclo'
      and d.escopo=case when v_scope.unidade_id is null then 'consolidado' else 'unidade' end
      and d.unidade_id is not distinct from v_scope.unidade_id and d.versao=v_scope.versao;
    if v_n<>1 then
      raise exception 'COORDENACAO_D30_ESPERADOS_4_DOCUMENTOS' using errcode='22023';
    end if;
    select * into strict v_doc from public.fechamento_mensal_snapshots where id=v_doc_new.id;
    if v_doc.payload_hash is distinct from v_scope.hash_esperado then
      raise exception 'COORDENACAO_D30_DOCUMENTO_ORIGINAL_DIVERGENTE: hash congelado' using errcode='22023';
    end if;
    v_old_docs:=array_append(v_old_docs,v_doc.id);
  end loop;

  select array_agg(s.id order by s.id), array_agg(s.snapshot_anterior_id order by s.id)
    into v_clones, v_origins
  from public.health_score_professor_v3_snapshots s
  where s.justificativa_retificacao like v_marker || ': %';
  v_done := coalesce(cardinality(v_clones), 0) > 0;
  if not v_done then
    if not v_ciclo.publicacao_oficial or not v_ciclo.ranking_habilitado or v_ciclo.estado <> 'fechado' then
      raise exception 'COORDENACAO_D30_ORIGEM_NAO_OFICIAL' using errcode = '22023';
    end if;
    select array_agg(s.id order by s.id) into v_origins
    from public.health_score_professor_v3_snapshots s
    where s.periodicidade = 'ciclo' and s.ciclo_codigo = v_ciclo.codigo
      and s.invalidado_em is null and s.estado_publicacao = 'oficial';
  elsif cardinality(v_clones) <> 117 or cardinality(v_origins) <> 117 then
    raise exception 'COORDENACAO_D30_REPARO_PARCIAL' using errcode = '22023';
  end if;
  if coalesce(cardinality(v_origins), 0) <> 117 then
    raise exception 'COORDENACAO_D30_ESPERADOS_117_SNAPSHOTS' using errcode = '22023';
  end if;

  -- Guard por ID/recorte e pelas seis métricas, incluindo restrição que evita o
  -- trigger de indisponibilidade mudar publicado no histórico invalidado.
  if exists (
    select 1 from public.health_score_professor_v3_snapshots s
    where s.id = any(v_origins) and (
      s.periodicidade <> 'ciclo' or s.ciclo_codigo <> v_ciclo.codigo
      or s.competencia <> date '2026-08-01'
      or s.periodo_inicio <> v_ciclo.data_inicio or s.periodo_fim <> v_ciclo.data_fim
      or not s.publicado or not s.score_exibivel or s.score is null
      or s.estado_publicacao <> 'oficial'
      or (not v_done and (s.estado <> 'fechado' or not s.publicavel
        or not s.ranking_habilitado or s.invalidado_em is not null))
      or (v_done and (s.estado <> 'invalidado' or s.publicavel
        or s.ranking_habilitado or s.invalidado_em is null))
      or (select count(*) from public.health_score_professor_v3_snapshot_metricas m where m.snapshot_id=s.id) <> 6
      or exists(select 1 from public.health_score_professor_v3_snapshot_metricas m
        where m.snapshot_id=s.id and m.metrica='numero_alunos' and m.estado_base='sem_base_disponibilidade')
    )
  ) then
    raise exception 'COORDENACAO_D30_EVIDENCIA_ORIGINAL_DIVERGENTE' using errcode = '22023';
  end if;
  select jsonb_object_agg(s.id, to_jsonb(s) -
    array['estado','invalidado_em','publicavel','ranking_habilitado','motivo_bloqueio'])
    into v_old_snapshot_evidence
  from public.health_score_professor_v3_snapshots s where s.id = any(v_origins);
  select jsonb_object_agg(d.id, to_jsonb(d)) into v_old_document_evidence
  from public.fechamento_mensal_snapshots d where d.id = any(v_old_docs);
  if (select count(*) from public.fechamento_mensal_snapshots where id=any(v_old_docs)) <> 4 then
    raise exception 'COORDENACAO_D30_ESPERADOS_4_DOCUMENTOS' using errcode = '22023';
  end if;

  for v_scope in
    select * from (values
      (null::uuid, 44, 43, 12, v_old_docs[1]),
      ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 32, 31, 12, v_old_docs[2]),
      ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 20, 19, 10, v_old_docs[3]),
      ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 24, 24, 10, v_old_docs[4])
    ) u(unidade_id,total,comparaveis,versao,doc_id)
  loop
    select * into strict v_doc from public.fechamento_mensal_snapshots where id=v_scope.doc_id;
    if v_doc.unidade_id is distinct from v_scope.unidade_id
       or v_doc.ano<>2026 or v_doc.mes<>6 or v_doc.dominio<>'relatorio_coordenacao_ciclo'
       or v_doc.versao<>v_scope.versao or v_doc.status not in ('aprovado','fechado','retificado')
       or v_doc.payload_hash is distinct from public.hash_jsonb_canonico(v_doc.payload-'documento')
       or v_doc.payload #>> '{documento,hash}' is distinct from v_doc.payload_hash
       or v_doc.payload #>> '{documento,id}' is distinct from v_doc.id::text
       or not (v_doc.payload @> '{"schema_version":4,"periodo":{"publicacao_oficial":true,"ciclo_codigo":"2026-JUN-AGO"}}')
       or jsonb_typeof(v_doc.payload->'professores') is distinct from 'array'
       or jsonb_array_length(v_doc.payload->'professores')<>v_scope.total then
      raise exception 'COORDENACAO_D30_DOCUMENTO_ORIGINAL_DIVERGENTE: %', v_doc.id using errcode='22023';
    end if;
    if not v_done and exists(
      select 1 from public.fechamento_mensal_snapshots d
      where d.ano=2026 and d.mes=6 and d.dominio=v_doc.dominio
        and d.unidade_id is not distinct from v_scope.unidade_id and d.versao>v_doc.versao
    ) then
      raise exception 'COORDENACAO_D30_DOCUMENTO_SUPERADO: %', v_doc.id using errcode='22023';
    end if;
    select count(*) into v_n from public.health_score_professor_v3_snapshots s
    where s.id=any(v_origins) and s.unidade_id is not distinct from v_scope.unidade_id;
    if v_n<>v_scope.comparaveis then
      raise exception 'COORDENACAO_D30_CONTAGEM_ESCOPO_DIVERGENTE' using errcode='22023';
    end if;
    -- Igualdade de conjuntos, não só quantidade. Diagnósticos fora da nota não
    -- são promovidos nem removidos. Guard de score já armazenado, sem recalcular.
    if (select count(*) from jsonb_array_elements(v_doc.payload->'professores') p
        where p->>'estado_publicacao'='oficial') <> v_scope.comparaveis
       or (select count(distinct p->>'professor_id') from jsonb_array_elements(v_doc.payload->'professores') p) <> v_scope.total
       or exists (
        select 1 from public.health_score_professor_v3_snapshots s
        left join jsonb_array_elements(v_doc.payload->'professores') p
          on (p->>'professor_id')::integer=s.professor_id
        where s.id=any(v_origins) and s.unidade_id is not distinct from v_scope.unidade_id
          and (p is null or p->>'estado_publicacao' is distinct from 'oficial'
            or p->>'comparabilidade_estado' is distinct from 'comparavel'
            or (p->>'score_exibivel')::boolean is distinct from true
            or (p->>'score_comparavel')::numeric is distinct from s.score)
       ) then
      raise exception 'COORDENACAO_D30_IDS_SCORE_DOCUMENTO_DIVERGENTES' using errcode='22023';
    end if;
  end loop;

  if not v_done then
    perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);
    v_clones := array[]::uuid[];
    for v_old in
      select * from public.health_score_professor_v3_snapshots
      where id=any(v_origins) order by unidade_id nulls first, professor_id for update
    loop
      -- Somente a transição formal permitida pelo trigger. publicado é histórico.
      update public.health_score_professor_v3_snapshots
      set estado='invalidado', invalidado_em=now(), publicavel=false, ranking_habilitado=false,
          motivo_bloqueio='Publicação antecipada invalidada: aguardar D+30 em 30/09/2026.'
      where id=v_old.id;
      v_new := v_old;
      v_new.id := gen_random_uuid();
      select max(s.revisao)+1 into v_new.revisao
      from public.health_score_professor_v3_snapshots s
      where s.professor_id=v_old.professor_id and s.unidade_id is not distinct from v_old.unidade_id
        and s.competencia=v_old.competencia and s.periodicidade=v_old.periodicidade;
      v_new.estado := 'em_maturacao';
      v_new.estado_publicacao := 'parcial';
      v_new.publicado := false;
      v_new.publicavel := false;
      v_new.ranking_habilitado := false;
      v_new.snapshot_anterior_id := v_old.id;
      v_new.justificativa_retificacao := v_marker || ': ' || btrim(p_justificativa);
      v_new.motivo_bloqueio := 'Diagnóstico comparável; publicação oficial a partir de 30/09/2026 (D+30).';
      v_new.criado_em := now();
      v_new.criado_por := null;
      v_new.fechado_em := null;
      insert into public.health_score_professor_v3_snapshots select (v_new).*;
      v_clones := array_append(v_clones, v_new.id);
      for v_metric in
        select * from public.health_score_professor_v3_snapshot_metricas where snapshot_id=v_old.id
      loop
        v_metric.id := gen_random_uuid();
        v_metric.snapshot_id := v_new.id;
        -- Inclusive criado_em/detalhes/fonte/notas/pesos permanecem idênticos.
        insert into public.health_score_professor_v3_snapshot_metricas select (v_metric).*;
      end loop;
    end loop;

    update public.health_score_professor_v3_ciclos
    set estado='em_fechamento', publicacao_oficial=false, ranking_habilitado=false
    where id=v_ciclo.id;
    -- fechado_em/justificativa anteriores preservam a cerimônia histórica;
    -- a regularização tem trilha própria nas revisões e nos novos documentos.
    for v_doc in
      select * from public.fechamento_mensal_snapshots
      where id=any(v_old_docs) order by unidade_id nulls first
    loop
      select jsonb_agg(
        case when p->>'estado_publicacao'='oficial'
          then p || '{"estado_publicacao":"parcial","ranking_habilitado":false}'::jsonb
          else p || '{"ranking_habilitado":false}'::jsonb end order by ord
      ) into v_teachers from jsonb_array_elements(v_doc.payload->'professores') with ordinality a(p,ord);
      select jsonb_agg(jsonb_build_object(
        'professor_id',s.professor_id,'anterior_id',s.snapshot_anterior_id,'id',s.id
      ) order by s.professor_id), count(*) into v_mapping,v_n
      from public.health_score_professor_v3_snapshots s
      where s.id=any(v_clones) and s.unidade_id is not distinct from v_doc.unidade_id;
      v_payload := (v_doc.payload-'documento') || jsonb_build_object(
        'periodo', (v_doc.payload->'periodo') || jsonb_build_object(
          'publicacao_oficial',false,'ranking_habilitado',false,
          'ciclo_estado','em_fechamento','estado_publicacao','ciclo_em_acompanhamento'),
        'professores',v_teachers,'ranking_oficial','[]'::jsonb,
        'resumo_equipe',(v_doc.payload->'resumo_equipe') || jsonb_build_object('oficiais',0,'parciais',v_n),
        'governanca_d30',jsonb_build_object(
          'contrato',v_marker,'motivo',btrim(p_justificativa),'oficial_a_partir_de',v_ciclo.data_fim+30,
          'documento_anterior_id',v_doc.id,'documento_anterior_hash',v_doc.payload_hash,
          'snapshots',v_mapping,'metricas_recalculadas',false,
          'estado','diagnostico_comparavel_aguardando_d30'));
      v_doc_new := v_doc;
      v_doc_new.id := gen_random_uuid();
      v_doc_new.versao := v_doc.versao+1;
      v_doc_new.status := 'retificado';
      v_doc_new.fonte := 'regularizar_coordenacao_jun_ago_2026_d30';
      v_doc_new.payload_hash := public.hash_jsonb_canonico(v_payload);
      v_doc_new.payload := v_payload || jsonb_build_object('documento',jsonb_build_object(
        'id',v_doc_new.id,'versao',v_doc_new.versao,'hash',v_doc_new.payload_hash,
        'status','retificado','gerado_em',now(),'supersede_id',v_doc.id));
      v_doc_new.observacao := v_marker || ': ' || btrim(p_justificativa);
      v_doc_new.capturado_em := now();
      v_doc_new.capturado_por := auth.uid();
      v_doc_new.aprovado_em := now();
      v_doc_new.aprovado_por := auth.uid();
      v_doc_new.fechado_em := now();
      v_doc_new.fechado_por := auth.uid();
      v_doc_new.created_at := now();
      v_doc_new.updated_at := now();
      insert into public.fechamento_mensal_snapshots select (v_doc_new).*;
    end loop;
    perform set_config('app.health_score_v3_mutacao_controlada', v_control, true);
  end if;

  -- Também no retry: marcadores sozinhos não provam um reparo completo.
  if cardinality(v_clones)<>117
     or (select count(distinct snapshot_anterior_id) from public.health_score_professor_v3_snapshots where id=any(v_clones))<>117
     or exists (
      select 1 from public.health_score_professor_v3_snapshots n
      join public.health_score_professor_v3_snapshots o on o.id=n.snapshot_anterior_id
      where n.id=any(v_clones) and (
        n.estado<>'em_maturacao' or n.estado_publicacao<>'parcial' or n.publicado or n.publicavel
        or n.ranking_habilitado or not n.score_exibivel or n.invalidado_em is not null
        or (to_jsonb(n)-array['id','revisao','estado','publicado','publicavel','ranking_habilitado',
          'estado_publicacao','snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio',
          'criado_em','criado_por','fechado_em','invalidado_em'])
          is distinct from
          (to_jsonb(o)-array['id','revisao','estado','publicado','publicavel','ranking_habilitado',
          'estado_publicacao','snapshot_anterior_id','justificativa_retificacao','motivo_bloqueio',
          'criado_em','criado_por','fechado_em','invalidado_em'])
      )
     ) then
    raise exception 'COORDENACAO_D30_CLONES_DIVERGENTES' using errcode='22023';
  end if;
  if (select count(*) from public.health_score_professor_v3_snapshot_metricas m where m.snapshot_id=any(v_clones))<>702
     or exists(
      select 1 from public.health_score_professor_v3_snapshots s
      join public.health_score_professor_v3_snapshot_metricas o on o.snapshot_id=s.snapshot_anterior_id
      left join public.health_score_professor_v3_snapshot_metricas n on n.snapshot_id=s.id and n.metrica=o.metrica
      where s.id=any(v_clones)
        and (to_jsonb(n)-array['id','snapshot_id']) is distinct from (to_jsonb(o)-array['id','snapshot_id'])
     ) then
    raise exception 'COORDENACAO_D30_702_METRICAS_DIVERGENTES' using errcode='22023';
  end if;
  if v_old_snapshot_evidence is distinct from (
      select jsonb_object_agg(s.id,to_jsonb(s)-array['estado','invalidado_em','publicavel','ranking_habilitado','motivo_bloqueio'])
      from public.health_score_professor_v3_snapshots s where s.id=any(v_origins))
     or v_old_document_evidence is distinct from (
      select jsonb_object_agg(d.id,to_jsonb(d)) from public.fechamento_mensal_snapshots d where d.id=any(v_old_docs))
     or exists(select 1 from public.health_score_professor_v3_ciclos
       where id=v_ciclo.id and (estado<>'em_fechamento' or publicacao_oficial or ranking_habilitado))
     or exists(select 1 from public.health_score_professor_v3_snapshots
       where periodicidade='ciclo' and ciclo_codigo=v_ciclo.codigo and invalidado_em is null
         and (estado_publicacao='oficial' or publicado or ranking_habilitado)) then
    raise exception 'COORDENACAO_D30_PRESERVACAO_GOVERNANCA_DIVERGENTE' using errcode='22023';
  end if;
  select array_agg(d.id order by d.id) into v_doc_ids
  from public.fechamento_mensal_snapshots d
  where d.payload #>> '{governanca_d30,contrato}'=v_marker;
  if coalesce(cardinality(v_doc_ids),0)<>4 then
    raise exception 'COORDENACAO_D30_REPARO_DOCUMENTAL_PARCIAL' using errcode='22023';
  end if;
  for v_doc_new in
    select * from public.fechamento_mensal_snapshots where id=any(v_doc_ids) order by unidade_id nulls first
  loop
    select * into strict v_doc from public.fechamento_mensal_snapshots
    where id=(v_doc_new.payload#>>'{documento,supersede_id}')::uuid and id=any(v_old_docs);
    select jsonb_agg(case when p->>'estado_publicacao'='oficial'
      then p || '{"estado_publicacao":"parcial","ranking_habilitado":false}'::jsonb
      else p || '{"ranking_habilitado":false}'::jsonb end order by ord)
    into v_teachers from jsonb_array_elements(v_doc.payload->'professores') with ordinality a(p,ord);
    select jsonb_agg(jsonb_build_object('professor_id',s.professor_id,
      'anterior_id',s.snapshot_anterior_id,'id',s.id) order by s.professor_id),count(*)
    into v_mapping,v_n from public.health_score_professor_v3_snapshots s
    where s.id=any(v_clones) and s.unidade_id is not distinct from v_doc.unidade_id;
    if v_doc_new.unidade_id is distinct from v_doc.unidade_id
       or v_doc_new.ano<>v_doc.ano or v_doc_new.mes<>v_doc.mes
       or v_doc_new.dominio<>v_doc.dominio or v_doc_new.escopo<>v_doc.escopo
       or v_doc_new.versao<>v_doc.versao+1 or v_doc_new.status<>'retificado'
       or v_doc_new.payload#>>'{documento,id}' is distinct from v_doc_new.id::text
       or v_doc_new.payload#>>'{documento,versao}' is distinct from v_doc_new.versao::text
       or v_doc_new.payload#>>'{documento,status}' is distinct from 'retificado'
       or v_doc_new.payload_hash is distinct from public.hash_jsonb_canonico(v_doc_new.payload-'documento')
       or v_doc_new.payload#>>'{documento,hash}' is distinct from v_doc_new.payload_hash
       or v_doc_new.payload#>>'{governanca_d30,documento_anterior_hash}' is distinct from v_doc.payload_hash
       or v_doc_new.payload#>'{governanca_d30,snapshots}' is distinct from v_mapping
       or v_doc_new.payload->'professores' is distinct from v_teachers
       or v_doc_new.payload->'periodo' is distinct from ((v_doc.payload->'periodo') ||
          '{"publicacao_oficial":false,"ranking_habilitado":false,"ciclo_estado":"em_fechamento","estado_publicacao":"ciclo_em_acompanhamento"}'::jsonb)
       or v_doc_new.payload->'resumo_equipe' is distinct from
          ((v_doc.payload->'resumo_equipe') || jsonb_build_object('oficiais',0,'parciais',v_n))
       or (v_doc_new.payload-array['documento','periodo','professores','ranking_oficial','resumo_equipe','governanca_d30'])
           is distinct from (v_doc.payload-array['documento','periodo','professores','ranking_oficial','resumo_equipe','governanca_d30'])
       or not (v_doc_new.payload @> '{"periodo":{"publicacao_oficial":false,"ranking_habilitado":false,"ciclo_estado":"em_fechamento","estado_publicacao":"ciclo_em_acompanhamento"},"ranking_oficial":[]}')
       or v_doc_new.payload->'ranking_oficial' <> '[]'::jsonb then
      raise exception 'COORDENACAO_D30_DOCUMENTO_RETIFICADO_DIVERGENTE' using errcode='22023';
    end if;
    if exists (select 1 from public.fechamento_mensal_snapshots d
      where d.ano=v_doc_new.ano and d.mes=v_doc_new.mes and d.dominio=v_doc_new.dominio
        and d.unidade_id is not distinct from v_doc_new.unidade_id and d.versao>v_doc_new.versao) then
      raise exception 'COORDENACAO_D30_RETIFICACAO_SUPERADA' using errcode='22023';
    end if;
    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'id',v_doc_new.id,'anterior_id',v_doc.id,'versao',v_doc_new.versao,
      'hash',v_doc_new.payload_hash,'hash_anterior',v_doc.payload_hash));
  end loop;
  return jsonb_build_object(
    'ok',true,'criado',not v_done,'contrato',v_marker,
    'snapshots',117,'metricas',702,'snapshot_ids',
      (select jsonb_agg(x order by x) from unnest(v_clones) x),
    'documentos',v_documents,'oficial_a_partir_de',v_ciclo.data_fim+30,
    'publicacao_oficial',false,'ranking_habilitado',false);
end;
$regularizar_d30$;

revoke all on function public.regularizar_coordenacao_jun_ago_2026_d30(text)
  from public, anon, authenticated;
grant execute on function public.regularizar_coordenacao_jun_ago_2026_d30(text) to service_role;
comment on function public.regularizar_coordenacao_jun_ago_2026_d30(text) is
  'Privada. Regularização D+30 Jun-Ago: invalida 117 publicações históricas sem apagar publicado; anexa 117/702 cópias diagnósticas e 4 documentos retificados sem recálculo. DDL não invoca esta função; sem automação de fechamento.';

commit;
