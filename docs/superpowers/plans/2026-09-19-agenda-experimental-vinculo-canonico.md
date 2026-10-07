# Agenda experimental — vínculo canônico

> **Para a equipe:** executar este plano por meio de `superpowers:executing-plans`, na branch isolada `fix/agenda-experimental-vinculo-canonico-20260919`.

## Objetivo

Fazer com que toda aula experimental que já tenha vínculo ativo com a aula física do Emusys apareça na Chamada da Agenda, mesmo quando o Emusys tenha convertido o participante de lead para aluno. A correção não cria, altera ou marca presenças; só corrige a leitura que abastece a Agenda.

## Diagnóstico confirmado

- A experimental de Alessandra da Silva Borges (Recreio, 19/09, 10:00, Erick) está ligada à aula física local `81095613` pela relação ativa `lead_experimental_aulas`.
- A visão `vw_experimental_aula_canonica` ignora essa relação e exige que o roster físico ainda traga `emusys_lead_id` ou `aluno_id` local. Depois da conversão no Emusys, o roster contém apenas o id externo de aluno, então a aula aparece na Agenda sem o card de presença.
- Cinco das treze experimentais realizadas, reconciliadas por chave natural em setembro, sofrem a mesma omissão. Portanto, não se deve corrigir somente a Alessandra.

## Guardrails

- Usar exclusivamente vínculos ativos: `aula_local_id` preenchido, sem substituição/cancelamento e com estado diferente de `cancelado`.
- O vínculo reconciliado é a fonte que relaciona experimental e aula física; o roster é informativo e não pode reabrir a ambiguidade entre lead e aluno.
- Preservar a deduplicação atual por aula e pessoa.
- Não modificar `aluno_presenca`, matrícula, status comercial ou dados do Emusys.
- Não reaplicar migrations históricas ausentes da `main`; criar uma única migration nova e aplicar somente ela após `db push --dry-run`.

## Tarefa 1 — Regressões automatizadas (primeiro em vermelho)

**Arquivos:**
- Modificar: `tests/agendaPendenciaExperimental.test.mjs`
- Modificar: `tests/syncExperimentaisSnapshotContrato.test.mjs`
- Criar: migration por `supabase migration new agenda_experimental_vinculo_canonico`

1. Criar teste que exija uma migration `agenda_experimental_vinculo_canonico` com a visão baseada em `lead_experimental_aulas`, vínculo ativo e sem dependência do roster para identificar a pessoa.
2. Acrescentar teste de reconciliador: mesmo lead, unidade e curso em horário diferente não pode ser associado à aula reagendada.
3. Acrescentar teste de patch: uma referência de evento/aula diferente deve ser substituída pela aula física reconciliada.
4. Acrescentar teste de contrato do webhook: o id de evento nunca deve ser gravado como `emusys_aula_id`.
5. Rodar os testes e registrar o resultado vermelho esperado. Separar as duas falhas pré-existentes do baseline, sem alterá-las nesta correção.

## Tarefa 2 — Leitura canônica da Agenda

**Arquivos:**
- Criar: `supabase/migrations/<timestamp>_agenda_experimental_vinculo_canonico.sql`

1. Recriar `vw_experimental_aula_canonica` começando por `lead_experimental_aulas` ativos.
2. Associar `aula_local_id` à linha física de `aulas_emusys` e `lead_experimental_id` ao registro comercial, exigindo mesma unidade e aula experimental não cancelada.
3. Gerar a mesma `pessoa_chave` atual e manter `row_number` para uma linha por aula/pessoa.
4. Não usar `aula_alunos_emusys` como condição para expor o vínculo; o roster pode ter convertido lead em aluno externo.
5. Documentar a regra por comentário SQL e não realizar DML em presenças ou experimentais.
6. Rodar o teste de migration e os testes de Agenda.

## Tarefa 3 — Prevenção no sincronizador

**Arquivos:**
- Modificar: `supabase/functions/_shared/experimental-reconciliacao.ts`
- Modificar: `supabase/functions/_shared/sync-experimentais-mode.ts`
- Modificar: `supabase/functions/debug-webhook-emusys-observador/index.ts`

1. Exigir hora exata no fallback de identidade da aula experimental; não usar janela de minutos.
2. Permitir que a reconciliação troque uma referência de evento ou aula antiga pela aula física confirmada.
3. Separar `emusys_agendamento_id` de `emusys_aula_id` no webhook de observação.
4. Rodar os testes de snapshot/reconciliação e o teste Deno do módulo puro.

## Tarefa 4 — Validação e publicação controlada

1. Rodar `npm run build` e todos os testes diretamente afetados.
2. Conferir o diff, migration e ausência de mudanças fora do escopo.
3. Atualizar a branch sobre `origin/main` se necessário, criar commit, fazer push e avançar `main` em fast-forward.
4. Rodar `supabase db push --dry-run`; só aplicar se listar exclusivamente a migration nova.
5. Aplicar a migration, verificar no banco a Alessandra e zerar a diferença entre vínculos ativos e a visão para setembro.
6. Publicar apenas as Edge Functions que importam o reconciliador e o observador alterado.
7. Abrir a produção, selecionar Recreio / 19 de setembro / Chamada / Experimentais, confirmar o card de Alessandra com botões de presença, recarregar e repetir a confirmação.

## Critério de aceite

- A experimental de Alessandra fica visível na Chamada de Erick às 10:00, após reload.
- Vínculos ativos de setembro não ficam invisíveis por troca de lead para aluno no roster.
- Fallback não une experimentais em horários diferentes.
- Nenhuma presença, matrícula ou status é modificado pela migration.
- Build e testes novos passam; falhas pré-existentes são reportadas separadamente.
