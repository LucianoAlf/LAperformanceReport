# LA Teacher - Presenca e ponto do professor - Plano de implementacao

> **Para execucao:** seguir as tarefas na ordem e manter os testes vermelhos antes de cada mudanca de producao.

**Objetivo:** permitir que o professor registre a chamada uma unica vez, sem sobrescrita entre LA Teacher e Emusys, e derivar o ponto diario pelas aulas efetivamente comprovadas.

**Arquitetura:** o roster da aula e sincronizado separadamente da resposta de presenca. `aluno_presenca` continua compativel com os consumidores legados, ganha um estado canonico aditivo e permanece first-write-wins. Justificativa administrativa fica em tabela separada. O ponto e calculado por views, usando aulas distintas e confirmacoes explicitas apenas para pontas ambiguas.

**Stack:** PostgreSQL/Supabase, RLS, RPCs `security definer`, Supabase Edge Functions em Deno/TypeScript, testes estaticos com `node:test`.

---

## Regras fechadas

- Professor grava apenas `presente` ou `falta` e nunca edita depois do envio.
- LA Teacher e Emusys usam `insert ... on conflict do nothing` em `(aluno_id, aula_emusys_id)`.
- Presenca positiva do Emusys pode ser materializada assim que chega.
- Ausencia do Emusys so pode virar falta apos 24 horas do fim da aula; com o cron diario, a latencia efetiva fica entre 24 e 48 horas.
- Aula cancelada permanece em `aulas_emusys.cancelada`, nao gera falta e nao entra no ponto.
- Justificativa e somente administrativa e fica fora de `aluno_presenca`.
- Minutos do ponto sao a soma das duracoes das aulas distintas entre a primeira e a ultima aula com presenca, inclusive. Uma unica aula presente credita sua duracao integral.
- Falta na ponta so entra com confirmacao positiva do professor ao toque do Fabio.
- Correcao e exclusiva da coordenacao, exige motivo e produz trilha append-only.

---

## Task 1: Contratos automatizados antes da implementacao

**Files:**
- Create: `tests/laTeacherInfra.test.mjs`
- Inspect: `supabase/functions/sync-presenca-emusys/index.ts`
- Inspect: `src/components/App/Professores/ProfessoresPage.tsx`

- [ ] Criar testes estaticos que exijam `ignoreDuplicates: true`, janela de maturidade, sincronizacao de roster, camada administrativa separada e ausencia de delete total em `professores_unidades`.
- [ ] Executar `node --test tests/laTeacherInfra.test.mjs` e confirmar falha pelo comportamento ainda ausente.

## Task 2: Preservar a identidade Emusys do professor por unidade

