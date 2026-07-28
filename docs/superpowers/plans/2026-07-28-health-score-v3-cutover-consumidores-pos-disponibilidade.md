# Plano de cutover dos consumidores do Health Score V3

**Data:** 2026-07-28  
**Pre-condicao:** disponibilidade revisada e julho rematerializado  
**Estado:** aguardando aprovacao antes de qualquer nova alteracao de tela

## Objetivo

Validar e consolidar o consumo da ultima revisao governada do Health Score V3,
sem reintroduzir fontes legadas, professores inativos ou zeros fabricados.

Os consumidores internos ja possuem integracao aditiva com as RPCs V3. Portanto,
este cutover e uma revalidacao controlada sobre os snapshots finais de julho,
nao uma troca cega de todas as telas de uma vez.

## Invariantes

1. Configuracao ativa e snapshot fechado permanecem imutaveis.
2. A ultima revisao mensal parcial pode aparecer como diagnostico.
3. `sem_base` permanece `sem_base`; nunca vira zero.
4. `em_maturacao` nao pontua.
5. Ranking e premiacao exigem ciclo oficial fechado e
   `ranking_habilitado = true`.
6. A coorte atual vem dos vinculos ativos do LA Report:
   Barra 19, Campo Grande 31, Recreio 24.
7. Snapshots historicos de professor que saiu da unidade continuam preservados,
   mas nao entram na lista operacional atual.
8. Cada consumidor possui rollback independente.

## Gate 1 - contrato das RPCs

### Fontes V3

- lista de Performance:
  `get_health_score_professor_v3_performance`;
- modal:
  `get_health_score_professor_v3_snapshot_modal`;
- consumidor pedagogico:
  `get_health_score_professor_v3_consumidor_pedagogico`;
- KPIs operacionais:
  `get_kpis_professor_periodo_canonico_v3`.

### Validacoes

- confirmar que cada RPC seleciona a maior revisao elegivel;
- confirmar config versao 4 em julho;
- confirmar seis metricas por professor;
- confirmar `score_exibivel`, `estado_publicacao` e
  `ranking_habilitado` sem fallback;
- comparar os cinco casos nominais do relatorio de rematerializacao.

### Rollback

Nenhum DDL de rollback. Manter os snapshots e retirar o consumidor especifico
da leitura V3 se houver divergencia.

## Gate 2 - Performance, cards e modal

### Consumidores

- `src/components/App/Professores/TabPerformanceProfessores.tsx`;
- `src/hooks/useHealthScoreProfessorV3Performance.ts`;
- `src/hooks/useHealthScoreProfessorV3.ts`;
- modal individual do professor;
- cards da carteira e do cadastro.

### Testes

- Barra: 19 professores ativos;
- Campo Grande: 31 professores ativos;
- Recreio: 24 professores ativos;
- Jeyson aparece somente na Barra no recorte atual;
- Matheus Sterque usa 8 horas em Campo Grande;
- Isaque 85,09; Erick sem base; Peterson 96,22; Gabriel Antony 83,37;
- score parcial aparece como parcial;
- sem base aparece literalmente;
- modal e linha da tabela usam a mesma revisao.

### Rollback

Ocultar o bloco V3 no consumidor afetado e manter os KPIs canonicos
operacionais. Nao apagar snapshots.

## Gate 3 - Dashboard e Analytics

### Consumidores

- Dashboard de professores;
- Analytics de professores;
- hooks compartilhados de Performance.

### Testes

- total de professores vem da coorte ativa, nao da tabela de snapshots;
- media do Health considera apenas score existente;
- cobertura ausente nao vira zero;
- filtros de unidade e competencia chegam iguais as RPCs;
- Dashboard e Analytics retornam a mesma media e a mesma distribuicao.

### Rollback

Ocultar apenas a banda V3 e preservar os demais KPIs da pagina.

## Gate 4 - relatorios

### Consumidores

- relatorio individual;
- relatorio da coordenacao;
- relatorio instantaneo/ranking;
- `gemini-relatorio-professor-individual`;
- `gemini-relatorio-coordenacao`;
- `gemini-ranking-professores`;
- insights de equipe e professor.

### Testes

- payload usa os mesmos valores da tela;
- relatorio nao recalcula Health Score;
- ausencia de base continua textual;
- nenhum ranking parcial e publicado;
- professor inativo fica fora do resumo operacional;
- Jeyson/CG pode existir somente em relatorio historico explicito de julho,
  nunca na carteira atual.

### Rollback

Retirar o bloco V3 do payload do relatorio especifico. Manter o relatorio
operacional e os snapshots.

## Gate 5 - Fabio, LA Teacher e Edge Functions

### Situacao atual

- Fabio e LA Teacher nao consomem o Health Score V3 diretamente neste
  repositorio;
- o contrato pedagogico seguro existe;
- Edge Functions recebem payload V3 do frontend e nao devem buscar uma fonte
  paralela.

### Validacoes

- confirmar com o repositorio do LA Teacher que nenhuma RPC legada de Health
  esta ativa;
- manter Health Score fora do app do professor ate decisao expressa;
- Fabio recebe apenas dados pedagogicos autorizados, sem financeiro;
- toda integracao externa respeita `sem_base`, parcial e oficial;
- nenhum consumidor externo usa a contagem bruta de snapshots como coorte.

### Rollback

Nao conectar o consumidor externo ou remover somente sua chamada V3. O LA
Report permanece inalterado.

## Gate 6 - validacao end-to-end

1. Abrir Performance nas tres unidades.
2. Abrir os cinco casos nominais.
3. Comparar linha, modal e relatorio individual.
4. Comparar Dashboard e Analytics.
5. Gerar relatorio instantaneo e confirmar ranking bloqueado.
6. Gerar relatorio da coordenacao em ambiente controlado.
7. Registrar screenshots, payloads e resultados.
8. Reexecutar testes automatizados e build.

## Criterio de aprovacao

- zero divergencia entre RPC, linha, card, modal e relatorio;
- zero professor inativo na coorte atual;
- zero metrica sem base convertida em numero;
- zero ranking parcial;
- mesmos totais ativos: 19/31/24;
- cinco casos nominais conferidos;
- rollback de cada consumidor documentado.

## Criterio para producao oficial

O diagnostico parcial pode ser exibido apos os gates acima. A promocao para
oficial, ranking e premiacao continua condicionada ao fechamento do ciclo
Jun-Ago e a uma decisao explicita da coordenacao.

