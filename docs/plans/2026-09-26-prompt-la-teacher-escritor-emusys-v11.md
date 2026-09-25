# Prompt → agente do LA Teacher (Fábio) — escritor Emusys v11 + professor da Agenda

Cole isto no agente do LA Teacher:

---

Contexto: a integração LA Report → Emusys (API 1.7.0) está ativa nas 3
unidades e acabou de ganhar um segundo caminho de professor. Versão da
edge `presenca-emusys-escritor`: **v11**, deploy 25/09 ~20h UTC.

## O que o escritor faz hoje (3 fontes de gatilho)

1. **Aluno pela Agenda/secretaria** — `item_aplicado` com `aluno_id` em
   `presenca_acao_eventos` → escreve o estado vigente de `aluno_presenca`.
2. **Ficha confirmada do LA Teacher** — `fabio_registros_aula`
   (`confirmado`/`gravado_emusys`) → escreve professor `presente`.
3. **Professor pela Agenda/secretaria** (NOVO hoje) — `item_aplicado` com
   `professor_id` e `aluno_id` null → escreve o `professor_presenca`
   vigente de `aulas_emusys` (presente **e ausente** — ao contrário da
   ficha, a secretaria pode marcar os dois). Dia inteiro (`aula_id` null)
   expande para todas as aulas do professor na data com `cancelada=false`;
   ajuste fino por aula usa a `aula_id` do evento.

Disparo imediato por trigger + cron sweeper a cada 5 min. Lease por
unidade impede execuções simultâneas.

## Regras que protegem a decisão humana (atualizada na v12)

- `ausente` + `horario_presenca` null no Emusys = "sem resposta" → o
  escritor preenche. ⚠️ Falta NUNCA tem horário — nem pela tela do Emusys,
  nem pelo PATCH. O que protege uma falta humana não é o carimbo: é o
  **livro** (o último `escrito` nosso prova que a falta é nossa) e a
  **fonte/vigente** (`aluno_presenca`/`professor_presenca` com origem
  humana). Falta marcada direto na tela do Emusys é indistinguível de
  aula sem chamada — buraco conhecido, já pedido carimbo ao Emusys.
- Linha `justificada`/`cancelada` e aula cancelada: protegidas.
- `fonte='emusys'`: anti-laço, nunca dispara.
- **Ficha não transforma falta da secretaria em presença** (v12): antes
  de escrever `presente`, o caminho da ficha lê
  `aulas_emusys.professor_presenca` — `ausente` com origem humana, ou
  último `escrito` nosso `presente:false`, vira `conflito_marca_humana`.
  Ponto e folha protegidos.
- Idempotente por (gatilho, modo, linha): reler a mesma fila não repete
  PATCH. Após cada PATCH o estado novo é refletido no cache de GET da
  execução — a rajada de PATCH duplicado por sub-tarefa está morta.

## Verdades medidas na API (importantes para o lado de lá)

- **`ausente` NUNCA carimba `horario_presenca`** — nem com `horario`
  explícito no PATCH. Uma falta escrita pela API relê como "sem resposta".
  O escritor resolve com o livro: o último `escrito` nosso prova que a
  linha é nossa e vira `ja_coerente`, sem re-PATCH.
- `presente` carimba sozinho com o horário agendado; o escritor também
  manda `horario` no PATCH por simetria.
- `falta_justificada` e `aula_cancelada` seguem sem canal na 1.7.0
  (pedido já feito ao Emusys).

## O que NÃO muda para o LA Teacher

- `respondido_por` continua soberano: `fabio_audio`/`professor_la_teacher`
  alimentam o estado vigente e disparam o gatilho de ficha.
- A ficha segue sendo o único caminho do Fábio para `presente` de
  professor — e a secretaria agora também escreve pela Agenda; os dois
  convergem na mesma matriz de decisão e no mesmo livro.
- Conflito entre marca do Fábio e marca humana continua saindo como
  `conflito_marca_humana` — resolve-se entre pessoas, o sistema não pisa.

## Estado do backlog

~584 eventos de professor da Agenda que estavam parados entraram na fila
hoje e estão sendo drenados pelo cron (~200/execução). Livro de auditoria
`presenca_emusys_escrita` registra tudo com antes/depois/motivo.

---
