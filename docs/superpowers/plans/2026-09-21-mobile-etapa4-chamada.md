# Chamada no celular — fila do que falta (LAPE-32, etapa 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a visão Chamada da Agenda passa a ter tela própria no celular, mostrando **só o que falta fechar** — professor sem marcação e aula já terminada sem chamada —, com a lista encurtando até esvaziar.

**Architecture:** a tela mobile não decide nada sobre presença. A regra de "está fechada?" já mora em `chamadaUtils.ts` (puro) e a de "o professor foi marcado?" em `adaptarPresencaProfessorCanonica` (`lib/presencaCanonica.ts`, puro). A montagem da fila vira uma função pura nova; a escrita reusa `useChamadaAcoes` (já agnóstico de layout) e um hook novo extraído de `ProfessorPresencaToggle`.

**Tech Stack:** React 19, TypeScript, Tailwind. Testes = contrato de fonte (`node --test` + regex) e valor de funções puras.

**Spec:** `docs/superpowers/specs/2026-09-12-versao-mobile-la-report-design.md` (§8: degradar, nunca esconder) + a escolha de recorte feita pelo Hugo em 21/09 sobre o canvas de 3 opções (recorte **A · fila do que falta**).

## Por que esta tela, e por que este recorte

Medido em 21/09 contra produção, últimos 30 dias:

| Lado | Volume | Origem |
|---|---|---|
| Chamada de aluno pela secretaria | **266/dia** | `aluno_presenca.respondido_por = 'agenda_secretaria'` |
| Presença de professor (decisão humana) | **183/dia** | `aulas_emusys.professor_presenca_origem not null` |
| Pendências que sobram no fim do dia | **0 a 3** nas 3 unidades | `fn_presenca_pendencias_do_dia` |

É a tarefa de maior volume do sistema, e as marcações acompanham as aulas (pico 15h–20h, 978 às 18h) — não são um lote feito de manhã no computador da recepção. Sobra pouca pendência porque a equipe fecha tudo, não porque a tarefa seja pequena.

**Os dois lados entram.** Deixar o professor de fora entregaria 40% da tarefa.

## Global Constraints

