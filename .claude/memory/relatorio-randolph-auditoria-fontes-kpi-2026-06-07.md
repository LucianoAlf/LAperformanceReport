# Relatório Randolph — Auditoria Arquitetural de Fontes de KPI

Data: 2026-06-07
Projeto: LA Music Performance Report
Objetivo deste relatório: servir como handoff para o próximo chat, explicando o que foi feito, por que essa frente existe, o que já está validado, o que ainda falta validar e qual a sequência segura antes de qualquer mudança de backend.

---

## 1. O que estamos fazendo

Estamos conduzindo uma **auditoria arquitetural das fontes de KPI** do LA Performance Report.

O foco **não é corrigir um bug isolado**.
O foco é mapear e validar, com segurança, **de onde cada KPI realmente vem** e **por que o mesmo número pode aparecer diferente em telas diferentes**.

A auditoria cobre:

- Dashboard
- Analytics / Gestão Mensal
- Comercial
- Administrativo
- Alunos
- Professores
- Fideliza+

Ela considera:

- cards de KPI;
- gráficos;
- modais/drill-down;
- hooks;
- views;
- RPCs/functions;
- tabelas brutas;
- snapshots em `dados_mensais`;
- cálculos locais no frontend;
- fallbacks silenciosos.

---

## 2. Por que essa auditoria foi aberta

O gatilho visível foi a divergência:

- `Analytics` mostrando `310` pagantes;
- `Alunos` mostrando `311`;
- banco live confirmando `310`;
- `dados_mensais` contendo `311`.

Isso provou uma coisa importante:

> o problema não é “um aluno específico errado”;  
> o problema é que o sistema permite que o **mesmo KPI** seja calculado por **fontes e regras diferentes**.

O caso do Matheus Lopes serviu como evidência de sujeira/duplicidade/classificação, mas **não** como justificativa para excluir aluno da conta.
O número live correto permaneceu `310`.

Conclusão arquitetural:

- o sistema hoje mistura:
  - view live;
  - `dados_mensais`;
  - tabela bruta;
  - RPC;
  - cálculo local no frontend;
  - fallback silencioso.

Esse é o risco real.
O caso `310/311` é só um sintoma.

---

## 3. O que já foi feito

### 3.1 Auditoria documental consolidada

Foi criado e atualizado o documento-base:

- `d:/2026/LA-performance-report/.claude/memory/auditoria-arquitetural-fontes-kpi-2026-06-07.md`

Esse documento já contém:

- inventário de fontes por tela;
- classificação dos problemas;
- arquitetura-alvo;
- prioridades P0/P1/P2;
- status dos achados;
- validação real no banco;
- matriz operacional validada por tela/item.

### 3.1.1 Complemento obrigatório do Alfredo

Além dos dois documentos principais, o próximo chat deve considerar também:

- `outputs/la-report-kpi-audit/auditoria-cruzada-fontes-kpi-2026-06-07.md`

Importante:

- no workspace auditado neste chat, esse arquivo **não foi localizado no caminho citado**
- portanto, o conteúdo abaixo deve ser tratado como **resumo transcrito / evidência indireta**, até que o artefato original seja localizado
- não assumir que o arquivo está disponível sem nova verificação de path

Esse terceiro material cobre um ponto crítico que a auditoria de fontes, sozinha, não fecha completamente:

> `dados_mensais` não pode ser tratado hoje como histórico imutável.

Achado crítico da auditoria cruzada:

- `dados_mensais` pode ser sobrescrito por funções reais já existentes

Funções e fluxos que precisam ser tratados como risco de governança histórica:

- `fechar_dados_mensais`
- `recalcular_dados_mensais`
- `snapshot_dados_mensais`
- `upsert_dados_mensais`
- `sync_evasao_to_dados_mensais` via trigger em `movimentacoes_admin`

Caso já comprovado em Recreio / Jun 2026:

- live/view = `310` pagantes
- `dados_mensais` = `311` pagantes
- `ticket_medio = 0`
- `faturamento_estimado = 0`
- `inadimplencia = 0`

Conclusão obrigatória para o próximo chat:

- antes de qualquer patch de KPI live, tratar `dados_mensais` como **risco P0 de governança histórica**
- **não recalcular**
- **não fazer backfill**
- **não alterar `dados_mensais`**
- primeiro desenhar proteção contra overwrite de mês fechado

### 3.2 Validação real código + banco

Foi feito cruzamento entre:

- código frontend;
- hooks;
- banco real via Supabase MCP;
- catálogo de views;
- catálogo de functions/RPCs;
- tabelas usadas;
- dependências entre views e tabelas.

