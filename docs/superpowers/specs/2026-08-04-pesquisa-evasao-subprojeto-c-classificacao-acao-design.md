# Pesquisa de evasão — Subprojeto C: classificação, ação e aprendizado

**Data:** 04/08/2026

**Status:** aprovada para planejamento; implementação não iniciada

**Autoridade de produto:** Alf

**Escopo:** transformar respostas produtivas já revisadas em classificação
analítica humana, ações auditáveis e desfechos mensuráveis, sem sobrescrever a
fonte original nem criar indicador de professor

## 1. Decisão

O Subprojeto C transforma a conversa de evasão em dado operacional sem apagar
ou reinterpretar silenciosamente o que já existe.

O sistema preservará quatro objetos diferentes:

1. o motivo registrado no atendimento no momento da saída;
2. as mensagens originais da família e suas transcrições;
3. o texto consolidado e revisado pela pessoa do Sucesso do Aluno;
4. a classificação analítica, as ações e os desfechos confirmados por uma
   pessoa.

Revisar o texto e classificar o caso são trabalhos separados. Concluir uma
revisão textual não atribui automaticamente causa, relação com o motivo
anterior, ação ou resultado.

## 2. Baseline verificado

A auditoria somente leitura de 04/08/2026 no projeto de produção
`ouqwbbermlzqqvtqwlul` encontrou:

- 17 pesquisas produtivas;
- 15 pesquisas produtivas enviadas;
- 2 pesquisas produtivas com resposta válida;
- 1 análise produtiva concluída como `revisada`;
- 1 análise produtiva em `pronta_para_revisao`;
- nenhuma linha em `aluno_acoes`;
- `pesquisa_evasao.categoria_resposta` sem valor em todas as pesquisas;
- `pesquisa_evasao.sentimento` sem valor em todas as pesquisas.

A interface atual permite revisar o texto consolidado. A aba de respostas tem
um protótipo de classificação por um único tema e calcula confirmação ou
divergência por igualdade simples. Esse protótipo:

- não é multirrótulo;
- não registra quem classificou nem quando;
- não preserva versões;
- não representa confirmação parcial ou complemento;
- não oferece fluxo funcional de ação e desfecho.

`aluno_acoes` existe, mas a policy `Authenticated users can manage actions`
permite gerenciamento direto por qualquer role `authenticated`. O único
consumidor de interface identificado usa campos antigos que não existem no
schema atual. A tabela está vazia, portanto não há dado real a migrar.

### 2.1 Atraso atual do primeiro contato

Os 15 envios produtivos auditados foram feitos entre **25,6 e 32,7 dias** após
a data da saída, com mediana de 27,7 dias e média de 29,8 dias. Quase um mês de
atraso reduz a chance de resposta e praticamente elimina a chance de uma ação
de retenção ainda ser útil.

Por decisão de Alf, o sistema passa a sinalizar a pesquisa como elegível em
**D+1, às 10h BRT**, mas o envio continua manual. A pessoa decide se e quando
enviar; esta fase não cria disparo automático.

## 3. Objetivos

1. Classificar uma resposta com uma ou mais causas confirmadas por pessoa.
2. Comparar explicitamente a classificação com o motivo registrado na saída.
3. Preservar versão, autoria, horário e limite da conversa usado na análise.
4. Registrar ações decorrentes da resposta sem abrir escrita direta no banco.
5. Registrar desfechos sem sobrescrever o histórico anterior.
6. Mostrar filas de classificação, ação e acompanhamento.
7. Produzir indicadores iniciais de causas, divergências, ações e resultados.
8. Sinalizar manualmente os casos elegíveis a partir de D+1.

## 4. Não objetivos

- disparar automaticamente a primeira pesquisa;
- enviar lembrete automático à família;
- classificar uma resposta autonomamente por IA;
- criar mapa de sinais ou Health Score de retenção;
- produzir relatório da Lia sobre causas;
- criar ranking, penalidade ou indicador de professor;
- alterar mensagem, áudio, transcrição ou revisão textual já preservados;
- reclassificar registros de teste como dado produtivo;
- usar `categoria_resposta` ou `sentimento` como nova fonte canônica.

## 5. Camadas canônicas e imutabilidade

