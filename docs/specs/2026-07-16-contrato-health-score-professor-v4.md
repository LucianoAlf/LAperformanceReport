# Contrato Canônico - Health Score do Professor V4

**Data:** 2026-07-16
**Status:** aprovado para elaboração da SPEC e implementação em sombra; não aprovado para virada em produção
**Ciclo oficial:** trimestral, com fechamento e snapshots mensais
**Início da presença pontuável:** 03/08/2026
**Escopo:** desempenho do professor no LA Report, relatórios da coordenação e futuros consumidores autorizados do LA Teacher/Fábio

---

## 1. Objetivo

Substituir o Health Score V2 por um modelo canônico, auditável e versionado, sem alterar a V2 durante a construção.

A V3/V4 deve:

- eliminar dupla penalização de evasão;
- remover crescimento e fator de demanda do score;
- separar pessoa, matrícula, disciplina, turma e período com professor;
- não fabricar zero quando não há base;
- preservar valores brutos, amostras, confiança e versão da regra;
- permitir comparação em sombra antes da virada;
- impedir que uma mudança de peso reescreva competências já fechadas.

O score não substitui leitura pedagógica individual nem o Programa de Desenvolvimento Individual.

---

## 2. Princípios canônicos

1. **Pessoa não é matrícula.** Uma pessoa pode ter várias matrículas ou disciplinas.
2. **Matrícula não é disciplina.** Uma matrícula pode conter mais de uma disciplina.
3. **Professor é avaliado por unidade.** O consolidado é recalculado com os dados das unidades, nunca pela média simples dos scores unitários.
4. **Ausência de base não é zero.** Métrica sem base é nula e não pune.
5. **Evento desconhecido não penaliza.** Motivo não confirmado vai para conciliação.
6. **Histórico inferido não vira fato silenciosamente.** Toda reconstrução carrega fonte e confiança.
7. **V2 permanece intacta.** A nova camada nasce com nomes, tabelas, RPCs e snapshots próprios.

---

## 3. Grão por métrica

| Métrica | Grão oficial |
|---|---|
| Número de alunos | pessoa canônica na carteira do professor e unidade |
| Média de alunos por turma | ocupação única pessoa-turma regular |
| Conversão | experimental confirmada e matrícula vinculada |
| Retenção | período matrícula-disciplina-professor exposto na janela |
| Permanência | período matrícula-disciplina-professor encerrado |
| Presença | evento aluno-aula elegível atribuído ao professor |

Consequências:

- a mesma pessoa em Bateria com Peterson e Guitarra com Jeyson gera dois vínculos pedagógicos independentes;
- a pessoa conta uma vez na carteira de cada professor;
- se fizer dois cursos com o mesmo professor, conta uma vez em "Número de alunos", mas cada matrícula-disciplina conserva seu próprio histórico de retenção e permanência;
- disciplinas simultâneas na mesma matrícula são separadas por `emusys_matricula_disciplina_id`;
- renovação administrativa sem troca pedagógica não encerra o vínculo.

---

## 4. Pilares e pesos iniciais

| Pilar | Peso inicial |
|---|---:|
| Retenção atribuível | 25% |
| Tempo de permanência com o professor | 25% |
| Conversão experimental -> matrícula | 15% |
| Média de alunos por turma | 15% |
| Número de alunos | 10% |
| Presença dos alunos | 10% |

Os pesos são configuráveis, mas toda configuração deve possuir versão, vigência e autor. Alterar um slider não recalcula snapshots fechados.

---

## 5. Definição das métricas

### 5.1 Conversão experimental -> matrícula

**Mede:** conversão comercial da experiência conduzida pelo professor.

**Janela:** coorte de experimentais realizadas no trimestre.

**Denominador:** experimentais únicas, confirmadas como realizadas, com professor resolvido.

**Numerador:** matrículas únicas vinculadas àquelas experimentais, realizadas em até 30 dias após a experimental.

**Atribuição:**

- uma matrícula recebe crédito de no máximo uma experimental;
- quando houver mais de uma experimental válida, recebe o crédito a última experimental confirmada anterior à matrícula e dentro dos 30 dias;
- matrícula direta sem experimental não entra;
- falta, cancelamento e agendamento sem presença não entram;
- o professor creditado é quem ministrou a experimental, mesmo que o aluno seja matriculado com outro professor;
- a taxa não pode ultrapassar 100% por construção, sem teto cosmético.

