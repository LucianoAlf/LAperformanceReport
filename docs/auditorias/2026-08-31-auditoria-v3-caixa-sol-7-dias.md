# Auditoria — 7 dias da V3 do caixa da Sol (24–31/08/2026)

**Escopo:** a V3 de preview/approval do Alfredo (ledger `sol_caixa_shadow_*_v1` +
validador `sol_caixa_v3_validar_approval_v1` + consumo único), os incidentes da
semana nos grupos FINANCEIRO das 3 unidades, e a pergunta do Luciano: *"os
problemas continuam — a arquitetura está certa?"*

**Fontes:** tabelas do ledger V3, `sol_caixa_lancamento_auditoria`,
`caixa_movimentacoes`/`caixas_diarios`, `caixa.log` da VPS (rastro completo por
evento) e os prints/incidentes reportados dia a dia.

---

## 1. O que a V3 garante (e garantiu)

Fluxo: evento → preview persistido (hash de valor/forma/categoria) → "pode" →
approval vinculado → validador revalida **tudo** (unidade, grupo, ator, hash,
valor, forma, categoria, expiry 4 h) → **consumo único** → RPC auditada.

### Números da semana (dom 30/08 sem operação)

| métrica | valor |
|---|---|
| operações de escrita via Sol | **51** (41 recebimentos, 8 itens em lote, 2 saídas) |
| com par V3 validado e consumido | **47** consumos (45 `lancar_recebimento` + 2 `lancar_saida`) |
| lançamento SEM approval V3 | **0** |
| bloqueio INDEVIDO da V3 (falso positivo) | **0** (`v3_approval_bloqueou_*` = 0 no log da semana) |
| recusas legítimas de guarda | 2 (abrir com fechamento pendente; saída de cofre não-dinheiro) |
| previews reais / approvals reais | 308 / 49 |
| aberturas/fechamentos | 3/dia, todos os dias úteis |

**Veredito da camada V3: sólida.** Em 7 dias, nenhuma escrita passou sem o par
preview-aprovação, nenhum lançamento legítimo foi bloqueado, o consumo único
impediu duplicata, e em 31/08 ela viabilizou o próprio ADM (Arthur/Barra) abrir
uma **correção auditada** pelo WhatsApp. A invariante mais dura — categoria/
valor/forma idênticos entre preview e aprovação — provou seu valor no fix do
"pode condicional" (ver §3): a correção só pôde ser aplicada **re-registrando o
preview**, nunca por fora.

---

## 2. Achados da auditoria (os dois graves foram corrigidos hoje)

### A1 🔴 A suíte de testes escrevia no ledger V3 de produção — corrigido

Os testes rodavam com `SOL_CAIXA_V3_LEDGER_MODE=production` (deliberado, para
exercitar a fiação V3) **sem mockar** `registrarPreviewV3Fn`/
`registrarApprovalV3Fn` — cujo default é a RPC real. Medido:

- **499 dos 807 previews da semana (62%) eram artefato de teste** — com
  `unidade_id` real de CG/Barra. Discriminador: `preview_json->>'preview_message_id'
  ~ '^MSG\d+$'` (id do `sendFn` mockado; id real de WhatsApp é `3EB0…`).
- **13 approvals sintéticos** (join pelo `preview_id`).
- Qualquer métrica da V3 lida ingenuamente inflava ~2,6×.

**Fix na raiz** (ponto de injeção, não teste a teste — a mesma doutrina do fuzzy
de 29/08): `SOL_CAIXA_V3_LEDGER_FAKE=1` troca os registradores por fakes em
memória dentro de `criarHandlerFinanceiro`; fiação V3 continua 100% ativa, banco
intacto, teste novo nasce protegido. Mock explícito (inclusive o que FALHA, no
gate-regressao) continua valendo. **Prova de estanqueidade:** suíte inteira
(21 arquivos) rodada com contagem do ledger idêntica antes/depois (958/86).