| Camada | Fonte | Regra |
|---|---|---|
| Motivo registrado | snapshot em `pesquisa_evasao` e movimentação vinculada | nunca é sobrescrito pela pesquisa |
| Resposta original | `pesquisa_evasao_mensagens` e `pesquisa_evasao_transcricoes` | append-only |
| Revisão textual | versão de `pesquisa_evasao_analises` | versão revisada é imutável |
| Classificação analítica | novas classificações versionadas | confirmação humana e append-only |
| Ação | `aluno_acoes` governada | histórico de intervenção |
| Desfecho | nova trilha de desfechos | cada mudança cria um evento novo |

A classificação é feita no nível do caso e declara até qual versão revisada da
conversa foi considerada. Se uma rodada nova for revisada depois, a
classificação anterior continua preservada, mas fica desatualizada. O caso
volta para `A classificar` até uma nova versão ser confirmada.

## 6. Modelo de classificação

### 6.1 Cabeçalho versionado

`pesquisa_evasao_classificacoes` guardará, no mínimo:

- pesquisa;
- versão sequencial da classificação;
- análise revisada mais recente incluída;
- versão máxima da conversa incluída;
- relação com o motivo registrado;
- justificativa humana curta;
- classificação anterior que foi sucedida, quando houver;
- usuário interno, auth UID e horário da confirmação.

O banco calcula a versão e resolve a identidade autenticada. O navegador não
envia nome de revisor, unidade, aluno ou motivo anterior.

A confirmação usa lock da pesquisa. Se uma nova análise for revisada entre a
abertura do formulário e a confirmação, a RPC rejeita a escrita com conflito.
Isso impede classificar uma fotografia antiga como se cobrisse a conversa
atual.

### 6.2 Categorias multirrótulo

`pesquisa_evasao_classificacao_categorias` terá uma linha por categoria da
versão. As categorias oficiais são:

- `financeiro` — dificuldade financeira, inadimplência ou prioridade de gasto;
- `tempo_horario` — falta de tempo ou incompatibilidade de horário;
- `saude` — saúde física ou emocional relatada;
- `desanimo` — perda de interesse, motivação ou vínculo;
- `pedagogico_professor` — didática, pontualidade, duração, método ou relação
  pedagógica;
- `atendimento_experiencia` — comunicação, atendimento, infraestrutura ou
  experiência geral;
- `mudanca_endereco` — mudança geográfica ou dificuldade de deslocamento;
- `familia_estudos_trabalho` — dinâmica familiar, estudos regulares ou
  trabalho;
- `outro` — causa substantiva fora da taxonomia;
- `inconclusivo` — conteúdo insuficiente para identificar causa;
- `resposta_invalida` — conteúdo sem relação com a pergunta ou incapaz de
  servir como resposta.

Regras:

- categorias substantivas podem coexistir;
- `inconclusivo` e `resposta_invalida` são exclusivas entre si e em relação às
  categorias substantivas;
- `outro` exige justificativa não vazia;
- uma classificação precisa ter pelo menos uma categoria;
- `modo_teste=true` nunca recebe classificação oficial.

### 6.3 Relação com o motivo anterior

A relação é uma decisão humana e usa exatamente um valor:

- `confirmou` — o motivo registrado cobre integralmente as causas relatadas;
- `confirmou_parcialmente` — há indício do motivo registrado, mas ele aparece
  qualificado ou sem confirmação suficiente para ser integral;
- `complementou` — o motivo registrado aparece e a família acrescenta outra
  causa material;
- `divergiu` — o motivo registrado não aparece, é contradito ou outra causa é
  apresentada em seu lugar;
- `sem_motivo_anterior` — não existia motivo anterior utilizável;
- `inconclusivo` — a conversa não permite comparar;
- `invalido` — a manifestação não é uma resposta válida à pesquisa.

O sistema pode validar coerência estrutural, mas não deduz essa relação por
igualdade de categorias. Em particular:

- `sem_motivo_anterior` só é aceito quando o snapshot anterior está vazio;
- `inconclusivo` exige a categoria `inconclusivo`;
- `invalido` exige a categoria `resposta_invalida`;
- relações substantivas não aceitam apenas categoria inconclusiva ou inválida.

## 7. Fluxo humano

1. A família responde em uma ou mais rodadas.
2. A pessoa revisa o texto de cada rodada na fila já existente.
3. Quando existe conteúdo revisado ainda não coberto por classificação, o caso
   entra em `A classificar`.
4. A tela mostra lado a lado:
   - motivo registrado, somente leitura;
   - resposta original e transcrições;
   - consolidação textual revisada;
   - última classificação, quando houver.
5. A pessoa seleciona categorias, relação e justificativa.
6. A RPC confirma uma nova versão com autoria e horário.
7. A pessoa pode criar uma ou mais ações e registrar desfechos.
8. Nova rodada revisada reabre apenas a classificação e o acompanhamento; não
   apaga revisão, classificação, ação ou desfecho anterior.