Regras obedecidas:

- SELECT-only;
- sem alterar código;
- sem mexer em `dados_mensais`;
- sem recalcular snapshot;
- sem executar migration.

### 3.3 Objetos confirmados no banco

Confirmados como existentes:

- `vw_kpis_gestao_mensal`
- `vw_kpis_comercial_mensal`
- `vw_kpis_retencao_mensal`
- `vw_dashboard_unidade`
- `vw_turmas_implicitas`
- `vw_kpis_professor_mensal`
- `vw_kpis_professor_completo`
- `vw_fator_demanda_professor`
- `get_historico_ltv`
- `get_carteira_professores`
- `get_kpis_experimentais_professor`
- `get_kpis_professor_periodo`
- `get_programa_fideliza_dados`
- `get_tempo_permanencia`

### 3.4 Objeto ausente confirmado

Confirmado como **não existente**:

- `get_presenca_por_aluno_professor`

Isso é relevante porque o modal de presença em Professores tenta usar essa RPC e cai em fallback.

### 3.5 Fallbacks silenciosos confirmados

Foram confirmados no código:

- `useKPIsGestao`:
  - tenta `vw_kpis_gestao_mensal`;
  - se vier vazio, cai para `dados_mensais`;
  - tendência do mês anterior sai de `dados_mensais`.

- `DashboardPage`:
  - mês atual usa `vw_kpis_gestao_mensal`;
  - histórico tenta `dados_mensais`;
  - se vazio, recalcula usando `alunos`.

- `TabGestao`:
  - histórico usa `dados_mensais`;
  - ainda consulta `vw_kpis_gestao_mensal` para `reajuste_medio`.

- `useKPIsComercial`:
  - tenta `vw_kpis_comercial_mensal`;
  - se falhar, cai para `leads` + `alunos`.

- `useKPIsRetencao`:
  - tenta `vw_kpis_retencao_mensal`;
  - se falhar, cai para `movimentacoes_admin` + `renovacoes` + `alunos`.

- `ModalDetalhesPresenca`:
  - tenta RPC inexistente;
  - cai para `aluno_presenca` + `aulas_emusys`.

### 3.6 Achados de arquitetura já confirmados

Confirmado:

- existe fragmentação de fontes entre páginas;
- `Analytics/Gestão Mensal` separa live e histórico, mas ainda mistura fallback;
- `Alunos` recalcula KPI executivo localmente;
- `Comercial` usa ao mesmo tempo `vw_kpis_comercial_mensal` e `dados_comerciais`;
- `Fideliza+` depende de `dados_mensais` via RPC;
- o caso `310/311` é real: live `310`, snapshot `311`.

---

## 4. O que a auditoria provou até aqui

### 4.1 O problema é sistêmico

O mesmo KPI pode aparecer por fontes diferentes em telas diferentes.

Exemplos:

- `Pagantes`:
  - view live em uma tela;
  - snapshot em outra;
  - cálculo local em `Alunos`.

- `Ticket Médio`:
  - às vezes vem da view;
  - às vezes de `dados_mensais`;
  - às vezes é recalculado no frontend.

- `MRR`, `Inadimplência`, `Churn`:
  - aparecem com semântica live vs histórico misturada.

### 4.2 Existem objetos reais no banco que o frontend usa corretamente

Isso é importante para evitar conclusões erradas.

Por exemplo:

- `get_kpis_professor_periodo` **existe** no banco;
- logo, Professores não está “sem backend”;
- o problema lá é mais fino: coexistência entre RPC, views auxiliares e fallback no modal de presença.

### 4.3 Existem objetos/fluxos realmente perigosos

Principal achado confirmado:

- `get_presenca_por_aluno_professor` não existe;
- o modal depende de fallback silencioso.

Achado estrutural importante:

- `vw_dashboard_unidade` depende de `dados_mensais` e usa `CURRENT_DATE`;
- então ela não é uma fonte neutra/universal para qualquer contexto temporal.

### 4.4 A arquitetura-alvo está clara

Regra-alvo definida:

- KPI live do mês atual → **fonte canônica única**
- KPI histórico / mês fechado → **`dados_mensais`**
- lista operacional → **tabela bruta**
- drill-down/modal → **fonte detalhada coerente com o KPI pai**

Ressalva obrigatória:

- essa arquitetura-alvo continua válida, mas `dados_mensais` só pode ser tratado como camada histórica confiável depois que o risco de sobrescrita de mês fechado estiver mapeado e protegido

---

## 5. A auditoria está completa?

### Resposta curta

**Ela está suficientemente completa para planejar correções com segurança.**

