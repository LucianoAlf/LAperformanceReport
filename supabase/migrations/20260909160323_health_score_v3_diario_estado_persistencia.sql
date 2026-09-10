-- Adapter de persistencia, nao mudanca de regra/comparabilidade/publicacao.
-- O read model pode emitir estado='em_andamento'; a tabela de snapshots usa
-- provisorio/em_maturacao/fechado/invalidado. O materializador generico de
-- 20260802190000 insere provisorio e conserva em_maturacao nos retratos abertos.
-- Aqui adaptamos SOMENTE os dois rotulos abertos conhecidos no INSERT diario.
-- Nao ampliar CHECK, nao fechar/publicar, nao reescrever fotografias existentes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $adapter_estado_persistencia$
declare
  v_oid regprocedure := to_regprocedure(
    'public.materializar_health_score_professor_v3_escopo_diario(date,text,text,uuid)'
  );
  v_definicao text;
  v_resultado text;
  v_antigo constant text := 'v_linha.estado, v_linha.config_id, v_linha.config_versao,';
  v_novo constant text := $novo$case when v_linha.estado in ('em_andamento', 'ciclo_em_acompanhamento')
        then 'provisorio' else v_linha.estado end,
      v_linha.config_id, v_linha.config_versao,$novo$;
  v_ocorrencias_antigo integer;
  v_ocorrencias_novo integer;
begin
  if v_oid is null then
    raise exception 'HEALTH_SCORE_V3_ESTADO_PERSISTENCIA_MATERIALIZADOR_INESPERADO';
  end if;

  select pg_get_functiondef(v_oid) into v_definicao;
  if position('insert into public.health_score_professor_v3_snapshots (' in v_definicao) = 0
     or position('insert into public.health_score_professor_v3_snapshot_metricas (' in v_definicao) = 0
     or position('get_health_score_professor_v3_performance' in v_definicao) = 0
     or position('presenca_ciclo_em_acompanhamento' in v_definicao) = 0
     or position('v_linha.ciclo_codigo, v_linha.estado_publicacao,' in v_definicao) = 0
     or position('v_linha.score_exibivel, v_linha.ranking_habilitado' in v_definicao) = 0 then
    raise exception 'HEALTH_SCORE_V3_ESTADO_PERSISTENCIA_CORPO_INESPERADO';
  end if;

  v_ocorrencias_antigo := (length(v_definicao) - length(replace(v_definicao, v_antigo, '')))
    / length(v_antigo);
  v_ocorrencias_novo := (length(v_definicao) - length(replace(v_definicao, v_novo, '')))
    / length(v_novo);
  if v_ocorrencias_antigo = 0 and v_ocorrencias_novo = 1 then
    return; -- Replay idempotente, sem redefinicao nem alteracao de ACL.
  end if;
  if v_ocorrencias_antigo <> 1 or v_ocorrencias_novo <> 0 then
    raise exception 'HEALTH_SCORE_V3_ESTADO_PERSISTENCIA_ANCORA_INESPERADA';
  end if;

  -- Preserva o corpo vivo completo, incluindo captura preparada, locks,
  -- completude, configuracao, revisoes, presenca do ciclo, scores e metricas.
  -- Em_maturacao e provisorio atravessam intactos. Estados desconhecidos
  -- continuam sujeitos ao CHECK original, sem coercao generica silenciosa.
  v_resultado := replace(v_definicao, v_antigo, v_novo);
  execute v_resultado;
  if pg_get_functiondef(v_oid) is distinct from v_resultado then
    raise exception 'HEALTH_SCORE_V3_ESTADO_PERSISTENCIA_POS_CONDICAO_INESPERADA';
  end if;
end;
$adapter_estado_persistencia$;

-- CREATE OR REPLACE a partir de pg_get_functiondef conserva assinatura,
-- SECURITY DEFINER, search_path, owner e ACL. Nenhum grant novo e nenhum cron.
commit;
