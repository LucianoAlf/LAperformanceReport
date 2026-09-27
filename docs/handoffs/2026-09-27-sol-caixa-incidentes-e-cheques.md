# Handoff — Sol: incidentes do caixa (25–26/09) e lote de cheques no caixa

**Data:** 27/09/2026 · **Autor:** agente da Sol (Claude), com autorização do Alf para publicar na VPS
**Para:** agentes que mexem na Sol (runtime do caixa, bridge, banco) e no Super Folha
**Regra deste documento:** nenhum CPF, telefone, JID, token ou senha. Alunos aparecem só quando a referência é inevitável e sem dado sensível.

---

## 1. Estado atual em produção (VPS la-hq, usuário `sol`)

| Arquivo | Onde | Última publicação |
|---|---|---|
| `bridge.js` | `/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/` | PR #514 |
| `group-engagement.cjs` | idem | PR #514 |
| `caixa-financeiro.cjs` | `/home/sol/.hermes/profiles/sol/caixa-ingestao/` | PR #518 (este) |
| `caixa-cheques.cjs` | idem | PR #518 (este) |
| `cheques-lote-cli.cjs` | idem | PR #518 (este) |
| `cheques.json` (config, **não versionado**) | idem | `modo: "grupo"` desde 27/09 00:11 UTC (autorizado pelo Alf) |

- Hash de cada arquivo: `vps/la-hq/sol/runtime/deploy-manifest.json` e `RUNTIME_BASELINE.sha256`. **Conferir o hash vivo antes de qualquer deploy** (`sha256sum`), senão um repo atrás da VPS apaga correção em silêncio.
- **Como publicar sem derrubar o agente:** backup `*.bak-<ts>-antes-prNNN` → `install -o sol -g sol -m 0644` → matar só o processo `bridge.js --port 3000`. O `hermes-gateway-sol` sobe a ponte de novo em 5–8 s. Conferir `curl 127.0.0.1:3000/health` → `"status":"connected"` e o `scriptHash`. ⚠️ O `grep connected` também casa com `disconnected`: procure `"status":"connected"`.
- **Rollback:** copiar o `.bak` de volta e matar a ponte do mesmo jeito.
- **Suíte:** `SOL_CAIXA_V3_LEDGER_FAKE=1 SOL_CAIXA_V3_LEDGER_MODE=production` + `node` em cada `tests/sol-runtime/*-e2e.cjs`. Estado em 27/09: **69 passam, 0 falham, 4 pulam** (precisam de credencial). Contra o arquivo vivo, use `SOL_CAIXA_CJS=<caminho vivo>`.

---

## 2. Linha do tempo das correções (todas mergeadas na `main`)

| PR | Unidade / incidente | Raiz | O que mudou |
|---|---|---|---|
| #506 | Recreio 25/09 — a Sol trocou o aluno de um Pix | O aluno certo estava **trancado**, e 9 funções `sol_caixa_*` só aceitavam `status='ativo'` | `sol_caixa_aluno_pode_pagar_v1` / `_matriculado_v1` (migration `20260925180000`); resposta "foi por pix" ao card clássico não vai mais ao agente |
| #507 | — | Versionamento (Alfredo) | revisado e mergeado |
| #508 | Pedido do Alf | Quitação de N meses virava 1 fatura só | `fatura_ids` no lançamento; intervalo de meses ≠ lista |
| #511 | CG 26/09 — card travado "fonte oficial" + "Os dados estão corretos sol" virou nome de aluno | Competência futura travando o mês corrente; texto sem rótulo lido como aluno | trava lateral só quando o mês declarado é o futuro; nome tardio sem rótulo não substitui aluno |
| #512 | CG 26/09 — mesma trava em outro aluno | **O mês seguinte não tinha produtor horário** no espelho financeiro, e a canônica passou a exigir ele em 17/09 | cron `financeiro-sync-anteriores-60m` cobre também o mês seguinte (migration `20260926180000`) |
| #513 | Barra 26/09 — "abre o caixa" ignorado | O card esperava o caixa abrir e o "abre o caixa" era barrado pelo card | abrir funciona com card pendente (fechar continua bloqueado); recibo de checkout ("Data do pagamento", "Código da transação") é comprovante |
| #514 | Barra 26/09 — Sol "faladeira" | Janela de conversa de 8 min **renovada a cada fala humana** | 3 min contados da última resposta da Sol; "não é com você" dispensa; "kkk"/"ih"/emoji não viram turno |
| #515 | Barra 26/09 — passaporte de R$ 550 lançado **3×** | (1) 2 PDFs juntos viravam um comprovante; (2) revisão "vários alunos" respondia a qualquer mensagem; (3) "pode" lançava a revisão sem aluno; (4) aviso de duplicidade era só texto | 1 mídia = 1 comprovante; revisão só avança com citação ou dono + valor; "pode" nunca lança revisão; duplicidade exige **"pode, é outro pagamento"** citando o card |
| #516 | Cheques v1 | — | substituído pelo #517 (ver §4) |
| #517 | Cheques no caixa | Decisão do Alf | ver §3 |
| #518 | Cheques: mensagem organizada e lotes grandes | A 1ª mensagem era texto corrido | ver §3.4 e §3.6 |