**Base mínima:** 3 experimentais confirmadas no trimestre. Abaixo disso, mostra os valores brutos e fica `sem_base` para pontuação.

### 5.2 Média de alunos por turma

**Mede:** ocupação das turmas regulares elegíveis.

**Fórmula mensal:**

```text
ocupações únicas (pessoa canônica, turma regular)
-------------------------------------------------
turmas regulares elegíveis
```

**Regras:**

- a mesma pessoa duplicada no roster da mesma turma conta uma vez;
- a mesma pessoa em duas turmas regulares conta uma vez em cada turma;
- bandas, projetos e categorias configuradas como não regulares ficam fora;
- não inferir segunda aula ou segundo curso por nome;
- no trimestre, usar a soma das ocupações dos snapshots mensais dividida pela soma das turmas elegíveis dos mesmos snapshots.

### 5.3 Número de alunos

**Mede:** alcance atual da carteira.

**Fórmula mensal:** pessoas canônicas únicas com vínculo ativo com o professor naquela unidade.

**Regras:**

- duas linhas operacionais da mesma pessoa não duplicam a carteira;
- a mesma pessoa pode contar uma vez para professores diferentes;
- no trimestre, usar a média aritmética dos três fechamentos mensais;
- o consolidado entre unidades é recalculado por pessoa e unidade, não pela média dos cards.

### 5.4 Retenção atribuível

**Mede:** capacidade de manter vínculos quando a causa do encerramento é atribuível ao professor.

**Janela:** três meses rolantes encerrados na competência.

**Denominador:** períodos matrícula-disciplina-professor distintos que estiveram ativos por pelo menos um dia na janela.

**Numerador negativo:** períodos encerrados na janela com motivo confirmado e `motivos_saida.conta_score_professor = true`.

**Fórmula:**

```text
100 * (1 - encerramentos_atribuíveis / vínculos_expostos)
```

**Base mínima:** 10 vínculos expostos.

**Regras de atribuição:**

- troca A -> B só reduz A quando o motivo confirmado for atribuível;
- preservar os motivos exatos `Desânimo`, `Desistência` e `Insatisfação`; não colapsar o dado original em texto genérico;
- motivos neutros seguem `motivos_saida.conta_score_professor = false`;
- motivo ausente, ambíguo ou apenas inferido não penaliza e vai para conciliação;
- em uma pessoa com vários vínculos, a penalização alcança somente o vínculo/professor identificado como causa; não se propaga para todos os professores da pessoa;
- saída da escola segue a mesma regra de atribuição por vínculo.

### 5.5 Tempo de permanência com o professor

**Mede:** duração dos períodos pedagógicos efetivamente encerrados.

**Chave:**

```text
unidade_id
+ emusys_matricula_id
+ emusys_matricula_disciplina_id
+ professor_id
+ início do período
```

**Duração:** `(data_fim - data_inicio) / 30,44`, sem arredondar antes da agregação.

**Fórmula:**

```text
soma dos meses dos vínculos encerrados publicáveis
--------------------------------------------------
quantidade de vínculos encerrados publicáveis
```

**Regras:**

- vínculo ativo não entra;
- professor sem encerramentos fica `sem_base`, nunca zero;
- renovação com mesma disciplina e professor mantém continuidade;
- troca real encerra A e inicia B;
- mudança apenas administrativa não encerra;
- substituição isolada não encerra quando o professor principal retorna e a grade corrente confirma sua titularidade;
- quantidade de aulas isoladas é evidência, não regra absoluta: "1-2 aulas" não basta sozinha para classificar substituição;
- exibir sempre média, mediana auxiliar e tamanho da amostra;
- o valor bruto aparece desde o primeiro vínculo encerrado;
- para pontuar, exigir inicialmente pelo menos 3 vínculos encerrados publicáveis.

**Publicabilidade histórica:** somente vínculos de confiança alta ou vínculos revisados e aprovados entram na pontuação. Confiança média e `revisar` permanecem visíveis na auditoria, mas fora do score.

### 5.6 Presença dos alunos

**Vigência:** somente eventos com `data_aula >= 2026-08-03`. Não existe pontuação retroativa.

**Fórmula:**

```text
presentes
------------------------------- * 100
presentes + faltas_confirmadas
```

**Fonte:** camada semântica canônica de presença, nunca `aluno_presenca` bruto.

**Elegibilidade:**

