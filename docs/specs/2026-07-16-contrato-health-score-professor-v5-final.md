# Contrato Canonico - Health Score do Professor V3

**Revisao do contrato:** V5 final
**Data:** 2026-07-16
**Autoridade:** substitui os contratos V3 e V4 como referencia funcional e tecnica
**Status:** aprovado para elaboracao da SPEC e implementacao em sombra; nao aprovado para virada em producao
**Ciclo oficial:** trimestral, com fechamento e snapshots mensais
**Inicio da presenca pontuavel:** 03/08/2026
**Escopo:** desempenho do professor no LA Report, relatorios da coordenacao e futuros consumidores autorizados do LA Teacher e do Fabio

---

## 1. Objetivo

Construir o Health Score do Professor V3 como uma camada nova, canonica, auditavel e versionada.

O novo motor deve:

- medir resultados pedagogicos e comerciais sem misturar pessoa, matricula, disciplina, turma ou unidade;
- eliminar a dupla penalizacao de evasao existente na V2;
- retirar crescimento e fator de demanda do score;
- representar falta de base como `null`/`sem_base`, nunca como zero fabricado;
- preservar valores brutos, amostras, fontes, confianca e versao das regras;
- manter a V2 intacta durante toda a implementacao em sombra;
- impedir que alteracoes futuras de peso ou meta reescrevam competencias fechadas;
- permitir auditoria humana antes de qualquer publicacao oficial.

O Health Score nao substitui a leitura individual da coordenacao nem o Programa de Desenvolvimento Individual. Ele organiza evidencia; nao transforma contexto pedagogico em julgamento automatico.

---

## 2. Fora de escopo

Este contrato nao autoriza:

- alterar o pipeline de churn/Random Forest;
- reativar professores ou vinculos de unidade apenas para resolver identidade historica;
- migrar ou apagar tabelas legadas;
- alterar relatorios gerencial, administrativo ou comercial;
- escrever no dado bruto de presenca;
- usar `aulas_emusys.professor_presenca = 'ausente'` como falta do professor;
- escrever em `aulas_emusys.anotacoes_fabio` durante sync ou backfill;
- virar cards, rankings ou relatorios produtivos para a V3 antes da homologacao.

---

## 3. Principios canonicos

1. **Pessoa nao e matricula.** Uma pessoa pode possuir mais de uma matricula ou disciplina.
2. **Matricula nao e disciplina.** Uma matricula pode conter disciplinas simultaneas.
3. **Professor e avaliado por unidade.** O consolidado e recalculado com os eventos das unidades, nunca pela media dos scores unitarios.
4. **Identidade Emusys e escopada por unidade.** Nenhum ID Emusys isolado e universal.
5. **Ausencia de base nao e zero.** Metrica sem base tem valor e nota nulos.
6. **Evento desconhecido nao penaliza.** Motivo ausente ou ambiguo vai para conciliacao.
7. **Historico inferido nao vira fato silenciosamente.** Toda reconstrucao possui fonte, evidencia e confianca.
8. **Vinculo ativo e vinculo encerrado sao conceitos diferentes.** Permanencia usa encerrados; carteira usa ativos.
9. **Configuracao e temporal.** Peso, meta, faixa e fonte possuem versao e vigencia.
10. **Snapshot fechado e imutavel.** Mudancas posteriores valem somente para competencias futuras.

---

## 4. Grao oficial por metrica

| Metrica | Grao oficial |
|---|---|
| Numero de alunos | pessoa canonica na carteira do professor e unidade |
| Media de alunos por turma | ocupacao unica `(pessoa canonica, turma regular)` |
| Conversao | experimental unica confirmada e matricula unica vinculada |
| Retencao | periodo matricula-disciplina-professor exposto na janela |
| Permanencia | periodo matricula-disciplina-professor encerrado |
| Presenca | evento aluno-aula elegivel atribuido ao professor |

Consequencias obrigatorias:

- uma pessoa em Bateria com Peterson e Guitarra com Jeyson gera dois vinculos pedagogicos independentes;
- a pessoa conta uma vez na carteira de cada professor;
- dois cursos com o mesmo professor contam uma pessoa em `Numero de alunos`, mas mantem dois historicos de retencao e permanencia;
- a mesma pessoa na mesma turma conta uma ocupacao, ainda que existam linhas operacionais duplicadas;
- a mesma pessoa em duas turmas regulares conta uma ocupacao em cada turma;
- disciplinas simultaneas sao separadas por `unidade_id + emusys_matricula_disciplina_id`;
- renovacao administrativa sem troca pedagogica nao encerra o vinculo.

