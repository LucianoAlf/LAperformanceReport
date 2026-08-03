# Health Score Professor V3 — leitura mensal e governança por ciclo

**Data:** 03/08/2026

**Status:** desenho aprovado em conversa; aguardando revisão documental antes do plano de implementação

**Escopo:** contrato canônico do Health Score Professor V3 nos recortes mensal e trimestral, comparabilidade, configuração, painel de Professores e relatórios da Coordenação

## 1. Objetivo

Organizar o Health Score Professor V3 em duas leituras complementares e explicáveis:

1. **Mensal:** acompanhamento vivo das evidências e do desempenho observado no mês selecionado.
2. **Ciclo:** governança de três meses, classificação comparável, fechamento, ranking e premiação.

O mensal ajuda a Coordenação a agir durante a operação. O ciclo reduz a volatilidade, reúne amostra suficiente e sustenta decisões comparativas. Os dois recortes usam o mesmo motor, a mesma configuração versionada e as mesmas fontes canônicas, mas não misturam períodos nem semânticas.

## 2. Problemas comprovados

O desenho atual mistura conceitos que precisam ser separados:

- um score normalizado sobre poucos pilares pode chegar a 100 e parecer superior ao de professores com base ampla;
- o percentual chamado de cobertura usa pontos brutos dos pesos e não o total pontuável normalizado, tornando `55%` ambíguo quando o denominador real é 90;
- alguns textos genéricos, como `Evidência pendente` e `Dados em auditoria`, aparecem mesmo quando a causa é conhecida;
- a visualização mensal usa, em alguns pilares, dados de ciclo ou referência anterior sem separar claramente o período;
- a visualização de ciclo falha e devolve ausência generalizada de dados, embora existam evidências mensais;
- professores antigos e novos acabam no mesmo estado genérico de `Base em formação`, mesmo por causas diferentes;
- classificação, nota observada, comparabilidade, publicação e premiação aparecem como se fossem uma única coisa.

## 3. Princípios

1. **Falta de evidência nunca vira zero.**
2. **Base pequena nunca gera vantagem competitiva.**
3. **Todos os professores ativos permanecem visíveis.**
4. **Mensal e ciclo são leituras diferentes do mesmo contrato, não duas fórmulas independentes.**
5. **O mensal nunca herda silenciosamente o valor de outro mês.**
6. **O ciclo agrega fatos brutos; nunca calcula média simples de percentuais, médias ou scores mensais.**
7. **Carteira e capacidade permanecem diagnósticos e não alteram a nota.**
8. **Professores novos e antigos obedecem às mesmas regras de evidência e comparabilidade.**
9. **Configurações ativas e snapshots fechados são imutáveis.**
10. **Painel, modal, relatórios e agentes apenas consomem o contrato canônico; nenhum deles recalcula o score.**

## 4. Calendário fixo dos ciclos

Os ciclos de governança e premiação são fixos:

| Código | Meses | Início | Fim |
|---|---|---|---|
| `mar_abr_mai` | Mar / Abr / Mai | 01/03 | 31/05 |
| `jun_jul_ago` | Jun / Jul / Ago | 01/06 | 31/08 |
| `set_out_nov` | Set / Out / Nov | 01/09 | 30/11 |
| `dez_jan_fev` | Dez / Jan / Fev | 01/12 | último dia de fevereiro do ano seguinte |

O ciclo `Dez / Jan / Fev` pertence ao ano de início em dezembro e atravessa a virada do ano. A competência de referência selecionada deve resolver sempre o mesmo ciclo, sem deslocar os meses nem criar janelas móveis.

## 5. Dois recortes, uma fonte de verdade

### 5.1 Leitura mensal

O mensal responde: **“o que foi observado neste professor durante este mês?”**

Ele publica:

- valor observado de cada pilar no mês;
- numerador, denominador, amostra e estado de evidência;
- peso original, peso efetivo e contribuição dos pilares válidos;
- nota mensal observada, quando existir ao menos um pilar pontuável válido;
- quantidade de pilares válidos;
- cobertura normalizada;
- estado `Leitura comparável`, `Leitura parcial` ou `Sem base no mês`;
- contexto operacional e diagnósticos de carteira.

A nota mensal é instrumento de acompanhamento. Ela não produz ranking definitivo nem premiação.

Exemplos de apresentação:

- `Nota mensal: 88 · 4 de 5 pilares · cobertura 83% · leitura comparável`;
- `Desempenho observado: 75 · 3 de 5 pilares · cobertura 61% · leitura comparável`;
- `Desempenho observado: 88 · 2 de 5 pilares · cobertura 44% · leitura parcial`;
- `Sem base no mês · nenhuma evidência pontuável disponível`.

O score observado permanece visível mesmo quando a leitura é parcial. Nesse caso ele não recebe classificação competitiva `Saudável`, `Atenção` ou `Crítico` e não participa de ordenação comparativa por nota.

### 5.2 Leitura do ciclo

O ciclo responde: **“qual é o desempenho acumulado e comparável do professor no período oficial de três meses?”**

Ele agrega os fatos canônicos disponíveis desde o início do ciclo até a data de corte:

- retenção: soma dos numeradores e denominadores elegíveis do ciclo;
- conversão: soma de experimentais elegíveis e matrículas canônicas atribuíveis do ciclo;
- média de alunos por turma: soma das ocupações elegíveis dividida pela soma das turmas elegíveis;
- presença: soma de presenças elegíveis dividida pela soma dos registros elegíveis;
- permanência: histórico acumulado de vínculos encerrados elegíveis até a data de corte, respeitando a regra versionada de maturação;
- carteira: diagnóstico por fechamentos disponíveis, sem entrar na nota.

O ciclo nunca faz:

- média simples das taxas mensais;
- média dos scores mensais;
- cópia do último mês como resultado do ciclo;
- preenchimento de mês ausente com zero;
- invenção de permanência a partir de alunos ainda ativos.

### 5.3 Ciclo aberto e ciclo fechado

- **Ciclo em acompanhamento:** cálculo vivo, acumulado até a data de corte; classificação diagnóstica disponível somente quando comparável; sem ranking ou premiação oficial.
- **Ciclo fechado:** snapshot imutável, fontes conciliadas, regras de publicação atendidas e elegibilidade oficial decidida.
- **Ciclo oficial:** ciclo fechado, comparável e com `ranking_habilitado = true`; somente esse estado publica ranking e premiação.

Fechar o ciclo não muda retrospectivamente pesos, metas, amostras ou fontes. Retificação exige nova versão auditável, preservando a anterior.

## 6. Pilares e aplicabilidade

| Pilar | Mensal | Ciclo | Observação |
|---|---|---|---|
| Retenção atribuível | Eventos elegíveis do mês | Agregado dos eventos do ciclo | Exige amostra mínima versionada |
| Permanência com o professor | Histórico elegível até o fim do mês | Histórico elegível até a data de corte/fechamento | Vínculos ativos não são convertidos em permanência encerrada |
| Conversão Exp→Mat | Experimentais e matrículas atribuíveis do mês | Numerador e denominador acumulados no ciclo | Só pontua ao atingir a amostra mínima configurada |
| Média de alunos por turma | Ocupações ÷ turmas elegíveis do mês | Soma das ocupações ÷ soma das turmas do ciclo | Usa meta segmentada por unidade, curso e modalidade |
| Presença dos alunos | Eventos elegíveis do mês | Eventos elegíveis acumulados no ciclo | Respeita calendário, justificativas e vigência da política |
| Número de alunos/carteira | Diagnóstico do mês | Diagnóstico dos fechamentos do ciclo | Peso efetivo sempre zero |

### 6.1 Vigência da presença

A política pontuável de presença começa em `03/08/2026`. Dados anteriores continuam visíveis e auditáveis como referência histórica, mas não são promovidos retroativamente a evidência oficial da nota.

No ciclo inaugural `Jun / Jul / Ago 2026`, a presença pontuável considera somente eventos elegíveis a partir da vigência. Julho pode aparecer como `Referência histórica Jul/2026`, explicitamente fora da contribuição atual.

### 6.2 Conversão no mensal e no ciclo

A decisão anterior que apresentava conversão de ciclo dentro de uma solicitação mensal fica substituída por este contrato:

- mensal mostra a conversão do mês;
- ciclo mostra a conversão acumulada do ciclo;
- ambos preservam numerador, denominador e regra D+30;
- uma experimental sem pessoa canônica pode permanecer no denominador quando sua identidade operacional for válida;
- a matrícula no numerador continua exigindo pessoa e matrícula canônicas atribuíveis;
- `Sem experimental no mês` é ausência de evento, não pendência de dados;
- amostra abaixo do mínimo aparece como `Amostra atual: N de M` e fica fora da nota.

