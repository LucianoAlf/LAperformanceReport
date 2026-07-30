# Pesquisa de Evasão V2 e Mapa de Sinais do Sucesso do Aluno

**Data:** 2026-07-30

**Status:** Aprovada como base dos planos dos Subprojetos A e B, com adendos de segurança incorporados

**Autoridade de produto:** Alf

**Escopo:** Pesquisa de evasão, respostas multipartes, revisão humana, ações de retenção, fronteiras entre Lia/Sol/Fábio e distribuição interna de relatórios

**Primeira entrega implementável:** Segurança do envio, identidade autenticada, prévia e captura multipartes

## 1. Decisão

A pesquisa de evasão deixa de ser tratada como um disparo isolado de WhatsApp e passa a ser uma conversa auditável de saída do aluno.

O sistema deve:

1. registrar quem realmente disparou;
2. mostrar a mensagem exata antes do envio;
3. preservar cada texto e áudio recebido;
4. aceitar respostas enviadas em partes e em horários diferentes;
5. distinguir uma manifestação como “respondo amanhã” de uma resposta analisável;
6. consolidar as partes sem apagar os eventos originais;
7. comparar o motivo cadastrado com os motivos relatados;
8. exigir revisão humana antes de transformar classificação de IA em dado oficial;
9. gerar uma ação operacional para o Sucesso do Aluno quando necessário;
10. alimentar relatórios e agentes por contratos governados, sem duplicar a fonte canônica.

O painel do LA Report é a fonte operacional. Telegram e WhatsApp são canais de aviso e resumo, não substitutos da fila de trabalho.

## 2. Evidência atual

Esta proposta usa a auditoria somente leitura realizada no código e no banco remoto em 2026-07-30.

### 2.1 Pesquisa de evasão

- `movimentacoes_admin` é a fonte canônica da evasão e da não renovação.
- `pesquisa_evasao` já guarda snapshots, envio, texto, áudio e datas da resposta.
- As seis pesquisas existentes estão como respondidas e com `enviado_por='sistema'`.
- `categoria_resposta` e `sentimento` não estão populados.
- Há resposta promocional irrelevante capturada como resposta válida.
- Há áudios marcados como respondidos sem transcrição.
- O modo teste não é distinguível de produção.
- A função publicada de envio não exige JWT e aceita telefone e operador informados pelo cliente.
- O inbound `webhook-whatsapp-inbox` também roda sem JWT e, na versão auditada, não valida segredo antes de criar o cliente com service role.
- O inbound grava o payload integral em `webhook_debug_log` e também escreve trechos extensos do payload em logs de execução, sem política de expurgo identificada.
- A policy atual de `pesquisa_evasao` permite `ALL` a qualquer usuário `authenticated` e aos roles restritos de Mila e Sol; isso expõe respostas privadas e contradiz a separação de domínios definida nesta spec.
- O fluxo pós-1ª aula depende do mesmo inbound: mensagens com `buttonOrListid` são encaminhadas a `processar-resposta-pesquisa` e essa integração é uma regressão crítica a preservar.

### 2.2 Cobertura e sinais

No universo válido de 2026:

- 283 evasões ou não renovações;
- 39 sem `aluno_id`;
- 128 sem telefone utilizável;
- 16 sem vínculo com o catálogo de motivos;
- 69 saídas com menos de seis meses.

Em julho de 2026:

- 37 saídas válidas;
- 13 sem telefone e invisíveis na listagem atual;
- 16 saídas com menos de seis meses;
- 35 com presença semântica disponível nos 90 dias anteriores;
- 25 com pelo menos 25% de faltas nesse período.

O caso de Ana Beatriz demonstra a utilidade do cruzamento: o texto legado registra “Troca de Unidade”, a interface exibe ausência de motivo por depender apenas do catálogo e a resposta privada relata atraso do professor, redução da duração da aula e desânimo.

### 2.3 Relatórios e agentes

Os exemplos enviados pelo usuário provam que Lia e Sol já geram diagnósticos fora do fluxo operacional da equipe:

- alerta diário de falta consecutiva no Telegram;
- relatório de alunos em risco silencioso;
- combinação de inadimplência, frequência, renovação, tempo sem aula e health score;
- recomendações de ação humana sem contato automático com o aluno.

Há, entretanto, sinais de qualidade que precisam permanecer visíveis:

- o relatório de 10/07 repete a mesma data como duas faltas consecutivas;
- alguns alunos aparecem duplicados;
- o volume do risco silencioso caiu de 290 em 28/07 para 106 em 29/07, sem uma versão de regra exibida que explique a mudança.

No LA Report já existem:

