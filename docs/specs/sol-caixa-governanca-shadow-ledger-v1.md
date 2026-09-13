# Sol Caixa — ledger operacional shadow v1

Data: 2026-09-13
Estado: preparado em ambiente isolado; **não aplicado em VPS nem banco**

## Objetivo

Dar à governança da Sol uma cadeia verificável por episódio:

`mensagem → rota/motor → ferramenta → preview → aprovação → escrita → recibo → readback`

O ledger é telemetria operacional. Não é razão financeiro, não calcula saldo e
não autoriza lançamento.

## Fronteira de dados

O `episode_id` é HMAC-SHA256 de `chat_id + message_id`, com segredo dedicado e
`key_id` explícito. Referências de preview, aprovação, movimento, recibo e
readback também viram HMAC antes de sair do processo.

Permitido: unidade em enum, rota, motor, ferramenta, ação, estado, tempo e
referências opacas. Proibido: texto/transcript, nome, telefone, JID, valor,
mídia, OCR, prompt, credencial e payload financeiro.

## Eventos

- `message_observed` / `redelivery_observed`
- `route_decided` / `tool_selected`
- `preview_prepared` / `preview_sent`
- `approval_observed` / `approval_consumed`
- `write_applied` / `write_refused`
- `receipt_sent`
- `readback_confirmed` / `readback_failed`
- `episode_closed` / `correlation_gap` / `instrument_failure`

## Persistência

- Log local append-only, modo `0600`, rotação padrão em 10 MiB e sete arquivos.
- Banco dedicado da Sol, tabelas RLS e RPC `security definer`; escrita direta
  não é concedida.
- Retenção padrão proposta: 35 dias. A RPC de poda aceita apenas 7–90 dias e
  **não recebe agendamento nesta entrega**.
- Dedupe por `event_key`; redelivery só incrementa uma vez por evento novo.

## Flags e segredos para um gate futuro

- `SOL_CAIXA_GOVERNANCA_SHADOW=1`: liga a captura local.
- `SOL_CAIXA_GOVERNANCA_REMOTE=1`: envia também ao banco dedicado da Sol.
- `SOL_CAIXA_GOVERNANCA_HMAC_SECRET`: segredo novo, exclusivo e com 32+ bytes.
- `SOL_CAIXA_GOVERNANCA_HMAC_KEY_ID`: versão pública da chave, por exemplo `k1`.
- `SOL_GOVERNANCA_SUPABASE_URL` e `SOL_GOVERNANCA_SERVICE_ROLE_KEY` (ou as
  variáveis já autorizadas do Supabase Sol): destino da telemetria.

Sem a flag, não há efeito. Com flag e segredo ausente, o instrumento registra
`hmac_secret_missing` apenas no log local e não interfere no Caixa.

## Plano de aplicação — exige autorização separada

1. Aplicar a migration no Supabase da Sol e executar o ensaio SQL.
2. Criar o segredo dedicado e configurar as flags primeiro com remoto OFF.
3. Publicar os seis artefatos do manifesto na VPS e reiniciar somente a Sol.
4. Provar uma mensagem sintética sem escrita e conferir ausência de dados crus.
5. Ligar remoto, observar 24 horas e confrontar log local × banco.
6. Só então iniciar os dois dias reais exigidos pelo Checkpoint 2.

## Rollback

1. Desligar `SOL_CAIXA_GOVERNANCA_SHADOW` e `SOL_CAIXA_GOVERNANCA_REMOTE`.
2. Restaurar os cinco artefatos anteriores do runtime e reiniciar somente a Sol.
3. Se necessário, executar o rollback SQL. Ele remove apenas RPCs/tabelas de
   telemetria; não toca Caixa, faturas, lançamentos ou saldo.

## Critério de aceite

- suíte local sem regressão;
- migration reproduzida em PostgreSQL limpo no CI;
- nenhuma string bruta nos logs/payloads de teste;
- mesmo episódio no bridge e nas ferramentas;
- recibo e readback ligados ao movimento por referências HMAC;
- zero alteração financeira causada pela governança.