No ciclo aberto `Jun / Jul / Ago 2026`, a conversão atualmente publicada como diagnóstico provisório somente passa a compor a nota depois da ativação governada de uma nova revisão compatível com este desenho. A mudança vale para a projeção aberta; não reescreve snapshots já fechados nem apaga a regra anterior do histórico.

## 7. Cobertura e comparabilidade

### 7.1 Denominador normalizado

`Número de alunos` não compõe a nota. Com a configuração atual, os cinco pilares pontuáveis somam 90 pontos originais.

A cobertura deve ser calculada como:

`cobertura_normalizada = peso_original_disponível ÷ peso_original_pontuável_ativo × 100`

Exemplo: 55 pontos disponíveis em 90 equivalem a `61,1%` de cobertura, não a 55%.

O contrato também preserva os valores brutos:

- `peso_pontuavel_total`;
- `peso_disponivel_total`;
- `cobertura_normalizada`.

### 7.2 Regra de comparabilidade

Uma leitura mensal ou de ciclo só é comparável quando cumprir simultaneamente:

1. pelo menos 3 dos 5 pilares pontuáveis válidos;
2. cobertura normalizada igual ou superior ao corte configurado, inicialmente 60%;
3. pelo menos um pilar de fidelização válido: Retenção ou Permanência;
4. amostra mínima individual atendida em cada pilar que compõe a nota;
5. fonte canônica disponível e sem bloqueio real de auditoria.

O corte de cobertura é um campo versionado da configuração V3. Ele deve aparecer no laboratório de configuração, participar da simulação e ser aplicado pelo servidor. Não existe corte hardcoded no frontend.

### 7.3 Consequência do corte

| Recorte | Abaixo do corte | Acima do corte |
|---|---|---|
| Mensal | Score observado visível como `Leitura parcial`; sem classificação competitiva | `Leitura comparável`; classificação diagnóstica permitida; sem ranking definitivo |
| Ciclo aberto | Score observado visível como `Base em formação`; sem posição competitiva | `Ciclo em acompanhamento`; classificação diagnóstica permitida; sem premiação |
| Ciclo fechado | Fora do ranking, com motivo explícito | Elegível à publicação se todos os gates oficiais estiverem atendidos |

## 8. Estados e textos públicos

### 8.1 Estado da publicação

- `Mensal em andamento`;
- `Mensal fechado`;
- `Ciclo em acompanhamento`;
- `Ciclo fechado`;
- `Ciclo oficial`.

### 8.2 Estado da comparabilidade

- `Leitura comparável`;
- `Leitura parcial`;
- `Base em formação`;
- `Sem base operacional`;
- `Dados em auditoria` somente quando houver divergência ou fonte realmente indisponível.

### 8.3 Motivos por pilar

Usar a causa real, e não `Evidência pendente` como fallback universal:

- `Não realizou experimental no mês`;
- `Amostra atual: 2 de 3 experimentais`;
- `Sem aulas elegíveis no mês`;
- `Presença ainda não registrada no mês`;
- `Cobertura de presença insuficiente`;
- `Sem vínculos encerrados elegíveis`;
- `Amostra atual: 6 de 10 vínculos`;
- `Métrica não aplicável neste recorte`;
- `Dados em auditoria: <motivo objetivo>`.

O texto `Dados em auditoria` exige um código estruturado de auditoria. Não pode ser gerado apenas porque o valor é nulo ou a amostra está abaixo do mínimo.

## 9. Ordenação e apresentação

### 9.1 Mensal

A tabela mantém todos os professores e ordena em blocos:

1. leituras comparáveis: score decrescente, cobertura decrescente e nome;
2. leituras parciais/base em formação: cobertura decrescente, pilares válidos decrescentes e nome;
3. sem base operacional: nome.

Um desempenho observado alto com dois pilares não aparece acima de um professor comparável.

### 9.2 Ciclo

Durante o ciclo aberto, a ordenação operacional segue os mesmos blocos e usa o score acumulado comparável apenas dentro do primeiro bloco.

No ciclo fechado e oficial, a ordenação do ranking vem exclusivamente da lista canônica de ranking publicada no snapshot. O frontend não reconstrói posições.

### 9.3 Modal do professor

O modal mostra:

- recorte e datas exatas;
- configuração aplicada;
- nota observada ou comparável;
- cobertura normalizada e pesos brutos;
- pilares válidos e esperados;
- para cada pilar: valor, amostra, base, peso original, peso efetivo, contribuição, fonte e motivo de exclusão;
- no mensal, referência histórica apenas em cartão separado e explicitamente fora da nota;
- no ciclo, evolução dos três meses sem substituir o agregado oficial.

## 10. Configuração governada

A interface continua simples para o usuário, mas o contrato permanece auditável:

1. `Editar configuração` abre um laboratório de simulação;
2. pesos, metas, amostras, corte de cobertura e exigência de fidelização podem ser alterados conforme permissão;
3. a simulação recalcula mensal e ciclo usando o mesmo motor server-side;
4. a comparação mostra quem mudou de nota, cobertura, faixa e elegibilidade, com motivo;
5. `Aplicar` exige justificativa e cria uma nova versão pela RPC protegida por `professores.editar`;
6. a configuração vigente e snapshots fechados nunca são alterados diretamente;
7. desfazer e restaurar operam somente sobre a simulação local não aplicada.

Metas segmentadas por unidade, curso e modalidade permanecem necessárias para média por turma e diagnósticos operacionais. Carteira e capacidade continuam fora dos sliders da nota.

## 11. Contrato canônico de dados

O read model deve expor, sem exigir inferência do frontend:

- `periodicidade`: `mensal` ou `ciclo`;
- `periodo_inicio`, `periodo_fim`, `data_corte` e `ciclo_codigo`;
- `estado_publicacao`;
- `score_observado`;
- `score_comparavel`;
- `classificacao_diagnostica`;
- `ranking_habilitado` e `ranking_posicao` somente quando oficiais;
- `pilares_validos`, `pilares_esperados`;
- `peso_pontuavel_total`, `peso_disponivel_total`, `cobertura_normalizada`;
- `comparabilidade_estado` e `comparabilidade_motivos[]`;
- `configuracao_id`, `configuracao_versao` e impressão digital da regra;
- numerador, denominador, amostra, valor, nota, peso original, peso efetivo, contribuição e estado estruturado de cada pilar;
- referência histórica separada, quando aplicável;
- fontes e flags reais de reconciliação.

O ciclo deve ser produzido pelo banco a partir das fontes canônicas e retornar erro explícito quando o contrato estiver indisponível. O frontend não transforma falha da RPC em uma tabela inteira de `Dados em auditoria`.

## 12. Relatórios da Coordenação

### 12.1 Relatório mensal

O relatório mensal apresenta:

- evidências e desempenho do mês;
- nota mensal observada e cobertura;
- professores com leitura comparável, parcial e sem base;
- causas reais das lacunas;
- mapa de sinais pedagógicos e diagnósticos de carteira;
- evolução em relação ao mês anterior, identificada como comparação;
- nenhum ranking definitivo ou premiação.

### 12.2 Relatório consolidado do ciclo

O produto de ciclo apresenta:

- agregado canônico dos três meses;
- evolução mês a mês de cada pilar;
- cobertura e comparabilidade acumuladas;
- classificação diagnóstica durante o ciclo aberto;
- ranking e premiação somente após fechamento oficial;
- professores fora do ranking e o motivo objetivo;
- contexto de recesso, vigência de políticas e lacunas de qualidade dos dados.

### 12.3 Cinco relatórios atuais

Relatório Mensal com IA, Ranking, Carteira e Carga, Presença e Alertas e Retenção e Evasões continuam consumindo o mesmo produtor canônico. A IA redige somente narrativa; não escolhe período, não recalcula score e não promove resultado parcial a oficial.

## 13. Falhas e segurança semântica

- Falha de fonte bloqueia somente o pilar afetado e publica o motivo real.
- Falha da RPC de ciclo bloqueia a leitura de ciclo com mensagem acionável; não fabrica ausência para todos os professores.
- Referência anterior nunca compõe a nota mensal atual.
- Dados de julho não compõem presença oficial de agosto antes da vigência da política.
- Alteração de configuração invalida a projeção aberta e exige nova leitura server-side.
- Cache deve ser chaveado por unidade, periodicidade, período, configuração e versão do produtor.
- Consumidores antigos não inferem comparabilidade pela mera presença de score numérico.
- Configuração aplicada e snapshot fechado permanecem imutáveis e auditáveis.

## 14. Validação com casos reais