- `fila_relatorios_whatsapp`;
- `fila_relatorios_sol_hermes`;
- `whatsapp_destinatarios_relatorio`;
- watchdog e retentativas da fila Sol/Hermes;
- um motor genérico de acumulação de mensagens em `agente_fila_mensagens`.

A fila Sol/Hermes registrava 20 entregas e 3 erros até a auditoria. Os relatórios de risco silencioso e falta consecutiva não foram localizados no repositório nem identificados na fila por tipo; sua implementação precisa ser auditada na VPS antes de qualquer integração.

## 3. Objetivos

### 3.1 Objetivos da primeira entrega

- Fechar o endpoint de envio para usuários autenticados e autorizados.
- Assinar automaticamente com Fabi ou Jéssica conforme o usuário autenticado.
- Exibir uma prévia obrigatória.
- Isolar teste de produção.
- Manter alunos bloqueados por cadastro visíveis.
- Registrar eventos de entrada e saída de forma idempotente.
- Capturar texto e áudio enviados em partes.
- Não considerar “vou responder depois” uma resposta final.
- Entregar uma conversa consolidada para revisão humana.
- Autenticar todo webhook inbound por caixa antes de qualquer acesso com service role.
- Restringir cabeçalho, mensagens, transcrições e análises por `sucesso_aluno.evasao.*`.
- Interromper a persistência e o log de payloads integrais do webhook e expurgar o legado de debug.

### 3.2 Objetivos das entregas seguintes

- Classificar causas e divergências.
- Registrar ação, responsável e resultado.
- Construir a fila proativa de sinais.
- Entregar resumo diário e análise semanal à equipe.
- Definir contratos claros para Lia, Sol e Fábio.
- Permitir que a Lia gere relatórios sobre causas, sinais anteriores e efetividade das ações.

## 4. Não objetivos

- Lia, Sol ou Fábio não contatarão alunos automaticamente nesta fase.
- IA não alterará o motivo original da evasão.
- IA não concluirá sozinha que um professor causou uma evasão.
- Telegram ou WhatsApp não serão usados como banco de dados.
- O primeiro plano não altera o LA Teacher.
- O primeiro plano não redefine a fórmula de presença, risco ou Health Score.
- O primeiro plano não cria uma identidade universal de pessoa.
- O timing do disparo em relação à data da movimentação e a política de lembretes não serão definidos nos Subprojetos A ou B; são decisões abertas do Subprojeto C.
- Esta iniciativa não muda a política de retenção de áudios já existente; privacidade e acesso serão restringidos, e uma política de expurgo será tratada em governança separada.

## 5. Fontes canônicas e granularidade

| Conceito | Fonte | Grão |
|---|---|---|
| Estado operacional do aluno | `alunos` | linha operacional do aluno |
| Jornada | `aluno_jornada_matricula_disciplina` | unidade + matrícula-disciplina |
| Presença | `vw_aluno_presenca_semantica_v1` | aluno + evento de aula |
| Evasão/não renovação | `movimentacoes_admin` | movimentação |
| Pesquisa de saída | `pesquisa_evasao` | uma pesquisa por movimentação |
| Mensagem da pesquisa | nova trilha de eventos | uma mensagem do provedor |
| Análise da resposta | nova análise versionada | uma revisão da conversa |
| Ação humana | `aluno_acoes` | uma intervenção |
| Risco calculado | `risco_evasao` | aluno + unidade + data + versão |
| Sinal operacional | contrato de sinais | aluno + regra + ocorrência |

`alunos.id` não representa uma pessoa universal. Todo cruzamento deve preservar `unidade_id`, e pesquisas diferentes de linhas operacionais distintas não podem ser fundidas apenas por nome ou telefone.

O telefone identifica o canal de conversa, não a identidade do aluno. Responsáveis podem compartilhar o mesmo número entre irmãos.

### 5.1 Componentes de persistência

A evolução é aditiva:

- `pesquisa_evasao` permanece como cabeçalho da pesquisa e vínculo com a movimentação;
- `pesquisa_evasao_templates` versiona pergunta, assinatura e regras de renderização;
- `pesquisa_evasao_mensagens` registra cada evento inbound ou outbound de forma append-only;
- `pesquisa_evasao_analises` guarda consolidação, sugestão e revisão versionadas;
- `whatsapp_caixa_webhook_secrets` guarda, em área acessível apenas ao backend, o hash do segredo inbound associado a cada `whatsapp_caixas.id`;
- `sucesso_aluno_sinais` materializa ocorrências operacionais e aponta para evidências canônicas;
- `aluno_acoes` recebe referências explícitas à pesquisa e à análise quando a ação nascer desse fluxo.