**Roteador V4 em sombra (combinado de 31/08: todo incidente reporta como ele decidiu):**
- CG: "Os dados estão corretos sol" → `aprovar` 0,95 (acertou onde a Sol errou).
- Barra: "abre o caixa" → `abrir_caixa` 0,98–0,99 (acertou).
- Barra, R$ 550 em dobro: marcou "Falta mais algum?" como `conversa` 0,95 (acertou). Mas classificou como `aprovar` 0,95 o "Pode" que o Luciano deu depois de "Sol, fecha o caixa", que era para o fechamento (errou igual à Sol).

---

## 3. Lote de cheques → caixa da Sol

### 3.1 O que o Alf pediu (decisão final, 26/09)
A unidade posta no grupo do financeiro o PDF com a cópia dos cheques do depósito ("2 CH - 20SETEMBRO2026 - C.GRANDE"; lotes reais têm **10 a 15 cheques**). A Sol:
1. lê cada cheque;
2. acha o aluno, o responsável financeiro e a parcela;
3. **lança no caixa da Sol do dia** (LA Report → Administrativo → Caixa da Sol), forma `cheque`, pelo card e "pode" de sempre.

**O Super Folha não é chamado.** Ele já puxa o caixa da Sol (`export-caixa-movimentacoes`). O número do cheque vai na descrição, e é por ele que o Super Folha liga o depósito e a devolução do banco.

### 3.2 Peças

| Peça | Onde | Função |
|---|---|---|
| `caixa-cheques.cjs` | runtime da Sol | reconhecer, ler, provar, resolver, decidir, montar a mensagem |
| desvio no `handle` | `caixa-financeiro.cjs`, logo após `if (!grp)` | antes de agente, lote de mídia e comprovante; com `modo=off` devolve `null` e nada muda |
| `abrirCardCheques` | `caixa-financeiro.cjs` | 2+ cheques → `abrirFluxoMultiAluno` com `resolvidoPronto` (lote); 1 cheque → lançamento simples |
| `sol_cheque_resolver_fatura_v1` | banco (feita pelo agente do LA Report, commit `185a002d`) | emitente (nome ou hash do CPF) → pessoa → faturas candidatas com `score` |
| `sol_cheque_documento_hash_v1` | banco, migration `20260926230000` | HMAC-SHA256 do CPF/CNPJ com a chave do Vault `emusys_cpf_hmac_key_v1`; só `service_role`; não grava |
| `complemento_descricao` | `sol_caixa_lancar_recebimento_lote_v1`, migration `20260927000000` | anexa "· cheque Santander nº 000212" à descrição de cada movimentação do lote; sem o campo, comportamento idêntico |
| `cheques-lote-cli.cjs` | runtime | lê e decide um lote **fora do grupo** (não abre card, não lança) |