---

## 5. Pilares e pesos iniciais

| Pilar | Peso inicial |
|---|---:|
| Retencao atribuivel | 25% |
| Tempo de permanencia com o professor | 25% |
| Conversao experimental -> matricula | 15% |
| Media de alunos por turma | 15% |
| Numero de alunos | 10% |
| Presenca dos alunos | 10% |

Os pesos sao configuraveis, mas cada configuracao deve registrar versao, vigencia, autor e justificativa. Alterar um slider nao recalcula snapshots fechados.

---

## 6. Definicao das metricas

### 6.1 Conversao experimental -> matricula

**Mede:** conversao comercial da experiencia conduzida pelo professor.

**Coorte:** experimentais realizadas no trimestre.

**Denominador:** experimentais unicas confirmadas como realizadas, com professor e unidade resolvidos.

**Numerador:** matriculas unicas vinculadas aquelas experimentais e realizadas em ate 30 dias corridos depois da experimental.

**Formula:**

```text
100 * matriculas_unicas_vinculadas / experimentais_unicas_confirmadas
```

**Atribuicao:**

- cada matricula recebe credito de no maximo uma experimental;
- havendo mais de uma experimental valida, recebe o credito a ultima experimental confirmada anterior a matricula e dentro dos 30 dias;
- matricula direta sem experimental nao entra no numerador nem e atribuida artificialmente;
- falta, cancelamento e agendamento sem presenca nao entram no denominador;
- o professor creditado e quem ministrou a experimental, mesmo que o aluno seja matriculado com outro professor;
- a taxa deve ser naturalmente limitada a 100% pela unicidade do vinculo, sem teto cosmetico.

**Base minima:** 3 experimentais confirmadas no trimestre. Abaixo disso, valores brutos continuam visiveis, mas valor pontuavel e nota ficam `sem_base`.

**Maturacao do trimestre:** experimentais dos ultimos 30 dias do trimestre continuam `em_maturacao`. O resultado trimestral de conversao so e congelado 30 dias apos o ultimo dia do trimestre. Antes disso, snapshots mensais sao provisórios e identificados como tal.

### 6.2 Media de alunos por turma

**Mede:** ocupacao das turmas regulares elegiveis.

**Formula mensal:**

```text
ocupacoes_unicas (pessoa_canonica, turma_regular)
------------------------------------------------
turmas_regulares_elegiveis
```

**Regras:**

- deduplicar a mesma pessoa dentro da mesma turma;
- contar a mesma pessoa uma vez em cada turma regular diferente;
- bandas, projetos e categorias configuradas como nao regulares ficam fora;
- nao inferir segundo curso, segunda aula ou ocupacao por nome;
- turma elegivel sem alunos produz ocupacao zero valida;
- professor sem turma regular elegivel fica `sem_base`, nao zero.

**Agregacao trimestral:**

```text
soma das ocupacoes dos tres snapshots mensais
------------------------------------------------
soma das turmas elegiveis dos tres snapshots
```

Nao calcular a media simples das tres medias mensais. Se um snapshot mensal estiver ausente por falha tecnica, a metrica fica pendente ate reconstrucao auditada; nao imputar valor.

### 6.3 Numero de alunos

**Mede:** alcance da carteira ativa do professor.

**Formula mensal:** pessoas canonicas unicas com vinculo ativo com o professor naquela unidade no fechamento da competencia.

**Regras:**

- duas linhas operacionais da mesma pessoa nao duplicam a carteira;
- a mesma pessoa pode contar uma vez para professores diferentes;
- professor ativo na unidade e com carteira vazia possui valor bruto zero valido;
- vinculo historico nao reativa professor ou unidade atual.

**Agregacao trimestral:** media aritmetica dos tres fechamentos mensais. Snapshot ausente deve ser reconstruido e auditado; nao substituir silenciosamente por zero nem calcular com dois meses.

### 6.4 Retencao atribuivel

**Mede:** capacidade de manter vinculos quando o encerramento foi confirmado como atribuivel ao professor.

**Janela:** tres meses rolantes encerrados na competencia.

**Denominador:** periodos matricula-disciplina-professor distintos que estiveram ativos por pelo menos um dia na janela.

**Numerador negativo:** periodos encerrados na janela com motivo confirmado e `motivos_saida.conta_score_professor = true`.