Mas **ainda não está 100% encerrada** do ponto de vista de validação profunda de regra por regra.

### O que já está suficientemente fechado

- inventário macro das fontes;
- confirmação dos principais objetos no banco;
- confirmação dos fallbacks silenciosos;
- classificação dos riscos;
- definição da arquitetura-alvo;
- priorização P0 / P1 / P2.

### O que ainda falta para considerar a auditoria “fechada de ponta a ponta”

1. **Fechar prova de regra por KPI P0**
   - comparar, com SQL canônico, a regra real de:
     - Alunos Pagantes
     - Alunos Ativos
     - Ticket Médio
     - MRR
     - Inadimplência
     - Churn

2. **Fechar semântica live vs histórico por tela**
   - quais telas devem mostrar live;
   - quais devem mostrar snapshot fechado;
   - onde hoje isso está ambíguo.

3. **Fechar agregação consolidada**
   - soma;
   - média;
   - média ponderada;
   - distinct por pessoa;
   - contagem por matrícula.

4. **Fechar coerência card ↔ drill-down**
   - especialmente em:
     - Professores / conversão;
     - Professores / presença;
     - Administrativo / retenção;
     - Comercial / funil.

5. **Fechar lista final de legado**
   - o que continua existindo só por compatibilidade;
   - o que é candidato a descontinuação;
   - o que ainda sustenta telas críticas.

Então:

> a auditoria está **madura para decidir o primeiro pacote de correção**,  
> mas ainda precisa de uma última camada de validação funcional por KPI antes de mexer no backend.

---

## 6. Prioridade operacional já definida

### P0 — confiança executiva

Corrigir/unificar primeiro:

- Alunos Pagantes
- Alunos Ativos
- Ticket Médio
- MRR
- Inadimplência
- Churn

### P0 adicional — governança histórica

Antes de abrir correção de KPI live, considerar também como P0:

- proteção de mês fechado em `dados_mensais`
- mapeamento das funções que sobrescrevem snapshot
- confirmação de quais fluxos ainda conseguem alterar histórico consolidado

### P1 — operação

- Comercial / funil
- Administrativo / retenção
- Professores / performance / conversão

### P2 — gráficos / drill-down

- evolução
- distribuição
- modais detalhados
- comparativos por período

---

## 7. Próximos passos recomendados no novo chat

### Etapa 1 — fechar validação funcional dos KPIs P0

Objetivo:
validar a regra real de cada KPI P0 no banco e no frontend antes de qualquer alteração.

Fazer:

- levantar SQL canônico para cada KPI P0;
- comparar com:
  - `vw_kpis_gestao_mensal`;
  - `dados_mensais`;
  - cálculos locais do frontend;
  - telas que exibem o KPI.

Entregável:

- matriz `KPI P0 -> regra canônica -> fontes atuais -> divergência -> decisão de fonte alvo`.

### Etapa 2 — mapear impacto de backend antes de mexer

Objetivo:
evitar quebrar telas ao unificar fonte.

Fazer:

- identificar quais telas/hooks dependem de cada campo de:
  - `vw_kpis_gestao_mensal`
  - `vw_dashboard_unidade`
  - `vw_kpis_retencao_mensal`
  - `vw_kpis_comercial_mensal`
  - `dados_mensais`

Também validar:

- quais funções escrevem em `dados_mensais`
- quais triggers atualizam `dados_mensais`
- quais meses fechados ainda podem ser sobrescritos
- se existe proteção efetiva de competência fechada

Entregável:

- matriz de impacto por objeto.

### Etapa 3 — escolher o primeiro pacote pequeno e seguro

Sugestão:

- pacote inicial: `Pagantes + Ativos`

Por quê:

- já têm sintoma validado;
- são executivos;
- aparecem em múltiplas telas;
- são mais fáceis de auditar por pessoa vs matrícula.

Condição para abrir patch:

- fonte live canônica definida;
- telas impactadas listadas;
- regra histórica preservada em `dados_mensais`;
- risco de overwrite de mês fechado mapeado;
- rollback lógico claro.

### Etapa 4 — só então desenhar mudança de backend

Nesse momento, decidir com evidência:

- se basta ajustar view existente;
- se precisa criar camada nova canônica;
- se alguma view deve virar legado;
- se alguma parte deve continuar no frontend por ser operacional;
- se algum hook precisa parar de ter fallback silencioso.

E antes disso, decidir também:

- como proteger `dados_mensais` contra overwrite de competência fechada;
- se a proteção é por função, trigger, política de fechamento ou camada intermediária;
- quais rotinas históricas precisam ser congeladas antes de mexer em KPI live.

Importante:

> não decidir “converter tudo para RPC” por princípio.  
> A forma da solução precisa vir **depois** da validação de regra e impacto.

### Etapa 5 — planejar rollout seguro

Antes de alterar backend:

- listar telas impactadas;
- listar KPIs impactados;
- criar checklist de validação manual;
- definir comparação antes/depois;
- prever estratégia de rollback;
- preservar histórico (`dados_mensais`) sem recalcular nada nesta fase.

---

## 8. Riscos se alguém mexer agora sem seguir esse processo

Se alguém alterar backend antes de fechar a validação final, os riscos são:

- corrigir uma tela e quebrar outra;
- mudar live e contaminar comparações históricas;
- manter ou piorar sobrescrita de `dados_mensais` em mês fechado;
- trocar regra de pessoa por linha sem perceber;
- alterar agregação consolidada sem documentação;
- mascarar problema com fallback novo;
- aumentar dependência de legado ao invés de reduzir.

O principal risco é:

> “arrumar um número” sem arrumar a arquitetura.

---

## 9. Instrução objetiva para o próximo chat

Use este relatório e o documento-base:

- `d:/2026/LA-performance-report/.claude/memory/auditoria-arquitetural-fontes-kpi-2026-06-07.md`
- `d:/2026/LA-performance-report/.claude/memory/relatorio-randolph-auditoria-fontes-kpi-2026-06-07.md`
- `outputs/la-report-kpi-audit/auditoria-cruzada-fontes-kpi-2026-06-07.md`

Ressalva operacional:

- se o terceiro arquivo continuar ausente no workspace, usar o resumo transcrito neste relatório como pista de investigação
- e marcar o artefato original como **não localizado / pendente de confirmação**

Missão do próximo chat:

1. revisar a matriz operacional validada;
2. revisar o risco de governança histórica em `dados_mensais`;
3. fechar a validação funcional dos KPIs P0;
4. montar matriz de impacto de backend por objeto;
5. desenhar proteção contra overwrite de mês fechado;
6. propor o primeiro pacote pequeno de correção;
7. **não** abrir patch antes dessa validação final.

Restrições que devem continuar:

- SELECT-only durante a fase de validação;
- não alterar código ainda;
- não mexer em `dados_mensais`;
- não recalcular snapshot;
- não rodar migration;
- não assumir existência de objeto sem conferir no banco real.

---

## 10. Resumo executivo

O trabalho feito até aqui já demonstrou que:

- a divergência de KPIs é estrutural;
- o sistema hoje mistura múltiplas fontes para o mesmo indicador;
- o histórico em `dados_mensais` também está vulnerável a sobrescrita por funções reais;
- já existe evidência suficiente para tratar isso como dívida arquitetural real;
- já temos base boa para começar correção segura;
- mas ainda precisamos fechar a validação final dos KPIs P0, o impacto de backend e a proteção do histórico antes de mudar qualquer coisa.

Em uma frase:

> Estamos saindo do estágio “caçar discrepância de tela”  
> para o estágio “reconstruir a governança de fonte dos KPIs com segurança”.

---

## 11. Estado da evidência

### Documentos confirmados

Materiais efetivamente presentes no workspace e usados nesta auditoria:

- `d:/2026/LA-performance-report/.claude/memory/auditoria-arquitetural-fontes-kpi-2026-06-07.md`
- `d:/2026/LA-performance-report/.claude/memory/relatorio-randolph-auditoria-fontes-kpi-2026-06-07.md`

Esses dois documentos podem ser tratados como base confirmada de handoff.

### Evidência indireta

Material citado, mas não localizado no path informado durante este chat:

- `outputs/la-report-kpi-audit/auditoria-cruzada-fontes-kpi-2026-06-07.md`

Status correto:

- **não localizado no workspace auditado**
- conteúdo tratado apenas pelo **resumo transcrito**
- útil como pista forte de investigação, mas não como artefato documental confirmado

### Lacunas abertas

Antes de usar o terceiro material como prova documental, o próximo chat deve:

- confirmar se o arquivo existe em outro path;
- verificar se o nome/path informado estava desatualizado;
- confirmar se o conteúdo transcrito bate com o artefato original;
- manter a distinção entre:
  - evidência confirmada no banco/código;
  - resumo transcrito;
  - hipótese ainda pendente.

### Regra de uso para o próximo chat

Até localizar o terceiro arquivo original:

- usar os dois documentos em `.claude/memory` como base principal;
- usar o alerta sobre sobrescrita de `dados_mensais` como risco real a validar;
- não apresentar o arquivo ausente como “lido”;
- não transformar o resumo transcrito em prova final sem nova verificação.
