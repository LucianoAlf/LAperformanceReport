-- Reparo estritamente descritivo da configuracao V2. A migracao que ativou a
-- versao gravou as seis metas homologadas, mas omitiu meta_status nos parametros.
-- Pesos, metas, vigencia e snapshots permanecem intocados.

do $$
declare
  v_config_id uuid;
  v_metricas integer;
  v_fechados integer;
  v_invalidos integer;
begin
  select c.id into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.versao = 2
    and c.status = 'ativa';

  if v_config_id is null then
    raise exception 'HEALTH_SCORE_V3_META_REPARO: configuracao ativa versao 2 ausente';
  end if;

  select count(*) into v_metricas
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = v_config_id;

  if v_metricas <> 6 then
    raise exception
      'HEALTH_SCORE_V3_META_REPARO: esperadas 6 metricas, encontradas %',
      v_metricas;
  end if;

  select count(*) into v_invalidos
  from public.health_score_professor_v3_config_metricas m
  where m.config_id = v_config_id
    and (
      (m.metrica = 'retencao' and (m.peso, m.meta) is distinct from (25::numeric, 90::numeric))
      or (m.metrica = 'permanencia' and (m.peso, m.meta) is distinct from (25::numeric, 12::numeric))
      or (m.metrica = 'conversao' and (m.peso, m.meta) is distinct from (15::numeric, 70::numeric))
      or (m.metrica = 'media_turma' and (m.peso, m.meta) is distinct from (15::numeric, 1.44::numeric))
      or (m.metrica = 'numero_alunos' and (m.peso, m.meta) is distinct from (10::numeric, 33::numeric))
      or (m.metrica = 'presenca' and (m.peso, m.meta) is distinct from (10::numeric, 80::numeric))
    );

  if v_invalidos <> 0 then
    raise exception
      'HEALTH_SCORE_V3_META_REPARO: pesos ou metas da versao 2 divergiram da homologacao';
  end if;

  select count(*) into v_fechados
  from public.health_score_professor_v3_snapshots s
  where s.config_id = v_config_id
    and s.estado in ('fechado', 'invalidado');

  if v_fechados <> 0 then
    raise exception
      'HEALTH_SCORE_V3_META_REPARO: configuracao possui % snapshots imutaveis',
      v_fechados;
  end if;

  alter table public.health_score_professor_v3_config_metricas
    disable trigger trg_health_score_professor_v3_config_metrica_imutavel;

  update public.health_score_professor_v3_config_metricas m
  set parametros = m.parametros || jsonb_build_object(
        'meta_status', 'aprovada',
        'meta_reparo', jsonb_build_object(
          'tipo', 'metadado_omitido_na_ativacao_v2',
          'autoridade', 'Alf',
          'decisao_em', '2026-07-19',
          'aplicado_em', now()
        )
      ),
      atualizado_em = now()
  where m.config_id = v_config_id
    and m.meta is not null
    and coalesce(m.parametros->>'meta_status', '') <> 'aprovada';

  alter table public.health_score_professor_v3_config_metricas
    enable trigger trg_health_score_professor_v3_config_metrica_imutavel;
exception
  when others then
    alter table public.health_score_professor_v3_config_metricas
      enable trigger trg_health_score_professor_v3_config_metrica_imutavel;
    raise;
end $$;

comment on table public.health_score_professor_v3_config_metricas is
  'Metricas versionadas do Health Score V3. A V2 recebeu em 19/07/2026 reparo apenas do meta_status omitido; metas e pesos homologados nao foram alterados.';
