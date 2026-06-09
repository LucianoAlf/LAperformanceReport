# P0.1K - Retencao, Renovacoes Automaticas e Permanencia Viva

Data: 2026-06-09

## Resumo executivo

A divergencia em Barra/Junho nao vem dos cards de alunos. Ela esta na camada de retencao.

Foram encontradas duas causas raiz:

1. Linhas geradas/importadas no fluxo Emusys estao chegando como `movimentacoes_admin.tipo = 'renovacao'` sem status formal de confirmacao humana e sendo contadas como renovacoes realizadas.
2. O calculo vivo canonico de alunos esta com `tempoPermanencia = 0` hardcoded, mesmo existindo fonte historica viva em `get_tempo_permanencia`.

Conclusao: a UI e o relatorio estao tratando evento automatico como confirmacao humana. Isso infla renovacoes realizadas, taxa de renovacao e relatorio diario.

## Evidencia Barra / Junho 2026

Projeto confirmado: `ouqwbbermlzqqvtqwlul`.

`movimentacoes_admin` em Barra/Junho:

| tipo | total | com agente/valores | incompletas/sem confirmacao operacional |
|---|---:|---:|---:|
| renovacao | 14 | 2 | 12 |
| evasao | 3 | 0 | 3 |
| trancamento | 1 | 0 | 1 |

Observacao importante: em `movimentacoes_admin`, as 14 linhas de renovacao nao possuem campo formal de origem/confirmacao. Varias tambem estao com `observacoes = null`. Portanto, em P0.1K a separacao segura sem migration e por completude operacional minima: `agente_comercial` + campos financeiros/forma preenchidos indicam realizada; linhas incompletas ficam como pendentes.

`renovacoes` tambem esta contaminada:

- 14 linhas em Junho/Barra;
- status atual = `renovado`;
- varias linhas com valores zerados/nulos.

Isso explica:

- `Renovacoes = 14`;
- `Taxa Renovacao = 100%`;
- detalhes com `R$ 0,00`;
- relatorio automatico dizendo realizadas 14.

## Permanencia / LTV

Existe fonte viva historica:

| Unidade | tempo_permanencia_medio | evasoes elegiveis |
|---|---:|---:|
| Barra | 13.8 | 274 |
| Campo Grande | 19.4 | 579 |
| Recreio | 14.8 | 737 |

O zero na UI vem do frontend:

- `src/lib/kpisAlunosVivosCanonicos.ts`
- linha atual: `const tempoPermanencia = 0;`

## Regra validada pelo Alf

Renovacao realizada nao e evento automatico.

Estados necessarios:

- prevista: contrato/vencimento a tratar;
- pendente automacao: Emusys detectou renovacao, mas humano ainda nao confirmou;
- realizada: humano confirmou;
- nao renovou: humano registrou nao renovacao.

Em P0.1K, sem migration, o ajuste seguro e:

- nao contar renovacao incompleta/sem confirmacao operacional como realizada;
- exibir/contar como pendente operacional;
- corrigir permanencia viva usando `get_tempo_permanencia`.

## Patch seguro sem banco

1. `retencaoOperacionalCanonica`
   - separar renovacoes realizadas das pendentes por completude operacional minima;
   - `renovacoes_realizadas` = renovacoes com confirmacao operacional;
   - `renovacoes_pendentes` inclui renovacoes incompletas enquanto nao houver status formal;
   - `taxa_renovacao` usa realizadas / previstas.

2. `kpisAlunosVivosCanonicos`
   - buscar `get_tempo_permanencia`;
   - preencher `tempoPermanencia` e `ltv` por unidade.

3. Administrativo / relatorio manual / relatorio WhatsApp
   - usar a mesma regra de retencao;
   - nao listar automaticas como realizadas.

## Etapa estrutural posterior com migration

Para fechar de verdade, precisa migration aprovada:

- adicionar status de confirmacao em `movimentacoes_admin` e/ou tabela propria:
  - `origem_operacional`;
  - `status_confirmacao`;
  - `confirmado_em`;
  - `confirmado_por`;
  - `confirmacao_motivo`;
  - `automacao_log_id` opcional.
- alterar `processar-matricula-emusys` para nao criar renovacao realizada automaticamente;
- criar acao humana "Confirmar renovacao" no Administrativo.

