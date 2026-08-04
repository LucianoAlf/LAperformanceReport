# Health Score Professor V3

## Objetivo

O Health Score Professor V3 é um instrumento de governança pedagógica. Ele orienta apoio, acompanhamento e reconhecimento sem transformar falta de dados, demanda comercial, estrutura física ou distribuição de carteira em punição ao professor.

## Contrato da nota

Os pilares pontuáveis são:

- retenção atribuível;
- permanência com o professor;
- conversão experimental, somente a partir da amostra mínima configurada;
- média de alunos por turma;
- presença dos alunos.

`Número de alunos` e `carteira` continuam disponíveis como diagnóstico, mas têm peso efetivo zero e não entram no denominador da nota. Capacidade de sala/turma também é diagnóstico operacional: inconsistências ficam resumidas em Qualidade dos dados e nunca reduzem o score do professor.

Quando um pilar não se aplica ou não possui amostra suficiente, ele sai do denominador daquele professor. Os pesos dos pilares válidos são normalizados para 100%, preservando na leitura tanto o peso original quanto o peso efetivo.

O contrato separa quatro conceitos:

- **score observado:** nota calculada com os pilares válidos disponíveis, mesmo quando a base ainda não permite comparação;
- **cobertura normalizada:** soma dos pesos originais dos pilares válidos dividida pela soma dos pesos originais ativos e pontuáveis; carteira não participa desse denominador;
- **score comparável:** score observado que atende aos critérios versionados de comparabilidade, incluindo quantidade mínima de pilares, cobertura mínima, fidelização válida e amostras/fontes válidas;
- **ranking oficial:** ordenação formada exclusivamente por scores comparáveis de um ciclo oficial fechado e com ranking habilitado.

O padrão vigente de comparabilidade exige pelo menos três pilares pontuáveis, cobertura normalizada mínima de 60% e Retenção ou Permanência válida. Esses critérios pertencem à versão de configuração e podem ser alterados somente pelo fluxo governado de configuração.

## Períodos e agregação

A tela trabalha com dois recortes distintos:

- **Mensal:** usa somente os fatos da competência selecionada e serve para acompanhar as evidências daquele mês;
- **Ciclo:** é a leitura principal de desempenho e usa os ciclos fixos **Mar/Abr/Mai**, **Jun/Jul/Ago**, **Set/Out/Nov** e **Dez/Jan/Fev**.

O ciclo `Dez/Jan/Fev` atravessa o ano civil. Por exemplo, a referência Dez/2026 resolve o intervalo de 01/12/2026 a 28/02/2027.

As taxas de fluxo do ciclo são calculadas somando numeradores e denominadores brutos dos meses elegíveis. Conversão acumula matrículas e experimentais; presença acumula presentes e eventos classificados. Já `Número de alunos` e `Média de alunos por turma` são métricas de estado: usam a fotografia do último mês alcançado no recorte, sem somar carteiras nem fazer média dos três meses. Permanência continua sendo a posição histórica apurada até a data de corte. Não é permitido calcular o ciclo pela média dos scores mensais.

Na presença, a identidade da ocorrência inclui professor, unidade, ID externo da aula, pessoa e `data_aula`. O momento em que a chamada foi registrada não limita sua validade: uma presença lançada posteriormente pela Secretaria continua pertencendo à aula original. A data evita apenas que ocorrências diferentes com um ID externo reutilizado sejam combinadas.

Um ciclo aberto é identificado como `Ciclo em acompanhamento`: utiliza as evidências já disponíveis, mas não publica ranking nem premiação. O fechamento oficial materializa um snapshot imutável.

## Evidência e confiança

Ausência de base não equivale a zero. Cada lacuna recebe um código estruturado e uma explicação pública:

- `professor_em_maturacao`;
- `amostra_insuficiente`;
- `sem_experimental_periodo`;
- `cobertura_presenca_insuficiente`;
- `calendario_sem_aulas_elegiveis`;
- `segmentacao_incompleta`;
- `fonte_canonica_indisponivel`;
- `metrica_nao_aplicavel`.

Todos os professores ativos aparecem no painel e nos relatórios da Coordenação. O painel mostra o score observado e informa separadamente se a base é comparável. Professor não comparável não recebe posição de ranking, ainda que possua uma nota observada.

