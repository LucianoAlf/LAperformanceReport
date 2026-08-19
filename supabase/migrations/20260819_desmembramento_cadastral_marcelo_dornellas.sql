-- DESMEMBRAMENTO CADASTRAL — Marcelo Dornellas Machado (Recreio).
-- Decisão do Alf, 2026-08-19, a partir dos relatos da Diana (ADM) e do Clayton (gerente).
-- Regra canônica criada por este caso: REGRAS-DE-NEGOCIO §3.9.1.
--
-- CONTEXTO
-- Em 2018 a gestão da época (Rose) registrou PAI e FILHA sob o nome da filha, por acordo
-- de nota fiscal. Ficou parecendo que Beatriz Souto Machado fazia 2 cursos (Teclado +
-- Violão), quando o Violão sempre foi do pai, Marcelo. Em 15/08/2026 a equipe desfez o
-- acordo — com aval da Rose e do próprio aluno — e o Emusys criou pessoa (1548) e
-- matrícula (1551) novas para o Marcelo, encerrando a matrícula 194 da Beatriz.
--
-- O PROBLEMA
-- O desmembramento é ajuste CADASTRAL, não evento comercial. Do jeito que entrou, gerou
-- duas distorções em agosto:
--   1. uma MATRÍCULA NOVA falsa (Marcelo entrou no funil como venda do mês, com
--      passaporte zero, derrubando o ticket comercial de R$ 401,54 para R$ 399,97);
--   2. uma EVASÃO falsa (a saída do Violão da Beatriz virou movimentação de evasão,
--      inflando o churn de agosto do Recreio).
--
-- O QUE NÃO É PROBLEMA (verificado, para não se corrigir o que está certo)
--   - Financeiro: valor, curso, unidade e professor não mudaram. O Emusys já virou a
--     titularidade na competência certa — jul e ago faturados no nome da Beatriz
--     (parcelas já emitidas), set/2026 em diante no nome do Marcelo. MRR, faturamento e
--     ticket da base NÃO mudam em nenhum mês.
--   - Não há dupla contagem: a linha da Beatriz-Violão está evadida e a do Marcelo ativa.
--   - Não há histórico financeiro a reprocessar: o espelho de faturas começa em jun/2026.
--   - Alunos ativos já subiu 1 em 15/08 (o Marcelo tem emusys_student_id próprio) e isso
--     está CORRETO — passaram a ser duas pessoas em vez de uma com dois cursos.
--   - Agosto ainda estava ABERTO (último fechamento do Recreio é julho, em 01/08), então
--     esta correção não exigiu retificação de snapshot.
--
-- RESULTADO MEDIDO (Recreio, ago/2026)
--   matrículas novas 14 -> 13 · evasões 24 -> 23 · ticket comercial R$ 399,97 -> R$ 401,54
--   alunos ativos 338 (inalterado) · pagantes 328 (inalterado) · matrículas 423 (inalterado)

-- ── 1. Data de matrícula = início real do curso ─────────────────────────────
-- 14/03/2020 é a data que o próprio Emusys guarda na matrícula 194 (o Violão que ele
-- sempre fez). Corrigir a data tira o Marcelo do funil de agosto automaticamente — o
-- funil recorta por `data_matricula` no período — e devolve os 6 anos de casa dele para
-- o cálculo de permanência e LTV.
-- ⚠️ Seguro e permanente: nem `sync-matriculas-emusys` nem `processar-matricula-emusys`
-- escrevem `data_matricula` em linha existente (conferido no código em 19/08).
update alunos
   set data_matricula = date '2020-03-14',
       updated_at = now()
 where id = 2322
   and emusys_matricula_id = '1551'
   and nome = 'Marcelo Dornellas Machado';

-- ── 2. A "evasão" da Beatriz não deveria existir ───────────────────────────
-- Ela não deixou de estudar nada: o Violão nunca foi dela. Arquivar (e não anular) é o
-- correto pelos dois lados: semanticamente é "não deveria existir", e na prática é o
-- único caminho que a remove das leituras — 25 funções vivas ainda leem
-- `movimentacoes_admin` crua, onde a flag `anulado` não surte efeito.
select public.arquivar_movimentacao_admin(
  3623,
  'Desmembramento cadastral (Alf, 19/08/2026): o Violao sempre foi do pai, Marcelo Dornellas Machado, registrado sob o nome da filha por acordo de nota fiscal de 2018. A separacao das matriculas nao e evasao — a aluna nao deixou de estudar nada. Ver REGRAS-DE-NEGOCIO 3.9.1.'
);
