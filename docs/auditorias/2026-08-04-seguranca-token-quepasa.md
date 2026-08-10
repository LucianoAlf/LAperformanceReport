# Item de segurança — token legado do Quepasa

Data da auditoria: 2026-08-04
Project ref verificado: `ouqwbbermlzqqvtqwlul`
Estado: **exposição confirmada; nenhuma rotação ou alteração executada**

## Resumo executivo

Uma credencial do Quepasa permanece gravada em `public.mila_config.token_quepasa` e foi inserida no histórico remoto pela migration `20260422161816_add_token_quepasa_to_mila_config.sql`.

A mesma credencial também está presente em texto puro no arquivo versionado `docs/SISTEMA-VISITAS-FERIADOS.md`. Ela entrou no Git no commit `70175ecb4f76853b128acf237c1830610787f7aa`, de 2026-04-25 13:15:43 BRT.

O valor não é reproduzido neste documento.

## Evidências observadas

- A migration remota `20260422161816_add_token_quepasa_to_mila_config.sql` atualizou a configuração às `2026-04-22 16:18:16 UTC`.
- Produção possui uma linha ativa em `mila_config`, da unidade Campo Grande, com `token_quepasa` preenchido. O campo não recebe atualização desde 2026-04-22.
- O Git atual contém a credencial em `docs/SISTEMA-VISITAS-FERIADOS.md`; a busca pela credencial exata identificou sua introdução no commit `70175ecb...`.
- Não há segredo com nome relacionado a Quepasa ou Mila nas Edge Function Secrets.
- Não há segredo relacionado no Supabase Vault.
- Nenhuma função SQL, view ou cron do banco referencia `token_quepasa`.
- Nenhuma das 107 Edge Functions atualmente implantadas contém referência a `quepasa`, `token_quepasa` ou à credencial exata.
- As caixas de WhatsApp cadastradas em produção usam apenas UAZAPI e WAHA.

## Consumidores atuais encontrados

Não foi encontrado consumidor operacional que chame o Quepasa com essa credencial.

Dois caminhos ainda carregam o campo sem utilizá-lo:

1. `src/components/App/PreAtendimento/tabs/ConfigPreAtendimentoTab.tsx` consulta `mila_config` com `select('*')`. O campo aparece visualmente apenas para o e-mail do Hugo, mas a resposta da consulta inclui a linha completa.
2. A Edge implantada `mila-processar-mensagem` também consulta `mila_config` com `select('*')`, porém não referencia `token_quepasa`. O envio atual usa credenciais UAZAPI de `whatsapp_caixas` e a Edge `enviar-mensagem-lead`.

O fluxo implantado de `agente-webhook` usa Chatwoot e não contém referência ao Quepasa.

## Exposição adicional no banco

A policy `mila_config_select` possui `USING (true)` para `authenticated`. Portanto, qualquer usuário autenticado consegue ler a linha inteira, incluindo `token_quepasa`, mesmo que a interface esconda o campo visualmente.

Isso confirma uma exposição de credencial além do histórico Git: ocultar o input por e-mail não constitui controle de acesso ao dado retornado pelo navegador.

## Classificação

- Veredito: `confirmed`
- Confiança: alta
- Fila de prioridade: confirmados, posição 1 nesta auditoria
- Superfície: aplicação hospedada, banco de produção e histórico Git
- Impacto potencial: uso indevido do canal Quepasa caso a credencial ainda seja aceita pelo provedor
- Contraponto: nenhum consumidor operacional atual foi encontrado; o sistema em produção usa UAZAPI, WAHA e Chatwoot

## Lacunas de prova

- A validade da credencial no provedor não foi testada, para não realizar chamada externa nem alterar estado.
- Consumidores externos ao repositório, às Edge Functions e ao banco — por exemplo, scripts particulares ou VPS fora deste inventário — não foram auditados nesta etapa.

## Próxima decisão recomendada

Tratar a rotação como trabalho separado e coordenado:

1. confirmar com o responsável pelo antigo Quepasa se existe consumidor externo;
2. revogar ou rotacionar a credencial no provedor;
3. remover o valor do documento atual e tratar o histórico Git conscientemente;
4. retirar o campo da leitura direta do navegador;
5. se ainda houver uso legítimo, armazenar a nova credencial somente em Vault/secret backend-only;
6. verificar ausência de regressão antes de remover definitivamente a coluna legada.

Nenhuma dessas ações foi executada nesta auditoria.