### 3.3 Como a leitura funciona e por que dá para confiar
- **O PDF é escaneado** (CamScanner): `pdftotext` devolve vazio. `pdftoppm -r 200` (até 20 páginas) → PNG → visão.
- **Modelo:** `gemini-3.8-flash` pelo OpenCode Zen (chave em `caixa-ingestao/.secrets/zen.env`, a mesma do roteador V4).
  - ⚠️ No Zen **cada família tem protocolo próprio**: Gemini em `/zen/v1/models/<m>:generateContent`, GPT em `/zen/v1/responses`. `chat/completions` devolve `400 ModelProtocolUnsupported`.
  - ⚠️ User-Agent obrigatório.
  - Medido em 26/09 com o PDF real: Gemini 3.8 Flash leu tudo em 13 s. O `hermes chat --image` levou 2min27s, não leu a CMC-7 e errou o valor. Os GPT erraram valor ou CMC-7.
  - Tempo de ponta a ponta do lote: 20 s a 88 s (o modelo varia).
- **A leitura é PROVADA por código**, não pela confiança do modelo:
  - CMC-7 de 30 dígitos: `[banco3 agência4 DV2] [comp3 número6 tipif1] [DV1 conta10 DV3]`. Módulo 10, pesos 2-1 a partir da direita. DV2 valida o campo 2, DV1 valida banco+agência, DV3 valida a conta. Conferido à mão nos dois cheques reais.
  - CMC-7 tem de bater com banco, agência e número **impressos**.
  - Valor numérico tem de bater com o **extenso** (parser próprio em português).
  - Qualquer falha → o cheque vira ❓ "leitura" e **não entra no caixa** (número errado ligaria o depósito errado no Super Folha).
- **Emitente** = nome IMPRESSO no rodapé. O nome escrito à mão (a escola ou quem recebe) é o **beneficiário** e nunca é usado para achar o pagador.
- **CPF/CNPJ** vira hash no banco. O documento em claro só existe na memória do processo e é apagado antes de qualquer saída ou log.
- **O PDF e as imagens são apagados** depois da leitura.

### 3.4 Decisão por cheque (`decidirCheque`)
Com a fatura REAL (`emusys_faturas`) e os vínculos do caixa (`vw_caixa_movimentacao_fatura_links`):

| Decisão | Quando | Seção na mensagem |
|---|---|---|
| `lancar` | fatura paga **em cheque**, ou em aberto, com o valor batendo | ✅ VAI PARA O CAIXA |
| `retirar` | fatura paga por **outra forma** (Pix, cartão) ou cancelada | ⚠️ RETIRAR DO MALOTE |
| `ja_no_caixa` | fatura já ligada a um lançamento do caixa | ❓ PRECISA DE VOCÊ |
| `valor` | valor do cheque ≠ valor da parcela | ❓ |
| `sem_parcela` | emitente fora do cadastro, empate, ou dois cheques na mesma parcela | ❓ |
| `leitura` | leitura não provada | ❓ |

**Escolha da parcela (`escolherFatura`):**
- candidata destacada (score ≥ 0,10 acima da segunda) → usa;
- empate entre parcelas do mesmo emitente → a de data mais próxima do bom-para/lote, só se for **estritamente** a mais próxima;
- emitente desconhecido → sem fatura, com **suspeitos** para o grupo responder. Os suspeitos só são **ordenados** (sobrenome em comum primeiro; parcela já casada no lote sai). A Sol nunca escolhe dono sozinha.

### 3.5 Lançamento
- A mensagem organizada do lote **é o card** (preview V3). Um "pode" citando ela lança todos os ✅ no caixa do dia.
- 2+ ✅ → um lote (`sol_caixa_lancar_recebimento_lote_v1`, atômico, com revalidação de cada fatura no "pode").
- 1 ✅ → lançamento simples (`sol_caixa_lancar_recebimento`).
- As RPCs de lote **exigem 2 itens**, por isso a divisão.
- O limite de 12 alunos por lote (`SOL_CAIXA_MAX_ALUNOS_LOTE`) **não vale** para cheques (`tetoItens: 60`): ele protege o resolvedor de Pix, que o lote de cheques não usa.
- **Resposta a um ❓:** "3 é da Fulana", citando a mensagem. O nome volta à mesma RPC (caminho `nome`); se o cheque passar a `lancar`, sai um card só dele.
- **Travas herdadas do caixa:** o "pode" do lote revalida cada fatura; a duplicidade do #515 vale no lançamento simples; fatura já no caixa nunca entra.

