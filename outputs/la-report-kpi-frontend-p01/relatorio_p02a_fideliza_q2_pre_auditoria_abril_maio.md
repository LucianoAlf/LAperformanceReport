# P0.2A - Pre-auditoria Fideliza+ Q2 antes de fechamento da fonte canonica

Data: 2026-06-09

Escopo: SELECT-only. Nenhuma migration, nenhum UPDATE/INSERT/DELETE, nenhum recalculo e nenhum fechamento.

## 1. Resumo executivo

Nao e seguro tratar o Fideliza+ Q2 como definitivo ainda.

O trimestre Q2 mistura tres situacoes diferentes:

- Abril/2026: possui `dados_mensais`, mas nao possui linha fechada em `competencias_mensais`.
- Maio/2026: fechado nas tres unidades e protegido.
- Junho/2026: aberto/vivo.

Conclusao: antes de refatorar o backend do Fideliza+ como fonte definitiva de premiacao, precisamos auditar Abril/2026 e confirmar se os snapshots de Maio em Barra/Recreio continuam aceitos como historico fechado.

## 2. Status de competencias - Q2 2026

| Unidade | Abril | Maio | Junho |
|---|---:|---:|---:|
| Barra | sem_linha | fechado | sem_linha |
| Campo Grande | sem_linha | fechado | sem_linha |
| Recreio | sem_linha | fechado | sem_linha |

Leitura:

- Abril nao esta fechado. Deve ser tratado como preliminar/suspeito ate auditoria.
- Maio esta fechado. Qualquer divergencia deve seguir retificacao formal, nao recalculo silencioso.
- Junho esta aberto. Deve usar calculo vivo canonico.

## 3. Fonte atual do Fideliza+

### Backend/RPC

`get_programa_fideliza_dados` ainda usa logica legada:

- churn: `movimentacoes_admin`;
- inadimplencia: media em `dados_mensais`;
- renovacao/reajuste: tabela legada `renovacoes`;
- base de alunos: mistura `dados_mensais` anterior com fallback direto em `alunos`.

Isso impede deprecar `renovacoes` agora.

### Frontend atual

O frontend aplica overlay canonico em `useFidelizaPrograma`/`fidelizaCanonico.ts`, recalculando metricas trimestrais por fontes mais corretas. Isso corrige a exibicao, mas nao limpa a origem backend.

Status: parcialmente saneado na leitura; backend ainda precisa refatoracao.

## 4. Dados canonicos por unidade/mes

### Barra

| Mes | Fonte | Ativos | Pagantes | Matriculas | Banda | 2o curso | Ticket | MRR/Faturamento | Evasoes | Churn | Inad. | Reajuste |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Abr | preliminar | 222 | 221 | 250 | 18 | 28 | 424.10 | 93726.10 | 8 | 3.62 | 0.00 | n/d |
| Mai | dados_mensais | 222 | 221 | 253 | 18 | 31 | 426.53 | 94263.13 | 13 | 5.88 | 0.00 | n/d |
| Jun | vivo | 229 | 226 | 260 | 18 | 13 | 447.73 | 101187.15 | 3 | 1.33 | 0.00 | 10.58 |

### Campo Grande

| Mes | Fonte | Ativos | Pagantes | Matriculas | Banda | 2o curso | Ticket | MRR/Faturamento | Evasoes | Churn | Inad. | Reajuste |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Abr | preliminar | 485 | 459 | 547 | 38 | 62 | 340.20 | 156151.80 | 16 | 3.49 | 0.00 | n/d |
| Mai | dados_mensais | 496 | 470 | 561 | 41 | 27 | 368.66 | 173270.20 | 13 | 2.77 | 0.00 | n/d |
| Jun | vivo | 480 | 450 | 545 | 39 | 27 | 389.94 | 175473.23 | 2 | 0.44 | 1.78 | 11.72 |

### Recreio