- entram `presente` e `falta_confirmada`;
- ficam fora `falta_provavel`, `indeterminado`, cancelada e justificada;
- o evento deve possuir professor e unidade resolvidos;
- base mínima inicial: 10 eventos aluno-aula elegíveis;
- cobertura mínima inicial: 95% dos eventos esperados do roster no recorte;
- abaixo da base ou cobertura, presença fica `sem_base`.

No trimestre julho-setembro de 2026, a presença usa deliberadamente a janela parcial de 03/08 a 30/09. A interface deve exibir esse recorte.

---

## 6. Normalização para nota 0-100

O Health Score mede atingimento, não posição relativa móvel. Portanto, **não usar percentil da população corrente como nota**: isso faria um professor mudar sem que seu desempenho mudasse e obrigaria sempre alguém a ficar na parte baixa, mesmo quando todos estiverem bem.

### 6.1 Métricas percentuais

- conversão: nota = taxa bruta, limitada ao intervalo 0-100;
- retenção: nota = taxa bruta, limitada ao intervalo 0-100;
- presença: nota = taxa bruta, limitada ao intervalo 0-100.

### 6.2 Métricas com meta

Para média/turma, número de alunos e permanência:

```text
nota = min(100, valor_bruto / meta_versionada * 100)
```

As metas não são segmentadas por instrumento. Os valores iniciais devem ser definidos na simulação em sombra e aprovados pela coordenação antes da virada.

Para evitar meta móvel:

- a simulação pode sugerir uma referência estatística, como P75 ou P90 do baseline;
- depois de aprovada, a meta é congelada na versão da configuração;
- a população do mês corrente nunca redefine automaticamente a meta.

---

## 7. Métrica sem base e cobertura do score

Uma métrica sem base tem valor e nota nulos. Seu peso é retirado temporariamente do denominador.

```text
score = soma(nota_i * peso_i) / soma(pesos_disponíveis)
```

**Cobertura:** soma dos pesos originais das métricas disponíveis.

**Piso inicial de publicação:** 60% de cobertura e pelo menos um pilar de fidelização disponível (`retenção` ou `permanência`). A simulação em sombra deve validar esse piso antes da virada.

Exemplos:

- sem permanência, mas com os demais pilares: cobertura 75%; score pode ser publicado;
- apenas número de alunos e média/turma: cobertura 25%; Health Score geral fica `sem_base`;
- uma métrica ausente nunca recebe zero, 75 ou 100 por padrão.

---

## 8. Histórico e backfill

### 8.1 Coleta

O banco local possui aulas a partir de março de 2026; a API do Emusys devolveu histórico desde 2018 no piloto.

Coletar por unidade e janela temporal, não por aluno:

- `GET /aulas` paginado com `limite=100`;
- uma unidade por vez;
- ritmo conservador de 45-50 requisições/minuto;
- checkpoint por unidade, janela e cursor;
- retry e backoff para timeout, 429 e erros transitórios;
- staging idempotente e separado de `aulas_emusys` produtiva;
- nunca escrever em `anotacoes_fabio`.

### 8.2 Reconstrução

Agrupar por unidade, matrícula e matrícula-disciplina; resolver professor por ID Emusys; deduplicar aula de turma; ordenar cronologicamente; formar períodos contínuos; confrontar com matrícula atual, grade futura e webhooks.

**Confiança é por vínculo, não por data:**

- `alta`: identificadores completos, sequência coerente e sem conflito;
- `media`: reconstrução consistente com algum fallback, ainda não pontuável;
- `revisar`: sobreposição, identidade conflitante, lacuna ou titularidade ambígua;
- `revisado_aprovado`: decisão humana auditada; pontuável.

A cobertura baixa de `matricula_disciplina_id` no banco local de março-maio é diagnóstico do sync antigo, não proibição definitiva. O GET atual trouxe o identificador em 1.513 de 1.515 aulas do piloto, inclusive históricas.

### 8.3 Piloto

Amostra estratificada das três unidades contendo:

- veteranos ativos;
- evadidos e inativos;
- segundo curso e disciplinas simultâneas;
- troca conhecida;
- substituição conhecida;
- professor inativo ou com vínculo histórico em unidade encerrada;
- caso ambíguo para testar conciliação.

CSV é fonte de conciliação residual, não fonte primária.

---

## 9. Dados e auditoria necessários

### 9.1 Camada histórica nova

