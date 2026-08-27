# Relatório completo — Sol / Caixa (estado em 27/08/2026)

**Objetivo deste documento:** handoff autocontido para retomar o trabalho com a
Sol numa conversa nova, sem depender do histórico da conversa anterior. Cobre:
o que a Sol é, o mapa de arquitetura (V3 do Alfredo), o fluxo completo do
comprovante ao lançamento, o inventário de RPCs, o que está em produção vs. em
observação vs. puramente operacional, os bugs conhecidos (corrigidos e
abertos), como rodar os testes, e os débitos técnicos pendentes.

Documento irmão, mais estreito e "contratual": `docs/handoffs/2026-08-17-contrato-canonico-faturas-sol-claude.md`
(fonte única de faturas/carteira D+2 + o contrato das RPCs `sol_caixa_*` +
a seção "Runtime da Sol no WhatsApp" com o detalhe de cada PR 229-236). Este
relatório aqui é o mapa geral; aquele é o contrato técnico de referência.

---

## 1. O que é a Sol

A Sol é a IA que atende os **grupos de WhatsApp do financeiro** das 3
unidades (Campo Grande, Recreio, Barra). A equipe manda o comprovante de
pagamento (foto/print) no grupo, ela lê (OCR + visão), casa com a fatura
canônica do aluno, monta um card de prévia, pede autorização ("pode") e só
então lança em `caixa_movimentacoes`. Também abre/fecha o caixa do dia,
processa saídas operacionais (retiradas, pagamentos), venda de lojinha, e
conversa livremente sobre o que já foi lançado.

Ela roda como um processo Node.js de longa duração na VPS **la-hq**, não como
edge function — a única automação deste domínio que não vive no Supabase.

## 2. Onde a Sol roda (infra)

```
VPS la-hq (SSH alias: lahq)
└── /home/sol/.hermes/
    ├── profiles/sol/caixa-ingestao/
    │   ├── caixa-financeiro.cjs        ← lógica de comprovante/preview/lançamento
    │   ├── caixa-abertura-fechamento.cjs ← abrir/fechar caixa (pedido humano)
    │   ├── caixa-cron.cjs              ← job agendado (fechamento automático)
    │   └── caixa.log                   ← log JSON-lines detalhado (_caixaLog)
    └── hermes-agent/scripts/whatsapp-bridge/
        ├── bridge.js                    ← recebe WhatsApp, roteia pros módulos
        ├── group-engagement.cjs         ← decide SE a Sol deve responder
        └── bridge.log                   ← log genérico de conexão/engagement
```

Supervisão: `hermes-gateway-sol.service` (systemd, `Restart=always`) — matar o
processo da bridge causa auto-respawn em ~5s.

⚠️ **Ponto crítico de disciplina operacional:** a bridge faz `require`/`import`
dos módulos do caixa **só no start do processo**. Editar `caixa-financeiro.cjs`
não muda o comportamento até reiniciar a bridge. Já os crons de abrir/fechar
(`caixa-cron.cjs`) são processos novos a cada execução e pegam mudanças na
hora — a assimetria "o cron já usa o código novo e o grupo não" já confundiu
diagnóstico mais de uma vez.

**Disciplina de patch em produção** (estabelecida nesta frente, seguida em
todas as correções de 23-26/08): backup timestampado (`.bak-<UTC>-<label>`)
antes de qualquer edição → patch idempotente em Node (`_patch-*.cjs`, âncora
de string exata, falha alto se a contagem de ocorrências ≠ 1) → aplicar via
`node /tmp/_patch-*.cjs <arquivo>` → verificar com `node --check` / `require`
→ rodar toda a suíte de regressão → reiniciar a bridge → conferir
`bridge.log` (`WhatsApp connected`, zero `init falhou`) desde o timestamp do
restart. Os `_patch-*.cjs` ficam versionados em `tests/sol-runtime/` junto
com os testes, para rastro de auditoria.

## 3. A arquitetura V3 (Alfredo) — fail-closed por desenho