`pesquisa_evasao.status` continua legível durante a migração, mas novos consumidores usam `envio_status` e `resposta_status`. Uma camada de compatibilidade deriva o status legado até todos os consumidores migrarem.

O motor de `agente_fila_mensagens` serve como referência para debounce e claim atômico. A pesquisa usa tabelas próprias porque sua retenção, auditoria, associação ao aluno e revisão são diferentes da conversa comercial.

## 6. Identidade do envio

### 6.1 Regra de produto

A assinatura vem automaticamente do usuário autenticado:

- login da Fabi: assinatura configurada da Fabi;
- login da Jéssica: assinatura configurada da Jéssica.

Não haverá escolha livre de identidade na primeira entrega. Isso evita que uma pessoa assine pela outra e elimina texto de operador controlado pelo navegador.

### 6.2 Registro de auditoria

O envio preserva separadamente:

- `executado_por_usuario_id`: usuário que clicou;
- `executado_por_auth_user_id`: identidade de autenticação;
- `assinatura_nome_snapshot`: nome exibido ao destinatário;
- `assinatura_perfil_id`: configuração autorizada da assinatura;
- `mensagem_renderizada`: conteúdo exato;
- `template_versao`;
- `caixa_id`;
- `provider_message_id`;
- data e modo de envio.

O nome mostrado usa uma assinatura configurada no servidor. O cliente não envia texto livre como operador.

Uma eventual função de “enviar em nome de” será uma capacidade administrativa posterior, com permissão e auditoria próprias.

## 7. Prévia e confirmação

O botão `Enviar` abre uma prévia, sem disparar imediatamente.

A prévia mostra:

- aluno;
- destinatário e relação com o aluno;
- telefone mascarado;
- unidade, curso e professor;
- adulto ou menor;
- usuário que assina;
- mensagem completa renderizada;
- modo produção ou teste;
- alertas de cadastro;
- regra que tornou o aluno elegível.

O envio só ocorre após confirmação explícita. A mensagem é renderizada no servidor para impedir diferença entre a prévia e o conteúdo efetivamente enviado.

O modo teste:

- usa telefone de teste autorizado;
- grava `modo_teste=true`;
- não entra em taxa de resposta, motivos ou indicadores;
- não substitui o telefone cadastrado do aluno;
- não altera `alunos` nem `movimentacoes_admin`;
- é visualmente distinto em todas as telas.

## 8. Conversa e resposta multipartes

### 8.1 Princípio

A primeira mensagem recebida não finaliza automaticamente a pesquisa. Ela abre ou continua uma sessão de coleta.

Cada fragmento é um evento imutável:

- texto;
- áudio;
- imagem ou documento não suportado;
- mensagem citada;
- ID do provedor;
- caixa;
- telefone normalizado;
- horário do provedor e de recebimento;
- transcrição e status da transcrição;
- referência da pesquisa resolvida;
- evidência usada na resolução.

O texto consolidado é derivado desses eventos e pode ser recalculado. Os eventos originais não são sobrescritos.

### 8.2 Estados separados

Entrega e resposta não compartilham um único status.

**Estados de entrega:**

- `nao_enviado`;
- `enviando`;
- `enviado`;
- `falhou`;
- `entregue`, quando o provedor oferecer evidência;
- `lido`, quando o provedor oferecer evidência.

**Estados da resposta:**

- `sem_resposta`;
- `coletando`;
- `pronta_para_revisao`;
- `em_revisao`;
- `revisada`;
- `expirada`;
- `invalidada`;
- `recusada_opt_out`.

### 8.3 Rajada curta e continuação tardia

O fluxo usa duas janelas:

1. uma janela curta de acumulação para mensagens enviadas em sequência;
2. a janela total da pesquisa para permitir continuação posterior.

A primeira implementação usa:

- 60 segundos de silêncio para consolidar uma rajada provisória;
- 15 minutos de silêncio para marcar conteúdo substantivo como `pronta_para_revisao`;
- sete dias como janela total da pesquisa.

Uma nova mensagem dentro dos sete dias:

- é anexada à mesma conversa;
- atualiza a consolidação;
- retorna a análise ainda não concluída para `pronta_para_revisao`;
- cria uma nova versão se uma revisão anterior já tiver sido concluída.

A equipe encerra a revisão; o aluno não precisa escrever uma palavra de comando.

### 8.4 Mensagem não substantiva

Frases como:

- “vou responder amanhã”;
- “agora não consigo”;
- “mais tarde eu explico”;
- “deixa eu falar uma coisa”;