As linhas sintéticas **ficaram** no ledger — ledger é append-only e expurgo é
decisão de vocês (Hugo/Alfredo); o discriminador acima separa com precisão.

### A2 🔴 DELETE de movimento do caixa era SEM RASTRO — corrigido

Caso real de hoje: os lançamentos de R$ 633 (StarLine) e R$ 300 (Pareidolia) em
CG foram confirmados pela Sol ("Lancei ✅", `movimentacao_id` na auditoria, insert
e trilha na MESMA transação da RPC) e **sumiram de `caixa_movimentacoes` minutos
depois** — apagados por alguém da equipe pela tela do caixa
(`useCaixaDiario.excluirMovimento` faz DELETE físico com caixa aberto). Não havia
como dizer quem nem por quê: zero trilha. É a mesma armadilha da Catarina
Petrolongo em `movimentacoes_admin` (03/08).

**Fix não-intrusivo** (migration `20260831191500`): trigger `fn_audit_log`
(genérica, 22 tabelas) anexada a `caixa_movimentacoes` — INSERT/UPDATE/DELETE
agora deixam autor, hora e a linha inteira em `audit_log`. A equipe continua
podendo excluir (fluxo legítimo); bloquear+lixeira (padrão `movimentacoes_admin`)
fica como decisão futura se o rastro mostrar problema.

⚠️ As duas linhas **não foram recriadas**: apagar foi decisão humana (dinheiro de
evento de bandas — plausível que não pertença ao caixa da unidade), e recriar por
cima seria atropelá-la. Se era para relançar certo, reenviar o comprovante
funciona (não há trava de idempotência pendurada — conferido).

### A3 ⚠️ Pendências do runtime vivem só na MEMÓRIA do bridge — aberto

Restart do bridge (deploy, crash, reconexão do WhatsApp) apaga os previews em
aberto. Caso real de hoje: o Arthur abriu a correção V3 do capotraste às 17:58 e
o restart do deploy comeu a pendência antes do "pode" dele — o "pode" seguinte
cairia em `pode_sem_pendencia`, **em silêncio**. Ironia: o ledger V3 já guarda
tudo que é preciso para reidratar (preview registrado + não consumido = pendência
viva). **Recomendação: próxima frente da V3 — reidratar pendências do ledger no
boot do bridge.** Enquanto isso, deploy de runtime deve preferir janela sem
pendência aberta (o log mostra na hora).

---

## 3. Os incidentes da semana — "os problemas continuam?"

Linha do tempo do que quebrou e por quê:

| dia | caso | classe |
|---|---|---|
| 25/08 | nome solto virava correção de outro card; "R$ 53" inventado pelo LLM; "Certinho" levava "não entendi" | gramática nova + vazamento p/ LLM |
| 27/08 | saída em dinheiro (2 refrigerantes) não reconhecida | gramática nova (saída por legenda) |
| 28-29/08 | multi-aluno falso-positivo por OCR; legenda de reenvio; colisão de 2 comprovantes (Fernanda/Daiana); camisa multi-trap; vendedor virou aluno; forma no cupom ignorada | gramática nova + doutrina OCR |
| 29/08 | Soraia→Laura (fuzzy cruzado); responsável de outra família; artefato "(Response formatting failed)" | **raiz em RPC** + rabiolas |
| 31/08 | homônimo remetente×aluno; prefixo "foi"/"nome do aluno" grudado; "é de banda, não tem aluno"; "pode, mas coloca a categoria como venda"; DELETE sem rastro | gramática nova + achados de auditoria |

**A resposta honesta: os casos corrigidos NÃO regrediram.** Verificado dos dois
lados: a suíte canônica (21 arquivos, cada um travando um caso real da semana)
está verde contra o módulo em produção, e nenhum sintoma de dia anterior
reapareceu nos logs dos dias seguintes (ex.: zero `manual_review_multi_student`
indevido após o fix da camisa; zero fuzzy cruzado após a migration de 29/08; a
guarda de nome-diverge de 29/08 foi exatamente o que **pegou** o caso de hoje no
log). O que o Luciano vê como "continua dando problema" é outra coisa:

> **Cada dia a equipe emprega uma construção de linguagem ou uma situação de
> negócio que o parser determinístico nunca viu.** Foram ~5 gramáticas novas em
> 7 dias (saída por legenda, colisão de autores, sem-aluno/banda, aprovação
> condicional, homônimo remetente). Isso não é regressão — é cobertura
> incremental de um espaço aberto (linguagem natural de 10+ pessoas em 3
> grupos) com um parser fechado (regex/gramática).

### Veredito de arquitetura

- **Camada de escrita (V3): certa.** Zero furos em 7 dias; manter.
- **Camada de diálogo (entendimento de correções): é onde dói.** Enquanto for só
  gramática determinística, a taxa esperada é ~1 construção nova por dia útil,
  cada uma custando um lançamento sujo ou um "Não entendi" — e uma rodada nossa
  de patch+teste.

**Recomendação estrutural** (proposta, não implementada — decisão de vocês):
fechar o funil com um **classificador LLM de fallback** só para mensagem com
pendência aberta que a gramática não entendeu (hoje ela cai em "Não entendi" ou
silêncio). Saída estruturada restrita — `{intencao: corrigir_aluno |
corrigir_categoria | corrigir_valor | corrigir_forma | sem_aluno | descartar |
aprovar | nada, campos}` — que alimenta os MESMOS caminhos determinísticos já
testados; o LLM **nunca** escreve, nunca gera texto livre, e a V3 continua
segurando a escrita com preview+approval. Volume estimado: ~10 mensagens/semana
(as que hoje viram "Não entendi") — custo desprezível, e o "Não entendi" vira
último recurso em vez de primeiro. As gramáticas existentes continuam na frente
(rápidas, determinísticas, grátis).

---

## 4. Correções de hoje (31/08), todas com teste travando

| raiz | caso real | fix |
|---|---|---|
| R-a rótulo de aluno vence remetente homônimo | capotraste, "para o aluno Arthur Vargas" descartado porque o ADM se chama Arthur | guarda `e_quem_enviou` não descarta aluno DECLARADO na legenda |
| R-b lixo verbal no extrator de nome | "Aluno **foi** Arthur Vargas Caldas" / "**Nome do aluno** Starline" viraram o nome | strip iterativo + rótulo com `:` aceita 1 token |
| R-c gramática sem-aluno/banda | "é de Banda, nome Starline, não tem aluno específico" → "Não entendi essa" | `_semAlunoDeclarado`: limpa exigência, guarda "Banda Starline", vira venda |
| R-d aprovação condicional | "pode, mas coloca a categoria como venda" → silêncio + lançou "outro" | `casarPode` extrai a categoria, re-registra o preview V3 e lança certo |

Dados corrigidos: capotraste Barra (descrição limpa + vínculo aluno 1653,
migration `20260831190000`, caixa aberto, rastro na auditoria). Testes novos:
`aluno-rotulado-e-nome-tardio-e2e.cjs` e
`banda-sem-aluno-e-pode-condicional-e2e.cjs`; suíte canônica 21/21; suíte legada
da VPS no baseline (21 falhas pré-existentes de arquivos não mantidos — ver
README da suíte).

Deploy: patch `_patch-raiz-31ago.cjs` + `_patch-v3-fake-ledger.cjs`, backups
`bak-*-before-raiz-31ago` / `bak-*-before-v3-fake`, bridge respawnado, zero
`init_erro`, md5 vivo = testado (`b733c2f9ac1d1fb0baeae7485c219d2f`), e o
primeiro fluxo real pós-deploy (passaporte R$ 400/CG) rodou limpo ponta a ponta
com vínculo canônico.
