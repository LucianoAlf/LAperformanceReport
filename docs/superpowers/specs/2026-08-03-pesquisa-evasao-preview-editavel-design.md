# Pesquisa de evasão — prévia editável com confirmação atômica

**Data:** 03/08/2026

**Status:** desenho aprovado pelo Alf; implementação pendente

**Autoridade de produto:** Alf
**Escopo:** edição exclusivamente do corpo da mensagem na última etapa antes do
envio da pesquisa de evasão

## 1. Decisão

A prévia da pesquisa de evasão deixa de ser somente leitura. O usuário interno
que gerou a prévia pode ajustar o corpo da mensagem antes de confirmar o envio.

A edição não transfere para o navegador nenhuma decisão de roteamento. Aluno,
destinatário, telefone, caixa, template, modo de teste e identidade do operador
continuam resolvidos e congelados no servidor.

A confirmação será atômica: o texto final, sua auditoria e o claim idempotente
do envio serão persistidos na mesma transação antes de qualquer chamada ao
provedor de WhatsApp.

## 2. Problema de produto

Em 03/08/2026, Jéssica tentou corrigir o próprio nome diretamente na prévia e
concluiu que a ferramenta estava travada porque o texto era somente leitura. A
grafia do cadastro foi corrigida, mas o caso mostrou uma necessidade permanente:
pequenos ajustes de redação não devem exigir alteração de cadastro, template ou
intervenção técnica.

A imutabilidade original protegia um endpoint que, à época, podia ser chamado
sem autenticação. Esse risco foi removido: `enviar-pesquisa-evasao` exige JWT,
valida um único usuário interno ativo e resolve o operador no servidor.

O controle adequado agora é confiança interna com rastro completo, limite de
tamanho e confirmação idempotente.

## 3. Baseline verificado

A verificação somente leitura de 03/08/2026 confirmou no projeto de produção
`ouqwbbermlzqqvtqwlul`:

- `enviar-pesquisa-evasao` está publicada com `verify_jwt=true`;
- a ação `confirmar` aceita atualmente somente `preview_id`;
- `pesquisa_evasao_previews` congela destinatário, telefone, caixa, operador,
  template, mensagem renderizada, hash, chave de idempotência e validade;
- `claim_pesquisa_evasao_preview(uuid, uuid)` consome a prévia sob lock e só o
  primeiro chamador recebe `deve_despachar=true`;
- `pesquisa_evasao.mensagem_renderizada` guarda o texto enviado, mas o schema
  ainda não distingue texto original, texto editado e autoria da edição;
- os templates V2 ativos possuem 542 caracteres para o público direto e 579
  para o responsável.

Há famílias reais aguardando resposta em `multipartes_v2`, e a Fase A da Lia
está ativa com dispatcher a cada minuto. Esta entrega não altera o webhook de
recepção, o motor multipartes nem o cron da Lia.

## 4. Objetivos

1. Permitir que o usuário ajuste somente o corpo da mensagem na prévia.
2. Enviar exatamente o texto final visível e aprovado na tela.
3. Preservar no servidor todos os campos de identidade e roteamento.
4. Registrar o texto original, o texto final e a autoria da edição.
5. Manter a proteção contra clique duplo e contra confirmação concorrente com
   textos diferentes.
6. Mostrar no painel como os marcadores do WhatsApp serão apresentados ao
   destinatário.
7. Manter compatibilidade durante o rollout com o frontend atual, que confirma
   somente com `preview_id`.

## 5. Não objetivos

- editar destinatário, telefone, caixa, assinatura, modo de teste ou template;
- salvar rascunhos fora da prévia de dez minutos;
- criar um editor visual que reescreva os marcadores do WhatsApp;
- alterar templates ativos a partir desta tela;
- alterar mensagens já enviadas;
- alterar o webhook inbound, respostas multipartes, transcrições ou alertas da
  Lia;
- permitir envio em nome de outra pessoa;
- implementar assistência de IA nesta entrega.

## 6. Experiência da tela

### 6.1 Editor explícito

O bloco da mensagem conterá:

