# Deduplicar webhooks de renovação do Emusys — Design

**Data:** 2026-07-02
**Autor:** Hugo (via Claude)
**Status:** Proposto (aguardando revisão)

## Problema

O Emusys não tem um evento de webhook "matrícula editada" (confirmado na documentação e nos 105 eventos reais já recebidos — só existem `matricula_nova`, `matricula_renovacao`, `matricula_trancamento`, `matricula_finalizacao`). Como consequência, qualquer edição numa matrícula já renovada (ex: ajuste de cronograma/turma) faz o Emusys reenviar o evento `matricula_renovacao` — e a edge `processar-matricula-emusys` trata isso como uma renovação nova.

Isso causa dois sintomas:
1. **Renovação contada em dobro** — 1 evento real vira 2 (ou mais) linhas em `movimentacoes_admin`.
2. **"Anterior" errado** — a 2ª gravação lê `alunos.valor_parcela` já atualizado pela 1ª, e registra `anterior = novo` (0% de reajuste, sempre errado nos casos verificáveis).

### Casos confirmados (investigação 2026-07-02)

- **Millene Chris Pimentel de Matos** (matrícula 2287) e **Benjamim Soares Vieira** (matrícula 2285): confirmado ponta a ponta com o histórico nativo do Emusys — a mesma pessoa (Gabriela Leal) editou o cronograma da turma ~19h depois da renovação, e o Emusys reemitiu `matricula_renovacao` no mesmo minuto da edição. Corrigidas manualmente pela Gabi/Gabriela.
- Levantamento no `automacao_log`: **37 alunos** com 2+ eventos de `matricula_renovacao` pra mesma matrícula esse mês, em **dois padrões distintos**:
  - **~8 alunos** com ~18-19h de diferença entre eventos (padrão "edição de cronograma", como Millene/Benjamim).
  - **~29 alunos** com menos de 1 segundo de diferença (reenvio de webhook quase instantâneo, causa provavelmente na entrega do próprio Emusys).
- **10 dos 29 casos "instantâneos" já viraram duplicata real** em `movimentacoes_admin` (2, 3 ou até 4 linhas), apesar da checagem de dedup já existente no código — prova de uma condição de corrida real, não só teórica.
- **Todos os 10 casos verificáveis de "0% de reajuste"** no período 27/06–02/07 correspondem a duplicidade confirmada (2-3 webhooks pra mesma matrícula). Nenhum caso confirmado de "0% legítimo" nos dados reais.

## Objetivo

A edge nunca mais cria uma segunda linha de renovação (nem grava "anterior" errado) quando o Emusys reenvia `matricula_renovacao` pra uma matrícula que já processamos — seja por edição de cronograma (horas depois) ou por reenvio quase instantâneo do webhook — sem nunca bloquear ou perder uma renovação real.

## Não-objetivos

- Não faz limpeza retroativa dos ~37 alunos já afetados esse mês (tarefa separada).
- Não cria um endpoint/evento novo no Emusys (fora do nosso controle).
- Não altera o fluxo de `matricula_nova`, `matricula_trancamento`, `matricula_finalizacao`.

## Evidências que sustentam o design

1. **`qtd_contratos` (API Emusys `GET /matriculas`) é o sinal certo pra saber se é renovação nova**, porque:
   - É por **matrícula específica**, não por aluno — validado com Alexandre Ayres Filho (mesmo `aluno_id`, 2 cursos: matrícula 890 com `qtd_contratos=5`, matrícula 1765 com `qtd_contratos=2`). Seguro para alunos com múltiplos cursos.
   - É mais confiável que comparar só o **valor** — porque uma renovação real pode legitimamente ter 0% de reajuste (aluno renovou sem aumento de preço nesse ciclo), e nesse caso comparar só o valor perderia silenciosamente uma renovação real. `qtd_contratos` não depende do preço ter mudado.
2. **Checagem em código (`SELECT` antes do `INSERT`) não é suficiente contra concorrência** — confirmado: 10 de 24 casos testados do padrão "instantâneo" já duplicaram apesar da checagem atual. `automacao_log` já tem proteção real (índice único `automacao_log_idempotency_key_uq`, `WHERE idempotency_key IS NOT NULL`), e o código já sabe lidar com a violação (`if (error.code === '23505') return`) — mas essa proteção só existe pro log, não pra `movimentacoes_admin`.
3. **A chave do índice precisa incluir `curso_id`** — testado inicialmente sem ele e quase gerou um problema sério: um aluno com 2 cursos (Carlos Eduardo Garcia do Nascimento, Canto + Contrabaixo, ambos renovando na competência de julho/2026) apareceu como "conflito" numa checagem preliminar com a chave `(aluno_id, unidade_id, tipo, competencia_referencia)` — sem `curso_id` essa chave trataria duas renovações reais de cursos diferentes como duplicata, bloqueando uma delas. Com `curso_id` na chave, o falso conflito desaparece (confirmado por query).

## Solução — duas camadas

### Camada 1 — Trava de concorrência (webhooks quase simultâneos)

Adicionar um índice único em `movimentacoes_admin` que impede fisicamente duas linhas de renovação para o mesmo evento, seguindo o mesmo padrão já usado (e comprovadamente funcional) em `automacao_log`.

