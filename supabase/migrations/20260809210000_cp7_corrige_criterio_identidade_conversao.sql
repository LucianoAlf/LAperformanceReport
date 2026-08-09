-- CP7 (correcao) — o criterio de identidade do `apta_oficial` da conversao estava errado.
--
-- A migration 20260809200000 traduziu o `sem_identidade = 0` da regra antiga para
-- `sem_pessoa_canonica = 0`. **A traducao esta errada**, e o erro e conceitual:
-- `experimentais_sem_pessoa_canonica` conta as experimentais cujo participante **nao tem
-- registro de aluno** — que e exatamente o estado normal de quem fez a experimental e **nao
-- matriculou**. Exigir zero equivale a exigir **100% de conversao** para a metrica virar
-- oficial. Nenhum professor passaria, nunca.
--
-- Medido em 09/08 no ciclo 2026-JUN-AGO: 196 experimentais, 106 sem pessoa canonica, das
-- quais 92 tem lead resolvido. Dessas 92, apenas **1** declarou conversao sem matricula
-- canonica — as outras 91 simplesmente nao converteram. Ou seja, o "buraco de identidade"
-- de 54% nao existe: e o denominador fazendo o seu trabalho.
--
-- O contador correto ja existe na propria funcao e mede o que interessa:
-- `conversoes_declaradas_sem_matricula_canonica` = lead que **declarou conversao** mas cuja
-- matricula nao foi resolvida canonicamente. Esse sim e furo de dado, e vale **1** hoje.
--
-- EFEITO (medido antes de aplicar, sobre os 43 professores do ciclo):
--   criterio errado (`sem_pessoa_canonica = 0`)                  ->  0 de 27 passariam
--   criterio correto (`conversoes_declaradas... = 0`)            -> 26 de 27 passariam
-- A janela D+30 continua valendo, entao nada fica apto antes de 30/09; o que muda e que
-- em 30/09 a metrica passa a poder fechar, em vez de travar para sempre.
--
-- ⚠️ Migration nao idempotente: `replace()` com guarda de unicidade.

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

  v_old := E'        and coalesce(e.sem_pessoa_canonica, 0) = 0';

  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / nullif(length(v_old), 0);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'guarda: trecho alvo encontrado % vezes (esperado 1)', coalesce(v_n, 0);
  end if;

  -- Furo de dado real: conversao declarada cuja matricula nao resolveu canonicamente.
  v_new := E'        and coalesce(e.conversoes_declaradas_sem_matricula_canonica, 0) = 0';

  execute replace(v_def, v_old, v_new);
end
$fix$;