O caixa passou por um redesenho de segurança em 21-22/08 (autoria: Alfredo,
colaborador externo). Princípio central: **preview → aprovação humana
("pode") → revalidação de snapshot → consumo único → RPC auditada**. Nada é
gravado sem que as três etapas batam.

Tabelas do ledger V3 (confirmadas no banco):
```
caixa_reaberturas_log
sol_caixa_autorizados
sol_caixa_ingestao_recebimentos
sol_caixa_lancamento_auditoria
sol_caixa_lote_itens_v1
sol_caixa_lotes_v1
sol_caixa_unidade_policy
sol_caixa_v3_approval_consumos_v1
sol_caixa_v3_caixa_operacoes_v1
```

Peças-chave:
- **Resolver no preview, nunca no "pode".** `sol_caixa_resolver_multi_aluno_v1`
  e `sol_caixa_resolver_composto_aluno_v1` escolhem a(s) fatura(s) UMA vez, no
  momento do preview. O "pode" chama `sol_caixa_validar_multi_aluno_snapshot_v1`,
  que confere que os MESMOS `canonical_fatura_id`/valores/status continuam
  válidos. Se algo mudou entre o preview e a autorização, recusa com motivo
  específico (`snapshot_valor_fatura_mudou`, `snapshot_fatura_nao_encontrada`,
  …) e nada é lançado parcialmente.
- **Abrir/fechar V3** (`resolver_abertura_v3`/`resolver_fechamento_v3` +
  `abrir_v3`/`fechar_v3`): snapshot com hash no banco (`extensions.digest`),
  advisory xact lock, idempotência por `sol_caixa_v3_caixa_operacoes_v1`.
  Consumo do "pode" só DEPOIS da mutação efetiva — uma corrida que impede
  abrir/fechar preserva o approval em vez de queimá-lo à toa. Snapshot de
  fechamento inclui contagem de movimentos por ambiente (pix/cartão entre
  preview e "pode" força preview novo). Expiração = min(4h, fim do dia BRT).
- **Composto canônico** (`sol_caixa_resolver_composto_aluno_v1`): acha o
  subconjunto de 2+ faturas que soma EXATO o total pago. Fail-closed em tudo
  que é ambíguo: aluno com nome duplicado, 2+ subconjuntos válidos
  (`composicao_ambigua` — nunca escolhe por heurística), >12 candidatas
  (`composicao_complexa_revisao_manual`).
- **Reabertura do caixa** (`sol_caixa_reabrir_caixa_v1`): qualquer membro do
  grupo financeiro oficial autoriza; motivo obrigatório; só o dia corrente
  BRT; log completo com snapshots em `caixa_reaberturas_log`.
- **Trava de fechamento pendente na abertura**: `sol_caixa_abrir` recusa abrir
  o dia se o dia anterior ainda está aberto — nasceu de um incidente real
  (retirada de R$950 sumiu do saldo por carry-over do último fechado).

**Regra geral do V3, deliberada:** melhor recusar/pedir humano do que
adivinhar ou lançar parcial. Quando a Sol diz "não tenho certeza" ou pede
confirmação extra, isso é o sistema funcionando como projetado, não um bug.

## 4. Fluxo completo: do comprovante ao lançamento

```
1. Comprovante chega no grupo (imagem/print), com ou sem legenda.
2. bridge.js recebe o evento → roteia pro handler do caixa-financeiro.cjs.
3. Extração do valor:
   a. OCR local (tesseract, ocrLocal) — roda PSM 6 e PSM 4 em paralelo.
   b. Se OCR falha/vazio → fallback de visão (LLM multimodal).
4. Interpretação: categoria (parcela/passaporte/matrícula/lojinha/saída),
   aluno citado (rótulo humano da legenda > pagador do comprovante),
   competência, forma de pagamento.
5. Casamento com a fatura canônica:
   - 1 aluno → sol_caixa_casar_parcela / sol_caixa_parcela_canonica
   - 2+ alunos no mesmo comprovante (irmãos) → sol_caixa_resolver_multi_aluno_v1
   - 2+ faturas do MESMO aluno (composto) → sol_caixa_resolver_composto_aluno_v1
   - aluno novo (passaporte/experimental) → sol_caixa_identificar_aluno_novo_v1
6. Monta o card de prévia (preview) e envia no grupo.
7. Humano responde "pode" (ou corrige nome/valor/forma, ou "não" descarta).
8. Se "pode": revalida snapshot → RPC de lançamento (unitário, lote, ou
   composto) → grava em caixa_movimentacoes com aluno_id/fatura_id →
   confirma no grupo.
```

