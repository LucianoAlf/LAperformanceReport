# Execução do Contrato Canônico de Dados Pedagógicos

Data: 15/07/2026
Projeto Supabase: `ouqwbbermlzqqvtqwlul`
Escopo: identidade do aluno, carteira do professor, presença, frequência, churn, Health Score, KPIs de professores e consumidores do Fábio.

## 1. Veredito executivo

O contrato canônico foi implantado em camadas de sombra e contenção, sem substituir silenciosamente indicadores oficiais por valores ainda não confiáveis.

- **Identidade e carteira:** camada canônica em sombra criada e validada.
- **Média de alunos por turma:** corrigida para pessoas únicas por turmas regulares elegíveis.
- **Presença:** semântica separada em evidência confirmada, provável, indeterminada e exclusão justificada.
- **Churn:** cálculo legado pausado; previsões atuais marcadas como baixa confiança e “Em auditoria”.
- **Health Score do aluno:** versão canônica em sombra criada, sem corte para produção enquanto a base de presença não atingir confiança suficiente.
- **KPIs de professor:** presença e Health Score ficam bloqueados quando a base não é publicável; a UI e as funções de IA não convertem ausência de evidência em `0%`.
- **Fábio:** briefing, contexto e pente-fino passaram a consumir carteira por pessoa e semântica canônica de presença.

O sistema está mais seguro para uso operacional porque agora prefere declarar **“Em auditoria”** a publicar precisão falsa.

## 2. Contenção P0 aplicada

### 2.1 Churn

Foi confirmado que `risco_evasao` é consumido pela tela **Sucesso do Aluno**. Não foi localizado outro disparo automático de ligação ou retenção no repositório, mas a ordenação visual já influencia decisão humana.

Ações aplicadas:

1. pausa do cron do modelo legado;
2. preservação do histórico existente;
3. marcação das 1.157 previsões correntes como baixa confiança;
4. status operacional alterado para `Em auditoria`;
5. frontend ajustado para não apresentar essas previsões como fato confiável.

Limite atual: os artefatos do modelo que geraram o score legado não existem no repositório nem no workspace pesquisado. Não é possível recalibrar honestamente o modelo sem reconstruir e versionar o pipeline.

### 2.2 Pente-fino do Fábio

`fabio_pente_fino_unidade` permanece executável apenas por `service_role`. O grant de `fabio_agent` foi removido até a liberação formal.

O pente-fino agora:

- conta carteira por pessoa canônica;
- aceita como falta oficial somente `falta_confirmada`;
- lista `falta_provavel` separadamente como triagem;
- só publica frequência quando a confiança é alta;
- não atribui `0%` a professor sem login ou sem base publicável.

### 2.3 RPC legada de KPIs de professor

A validação cruzada posterior encontrou `get_kpis_professor_periodo` ainda executável por `PUBLIC`, `anon` e `authenticated`. A função calculava carteira por `alunos.professor_atual_id`, lia `aluno_presenca` bruto e convertia presença/faltas sem base em `0/0`.

Correção aplicada:

- a assinatura antiga foi preservada apenas como compatibilidade autenticada;
- seu corpo agora delega integralmente para `get_kpis_professor_periodo_canonico_v2`;
- presença e faltas sem publicação autorizada retornam `NULL`;
- acesso de `PUBLIC` e `anon` foi revogado;
- usuários autenticados continuam sujeitos aos guards de permissão e unidade da v2;
- nenhum código executável atual do repositório chama a assinatura antiga.

Contraponto de precisão: antes da correção, a execução com papel `anon` tinha grant, mas retornou zero linhas por causa das políticas das tabelas subjacentes. Portanto, havia superfície indevida e risco de regressão, mas o teste não comprovou vazamento financeiro anônimo no estado imediatamente anterior.

Validação após a correção:

- `anon`: `permission denied`, código `42501`;
- usuário autenticado autorizado: 19 linhas pela compatibilidade e 19 pela v2;
- mesmas chaves professor/unidade nas duas assinaturas;
- nenhum `0%` fabricado quando `presenca_publicavel = false`.

## 3. Camadas canônicas implantadas

### 3.1 Identidade e carteira

Fontes principais:

- `vw_aluno_identidade_unidade_canonica`
- `vw_professor_carteira_pessoa_canonica_sombra`

Regra de identidade:

1. `unidade_id + emusys_aluno_id` quando disponível;
2. fallback controlado para `aluno_id` local;
3. nenhuma fusão automática entre unidades.

Validação em produção:

- 1.356 pessoas canônicas;
- 1.301 com confiança alta;
- 55 em fallback;
- 146 pessoas representam mais de uma linha local;
- carteira: 1.149 vínculos, sendo 1.107 de confiança alta, 40 média e 2 baixa.

### 3.2 Média de alunos por turma

Fonte oficial atual: `get_carteira_professor_periodo_canonica`, CTE `turmas_calc`.