- rótulo `Mensagem que será enviada`;
- texto de ajuda visível: `Você pode ajustar o texto antes de enviar.`;
- editor de texto puro, com múltiplas linhas;
- contador visível `N / 2.000 caracteres`;
- aviso imediato quando o conteúdo estiver vazio ou exceder o limite;
- indicação visual `Texto editado` quando o valor diferir exatamente do texto
  original renderizado pelo servidor.

O editor deve parecer interativo por borda, foco, cursor e estado habilitado.
Não deve depender apenas de placeholder para comunicar que aceita edição.

### 6.2 Visualização formatada

Abaixo do editor haverá um bloco `Como aparecerá no WhatsApp`.

Esse bloco interpreta apenas para apresentação:

- `> ` no início da linha como citação;
- `*texto*` como negrito;
- `_texto_` como itálico;
- os demais marcadores já suportados pelo formatador compartilhado.

A visualização nunca altera o valor do editor. React deve renderizar texto como
conteúdo, sem `dangerouslySetInnerHTML`.

Esta entrega absorve e resolve o item pendente da Prosódia V2 em que a prévia
mostra literalmente `> *pergunta*` e `_pedido de sinceridade_`. A dívida deixa
de existir como entrega separada; será considerada encerrada no rollout desta
funcionalidade.

### 6.3 Preservação do texto

O valor canônico continua sendo texto puro. Quebras de linha, espaços, emojis e
marcadores são enviados exatamente como aprovados.

Se o usuário apagar `>`, `*` ou `_`, o sistema não restaura nem inventa o
marcador. A visualização muda para refletir o novo texto, e esse é o conteúdo
que será enviado.

### 6.4 Validação visível

O limite é de **2.000 caracteres Unicode**.

- conteúdo cujo `trim()` seja vazio: confirmação bloqueada;
- conteúdo entre 1 e 2.000 caracteres: confirmação permitida;
- conteúdo acima de 2.000: confirmação bloqueada e contador em estado de erro;
- a tela informa quantos caracteres excederam o limite;
- o botão permanece bloqueado também quando a prévia expirar ou o envio estiver
  em andamento.

A validação do navegador melhora a experiência, mas não substitui a repetição
integral da regra no servidor.

## 7. Contrato HTTP

### 7.1 Pré-visualização

`acao=previsualizar` continua sem mudança. A resposta mantém `mensagem` como o
texto original renderizado pelo servidor.

### 7.2 Confirmação

O novo frontend envia somente:

```json
{
  "acao": "confirmar",
  "preview_id": "uuid",
  "mensagem_final": "texto exato aprovado"
}
```

Nenhum campo adicional de roteamento será aceito. O validador continuará
rejeitando propriedades desconhecidas.

Durante a janela de rollout, `mensagem_final` será opcional apenas para manter o
frontend antigo funcionando. Quando ausente, a Edge usa a mensagem persistida
na prévia sem alteração. O cliente nunca envia hash, identidade ou metadados de
auditoria.

## 8. Confirmação atômica

Será criada uma RPC service-only nova, sem substituir inicialmente a função
atual:

```text
claim_pesquisa_evasao_preview_editavel(
  preview_id,
  auth_user_id,
  mensagem_final,
  payload_hash_final
)
```

A Edge:

1. autentica o usuário e verifica que existe exatamente um usuário interno
   ativo;
2. carrega do servidor a prévia pertencente ao mesmo `auth_user_id`;
3. valida o texto final sem normalizá-lo ou reescrevê-lo;
4. calcula no servidor o hash do snapshot persistido com o texto final;
5. chama a RPC nova com service role;
6. envia ao provedor exclusivamente `mensagem_renderizada` devolvida pelo
   claim.

A RPC executa sob uma única transação:

1. exige `auth.role() = service_role`;
2. trava a prévia com `FOR UPDATE`;
3. valida ownership antes de expiração ou qualquer outro detalhe;
4. rejeita conteúdo vazio ou acima de 2.000 caracteres;
5. mantém todos os campos de destino e identidade existentes;
6. persiste texto original, texto final, hash final e auditoria da edição;
7. consome a prévia e cria ou atualiza o cabeçalho de `pesquisa_evasao`;
8. retorna o snapshot final e `deve_despachar`.