### 3.6 Formato da mensagem (pedido do Alf em 27/09)
Hierárquico, uma informação por linha, o mesmo vocabulário do card de comprovante. Exemplo com dados inventados:

```
🧾 *Lote de cheques — Campo Grande*
📅 Depósito de 20/09 · 3 cheques · R$ 1.101,00

✅ 2 vão para o caixa — R$ 734,00
❓ 1 precisa de você

━━━━━━━━━━━━━━
✅ *VAI PARA O CAIXA*

*Cheque 1* — R$ 367,00
🏦 Santander · nº 000212
✍️ Emitente: Fulano de Tal
🎓 Aluno: Beltrana de Tal
👤 Resp. financeiro: Fulano de Tal
📄 Parcela 09/2026 do curso de Violão
💳 Paga no Emusys em 23/09 · Cheque Pré Datado — ✅ confere
...
━━━━━━━━━━━━━━
❓ *PRECISA DE VOCÊ*

*Cheque 3* — R$ 367,00
🏦 Itaú · nº 000064
✍️ Emitente: Sicrano da Silva
🔎 Não achei esse emitente no cadastro.
   Pode ser da família de:
   • Maria da Silva (aluno João da Silva)

━━━━━━━━━━━━━━
👉 *Posso lançar R$ 734,00 (2 cheques) no caixa de hoje?* Responde *pode* citando esta mensagem.
❓ Para os demais, responde citando esta mensagem: *3 é da Fulana*.
```

- "Cheque N" é a **ordem de leitura** e não muda entre seções: é por ele que a equipe responde.
- 15 cheques ≈ 3,6 mil caracteres (testado).

### 3.7 Modos (`caixa-ingestao/cheques.json`, sem reinício)
- `off`: não intercepta.
- `sombra`: lê, prova e decide, e manda a mensagem **só** para o WhatsApp do Alf (`sombra_jid`). Nada no grupo, nenhum card, nada no caixa.
- `grupo` (**atual**, desde 27/09): mensagem-card no grupo, "pode" lança.
- Variáveis de ambiente `SOL_CHEQUES_MODO` / `SOL_CHEQUES_SOMBRA_JID` / `SOL_CHEQUES_VISAO_MODELO` têm precedência sobre o arquivo.

### 3.8 Validação feita
- `tests/sol-runtime/cheques-lote-e2e.cjs` (dados inventados), pelo handler real, cobrindo:
  - CMC-7, extenso, data do lote e reconhecimento do lote;
  - as seis decisões;
  - lote de 5 cheques com as três seções;
  - lote de **15 cheques** num card só;
  - lançamento simples com a fatura vinculada;
  - resposta "é da Fulana";
  - modo sombra e modo off.
- PDF real (2 cheques, CG), em sombra no grupo e pela CLI: os dois lidos com CMC-7 válida; o Santander nº 000212 → parcela 09/2026 (fatura Emusys 41790), vai para o caixa; o Itaú nº 000064 → emitente fora do cadastro, "precisa de você".
- **Não exercitado ao vivo:** o "pode" real num card de cheque (grava dinheiro). Primeiro teste real: ligar `modo: "grupo"` e repostar o PDF em CG com o caixa aberto.

---