- Índice único parcial sobre `(aluno_id, unidade_id, curso_id, tipo, competencia_referencia)` **WHERE tipo = 'renovacao'** — inclui `curso_id` (ver evidência #3 acima), essencial pra não bloquear alunos com múltiplos cursos renovando na mesma competência.
- A edge tenta o `INSERT` diretamente; se vier erro `23505` (violação de unicidade), trata como duplicado e não faz nada — mesmo padrão já usado em `gravarLog`.
- **Efeito:** fecha os ~29 casos de reenvio quase instantâneo, incluindo os 10 que já escaparam da checagem atual.

**Pré-requisito — limpeza pontual antes de criar o índice:** o Postgres recusa criar índice único se já houver dados conflitantes. Com a chave corrigida (incluindo `curso_id`), sobram só **2 conflitos reais** hoje (não 3 — o terceiro, Carlos Eduardo, era falso positivo da chave sem curso, ver evidência #3):
- **Pérola Madeira Maturano** (Barra, curso Canto, competência jan/2026) — duplicata clássica do bug: duas linhas idênticas (mesmo valor, mesmo agente, mesma forma), criadas com 27 segundos de diferença. Mesmo padrão que estamos corrigindo, só que de fevereiro — prova que o bug é anterior a julho.
- **Letícia Ferreira Vasconcelos** (Recreio, curso 16, competência fev/2026) — **causa diferente**, não é webhook duplicado: uma linha `pendente_validacao` de 18/02 (sem valor, sem agente, nunca confirmada) e uma linha `confirmada` de 28/02 (10 dias depois, dados completos) — parece pendência esquecida seguida de um registro manual novo pra fechar a renovação. Precisa de julgamento caso a caso (provavelmente manter a confirmada e arquivar a pendente), não um merge automático.

### Camada 2 — Reconhecimento de reprocessamento por edição (`qtd_contratos`)

Antes de tratar um evento de `matricula_renovacao` como renovação nova:

1. Consultar `GET /matriculas?aluno_id=<emusys_student_id>` (já teria que ser feito de qualquer forma — reaproveitar/ajustar a chamada que `complementarDescontoMatricula` já faz) e capturar `qtd_contratos` da matrícula específica (por `matricula_id`, nunca agregado por aluno).
2. Comparar com o último `qtd_contratos` que guardamos pra essa mesma matrícula (novo campo a definir — ex: `alunos.emusys_qtd_contratos_ultima_renovacao`).
3. **Se aumentou** → renovação real. Segue o fluxo normal (grava linha, atualiza valor, incrementa `numero_renovacoes`), e atualiza o `qtd_contratos` guardado.
4. **Se não aumentou** → não é renovação nova, é reprocessamento (edição de cronograma ou similar):
   - Não cria linha em `movimentacoes_admin`.
   - Não mexe em `valor_parcela` nem em `numero_renovacoes`.
   - **Atualiza só os campos de cronograma** (`dia_aula`, `horario_aula`, `data_fim_contrato`) em `alunos` — essa parte é informação real e deve ser capturada.
   - Grava no `automacao_log` com uma ação distinta (ex: `acao: 'renovacao_reprocessamento_cronograma_atualizado'`), pra ficar visível e auditável sem contar como renovação.

### Rede de segurança — falha na consulta à API

Se a chamada `GET /matriculas` falhar (timeout, erro de rede, etc.), a edge **não bloqueia**: processa como renovação normal (comportamento de hoje). Prioridade: nunca perder uma renovação real silenciosamente — no pior caso, duplica (visível, corrigível na tela de Administrativo), o que é preferível a descartar dado real. Grava invariante de aviso quando isso acontece, pra ficar rastreável.

## Passo de validação antes de implementar

Só testamos `qtd_contratos` a fundo com Millene (validado com API ao vivo) e confirmamos o padrão de edição com Millene e Benjamim (histórico nativo do Emusys). Antes de commitar a Camada 2, validar via API se os outros 6 alunos do padrão "~18-19h" (Levi Jorge Leite Oliveira, Joanna Carolina Teixeira Sampaio dos Santos Souto, Miguel Teixeira Sampaio dos Santos Souto, Ítalo Roque Machado Castilho Corval, João Paulo Costa do Carmo, Clarisse Maria Vignerom Lira) também mostram `qtd_contratos` estável entre os dois eventos — confirma que o sinal é consistente antes de confiar nele como regra geral.

## Escopo fora desta correção (registrar para depois)

- Limpeza dos ~37 alunos já duplicados esse mês (14 do padrão cronograma, ~29 do padrão instantâneo, com sobreposição a apurar), além dos 2 casos antigos (Pérola, Letícia) que só serão resolvidos como pré-requisito do índice, não como limpeza geral.
- Aviso pra Gabriela Leal/equipe sobre o padrão (editar cronograma logo após renovar reemite o evento) — não é erro dela, é limitação do Emusys, mas vale que a equipe saiba.
- Card "Renovação" (26) vs aba "Renovações" (28) no Administrativo — achado paralelo, não relacionado a este bug (é sobre exclusão de cursos de atividade extra em métricas). Registrado em memória separadamente; decisão do Hugo pendente.

## Reversibilidade

O índice único em `movimentacoes_admin` é aditivo (não remove dados, só impede inserts futuros duplicados) — reversível via `DROP INDEX`. A lógica de `qtd_contratos` é um novo `if` na edge, sem migração destrutiva. Nenhuma etapa apaga ou altera dados já existentes.