mantêm a sessão em `coletando`. Elas contam como interação, mas não como resposta válida para a taxa de pesquisa.

Uma heurística pode sugerir `adiamento`, `abertura` ou `conteudo_substantivo`, mas a confirmação de resposta válida é humana.

Recusa explícita e opt-out, como “não quero responder” ou “não me mande mais mensagens”, têm tratamento próprio:

- registram o evento original;
- mudam `resposta_status` para `recusada_opt_out`;
- bloqueiam reenvio e qualquer lembrete desta pesquisa;
- não contam como resposta válida nem entram na análise de motivos;
- permanecem auditáveis para que a equipe respeite a preferência do contato.

### 8.5 Texto e áudio misturados

- Cada áudio é armazenado como evento próprio.
- A transcrição é assíncrona e possui estado independente.
- Texto recebido antes ou depois do áudio permanece na ordem cronológica.
- A conversa só vai para revisão automática quando não houver transcrição pendente, salvo decisão manual da equipe.
- Falha de transcrição mantém o áudio reproduzível para usuário autorizado e não transforma conteúdo vazio em resposta concluída.

### 8.6 Idempotência e ambiguidade

`provider_message_id` é único por caixa/provedor. Reentrega do webhook não cria outra parte.

A resolução da pesquisa segue:

1. mensagem citada ligada ao envio original;
2. caixa + telefone + única pesquisa aberta;
3. fila de triagem manual quando houver ambiguidade.

Não pode haver duas pesquisas abertas simultaneamente no mesmo telefone e caixa quando o provedor não oferecer contexto confiável. Um segundo envio é bloqueado ou agendado depois do encerramento da primeira conversa.

Isso protege famílias com irmãos e responsáveis compartilhados.

## 9. Classificação e revisão humana

### 9.1 Camadas preservadas

1. Motivo cadastrado na movimentação.
2. Eventos originais da resposta.
3. Consolidação derivada.
4. Sugestão de classificação.
5. Revisão humana versionada.

Nenhuma camada substitui a anterior.

### 9.2 Taxonomia inicial

As causas são multirrótulo:

- financeiro;
- tempo e horário;
- saúde;
- desânimo ou perda de interesse;
- pedagógico ou professor;
- atendimento e experiência;
- mudança de endereço;
- família, estudo ou trabalho;
- conclusão ou objetivo alcançado;
- outro;
- inconclusivo;
- resposta inválida.

Cada macrocausa pode ter subcausas. Exemplos:

- financeiro: inadimplência, perda de renda, priorização de despesas;
- tempo: incompatibilidade de horário, excesso de atividades;
- pedagógico: pontualidade, duração da aula, didática, vínculo, troca de professor;
- experiência: atendimento, infraestrutura, comunicação.

### 9.3 Relação com o motivo anterior

- `confirmou`;
- `confirmou_parcialmente`;
- `complementou`;
- `divergiu`;
- `sem_motivo_anterior`;
- `inconclusivo`;
- `invalido`.

A análise também guarda evidência textual mínima, confiança da sugestão, usuário revisor e data.

### 9.4 Proteção do professor

Uma resposta individual pode abrir uma apuração, mas não cria automaticamente penalidade ou indicador negativo do professor.

Relatórios por professor exigem:

- amostra mínima;
- período explícito;
- causa revisada;
- separação entre relato, evidência operacional e conclusão da coordenação;
- ausência de exposição da resposta bruta a públicos não autorizados.

## 10. Fila operacional do Sucesso do Aluno

A tela terá cinco filas:

1. **Aptos para envio**;
2. **Bloqueados por cadastro**;
3. **Aguardando ou coletando resposta**;
4. **Aguardando revisão**;
5. **Ações e acompanhamentos**.

Alunos sem telefone, sem responsável válido, com vínculo ambíguo ou fora do público não desaparecem. Eles aparecem com motivo de bloqueio e próxima ação permitida.

Filtros e contadores usam o mesmo período e a mesma população. A listagem é paginada no servidor.

O público da pesquisa deve distinguir:

- aluno regular;
- segundo curso;
- bolsista;
- colaborador;
- professor;
- outro vínculo interno.

Coincidência por nome pode sugerir revisão, mas não define vínculo interno.

## 11. Ações e aprendizado

Uma resposta revisada pode criar uma linha em `aluno_acoes` com:

- tipo;
- responsável;
- descrição;
- prazo;
- resultado;
- referência da pesquisa;
- referência da análise;
- unidade.

Resultados mínimos:

- contato realizado;
- não localizado;
- encaminhado à coordenação;
- encaminhado ao financeiro;
- solução oferecida;
- aluno recuperado;
- retorno futuro acordado;
- saída confirmada;
- sem ação necessária.