## 4. O que foi descartado e por quê
- **Sol chamando o Super Folha direto** (PR #516: `conferir`/`registrar` na edge `cheques-sol`, via uma edge-ponte `sol-cheques-super-folha` no LA Report). Funcionou, mas o Alf decidiu que o cheque entra no caixa da Sol e o Super Folha puxa de lá. A edge-ponte foi **apagada** do Supabase e do repositório. O segredo do Super Folha **nunca** foi para a VPS.
- **Resolver os cheques pelo resolvedor de pagamentos do Pix** (`sol_caixa_resolver_pagamento_itens_v1`): ele procura por nome + valor. Uma família que deixa seis cheques pré-datados tem seis faturas iguais e empataria. A RPC de cheques usa bom-para, o recebimento lançado no Emusys e o hash do CPF.

---

## 5. Pendências (ninguém fez ainda)

### Dados de caixa (decisão humana; nada foi alterado)
- ✅ **Barra, caixa de 26/09 — RESOLVIDO em 27/09 00:0x UTC** (autorizado pelo Alf). Reaberto pela RPC `reabrir_caixa_diario` (retrato em `caixa_reaberturas_log`), excluídos `dc6ba05b…` (17:36, sem aluno) e `555df452…` (08:56, sem fatura) — as duas exclusões ficaram no `audit_log` —, mantido `3f4120b7…` (com fatura), refechado. Cartão do dia: **R$ 1.499,00**; 4 lançamentos. Confirmação postada no grupo da Barra. ⚠️ **Foi exclusão, não estorno**: o estorno (`sol_caixa_estornar_movimento_v1`) exige aprovação V3 nascida de um "pode" real no WhatsApp, e montar essa aprovação por fora seria fabricar a trilha; pela conversa, a Sol não consegue escolher entre três lançamentos iguais de R$ 550 (a busca devolve "achei mais de um"). A exclusão é o mesmo caminho da tela do caixa (`useCaixaDiario.excluirMovimento`), com o autor e o motivo registrados.
- **CG:** movimentação `0a2e91a7…` (Pix R$ 397, 26/09) com descrição errada ("… - estão corretos sol") e sem fatura — deveria ser a Parcela 09/2026 do aluno do caso #511.
- **CG:** um comprovante de R$ 380 (parcela 10/2026, caso #512) nunca foi lançado: reenviar e "pode".

### Técnicas
1. Cheques: o **primeiro "pode" real** num card de cheque ainda não aconteceu. Teste combinado: repostar o PDF de CG com o caixa de 27/09 aberto; esperado 1 ✅ (Santander nº 000212, fatura Emusys 41790, R$ 367) e 1 ❓ (Itaú nº 000064). Depois do "pode", conferir a movimentação (forma `cheque`, fatura ligada, "· cheque Santander nº 000212" na descrição).
10. Estorno pela conversa não desempata lançamentos iguais (mesmo valor, forma e categoria): a busca devolve "achei mais de um" e não há como escolher pelo horário ou pela lista. Foi o que forçou a correção da Barra pelo caminho da tela.
2. Cheques: a resposta "N é da Fulana" usa a mesma RPC pelo caminho do nome; não foi exercitada com o grupo real.
3. Cheques: `npm run mapa:banco` não foi rodado (precisa da senha do `postgres`); as funções novas não estão no mapa.
4. Recusa de "abrir o caixa" para quem não é do administrativo: a ferramenta devolve só `fora_do_publico`, e o agente disse "o **grupo** não tem permissão" sem conferir que o caixa já estava aberto.
5. Legenda que chega **depois** de um arquivo já recusado não faz a Sol reavaliar o arquivo.
6. Arquivo sem legenda pega como legenda a última mensagem de texto dos últimos 150 s, mesmo que seja um comando já tratado.
7. Card de quitação sugere "me diz: de X a Y", mas nenhum caminho trata essa resposta.
8. Dois agentes lançando a mesma fatura em paralelo: sugerida uma trava no banco em `sol_caixa_lancar_recebimento`.
9. `sol_cheque_resolver_fatura_v1` tem `EXECUTE` para `authenticated` (com guarda de unidade por dentro). Avaliar se precisa.

---

## 6. Onde ler mais
- Regras do caixa e dos incidentes: `CLAUDE.md` (entradas de 25–27/09).
- Integração financeira e cheques: `docs/sistema/financeiro.md` → "Lote de cheques para depósito → caixa da Sol".
- Contrato original com o Super Folha (parcialmente substituído, ver §4): repositório do Super Folha, `Docs/handoffs/2026-09-26-sol-cheques-lote-deposito.md`.
- Testes: `tests/sol-runtime/cheques-lote-e2e.cjs`, `barra-26set-duplicidade-e-revisao-zumbi-e2e.cjs`, `grupo-fala-so-quando-chamada-e2e.cjs`, `abrir-com-card-pendente-e-recibo-checkout-e2e.cjs`, `fonte-futura-lateral-e-nome-sem-rotulo-e2e.cjs`.