**Formula:**

```text
100 * (1 - encerramentos_atribuiveis / vinculos_expostos)
```

**Base minima:** 10 vinculos expostos.

**Regras de atribuicao:**

- troca A -> B so reduz a retencao de A quando o motivo confirmado for atribuivel;
- preservar os motivos exatos `Desanimo`, `Desistencia` e `Insatisfacao` nos relatorios;
- motivos neutros seguem `motivos_saida.conta_score_professor = false`;
- motivo ausente, ambiguo ou inferido nao penaliza e vai para conciliacao;
- a causa de uma matricula-disciplina nao se propaga para outros vinculos da mesma pessoa;
- saida da escola segue a mesma atribuicao por vinculo;
- aviso previo, trancamento e mudanca administrativa nao viram evasao automaticamente.

### 6.5 Tempo de permanencia com o professor

**Mede:** duracao dos periodos pedagogicos efetivamente encerrados.

**Chave do periodo:**

```text
unidade_id
+ emusys_matricula_id
+ emusys_matricula_disciplina_id
+ professor_id
+ data_inicio_periodo
```

**Duracao:** `(data_fim - data_inicio) / 30,44`, sem arredondar antes da agregacao.

**Formula:**

```text
soma dos meses dos vinculos encerrados elegiveis e publicaveis
----------------------------------------------------------------
quantidade de vinculos encerrados elegiveis e publicaveis
```

**Regras:**

- vinculo ativo nao entra no calculo;
- professor sem encerramentos fica `sem_base`, nunca zero;
- renovacao com mesma disciplina e professor mantem continuidade;
- troca real encerra A e inicia B;
- mudanca apenas administrativa nao encerra;
- substituicao isolada nao encerra quando o professor principal retorna e a grade corrente confirma sua titularidade;
- uma ou duas aulas sao evidencia de substituicao, nunca criterio isolado definitivo;
- o vinculo encerrado precisa possuir duracao de pelo menos 4 meses para entrar na media e na pontuacao;
- vinculo encerrado com menos de 4 meses permanece no historico com `elegivel_permanencia = false`, sem prejudicar o professor;
- a elegibilidade usa a duracao precisa em dias dividida por 30,44, sem arredondamento anterior ao corte de 4 meses;
- exibir media, mediana auxiliar e tamanho da amostra;
- valor bruto aparece a partir do primeiro vinculo encerrado elegivel e publicavel;
- pontuacao exige inicialmente pelo menos 3 vinculos encerrados elegiveis e publicaveis.

**Publicabilidade historica:** entram na pontuacao apenas vinculos de confianca `alta` ou `revisado_aprovado`. Confianca `media` e `revisar` ficam visiveis na auditoria, fora do score.

**Fundamento da regra de 4 meses:** aplica o mesmo principio vigente no tempo de permanencia da escola. Em 16/07/2026, a definicao remota de `get_historico_ltv` foi auditada e confirmou `tempo_permanencia_meses >= 4`; `get_tempo_permanencia` apenas agrega essa base. A V3 reaplica o corte no grao correto professor-matricula-disciplina, sem consumir essas RPCs legadas como fonte do novo indicador.

### 6.6 Presenca dos alunos

**Vigencia:** somente eventos com `data_aula >= 2026-08-03`. Nao existe pontuacao retroativa.

**Formula:**

```text
100 * presentes / (presentes + faltas_confirmadas)
```

**Fonte:** camada semantica canonica de presenca. E proibido calcular este pilar diretamente de `aluno_presenca` bruto.

**Elegibilidade:**

- entram `presente` e `falta_confirmada`;
- ficam fora `falta_provavel`, `indeterminado`, cancelada e justificada;
- o evento deve possuir professor e unidade resolvidos;
- o roster deve ser deduplicado no grao aluno-aula;
- base minima: 10 eventos aluno-aula elegiveis;
- cobertura minima: 95% dos eventos esperados do roster no recorte;
- abaixo da base ou cobertura, presenca fica `sem_base`.

**Cobertura:**

```text
eventos_semanticos_classificados_elegiveis
-----------------------------------------
eventos_esperados_do_roster
```

No trimestre julho-setembro de 2026, a presenca usa a janela parcial de 03/08 a 30/09. A interface e o relatorio devem mostrar explicitamente esse recorte.

---

## 7. Normalizacao para nota 0-100

