# Sol Caixa — Checkpoint 3 — Auditor + Conformidade

## Escopo

O CP3 transforma o ledger sanitizado do CP2 em verificação independente. Ele
classifica cada mensagem observada em um dos desfechos operacionais:

- `ignored_by_policy` — a política de grupo decidiu não enviar ao modelo;
- `deterministic` — Caixa legado/OCR/abertura-fechamento tratou a mensagem;
- `agent_first` — o canário escolheu ferramenta e fechou pelo envio/readback;
- `responded` — conversa geral respondeu e o envio real fechou o episódio.

Mensagem ignorada não é resposta perdida. Mensagem encaminhada sem terminal
após a janela é `silent_drop` e reprova.

## Fronteiras

- O Auditor recebe somente o readback sanitizado e evidência independente
  enumerada; nunca recebe transcript, nome, telefone, JID, mídia, OCR, prompt,
  valores ou payload financeiro.
- `caixa-auditor-conformidade.cjs` é uma função pura: não importa filesystem,
  HTTP, cliente de banco ou Caixa; não escreve, corrige nem promove.
- O resultado sempre traz `certification=human_gate_required`. Mesmo sem
  finding, o máximo automático é `apta_para_revisao_humana`.
- Regra sem denominador é `nao_mensuravel`, nunca `cumprida`.
- Produção, expansão do canário, `#473`, Caixa financeiro e laudo das 07h
  continuam fora deste gate.

## Regras medidas

1. uma observação sanitizada por episódio;
2. uma classificação explícita de relevância;
3. um terminal após a janela;
4. rota presente para mensagem relevante;
5. paridade com rota/ferramenta esperada quando existir evidência independente;
6. `write_applied` somente após preview, aprovação e consumo;
7. um único efeito financeiro;
8. recibo somente com efeito correspondente;
9. readback depois de escrita;
10. paridade com fontes independentes de efeito, recibo e readback.

Estados por regra: `cumprida`, `contrariada`, `nao_mensuravel`.

## Findings

O CP3 reencontra `coverage_gap`, `correlation_gap`, `routing_error`,
`silent_drop`, `approval_mismatch`, `duplicate_effect`, `false_receipt`,
`readback_missing` e `preview_effect_divergence`.

## Rollout por gates

1. **Código e regressão:** suíte local + CI, sem produção.
2. **Contrato remoto:** aplicar somente a migration aditiva de eventos CP3 no
   Supabase dedicado da Sol; provar rollback, ACL e readback. Exige gate humano.
3. **Runtime shadow:** promover bridge + ledger + Auditor, com backup/rollback e
   um restart exclusivo da Sol. Exige gate humano.
4. **Soak:** dois dias reais nos três grupos; nenhum teste sintético em grupo,
   nenhuma escrita financeira adicional.
5. **Fechamento:** incidentes conhecidos reencontrados, negativo reprovado,
   zero autocertificação e revisão humana do resultado.

## Critério deste PR

- mensagens em standby deixam de nascer como `agent_first` aberto;
- política registra `relevance_decided`, `contained_with_reason` e terminal;
- conversa encaminhada fecha somente no `/send` real;
- Auditor puro encontra os incidentes conhecidos e reprova negativo com
  ferramenta/efeito incompatível;
- migration/rollback preservam RLS e não concedem leitura direta.