| Mes | Fonte | Ativos | Pagantes | Matriculas | Banda | 2o curso | Ticket | MRR/Faturamento | Evasoes | Churn | Inad. | Reajuste |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Abr | preliminar | 319 | 312 | 411 | 48 | 92 | 396.73 | 123779.76 | 1 | 0.32 | 0.00 | n/d |
| Mai | dados_mensais | 324 | 314 | 402 | 53 | 78 | 401.49 | 126067.86 | 19 | 6.05 | 0.00 | n/d |
| Jun | vivo | 328 | 316 | 408 | 59 | 24 | 437.85 | 138359.42 | 17 | 5.38 | 1.27 | 0.00 |

Observacao: os numeros vivos podem variar conforme entradas operacionais novas. O ponto aqui e a classificacao da fonte.

## 5. Divergencia `movimentacoes_admin` x `renovacoes`

| Unidade | Mes | Mov. renovacoes | Mov. validas | Reajuste valido mov. | Legacy total | Legacy renovado | Legacy reajuste |
|---|---:|---:|---:|---:|---:|---:|---:|
| Barra | Abr | 10 | 9 | 10.76 | 12 | 12 | 0.00 |
| Barra | Mai | 13 | 11 | 8.79 | 10 | 10 | 0.00 |
| Barra | Jun | 12 | 4 | 10.58 | 16 | 16 | 0.00 |
| Campo Grande | Abr | 33 | 26 | 12.47 | 33 | 33 | 0.00 |
| Campo Grande | Mai | 38 | 24 | 12.95 | 61 | 61 | 0.00 |
| Campo Grande | Jun | 36 | 22 | 11.77 | 6 | 6 | n/d |
| Recreio | Abr | 9 | 0 | n/d | 17 | 17 | 0.00 |
| Recreio | Mai | 16 | 15 | 10.41 | 26 | 26 | 0.00 |
| Recreio | Jun | 2 | 0 | n/d | 2 | 2 | n/d |

Diagnostico:

- `renovacoes` marca muitos registros como renovados e com reajuste 0.
- `movimentacoes_admin` contem a trilha operacional mais rica para validacao humana.
- O Fideliza backend ainda bebe de `renovacoes`; isso e fonte de divergencia.
- A tabela `renovacoes` nao pode ser removida ainda, porque ainda e dependencia de RPC.

## 6. Lacunas de origem ainda existentes

As leituras canonicas ja aplicam fallback em alguns pontos, mas a origem ainda precisa ser saneada:

- algumas evasoes/nao-renovacoes nascem sem `valor_parcela_evasao`;
- algumas evasoes/nao-renovacoes nascem sem `tempo_permanencia_meses`;
- a automacao Emusys ainda pode criar renovacao como renovada no fluxo legado;
- Abril/2026 nao foi fechado e pode ter snapshots defasados ou incompletos;
- dados de Maio ja fechados so devem ser corrigidos via retificacao formal.

## 7. Decisao recomendada

Nao seguir para deprecacao de tabelas/views agora.

Antes:

1. Auditar Abril/2026 por unidade com evidencia operacional.
2. Separar o que e retificacao de Maio fechado do que e correcao de regra viva de Junho.
3. Refatorar `get_programa_fideliza_dados` para nao depender de `renovacoes` como fonte final de renovacao/reajuste.
4. Materializar `valor_parcela_evasao` e `tempo_permanencia_meses` na origem da escrita.
5. Ajustar `processar-matricula-emusys` para gerar pendencias de renovacao, nao renovacoes confirmadas automaticamente.

## 8. Proximo pacote seguro

P0.2B - Auditoria Abril/2026 por unidade:

- comparar `dados_mensais` de Abril com fonte viva/operacional de corte;
- listar divergencias nominais relevantes;
- classificar como:
  - pronto para fechamento;
  - precisa retificacao antes;
  - preliminar/nao elegivel para premiacao.

P0.2C - Refatorar Fideliza backend:

- substituir dependencias de `renovacoes` por fonte canonica de `movimentacoes_admin`;
- manter compatibilidade de contrato JSON;
- nao apagar tabela legado.

P0.2D - Saneamento da escrita:

- formulario/RPC/automacao deve preencher valor e permanencia na criacao da evasao;
- renovacao Emusys deve entrar como pendente ate validacao humana.

