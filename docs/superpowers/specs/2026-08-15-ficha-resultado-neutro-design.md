# Ficha Técnica — resultado claro e linguagem neutra

**Status:** aprovado pelo usuário em 2026-08-15.

## Objetivo

Deixar explícito que o resultado do Bloco A é a primeira de duas partes, sem
tirar a recompensa visual do codinome, e remover a marcação fixa de gênero dos
textos que aparecem na ficha de colaborador do Time.

## Escopo aprovado

### Tela pública de resultado

Em `#screen-result`, a informação de etapa fica no mesmo eyebrow do resultado,
visualizada como `SEU PERFIL LA · PARTE 1 DE 2`. Ela aparece antes do avatar e
prepara a leitura sem interromper a frase `Lucas, o seu perfil é Frank-Slash`.

O botão abaixo da descrição mantém o fluxo para o Rider, mas passa a usar o
rótulo explícito `Falta a última parte →` e o estilo de botão primário. Abaixo
dele aparece `São mais 5 minutos. É a parte que mais ajuda a gente a te
conhecer.`. A tela de resultado e o codinome permanecem intactos.

O subtítulo do codinome continua sendo derivado do segundo artista recebido do
servidor (`s.artista`), de modo que um perfil `FRANK/SLASH` mostra `com tempero
Slash`; palavras como `Energia` ficam apenas nos chips.

### Textos do Time

`src/data/perfilTextos.ts` continuará sendo a fonte única do briefing, do bloco
de perfil, do reconhecimento, do “Evite”, da cobrança e das frases de valores.
Os quatro temperamentos, as cinco categorias de reconhecimento e os quatro
valores serão reescritos sem pronomes ou flexões de gênero fixas. Os fallbacks
também serão neutros para não reintroduzir o problema quando surgir uma chave
nova.

O título do bloco de valores muda de `O que ela prioriza` para `O que prioriza`.
No briefing do Time, o cabeçalho usa o apelido quando houver; sem apelido, usa
somente o primeiro nome. O nome completo permanece disponível no cabeçalho da
ficha para identificação.

## Limites

- Não alterar o cálculo de perfil, o codinome, a ordenação de desempate, o Rider
  ou a emissão de tokens.
- Não reescrever os enunciados dos cenários da ficha pública; a neutralização
  cobre os textos derivados do perfil exibidos no Time.
- Não fazer deploy nesta alteração; a entrega deste ciclo é código testado em
  branch baseada em `origin/main`.

## Verificação

Um contrato em `tests/fichaTecnicaResultadoNeutralidade.test.mjs` verificará:

1. o eyebrow combinado e a ordem do DOM antes do codinome;
2. o CTA, a mensagem de cinco minutos e a derivação por `s.artista`;
3. a ausência de pronomes de gênero nos textos de `perfilTextos.ts`;
4. o título neutro do bloco de valores;
5. o uso do apelido ou primeiro nome no cabeçalho do briefing.

Depois do ciclo RED/GREEN, serão executados o teste focado, a suíte existente,
`npm run build` e `git diff --check`.