A ausência de experimental no período é registrada como `sem_experimental_periodo`, não como “evidência pendente”. Referência histórica de presença ou de outro pilar pode ser exibida para contexto, mas sempre com peso efetivo zero no recorte atual.

## Configuração e simulação

A interface opera como um laboratório: `Editar`, `Desfazer`, `Restaurar vigente`, `Simular` e `Aplicar`. O usuário não precisa administrar rascunhos manualmente. Internamente, as versões continuam auditáveis, a aplicação exige permissão `professores.editar` e uma configuração vigente ou snapshot fechado nunca é reescrito.

Pesos, metas e critérios de comparabilidade são versionados. Alterar um slider, uma meta ou um corte recalcula a simulação com o mesmo motor do relatório; a mudança só governa leituras após a aplicação da nova versão.

Metas pedagógicas por unidade, curso e modalidade são preservadas porque a realidade física e operacional varia entre Barra, Recreio e Campo Grande. Capacidade e carteira podem usar essa granularidade para diagnóstico, mas não voltam a compor a nota.

## Relatórios da Coordenação

O modal envia unidade, ano, mês e `periodicidade` (`mensal` ou `ciclo`). A Edge Function autentica o usuário e consulta `get_relatorio_coordenacao_canonico_v3`; frontend e IA não fornecem nem recalculam métricas.

Os cinco relatórios da Coordenação consomem o mesmo produtor canônico V3. No mensal, apresentam evidências exclusivas do mês. No ciclo, usam o intervalo fixo resolvido pelo banco e as agregações por numerador/denominador. Ranking de Professores permanece indisponível até existir ciclo oficial fechado elegível.

Os relatórios:

- incluem todos os professores ativos do recorte;
- apresentam score observado, comparabilidade, cobertura, pilares, carteira diagnóstica e motivos reais de ausência de evidência;
- reservam ranking e premiação ao ciclo oficial fechado;
- declaram o recesso parcial de julho de 2026 quando esse mês faz parte do recorte;
- não contêm MRR, ticket, faturamento ou outros dados financeiros;
- não expõem nomes técnicos de RPCs, snapshots ou fontes internas;
- não usam paginação artificial como `(1/2)`;
- resumem pendências de capacidade ou vínculo físico apenas em Qualidade dos dados.

A IA pode apenas redigir resumo, conquistas, pontos de atenção e plano de ação a partir do contrato calculado. O renderer determinístico preserva todos os números e possui fallback sem IA.

## Competência mensal em andamento

O mês corrente é uma projeção canônica somente leitura e usa exclusivamente fatos da competência selecionada. Carteira, média por turma, retenção, permanência, conversão e presença avançam conforme os eventos canônicos chegam ao banco.

Quando ainda não existe evento atual, a interface pode exibir a última competência disponível como referência identificada. Essa referência nunca compõe a nota atual. A pontuação contratual de presença começa em 03/08/2026; evidência anterior permanece auditável e contextual, com peso zero.

O estado do período é separado da classificação pedagógica:

- `Em andamento`: projeção viva de mês ou ciclo aberto, sem ranking;
- `Parcial`: leitura diagnóstica ainda não oficial;
- `Oficial`: ciclo fechado e elegível às regras de publicação.

`Saudável`, `Atenção` e `Crítico` classificam a nota observada. `Base em formação`, `Comparável` e estados equivalentes descrevem a qualidade/comparabilidade da base. Um eixo não substitui o outro.

A nota de média por turma reutiliza a normalização segmentada por unidade, curso e modalidade. Retenção, presença e conversão preservam o percentual real; permanência é normalizada pela meta versionada. O cálculo ao vivo e a materialização oficial usam os mesmos pesos efetivos e o mesmo motor de score. Snapshots fechados e históricos permanecem imutáveis.

## Limites desta entrega

Fábio e LA Teacher não recebem score bruto, ranking, comparação pública ou dados financeiros. Integrações proativas, relatórios semanais e relatórios diários pedagógicos ficam para uma etapa posterior, sempre consumindo o mesmo contrato canônico e respeitando o escopo do professor autenticado.