Regra publicada:

```text
média por turma = pessoas únicas em cursos regulares / turmas regulares elegíveis
```

Bandas e cursos configurados como não participantes ficam fora do denominador pedagógico. Ocupações artificiais de reagendamento não são usadas para inflar a média.

Conferências:

- Gabriel Antony / Barra / Jun-2026: `46 / 42 = 1,10`;
- Daiana / Campo Grande / Jun-2026: `14 / 6 = 2,33`.

### 3.3 Presença semântica

Fontes:

- `aluno_presenca`: evidência sincronizada;
- `aulas_emusys`: contexto da aula e anotação;
- `vw_aluno_presenca_semantica_v1`: classificação canônica.

Estados:

- `presente_confirmado`;
- `falta_confirmada`;
- `falta_provavel`;
- `nao_registrada` / indeterminada;
- exclusão justificada.

O Emusys não oferece um estado estruturado e historicamente confiável para “chamada não feita”. Por isso, ausência antiga não pode ser promovida automaticamente a falta real.

Distribuição validada:

- 30.735 presenças confirmadas;
- 2 faltas confirmadas;
- 6.719 faltas prováveis;
- 9.218 registros indeterminados;
- 556 exclusões justificadas.

Essas contagens são uma fotografia de 15/07/2026 e podem variar a cada sincronização sem que a regra de classificação tenha mudado.

### 3.4 Evidência bruta no sync

`sync-presenca-emusys` passou a preservar a evidência recebida antes da classificação semântica. A Edge Function foi publicada como versão 61.

A classificação é feita no banco; o sync não inventa “falta confirmada” quando o payload só permite inferência.

## 4. Frequência, Health Score e publicação

### 4.1 Aluno

Foi criada a RPC canônica de frequência do aluno e uma versão de Health Score em sombra. O score oficial não foi substituído porque nenhum aluno atingiu base suficiente para publicação do componente de presença com o histórico atual.

### 4.2 Professor

Camadas:

- frequência canônica em sombra;
- RPC de frequência publicável;
- KPIs de professor com metadados de confiança;
- compatibilidade por unidade preservada.

Junho/2026:

- 77 linhas professor/unidade;
- 0 com confiança alta;
- 16 com confiança média;
- 57 com confiança baixa;
- 4 sem base.

Consequência: porcentagem de presença, ranking derivado de presença e Health Score que dependa dela não podem ser publicados como oficiais agora.

## 5. Consumidores ajustados

### 5.1 LA Report

- `TabPerformanceProfessores`
- `TabCarteiraProfessores`
- `ModalDetalhesProfessorPerformance`
- `PlanoAcaoEquipe`
- `ModalRelatorioCoordenacao`
- `relatorioCoordenacaoInstantaneo`
- `TabSucessoAluno`

Comportamento:

- `null` permanece `null`; não vira zero;
- baixa confiança aparece como `Em auditoria`;
- tendência histórica é complementar e não derruba o KPI atual;
- isolamento por unidade foi preservado.

### 5.2 IA e relatórios

Funções publicadas:

| Função | Versão |
|---|---:|
| `gemini-insights-equipe` | 40 |
| `gemini-insights-professor` | 43 |
| `gemini-relatorio-professor-individual` | 35 |
| `gemini-relatorio-coordenacao` | 55 |
| `gemini-ranking-professores` | 35 |
| `sync-presenca-emusys` | 61 |

As funções recebem `presenca_publicavel` e metadados de confiança. Quando a presença está bloqueada, elas não podem elogiar, punir, ranquear ou recomendar ação com base nesse número.

### 5.3 Fábio

Objetos reescritos:

- `fabio_contexto_professor`;
- `fabio_briefing_matinal`;
- `fabio_pente_fino_unidade`.

Regras:

- carteira por pessoa canônica;
- estado de chamada explícito;
- preferência por `resumo_ia`/`anotacoes_fabio`, com fallback para anotação do Emusys;
- falta provável é triagem, não acusação;
- cobertura e frequência só são publicadas com base e login adequados.

Desempenho do pente-fino:

- antes da otimização: aproximadamente 84 segundos para duas unidades;
- depois da materialização por unidade: aproximadamente 7,2 segundos para duas unidades.

Exemplos validados:

- Caio / Campo Grande: carteira 41; 0 faltas recorrentes confirmadas; 22 casos prováveis para triagem; frequência bloqueada; cobertura 16,3%;
- Matheus / Campo Grande: carteira 11; 0 confirmadas; 6 prováveis; frequência bloqueada; cobertura 55,6%;
- Matheus / Recreio: carteira 11; 0 confirmadas; 5 prováveis; frequência bloqueada; cobertura 64,8%.

## 6. Segurança e isolamento

Validação de unidade:

- administrador consolidado: 77 linhas;
- usuário restrito: 32 linhas da própria unidade;
- tentativa cruzada: erro `42501`.