Relatórios de efetividade usam ação e resultado. Sem esse vínculo, o sistema descreve evasões, mas não aprende quais intervenções funcionam.

## 12. Mapa de sinais

### 12.1 Contrato neutro

Os agentes não são donos dos fatos. Todos consomem ou publicam um contrato comum de sinal contendo:

- aluno e unidade;
- tipo do sinal;
- severidade;
- data da ocorrência;
- regra e versão;
- referência à evidência canônica;
- origem do cálculo;
- confiança e pendência de revisão;
- status operacional;
- responsável e prazo, quando houver.

O sinal não copia o prontuário inteiro. Ele aponta para a evidência autorizada.

### 12.2 Sinais iniciais

- duas faltas confirmadas em aulas distintas e consecutivas;
- 25% ou mais de faltas em 30, 60 ou 90 dias;
- queda recente de presença;
- aluno com menos de seis meses e baixa frequência;
- inadimplência combinada com ausência;
- renovação próxima combinada com risco;
- ausência de aula confirmada por mais de 14 dias;
- health score baixo ou crítico, com versão e confiança;
- resposta negativa de jornada;
- motivo de evasão divergente;
- recorrência revisada por curso, professor ou horário.

Presença usa `vw_aluno_presenca_semantica_v1`, conta eventos/dias de aula distintos e respeita a política temporal de confiança. Duas linhas da mesma aula ou a mesma data repetida não formam duas faltas consecutivas.

## 13. Responsabilidade de Lia, Sol e Fábio

### 13.1 Lia — Sucesso do Aluno

Responsável por:

- fila de sinais do aluno;
- pesquisa de evasão;
- respostas e divergências;
- priorização de contatos humanos;
- acompanhamento de ações;
- relatórios de retenção;
- aprendizado sobre causas e intervenções.

Lia pode consumir sinais administrativos e pedagógicos autorizados, mas não altera suas fontes.

### 13.2 Sol — Administrativo

Responsável por:

- inadimplência e contexto financeiro operacional;
- renovação e contrato;
- cadastro e bloqueios administrativos;
- saúde das rotinas e filas administrativas;
- publicação de sinais administrativos para a Lia.

Sol não recebe a propriedade da pesquisa de evasão, não interpreta conteúdo pedagógico bruto e não possui acesso direto a respostas, transcrições ou análises privadas. Quando necessário, consome apenas sinais administrativos ou agregados explicitamente autorizados.

### 13.3 Fábio — Professores e coordenação

Responsável por:

- conteúdo e registro da aula;
- passagem de bastão;
- sinais pedagógicos;
- contexto de professor, curso, turma e horário;
- encaminhamentos para coordenação;
- devolutiva de ações pedagógicas.

Fábio não recebe dados financeiros no LA Teacher e não transforma resposta privada do aluno em penalidade automática.

### 13.4 Regra de passagem

Cada agente publica um sinal ou uma ação por contrato. Nenhum agente lê livremente todas as tabelas dos outros domínios.

Exemplo:

```text
Sol publica "inadimplência ativa"
Fábio publica "aula sem registro confiável"
Lia combina os sinais com frequência e jornada
Equipe humana decide e registra a ação
```

## 14. Relatórios internos

### 14.1 Fonte e canal

O painel mantém a lista completa. O WhatsApp recebe um resumo operacional com link para a fila filtrada.

O transporte deve reutilizar, após validação:

- `whatsapp_destinatarios_relatorio` para destinos autorizados;
- `fila_relatorios_sol_hermes` para entrega, retentativa e evidência;
- watchdog existente para itens presos ou erros temporários.

O conteúdo de Lia não deve ser produzido dentro da função de transporte. Geração e entrega permanecem componentes separados.

### 14.2 Resumo diário

Configuração inicial:

- dias úteis;
- 08:00 BRT;
- um resumo por grupo autorizado;
- contagem por unidade;
- top 5 prioridades por unidade;
- quantidade restante na fila;
- causas dos sinais;
- ação recomendada;
- link para o LA Report.

O grupo não recebe:

- telefone do aluno;
- telefone ou nome do responsável;
- transcrição ou áudio;
- conteúdo de anamnese;
- texto bruto da pesquisa;
- detalhes financeiros além do sinal operacional necessário.

### 14.3 Análise semanal

Configuração inicial:

- segunda-feira às 08:00 BRT;
- comparação com a semana anterior;
- novas prioridades;
- ações vencidas;
- pesquisas enviadas, interações, respostas válidas e revisões;
- distribuição de causas;
- divergências entre motivo registrado e relatado;
- evasão prematura;
- sinais que antecederam saídas;
- ações e resultados.

