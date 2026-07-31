# Plano de implementacao: relatorio administrativo canonico

> Executar com TDD e manter automatico e botao no mesmo produtor de texto.

**Objetivo:** corrigir os KPIs administrativos de pessoa/matricula/trancamento e eliminar a duplicacao entre os relatorios automatico e manual.

**Arquitetura:** uma migracao aditiva fornece KPIs por pessoa Emusys e detalhes de trancamento por matricula; a Edge Function monta o unico texto diario; o frontend solicita esse texto em `dry_run` autenticado. O webhook materializa melhor a identidade para novas matriculas.

---

## Tarefa 1: Fixar os contratos em testes vermelhos

**Arquivos:**

- Criar: `tests/relatorioAdminCanonicoMulticursoTrancamento.test.mjs`
- Criar: `supabase/functions/_shared/relatorio-admin-canonico.test.ts`

1. Escrever testes de contrato que exijam identidade Emusys, adicionais independentes de `tipo_codigo`, distribuicao exata 2/3/4+, trancamento por matricula e ACL.
2. Escrever teste que exija `dry_run` autenticado com `data_referencia` e uso pelo frontend.
3. Escrever testes puros do texto de multicurso e da lista/faixas de trancamento.
4. Rodar as duas suites e confirmar que falham pelas ausencias esperadas.

## Tarefa 2: Implementar os RPCs canonicos

**Arquivos:**

- Criar: `supabase/migrations/20260731190000_relatorio_admin_canonico_multicurso_trancamentos.sql`

1. Criar `pode_gerar_relatorio_admin_v1(uuid)` com escopo de unidade e permissao administrativa.
2. Substituir `get_kpis_alunos_admin_operacional(uuid, integer, integer)` preservando campos legados e adicionando distribuicao multicurso, matriculas trancadas e cobertura de identidade.
3. Criar `get_trancamentos_admin_operacionais_v1(uuid, date)` protegido e no grao de matricula.
4. Revogar execucao publica/anonima e conceder somente a `authenticated` e `service_role` conforme necessidade.
5. Rodar os testes de contrato ate ficarem verdes.

## Tarefa 3: Extrair formatacao administrativa testavel

**Arquivos:**

- Criar: `supabase/functions/_shared/relatorio-admin-canonico.ts`
- Modificar: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Testar: `supabase/functions/_shared/relatorio-admin-canonico.test.ts`

1. Implementar formatadores puros para o resumo de matriculas e a lista de trancamentos.
2. Integrar os novos campos do RPC e buscar os detalhes protegidos.
3. Adicionar as secoes `PESSOAS POR QUANTIDADE DE CURSOS` e `TRANCAMENTOS ATUAIS`, com os casos mais graves primeiro.
4. Rodar os testes Deno e o `deno check`.

## Tarefa 4: Unificar automatico e botao

**Arquivos:**

- Modificar: `supabase/functions/relatorio-admin-whatsapp/index.ts`
- Modificar: `src/components/App/Administrativo/ModalRelatorio.tsx`
- Testar: `tests/relatorioAdminCanonicoMulticursoTrancamento.test.mjs`

1. Fazer `gerarRelatorioDiario` aceitar data de referencia explicita, mantendo hoje em BRT como padrao do cron.
2. Proteger `modo='dry_run'` com JWT e `pode_gerar_relatorio_admin_v1`.
3. Fazer o botao chamar `relatorio-admin-whatsapp` com `modo='dry_run'`, unidade e data selecionada.
4. Remover o caminho de montagem local do relatorio diario.
5. Rodar os testes de contrato, tipos e build.

## Tarefa 5: Corrigir o ingresso futuro de multicurso

**Arquivos:**

- Modificar: `supabase/functions/processar-matricula-emusys/index.ts`
- Modificar ou criar teste de contrato em `tests/relatorioAdminCanonicoMulticursoTrancamento.test.mjs`

1. Persistir `emusys_student_id` em novas matriculas primarias e adicionais.
2. Resolver `SEGUNDO_CURSO` por codigo para novas matriculas adicionais, sem ID fixo.
3. Confirmar em teste que `is_segundo_curso` continua sendo o sinal estrutural.
4. Rodar teste focado e `deno check`.

## Tarefa 6: Verificacao integral e revisao

**Arquivos:** todos os alterados.

1. Rodar testes Deno focados e existentes da Edge.
2. Rodar testes Node focados e suites administrativas existentes.
3. Rodar `npm run build`, `deno check` e `git diff --check`.
4. Revisar o diff contra as regras aprovadas, especialmente homonimos e ativo + trancado.
5. Registrar resultados e qualquer risco residual; nao fazer push, deploy ou reescrita de dados sem autorizacao especifica.