O Health Score mede atingimento absoluto, nao posicao relativa movel. Percentil da populacao corrente nao pode ser usado como nota.

### 7.1 Metricas percentuais

- conversao: nota = taxa bruta entre 0 e 100;
- retencao: nota = taxa bruta entre 0 e 100;
- presenca: nota = taxa bruta entre 0 e 100.

### 7.2 Metricas com meta

Para media/turma, numero de alunos e permanencia:

```text
nota = min(100, valor_bruto / meta_versionada * 100)
```

As metas nao sao segmentadas por instrumento. A simulacao em sombra pode sugerir P75 ou P90 como referencia de calibracao, mas a coordenacao aprova o valor e ele fica congelado na configuracao. A populacao do mes corrente nunca altera a meta automaticamente.

### 7.3 Classificacao inicial

Enquanto a coordenacao nao homologar novas faixas, preservar as faixas atuais como configuracao inicial versionada:

- `saudavel`: score >= 70;
- `atencao`: score >= 50 e < 70;
- `critico`: score < 50;
- `sem_base`: requisitos de publicacao nao atendidos.

Mudar uma faixa cria nova versao com vigencia futura; nao reclassifica snapshots encerrados.

---

## 8. Metrica sem base e cobertura do score

Uma metrica sem base possui valor pontuavel e nota nulos. Seu peso e retirado temporariamente do denominador.

```text
score = soma(nota_i * peso_i) / soma(pesos_disponiveis)
```

**Cobertura:** soma dos pesos originais das metricas disponiveis.

**Piso inicial de publicacao:**

- cobertura minima de 60%; e
- pelo menos um pilar de fidelizacao disponivel: retencao ou permanencia.

Exemplos:

- sem permanencia, com todos os demais pilares: cobertura 75%, publicavel;
- somente numero de alunos e media/turma: cobertura 25%, Health Score `sem_base`;
- metrica ausente nunca recebe 0, 75 ou 100 por padrao.

---

## 9. Fechamentos, snapshots e temporalidade

O motor calcula mensalmente e avalia trimestralmente.

Cada snapshot deve registrar:

- professor, unidade, competencia e trimestre;
- valores brutos, numeradores, denominadores e amostras;
- estado de base de cada metrica;
- notas normalizadas;
- pesos disponiveis e cobertura;
- score final e classificacao;
- versao de regra, fonte, meta, peso e faixa;
- confianca e motivo de nao publicacao;
- estado `provisorio`, `em_maturacao`, `fechado` ou `invalidado`.

Regras:

- fechamento mensal nao oscila em tempo real;
- snapshot fechado e imutavel;
- correcao de dado historico gera nova revisao auditada, sem apagar a anterior;
- conversao trimestral so fecha apos a maturacao de 30 dias;
- uma nova versao de pesos ou metas vale para competencias futuras;
- nenhuma interface produtiva consome snapshot `provisorio` como oficial.

---

## 10. Fontes canonicas e fontes proibidas

### 10.1 Fontes de entrada

| Necessidade | Fonte canonica ou camada de origem |
|---|---|
| Identidade da pessoa por unidade | `vw_aluno_identidade_unidade_canonica` |
| Carteira por pessoa | camada canonica de carteira do professor, derivada da identidade e dos vinculos ativos |
| Jornada atual | `aluno_jornada_matricula_disciplina` |
| Aulas e agenda | `aulas_emusys` |
| Roster | `aula_alunos_emusys` |
| Presenca pedagogica | `vw_aluno_presenca_semantica_v1` |
| Evidencia bruta de presenca | `aluno_presenca`, apenas para auditoria |
| Experimentais | camada canonica de experimental confirmada e vinculada |
| Motivos de saida | `motivos_saida` |
| Movimentacoes administrativas | `movimentacoes_admin` |
| Trocas de professor | `aluno_professor_transicoes` |
| Historico professor-matricula-disciplina | nova camada canonica de periodos definida neste contrato |

Nomes de views/RPCs novas devem ser versionados. O contrato define semantica; a SPEC definira os nomes fisicos finais.

### 10.2 Fontes que nao podem orientar a V3

- `alunos.professor_atual_id` isolado para carteira historica;
- `alunos.percentual_presenca`;
- `aluno_presenca` bruto como resultado pedagogico;
- `aulas_emusys.professor_presenca` como metrica de RH;
- tabela `movimentacoes` legada;
- tabela `renovacoes` legada;
- nome de aluno ou professor como identidade definitiva;
- RPC V2/legada com `COALESCE(..., 0)` fabricando indicador;
- score ou media de cards unitarios como consolidado.