### 14.4 Versionamento e idempotência

Todo relatório guarda:

- competência;
- público;
- destino;
- regra e versão;
- horário de corte;
- fontes e última atualização;
- chave idempotente;
- status de envio;
- ID da mensagem;
- erro e tentativas.

Mudanças relevantes de volume exibem uma nota de metodologia. Um relatório não pode mudar de 290 para 106 casos sem registrar versão, corte ou critério que permita explicar a diferença.

## 15. Auditoria da VPS

O primeiro acesso à VPS é somente leitura e usa usuário próprio com chave SSH revogável.

A auditoria deve mapear:

- repositórios e commits em execução;
- serviços, containers e timers;
- crons da Lia, Sol, Fábio e Hermes;
- consultas ao Supabase;
- regras do risco silencioso e da falta consecutiva;
- prompts e modelos;
- integração com Telegram;
- integração com WhatsApp;
- filas, retentativas, locks e idempotência;
- logs e mascaramento de dados;
- segredos apenas por nome e origem, sem copiar valores;
- versão do código que gerou cada relatório.

Nenhuma mudança, reinicialização, instalação ou rotação de segredo ocorre durante essa primeira auditoria.

Esta auditoria é independente dos Subprojetos A, B e C. Ela pode ser executada em paralelo a A e B para antecipar as decisões dos Subprojetos D e E, sempre mantendo o escopo somente leitura.

O resultado será um mapa:

```text
job -> agente -> regra -> consulta -> fonte canônica -> saída -> canal -> dono operacional
```

## 16. Segurança e privacidade

- `enviar-pesquisa-evasao` exige JWT.
- A função resolve o usuário pelo token.
- O servidor valida permissão, unidade, movimentação e público.
- Service role não transforma endpoint público em autorização.
- `webhook-whatsapp-inbox` permanece sem JWT porque recebe chamadas do provedor, mas exige um segredo forte e diferente por caixa antes de instanciar ou usar o cliente com service role.
- O segredo inbound usa preferencialmente o header `x-webhook-secret`; query param opaco é fallback somente quando o provedor não suportar header customizado.
- O banco guarda apenas SHA-256 do segredo, com chave estrangeira para `whatsapp_caixas`; o valor recebido nunca é persistido nem escrito em log.
- Ausência de `caixa_id`, caixa inativa, segredo ausente ou hash divergente retorna `401`/`403` antes de qualquer escrita ou roteamento.
- O health check interno usa autenticação de serviço separada; ele não cria uma exceção pública capaz de contornar o segredo inbound.
- `telefone_override` só existe em modo teste autorizado.
- `pesquisa_evasao`, mensagens, transcrições e análises usam RLS baseada em `sucesso_aluno.evasao.*`, respeitando unidade e ação (`ver`, `enviar`, `revisar`, `gerir_acoes`, `relatorios`, `modo_teste`).
- Policies permissivas com `qual=true`, inclusive para `authenticated`, `mila_acesso_restrito` e `sol_acesso_restrito`, são removidas; acesso de agentes ocorre apenas por contrato/read model autorizado.
- Mídia privada usa URL assinada.
- `webhook_debug_log` deixa de receber payload bruto. Diagnóstico persistido, se necessário, contém apenas IDs internos/correlation ID, tipo de evento, rota, status e timestamps, sem texto, áudio, telefone, nome, URL de mídia ou segredo.
- Os payloads integrais já retidos em `webhook_debug_log` são expurgados na implantação do Subprojeto B; o log sanitizado passa a ter retenção automática máxima de sete dias.
- Logs de execução não registram texto integral, telefone, token, transcrição ou payload completo.
- Relatórios de grupo minimizam dados pessoais.
- Acesso à resposta bruta é separado do acesso ao indicador agregado.
- Toda classificação oficial registra revisor humano.
- Teste e produção são populações distintas.

Permissões mínimas:

- `sucesso_aluno.evasao.ver`;
- `sucesso_aluno.evasao.enviar`;
- `sucesso_aluno.evasao.revisar`;
- `sucesso_aluno.evasao.gerir_acoes`;
- `sucesso_aluno.evasao.relatorios`;
- `sucesso_aluno.evasao.modo_teste`.

## 17. Falhas e recuperação