- **O desktop não muda de comportamento.** A Task 2 é uma extração: o `ProfessorPresencaToggle` passa a consumir o hook, e a tela do desktop continua idêntica — validada no navegador a 1440px antes do commit.
- **Nenhuma regra de presença nasce no celular.** "Fechada?" vem de `chamadaCompleta`; "professor marcado?" de `adaptarPresencaProfessorCanonica`; a escrita, de `useChamadaAcoes` e do hook novo. Um teste varre `src/mobile/` proibindo cópia.
- **Portão:** `tsc -p tsconfig.ci.json` com **172** erros (baseline medida em 21/09 — não é 336, que veio da etapa 2 e estava errada). Suíte inteira pelo script `test` do `package.json`, 0 fail.
- **A rota NÃO entra em `ROTAS_PORTADAS`.** `/app/agenda` já está em `abasPortadas.ts`; esta etapa acrescenta `'chamada'` à lista de abas portadas. Marcar a rota apagaria a faixa âmbar do Calendário.
- Toque mínimo 44px. Nada de `role`/`onClick` em `div`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/chamadaFila.ts` | **novo, puro.** Monta a fila: professores sem marcação + aulas sem chamada, ordenadas por urgência. Não decide nada sobre presença — compõe as regras que já existem. |
| `src/hooks/useProfessorPresenca.ts` | **novo.** A orquestração de marcar/desmarcar professor no dia, extraída de `ProfessorPresencaToggle` sem mudar uma vírgula da regra. |
| `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx` | passa a consumir o hook. **Nenhuma mudança visual.** |
| `src/mobile/telas/agenda/ChamadaMobile.tsx` | **novo.** A fila. Recebe tudo por props; não busca nada. |
| `src/mobile/telas/agenda/LinhaPendencia.tsx` | **novo.** Uma linha da fila (professor ou aula), com os botões. |
| `src/components/App/Agenda/AgendaPage.tsx` | roteia a visão `chamada` para a tela mobile no celular. |
| `src/mobile/abasPortadas.ts` | `'chamada'` entra na lista de `/app/agenda`. |
| `tests/chamadaFila.test.mjs`, `tests/mobileChamadaTela.test.mjs`, `tests/professorPresencaHook.test.mjs` | travas. |

---

## Task 1: `chamadaFila.ts` — a fila, como função pura

**Files:**
- Create: `src/lib/chamadaFila.ts`
- Test: `tests/chamadaFila.test.mjs`

**Interfaces:**
- Consumes: `chamadaCompleta`, `alunoSemDestino` de `@/components/App/Agenda/Chamada/chamadaUtils`; `adaptarPresencaProfessorCanonica` de `@/lib/presencaCanonica`; `aulaJaOcorreu` de `@/lib/agenda`.
- Produces: `montarFilaDaChamada(aulas, data, agora, envelope): { professores: PendenciaProfessor[]; aulas: PendenciaAula[]; total: number }`.

- [ ] **Passo 1: escrever o teste que falha**

```js
test('a fila traz só o que falta, do mais antigo para o mais novo', async () => {
  const { montarFilaDaChamada } = await import('../src/lib/chamadaFila.ts');
  // 14:00 terminou há mais tempo que 15:00 — vem primeiro, porque é a que
  // está esperando há mais tempo.
  const fila = montarFilaDaChamada(aulas, '2026-09-21', new Date('2026-09-21T15:30:00-03:00'), envelope);
  assert.deepEqual(fila.aulas.map((a) => a.aula.hora_inicio), ['14:00', '15:00']);
});
```

- [ ] **Passo 2: rodar e ver falhar** — `node --test tests/chamadaFila.test.mjs`, esperado: módulo não existe.

- [ ] **Passo 3: implementar**

```ts
export function montarFilaDaChamada(
  aulas: AulaAgenda[],
  data: string,
  agora: Date,
  envelope: PresencaEnvelopeAgenda,
): FilaDaChamada {
  // ⚠️ NÃO reimplementar "está fechada?": `chamadaCompleta` é a fonte, e é a
  // mesma que o desktop usa. Aqui só se escolhe O QUE ENTRA NA FILA.
  const pendentes = aulas.filter(
    (a) => !a.cancelada && aulaJaOcorreu(data, a.hora_fim, agora) && !chamadaCompleta(a, data, agora),
  );
  // …ordem por hora_fim crescente (a que espera há mais tempo vem primeiro)
}
```

- [ ] **Passo 4: rodar e ver passar**, e acrescentar os casos que a regra precisa ter:
  - aula cancelada **não** entra (ela não tem chamada a fechar);
  - aula que ainda não terminou **não** entra (não há o que cobrar);
  - professor com `estado === 'indeterminado'` entra; `presente`/`ausente` não;
  - `dados_desatualizados` e `roster_em_revisao` **não** viram "sem marcação" — são "não sei", e acusar a equipe por defeito de sincronismo é o erro que a régua de `sem_captura` já proíbe em outro lugar.

- [ ] **Passo 5: mutação** — trocar `!chamadaCompleta` por `chamadaCompleta` e provar que o teste cai. Afirmar que a mutação aplicou (`assert n == 1`) antes de rodar.

- [ ] **Passo 6: commit**

---

## Task 2: extrair `useProfessorPresenca` — sem mudar o desktop

**Files:**
- Create: `src/hooks/useProfessorPresenca.ts`
- Modify: `src/components/App/Agenda/Chamada/ProfessorPresencaToggle.tsx`
- Test: `tests/professorPresencaHook.test.mjs`

⚠️ **Este é o caminho de escrita mais sensível da tela mais usada** (183 marcações/dia) e o banco protege a decisão humana por trigger. A extração move a orquestração **sem tocar na regra**: trava, `chaveDoPedido`, `requestId`, reconciliação de pendentes e interpretação do recibo continuam vindo de `@/lib/presencaRecibo`.

- [ ] **Passo 1: teste que trava a não-duplicação**

```js
test('a orquestração de marcar professor mora no hook, não no componente', () => {
  assert.doesNotMatch(toggle, /supabase\.rpc\('app_registrar_presenca_professor_dia'/);
  assert.doesNotMatch(toggle, /supabase\.rpc\('app_remover_presenca_professor_dia'/);
  assert.match(hook, /app_registrar_presenca_professor_dia/);
  // A regra continua vindo da lib, não recriada no hook.
  assert.match(hook, /from '@\/lib\/presencaRecibo'/);
  assert.doesNotMatch(hook, /function (chaveDoPedido|requestIdDoPedido)\(/);
});
```

- [ ] **Passo 2: mover `marcarDia` e `reconciliarPendenciasDoDia` para o hook**, devolvendo `{ salvando, marcarDia }`. Nada de renomear, nada de "melhorar" no caminho — cópia fiel.

- [ ] **Passo 3: o toggle consome o hook.** O JSX não muda.

- [ ] **Passo 4: provar que o desktop não mudou** — abrir `/app/agenda` a 1440px, visão Chamada, e conferir que o card do professor segue idêntico e a marcação funciona ponta a ponta. ⚠️ Não declarar "igual" sem abrir.

- [ ] **Passo 5: commit**

---

## Task 3: `ChamadaMobile.tsx` — a fila na tela

**Files:**
- Create: `src/mobile/telas/agenda/ChamadaMobile.tsx`, `src/mobile/telas/agenda/LinhaPendencia.tsx`
- Test: `tests/mobileChamadaTela.test.mjs`

Segue o padrão já provado na Agenda mobile: recebe tudo por props, não busca nada, cabeçalho `sticky` com a sangria de 12px do `<main>` (o `before`), lista com fio separador, sem cartão.

- [ ] **Passo 1: testes de contrato** — a tela não fala com o banco; não reimplementa `chamadaCompleta`; usa `montarFilaDaChamada`; botões com 44px.
- [ ] **Passo 2: dois blocos** — `PROFESSORES SEM MARCAR (n)` e `AULAS SEM CHAMADA (n)`, cada linha com `Presente` / `Faltou` e, na turma, `Abrir a turma · N alunos`.
- [ ] **Passo 3: o vazio é uma conquista, não um erro** — com a fila zerada, "Tudo fechado neste dia", em verde, sem parecer tela quebrada.
- [ ] **Passo 4: a linha SAI da fila ao ser fechada** (é a promessa do recorte A). Como a fila é derivada das aulas, isso acontece na recarga — garantir que `aoConcluir` recarrega.
- [ ] **Passo 5: commit**

---

## Task 4: ligar na AgendaPage e abrir a aba

**Files:**
- Modify: `src/components/App/Agenda/AgendaPage.tsx`, `src/mobile/abasPortadas.ts`
- Test: `tests/mobileChamadaLigada.test.mjs`

- [ ] **Passo 1:** no celular, `visao === 'chamada'` renderiza `ChamadaMobile` em vez de `ChamadaView`.
- [ ] **Passo 2:** `'chamada'` entra em `ABAS_PORTADAS['/app/agenda']` — e **só ela**; `'calendario'` continua fora, com a faixa.
- [ ] **Passo 3:** teste de que `ROTAS_PORTADAS` continua `['/app']`.
- [ ] **Passo 4:** medir no navegador a 390px: quantas pendências cabem na primeira tela, nada truncado, nenhuma rolagem lateral.
- [ ] **Passo 5: commit**

---

## Fora de escopo, declarado

- **Justificar falta, cancelar e reagendar** (os 3 modais). A fila oferece `Presente` / `Faltou`; o resto abre no desktop. Entram na etapa 5.
- **Sub-visões Semana e Lista.** A fila substitui as duas no celular.
- **Conflito Emusys × humano** (`temConflito`): é leitura de auditoria, não de fechamento.
- **Calendário escolar** segue abrindo com a faixa âmbar.