Revisar texto não marca a classificação como concluída. Classificar não altera
o texto revisado.

## 8. Ações

`aluno_acoes` continuará sendo a fonte canônica de intervenções. A evolução é
aditiva e preserva os tipos legados, mas acrescenta vínculo explícito com a
pesquisa e a classificação.

Tipos do fluxo de evasão:

- `retorno_familia`;
- `encaminhar_coordenacao`;
- `encaminhar_financeiro`;
- `vincular_professor`;
- `tentativa_retencao`;
- `solucao_oferecida`;
- `outro`.

Cada ação do fluxo guarda:

- pesquisa e classificação de origem;
- aluno e unidade resolvidos no servidor;
- tipo, descrição e prazo opcional;
- estado `pendente`, `realizada` ou `cancelada`;
- criador e horário;
- operador e horário da conclusão ou cancelamento;
- professor selecionado por ID, somente quando aplicável.

O professor nunca é inferido por nome, texto ou IA. Vincular uma ação a um
professor não cria indicador nem conclusão sobre sua responsabilidade.

## 9. Desfechos

`pesquisa_evasao_desfechos` será append-only. Os valores iniciais são:

- `recuperou`;
- `prometeu_voltar`;
- `confirmou_saida`.

O caso pode permanecer sem desfecho enquanto a ação está em andamento. Uma
mudança posterior não atualiza a linha antiga: cria uma nova linha com
referência ao desfecho anterior, autor, horário e observação. O read model usa
o evento mais recente como estado atual.

## 10. Interface e filas

### 10.1 Conversa e classificação

Depois das rodadas, a conversa exibirá o bloco `Transformar resposta em dado`.
Ele contém:

- motivo registrado;
- estado `A classificar`, `Classificada` ou `Conteúdo novo — reclassificar`;
- categorias multisseleção;
- relação com o motivo anterior;
- justificativa;
- confirmação explícita;
- histórico das versões anteriores recolhido por padrão.

O bloco fica disponível somente quando há ao menos uma análise produtiva
revisada. Testes continuam visíveis no histórico de teste, sem ação analítica.

### 10.2 Ação e resultado

Após uma classificação vigente, a tela permite:

- criar ação;
- ver ações pendentes e realizadas;
- concluir ou cancelar uma ação;
- registrar novo desfecho;
- ver o histórico de desfechos.

### 10.3 Estados operacionais

O read model distingue:

- `aguardando_revisao_textual`;
- `aguardando_classificacao`;
- `acao_pendente`;
- `em_acompanhamento`;
- `encerrado`.

A fila de revisão textual atual permanece separada. A aba `Respostas` passa a
mostrar classificação, ações e indicadores sem permitir o antigo clique único
em `categoria_resposta`.

## 11. Analytics desta fase

Os indicadores usam somente pesquisas produtivas e a classificação humana mais
recente que ainda cubra toda a conversa revisada.

Entram nesta fase:

- distribuição multirrótulo das causas;
- distribuição da relação com o motivo anterior;
- cobertura de respostas válidas, inconclusivas e inválidas;
- quantidade de ações por tipo e estado;
- distribuição do desfecho atual;
- recuperação por tipo de ação, sempre com tamanho da amostra.

Regras de leitura:

- percentuais de categorias podem somar mais de 100%;
- o denominador é exibido junto do percentual;
- classificação desatualizada por conteúdo novo é sinalizada e não entra como
  fotografia vigente;
- amostras pequenas recebem aviso e não viram conclusão estatística;
- registros de teste são excluídos;
- nenhum indicador é agrupado por professor nesta fase.

## 12. Elegibilidade D+1

Uma saída válida passa a ser elegível em D+1 às 10h no fuso
`America/Sao_Paulo`.

- antes do horário, a linha permanece visível como `Aguardando D+1`;
- no horário, a ação manual de envio é liberada;
- movimentação lançada retroativamente e já além do limite nasce elegível;
- a RPC de envio repete a regra; a tela não é a autoridade;
- nenhuma pesquisa é criada ou enviada pelo relógio;
- pesquisas já enviadas não são reescritas.

## 13. Política de lembrete

O lembrete automático à família continua **desligado**.

A Fase B da Lia continua cuidando do acompanhamento interno após 72 horas. Uma
interação não substantiva, resposta válida, opt-out ou resultado ambíguo do
provedor impede qualquer automação de lembrete.

