# Health Score do Professor V3 - Cutover parcial

**Data:** 19/07/2026
**Status:** implementado e homologado como parcial; ainda nao oficial para ranking ou premiacao
**Escopo:** backend canonico, configuracao governada, snapshots, frontend, relatorios pedagogicos e agentes autorizados

## 1. Veredito

O Health Score do Professor V3 foi implantado de ponta a ponta para publicacao
parcial. Os consumidores migrados leem snapshots versionados; nao recalculam o
score no navegador nem nos modelos de IA. Ausencia de base continua `null` e
aparece como `Sem base`, sem zero fabricado.

O resultado ainda nao e oficial porque o ciclo Jun-Ago esta aberto. A flag
`ranking_habilitado` permanece falsa em todos os snapshots parciais. Rankings,
premiacoes e comunicacoes competitivas so podem ser liberados apos o fechamento
oficial do ciclo.

## 2. Calendario e configuracao

Os ciclos fixos aprovados sao:

- Jun-Ago;
- Set-Nov;
- Dez-Fev;
- Mar-Mai.

A configuracao ativa V2 da nova camada vigora desde 01/06/2026:

| Pilar | Peso | Meta |
|---|---:|---:|
| Retencao atribuivel | 25% | 90% |
| Permanencia com o professor | 25% | 12 meses |
| Conversao Exp -> Mat | 15% | 70% |
| Media de alunos por turma | 15% | 1,44 |
| Numero de alunos | 10% | 33 |
| Presenca dos alunos | 10% | 80% |

Sliders alteram somente pesos. Metas possuem campos proprios. Uma alteracao
cria rascunho, passa por simulacao e exige ativacao separada; configuracoes
ativas e snapshots fechados sao imutaveis.

## 3. Fontes canonicas

- Identidade: pessoa Emusys escopada por unidade.
- Carteira: pessoa canonica vinculada ao professor e a unidade na competencia.
- Media/turma: ocupacao unica pessoa + turma regular elegivel.
- Conversao: experimental confirmada conciliada com uma unica matricula em D+30.
- Permanencia: historico acumulado de periodos professor + matricula-disciplina
  encerrados, com corte de quatro meses e trilha de confianca.
- Retencao: vinculos expostos e encerramentos segundo a politica temporal
  versionada.
- Presenca: camada semantica, nunca `aluno_presenca` bruto.

Barra e Recreio podem pontuar presenca no recorte aprovado quando atingem base e
cobertura individual. Campo Grande exibe o valor observado como auditoria e o
pilar fica fora do denominador do score, sem zerar nem bloquear os demais.

## 4. Banco e materializacao

Foram aplicadas as migrations de corte:

1. `20260719120000_health_score_v3_ciclos_publicacao_parcial.sql`
2. `20260719121000_health_score_v3_metricas_periodicas.sql`
3. `20260719121500_health_score_v3_metricas_periodicas_cast_fix.sql`
4. `20260719121700_health_score_v3_materializador_guard.sql`
5. `20260719122000_health_score_v3_readmodels_cutover.sql`
6. `20260719123000_health_score_v3_carteira_canonica_periodo.sql`
7. `20260719123500_health_score_v3_metricas_periodo_otimizada.sql`

O historico reconstruido possui 434.193 eventos e 8.934 periodos ate
16/07/2026, processados em 96 particoes retomaveis e idempotentes.

Snapshots mais recentes:

| Recorte | Total | Parcial | Sem base | Ranking habilitado |
|---|---:|---:|---:|---:|
| Jun/2026 mensal | 129 | 71 | 58 | 0 |
| Jul/2026 mensal | 129 | 82 | 47 | 0 |
| Jun-Ago/2026 | 129 | 79 | 50 | 0 |

## 5. Conferencias nominais

| Professor / unidade | Jun/2026 alunos | Jun media/turma | Jul/2026 alunos | Jul media/turma |
|---|---:|---:|---:|---:|
| Daiana / Barra | 24 | 18/14 = 1,29 | 19 | 19/9 = 2,11 |
| Daiana / Campo Grande | 14 | 14/6 = 2,33 | 13 | 13/4 = 3,25 |
| Gabriel Antony / Barra | 46 | 46/42 = 1,10 | 43 | 43/36 = 1,19 |
| Peterson / Barra | 10 | 10/7 = 1,43 | 10 | 10/7 = 1,43 |
| Peterson / Campo Grande | 28 | 26/17 = 1,53 | 27 | 27/19 = 1,42 |

Exemplos de score parcial de julho: Daiana/Barra 92,12; Daiana/CG 86,89;
Gabriel Antony/Barra 94,08; Peterson/Barra 87,57; Peterson/CG 97,30;
Peterson consolidado 99,30. Campo Grande nao recebeu nota de presenca nesses
resultados.

## 6. Consumidores migrados

- Dashboard;
- Analytics, visao mensal e ciclo fixo;
- Gestao de Professores / Performance;
- modal individual do professor;
- Carteira de Professores;
- Configuracoes V3;
- relatorio individual;
- relatorio da coordenacao;
- insights de professor e equipe;
- ranking pedagogico, que falha fechado enquanto o ciclo nao for oficial.

As Edge Functions implantadas foram:

- `gemini-insights-professor` v45;
- `gemini-insights-equipe` v42;
- `gemini-relatorio-coordenacao` v57;
- `gemini-relatorio-professor-individual` v37;
- `gemini-ranking-professores` v37.

## 7. Validacao executada

- `node --test tests/*.test.mjs`: 289/289 testes aprovados.
- `npm run build`: concluido; permanecem apenas warnings preexistentes de
  chunks/Recharts.
- `deno check` nas cinco Edge Functions: aprovado.
- `git diff --check`: sem erro de whitespace; somente avisos de LF/CRLF do
  ambiente Windows.
- Navegador autenticado em `http://127.0.0.1:5175`: Dashboard, Analytics,
  Performance, modal individual, Configuracoes, relatorio da coordenacao e
  Carteira verificados sem erro de console da V3.
- Carteira: score parcial explicitamente rotulado como `Parcial`; falta de
  snapshot exibivel aparece como `Sem base`.

O lint remoto reportou debitos legados fora deste corte. Tambem sinalizou as
tabelas temporarias internas dos dois materializadores V3 como relacoes
ausentes; trata-se de limitacao estatica do `plpgsql_check`, pois as tabelas sao
criadas no corpo das funcoes e as materializacoes reais foram executadas com
sucesso. Nenhum desses avisos foi ocultado ou corrigido por alteracao fora do
escopo.

## 8. Seguranca e limites deliberados

- RPCs e artefatos internos V3 nao possuem acesso `public` ou `anon`.
- O frontend usa RPCs guardadas e nao consulta tabelas internas de snapshot.
- Agentes recebem somente o payload pedagogico estruturado, sem financeiro nem
  payload bruto do aluno.
- O pipeline de churn/Random Forest continua pausado e fora deste projeto.
- Relatorios gerencial, administrativo e comercial nao tiveram suas fontes
  trocadas por esta implementacao.
- A validacao adicional de assinatura/segredo no webhook de matricula permanece
  como frente separada com Hugo; este corte nao alterou o comportamento
  preexistente do endpoint.

## 9. Condicao para oficializacao

O cutover parcial esta concluido. Para transformar Jun-Ago em resultado oficial
sera necessario fechar o ciclo, materializar o snapshot fechado, validar a
maturacao da conversao, revisar pendencias de Campo Grande e confirmar o
resultado com a direcao. Somente entao `ranking_habilitado` pode mudar para
verdadeiro e alimentar ranking ou premiacao.
