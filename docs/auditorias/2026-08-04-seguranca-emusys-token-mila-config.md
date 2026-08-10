# Pendência de segurança — `mila_config.emusys_token`

**Data do levantamento:** 04/08/2026
**Project ref auditado:** `ouqwbbermlzqqvtqwlul`
**Estado:** pendente; não executar sem janela combinada
**Responsáveis pela janela:** Alf presente e Hugo avisado

## Decisão de escopo

O hardening não será implementado agora. A exposição exige uma sessão
`authenticated` válida do LA Report e, portanto, o risco imediato é interno.
O corte também toca a Mila, que está em uso no atendimento, e deve ser feito em
uma janela coordenada para não interromper o fluxo produtivo nem colidir com o
trabalho do Hugo.

Não houve alteração de tabela, policy, token, Edge Function, Vault, secret ou
produção durante este levantamento.

## Achado confirmado

`public.mila_config` contém uma linha ativa com `emusys_token` preenchido. A
policy `mila_config_select` concede `SELECT` a qualquer usuário
`authenticated` com `USING (true)`. A tela de configuração do Pré-Atendimento
consulta a tabela com `select('*')`, fazendo a credencial atravessar a fronteira
do backend e chegar ao navegador mesmo sem existir campo visível para ela.

O único consumidor backend encontrado que lê o token dessa tabela é a Edge
Function `mila-processar-mensagem`. Os demais fluxos Emusys implantados usam
Edge Function Secrets por unidade. Não foi encontrado consumidor direto em
função SQL, view, cron, Vault ou nos dois hosts VPS auditados (`lahq` e
`alfredo`).

O frontend precisa apenas dos campos não sensíveis de configuração da Mila. Ele
não precisa ler `emusys_token` nem `emusys_url`. O `token_quepasa` permanece em
achado separado e deve ser tratado junto de sua futura rotação.

## Ordem aprovada para execução futura

1. Avisar o Hugo, confirmar a janela com o Alf presente e fotografar o estado
   funcional da Mila antes da mudança.
2. Definir um Edge Function Secret canônico para o Emusys e migrar
   `mila-processar-mensagem` para essa fonte, preservando compatibilidade até o
   smoke do atendimento passar.
3. Criar uma projeção/RPC segura de leitura que retorne somente os campos
   necessários à tela e, se necessário, flags booleanas de credencial
   configurada — nunca o valor do token.
4. Criar RPC administrativa write-only para troca de credenciais, com
   allowlist de campos, autorização explícita, `search_path` fixo e auditoria de
   operador e horário sem registrar o segredo.
5. Migrar o frontend para as RPCs seguras e provar que a configuração e o fluxo
   produtivo da Mila continuam funcionando.
6. Somente após os passos anteriores, revogar a leitura direta de
   `mila_config` por `authenticated`, restringir a tabela ao backend e rotacionar
   a credencial que ficou historicamente exposta.

## Guardrails da futura execução

- Não remover, nulificar ou rotacionar o token antes de provar o novo caminho.
- Não publicar frontend antes de a RPC segura existir.
- Não fechar a policy enquanto a Edge ou a tela ainda dependerem da leitura
  direta.
- Não exibir valores de tokens em logs, diffs, relatórios ou mensagens.
- Migration versionada deve entrar por `supabase db push`; não usar
  `apply_migration` do MCP.
- Qualquer falha no atendimento da Mila interrompe o rollout e exige avaliação,
  sem correção improvisada em produção.

## Itens relacionados, fora deste corte

- Rotação e retirada do `token_quepasa` do histórico e da interface.
- Adoção completa do histórico remoto de migrations, após tratar os segredos
  históricos e revisar as divergências não equivalentes.