Uma eventual tentativa manual de novo contato deve ser decidida e registrada
por pessoa. Ativar follow-up automático à família continua dependente de
decisão e cópia aprovadas por Alf em projeto separado.

## 14. IA como evolução prevista

A classificação por IA não faz parte desta fase. Quando for criada, seguirá o
modelo `IA sugere, pessoa confirma`:

- sugestão não altera a classificação oficial;
- pessoa pode aceitar, editar ou rejeitar;
- modelo, versão, sugestão e decisão humana ficam auditáveis;
- nenhuma menção individual vira fato sobre professor sem apuração humana.

O caso de Ana Beatriz é a referência de risco: era conteúdo de teste, não
evidência sobre uma família ou professor real. IA nunca pode transformar uma
ilustração, teste ou inferência em dado oficial sozinha.

## 15. Campos legados

`pesquisa_evasao.categoria_resposta` e `pesquisa_evasao.sentimento` ficam
declarados **legados**.

- ambos estão vazios no baseline;
- não haverá migração ou backfill;
- novos escritores e indicadores não usam essas colunas;
- elas permanecem temporariamente para compatibilidade;
- remoção futura exige inventário de consumidores e migration própria.

`classificar_resposta_evasao(uuid, text)` deixa de ser contrato de produto e
será revogada de `authenticated` quando o novo fluxo entrar, sem apagar as
colunas legadas.

## 16. Segurança e acesso

A decisão de produto continua sendo confiança interna com rastro: qualquer
usuário interno ativo pode ler e operar o fluxo, sem restrição por unidade ou
permissão granular. Isso não significa escrita direta no banco.

- identidade vem de `auth.uid()` e de `public.usuarios`;
- navegador chama somente RPCs governadas;
- RPCs resolvem aluno, unidade, pesquisa, versão e autoria no servidor;
- `modo_teste=true` é rejeitado nas escritas oficiais;
- roles de agentes continuam sem acesso bruto;
- funções públicas e `anon` não recebem `EXECUTE`.

Nesta fase, a policy ampla de `aluno_acoes` será removida. O estado final será:

- leitura para usuário interno ativo;
- nenhuma escrita direta para `authenticated`;
- escrita por RPC auditada e `service_role`;
- grants mínimos e explícitos.

Falha de resolução de identidade, versão ou vínculo fecha a operação sem gravar
dado parcial.

## 17. Compatibilidade e rollout

A entrega será aditiva e dividida para não abrir janela de quebra:

1. schema, RLS e RPCs governadas;
2. frontend de classificação e ação;
3. substituição do read model analítico;
4. ativação da elegibilidade D+1;
5. retirada do escritor legado.

Migrations versionadas entram somente por `supabase db push`, conforme a regra
de reconciliação do histórico. Não usar `apply_migration` do MCP.

Antes do rollout:

- ensaio PostgreSQL 17 com schema e fixture controlada;
- revisão do diff de policies e grants;
- prova de que a pesquisa produtiva revisada entra em `A classificar`, sem
  classificação inventada;
- prova de que as linhas de teste não entram;
- prova de que nenhuma resposta, rodada ou mensagem é reescrita;
- prova de que a Fase A e a Fase B da Lia continuam sem alteração.

Nenhuma migration, deploy ou escrita em produção é autorizada por esta spec.

## 18. Critérios de aceite

1. Motivo registrado, resposta original, revisão textual e classificação
   continuam distinguíveis.
2. Uma classificação aceita múltiplas categorias e uma relação explícita.
3. Toda classificação oficial tem usuário, auth UID, horário e limite da
   conversa analisada.
4. Conteúdo novo não altera a versão anterior e reabre a classificação.
5. Ações e desfechos são vinculados e auditáveis.
6. A versão antiga de um desfecho nunca é sobrescrita.
7. `aluno_acoes` não aceita escrita direta de `authenticated`.
8. Testes não entram em classificação, ação, desfecho ou analytics.
9. A tela sinaliza D+1 e mantém o envio manual.
10. Não existe lembrete automático à família.
11. `categoria_resposta` e `sentimento` não recebem novos dados.
12. Indicadores não expõem nem penalizam professor.

## 19. Fora desta entrega

- Subprojeto D: mapa de sinais e correlações com presença, financeiro e health;
- Subprojeto E: relatórios da Lia, Sol e Fábio;
- alerta de causa ou KPI no grupo;
- classificação assistida por IA;
- indicador de professor;
- automação do primeiro disparo;
- follow-up automático à família.