Saídas operacionais (retiradas, pagamentos a fornecedor, segurança etc.) e
venda de lojinha seguem o mesmo esqueleto preview→pode→lançamento, mas nunca
pedem/mostram seção ALUNO (corrigido em #229/#232 — ver seção 6).

## 5. Inventário de RPCs (`sol_caixa_*` e correlatas)

| RPC | Papel |
|---|---|
| `sol_caixa_parcela_canonica` | valor da parcela (até vencimento / sem desconto condicional / hoje com multa) |
| `sol_caixa_casar_parcela` | casamento 1 aluno, contrato de retorno com `valor_bate_como` |
| `sol_caixa_resolver_multi_aluno_v1` | preview: casa 2+ itens (irmãos), soma contra o total |
| `sol_caixa_validar_multi_aluno_snapshot_v1` | revalida o snapshot do preview no "pode" |
| `sol_caixa_lancar_recebimento_lote_v1` | lançamento do lote, após validar snapshot |
| `sol_caixa_lancar_recebimento` | lançamento unitário |
| `sol_caixa_resolver_composto_aluno_v1` | preview: subconjunto de faturas do MESMO aluno que soma o total |
| `sol_caixa_identificar_aluno_novo_v1` | identifica aluno sem fatura (experimental/lead) pelo funil |
| `sol_caixa_aluno_da_fatura_v1` | vínculo autoritativo aluno↔fatura (via `emusys_matricula_id`, NÃO por nome) |
| `sol_caixa_inadimplentes` | resumo de devedores (schema v4) para conversa de cobrança |
| `resolver_abertura_v3` / `abrir_v3` | abertura do caixa do dia (V3) |
| `resolver_fechamento_v3` / `fechar_v3` | fechamento do caixa do dia (V3) |
| `v3_cancelar_preview_v1` | cancela um preview de abertura/fechamento pendente |
| `sol_caixa_reabrir_caixa_v1` | reabertura do dia corrente com motivo + log |
| `corrigir_movimento_v1` | correção de forma/valor de um movimento já lançado (V3, com approval) |
| `sol_caixa_abrir` / `sol_caixa_fechar` | RPCs legadas, ainda vivas em paralelo ao V3; a trava de pendência vale nos dois trilhos |
| `sol_inadimplencia_v1` / `get_inadimplencia_canonica` | carteira D+2, schema v4 — ver contrato canônico |
| `sol_faturas_alunos_v1` | wrapper que resolve o claim JWT da Sol antes de chamar a canônica de faturas |

**Fail-closed deliberado, sem EXECUTE para os papéis da Sol:**
`corrigir_forma_recebimento` (legada), `autorizar_payload_v1` (interna),
`recalcular_cofre` (interna). Não conceder grant nessas sem conferir o ledger
`MIGRATIONS_APLICADAS.md` do repo da Sol primeiro — ausência de grant já foi
decisão de produto mais de uma vez.

Detalhe completo de contrato/payload de cada RPC de faturas/carteira está no
documento canônico (seção "Fluxo de caixa").

## 6. Bugs conhecidos e CORRIGIDOS (cronológico, com evidência)

Todos abaixo têm teste de regressão em `tests/sol-runtime/` e patch versionado
(`_patch-*.cjs`). Nenhum mexeu em RPC/migration — são todos na camada de
interpretação de mensagem/card do runtime WhatsApp.

| PR | Data do caso | Resumo |
|---|---|---|
| #229 | 25/08, Mayra/CG | Saída de caixa virava card de recebimento, pedia aluno; correção virava nome |
| #230 | 25/08, Jhon/CG | Rótulo humano perdia pro pagador do PIX; correção citada vazava pro LLM (respondeu valor inventado) |
| #231 | 25/08, Jhon+Aurora/CG | "não" nunca era tratado (texto meu prometia o comando sem implementá-lo); pendência órfã "herdava" comprovante seguinte |
| #232 | 25/08, Vitória/Recreio | "puxa/manda o fechamento" não era reconhecido como pedido (só o verbo "fechar" era); lojinha pedia aluno mostrando a própria descrição do produto |
| #233 | 25/08, Vitória/Recreio | Agradecimento após fechamento não tinha resposta nenhuma — regra de fim de turno testava antes de checar se falavam com a Sol |
| #235 | 26/08, Arthur/Barra | Reenvio do mesmo comprovante (por causa do OCR travado, ver #236) criava 2 pendências; correção com 2 candidatas caía em silêncio; guarda "não vaza pro LLM" disparava em qualquer conversa |
| #236 | sistêmico, 21-26/08 | tesseract sem `OMP_THREAD_LIMIT` causava **deadlock real** (não lentidão) quando 2 processos rodavam em paralelo — raiz do "Sol demora 1-2 min pra responder" |

Detalhe caso-a-caso, com o texto exato dos incidentes e a prova de correção,
está na seção "Runtime da Sol no WhatsApp" do documento canônico.

**Padrão que vale reter:** os bugs de 25/08 (#229-#233) formam uma cadeia —
uma correção introduzia a lacuna que o caso seguinte expôs (a guarda de #230
foi escrita prometendo um comando "não" que não existia, o que causou #231).
Isso não é motivo pra desconfiar do processo — é o preço normal de corrigir
sob pressão de produção real, e a cadeia parou de crescer assim que a guarda
ganhou o filtro de "é pra Sol mesmo?" em #235.

## 7. Bugs conhecidos e ABERTOS (não corrigidos)

- **Gate 1 pré-STRICT=1 (segurança, não funcional):** o bridge da Sol roda com
  **service_role** no processo. A allowlist de 46 RPCs `sol_caixa_*` é hoje
  convenção, não enforcement. Auditoria de 22/08 achou e corrigiu os 3
  caminhos de REST direto a `alunos`/`emusys_faturas` que existiam no
  runtime (deploy `alfredo/remove-runtime-rabiolas`, verificado vivo) — mas a
  troca de credencial em si (service_role → JWT com claim `sol_acesso_restrito`)
  **ainda não aconteceu**. Ver seção 12 para o protocolo de troca já
  desenhado (dual-run em canário).
- **Gate 2 pré-STRICT=1:** reduzir o SELECT amplo (421 tabelas) da role
  `sol_acesso_restrito` — bloqueado pelo Gate 1 (sem trocar a credencial,
  reduzir a role não protege nada, porque o processo ainda usa service_role).
- **Pagamento parcial** (ex.: "restante do passaporte R$199") não casa
  automaticamente com nenhuma fatura — sempre cai em conferência humana. Não
  é bug, é escopo — mas vale saber que não há "match parcial inteligente".

## 8. O que está em PRODUÇÃO

- Todo o fluxo de comprovante → preview → "pode" → lançamento, nas 3
  unidades, incluindo multi-aluno (irmãos) e composto (mesmo aluno, 2+
  faturas).
- Abrir/fechar caixa, nos dois trilhos (V3 e legado — a trava de pendência
  vale nos dois).
- Reabertura do caixa do dia corrente.
- Saída operacional (retiradas, pagamentos) e venda de lojinha.
- Todas as correções de runtime #229-#236 (verificadas em produção real na
  madrugada de 26→27/08, sem timeout de OCR e com fluxos preview→lançado
  limpos nas duas unidades monitoradas).
- Carteira D+2 em **modo sombra** (ver seção 9 — não confundir com
  "produção" no sentido de ação automática).

## 9. O que está em OBSERVAÇÃO / modo sombra

- **Carteira "Cobrar agora D+2"** (`get_inadimplencia_canonica` /
  `sol_inadimplencia_v1`): a Sol pode listar, agrupar e conversar sobre
  inadimplência, mas **não envia WhatsApp de cobrança, não liga cron de
  cobrança e não dá baixa sem aprovação humana posterior**. Gate obrigatório
  documentado no contrato canônico (schema_version=4, status ok/partial,
  `collection_allowed=true`, etc. — qualquer falha vira lista vazia com
  motivo auditado, nunca fallback).
- A promoção deste modo sombra para ação real depende dos Gates 1 e 2 da
  seção 7/12 (credencial restrita) — não está agendada.

## 10. O que é puramente OPERACIONAL (governança, não código)

- **Fechamento é de quem está NA UNIDADE no horário** — decisão do Alf.
  Automatizar abrir/fechar sem um "pode" humano foi recusado por ora.
- **Reabertura exige motivo declarado** e é auditada, mas qualquer membro do
  grupo financeiro oficial pode autorizar — não é hierárquico.
- Correção de forma de pagamento em movimento já lançado passa por
  `corrigir_movimento_v1` (V3, com approval) — nunca pela legada sem
  approval.

## 11. Testes — como validar qualquer mudança no runtime

```bash
scp tests/sol-runtime/*.cjs lahq:/tmp/
ssh lahq 'cd /home/sol/.hermes/profiles/sol/caixa-ingestao && \
  export SOL_CAIXA_V3_LEDGER_MODE=production SOL_CAIXA_V3_LEDGER_STRICT=0 && \
  for t in detector-multi-aluno.test gate-regressao-e2e forma-incerta-e2e \
           aluno-novo-passaporte-e2e vinculo-lancamento-e2e saida-operacional-e2e \
           rotulo-humano-e2e descarte-e-conversa-e2e multi-aluno-reenvio-e2e \
           ocr-concorrencia-e2e; do \
    echo "## $t"; node /tmp/$t.cjs || echo "FALHOU: $t"; done'
```

10 arquivos de teste hoje em `tests/sol-runtime/` (fora os `_patch-*.cjs` e o
README, que documenta cada caso com o mesmo nível de detalhe desta seção).

⚠️ Gotchas recorrentes, todos já documentados no README:
- Rodar **sempre** com `SOL_CAIXA_V3_LEDGER_MODE=production` — sem isso o
  ledger V3 fica desligado e o teste passa por um caminho que não existe em
  produção (já escondeu um bug real em 24/08).
- `criarHandlerFinanceiro` devolve `{handle, temPendencia, citaAlgumaPendencia,
  _pendentes}`; `grupos` é mapa por `chatId`, não array.
- Mock de OCR precisa devolver `{ text, status }` (chave em INGLÊS — `texto`
  em português passa silenciosamente e mascara o cenário real).
- Evento de teste precisa de `mediaUrls: [...]`, não `mediaPath` — o runtime
  só lê `event.mediaUrls[0]`.

## 12. Débitos técnicos e próximos passos sugeridos

1. **Troca de credencial do bridge (service_role → `sol_acesso_restrito`)** —
   desbloqueada desde 22/08 (os 3 buracos de REST direto morreram), falta
   executar o protocolo: dual-run num grupo canário, janela fora do horário
   de caixa, rollback = voltar a env var, monitorar `caixa.log` +
   `sol_caixa_lancamento_auditoria` por 48h.
2. Reduzir o SELECT amplo de `sol_acesso_restrito` (depende do item 1).
3. Nenhum item aberto na camada de runtime WhatsApp além do que está na
   seção 7 — a cadeia de bugs de 25-26/08 está fechada e verificada em
   produção real.
4. Se surgir um novo caso de "Sol não respondeu"/"Sol demorou", a primeira
   suspeita deveria ser **timeout de OCR** (ver #236) antes de qualquer outra
   hipótese — foi a causa raiz sistêmica que ficou 5 dias mascarada atrás de
   sintomas aparentemente não relacionados.

---

*Este relatório reflete o estado em 27/08/2026. Para o contrato técnico
detalhado de cada RPC de faturas/caixa (payloads, schema v4, fórmulas
financeiras, evidência de reconciliação), usar sempre
`docs/handoffs/2026-08-17-contrato-canonico-faturas-sol-claude.md` como fonte
primária — este documento é o mapa, aquele é o contrato.*
