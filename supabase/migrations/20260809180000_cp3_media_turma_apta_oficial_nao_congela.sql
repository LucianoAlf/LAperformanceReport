-- CP3 — `media_turma` nunca virava `apta_oficial` num snapshot de ciclo.
--
-- SINTOMA
-- Snapshot do ciclo 2026-JUN-AGO, Campo Grande: `numero_alunos` com `estado_base='ok'` sai
-- `apta_oficial = true` (54 linhas), mas `media_turma` com o MESMO `estado_base='ok'` e nota
-- presente em todas sai `apta_oficial = false` (58 linhas). Como
-- `fechar_health_score_professor_v3_ciclo` exige que toda metrica COM NOTA seja apta, isso
-- travava o fechamento oficial do ciclo inteiro — em 01/09 produziria ~zero oficiais.
--
-- CAUSA
-- A materializacao roda em estagios sucessivos, cada um reescrevendo a linha da metrica e
-- carimbando sua `regra_versao`:
--   1. health-score-professor-v3-metricas-segmentadas-agregadas-1
--   2. health-score-professor-v3-media-turma-pontuaveis-1     (media_turma)
--      health-score-professor-v3-carteira-disponibilidade-1   (numero_alunos)
--   3. health-score-professor-v3-nota-diagnostica-1
--
-- No estagio 2, o ramo de `numero_alunos` **substitui** o detalhes inteiro
-- (`coalesce(v_numero.detalhes,'{}') || …`), entao `apta_oficial` e recalculado. Ja o ramo de
-- `media_turma` **preserva** o detalhes do estagio 1 (`coalesce(sm.detalhes,'{}') || …`) e
-- acrescenta so 4 chaves. Ele corrige `estado_base` para `'ok'`, calcula `publicavel`,
-- `confianca` e a nota — mas **carrega o `apta_oficial` congelado** de quando o estado ainda
-- era `segmentacao_incompleta`. O estagio 3 preserva o detalhes, entao o valor velho sobrevive
-- ate o fim.
--
-- Ou seja: a flag derivada ficou obsoleta em relacao aos proprios campos que o estagio
-- acabou de corrigir. **A regra nao muda** — continua
-- `ciclo AND base ok AND ha nota`; passa apenas a ser avaliada com os valores atualizados.
-- A expressao usada aqui e literalmente a mesma que o estagio ja calcula para `publicavel`,
-- mais a condicao de ciclo.
--
-- EFEITO MEDIDO (transacao com rollback, Campo Grande, ciclo 2026-JUN-AGO)
--   antes: media_turma `estado_base='ok'` -> 29 com nota, **0 aptas**
--   depois: media_turma `estado_base='ok'` -> 29 com nota, **29 aptas**
--           media_turma `sem_base_sem_turmas` -> 6 linhas, seguem `false` (correto)
--
-- ⚠️ ISTO MUDA QUEM ENTRA NO FECHAMENTO OFICIAL E NO RANKING de 01/09. Nao ha efeito visivel
-- hoje: `apta_oficial` so e consumida por `fechar_health_score_professor_v3_ciclo`, que recusa
-- enquanto `current_date < data_fim` (31/08). Ha ~3 semanas de folga para revisao e reversao.
--
-- ⚠️ Migration NAO idempotente por construcao: aplica `replace()` sobre o corpo vigente com
-- guarda de unicidade. Rodar duas vezes falha alto (`guarda: trecho alvo encontrado 0 vezes`)
-- em vez de corromper. Preferido a transcrever 17 KB de funcao a mao.

do $fix$
declare
  v_def text;
  v_old text;
  v_new text;
  v_n integer;
begin
  v_def := pg_get_functiondef(
    'public.materializar_health_score_professor_v3_periodo_impl_pre_nota_di(date,text,uuid,integer)'::regprocedure
  );

  v_old := E'              ''normalizacao'', ''segmentada_unidade_curso_modalidade'',\n'
        || E'              ''snapshot_base_id'', v_snapshot_base.id\n'
        || E'            )';

  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / nullif(length(v_old), 0);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'guarda: trecho alvo encontrado % vezes (esperado 1)', coalesce(v_n, 0);
  end if;

  v_new := E'              ''normalizacao'', ''segmentada_unidade_curso_modalidade'',\n'
        || E'              ''snapshot_base_id'', v_snapshot_base.id,\n'
        -- CP3: recalcula a flag com os campos ja corrigidos neste estagio, em vez de herdar
        -- o valor do estagio anterior. Mesma expressao usada acima para `publicavel`.
        || E'              ''apta_oficial'', p_periodicidade = ''ciclo''\n'
        || E'                and coalesce(v_media.segmentos_pontuaveis, 0) > 0\n'
        || E'                and coalesce(v_media.turmas, 0) > 0\n'
        || E'                and not coalesce(v_media.tem_bloqueio, false)\n'
        || E'                and coalesce(v_media.denominador, 0) > 0\n'
        || E'            )';

  execute replace(v_def, v_old, v_new);
end
$fix$;
