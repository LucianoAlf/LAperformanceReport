# Varredura de segurança nas Edge Functions — verify_jwt e auth em código

Data: 25/09/2026. Projeto `ouqwbbermlzqqvtqwlul`. Inventário: 143 funções em produção.

Princípio: `verify_jwt=true` no gateway NÃO basta — a chave anon é pública (vai no
bundle do app) e passa no gateway. Toda função que gasta IA, grava ou envia precisa
autenticar no código: usuário ativo admin/unidade, ou segredo dedicado de
cron/provedor/integração.

## Estado das correções já publicadas e provadas ao vivo

| Função | Correção | Prova |
|---|---|---|
| `gerar-relatorio-pedagogico` | papel de equipe (v33) | prévia thread |
| `enviar-mensagem-admin` | papel de equipe (v48) | prévia thread |
| `notificar-anamnese` | (repo la-teacher) | prévia thread |
| `fabio-minerar-conversa` | (repo la-teacher) | prévia thread |
| `extrair-contexto-experimental` | (repo la-teacher) | prévia thread |
| `relatorio-admin-whatsapp` | modo manual exige admin/unidade | 401 anon, 403 usuário comum, 200 dry_run |
| `sincronizar-comunidade-whatsapp` | `autorizarEquipe` | idem |
| `varrer-atribuicao-meta-ads` | `autorizarEquipe` | idem |
| `atualizar-inadimplencia-emusys` | `autorizarEquipe` | idem |
| `debug-webhook-emusys-observador` | fail-closed sem OBSERVADOR_TOKEN (v50) | 401 anon; entrega Emusys real 23:03 ok |
| `webhook-whatsapp-inbox` | enforcement ON + segredo por caixa (caixa 3) | 401 forjado, 403 segredo errado, 200 certo |
| `monitor-saude-webhook` | `autorizarEquipe` + cron com x-sync-token | ok:true, problemas:[] |

Commits: `34c66e68`, `9ff68ff4`.

## Inventário verify_jwt=false em produção: 87

- 72 com código neste repo · 15 fora do repo (jarvis-chat, whatsapp-connect,
  professor-entrar, self-update-email, admin-update-email, redirect-google-ads,
  monitor-saude-fabio, gerenciar-templates, gerar-mensagem-*, gemini-list-models-temp,
  gemini-relatorio-individual/turma/professor, fabio-minerar-conversa)
- Só ~31 documentadas em `supabase/config.toml` — as demais foram publicadas com
  `verify_jwt=false` sem registro; um deploy futuro pode resetar para true e quebrar
  integrações silenciosamente (o gateway volta a exigir JWT).

### Já protegidas por auth interno (40 detectadas + 8 revisadas)

Família `x-super-folha-sync-secret` fail-closed (503 sem env, 403 header errado):
`export-caixa-movimentacoes`, `export-contas-receber`,
`export-financeiro-lancamentos`, `refresh-contas-receber`,
`ficha-criar-pessoa`, `ficha-export` (FICHA_SYNC_SECRET).

Token por pessoa/DB: `ficha-tecnica` (lerToken 401), `registrar-mensagem-agente`
(x-agente-token vs `integracao_tokens`), `meta-webhook-campanhas` GET (verify_token).

Sinais fortes de auth encontrados no código (getUser/permissão/segredo dedicado):
as 40 listadas na varredura — inclui as já corrigidas acima e integrações como
`mila-processar-mensagem`, `processar-mensagens-agendadas`, `transcrever-audio`,
`webhook-whatsapp-status`, `whatsapp-status`, `controle-campanha`,
`admin-create-user`, `admin-update-password`, `sincronizar-templates`, etc.

`notificar-anamnese`: stub de 1 linha — a implementação real vive no repo la-teacher.

## BRECHAS confirmadas (abertas na entrada do handler)

Lidas linha a linha no handler: nenhuma checagem antes do trabalho pesado.

### Gasta IA (LLM pago) — chamadas pelo front com `supabase.functions.invoke`
Correção: `autorizarEquipe` (usuário ativo admin/unidade; service_role e
x-sync-token seguem passando p/ automação).

- `gemini-insights`, `gemini-insights-comercial`, `gemini-insights-retencao`,
  `gemini-insights-turma`, `gemini-fabio-chat`, `gemini-relatorio-coordenacao`,
  `gemini-relatorio-professor-individual` (Gemini)
- `gerar-plano-aluno`, `gerar-relatorio-aluno` (Gemini),
  `gerar-prompt-agente` (OpenAI), `classificar-desinteresse` (OpenAI — caller
  externo curl sem auth, quebra até receber `x-sync-token`)

### Envia WhatsApp / dispara campanha
- `lojinha-alerta-estoque`, `lojinha-enviar-comprovante`,
  `lojinha-relatorio-professor`, `relatorio-coordenacao-whatsapp` (texto
  arbitrário), `enviar-campanha` (disparo Meta de campanha em execução)

### Lê/grava dados ou usa token de provedor
- `lojinha-relatorio-vendas` (vendas via service_role),
  `meta-pricing-estimate` (Meta API + access_token),
  `sync-feriados` (grava; chamada por front E cron vault — compatível),
  `sync-students-studio` (caller pg_net sem credencial — quebra até receber
  `x-sync-token`), `agente-webhook` (pipeline de agente: LLM + fila + envio)

### Webhook de provedor sem verificação de assinatura
- `meta-webhook-campanhas` POST: aceita payload sem `X-Hub-Signature-256` e roda
  `processarMensagem`/`processarStatus` (resposta automática de agente).
  Correção: HMAC-SHA256 do corpo bruto contra `numeros_meta.app_secret`
  (ambos os números têm app_secret cadastrado); falha fechada se não configurado.

### Caso limítrofe documentado
- `perfil-professor`: `action=professores|painel` leem dados públicos do
  questionário; `submit` grava `professor_perfil_testes` por `professor_id`
  (formulário público por desenho — revisar se deve ganhar token por professor).

## Fora do repo (15) — não remediáveis daqui

Sem código local não há como auditar/implementar. Incluem funções de alto
impacto provável: `jarvis-chat`, `whatsapp-connect`, `gerenciar-templates`,
`monitor-saude-fabio`, `gerar-mensagem-boas-vindas`, `gerar-mensagem-aniversario`,
`gemini-relatorio-individual`, `gemini-relatorio-turma`, `gemini-relatorio-professor`,
`gemini-list-models-temp`, `admin-update-email`, `self-update-email`,
`professor-entrar`, `redirect-google-ads`, `fabio-minerar-conversa` (já corrigida
no repo de origem).

## Pendente

1. Aplicar `autorizarEquipe` nas ~20 brechas chamadas pelo front (lote único,
   deploy + prova anon 401 / usuário comum 403 / admin 200).
2. Segredo dedicado para os 3 callers externos (agente-webhook,
   classificar-desinteresse, sync-students-studio) — **o caller atual não manda
   credencial e vai levar 401 até ser atualizado para `x-sync-token`**.
3. `meta-webhook-campanhas`: validação X-Hub-Signature-256 com app_secret do DB.
4. Documentar no `config.toml` TODAS as entradas verify_jwt=false intencionais
   (evita reset silencioso em deploy).
5. Auditar nominalmente as 15 fora do repo no repositório onde vivem.
