# Auditoria Fideliza+ — Recreio / Maio-2026

## Data: 2026-06-06
## Status: SELECT-only

---

## Resumo Executivo

O painel Fideliza+ **não está lendo Maio/2026**, apesar do badge da tela mostrar `Mai/2026`.

Ele usa:
- **RPC `get_programa_fideliza_dados`**
- **recorte trimestral Q2 (Abr-Jun)**
- **fontes mistas** (`dados_mensais`, `movimentacoes_admin`, `renovacoes`)

Por isso o card mostra:
- churn `3,9%`
- inadimplência `0,0%`
- renovação `100%`

Esses números **não são os KPIs mensais oficiais de Maio/Recreio**; são números **trimestrais** ou híbridos.

---

## Fonte do Fideliza+

### Frontend

O painel chama o hook `useFidelizaPrograma`, que busca os dados pela RPC:
<ref_snippet file="d:/2026/LA-performance-report/src/hooks/useFidelizaPrograma.ts" lines="228-265" />

O componente exibe explicitamente o trimestre:
<ref_snippet file="d:/2026/LA-performance-report/src/components/App/Administrativo/TabProgramaFideliza.tsx" lines="1784-1797" />

E os tooltips dos cards deixam claro que o cálculo é trimestral:
<ref_snippet file="d:/2026/LA-performance-report/src/components/App/Administrativo/TabProgramaFideliza.tsx" lines="1804-1821" />
<ref_snippet file="d:/2026/LA-performance-report/src/components/App/Administrativo/TabProgramaFideliza.tsx" lines="1824-1859" />

### Backend

A fonte do Fideliza+ é a RPC `get_programa_fideliza_dados`, publicada no banco.

Ela:
- calcula **churn do trimestre** por média mensal;
- calcula **inadimplência do trimestre** a partir de `dados_mensais`;
- calcula **renovação do trimestre** pela tabela `renovacoes`;
- calcula **reajuste do trimestre** pela média de `percentual_reajuste` em `renovacoes`;
- mantém **lojinha = 0** hardcoded.

---

## Como o painel decide o período

O `AdministrativoPage` usa o filtro de competência (`Mai/2026`) no header da página:
<ref_snippet file="d:/2026/LA-performance-report/src/components/App/Administrativo/AdministrativoPage.tsx" lines="135-184" />

Mas o Fideliza+ **não usa esse mês**.

Ele usa:
- trimestre selecionado manualmente; ou
- trimestre atual, se nada for selecionado.

Logo, o badge da página e o conteúdo do Fideliza+ podem divergir.

---

## Fórmulas reais do Fideliza+

### 1. Churn

Fonte:
- `movimentacoes_admin` (`evasao`, `nao_renovacao`)
- base de pagantes anterior vinda de `dados_mensais`

Lógica:
- calcula churn por mês no trimestre;
- depois tira a **média das taxas mensais**.

No Q2 Recreio:
- Abril: `1 / 306 = 0,33%`
- Maio: `19 / 312 = 6,09%`
- Junho: `17 / 314 = 5,41%` (no JSON da RPC) / `5,47%` no snapshot atual
- Média trimestral exibida: `3,94%`

### 2. Inadimplência

Fonte:
- `dados_mensais.inadimplencia`

Lógica publicada:
- média trimestral de `dados_mensais.inadimplencia`
- mas só considera meses com `inadimplencia > 0`; se todos forem zero, retorna zero.

No Q2 Recreio:
- Abril: `0,00`
- Maio: `0,00`
- Junho: `0,00`
- Resultado Fideliza+: `0,0%`

### 3. Renovação

Fonte:
- tabela `renovacoes`

Lógica:
- `renovados / total_contratos` no trimestre

No Q2 Recreio:
- Abril: `17/17 = 100%`
- Maio: `26/26 = 100%`
- Junho: `0/0`
- Trimestre: `43/43 = 100%`

### 4. Reajuste

Fonte:
- média de `renovacoes.percentual_reajuste`

No Q2 Recreio:
- resultado atual da RPC: `0,0%`

### 5. Lojinha

Fonte:
- hardcoded na RPC

Resultado:
- `0`

---

## Fonte oficial do LA Report para mês histórico

Para período histórico, o LA Report usa prioritariamente `dados_mensais`:
<ref_snippet file="d:/2026/LA-performance-report/src/components/GestaoMensal/TabGestao.tsx" lines="280-369" />

Para o mês atual, usa `vw_kpis_gestao_mensal`:
<ref_snippet file="d:/2026/LA-performance-report/src/components/GestaoMensal/TabGestao.tsx" lines="249-279" />

No banco atual, para Recreio/2026:
- `dados_mensais` tem Abril, Maio e Junho;
- `vw_kpis_gestao_mensal` só retornou Junho.

Então, para **Maio/2026**, a fonte histórica oficial do Report é `dados_mensais`.

---

## Matriz de Comparação

