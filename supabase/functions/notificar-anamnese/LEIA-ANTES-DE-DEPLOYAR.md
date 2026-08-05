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

A fronteira de privacidade: o professor recebe **como apoiar**, nunca o nome do
diagnóstico, da condição médica ou do medicamento. Não é o prompt que garante
isso (medido: 1 em 3 briefings repetia o rótulo mesmo com a regra escrita) — é
uma varredura determinística na saída, que descarta o briefing se ele vazar.

## Se precisar mexer

```bash
# no repositório la-teacher
node supabase/functions/notificar-anamnese/fronteira.test.mjs   # 12 casos, sem rede
supabase functions deploy notificar-anamnese --project-ref ouqwbbermlzqqvtqwlul --no-verify-jwt
```
