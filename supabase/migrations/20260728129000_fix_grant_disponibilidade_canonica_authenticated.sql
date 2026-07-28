-- Corrige o bloqueio de salvamento no cadastro de professor.
--
-- Contexto do bug:
-- A migration 20260728128000_professores_disponibilidade_canonica.sql criou a
-- funcao validadora fn_disponibilidade_professor_canonica_valida(jsonb) e a
-- amarrou na CHECK constraint professores_unidades_disponibilidade_canonica_check.
-- Na mesma migration o EXECUTE foi revogado de public, anon E authenticated,
-- copiando o padrao de hardening usado nas funcoes de materializacao do
-- Health Score V3.
--
-- O problema: expressao de CHECK constraint e avaliada com os privilegios de
-- quem executa o INSERT/UPDATE. Como o frontend grava em professores_unidades
-- com o papel authenticated, qualquer salvamento no modal de professor passou a
-- falhar com:
--   permission denied for function fn_disponibilidade_professor_canonica_valida
--
-- Nao e problema de RLS: as policies de professores_unidades ja liberam
-- select/insert/update/delete para authenticated com qualificador true.
--
-- Correcao: conceder EXECUTE a authenticated, alinhando com a funcao irma
-- public.fn_disponibilidade_professor_valida(jsonb), que ja possui
-- authenticated=X justamente porque tambem e usada em CHECK constraint.
--
-- Seguranca: a funcao e um validador puro (immutable, recebe jsonb, devolve
-- boolean), nao le tabela alguma e nao expoe dado nenhum. Conceder EXECUTE nao
-- afrouxa RLS nem amplia leitura de dados; apenas permite que a constraint seja
-- avaliada. O dominio canonico Segunda-Sabado continua sendo imposto.

begin;

grant execute on function public.fn_disponibilidade_professor_canonica_valida(jsonb)
  to authenticated;

-- anon permanece sem EXECUTE: o cadastro de professor exige sessao autenticada.

commit;