| Métrica | Fideliza+ exibido | Fonte Fideliza+ | Fórmula Fideliza+ | LA Report Maio/2026 | Fonte Report | Fórmula Report | Divergência |
|--------|-------------------|-----------------|-------------------|---------------------|--------------|----------------|-------------|
| Churn | **3,9%** | RPC `get_programa_fideliza_dados` | média do Q2 | **6,09%** | `dados_mensais` | snapshot mensal | Fideliza+ usa trimestre, não Maio |
| Inadimplência | **0,0%** | RPC + `dados_mensais` | média do Q2 com meses > 0 | **0,0%** | `dados_mensais` | snapshot mensal | Números batem no snapshot, mas o snapshot está suspeito |
| Renovação | **100%** | RPC + `renovacoes` | `43/43` no Q2 | **0,0%** | `dados_mensais` | snapshot mensal | Fideliza+ usa tabela `renovacoes`; snapshot está zerado |
| Reajuste | **0,0%** | RPC + `renovacoes` | média trimestral | **0,0%** | `dados_mensais` | snapshot mensal | Batem, mas ambos parecem sem backfill real |
| Lojinha | **R$ 0** | RPC | hardcoded | n/d | n/d | n/d | TODO não implementado |

---

## Números utilizados

### Fideliza+ Q2 Recreio

- churn: `3,94%`
- inadimplência: `0,00%`
- renovação: `100,00%`
- reajuste: `0,00%`
- lojinha: `0`

### `dados_mensais` Recreio

Abr/2026:
- churn `0,33`
- inadimplência `0,00`
- renovação `0,00`

Mai/2026:
- churn `6,09`
- inadimplência `0,00`
- renovação `0,00`

Jun/2026:
- churn `5,47`
- inadimplência `0,00`
- renovação `0,00`

---

## Causas da divergência

### 1. O Fideliza+ ignora o mês do filtro

Essa é a divergência principal.

O print mostra `Mai/2026` no contexto da página, mas o Fideliza+ usa `Q2`.

### 2. O Fideliza+ usa fontes diferentes por métrica

Ele mistura:
- `movimentacoes_admin` para churn
- `dados_mensais` para inadimplência
- `renovacoes` para renovação/reajuste

O Report histórico usa `dados_mensais`.

Logo, o painel compara **alhos com bugalhos**.

### 3. A renovação está incompatível com o snapshot oficial

O Fideliza+ mostra `100%` porque consulta `renovacoes` diretamente (`43/43`).

Mas `dados_mensais` de Maio e Junho estão com `taxa_renovacao = 0`.

Isso indica:
- snapshot histórico não foi preenchido corretamente para renovação; ou
- o Fideliza+ foi corrigido para fonte mais nova e o Report histórico não foi.

### 4. A inadimplência de 0% está contaminada pelo snapshot

Hoje:
- `dados_mensais` Q2 para Recreio está zerado em inadimplência;
- o Fideliza+ replica isso;
- porém o banco atual já mostra pagantes `inadimplente` e pagantes `sem_parcela`.

No estado atual do banco para Recreio:
- `2` inadimplentes pagantes principais
- base de `311` pagantes
- inadimplência por cabeças atual ≈ `0,64%`
- `8` pagantes principais estão como `sem_parcela`

Ou seja:
- o `0,0%` do Fideliza+ não parece confiável como leitura de realidade;
- ele herda um snapshot que já parece contaminado/zerado.

### 5. Transferência interna pode inflar churn

A RPC conta `movimentacoes_admin.tipo IN ('evasao','nao_renovacao')` sem excluir transferência interna.

No Q2 do Recreio há pelo menos um caso:
- Arthur Vargas Caldas: Recreio -> Barra em 2026-05-02

Se excluir esse caso do churn oficial de Maio:
- churn cai de `6,09%` para `5,77%`

Então o Fideliza+ também está vulnerável ao mesmo buraco de modelagem de transferência.

---

## Veredito

O Fideliza+ **não está mostrando os KPIs mensais oficiais de Maio**.

Ele está mostrando:
- um **painel trimestral**;
- com **fontes mistas**;
- e com **métricas que não seguem a mesma camada de verdade do Report histórico**.

### Divergências mais importantes

1. **Churn 3,9%**: não é Maio; é média do Q2.
2. **Renovação 100%**: vem da tabela `renovacoes`, enquanto o Report histórico de Maio usa snapshot zerado.
3. **Inadimplência 0%**: bate com o snapshot, mas o snapshot parece desatualizado/contaminado pelo problema operacional de `sem_parcela`.

---

## Plano de correção recomendado

### Fase 1 — alinhamento conceitual

Decidir se o Fideliza+ deve ser:
- **mensal** e seguir o filtro da página; ou
- **trimestral** e deixar isso explícito em toda a UI, sem badge mensal ambíguo.

### Fase 2 — unificar fonte

Escolher uma única camada por métrica:
- ou `dados_mensais`
- ou view/RPC canônica
- ou cálculo raw consistente

Mas evitar a mistura atual.

### Fase 3 — corrigir snapshot histórico

Principalmente:
- `taxa_renovacao` em `dados_mensais`
- `inadimplencia`
- possível contaminação por `sem_parcela`

### Fase 4 — excluir transferências do churn

Tanto no Fideliza+ quanto nos KPIs de retenção.