Os testes de aceite devem congelar os casos já investigados em Barra/Ago de 2026:

- **Matheus Reis:** retenção, conversão e média/turma válidas; permanência sem vínculos encerrados elegíveis; presença de julho apenas como referência. Deve mostrar 3/5 pilares, cobertura normalizada de 61,1% com a configuração atual e leitura comparável, sem chamar permanência de auditoria.
- **Jeyson Gaia:** somente permanência e média/turma válidas. Deve mostrar 2/5, leitura parcial/base em formação e score observado sem classificação competitiva.
- **Joel de Salles:** somente permanência e média/turma válidas. Mesmo tratamento de leitura parcial, sem ocultar os valores reais.
- **Mariana Carneiro:** somente permanência e média/turma válidas. Mesmo tratamento de leitura parcial.
- **Pedro Sérgio:** permanência, conversão e média/turma válidas. Deve mostrar 3/5 e cobertura normalizada de 61,1%, sem transformar retenção insuficiente em zero.
- **Willer Arruda:** permanência, conversão e média/turma válidas. Deve mostrar 3/5 e cobertura normalizada de 61,1%.
- **Adriana Mesquita e Fabrício Costa:** uma base estreita pode produzir desempenho observado alto, mas nunca liderança comparável.

Também devem existir testes para:

- ciclo `Dez / Jan / Fev` atravessando o ano corretamente;
- soma de numeradores e denominadores do ciclo;
- média de turma ponderada pelas turmas elegíveis;
- presença anterior à vigência apenas como referência;
- ciclo aberto sem ranking;
- ciclo fechado oficial imutável;
- mudança de pesos e corte refletida em tempo real após releitura server-side;
- falha da RPC de ciclo sem fallback silencioso;
- paridade entre tabela, modal e relatórios.

## 15. Ordem recomendada de implementação

1. congelar contratos e fixtures dos casos reais;
2. corrigir o produtor/RPC do ciclo e provar os agregados canônicos;
3. normalizar cobertura e versionar o corte configurável;
4. separar conversão mensal da conversão de ciclo;
5. publicar estados e motivos estruturados no read model;
6. ajustar tabela e modal sem alterar a identidade visual existente;
7. adaptar os relatórios mensal e consolidado de ciclo;
8. validar as três unidades em leitura somente, professor por professor;
9. executar build, testes SQL/contrato/frontend e smoke no navegador;
10. aplicar migrations, publicar frontend e validar produção somente após todos os gates.

## 16. Critérios de aceite

- mensal e ciclo exibem os períodos corretos e nunca misturam valores silenciosamente;
- ciclo agrega fatos brutos e não médias mensais;
- nenhum professor é penalizado por falta de evidência;
- nenhum professor lidera comparativamente com base insuficiente;
- cobertura usa o total pontuável ativo como denominador e o corte é configurável;
- score observado continua visível mesmo quando parcial;
- classificação competitiva exige comparabilidade;
- ranking e premiação exigem ciclo oficial fechado;
- carteira e capacidade permanecem diagnósticos;
- textos de ausência explicam a causa real;
- `Dados em auditoria` aparece somente quando existe auditoria real;
- a RPC de ciclo retorna dados ou falha explicitamente, sem preencher a tela com falsos nulos;
- tabela, modal e cinco relatórios usam o mesmo contrato canônico;
- mudança governada de pesos, metas, amostras ou corte é refletida pelo servidor sem reescrever histórico;
- snapshots fechados permanecem imutáveis;
- o desenho atende professores novos e antigos sem exceções pessoais ou remendos por nome.

## 17. Relação com decisões anteriores

Este documento consolida e especializa os desenhos de Coordenação e comparabilidade publicados em 02 e 03/08/2026.

Ele substitui especificamente:

- a apresentação de conversão de ciclo dentro do recorte mensal;
- a interpretação de cobertura bruta como percentual final;
- qualquer uso universal de `Evidência pendente` ou `Dados em auditoria`;
- qualquer ordenação de professor parcial pelo score observado contra professores comparáveis.

Permanecem válidos:

- configuração governada por versão, simulação e aplicação separada;
- imutabilidade de configuração vigente e snapshots fechados;
- carteira e capacidade fora da nota;
- metas segmentadas por unidade, curso e modalidade;
- produtor canônico único para painel e relatórios;
- ranking e premiação reservados ao ciclo oficial fechado.
