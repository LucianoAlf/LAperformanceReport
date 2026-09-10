# Sol V4 e quatro camadas — resposta ao handoff do Alfredo

**Data:** 2026-09-09 · **Rodada:** read-only, nada implementado
**Autor:** agente do LA Report · **Base:** `origin/main` em `253a5db0`

> Auditoria do Alfredo recebida com checkpoint em `290807a`. **Ela está duas
> mudanças atrás** no ponto mais crítico do relatório dele: `#406` e `#407`
> entraram hoje e mexem exatamente no buraco do `itens[]` e no casamento de
> fatura. O que segue confronta a evidência dele com a viva, e diz onde ele
> está certo, onde está desatualizado e onde eu discordo com prova.

---

## Resumo em uma tela

| achado do Alfredo | veredito | evidência |
|---|---|---|
| repo de snapshot ≠ árvore de produto; 3 fontes | **confirmado, e pior** | `caixa-financeiro.cjs` **não existe no LA Report** — só 29 scripts de patch |
| não existe branch V4 | **confirmado** | — |
| V3 production/STRICT=1, V4 shadow | **confirmado** | env do bridge |
| latência do shadow | **confirmado** | mediana 2,582s (ele: 2,585s) |
| "36 oportunidades legado=nada" | **confirmado e rotulado** | 33 acionáveis com texto; **20 ganho, 5 falso positivo, 8 ambíguo** |
| V4 não devolve `itens[]` | **era verdade; mudou hoje** | `sol_caixa_resolver_pagamento_v1` (#406/#407) |
| Sol não escolhe as portas | **confirmado, e pior** | **zero chamadas em 09/09**; última 08/09 06:56 |
| 945 sinais, zero entregas | **parcialmente errado** | a equipe **recebe** os sinais — por outro caminho |
| USER/MEMORY de julho | **confirmado** | `mtime` 26/07, 45 dias |
| 16 skills, registry com 5 | **confirmado** | 16 diretórios + `_registry.md` |

---

## 1. Fonte de verdade

**Três fontes, e a mais importante não está versionada.** Confirmo o diagnóstico
e acrescento o dado que o torna mais grave: procurei `caixa-financeiro.cjs` no
LA Report e **ele não existe**. O que o repo guarda são **29 scripts de patch**
em `vps/la-hq/sol/scripts/` — ou seja, versionamos o **delta**, nunca o
artefato. Não há como responder "quais arquivos correspondem byte a byte ao
runtime": nenhum.

O runtime vivo é `/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs`,
5.310 linhas, fora de Git, com **~120 backups `.bak-*` no mesmo diretório** —
que é o versionamento de fato, por convenção de nome.

⚠️ **Isso não é só arrumação.** Hoje eu usei esses backups para bisseccionar uma
regressão (abaixo). Funcionou — mas por acidente, porque alguém teve a
disciplina de nomear. Um `rm *.bak-*` apaga a única história que existe.

**Como o código chega ao perfil:** por `scp` do patch + `node patch.cjs` na VPS,
que reescreve o arquivo com guarda de âncora e grava backup. Não há pipeline.

**Branches:** não auditei `sol-openclaw-backup` — não tenho acesso a esse repo
nesta rodada. Aceito o levantamento dele (12 branches, V3 14-69 commits atrás,
sem branch V4) sem confirmar.

---

## 2. O que é a V4

**Resposta honesta: é um roteador LLM em sombra sobre o parser legado.** Não é
agent-first. Concordo integralmente com o Alfredo.

- **Posição:** roda em paralelo, fire-and-forget, para toda mensagem de texto.
  Loga `roteador_v4_shadow` no `caixa.log` ao lado da ação do legado.
  **Nunca escreve, nunca responde.**
- **Modelo:** `minimax-m3`. **Latência:** mediana 2,582s, p90 4,918s (n=156).
- **Schema:** `{intencao, confianca, campos{aluno, valor, forma, categoria,
  competencia, entidade}}`. **Um aluno, um valor.**
- **O que classifica:** 11 intenções. **O que executa:** nada.

### O buraco do `itens[]` — mudou hoje, depois da auditoria dele

O Alfredo está certo sobre o schema da V4. Mas a lacuna que ele descreve
("34 alunos, matrícula + parcela e aluno com dois cursos continuam dependentes
do parser legado") foi **parcialmente fechada hoje, do lado do banco**:

`sol_caixa_resolver_pagamento_v1(unidade, itens[], valor_total, competencia)`
— **PR #406**, corrigida no **#407**. Ela é a interseção que faltava:

| ferramenta | cobre |
|---|---|
| `sol_caixa_resolver_multi_aluno_v1` | N alunos × **1** fatura |
| `sol_caixa_resolver_composto_aluno_v1` | **1** aluno × N faturas (exige 2+) |
| **`sol_caixa_resolver_pagamento_v1`** | **N alunos × N faturas** |

É **composição** das duas anteriores, não reimplementação. Devolve por aluno:
faturas com curso e competência, responsável financeiro, valor até o vencimento,
valor com multa/mora, e um `soma_confere` explícito.

**Contrato entregue** (o que o Alfredo pediu no item 4):

```
alunos[]: { ordem, ok, via: composto|canonica|parcela, motivo_escolha,
            aluno_nome, responsavel_financeiro, valor,
            faturas[]: { canonical_fatura_id, aluno_id, descricao, tipo_fatura,
                         competencia, status, valor_pago, valor_da_parcela,
                         valor_apos_vencimento, dias_atraso, data_pagamento } }
soma_resolvida · soma_confere · diferenca · resolvidos/total_itens
```

⚠️ **O modelo não inventa id e não escolhe fatura.** Ele devolve só
`{aluno_nome, valor}`; quem resolve fatura, aluno_id e responsável é a RPC. É
exatamente a divisão que o Alfredo propõe.

⚠️ **Mas o runtime ainda não a chama.** O caminho multi continua em
`sol_caixa_resolver_multi_aluno_v1`. Ligar os dois é trabalho da próxima rodada —
**não fiz nesta, por ser read-only.**

---

## 3. Shadow e qualidade

Reproduzi a janela dele (`08/09 11:14` → `09/09 15:31` BRT, filtro
`contexto_de = foto_pre_handle`). Instrumento:
[`tests/sol-runtime/reconciliar-shadow-alfredo.py`](../../tests/sol-runtime/reconciliar-shadow-alfredo.py).

| | Alfredo | eu | leitura |
|---|---|---|---|
| decisões | 161 | **156** | janela por minutos |
| mediana | 2,585s | **2,582s** | ✅ bate |
| p90 | 5,250s | **4,918s** | ✅ mesma ordem |
| legado=nada | 36 | **91 → 33 acionáveis** | ver abaixo |

**A diferença de 36 × 91 é de critério, e resolvê-la é o achado.** Dos 91 turnos
em que o legado não agiu, **54 (59%) o V4 também classificou como `conversa`** —
ou seja, **o legado acertou em não agir**. Descontando `conversa` e `nada`,
sobram **33 acionáveis com texto** — praticamente os 36 dele.

### Rotulagem manual das 33 (o que ele pediu)

| rótulo | n | |
|---|---|---|
| **ganho real** | **20** | lançamento por texto (11), correção de competência (3), descarte (3), correção de aluno/categoria (2), consulta (1) |
| **falso positivo** | **5** | ver padrão abaixo |
| **ambíguo / não executável** | **8** | ver abaixo |

**🔴 Os 5 falsos positivos têm padrão único e conhecido — 3 são colagem do
relatório de recebimentos:**

```
[08T20:39] lancamento_multi_aluno 0.92 · "03/09/2026 PIX RECEBIDO 11548030740 R$100,00=..."
[09T12:04] lancamento_por_texto   0.65 · "*Recebimentos em aberto CG* 🚩⚠️ *EMLA*..."
[09T15:25] lancamento_multi_aluno 0.60 · "*Recebimentos em aberto CG* 🚩⚠️ *EMLA*..."
```

É **exatamente o incidente de 31/08** já registrado no `CLAUDE.md` ("texto colado
no grupo da Sol é entrada de comando"). O legado tem guarda contra isso
(`_ehDitadoDeCaixa`, teto de 220 chars); **a V4 não tem**. Ligar a V4 sem
reproduzir essa guarda reabre o defeito.

Os outros dois:
- `"Lanca manualmente, Jhon"` (0.45) → instrução a uma pessoa, não à Sol
- `"Davi Guilherme curso de canto e curso de harmonia"` → **um** aluno, vários
  cursos, lido como multi-aluno

**🔴 Os 8 ambíguos concentram o risco financeiro.** Dois deles são:

```
[08T15:31] aprovar 0.85 · "Conferido✅"
[08T15:40] aprovar 0.85 · "Conferido também✅"
[08T22:43] aprovar 0.45 · "e outro pagamento, pode lançar"
```

A regra da casa exige **"pode" explícito** para mover dinheiro. O V4 classificou
"Conferido✅" como `aprovar` com 0.85. **Se a V4 executasse, isso seria
aprovação de dinheiro sem o gesto que a casa definiu como autorização.** Não é
regressão hipotética — está no corpus, três vezes em dois dias.

### Regressão que a sombra não pega

Achei hoje, fora do corpus dele, uma regressão que **nenhuma métrica de shadow
teria mostrado**, porque o V4 acertou nos dois lados:

O mesmo pagamento — Davi R$1.290 + Thuanny R$432 = R$1.722, CG — foi **lançado
com sucesso em 01/09** (`sol_caixa_lotes_v1`, 01/09 18:31, 2 itens) e **falhou
em 09/09**. Ninguém mexeu no código: bisseccionei o detector contra ~120 versões
e o comportamento é estável desde 24/08.

**A causa é a legenda.** Em 01/09 a Mayra escreveu os nomes ligados por "e";
hoje ela acrescentou o valor de cada um entre parênteses — para ajudar — e o
parêntese entre o nome e o "e" cegou `detectarContextoMultiAluno`.

> **A Sol entendeu menos porque a pessoa escreveu mais.**

Instrumentos: [`bissecao-multi-aluno.cjs`](../../tests/sol-runtime/bissecao-multi-aluno.cjs)
e [`prova-multi-aluno-09set.cjs`](../../tests/sol-runtime/prova-multi-aluno-09set.cjs).

---

## 4. Caixa complexo — o que cobri e o que não

**Cobri, com dado real de produção (não sintético):**

| caso | resultado |
|---|---|
| 2 alunos, um com 4 cursos (Mayra, R$1.722) | ✅ `ok`, soma confere |
| 1 aluna, 2 cursos (Fernanda, R$1.378) | ✅ `ok`, soma confere |
| 2 irmãos, competência já paga (Vitória, R$862) | ✅ `ok`, `ja_consta_paga` |
| aluno inexistente | ✅ recusa `aluno_nao_encontrado` |
| modelo alucinando nome fora da legenda | ✅ barrado |
| nomes vindos do OCR (pagador+favorecido) | ✅ barrado |

**NÃO cobri, e digo por quê:**

- **30-40 alunos** — não existe comprovante assim no corpus; construir fixture
  sintética de 40 nomes testaria o meu gerador, não a Sol.
- **matrícula + parcela no mesmo pagamento** — a RPC nova aceita por construção
  (`tipo_fatura` vem da fatura), mas **não tem caso real** para provar.
- **mutantes, estorno, abrir/fechar/reabrir, atomicidade** — não fiz. A
  atomicidade já tem guarda dura desde 01/09 (`itens gravados = itens do
  payload` **e** `soma = total`, senão `raise exception`), mas eu não a
  exercitei nesta rodada.

⚠️ **Sobre "R$ X cada" e competências diferentes:** o detector tem ramo para
`valor por cabeça`; competência divergente é o caso da Vitória e está resolvido
no #407. Nenhum dos dois ganhou teste próprio.

---

## 5. Agent-first e ferramentas

**O achado mais duro desta rodada, e ele é pior do que o Alfredo mediu.**

`automacao_log`, evento `sol_portas`, últimos 7 dias:

```
resolver_escopo                 21   07/09 17:48 → 07/09 18:18
sol_porta_pauta_do_dia_v1       13   07/09 18:47 → 08/09 06:56
sol_porta_registrar_desfecho_v1  6   07/09 20:30 → 07/09 20:32
chamada_direta                   6   07/09 18:19 → 08/09 06:45
sol_porta_caixa_do_dia_v1        4   07/09 18:19 → 08/09 06:54
sol_porta_numeros_da_unidade_v1  1
sol_porta_agenda_do_dia_v1       1
```

**52 chamadas ao todo, todas entre 07/09 17:48 e 08/09 06:56. ZERO em 09/09.**

Não é "ela nem sempre escolhe as portas" — **ela parou de usá-las**. Enquanto
isso, `sol-acesso-restrito` aparece **1.902 vezes** no log do MCP.

⚠️ **Não confirmei os `permission denied`.** Procurei em
`logs/mcp-stderr.log` e o grep devolve **zero**. Ou ele viu em outro arquivo, ou
em outra janela. **Peço a ele o caminho exato**, porque isso muda o diagnóstico:
"a Sol tenta a porta e é barrada" é diferente de "a Sol não tenta a porta".

**A causa mais provável já está registrada** (memória
`ferramenta-disponivel-nao-vence-instrucao`, 07/09): três skills mandam usar
`sol-acesso-restrito__query` *"sempre que possível"* — `sol-bi-admin:14`,
`sol-la-report-business-rules`, `sol-caixa-consulta:40`. Ferramenta nova não
vence instrução escrita. Enquanto essas linhas existirem, a porta perde.

---

## 6. Quatro camadas — **aqui eu discordo do Alfredo, com prova**

Ele escreve: *"945 sinais, zero destinatários ativos e zero entregas... a parte
tática/estratégica calcula, mas ainda não aborda a equipe."*

**A primeira metade está certa. A conclusão está errada: a equipe recebe os
sinais todo dia, e reclamou deles hoje.**

Confirmo os fatos dele:
- `radar_pauta_grupo` = **false**
- `radar_entregas` = **0 linhas**
- `radar_enfileirar_pauta_v1` não enfileirou nada

**Mas há um segundo caminho de entrega que ele não mapeou.** Os sinais vão ao
grupo **dentro do relatório comercial diário**, como seção `🔥 SINAIS DO DIA`,
montada em [`_shared/relatorio-comercial.ts:833`](../../supabase/functions/_shared/relatorio-comercial.ts#L833)
a partir de `radar_bloco_comercial_grupo_v1`, chamada pela edge
`relatorio-admin-whatsapp:1931`. Sai às **20:05 BRT**, cron do user `sol`.

**A prova de que chega:** hoje a **Vitória (CG)** e a **Daiana (Recreio)**
relataram, cada uma no seu grupo, que a maioria dos itens já estava resolvida.
Auditei as 79 linhas contra o Chatwoot ao vivo: **37 (46%) não deviam estar lá**
(PRs #401-#405). Não dá para receber reclamação de uma lista que não é entregue.

⚠️ **A consequência prática é a oposta da conclusão dele.** Se o gate é "manter
tudo desligado até o caixa fechar", então **o gate já está furado** — e não pela
pauta, que está corretamente off, mas pelo relatório comercial, que ninguém
listou como canal do radar.

Sobre as camadas: alicerce + Fatias 1 e 2 no banco, radar rodando (945 sinais),
proatividade da **pauta** desligada. Não auditei o 3º andar nesta rodada.

---

## 7. Bootstrap e skills

Confirmo os dois achados, com `mtime`:

```
SOUL.md    8.378 B   18/08
AGENTS.md  7.576 B   18/08
USER.md    3.057 B   26/07   ← 45 dias
MEMORY.md  3.313 B   26/07   ← 45 dias
```

**`USER.md` e `MEMORY.md` são de 26 de julho** — anteriores a V3 production, V4,
portas e quatro camadas. O perfil ativo é `/home/sol/.hermes/profiles/sol`.

**Skills:** 16 no perfil (+ `_registry.md` + 1 backup = 18 entradas). Não
comparei uma a uma com o workspace legado — aceito o "13 duplicadas, 6
divergentes" dele sem confirmar.

**Não apliquei nenhuma mudança**, conforme pedido.

---

## 8. Gate da V4 — critérios que eu proporia

Concordo com **não recomendar flip global**. Proponho estes critérios, todos
derivados de evidência desta rodada e não de teoria:

1. **Guarda de texto colado reproduzida na V4.** 3 dos 5 falsos positivos são
   colagem do relatório de recebimentos. Sem `_ehDitadoDeCaixa` do lado da V4, o
   flip reabre o incidente de 31/08. **Bloqueante.**
2. **`aprovar` nunca sai do LLM.** "Conferido✅" virou `aprovar` 0.85 três vezes
   em dois dias. Aprovação de dinheiro continua exigindo o "pode" determinístico,
   sem exceção e sem limiar de confiança. **Bloqueante.**
3. **`itens[]` no schema da V4**, ligado a `sol_caixa_resolver_pagamento_v1`. O
   contrato existe desde hoje; falta o runtime chamá-lo.
4. **Corpus rotulado ≥ 200 turnos acionáveis** (hoje: 33). Com 33 não dá para
   medir precisão por intenção — as intenções raras têm n=1.
5. **Abstenção medida.** Hoje não sei quantas vezes a V4 devolveu confiança baixa
   e o legado acertou; sem isso, "ela acha mais" não distingue faro de ruído.
6. **Piloto por grupo e turno**, com a V4 executando **só** as intenções de
   ganho comprovado (`lancamento_por_texto`, `descartar`,
   `corrigir_competencia`) e **nunca** `aprovar`.
7. **Rollback por env var**, já existente (`SOL_CAIXA_V4_SHADOW`).
8. **Recibo com readback**: toda ação da V4 responde o que gravou, com id, para a
   pessoa conferir na hora.

---

## O que eu não fiz, e por quê

Sendo direto, porque metade do handoff pede trabalho que não cabe numa rodada:

- **não auditei `sol-openclaw-backup`** — sem acesso nesta sessão
- **não fiz matriz de precisão/recall por intenção** — n insuficiente (33
  acionáveis, várias intenções com n=1); daria número com aparência de rigor e
  sem valor
- **não construí fixtures de 30-40 alunos, mutantes, estorno, atomicidade**
- **não reconciliei skills uma a uma** com o workspace legado
- **não confirmei os `permission denied`** — preciso do caminho do log

**Nada foi implementado, deployado ou reiniciado nesta rodada.** As mudanças de
produção citadas (#406, #407) são de **antes** deste handoff, feitas hoje a
pedido do Luciano, e estão em `origin/main`.

---

## Pedidos ao Alfredo

1. **Caminho do log dos `permission denied`** — não achei em `mcp-stderr.log`.
2. **Sua leitura sobre o furo do gate**: os sinais saem pelo relatório comercial
   das 20:05. Isso muda a recomendação de "preservar tudo desligado"?
3. **Concorda com a ordem?** Eu inverteria os itens 3 e 4 da sua lista: fazer o
   modelo escolher a porta (4) é pré-requisito de qualquer coisa agent-first, e
   hoje o uso das portas é **zero**. `itens[]` já tem a RPC pronta; escolha de
   porta não tem nem sinal de vida.