Se qualquer etapa falhar, nenhuma alteração da edição ou do claim permanece.

## 9. Idempotência e concorrência

### 9.1 Primeiro clique

O primeiro claim válido congela o texto final e pode retornar
`deve_despachar=true`.

### 9.2 Segundo clique com o mesmo texto

Depois do lock, a RPC identifica a prévia já consumida, compara o texto exato e
retorna o resultado existente com `deve_despachar=false`. Nenhuma nova chamada
ao provedor ocorre.

### 9.3 Segundo clique com texto diferente

Se a prévia já foi consumida e o novo texto difere, a RPC retorna conflito. O
texto anterior permanece imutável e nenhuma chamada ao provedor ocorre.

### 9.4 Concorrência real

Duas confirmações simultâneas são serializadas pelo lock da prévia. Apenas a
primeira pode congelar o conteúdo e despachar. A segunda segue as regras de
texto igual ou diferente acima.

Estados `enviando` antigos continuam virando `incerto` conforme o contrato
atual; nenhum retry automático é introduzido.

## 10. Persistência e auditoria

### 10.1 Prévia

`pesquisa_evasao_previews` passará a preservar:

- `mensagem_template_original`: texto que o template produziu já com os nomes
  renderizados;
- `mensagem_renderizada`: texto final aprovado;
- `mensagem_editada`: diferença exata entre original e final;
- `editado_por_usuario_id`;
- `editado_por_auth_user_id`;
- `editado_em`, gerado no banco;
- `payload_hash_original`: hash do snapshot criado na prévia;
- `payload_hash`: hash do snapshot final aprovado.

O template bruto continua preservado por `template_id` e `template_versao`. O
campo original renderizado é necessário para comparar a mensagem concreta que
Jéssica ou Fabi recebeu na tela, sem depender de reconstruir placeholders no
futuro.

### 10.2 Pesquisa enviada

`pesquisa_evasao` receberá snapshots correspondentes:

- texto original renderizado;
- texto final em `mensagem_renderizada`;
- indicador de edição;
- IDs do editor e horário;
- hash original e hash final.

O texto final e o hash final são copiados antes do dispatch. O resultado do
provedor acrescenta `provider_message_id` e horário de envio sem reescrever a
auditoria do conteúdo.

### 10.3 Mensagem não editada

Quando original e final forem idênticos:

- `mensagem_editada=false`;
- texto original e final permanecem iguais;
- hash original e final permanecem iguais;
- campos de editor e horário de edição ficam nulos;
- `executado_por_usuario_id` e `executado_por_auth_user_id` continuam
  registrando quem confirmou o envio.

### 10.4 Mensagem editada

Quando houver qualquer diferença, inclusive espaço, quebra de linha ou
marcador:

- `mensagem_editada=true`;
- editor é o mesmo usuário autenticado e dono da prévia;
- horário vem de `clock_timestamp()`;
- texto e hash originais permanecem imutáveis;
- texto e hash finais são os únicos usados no envio.

## 11. Segurança e privacidade

- JWT continua obrigatório no gateway.
- Usuário interno ativo e ownership da prévia continuam obrigatórios.
- Somente o corpo da mensagem é aceito do cliente.
- Telefone, destinatário, caixa, assinatura, template e modo de teste nunca são
  aceitos do navegador.
- Hash é calculado no backend a partir do snapshot persistido e do texto final;
  o navegador não fornece nem escolhe o hash.
- Logs não registram texto original, texto final, telefone ou payload do
  provedor.
- A visualização formatada não interpreta HTML.
- As tabelas privadas mantêm RLS e acesso de escrita restrito ao service role.

## 12. Compatibilidade de dados

A migration será aditiva.

- previews existentes recebem `mensagem_template_original` a partir da atual
  `mensagem_renderizada`;
- o hash atual é copiado para `payload_hash_original`;
- linhas antigas de `pesquisa_evasao` são marcadas como não editadas;
- mensagens já enviadas não são reconstruídas nem reescritas;
- previews ainda válidas no momento do rollout continuam confirmáveis;
- a RPC atual permanece disponível até o encerramento da compatibilidade.