Sem isso, o sistema nao tem prova persistente para diferenciar "Emusys detectou" de "Arthur confirmou".

## Validacao apos patch local

Build: `npm run build` passou.

Chrome local `http://127.0.0.1:4176`:

| Tela | Unidade/Competencia | Resultado |
|---|---|---|
| Analytics > Gestao > Retencao | Barra / Jun 2026 | Renovacoes 2, Taxa Renovacao 14.3%, Aviso Previo 0, Tempo Permanencia 13.8 |
| Administrativo > Lancamentos | Consolidado / Jun 2026 | Alerta de renovacao usa 30 de 50 vencimentos = 60%, nao 100% |

Nota: Barra/Junho ainda mostra 2 renovacoes realizadas porque existem 2 linhas com `agente_comercial` e valores preenchidos em `movimentacoes_admin`. Se o correto operacional for 1, isso exige decisao nominal do Alf/operacao sobre qual linha deve ser retificada, ou a Fase estrutural de confirmacao humana.

## Decisao recomendada

Executar agora apenas patch frontend/Edge local sem banco:

- remover falsos positivos automaticos de renovacoes realizadas;
- corrigir permanencia viva;
- manter migration de confirmacao humana como proximo APPROVE separado.

## P0.1K-b - MRR perdido e permanencia de cancelamentos incompletos

Problema reportado pelo Alf em Barra / Jun 2026:

- havia 3 cancelamentos no mes;
- `MRR Perdido` aparecia como `R$ 0`;
- a tabela de cancelamentos mostrava permanencia `-`;
- os alunos tinham historico e parcela no cadastro.

Causa raiz:

- as linhas de `movimentacoes_admin` criadas para os cancelamentos tinham `aluno_id`, mas vieram sem:
  - `valor_parcela_evasao`;
  - `valor_parcela_anterior`;
  - `tempo_permanencia_meses`.
- o frontend e os relatorios estavam lendo somente os campos da movimentacao, sem fallback pelo aluno vinculado.

Evidencia SELECT-only ja levantada:

| Aluno | aluno_id | Parcela no cadastro | Data matricula | Data evasao | Permanencia calculada |
|---|---:|---:|---|---|---:|
| Ana Paula dos Santos Souza | 717 | 402.00 | 2024-12-04 | 2026-06-03 | 17 meses |
| Maya Kelly Ximenes Apoliano | 849 | 404.00 | 2021-12-07 | 2026-06-03 | 53 meses |
| Lana Lopes Pinheiro | 809 | 375.00 | 2025-08-14 | 2026-06-03 | 9 meses |

Patch aplicado sem escrita no banco:

- `retencaoOperacionalCanonica` passou a expor fallback por aluno vinculado:
  - `valorPerdidoMovimentacao`;
  - `calcularTempoPermanenciaMovimentacao`;
  - `aplicarFallbacksRetencao`.
- Analytics / Retencao, `useKPIsRetencao`, Administrativo e relatorio WhatsApp local agora enriquecem movimentacoes com:
  - `alunos.valor_parcela`;
  - `alunos.data_matricula`;
  - `alunos.data_saida`;
  - `tipo_matricula_id`;
  - `is_segundo_curso`.

Resultado validado visualmente no Chrome local:

| Tela | Unidade/Competencia | Resultado |
|---|---|---|
| Analytics > Gestao > Retencao | Barra / Jun 2026 | `MRR Perdido` = `R$ 1.181` |
| Administrativo > Lancamentos | Barra / Jun 2026 | `MRR Perdido` = `R$ 1.181,00` |
| Administrativo > Cancelamentos | Barra / Jun 2026 | Ana Paula 17 meses; Maya 53 meses; Lana 9 meses |

Observacao importante:

- isto nao materializa os campos em `movimentacoes_admin`;
- nao faz `UPDATE`;
- nao corrige a origem da automacao;
- evita UI/relatorio zerado quando ha `aluno_id` suficiente para reconstruir o impacto vivo.

Pendencia estrutural:

- a automacao/formulario que cria evasao deve preencher `valor_parcela_evasao` e `tempo_permanencia_meses` no momento do evento;
- ate essa migration/ajuste de origem, o fallback frontend/relatorio e a protecao operacional.