Permissões do Fábio:

- contexto e briefing: `fabio_agent` e `service_role`;
- pente-fino: somente `service_role`;
- sem acesso de `anon` ou `authenticated` ao pente-fino.

## 7. Migrações aplicadas

```text
20260715120000_contrato_pedagogico_contencao_p0.sql
20260715130000_identidade_carteira_pedagogica_sombra.sql
20260715131500_carteira_sombra_resolver_identidade_local.sql
20260715140000_presenca_semantica_canonica_sombra.sql
20260715150000_professores_media_turma_pessoa_turma.sql
20260715151000_professores_media_turma_pessoas_unicas.sql
20260715160000_frequencia_churn_canonico_sombra.sql
20260715161000_frequencia_churn_sombra_performance.sql
20260715162000_sync_presenca_emusys_evidencia_bruta.sql
20260715163000_presenca_semantica_evidencia_bruta.sql
20260715164000_pausar_modelo_churn_legado.sql
20260715165000_health_score_aluno_canonico_sombra.sql
20260715170000_frequencia_aluno_canonica_rpc.sql
20260715171000_frequencia_professor_canonica_sombra.sql
20260715172000_frequencia_professor_publicavel.sql
20260715173000_kpis_professor_presenca_publicavel_v2.sql
20260715173500_kpis_professor_unidade_compat.sql
20260715180000_fabio_consumidores_pedagogicos_canonicos.sql
20260715181000_kpis_professor_legado_wrapper_seguro.sql
```

Observação operacional: o histórico local/remoto de migrations está divergente. As migrations desta rodada foram compiladas transacionalmente e aplicadas de forma controlada. Não executar `supabase db push` indiscriminadamente até reconciliar o histórico.

## 8. Testes e verificações

- suíte Node completa: **130/130 testes aprovados**;
- `npm run build`: aprovado;
- Deno check das seis Edge Functions alteradas: aprovado;
- compilação SQL transacional antes da aplicação: aprovada;
- grants e isolamento por unidade: aprovados;
- benchmark de pente-fino: aprovado;
- `git diff --check`: aprovado.

### 8.1 Validação visual autenticada

A aplicação foi aberta em sessão autenticada e verificada no navegador real nas telas:

- Dashboard, com competência `Jul/2026`;
- Professores > Performance, com competência `Jul/2026`;
- detalhe individual de professor;
- Professores > Carteira.

Resultados:

- a competência selecionada permaneceu consistente entre a lista e o detalhe;
- indicadores de presença/Health sem confiança suficiente exibiram **Em auditoria**, sem publicar `0%` como desempenho;
- a Carteira apresentou explicitamente o recorte operacional ao vivo, evitando comparação silenciosa com competência mensal fechada;
- nenhuma mensagem de erro de carregamento apareceu na Performance ou na Carteira;
- após a correção abaixo, o console do navegador permaneceu com **0 erros** e as chamadas novas da RPC canônica retornaram HTTP 200.

Durante o teste foi encontrado um problema real no detalhe do professor: o modal consultava janeiro até a competência atual em paralelo, fazendo a RPC `get_kpis_professor_periodo_canonico_v2` exceder o timeout. A correção aplicada:

- reutiliza o KPI da competência já carregada na lista;
- carrega o histórico mensal sequencialmente;
- mantém fallback isolado por mês, sem derrubar todo o card se um período falhar.

Esse comportamento ficou coberto por teste de fonte e foi revalidado no navegador após a alteração.

Ressalva preexistente: `npx tsc --noEmit` global é bloqueado por sintaxe inválida em `scripts/importar_historico_ltv.js:29`. O build de produção passa e esse arquivo não pertence à alteração.

## 9. Pendências e critério de liberação

### Bloqueios reais

1. reconstruir e versionar o pipeline do modelo de churn;
2. produzir histórico novo com estados confiáveis de chamada;
3. definir amostra mínima e limiar de confiança com coordenação;
4. validar período piloto antes de publicar frequência e Health Score;
5. reconciliar o histórico de migrations local/remoto.

### Não fazer

- não reativar o cron de churn legado;
- não converter `falta_provavel` em falta oficial;
- não usar `professor_presenca = 'ausente'` como falta do professor;
- não publicar `0%` quando a base está ausente ou bloqueada;
- não liberar o pente-fino diretamente ao agente antes da validação formal.

## 10. Próxima decisão de negócio

A coordenação precisa confirmar somente regras que não podem ser deduzidas do banco:

1. amostra mínima de aulas para publicar frequência;
2. janela oficial de frequência (30, 60 ou 90 dias);
3. período piloto necessário para considerar a nova base estável;
4. peso ou retirada temporária da presença no Health Score;
5. rótulo operacional dos casos prováveis que irão para conferência humana.

Até essas confirmações, o comportamento correto é manter os indicadores afetados como **Em auditoria**.
