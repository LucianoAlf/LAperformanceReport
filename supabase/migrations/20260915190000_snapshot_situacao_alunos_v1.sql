-- Snapshot de get_situacao_alunos_v1: pré-cálculo por unidade, leitura instantânea
--
-- Problema: cada chamada recalcula a unidade inteira. Com 12 concorrentes,
-- o banco satura e todas dão statement timeout (pior 10,4 s). Índices e
-- work_mem resolveram a chamada isolada mas não a concorrência.
--
-- Solução: pré-calcular a situação por unidade em tabela de snapshot,
-- atualizada em intervalo curto (5 min). A RPC só LÊ o snapshot —
-- 12 concorrentes viram SELECTs simples, zero contenção de CPU.
--
-- Contrato de saída: inalterado (mesmas colunas, ordem, status,
-- assinados_todos). reconciliado_em honesto sobre idade do dado.

-- ============================================================
-- 1. Tabela de snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS public.situacao_alunos_snapshot (
  unidade_id uuid NOT NULL,
  referencia date NOT NULL,
  pessoa_chave text NOT NULL,
  aluno_id_canonico integer,
  aluno_ids_locais integer[],
  nome text,
  classificacao text,
  status_operacional text,
  matriculas_ativas integer,
  cursos text[],
  entrou_em date,
  matricula_recente_em date,
  responsavel_nome text,
  professores text[],
  aulas_resumo text[],
  anamnese_preenchida boolean,
  anamnese_em date,
  anamnese_tipo text,
  anamnese_flag_sem_registro boolean,
  anamnese_orfa_candidata_id integer,
  anamnese_orfa_match text,
  tem_instagram boolean,
  instagram_nao_possui boolean,
  tem_telefone boolean,
  tem_responsavel boolean,
  tem_foto boolean,
  tem_data_contrato boolean,
  contrato_vencido boolean,
  cadastro_completo boolean,
  cadastro_faltando text[],
  presenca_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  presenca_taxa_geral numeric,
  presenca_confianca text,
  presenca_regra_versao text,
  ultima_aula_em date,
  dias_desde_ultima_aula integer,
  inadimplente boolean,
  faturas_vencidas_abertas integer,
  em_aviso_previo boolean,
  aviso_previo_mes_saida date,
  proxima_renovacao_em date,
  vence_em_30d boolean,
  na_comunidade_wa boolean,
  comunidade_status text,
  comunidade_capturado_em timestamp with time zone,
  pendencias text[],
  fonte text,
  regra_versao text,
  contrato_assinatura_status text,
  contratos_assinados_todos boolean,
  contratos_relevantes integer,
  contratos_assinados integer,
  contratos_nao_assinados integer,
  contratos_sem_contrato integer,
  contratos_nao_verificados integer,
  contrato_status_observado_em timestamp with time zone,
  contrato_reconciliado_em timestamp with time zone,
  contrato_dado_fresco boolean,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, referencia, pessoa_chave)
);

CREATE INDEX IF NOT EXISTS idx_situacao_snapshot_unidade_ref
  ON public.situacao_alunos_snapshot (unidade_id, referencia);

ALTER TABLE public.situacao_alunos_snapshot ENABLE ROW LEVEL SECURITY;
-- service_role bypassa RLS; a RPC é SECURITY DEFINER com checagem de permissão.

-- ============================================================
-- 2. Função _compute (cálculo completo = RPC atual otimizada)
--    Renomeada para evitar recursão com a nova RPC de leitura.
-- ============================================================