- Falha antes do provedor não marca envio como concluído.
- Timeout com resultado incerto exige reconciliação pelo ID idempotente antes de reenviar.
- Webhook duplicado é ignorado pelo ID do provedor.
- Áudio sem transcrição continua pendente e reproduzível por usuário autorizado.
- Mensagem ambígua vai para triagem, não para o aluno errado.
- Webhook sem credencial válida é rejeitado antes de qualquer escrita, invocação ou alteração de estado.
- Recusa/opt-out impede reenvio e lembrete sem marcar resposta válida.
- Erro de classificação não perde os eventos originais.
- Falha do canal WhatsApp interno não perde o relatório; a fila retenta conforme política.
- Falha de Lia, Sol ou Fábio não bloqueia a fonte canônica nem altera fatos.

## 18. Observabilidade

Indicadores operacionais:

- envios tentados, enviados, entregues e falhos;
- respostas com qualquer interação;
- respostas válidas;
- sessões coletando há mais de 24 horas;
- transcrições pendentes ou falhas;
- mensagens ambíguas;
- revisões pendentes;
- ações vencidas;
- relatórios enviados, atrasados e falhos;
- idade da última sincronização de cada fonte;
- regra/versão usada em cada sinal.

Logs técnicos usam IDs internos e correlation ID. Conteúdo sensível fica no banco autorizado, não no log.

## 19. Testes obrigatórios

### 19.1 Envio

1. Usuário anônimo não envia.
2. Usuário sem permissão não envia.
3. Usuário de outra unidade não envia.
4. Fabi assina como Fabi.
5. Jéssica assina como Jéssica.
6. O cliente não falsifica a assinatura.
7. Prévia e mensagem enviada são idênticas.
8. Modo teste não altera telefone de aluno ou movimentação.
9. Modo teste não entra em analytics.
10. Movimentação inválida não recebe pesquisa.

### 19.2 Resposta multipartes

1. Três textos em sequência viram três eventos e uma consolidação.
2. Texto, áudio e texto preservam ordem.
3. Webhook repetido não duplica mensagem.
4. “Respondo amanhã” mantém `coletando`.
5. Conteúdo substantivo após o adiamento entra na mesma sessão.
6. Nova parte após 15 minutos reabre a revisão ainda não concluída.
7. Nova parte após revisão cria nova versão.
8. Transcrição falha não marca resposta como concluída.
9. Dois irmãos no mesmo telefone não recebem associação silenciosa errada.
10. Mensagem sem pesquisa resolvível vai para triagem.
11. Webhook sem segredo é rejeitado antes de qualquer escrita.
12. Webhook com segredo de outra caixa é rejeitado.
13. Webhook com segredo válido da caixa é processado uma única vez.
14. O segredo recebido não aparece no banco nem nos logs.
15. `buttonOrListid` autenticado continua invocando `processar-resposta-pesquisa` e atualiza a pesquisa pós-1ª aula.
16. “Não quero responder” muda para `recusada_opt_out`, bloqueia reenvio/lembrete e não incrementa resposta válida.
17. Usuário autenticado sem `sucesso_aluno.evasao.ver` não lê resposta privada.
18. Sol e Mila não acessam diretamente resposta/transcrição privada.

### 19.3 Dados e sinais

1. Motivo legado aparece quando o catálogo está ausente.
2. Motivo original nunca é sobrescrito.
3. Uma resposta aceita múltiplas causas.
4. Classificação de IA sem revisão não entra em KPI oficial.
5. Duas linhas da mesma aula contam uma ocorrência.
6. A mesma data repetida não forma falta consecutiva.
7. Segundo curso preserva identidade operacional separada.
8. IDs iguais em unidades diferentes não se misturam.
9. Colaborador/professor é público explícito, não inferência por nome.

### 19.4 Relatórios

1. Resumo diário não contém telefones.
2. Relatório inclui regra, versão e corte.
3. Chave idempotente impede duplicidade no grupo.
4. Erro temporário entra em retentativa.
5. Erro permanente fica visível.
6. Link abre a fila com os mesmos filtros do resumo.

## 20. Critérios de aceite

### 20.1 Fundação de produção

- Não existe envio anônimo.
- Fabi e Jéssica são identificadas pelo login.
- Toda mensagem tem prévia.
- Teste não contamina produção.
- Alunos bloqueados por cadastro permanecem visíveis.
- A lista não é limitada silenciosamente aos primeiros 100 casos.

### 20.2 Resposta multipartes

- Nenhum fragmento é perdido ou sobrescrito.
- Texto e áudio podem compor a mesma resposta.
- Interação não substantiva não infla taxa de resposta.
- Recusa/opt-out é respeitada, bloqueia novos contatos da pesquisa e não infla taxa de resposta.
- Conteúdo consolidado possui revisão humana.
- Famílias com telefone compartilhado não são associadas silenciosamente ao aluno errado.
- Webhooks falsos ou de caixa incorreta são rejeitados antes do uso da service role.
- O fluxo de resposta da pesquisa pós-1ª aula continua funcionando pelo mesmo inbound autenticado.