Nenhum dado de resposta, rodada ou transcrição será alterado.

## 13. Ordem de rollout

O rollout exige autorização separada do Alf e seguirá:

1. **Migration aditiva:** colunas de auditoria e RPC editável, preservando a RPC
   atual. O frontend e a Edge publicados continuam funcionando.
2. **Edge compatível:** `verify_jwt=true`, aceita confirmação antiga sem
   `mensagem_final` e confirmação nova com texto final. Não toca no webhook.
3. **Frontend:** editor, contador, validação visível e visualização formatada.
4. **Smoke em modo teste:** número interno do Alf, primeiro sem edição e depois
   com edição, sem disparo para família real.
5. **Concorrência controlada:** confirmar a mesma prévia duas vezes com o mesmo
   texto e provar uma entrega; repetir com texto divergente e provar conflito
   sem entrega adicional.

Antes do deploy da Edge, o código local será comparado novamente com a versão
ativa em produção. A verificação de 03/08 encontrou checks locais de opt-out que
não aparecem na versão 43 publicada. Essa diferença não será embarcada
silenciosamente: o diff e seu efeito serão explicitados no gate de rollout.

O cron da Lia continua ativo e o webhook de recepção não será redeployado por
esta entrega.

## 14. Validação mínima

### 14.1 Contrato da Edge

- rejeita texto vazio;
- rejeita mais de 2.000 caracteres;
- preserva exatamente texto, marcadores, emojis e quebras de linha;
- rejeita campos de identidade ou roteamento;
- usuário diferente do dono da prévia recebe 403;
- preview expirada não é editada nem consumida;
- hash final muda quando o texto muda;
- o provider recebe somente o texto devolvido pelo claim.

### 14.2 PostgreSQL real

Fixture PostgreSQL deve provar:

- backfill idempotente de previews e pesquisas existentes;
- claim atômico de texto não editado;
- claim atômico de texto editado;
- autoria e horário persistidos somente quando houve edição;
- clique duplo com texto igual resulta em um único dispatch;
- clique duplo com texto diferente gera conflito;
- falha posterior dentro da função reverte edição e claim;
- funções e tabelas continuam service-only onde aplicável.

### 14.3 Interface

- campo parece e funciona como editor;
- texto de ajuda está visível;
- contador acompanha a edição;
- vazio e excesso bloqueiam o botão antes da chamada ao servidor;
- visualização mostra citação, negrito e itálico sem marcadores crus;
- remover marcador no editor remove a formatação na visualização;
- expiração e confirmação em andamento bloqueiam edição e envio;
- build de produção passa.

### 14.4 Smoke operacional

- sem edição: texto do WhatsApp é idêntico ao template renderizado;
- com edição: texto recebido é idêntico ao editor;
- auditoria contém original e final;
- telefone, caixa, destinatário e operador permanecem os snapshots do servidor;
- nenhuma resposta multipartes aberta é alterada;
- nenhum alerta da Lia é duplicado ou enviado por causa do rollout.

## 15. Recuperação

Se a migration entrar e a Edge não for publicada, o comportamento existente
continua válido.

Se a Edge nova falhar antes do frontend:

- republicar a versão anterior da Edge;
- a RPC e as colunas aditivas podem permanecer sem uso;
- nenhuma mensagem existente precisa ser alterada.

Se o frontend falhar:

- reverter somente o deploy do frontend;
- a Edge continua aceitando o contrato antigo;
- a operação retorna à prévia somente leitura sem interromper respostas reais.

Não existe rollback que apague textos ou auditorias de mensagens já enviadas.

## 16. Melhoria futura aprovada para registro

Criar um assistente de IA dentro da prévia para sugerir ajustes de tom ou
redação. Ele deverá:

- apenas sugerir um novo corpo;
- nunca alterar destinatário, telefone, caixa ou identidade;
- exigir aprovação humana explícita;
- usar o mesmo contrato de original, final, editor, horário e hashes;
- registrar que houve assistência de IA e qual versão produziu a sugestão.

Essa melhoria não faz parte desta implementação.