**Files:**
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`
- Modify: `src/components/App/Professores/ModalProfessor.tsx`
- Test: `tests/laTeacherInfra.test.mjs`

- [ ] Atualizar a coluna `disponibilidade` nos vinculos existentes e inserir apenas unidades realmente novas.
- [ ] Remover apenas vinculos de unidades explicitamente desmarcadas, sem reconstruir os vinculos mantidos.
- [ ] Validar erros de todos os comandos Supabase antes do toast de sucesso.
- [ ] Identificar a disponibilidade como espelho manual do Emusys na ficha, sem apresenta-la como fonte definitiva.
- [ ] Executar o teste estatico e o build.

## Task 3: Fundacao SQL aditiva

**Files:**
- Create: `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`
- Test: `tests/laTeacherInfra.test.mjs`

- [ ] Adicionar `aluno_presenca.status_presenca` com `presente|falta` e preencher a partir de `status` sem remover a coluna legada.
- [ ] Atualizar o check de `respondido_por` para incluir `professor_la_teacher`.
- [ ] Criar `aula_alunos_emusys` com apenas identidade operacional, nome de exibicao, vinculo local e timestamps de sync; nao incluir telefone, e-mail ou financeiro.
- [ ] Criar `aluno_presenca_administrativo` com chave `(aluno_id, aula_emusys_id)`, `justificada` e metadados de origem.
- [ ] Criar `professor_ponto_confirmacoes` para respostas sobre pontas ambiguas.
- [ ] Criar `aluno_presenca_retificacoes` append-only.
- [ ] Habilitar RLS em todas as tabelas e negar escrita direta a `anon` e `authenticated`.

## Task 4: Identidade guardada do professor e leitura da agenda

**Files:**
- Modify: `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`

- [ ] Versionar `fn_professor_do_usuario()` com busca pelo usuario autenticado e revogar execucao de `anon`.
- [ ] Criar RPC de leitura da agenda que usa `aula_alunos_emusys` como roster, filtra pelo professor autenticado e nao retorna contato ou financeiro.
- [ ] Expor apenas aulas nao canceladas e o estado ja gravado, sem assumir presente quando nao ha resposta.

## Task 5: Escrita atomica da chamada

**Files:**
- Modify: `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`

- [ ] Criar `app_registrar_presencas_aula(p_aula_emusys_id bigint, p_alunos_ausentes integer[])`.
- [ ] Guardar a RPC por `fn_professor_do_usuario()` e validar que a aula pertence ao professor.
- [ ] Validar que todos os ausentes pertencem ao roster local da aula.
- [ ] Inserir uma linha por aluno do roster: `presente` para os demais e `falta` para a lista recebida.
- [ ] Gravar `respondido_por = 'professor_la_teacher'` e usar `on conflict do nothing`.
- [ ] Retornar contagem gravada, ignorada e o indicador de chamada ja fechada.

## Task 6: Correcao administrativa auditavel

**Files:**
- Modify: `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`

- [ ] Criar `admin_corrigir_presenca(p_aluno_presenca_id uuid, p_status_presenca text, p_motivo text)`.
- [ ] Exigir permissao de coordenacao para a unidade do registro e motivo nao vazio.
- [ ] Inserir os valores anterior/novo e o autor em `aluno_presenca_retificacoes` antes da atualizacao.
- [ ] Manter `status` legado sincronizado (`falta` vira `ausente`) e nunca apagar a trilha.

## Task 7: Ponto derivado por views

**Files:**
- Modify: `supabase/migrations/20260710120000_la_teacher_presenca_ponto.sql`

- [ ] Criar uma view intermediaria com uma linha por aula/professor/data, duracao robusta e sinais `tem_presenca`/`tem_falta`.
- [ ] Calcular primeira e ultima aula com presenca por professor/dia.
- [ ] Creditar aulas dentro dos dois ancoramentos, uma unica aula presente e pontas confirmadas positivamente.
- [ ] Excluir aulas canceladas e deduplicar por `aulas_emusys.id` antes de somar minutos.
- [ ] Criar a view diaria com inicio, fim, minutos creditados, quantidade de aulas e origem das confirmacoes.

## Task 8: Sync Emusys first-write-wins e roster antecipado

**Files:**
- Modify: `supabase/functions/sync-presenca-emusys/index.ts`
- Test: `tests/laTeacherInfra.test.mjs`

- [ ] Incluir `justificada` no contrato real de `/aulas`.
- [ ] Sincronizar `aula_alunos_emusys` para todas as aulas obtidas, inclusive antes de haver resposta de presenca.
- [ ] Sincronizar `aluno_presenca_administrativo` de forma independente.
- [ ] Manter canceladas no espelho de aulas, sem criar presenca.
- [ ] Inserir `presente` imediatamente e inserir `falta` somente quando `data_hora_fim <= now() - 24h`.
- [ ] Trocar o upsert destrutivo por `ignoreDuplicates: true`.
- [ ] Aceitar modo `agenda` com janela futura, que sincroniza aulas/roster/admin e nunca materializa faltas.
- [ ] Versionar cron de agenda futura sem gravar segredos no repositorio.

## Task 9: Verificacao

- [ ] Executar `node --test tests/*.test.mjs`.
- [ ] Executar `npm run build`.
- [ ] Executar `npx tsc --noEmit` e separar falhas novas das preexistentes em `scripts/importar_historico_ltv.js`.
- [ ] Executar `git diff --check`.
- [ ] Revisar que nenhuma RPC do professor retorna telefone, e-mail ou financeiro.
