-- ============================================================================
-- 2026-09-03 — Cerimônia: retirar snapshot do roster do ciclo (excedente)
-- ============================================================================
-- Contexto: fechar_health_score_professor_v3_ciclo recusa o fechamento oficial
-- quando existem snapshots de ciclo de professores FORA do roster ativo
-- (saíram/mesclaram/desvinculados da unidade no Emusys). Não existia forma
-- governada de resolver — e o trigger imutável não permite update direto sem a
-- chave de sessão controlada nem transição arbitrária de estado.
--
-- O que a cerimônia faz, por projeto:
--   - só snapshots periodicidade='ciclo' com estado_publicacao 'parcial' ou
--     'sem_base' (os dois estados provisórios que entram no retrato do roster);
--   - NÃO apaga nada nem mexe em score/métricas: marca estado_publicacao=
--     'em_andamento' (sai do retrato oficial e dos candidatos do fechamento),
--     publicavel/score_exibivel/ranking_habilitado=false e grava o motivo.
--   - o snapshot segue consultável para auditoria histórica.
--   - quem chama: ator gerenciador (permissão professores.editar) ou
--     service_role/postgres (automação).
-- ============================================================================

create or replace function retirar_do_roster_health_score_v3_ciclo(
  p_ciclo_codigo  text,
  p_professor_id  integer,
  p_unidade_id    uuid,          -- null = linha consolidada
  p_motivo        text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_afetados integer;
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

  if nullif(btrim(coalesce(p_motivo,'')), '') is null then
    raise exception 'retirar_do_roster: motivo obrigatorio';
  end if;

  -- chave de mutação controlada: exigida pelo trigger imutável
  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);

  update public.health_score_professor_v3_snapshots s
  set estado_publicacao = 'em_andamento',
      publicavel = false,
      score_exibivel = false,
      ranking_habilitado = false,
      motivo_bloqueio = 'roster_excedente_no_fechamento_do_ciclo: ' || btrim(p_motivo)
  where s.periodicidade = 'ciclo'
    and s.ciclo_codigo = p_ciclo_codigo
    and s.professor_id = p_professor_id
    and s.unidade_id is not distinct from p_unidade_id
    and s.estado_publicacao in ('parcial', 'sem_base');

  get diagnostics v_afetados = row_count;

  return jsonb_build_object(
    'ok', v_afetados > 0,
    'ciclo_codigo', p_ciclo_codigo,
    'professor_id', p_professor_id,
    'unidade_id', p_unidade_id,
    'snapshots_retirados', v_afetados
  );
end;
$$;

comment on function retirar_do_roster_health_score_v3_ciclo(text, integer, uuid, text) is
  'Cerimônia: tira do retrato oficial do ciclo snapshots de professor fora do roster ativo. '
  'Nunca apaga; marca em_andamento + motivo auditável. Pré-requisito do fechamento oficial do ciclo.';

grant execute on function retirar_do_roster_health_score_v3_ciclo(text, integer, uuid, text)
  to authenticated, service_role;