### 20.3 Inteligência e operação

- Motivo cadastrado e motivo relatado são comparáveis.
- Toda causa oficial tem revisão.
- Ação e resultado podem ser vinculados.
- Lia recebe um read model governado.
- Sol e Fábio publicam sinais sem expor seus domínios integralmente.
- O grupo recebe resumo útil, e a equipe trabalha no painel.

## 21. Decomposição em subprojetos

O escopo não será implementado em um único plano.

### Subprojeto A — Fundação segura da pesquisa

- autenticação e permissões;
- identidade de Fabi/Jéssica;
- template versionado;
- prévia;
- modo teste;
- elegibilidade, paginação e bloqueios;
- fechamento das escritas diretas de telefone.
- reescrita das policies de `pesquisa_evasao` e das novas tabelas com `sucesso_aluno.evasao.*`;
- remoção do acesso total de `authenticated`, Mila e Sol às respostas privadas;
- contratos/read models mínimos para agentes, sem acesso bruto.

### Subprojeto B — Conversa multipartes

- trilha append-only;
- idempotência;
- texto e áudio;
- transcrição;
- estados de coleta;
- consolidação;
- ambiguidade e telefone compartilhado;
- fila de revisão.
- segredo inbound por caixa e rejeição anterior à service role;
- preservação do encaminhamento pós-1ª aula para `processar-resposta-pesquisa`;
- recusa/opt-out;
- remoção de payload bruto dos logs, expurgo do legado e retenção do diagnóstico sanitizado.

### Subprojeto C — Classificação, ação e analytics

- taxonomia;
- match/divergência;
- revisão humana;
- `aluno_acoes`;
- indicadores;
- relatório de causas e efetividade.

Decisões abertas exclusivas do Subprojeto C:

- disparo imediato, D+X ou outra janela em relação à data da movimentação;
- se haverá lembrete, em quais condições, quantidade, intervalo e canal;
- como a política de lembrete respeitará `recusada_opt_out`, interação não substantiva e pesquisas em revisão.

### Subprojeto D — Mapa de sinais e Lia

- contrato neutro de sinais;
- presença, risco, jornada e financeiro;
- fila proativa;
- read model da Lia;
- diário e semanal.

### Subprojeto E — Ponte VPS e canais

- auditoria somente leitura;
- inventário Lia/Sol/Fábio/Hermes;
- reaproveitamento do motor atual;
- Telegram/WhatsApp;
- destinos, privacidade, observabilidade e rollback.

Cada subprojeto terá spec complementar apenas se a auditoria revelar decisões novas e terá plano de implementação próprio.

## 22. Ordem de implementação

1. Iniciar o Subprojeto A e a auditoria somente leitura da VPS em paralelo.
2. Iniciar o Subprojeto B assim que os contratos de persistência e permissão de A estiverem definidos; a auditoria da VPS pode continuar em paralelo.
3. Subprojeto C.
4. Subprojeto D, informado pelos resultados da auditoria.
5. Subprojeto E.

A pesquisa pode entrar em operação após A e B, com classificação manual inicial. Relatórios inteligentes e cruzamentos entram depois, sem bloquear o fluxo seguro de agosto.

## 23. Riscos residuais

- Resposta por WhatsApp sem citação pode permanecer ambígua.
- Parte dos evadidos não possui telefone ou `aluno_id`.
- A taxonomia precisará de calibração após respostas reais.
- Acesso à VPS pode revelar lógica não versionada.
- O risk score atual tem cobertura temporal curta para validar previsão de evasão.
- A qualidade de presença deve permanecer condicionada à política de confiança vigente.
- WhatsApp em grupo aumenta exposição interna e exige destino autorizado e minimização.

## 24. Evidência e arquivos relacionados

- `src/components/App/SucessoCliente/PesquisaEvasaoTab.tsx`
- `src/components/App/SucessoCliente/RespostasPesquisaTab.tsx`
- `supabase/functions/enviar-pesquisa-evasao/index.ts`
- `supabase/functions/webhook-whatsapp-inbox/index.ts`
- `supabase/functions/agente-webhook/index.ts`
- `supabase/functions/processar-mensagens-agendadas/index.ts`
- `supabase/migrations/20260727_enable_comercial_hermes_auto_queue.sql`
- `supabase/migrations/20260729233000_sol_hermes_watchdog_retry_health.sql`
- `docs/auditorias/2026-07-11-mapa-backend-aluno.md`
- `docs/SOL-GUIA-METRICAS.md`