---

## 11. Historico e backfill

### 11.1 Coleta

O banco local possui aulas principalmente a partir de marco de 2026. O piloto da API Emusys devolveu historico desde 2018 e trouxe `matricula_disciplina_id` em 1.513 de 1.515 aulas consultadas.

Coletar por unidade e janela temporal, nunca por uma chamada para cada aluno:

- `GET /aulas` paginado com `limite=100`;
- uma unidade por vez;
- ritmo conservador de 45-50 requisicoes por minuto;
- checkpoint por unidade, janela e cursor;
- retry e backoff para timeout, 429 e falhas transitorias;
- staging idempotente e separado de `aulas_emusys` produtiva;
- payload bruto com hash e data de coleta;
- nunca escrever em `anotacoes_fabio`.

### 11.2 Reconstrucao

Agrupar por unidade, matricula e matricula-disciplina; resolver professor por ID Emusys; deduplicar eventos de turma; ordenar cronologicamente; formar periodos continuos; confrontar com matricula atual, grade futura e webhooks.

**Confianca por vinculo:**

- `alta`: identificadores completos, sequencia coerente e sem conflito;
- `media`: reconstrucao consistente com fallback, ainda nao pontuavel;
- `revisar`: sobreposicao, identidade conflitante, lacuna ou titularidade ambigua;
- `revisado_aprovado`: decisao humana auditada e pontuavel.

Confianca e definida pela evidencia do vinculo, nunca por corte fixo de data.

### 11.3 Piloto

O piloto deve conter representantes das tres unidades e incluir:

- veteranos ativos;
- evadidos e inativos;
- segundo curso e disciplinas simultaneas;
- troca conhecida;
- substituicao conhecida;
- professor inativo ou com vinculo historico em unidade encerrada;
- caso ambiguo para conciliacao.

CSV e fonte residual de conciliacao, nao fonte primaria.

---

## 12. Camadas novas e auditoria

### 12.1 Historico professor-matricula-disciplina

Criar camada canonica propria para periodos pedagogicos, sem reutilizar tabela legada generica.

Campos conceituais minimos:

- unidade e pessoa/aluno canonico;
- IDs Emusys de matricula, matricula-disciplina e professor;
- professor local;
- curso/disciplina;
- inicio, fim e duracao;
- estado ativo ou encerrado;
- motivo e atribuicao de retencao;
- fonte, confianca, evidencias e versao da reconstrucao;
- revisao humana e trilha de auditoria.

### 12.2 Transicoes futuras

Ampliar `aluno_professor_transicoes` de forma aditiva para guardar:

- referencia a `motivos_saida`;
- confirmacao e atribuicao;
- fonte;
- revisor;
- data da revisao.

O webhook permanece nao bloqueante. Falha no enriquecimento nunca impede a jornada atual de apontar para o professor novo.

### 12.3 Configuracao

A configuracao V3 deve versionar:

- pesos;
- metas;
- bases minimas;
- faixas de classificacao;
- vigencia;
- autor e justificativa;
- versoes das fontes e formulas.

---

## 13. Unidade e consolidado

O score primario possui grao `professor + unidade + competencia`.

No consolidado:

- reunir eventos e vinculos das unidades;
- deduplicar dentro do grao de cada metrica;
- recalcular cada valor bruto;
- aplicar normalizacao e pesos somente depois;
- nunca usar media simples dos scores unitarios;
- manter rastreabilidade ate os componentes por unidade.

---

## 14. Seguranca e acesso

As novas tabelas, views e RPCs devem:

- nascer sem `EXECUTE` ou `SELECT` para `public`/`anon`;
- usar RLS e escopo por unidade e papel;
- permitir coordenacao apenas nas unidades autorizadas;
- permitir professor apenas na propria carteira quando houver consumo pelo LA Teacher;
- usar `security_invoker` em views sempre que aplicavel;
- usar `security definer` somente com guard explicito e `search_path` fixo;
- nao expor dados financeiros ao LA Teacher/Fabio;
- registrar alteracoes de configuracao e revisoes humanas;
- evitar payload pessoal bruto em logs de erro.

---

## 15. Compatibilidade e consumidores

Durante a sombra:

- V2 continua alimentando cards, rankings e relatorios atuais;
- V3 usa tabelas, views, RPCs e snapshots proprios;
- nenhuma Edge Function produtiva troca de fonte;
- churn/Random Forest permanece pausado e fora do escopo;
- `aluno_presenca` bruto nao e alterado;
- relatorios gerencial, administrativo e comercial permanecem inalterados;
- relatorios de professor so migram depois da homologacao.

Consumidores a inventariar e migrar individualmente:

- Gestao de Professores: Performance, card individual, carteira e configuracoes;
- Dashboard e Analytics de professores;
- relatorio individual do professor;
- relatorio da coordenacao;
- insights de equipe/professor;
- consumidores autorizados do Fabio e LA Teacher.

Cada migracao exige teste comparativo e rollback independente.

---

## 16. Testes obrigatorios

1. Pessoa com duas matriculas e professores diferentes.
2. Duas disciplinas na mesma matricula.
3. Duas linhas da mesma pessoa na mesma turma sem ocupacao duplicada.
4. Mesma pessoa em duas turmas regulares contando uma vez em cada.
5. Renovacao sem troca de professor.
6. Troca real com motivo atribuivel.
7. Troca neutra e motivo desconhecido.
8. Causa de um vinculo nao contaminando os demais vinculos da pessoa.
9. Substituicao curta seguida do retorno do titular.
10. Professor inativo preservado historicamente sem reativacao.
11. Conversao depois da virada do mes e dentro de 30 dias.
12. Experimental no fim do trimestre aguardando maturacao de 30 dias.
13. Duas experimentais para uma matricula sem credito duplicado.
14. Matricula direta sem experimental fora da conversao.
15. Professor abaixo das bases minimas.
16. Vinculo encerrado com menos de 4 meses preservado no historico e excluido da permanencia.
17. Permanencia com uma amostra elegivel exibida, mas sem pontuacao.
18. Redistribuicao de pesos e cobertura inferior a 60%.
19. Ausencia dos dois pilares de fidelizacao bloqueando publicacao.
20. Presenca antes e depois de 03/08/2026.
21. Presenca com menos de 10 eventos.
22. Presenca com cobertura inferior a 95%.
23. Professor multiunidade e consolidado recalculado.
24. Alteracao de peso sem reescrever snapshot fechado.
25. Snapshot mensal ausente sem imputacao silenciosa.
26. Usuario anonimo e professor de outra carteira sem acesso.
27. V2 e relatorios nao relacionados identicos durante a sombra.
28. Ranking V3 confrontado com junho/julho e, para presenca, agosto/setembro.

---

## 17. Rollout

1. Aprovar este contrato como referencia unica.
2. Elaborar SPEC tecnica e plano de migrations aditivas.
3. Inventariar consumidores V2 e estabelecer testes de nao regressao.
4. Criar staging e coletor historico retomavel.
5. Executar piloto e conciliar ambiguidades.
6. Construir camada historica canonica.
7. Criar motor V3, configuracoes e snapshots.
8. Executar V3 em sombra sem consumidores produtivos.
9. Calibrar metas de media/turma, alunos e permanencia.
10. Comparar V2 x V3 com Quintela, Juliana e direcao.
11. Auditar seguranca, RLS, grants, desempenho e idempotencia.
12. Migrar consumidores um por vez com rollback.
13. Congelar a versao homologada.
14. Desativar a publicacao V2 somente depois da virada completa.

---

## 18. Criterios para virada

A V3 so pode substituir a V2 quando:

- piloto historico estiver aprovado;
- metas versionadas estiverem aprovadas;
- pesos, faixas e piso de cobertura estiverem homologados;
- motivos desconhecidos nao forem penalizados;
- presenca desde 03/08 atingir base e cobertura definidas;
- conversao do trimestre estiver maturada;
- rankings forem validados pela coordenacao;
- consumidores estiverem inventariados e testados;
- seguranca e escopo por unidade estiverem validados;
- comparacao provar ausencia de regressao nos relatorios nao relacionados;
- houver rollback documentado e testado.

Até essa virada, todo numero V3 deve estar identificado como **sombra / nao oficial**.

---

## 19. Decisao final

Este documento e a referencia unica para a SPEC do Health Score do Professor V3.

Os contratos anteriores permanecem apenas como trilha historica. Em caso de divergencia, prevalece esta revisao V5.

Nenhuma implementacao produtiva esta autorizada por este contrato. O proximo artefato obrigatorio e a SPEC tecnica, seguida do plano de implementacao em sombra.
