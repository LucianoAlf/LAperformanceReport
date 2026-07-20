# Health Score V3 - homologacao E2E das metas segmentadas

**Data da execucao:** 20/07/2026

**Escopo:** Gate 12 do plano de metas por unidade, curso e modalidade

**Ambiente:** aplicacao local autenticada em `http://127.0.0.1:5175`

**Resultado:** aprovado para manter em sombra; nao aprovado para ativacao produtiva

## 1. Veredito

A configuracao segmentada esta integrada ao fluxo governado do Health Score V3 e nao alterou a versao ativa. A interface apresenta o rascunho, os diagnosticos e as pendencias sem transformar valores incompletos em metas validas.

No encerramento desta auditoria:

- a configuracao ativa continua na versao 2;
- a versao 3 continua como rascunho/sombra;
- os seis sliders alteram somente os pesos dos pilares;
- Retencao, Permanencia, Conversao e Presenca continuam com metas numericas independentes;
- Media de alunos por turma e Numero de alunos usam a matriz por unidade, curso e modalidade;
- 47 segmentos observados permanecem com regra ausente e aparecem como erro de configuracao;
- os botoes Salvar rascunho, Simular impacto e Ativar versao ficam desabilitados enquanto o rascunho e invalido;
- nenhum valor foi inventado para liberar o fluxo;
- nenhuma ativacao foi executada.

## 2. Evidencias visuais

| Evidencia | O que comprova |
|---|---|
| [Configuracao desktop](evidencias/2026-07-19-health-score-v3-metas-segmentadas/01-configuracao-desktop.png) | V3 em sombra, versao ativa preservada e separacao entre peso e meta. |
| [Matriz segmentada](evidencias/2026-07-19-health-score-v3-metas-segmentadas/02-matriz-segmentada-desktop.png) | Metas por unidade, curso e modalidade, erros locais e contadores de diagnostico. |
| [Conciliacao de atribuicoes](evidencias/2026-07-19-health-score-v3-metas-segmentadas/03-conciliacao-atribuicoes-desktop.png) | Pendencias auditaveis, evidencia da origem e decisao bloqueada sem professor selecionado. |
| [Dashboard](evidencias/2026-07-19-health-score-v3-metas-segmentadas/05-dashboard-nao-regressao.png) | Cards de Gestao, Comercial e Professores continuam carregando. |
| [Analytics](evidencias/2026-07-19-health-score-v3-metas-segmentadas/06-analytics-nao-regressao.png) | Abas Gestao, Comercial e Professores continuam carregando dados. |
| [Comercial](evidencias/2026-07-19-health-score-v3-metas-segmentadas/07-comercial-nao-regressao.png) | KPIs e gerador de relatorio continuam disponiveis. |
| [Administrativo](evidencias/2026-07-19-health-score-v3-metas-segmentadas/08-administrativo-nao-regressao.png) | Resumo, lancamentos e gerador de relatorio continuam disponiveis. |

## 3. Fluxos autenticados verificados

### Configuracao V3

- A tela identifica o ambiente como `Sombra` e informa `Versao ativa 2`.
- Existem exatamente seis sliders `Peso no score`, um por pilar.
- As metas globais continuam somente nos quatro pilares nao segmentados.
- A matriz exibe `Meta de media/turma` e `Meta de carteira` dentro de cada segmento.
- O diagnostico exibe `Regra ausente`, `Zero carteira`, `Superlotacao` e `Divergencia de modalidade`.
- Curso formal com carteira vazia permanece visivel. Sem vinculo ativo, o segmento nao recebe nota zero nem penaliza o professor.
- A conciliacao exige professor selecionado antes de habilitar uma decisao.
- Com metas invalidas, Salvar, Simular e Ativar permanecem desabilitados.

### Nao regressao de consumidores

- **Dashboard:** Pagantes, Matriculas do mes, Ticket Medio Parcelas, Leads, Total de Professores e Media Alunos/Turma foram renderizados sem erro de carga.
- **Analytics:** as abas Gestao, Comercial e Professores carregaram sem estado vazio indevido ou erro visivel.
- **Comercial:** a pagina carregou leads, experimentais, matriculas e canais. O Relatorio Mensal Comercial foi gerado com cabecalho, competencia e resumo, sem editor vazio.
- **Administrativo:** a pagina carregou resumo, renovacoes, nao renovacoes, avisos e cancelamentos. O Relatorio Mensal Administrativo foi gerado com alunos, matriculas, KPIs e detalhamento, sem editor vazio.
- **Professores:** Configuracao, matriz e conciliacao foram verificadas visualmente. A regressao funcional dos calculos e consumidores de Performance e coberta pela suite automatizada do dominio V3.

## 4. Estado do dado de homologacao

Ultima simulacao privada registrada no Gate 10:

- 129 avaliacoes;
- 88 saudaveis, 6 em atencao, 1 critica e 34 sem base;
- score medio 82,23;
- 250 ocorrencias de `regra_ausente`;
- 194 atribuicoes sem meta;
- 56 casos de segmentacao incompleta;
- zero divergencia entre o total canonico de carteira/media e o total preservado pelo motor segmentado.

Esses numeros servem para calibracao e saneamento. Nao constituem ranking, premiacao ou publicacao oficial.

## 5. Seguranca e governanca

- `anon` nao possui acesso as tabelas e RPCs privadas auditadas.
- `authenticated` nao possui escrita direta nas tabelas de configuracao, atribuicao ou snapshot.
- configuracao ativa e snapshots fechados permanecem imutaveis;
- funcoes `security definer` usam `search_path` fixo e guardas de permissao;
- metas e atribuicoes historicas mantem vigencia e trilha de revisao;
- a simulacao nao ativa configuracao e nao reescreve snapshot oficial.

## 6. Observacao responsiva

O DOM foi exercitado no breakpoint estreito e manteve os controles e diagnosticos acessiveis. A captura da janela do Chrome ficou limitada pela altura da area remota do navegador e, por isso, nao foi usada como evidencia visual oficial. As capturas desktop acima sao as evidencias visuais do Gate 12; o comportamento responsivo segue coberto pelas restricoes de layout do componente e deve ser repetido em dispositivo real antes da futura ativacao produtiva.

## 7. Decisao do Gate 12

O Gate 12 fica concluido para a implantacao em sombra. A V3 permanece deliberadamente nao ativada porque a matriz ainda contem metas e atribuicoes pendentes. A proxima liberacao exige preencher e revisar esses segmentos, executar nova simulacao, obter aprovacao pedagogica e somente entao acionar a ativacao separada.
