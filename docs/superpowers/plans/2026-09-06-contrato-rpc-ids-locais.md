# Contrato por pessoa com IDs locais duplicados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a RPC reconhecer todos os contratos acadêmicos observados de uma pessoa, mesmo quando uma linha local duplicada não tem `emusys_matricula_id`.

**Architecture:** A RPC mantém a contagem local conservadora e recupera as chaves exatas de matrícula pela jornada canônica usando todos os `aluno_ids_locais`. A jornada só substitui a identificação local quando sua cobertura tem a mesma cardinalidade; divergência continua fechando em `nao_verificado`.

**Tech Stack:** PostgreSQL 17, Supabase migrations, Node.js test runner, Docker PostgreSQL fixture.

---

### Task 1: Regressão PostgreSQL

**Files:**
- Modify: `tests/contratoAssinadoRpcPostgres.test.mjs`

- [ ] Criar no fixture a tabela mínima de jornada usada pela RPC.
- [ ] Adicionar o caso acadêmico + banda com a matrícula acadêmica recuperável pela jornada.
- [ ] Adicionar o caso de dois cursos acadêmicos cujas observações estão ligadas ao mesmo `alunos.id`.
- [ ] Executar `node --test tests/contratoAssinadoRpcPostgres.test.mjs` e confirmar falha em `nao_verificado`.
- [ ] Adicionar contraprova com um contrato `false`, esperando `nao_assinado`.

### Task 2: Migration aditiva da RPC

**Files:**
- Create: `supabase/migrations/20260906155932_fix_contrato_assinatura_ids_locais_pessoa.sql`

- [ ] Criar a migration com `supabase migration new fix_contrato_assinatura_ids_locais_pessoa`.
- [ ] Substituir somente `get_situacao_alunos_v1(uuid,date,boolean)` mantendo assinatura, retorno, segurança e autorização.
- [ ] Separar matrículas locais, matrículas da jornada e cobertura por pessoa.
- [ ] Escolher jornada apenas quando as cardinalidades relevantes coincidirem.
- [ ] Casar contrato pela chave exata unidade + matrícula e preservar a precedência atual.
- [ ] Reaplicar `REVOKE`/`GRANT` idênticos aos vigentes.
- [ ] Executar o teste PostgreSQL até ficar verde.

### Task 3: Documentação e mapa do banco

**Files:**
- Modify: `docs/operacao/contrato-assinado-tom.md`
- Modify: `docs/REGRAS-DE-NEGOCIO.md`
- Modify: `docs/METRICAS.md`
- Modify: `docs/MAPA-INTEGRACAO-EMUSYS.md`
- Modify: `docs/sistema/aluno.md`
- Regenerate: `docs/banco/*.gerado.md`

- [ ] Documentar a identidade por pessoa e a prova de cobertura da jornada.
- [ ] Remover a ressalva antiga que atribuía os dois casos a observação ausente.
- [ ] Executar `npm run mapa:banco` e revisar somente as mudanças da RPC.

### Task 4: Verificação e publicação

**Files:**
- Test: `tests/contratoAssinado*.test.mjs`

- [ ] Executar a suíte completa de contrato, `npm run build` e `git diff --check`.
- [ ] Inspecionar segurança e performance da função alterada.
- [ ] Aplicar a migration versionada em produção somente após a suíte verde.
- [ ] Reler os dois casos pela RPC e varrer todas as pessoas com múltiplos IDs.
- [ ] Confirmar que somente os dois falsos `nao_verificado` mudaram e que ambos ficaram frescos.
- [ ] Commitar e publicar a branch para revisão.
