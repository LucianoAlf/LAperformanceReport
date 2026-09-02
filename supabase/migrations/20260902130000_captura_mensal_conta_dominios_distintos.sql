-- supabase/migrations/20260902130000_captura_mensal_conta_dominios_distintos.sql
--
-- capturar_relatorios_mensais_canonicos_v1 contava LINHAS onde queria contar
-- DOMINIOS DISTINTOS. Os snapshots sao versionados: uma unidade que ja recebeu
-- uma versao 2 de relatorio_admin_mensal (retificacao) tem 3 linhas mensais --
-- admin v1, admin v2, comercial v1 -- para apenas 2 dominios distintos.
--
-- Como a funcao esperava exatamente 2, ela via 3, concluia "estado parcial" e
-- abortava com SNAPSHOT_MENSAL_PARCIAL. Medido em 02/09/2026 no ensaio do
-- fechamento automatico: as 3 unidades falharam em agosto/2026, competencia que
-- recebeu a versao 2 na correcao manual de 01/09.
--
-- Efeito pratico do defeito: no fluxo normal (competencia nova, dia 1o) nao
-- aparece, porque nao ha versao 2. Aparece no RERUN sobre mes ja retificado --
-- que e justamente o cenario previsto quando o alarme e visto no dia seguinte.
--
-- A correcao e estritamente mais correta, nao mais frouxa: continua detectando
-- o caso real de "so um dos dois dominios foi capturado" (1 dominio distinto),
-- e para de acusar falso positivo quando existe versao legitima a mais.
--
-- Replace guardado em vez de transcricao do corpo: a funcao tem ~90 linhas e a
-- regra do projeto e ler pg_get_functiondef e substituir o trecho, com guarda
-- que aborta se o alvo nao bater exatamente uma vez.

do $mig$
declare
  v_def text;
  v_alvo text := 'select count(*) into v_existentes';
  v_novo text := 'select count(distinct s.dominio) into v_existentes';
  v_ocorrencias integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'capturar_relatorios_mensais_canonicos_v1'
    and pg_get_function_identity_arguments(p.oid) = 'p_ano integer, p_mes integer, p_unidade_id uuid';

  if v_def is null then
    raise exception 'FUNCAO_NAO_ENCONTRADA: capturar_relatorios_mensais_canonicos_v1(integer,integer,uuid)';
  end if;

  v_ocorrencias := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);

  if v_ocorrencias <> 1 then
    raise exception 'ANCORA_INESPERADA: esperava 1 ocorrencia de "%", achei %', v_alvo, v_ocorrencias;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end;
$mig$;

-- Recriar a funcao reabre EXECUTE para anon (ALTER DEFAULT PRIVILEGES do schema
-- public concede a anon e authenticated). O revoke precisa ser nominal.
revoke execute on function public.capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid) from anon;
