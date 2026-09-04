# Esta função NÃO mora mais aqui

A `notificar-anamnese` vive agora em **`la-teacher`**, em
`supabase/functions/notificar-anamnese/`, junto do teste que protege a fronteira
de privacidade (`fronteira.test.mjs`).

## Por que ela saiu daqui

Em 05/08/2026 ela existia nos **dois** repositórios, e a cópia que estava aqui
era a versão antiga — imprimia `⚠️ *Diagnóstico:* <nome>` literal no WhatsApp do
professor, não tinha varredura de privacidade, mandava o link da ficha completa
e usava um teto de tokens que cortava o briefing no meio da frase.

Um `supabase functions deploy` rodado a partir daqui teria desfeito o conserto
inteiro, em silêncio, sem ninguém perceber. Não era um risco hipotético: é o
comportamento normal do comando.

Duas cópias da mesma função é um problema de tempo, não de disciplina. Apagar
esta é o que torna o acidente impossível — sem o diretório com o `index.ts`, um
deploy daqui falha em vez de sobrescrever.

## O que a função faz hoje (resumo)

Monta a mensagem inteira e grava em `fila_anamnese_sol_hermes.mensagem`. A Sol
apenas transporta — ela não compõe nada.

⚠️ **Este parágrafo estava errado até 04/09/2026** e vale registrar o que ele dizia:
que o professor recebia "como apoiar", nunca o nome do diagnóstico, protegido por uma
varredura determinística na saída. Essa era a política da manhã de 05/08/2026 — o Alf
a reverteu no mesmo dia, com razão: se a família relatou, ela espera que o professor
saiba, e "Anafilaxia a formiga" é segurança física, não etiqueta.

**O que vale hoje:** a saúde informada pela família VAI para o professor, na estrutura
da mensagem (bloco ⚠️ *Saúde e necessidades*), e o briefing da IA complementa dizendo
o que FAZER com aquilo na aula. A varredura foi removida junto. O que continua fora é
filiação e situação conjugal dos pais — e não por varredura: `sanitizeForAI`
simplesmente não passa esses campos para a IA, que não pode citar o que nunca recebeu.

Quem lesse este arquivo até aqui acreditaria que o diagnóstico não sai daqui. Sai —
e é assim de propósito.

## Se precisar mexer

```bash
# no repositório la-teacher
node supabase/functions/notificar-anamnese/fronteira.test.mjs   # 12 casos, sem rede
supabase functions deploy notificar-anamnese --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```
