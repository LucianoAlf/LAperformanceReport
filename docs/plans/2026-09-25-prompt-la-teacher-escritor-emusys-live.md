# Prompt → agente do LA Teacher (Fábio) — escritor de presença no Emusys LIVE

Contexto: a feature LA Report → Emusys da API 1.7.0 está construída,
testada e **ativa em produção nas três unidades** (Barra desde 25/09
~17h; Campo Grande e Recreio ativadas logo depois) — modo `canonico_v2`
em `presenca_rollout_config`, superfície `emusys_escrita`.

## O que o lado LA Report faz agora

Edge `presenca-emusys-escritor` (Supabase, v6). Disparo imediato por
trigger (`trg_presenca_emusys_escritor_evento` em `presenca_acao_eventos`,
`trg_presenca_emusys_escritor_ficha` em `fabio_registros_aula`) + cron
`presenca-emusys-escritor-dreno` a cada 5 min como sweeper:

1. Consome `presenca_acao_eventos` (`tipo='item_aplicado'`, aluno) e
   `fabio_registros_aula` (`status in ('confirmado','gravado_emusys')`,
   professor). O valor escrito é o **estado vigente** de
   `aluno_presenca` — nunca o valor do evento.
2. Antes de qualquer PATCH faz `GET /aula` e aplica a matriz:
   - `ausente` + `horario_presenca` null = **sem resposta** → escreve;
   - `ausente` + horário = **falta humana** → só `agenda_secretaria`
     corrige (presente↔falta); fonte do Fábio vira `conflito_marca_humana`;
   - linha `justificada`/`cancelada` → protegida, nunca toca;
   - `respondido_por='emusys'` → anti-laço, ignora.
3. PATCH manda `horario` = horário agendado (`data_hora_inicio`) — sem
   ele o Emusys não carimba `horario_presenca` e a linha lê como
   intocada. Emusys carimba `presente` sozinho; `ausente` precisa do
   campo.
4. Toda decisão vai pro livro `presenca_emusys_escrita` (estado antes +
   resposta inteira + motivo). Idempotente por gatilho.

## O que isso muda no LA Teacher

- `respondido_por` continua soberano: `fabio_audio`/`professor_la_teacher`
  alimentam o estado vigente e são a fonte dos gatilhos de professor.
  Nada muda na escrita canônica de vocês.
- Ficha confirmada → professor `presente` no Emusys em ~5min, na aula
  mestre. Já validado: 387 `professor_ja_presente` na sombra.
- O escritor **nunca** inventa falta de professor: só escreve `presente`
  quando a ficha confirma. Falta de professor não tem canal.
- Se uma marca do Fábio conflitar com marca humana no Emusys, vira
  `conflito_marca_humana` no livro — a equipe resolve entre si, o
  sistema não sobrescreve humano.

## Lacuna conhecida (já pedida ao Emusys)

`falta_justificada` e `aula_cancelada` não têm canal na 1.7.0 — o PATCH
só aceita `presente:true/false`. Medido na sombra: 9 casos de
justificada em 7 dias nas 3 unidades. Se o Emusys liberar a flag, o
canal entra no escritor sem mudar o contrato com vocês.

## Pontos de atenção para continuar o trabalho de vocês

- A chamada de hoje mostra `horario_presenca` null em linhas `ausente`
  escritas por API sem o campo `horario` (escritas da v5 na Barra,
  ~17:02–17:05). A v6 corrige; as ~10 linhas afetadas se autocorrigem
  no próximo toque.
- Não precisam escrever nada no Emusys do lado de lá — o escritor é o
  único escritor de presença. Continuem gravando `respondido_por` e a
  ficha como hoje.
- Relatório da sombra completo + desenho:
  `docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md`.
