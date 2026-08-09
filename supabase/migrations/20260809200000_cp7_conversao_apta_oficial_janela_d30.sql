-- CP7 — Restaura a flag `apta_oficial` da conversao no ciclo, com a janela D+30.
--
-- CONTEXTO
-- `get_hs_prof_v3_conversao_ciclo_base_20260803` (reescrita de 03/08) nao emite a chave
-- `apta_oficial`. O filtro de elegibilidade de `fechar_health_score_professor_v3_ciclo` faz
-- `coalesce((detalhes->>'apta_oficial')::boolean, false) is not true`, ou seja **ausencia da
-- chave conta como reprovacao** — 27 professores com nota bloqueando o fechamento, sem
-- nenhum motivo legivel.
--
-- REGRA RESTAURADA
-- Traducao fiel da implementacao anterior (`get_health_score_prof_v3_metricas_base_20260728_c95`)
-- para o vocabulario novo. A janela D+30 foi homologada pelo Alf em 09/08/2026:
--   `current_date >= periodo_fim + 30` — uma experimental ainda vira matricula em ate 30 dias,
--   entao medir a conversao antes disso pune quem deu experimental no fim do ciclo.
--   Para o ciclo 2026-JUN-AGO (fim 31/08) isso significa **30/09**, nao 01/09.
--   `experimentais >= 3` — amostra minima, igual a regra antiga.
--   `sem_pessoa_canonica = 0` — equivalente ao `sem_identidade = 0` antigo. Sem identidade
--   resolvida nao da para creditar a matricula, entao o numerador fica subestimado.
--
-- ⚠️ ISTO NAO DESTRAVA O FECHAMENTO, E ISSO E INFORMACAO, NAO EFEITO COLATERAL.
-- Medido em 09/08 sobre os 43 professores do ciclo: com a janela cumprida, **zero** passariam,
-- porque os 27 com amostra suficiente tem TODOS `experimentais_sem_pessoa_canonica > 0` —
-- de 25% a 87,5% das experimentais de cada um. No agregado, **99 de 182 experimentais do
-- ciclo (54%) estao sem pessoa canonica resolvida**.
-- Antes desta migration o bloqueio existia igual, so que mudo: sem chave e sem motivo. Agora
-- ele fica legivel e diagnosticavel.
--
-- ⚠️ CONTRADICAO NAO RESOLVIDA AQUI (ver checkpoint vivo): esta mesma funcao marca
-- `fora_do_score: true` e `provisorio_ciclo: true` para o ciclo 2026-JUN-AGO, com motivo
-- 'aguardando calibracao das escalas antes de pontuar'. Mas o estagio posterior
-- (`health-score-professor-v3-nota-diagnostica-1`) sobrescreve para `fora_do_score: false` e
-- da peso 16,67% (15% renormalizado). Ou seja, a conversao ESTA pontuando o score do ciclo
-- apesar de a propria funcao dizer que nao deveria, e apesar dos 54% sem identidade.
-- Resolver isso muda a nota exibida de todos os professores — decisao do Alf, fora do escopo
-- desta migration.
--
-- ⚠️ Migration nao idempotente: `replace()` sobre o corpo vigente com guarda de unicidade.
-- Rodar duas vezes falha alto em vez de corromper.

do $fix$
declare
  v_def text;
  v_old text;
  v_new text;
  v_n integer;
begin
  v_def := pg_get_functiondef(
    'public.get_hs_prof_v3_conversao_ciclo_base_20260803(date,uuid)'::regprocedure
  );

  v_old := E'      ''fora_do_score'', true,\n'
        || E'      ''provisorio_ciclo'', v_codigo = ''2026-JUN-AGO''\n'
        || E'    ) as detalhes';

  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / nullif(length(v_old), 0);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'guarda: trecho alvo encontrado % vezes (esperado 1)', coalesce(v_n, 0);
  end if;

  v_new := E'      ''fora_do_score'', true,\n'
        || E'      ''provisorio_ciclo'', v_codigo = ''2026-JUN-AGO'',\n'
        -- CP7: janela D+30 homologada em 09/08/2026 + amostra minima + identidade resolvida.
        || E'      ''apta_oficial'', current_date >= v_fim_periodo + 30\n'
        || E'        and coalesce(e.experimentais, 0) >= 3\n'
        || E'        and coalesce(e.sem_pessoa_canonica, 0) = 0\n'
        || E'    ) as detalhes';

  execute replace(v_def, v_old, v_new);
end
$fix$;
