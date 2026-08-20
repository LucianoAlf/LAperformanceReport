-- Correção imediata da migration 20260820002814: o UNION quebrou por tipo.
--
-- `vw_aluno_estado_operacional_canonico.emusys_matricula_id` / `emusys_aluno_id` são
-- **bigint**; `alunos.emusys_matricula_id` / `emusys_student_id` são **text**. O ramo do
-- espelho precisa do mesmo `::text` do ramo de fallback, senão o Postgres recusa o UNION
-- (`UNION types bigint and text cannot be matched`) e a leitura de faturas inteira falha —
-- a página de Faturas ficou fora do ar entre a aplicação de uma migration e outra.
--
-- ⚠️ Lição: ao unir espelho e cadastro, conferir o tipo dos identificadores nos DOIS lados
-- antes de aplicar. O mesmo identificador do Emusys aparece como bigint em umas tabelas e
-- text em outras ao longo do schema.
--
-- O arquivo 20260820002814 já foi versionado com o cast, então em base nova ele nasce
-- correto e esta migration vira no-op (o replace não encontra a âncora sem cast).

do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_canonica_20260817';

  v_antigo := '      select v.unidade_id, v.emusys_matricula_id, v.emusys_aluno_id, v.aluno_id, v.status_emusys';
  v_novo   := '      select v.unidade_id, v.emusys_matricula_id::text, v.emusys_aluno_id::text, v.aluno_id, v.status_emusys';

  if position(v_antigo in v_def) = 0 then
    raise notice 'ramo do espelho ja esta com cast — nada a fazer';
    return;
  end if;

  v_new := replace(v_def, v_antigo, v_novo);
  if v_new = v_def then
    raise exception 'replace nao alterou nada';
  end if;

  execute v_new;
end $mig$;
