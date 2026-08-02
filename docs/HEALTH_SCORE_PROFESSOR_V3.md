# Health Score Professor V3

## Objetivo

O Health Score Professor V3 é um instrumento de governança pedagógica. Ele orienta apoio, acompanhamento e reconhecimento sem transformar falta de dados, demanda comercial, estrutura física ou distribuição de carteira em punição ao professor.

## Contrato da nota

Os pilares pontuáveis são:

- retenção atribuível;
- permanência com o professor;
- conversão experimental, somente a partir da amostra mínima configurada (inicialmente 3 experimentais);
- média de alunos por turma;
- presença dos alunos.

`Número de alunos` e `carteira` continuam disponíveis como diagnóstico, mas têm peso efetivo zero e não entram no denominador da nota. Capacidade de sala/turma também é diagnóstico operacional: uma incompatibilidade produz alerta para a Coordenação e nunca reduz o score do professor.

Quando um pilar não se aplica ou não possui amostra suficiente, ele sai do denominador daquele professor. Os pesos dos pilares válidos são normalizados para 100%, preservando na leitura tanto o peso original quanto o peso efetivo. Um professor com ao menos um pilar válido recebe score parcial; ranking e premiação continuam reservados ao ciclo oficial fechado com cobertura e fidelização suficientes.

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

Todos os professores ativos aparecem no painel e no relatório da Coordenação, com score e confiança ou com o motivo concreto da evidência pendente. O score parcial é diagnóstico e não participa de ranking oficial.

## Configuração e simulação

A interface opera como um laboratório: `Editar`, `Desfazer`, `Restaurar vigente`, `Simular` e `Aplicar`. O usuário não precisa administrar rascunhos manualmente. Internamente, as versões continuam auditáveis, a aplicação exige permissão `professores.editar` e uma configuração vigente ou snapshot fechado nunca é reescrito.

Metas pedagógicas por unidade, curso e modalidade são preservadas porque a realidade física e operacional varia entre Barra, Recreio e Campo Grande. Capacidade e carteira podem usar essa granularidade para diagnóstico, mas não voltam a compor a nota.

## Relatório mensal da Coordenação

O botão mensal envia apenas unidade, ano e mês. A Edge Function autentica o usuário e consulta `get_relatorio_coordenacao_canonico_v1`; o frontend e a IA não fornecem nem recalculam métricas.

O relatório:

- inclui todos os professores ativos;
- apresenta score, confiança, pilares, carteira diagnóstica e motivos de ausência de evidência;
- reserva ranking ao ciclo oficial fechado;
- declara o recesso parcial de julho de 2026;
- não contém MRR, ticket, faturamento ou outros dados financeiros;
- não expõe nomes técnicos de RPCs, snapshots ou fontes internas;
- não usa paginação artificial como `(1/2)`.

A IA pode apenas redigir resumo, conquistas, pontos de atenção e plano de ação a partir do contrato calculado. O renderer determinístico preserva todos os números e possui fallback sem IA.

## Limites desta entrega

Fábio e LA Teacher não recebem score bruto, ranking, comparação pública ou dados financeiros. Integrações proativas, relatórios semanais e relatórios diários pedagógicos ficam para uma etapa posterior, sempre consumindo o mesmo contrato canônico e respeitando o escopo do professor autenticado.

## Competência mensal em andamento

O mês corrente é uma projeção canônica somente leitura. Carteira, média por turma, retenção e permanência usam os dados atuais disponíveis. Presença e conversão também avançam com os eventos do mês; enquanto ainda não houver evento atual, a interface pode exibir a última competência disponível como referência, identificada por `referencia_periodo_anterior`. Essa referência nunca compõe a nota atual.

O estado da competência é separado da classificação pedagógica:

- `Em andamento`: projeção viva do mês aberto, sem ranking;
- `Parcial`: snapshot diagnóstico ainda não fechado;
- `Oficial`: ciclo fechado e elegível às regras de publicação.

A nota de média por turma reutiliza a normalização segmentada por unidade, curso e modalidade. Retenção, presença e conversão preservam o percentual real; permanência é normalizada pela meta versionada. O cálculo ao vivo e a materialização oficial usam os mesmos pesos efetivos e o mesmo motor de score. Snapshots fechados e históricos permanecem imutáveis.
