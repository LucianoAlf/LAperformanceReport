# Escrita de presença no Emusys — desenho (API 1.7.0)

Data: 2026-09-25 · Estado: **desenho aprovado para implementar em sombra** · Origem: prompt do LA Teacher (`prompt-la-report-presenca-no-emusys-2026-09-24.md`) + changelog oficial Emusys + payload vivo medido na Barra em 24/09.

## O que a API 1.7.0 entrega (verificado no changelog e no payload real)

| Endpoint | Corpo | Observações |
|---|---|---|
| `PATCH /aulas/presenca/aluno` | `{ aula_id, presente: bool, horario? }` | `aula_id` é a **linha individual do aluno** na turma (campo novo `alunos[].aula_id` do GET). Nunca a mestre. |
| `PATCH /aulas/presenca/professor` | `{ aula_id, professor_id, presente: bool, horario? }` | Aceita mestre ou individual; resolve na mestre. `professor_id` obrigatório quando há mais de um professor — a gente sempre manda (lido do próprio GET). |
| `GET /aula?aula_id=` | — | Leitura do estado antes de escrever. |
| Resposta do PATCH | `{ status:200, aula:{...} }` | Devolve a aula inteira — serve como recibo do "depois". |

**Sem canal de `justificada`.** O PATCH só aceita `presente:true/false`. Falta justificada **não se escreve** (viraria `ausente` e perderia o estatuto). Fica fora do escritor e entra no relatório da sombra para decisão do Alf.

## O mapa de estados (o cruzamento dos "quatro")

Estado **nosso** (`status_novo` do evento aplicado) × estado **lá** (linha do aluno no GET):

| Emusys (`presenca` + `horario_presenca`) | Significado real |
|---|---|
| `presente` + horário | presença marcada |
| `ausente` + horário | **falta marcada por alguém** |
| `ausente` + `horario_presenca=null` | **ninguém fechou a chamada** (default, não é falta) |
| `justificada=true` na linha | falta justificada |
| `cancelada=true` | aula cancelada |

O discriminante é o `horario_presenca`, não o enum — `ausente` sem horário é "sem resposta".

## De onde o escritor lê

**O evento é só o gatilho; quem manda o valor é o estado vigente.** O `item_aplicado` em `presenca_acao_eventos` dispara a avaliação, mas o que se escreve é o estado atual de `(aluno_id, aula_emusys_id)` — lido em `aluno_presenca.status_presenca` + `respondido_por` (último evento válido, desempate por `sequencia`). Assim reprocessamento ou atraso nunca manda valor velho por cima de correção nova.

Fontes que geram escrita de aluno: `agenda_secretaria`, `professor_la_teacher`, `fabio_audio`. Fonte `emusys` **nunca** escreve (é a leitura de volta — anti-laço). `falta_justificada` e `aula_cancelada` não geram PATCH (sem canal / proibido).

**Professor dispara pela ficha, não pelo evento de presença.** Gatilho: `fabio_registros_aula` indo para `confirmado`/`gravado_emusys` (o `aula_id` de item de professor vem nulo no evento — a aula sai da própria ficha). Alvo: a aula da ficha (mestre na turma). O `professor_id` do Emusys é conferido contra o `GET /aula`; divergência → `pulado_identidade_divergente`. A marca de `professor_dia` da secretaria é nível-dia (sem aula), não alimenta este escritor.

## Quando escreve (worker, não síncrono)

Edge `presenca-emusys-escritor` em **agenda** (a cada ~15 min) + invocável. Nada de escrever dentro da RPC de chamada — a UX não pode depender da API deles.

Por item aplicado ainda não espelhado (janela de lookback configurável, hoje ~7 dias):

1. **GET `/aula?aula_id=`** na linha do evento → estado "antes" gravado no livro.
2. **Matriz de decisão** (abaixo) → `escrever` ou `pular` com motivo.
3. Modo `sombra`: grava `seria_escrito`/`pularia` e encerra. Modo `ativo`: **PATCH**, grava resposta inteira, `decisao='escrito'`.
4. ~1 s entre chamadas, backoff exponencial em 5xx (a API quebra em rajada ~120).

## Matriz de decisão — precedência por fonte, nos dois sentidos

O ponto crítico: **a falta do professor não pode apagar a presença que a secretaria marcou**. A regra olha quem é a fonte do estado vigente (`respondido_por`), não só o valor:

| Estado vigente (fonte) | Estado lido lá | Ação |
|---|---|---|
| qualquer | `justificada` ou `cancelada` na linha | **não escreve** → `pulado_linha_protegida` |
| qualquer | `id_aluno` da linha ≠ esperado | `pulado_identidade_divergente` |
| qualquer | `ausente` + `horario=null` (sem resposta) | escreve o estado vigente |
| qualquer | marca **nossa** (está no livro: último `escrito` do par) | `ja_coerente` se igual; escreve se o vigente mudou (corrige a nossa própria marca) |
| `agenda_secretaria` | marca humana lá (presente **ou** falta que não é nossa) | **escreve** — a secretaria mudando de ideia nos dois sentidos; `estado_antes` registra a marca coberta |
| `professor_la_teacher`/`fabio_audio` | marca humana lá (não nossa) | **não escreve** → `conflito_marca_humana` (revisão) |
| `emusys` (respondido_por) | — | nunca escreve (anti-laço) |
| `falta_justificada`/`aula_cancelada` vigente | — | nunca entra na fila |

"Marca nossa" = existe `escrito` no livro para `(aula_emusys_id, aluno_id)` **e** o valor exibido lá confere com o último que mandamos. Se difere do nosso último `escrito`, alguém mexeu depois de nós → é marca humana → vale a linha da fonte.

Professor (ficha confirmada → `presente:true` na mestre): nunca desmarca presença já registrada pela equipe (`ausente`+horário não nosso → `conflito_marca_humana`), nunca escreve em aula cancelada.

## Livro de bordo — `presenca_emusys_escrita` (molde: `fabio_emusys_escrita`, tabela nova)

```text
id, request_id, presenca_evento_id → presenca_acao_eventos.id (aluno),
ficha_id → fabio_registros_aula.id (professor),
unidade_id, aula_emusys_id, aluno_id, professor_id, alvo ('aluno'|'professor'),
estado_vigente (status_presenca lido), fonte_decisao (respondido_por),
presente bool, estado_antes jsonb (presenca+horario+justificada+cancelada),
decisao ('escrito'|'seria_escrito'|'ja_coerente'|'conflito_marca_humana'|'pulado_*'|'erro'),
motivo, resposta jsonb (aula do PATCH), erro, modo ('sombra'|'ativo'), criado_em
```

Chave de idempotência: **uma linha por gatilho** — `presenca_evento_id` (item de aluno) e `ficha_id` (professor), cada um único. Reprocessar o mesmo gatilho nunca gera segunda escrita; o valor gravado é sempre o estado vigente no momento da avaliação.

## Anti-laço

O sync (`upsert_presenca_emusys_bruta`) relê o que escrevemos e atualiza `emusys_presenca_bruta`/`sincronizado_emusys_em` — **sem tocar `respondido_por` nem `status_presenca`** quando já há resposta humana (comportamento já existente). A presença que escrevemos volta como evidência bruta, não como decisão nova — não gera evento, não entra na fila de escrita, não troca a fonte.

## Rollout

Nova superfície `emusys_escrita` em `presenca_rollout_config`, por unidade: `sombra` (só livro) → `canonico_v2` (escreve de verdade — mesmo vocabulário do rollout, sem modo novo). Começa as três em `sombra`. Relatório diário compara "o que escreveria" × "o que a secretaria marcou" × conflitos; liga por unidade quando os números justificarem, com o Alf.

## Testes e mutantes (as 8 travas)

1. Secretaria prevalece (falta humana lá não é pisada).
2. `justificada`/`cancelada` na linha bloqueia escrita.
3. Anti-laço: escrita nossa relida pelo sync não gera decisão nova nem troca `respondido_por`.
4. Idempotência: mesmo `evento_id`/`request_id` reprocessado → 1 linha, 1 PATCH.
5. Turma: PATCH vai no `aula_id` **individual** do aluno, nunca na mestre.
6. IDs por unidade: `aluno_id`/`aula_id`/`professor_id` só valem no token daquela unidade.
7. Professor só escreve com ficha `confirmado`/`gravado_emusys`; nunca desmarca presença da equipe.
8. `ausente`+`horario=null` tratado como "sem resposta" (escreve), nunca como falta humana (pularia).
9. **Evento antigo processado depois do novo não sobrescreve**: professor marca `presente` 10:05, secretaria corrige `falta` 10:30; se o gatilho das 10:05 é avaliado depois, o valor escrito é o vigente (`falta`), nunca o do gatilho.
10. **Falta do professor não apaga presença da secretaria**: `falta` vigente com fonte `professor_la_teacher`/`fabio_audio` × `presente` humano lá → `conflito_marca_humana`, sem PATCH. Com fonte `agenda_secretaria` → escreve.

## Fora de escopo / pendente de decisão

- `falta_justificada`: sem canal na API — pular e medir na sombra; se o volume justificar, pedir flag ao Emusys ou decidir `ausente` com o Alf.
- `professor_dia` (marca de dia da secretaria): não escreve por aula — só ficha confirmada.
- `horario` no PATCH: omitido — o changelog 1.7.0 diz que sem `horario` vale o **horário agendado da aula** (não a hora do PATCH). Se a secretaria precisar da hora exata, avaliar depois.