Criar camada canônica própria para períodos professor-matrícula-disciplina, sem reaproveitar tabela legada genérica.

Campos mínimos:

- unidade, pessoa/aluno canônico;
- IDs Emusys de matrícula, matrícula-disciplina e professor;
- professor local;
- curso/disciplina;
- início, fim e duração;
- estado ativo/encerrado;
- motivo e atribuição de retenção;
- fonte, confiança, evidências e versão da reconstrução;
- revisão humana e trilha de auditoria.

### 9.2 Transições futuras

Ampliar `aluno_professor_transicoes` para guardar referência a `motivos_saida`, confirmação, atribuição, fonte, revisor e data de revisão. O webhook continua não bloqueante.

### 9.3 Configuração e snapshots

Criar configuração V3 versionada e snapshots imutáveis contendo:

- professor e unidade;
- competência e trimestre;
- valores brutos e amostras;
- notas normalizadas;
- pesos disponíveis e cobertura;
- score final e classificação;
- versão das regras, metas, pesos e fontes;
- confiança e motivos de não publicação.

---

## 10. Unidade e consolidado

O score primário é `professor + unidade + competência`.

No consolidado:

- reunir os eventos e vínculos das unidades;
- deduplicar apenas dentro do grão de cada métrica;
- recalcular cada valor bruto;
- normalizar e aplicar pesos depois;
- nunca calcular média simples dos scores unitários.

---

## 11. Compatibilidade e consumidores

Durante a sombra:

- V2 continua alimentando cards, rankings e relatórios atuais;
- V3 usa RPCs e tabelas com nomes próprios;
- nenhuma Edge Function atual troca de fonte;
- churn/Random Forest permanece pausado e fora do escopo;
- `aluno_presenca` bruto não é alterado;
- relatórios gerencial, administrativo e comercial não mudam por causa da V3;
- relatórios de professor só migram após homologação.

Antes da virada, inventariar e testar:

- Gestão de Professores: Performance, card individual, carteira e configurações;
- Dashboard e Analytics de professores;
- relatório individual do professor;
- relatório da coordenação;
- insights de equipe/professor;
- consumidores do Fábio e LA Teacher autorizados.

---

## 12. Testes obrigatórios

1. Pessoa com duas matrículas e professores diferentes.
2. Duas disciplinas na mesma matrícula.
3. Renovação sem troca de professor.
4. Troca real com motivo atribuível.
5. Troca neutra e motivo desconhecido.
6. Substituição curta seguida do retorno do titular.
7. Professor inativo preservado historicamente sem voltar à carteira.
8. Conversão após virar o mês, dentro de 30 dias.
9. Duas experimentais para uma matrícula sem crédito duplicado.
10. Professor abaixo das bases mínimas.
11. Redistribuição de pesos e cobertura inferior a 60%.
12. Presença antes e depois de 03/08/2026.
13. Presença com cobertura inferior a 95%.
14. Professor multiunidade e consolidado recalculado.
15. Alteração de peso sem reescrever snapshot fechado.
16. V2 e relatórios não relacionados permanecem idênticos durante a sombra.
17. Ranking V3 confrontado com junho/julho e, para presença, agosto/setembro.

---

## 13. Rollout

1. Fechar SPEC técnica e migrations aditivas.
2. Criar staging e coletor histórico retomável.
3. Executar piloto e conciliar ambiguidades.
4. Construir camada histórica canônica.
5. Criar motor V3, configurações e snapshots.
6. Executar V3 em sombra sem consumidores produtivos.
7. Calibrar metas de média/turma, alunos e permanência.
8. Comparar V2 x V3 com Quintela, Juliana e direção.
9. Auditar segurança, RLS, grants e desempenho.
10. Migrar consumidores um por vez com rollback.
11. Congelar a versão homologada e só então desativar a publicação V2.

---

## 14. Critérios para virada

A V3 só pode substituir a V2 quando:

- piloto histórico estiver aprovado;
- metas versionadas estiverem aprovadas;
- pesos e piso de cobertura estiverem homologados;
- motivos desconhecidos não forem penalizados;
- presença desde 03/08 atingir base e cobertura definidas;
- rankings forem validados pela coordenação;
- consumidores estiverem inventariados e testados;
- comparação provar ausência de regressão nos relatórios não relacionados;
- houver rollback documentado.

Até lá, qualquer número V3 deve estar identificado como **sombra / não oficial**.