CREATE OR REPLACE FUNCTION public._compute_situacao_alunos_v1(
  p_unidade_id uuid, p_referencia date DEFAULT CURRENT_DATE,
  p_apenas_pendentes boolean DEFAULT false
)
RETURNS TABLE(
  pessoa_chave text, aluno_id_canonico integer, aluno_ids_locais integer[],
  nome text, unidade_id uuid, classificacao text, status_operacional text,
  matriculas_ativas integer, cursos text[], entrou_em date, matricula_recente_em date,
  responsavel_nome text, professores text[], aulas_resumo text[],
  anamnese_preenchida boolean, anamnese_em date, anamnese_tipo text,
  anamnese_flag_sem_registro boolean, anamnese_orfa_candidata_id integer, anamnese_orfa_match text,
  tem_instagram boolean, instagram_nao_possui boolean, tem_telefone boolean,
  tem_responsavel boolean, tem_foto boolean, tem_data_contrato boolean,
  contrato_vencido boolean, cadastro_completo boolean, cadastro_faltando text[],
  presenca_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer,
  chamadas_indeterminadas integer, presenca_taxa_geral numeric, presenca_confianca text,
  presenca_regra_versao text, ultima_aula_em date, dias_desde_ultima_aula integer,
  inadimplente boolean, faturas_vencidas_abertas integer, em_aviso_previo boolean,
  aviso_previo_mes_saida date, proxima_renovacao_em date, vence_em_30d boolean,
  na_comunidade_wa boolean, comunidade_status text, comunidade_capturado_em timestamp with time zone,
  pendencias text[], fonte text, regra_versao text, contrato_assinatura_status text,
  contratos_assinados_todos boolean, contratos_relevantes integer, contratos_assinados integer,
  contratos_nao_assinados integer, contratos_sem_contrato integer, contratos_nao_verificados integer,
  contrato_status_observado_em timestamp with time zone, contrato_reconciliado_em timestamp with time zone,
  contrato_dado_fresco boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET work_mem TO '24MB'
AS $function$
  with antigos as materialized (
    select * from public.get_situacao_alunos_sem_contrato_assinado_v1(p_unidade_id, p_referencia, false)
  ),
  sync_fresco as (
    select max(e.completed_at) as reconciliado_em
    from public.contrato_assinatura_sync_execucoes e
    where e.unidade_id = p_unidade_id and e.status = 'succeeded'
      and (e.completed_at at time zone 'America/Sao_Paulo')::date = p_referencia
  ),
  matriculas_locais_relevantes as materialized (
    select o.pessoa_chave, a.id as aluno_id, nullif(btrim(a.emusys_matricula_id::text), '') as emusys_matricula_id
    from antigos o
    cross join lateral unnest(o.aluno_ids_locais) aid(aluno_id)
    join public.alunos a on a.id = aid.aluno_id and a.arquivado_em is null
    join public.vw_alunos_estado_operacional_v131 eo on eo.aluno_id = a.id and eo.entra_base_ativa = true
    left join public.cursos c on c.id = a.curso_id
    where not coalesce(c.is_projeto_banda, false)
  ),
  matriculas_jornada_relevantes as materialized (
    select o.pessoa_chave, min(j.aluno_id)::integer as aluno_id, j.emusys_matricula_id::text as emusys_matricula_id
    from antigos o
    join public.aluno_jornada_matricula_disciplina j on j.unidade_id = p_unidade_id and j.aluno_id = any(o.aluno_ids_locais)
    left join public.cursos c on c.id = j.curso_id
    where j.emusys_matricula_id is not null and coalesce(nullif(btrim(j.status_emusys), ''), j.status_matricula) = 'ativa'
    group by o.pessoa_chave, j.emusys_matricula_id
    having bool_or(not coalesce(c.is_projeto_banda, false))
  ),
  cobertura_identidade as (
    select o.pessoa_chave, count(distinct ml.aluno_id)::integer as matriculas_locais,
           count(distinct mj.emusys_matricula_id)::integer as matriculas_jornada
    from antigos o
    left join matriculas_locais_relevantes ml on ml.pessoa_chave = o.pessoa_chave
    left join matriculas_jornada_relevantes mj on mj.pessoa_chave = o.pessoa_chave
    group by o.pessoa_chave
  ),
  matriculas_escolhidas as (
    select ml.pessoa_chave, ml.aluno_id, ml.emusys_matricula_id
    from matriculas_locais_relevantes ml
    join cobertura_identidade ci on ci.pessoa_chave = ml.pessoa_chave
    where ci.matriculas_locais <> ci.matriculas_jornada or ci.matriculas_locais = 0
    union all
    select mj.pessoa_chave, mj.aluno_id, mj.emusys_matricula_id
    from matriculas_jornada_relevantes mj
    join cobertura_identidade ci on ci.pessoa_chave = mj.pessoa_chave
    where ci.matriculas_locais = ci.matriculas_jornada and ci.matriculas_locais > 0
  ),
  matriculas_relevantes as (
    select me.pessoa_chave, me.aluno_id, me.emusys_matricula_id,
           obs.id as observacao_id, obs.contrato_emusys_id, obs.contrato_assinado, obs.contrato_status_observado_em
    from matriculas_escolhidas me
    left join lateral (
      select ace.id, ace.contrato_emusys_id, ace.contrato_assinado, ace.contrato_status_observado_em
      from public.aluno_contratos_emusys ace
      where ace.unidade_id = p_unidade_id and ace.emusys_matricula_id = me.emusys_matricula_id
      order by ace.contrato_status_observado_em desc, ace.updated_at desc, ace.id desc
      limit 1
    ) obs on me.emusys_matricula_id is not null
  ),
  stats as (
    select o.pessoa_chave, count(m.aluno_id)::integer as contratos_relevantes,
           count(*) filter (where m.contrato_assinado is true)::integer as contratos_assinados,
           bool_and(m.contrato_assinado is true) filter (where m.aluno_id is not null) as todas_assinadas,
           count(*) filter (where m.contrato_assinado is false)::integer as contratos_nao_assinados,
           count(*) filter (where m.observacao_id is not null and m.contrato_emusys_id is null)::integer as contratos_sem_contrato,
           count(*) filter (where m.aluno_id is not null and (m.emusys_matricula_id is null or m.observacao_id is null))::integer as contratos_nao_verificados,
           min(m.contrato_status_observado_em) as observado_em, sf.reconciliado_em
    from antigos o
    left join matriculas_relevantes m on m.pessoa_chave = o.pessoa_chave
    cross join sync_fresco sf
    group by o.pessoa_chave, sf.reconciliado_em
  ),
  classificados as (
    select s.*,
      case when s.contratos_relevantes = 0 then 'dispensado'
           when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then 'nao_verificado'
           when s.contratos_sem_contrato > 0 then 'sem_contrato'
           when s.contratos_nao_assinados > 0 then 'nao_assinado'
           when s.contratos_assinados = s.contratos_relevantes then 'assinado'
           else 'nao_verificado' end as status,
      case when s.contratos_relevantes = 0 then null
           when s.reconciliado_em is null or s.contratos_nao_verificados > 0 then null
           else coalesce(s.todas_assinadas, false) and s.contratos_assinados = s.contratos_relevantes
      end as assinados_todos
    from stats s
  )
  select o.*, c.status, c.assinados_todos, c.contratos_relevantes, c.contratos_assinados,
         c.contratos_nao_assinados, c.contratos_sem_contrato, c.contratos_nao_verificados,
         c.observado_em, c.reconciliado_em,
         (c.reconciliado_em is not null and c.contratos_nao_verificados = 0)
  from antigos o
  join classificados c on c.pessoa_chave = o.pessoa_chave
  order by o.nome;
$function$;

-- ============================================================
-- 3. Função de refresh (chama _compute e faz upsert no snapshot)
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_situacao_alunos_snapshot(
  p_unidade_id uuid, p_referencia date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  -- Só service_role ou postgres podem rodar o refresh
  if current_user not in ('service_role', 'postgres')
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'papel nao autorizado para refresh de snapshot' using errcode = '42501';
  end if;

  -- Upsert atômico: insere todas as linhas calculadas, substituindo as antigas
  delete from public.situacao_alunos_snapshot
  where unidade_id = p_unidade_id and referencia = p_referencia;

  insert into public.situacao_alunos_snapshot (
    unidade_id, referencia, pessoa_chave, aluno_id_canonico, aluno_ids_locais,
    nome, classificacao, status_operacional, matriculas_ativas, cursos,
    entrou_em, matricula_recente_em, responsavel_nome, professores, aulas_resumo,
    anamnese_preenchida, anamnese_em, anamnese_tipo, anamnese_flag_sem_registro,
    anamnese_orfa_candidata_id, anamnese_orfa_match, tem_instagram, instagram_nao_possui,
    tem_telefone, tem_responsavel, tem_foto, tem_data_contrato, contrato_vencido,
    cadastro_completo, cadastro_faltando, presenca_confirmadas, faltas_confirmadas,
    faltas_provaveis, chamadas_indeterminadas, presenca_taxa_geral, presenca_confianca,
    presenca_regra_versao, ultima_aula_em, dias_desde_ultima_aula, inadimplente,
    faturas_vencidas_abertas, em_aviso_previo, aviso_previo_mes_saida, proxima_renovacao_em,
    vence_em_30d, na_comunidade_wa, comunidade_status, comunidade_capturado_em,
    pendencias, fonte, regra_versao, contrato_assinatura_status, contratos_assinados_todos,
    contratos_relevantes, contratos_assinados, contratos_nao_assinados, contratos_sem_contrato,
    contratos_nao_verificados, contrato_status_observado_em, contrato_reconciliado_em,
    contrato_dado_fresco, atualizado_em
  )
  select p_unidade_id, p_referencia, c.pessoa_chave, c.aluno_id_canonico, c.aluno_ids_locais,
    c.nome, c.classificacao, c.status_operacional, c.matriculas_ativas, c.cursos,
    c.entrou_em, c.matricula_recente_em, c.responsavel_nome, c.professores, c.aulas_resumo,
    c.anamnese_preenchida, c.anamnese_em, c.anamnese_tipo, c.anamnese_flag_sem_registro,
    c.anamnese_orfa_candidata_id, c.anamnese_orfa_match, c.tem_instagram, c.instagram_nao_possui,
    c.tem_telefone, c.tem_responsavel, c.tem_foto, c.tem_data_contrato, c.contrato_vencido,
    c.cadastro_completo, c.cadastro_faltando, c.presenca_confirmadas, c.faltas_confirmadas,
    c.faltas_provaveis, c.chamadas_indeterminadas, c.presenca_taxa_geral, c.presenca_confianca,
    c.presenca_regra_versao, c.ultima_aula_em, c.dias_desde_ultima_aula, c.inadimplente,
    c.faturas_vencidas_abertas, c.em_aviso_previo, c.aviso_previo_mes_saida, c.proxima_renovacao_em,
    c.vence_em_30d, c.na_comunidade_wa, c.comunidade_status, c.comunidade_capturado_em,
    c.pendencias, c.fonte, c.regra_versao, c.contrato_assinatura_status, c.contratos_assinados_todos,
    c.contratos_relevantes, c.contratos_assinados, c.contratos_nao_assinados, c.contratos_sem_contrato,
    c.contratos_nao_verificados, c.contrato_status_observado_em, c.contrato_reconciliado_em,
    c.contrato_dado_fresco, now()
  from public._compute_situacao_alunos_v1(p_unidade_id, p_referencia, false) c;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ============================================================
-- 4. RPC rewrite: lê do snapshot, filtra p_apenas_pendentes
--    Fallback para _compute se snapshot ausente (transição segura)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_situacao_alunos_v1(
  p_unidade_id uuid, p_referencia date DEFAULT CURRENT_DATE, p_apenas_pendentes boolean DEFAULT false
)
RETURNS TABLE(
  pessoa_chave text, aluno_id_canonico integer, aluno_ids_locais integer[],
  nome text, unidade_id uuid, classificacao text, status_operacional text,
  matriculas_ativas integer, cursos text[], entrou_em date, matricula_recente_em date,
  responsavel_nome text, professores text[], aulas_resumo text[],
  anamnese_preenchida boolean, anamnese_em date, anamnese_tipo text,
  anamnese_flag_sem_registro boolean, anamnese_orfa_candidata_id integer, anamnese_orfa_match text,
  tem_instagram boolean, instagram_nao_possui boolean, tem_telefone boolean,
  tem_responsavel boolean, tem_foto boolean, tem_data_contrato boolean,
  contrato_vencido boolean, cadastro_completo boolean, cadastro_faltando text[],
  presenca_confirmadas integer, faltas_confirmadas integer, faltas_provaveis integer,
  chamadas_indeterminadas integer, presenca_taxa_geral numeric, presenca_confianca text,
  presenca_regra_versao text, ultima_aula_em date, dias_desde_ultima_aula integer,
  inadimplente boolean, faturas_vencidas_abertas integer, em_aviso_previo boolean,
  aviso_previo_mes_saida date, proxima_renovacao_em date, vence_em_30d boolean,
  na_comunidade_wa boolean, comunidade_status text, comunidade_capturado_em timestamp with time zone,
  pendencias text[], fonte text, regra_versao text, contrato_assinatura_status text,
  contratos_assinados_todos boolean, contratos_relevantes integer, contratos_assinados integer,
  contratos_nao_assinados integer, contratos_sem_contrato integer, contratos_nao_verificados integer,
  contrato_status_observado_em timestamp with time zone, contrato_reconciliado_em timestamp with time zone,
  contrato_dado_fresco boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_autorizado boolean := false;
  v_tem_snapshot boolean;
begin
  -- Autorização (mesma checagem da core function)
  if current_user in ('service_role', 'sol_acesso_restrito', 'postgres')
     or coalesce(auth.role(), '') = 'service_role' then
    v_autorizado := true;
  else
    begin
      v_autorizado := coalesce(fn_usuario_atual_tem_permissao('alunos.ver', p_unidade_id), false);
    exception when others then
      v_autorizado := false;
    end;
  end if;

  if not v_autorizado then
    raise exception 'papel nao autorizado para consultar situacao de alunos' using errcode = '42501';
  end if;

  -- Verifica se snapshot existe para esta unidade/referencia
  select exists(
    select 1 from public.situacao_alunos_snapshot s
    where s.unidade_id = p_unidade_id and s.referencia = p_referencia
    limit 1
  ) into v_tem_snapshot;

  if v_tem_snapshot then
    -- Caminho quente: lê do snapshot (SELECT simples, zero contenção)
    return query
    select s.pessoa_chave, s.aluno_id_canonico, s.aluno_ids_locais,
           s.nome, s.unidade_id, s.classificacao, s.status_operacional,
           s.matriculas_ativas, s.cursos, s.entrou_em, s.matricula_recente_em,
           s.responsavel_nome, s.professores, s.aulas_resumo,
           s.anamnese_preenchida, s.anamnese_em, s.anamnese_tipo,
           s.anamnese_flag_sem_registro, s.anamnese_orfa_candidata_id, s.anamnese_orfa_match,
           s.tem_instagram, s.instagram_nao_possui, s.tem_telefone,
           s.tem_responsavel, s.tem_foto, s.tem_data_contrato, s.contrato_vencido,
           s.cadastro_completo, s.cadastro_faltando, s.presenca_confirmadas, s.faltas_confirmadas,
           s.faltas_provaveis, s.chamadas_indeterminadas, s.presenca_taxa_geral, s.presenca_confianca,
           s.presenca_regra_versao, s.ultima_aula_em, s.dias_desde_ultima_aula, s.inadimplente,
           s.faturas_vencidas_abertas, s.em_aviso_previo, s.aviso_previo_mes_saida, s.proxima_renovacao_em,
           s.vence_em_30d, s.na_comunidade_wa, s.comunidade_status, s.comunidade_capturado_em,
           s.pendencias, s.fonte, s.regra_versao, s.contrato_assinatura_status, s.contratos_assinados_todos,
           s.contratos_relevantes, s.contratos_assinados, s.contratos_nao_assinados, s.contratos_sem_contrato,
           s.contratos_nao_verificados, s.contrato_status_observado_em, s.contrato_reconciliado_em,
           s.contrato_dado_fresco
    from public.situacao_alunos_snapshot s
    where s.unidade_id = p_unidade_id
      and s.referencia = p_referencia
      and (not p_apenas_pendentes
           or s.cadastro_faltando <> '{}'::text[]
           or s.anamnese_em is null
           or s.na_comunidade_wa = false)
    order by s.nome;
  else
    -- Fallback: cálculo ao vivo (snapshot ausente — primeira chamada ou cron falhou)
    return query
    select * from public._compute_situacao_alunos_v1(p_unidade_id, p_referencia, p_apenas_pendentes);
  end if;
end;
$function$;

-- ============================================================
-- 5. Cron: refresh das 3 unidades a cada 5 minutos
-- ============================================================

-- Unidade CG: 2ec861f6-023f-4d7b-9927-3960ad8c2a92
SELECT cron.schedule(
  'refresh-situacao-snapshot-cg',
  '*/5 * * * *',
  $$select public.refresh_situacao_alunos_snapshot('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, CURRENT_DATE)$$
);

-- Unidade Barra: 368d47f5-2d88-4475-bc14-ba084a9a348e
SELECT cron.schedule(
  'refresh-situacao-snapshot-barra',
  '*/5 * * * *',
  $$select public.refresh_situacao_alunos_snapshot('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, CURRENT_DATE)$$
);

-- Unidade Recreio: 95553e96-971b-4590-a6eb-0201d013c14d
SELECT cron.schedule(
  'refresh-situacao-snapshot-recreio',
  '*/5 * * * *',
  $$select public.refresh_situacao_alunos_snapshot('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, CURRENT_DATE)$$
);

-- ============================================================
-- 6. Populate inicial do snapshot para as 3 unidades
-- ============================================================

SELECT public.refresh_situacao_alunos_snapshot('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, CURRENT_DATE);
SELECT public.refresh_situacao_alunos_snapshot('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, CURRENT_DATE);
SELECT public.refresh_situacao_alunos_snapshot('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, CURRENT_DATE);
