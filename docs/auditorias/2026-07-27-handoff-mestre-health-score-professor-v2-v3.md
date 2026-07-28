# Handoff Mestre - Health Score do Professor V2 -> V3

**Data:** 2026-07-27  
**Repositorio:** `D:\2026\LA-performance-report`  
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`  
**Baseline local auditado:** `main`, commit `2a077f6`  
**Status:** consolidacao tecnica e funcional para Claude Code, Alfredo, Alf e Codex  
**Escopo:** Health Score do Professor, metricas pedagogicas, configuracao, fontes canonicas, consumidores, rollout, riscos e proximos passos  
**Nao autoriza por si so:** novas migrations, mudanca de dados, ativacao de ranking, premiacao ou alteracao silenciosa de snapshots fechados

---

## 1. Objetivo deste documento

Este documento e a porta de entrada unica para entender a migracao do Health Score do Professor V2 para a V3.

Ele existe para evitar quatro problemas:

1. usar documentos historicos como se ainda fossem a regra vigente;
2. reconstruir regras ja decididas ou consumir fontes legadas;
3. tratar um numero parcial como resultado oficial;
4. corrigir um consumidor isolado e criar divergencia em cards, graficos, relatorios, agentes ou aplicativos.

O documento consolida:

- por que a V2 foi substituida;
- qual e o contrato aprovado da V3;
- como cada um dos seis pilares e calculado;
- quais fontes sao canonicas e quais sao proibidas;
- como foi reconstruido o historico professor-aluno;
- como funcionam configuracoes globais e metas segmentadas;
- quais gates foram executados;
- quais consumidores ja foram migrados;
- o estado vivo observado em 27/07/2026;
- o novo achado sobre injustica no score parcial;
- as decisoes aprovadas pelo Alf em 27/07;
- o que ainda precisa ser decidido e implementado.

---

## 2. Como ler este handoff

As marcacoes abaixo possuem significado normativo:

- **REGRA VIGENTE:** regra aprovada e que deve orientar implementacoes novas.
- **HISTORICO:** explica uma decisao anterior, mas nao deve ser usada como autoridade atual.
- **IMPLEMENTADO:** existe em codigo ou banco.
- **HOMOLOGADO:** alem de implementado, foi confrontado em consumidor ou dado real.
- **ACHADO REABERTO:** comportamento implementado que voltou para revisao por evidencia nova.
- **DECISAO APROVADA EM 27/07:** decisao funcional aceita pelo Alf e ainda possivelmente pendente de implementacao.
- **EM DISCUSSAO:** nao inventar regra nem executar mudanca definitiva.

### 2.1 Uma ambiguidade importante

Existem dois usos diferentes da palavra "versao":

- **Health Score V2/V3:** geracoes do produto e do contrato de negocio.
- **Configuracao V1/V2/V3:** revisoes temporais das metas e pesos dentro do motor V3.

Portanto, uma linha chamada "configuracao V2 ativa" no banco nao significa que o produto voltou ao Health Score V2 legado.

---

## 3. Pacote recomendado de leitura

### 3.1 Pacote minimo

Quem precisa entender o estado atual deve ler, nesta ordem:

1. Este handoff mestre  
   `docs/auditorias/2026-07-27-handoff-mestre-health-score-professor-v2-v3.md`

2. Contrato funcional final  
   `docs/specs/2026-07-16-contrato-health-score-professor-v5-final.md`

3. SPEC tecnica  
   `docs/specs/2026-07-16-health-score-professor-v3-spec-tecnica.md`

4. Plano de implementacao  
   `docs/superpowers/plans/2026-07-16-health-score-professor-v3-implementation.md`

5. Metas segmentadas por unidade, curso e modalidade  
   `docs/superpowers/specs/2026-07-19-health-score-v3-metas-segmentadas-design.md`

6. Catalogo Emusys e vinculos pedagogicos  
   `docs/superpowers/specs/2026-07-20-health-score-v3-catalogo-emusys-e-configuracao-segmentada-design.md`

7. Homologacao dos consumidores  
   `docs/auditorias/2026-07-22-health-score-v3-consumidores-homologacao.md`

8. Handoff LA Teacher, Fabio e presenca  
   `docs/auditorias/2026-07-22-handoff-health-score-v3-la-teacher-fabio-presenca.md`

### 3.2 Pacote expandido de auditoria

Para revisar a execucao por gate:

- `docs/auditorias/2026-07-15-contrato-canonico-pedagogico-execucao.md`
- `docs/auditorias/2026-07-16-health-score-professor-v3-fases-0-1-execucao.md`
- `docs/auditorias/2026-07-16-health-score-professor-v3-piloto.md`
- `docs/auditorias/2026-07-16-health-score-professor-v3-escala-completa.md`
- `docs/auditorias/2026-07-17-health-score-professor-v3-gate-3.md`
- `docs/auditorias/2026-07-17-health-score-professor-v3-gate-4.md`
- `docs/auditorias/2026-07-17-health-score-professor-v3-gate-5.md`
- `docs/auditorias/2026-07-18-health-score-professor-v3-conversao-trimestral.md`
- `docs/auditorias/2026-07-18-health-score-professor-v3-gate-6-sombra.md`
- `docs/auditorias/2026-07-18-health-score-professor-v3-gate-7-configuracao-governada.md`
- `docs/auditorias/2026-07-18-health-score-professor-v3-gate-8-modal-individual.md`
- `docs/auditorias/2026-07-19-health-score-professor-v3-cutover-parcial.md`
- `docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-baseline.md`
- `docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-simulacao.md`
- `docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-seguranca.md`
- `docs/auditorias/2026-07-19-health-score-v3-metas-segmentadas-e2e.md`
- `docs/auditorias/2026-07-21-jornada-curso-grade-canonica.md`
- `docs/auditorias/2026-07-21-professor-curso-modalidade-excecoes-reais.md`

### 3.3 Documento somente historico

`docs/HEALTH-SCORE-V2.md` explica o motor anterior. Ele e util para entender o que foi substituido, mas nao e fonte normativa para codigo novo.

---

## 4. Resumo executivo

O Health Score V3 foi criado como uma camada nova, versionada, auditavel e inicialmente executada em sombra.

Ele substitui a composicao da V2 por seis pilares:

| Pilar | Peso inicial |
|---|---:|
| Retencao atribuivel | 25% |
| Permanencia com o professor | 25% |
| Conversao experimental -> matricula | 15% |
| Media de alunos por turma | 15% |
| Numero de alunos | 10% |
| Presenca dos alunos | 10% |

Os principais ganhos estruturais ja implementados sao:

- separacao entre pessoa, matricula, disciplina, turma, professor e unidade;
- historico professor-matricula-disciplina reconstruido desde 2018;
- permanencia calculada com o professor, nao apenas com a escola;
- ausencia de base representada por `null/sem_base`, nao por zero;
- metas e pesos separados;
- configuracao por rascunho, simulacao e ativacao;
- metas de carteira e turma segmentadas por unidade, curso e modalidade;
- snapshots versionados;
- consumidores migrados individualmente;
- rollback por consumidor;
- ranking e premiacao reservados ao fechamento oficial.

### 4.1 Estado atual

**IMPLEMENTADO E HOMOLOGADO PARCIALMENTE:** o V3 ja aparece em Performance, modal, carteira, Dashboard, Analytics e relatorios, sempre com semantica parcial/oficial controlada.

**ACHADO REABERTO EM 27/07:** a composicao do score parcial aceita algumas metricas com amostra ou cobertura insuficiente e redistribui o peso entre elas. Isso pode gerar score 100 e status "Excelente" para professor novo com apenas 35% de cobertura.

Esse problema nao invalida automaticamente os valores brutos dos pilares. Ele esta na camada de elegibilidade, composicao e publicacao do score.

**DECISAO APROVADA EM 27/07:** metricas insuficientes permanecem visiveis, mas nao pontuam; score exige ao menos 60% de cobertura valida e um pilar de fidelizacao valido; sem isso, exibir `Parcial` ou `Sem base`, nunca `Excelente`.

---

## 5. Health Score V2 - o que existia

### 5.1 Composicao historica

O motor V2 usava:

| Fator | Peso historico |
|---|---:|
| Taxa de crescimento | 15% |
| Media de alunos por turma | 20% |
| Retencao/renovacao | 25% |
| Conversao experimental -> matricula | 15% |
| Presenca | 15% |
| Evasoes/saidas | 10% |

O crescimento era ajustado por um fator de demanda entre 1,0 e 3,0 para tentar compensar cursos com mercados diferentes.

### 5.2 Por que a V2 foi substituida

Os problemas encontrados foram:

- crescimento e fator de demanda produziam compensacoes pouco previsiveis;
- retencao e evasao podiam penalizar o mesmo fenomeno duas vezes;
- o grao de aluno, matricula, disciplina, turma e professor nao era sempre explicito;
- alguns indicadores consumiam fontes operacionais ou legadas;
- ausencia de base podia virar zero;
- metas globais nao representavam capacidade por unidade/curso/modalidade;
- tempo de permanencia herdava a permanencia do aluno na escola, nao com o professor;
- valores de cards, modais e relatorios podiam divergir;
- score alto podia resultar de redistribuicao de poucos pilares disponiveis.

### 5.3 O que nao foi levado para a V3

- taxa de crescimento;
- fator de demanda;
- evasao como pilar separado;
- presenca bruta sem interpretacao semantica;
- metas unicas para todos os cursos e unidades;
- `COALESCE(..., 0)` para fabricar indicador;
- ranking baseado em score parcial.

---

## 6. Contrato canonico da V3

### 6.1 Principios

**REGRA VIGENTE:**

1. pessoa nao e matricula;
2. matricula nao e disciplina;
3. professor e avaliado por unidade;
4. consolidado e recalculado com os eventos das unidades;
5. ID Emusys deve ser escopado por unidade;
6. ausencia de base nao e zero;
7. motivo desconhecido nao penaliza silenciosamente;
8. vinculo ativo e vinculo encerrado possuem papeis diferentes;
9. configuracao possui vigencia e versao;
10. snapshot fechado e imutavel.

### 6.2 Grao oficial

| Metrica | Grao |
|---|---|
| Numero de alunos | pessoa canonica na carteira do professor/unidade |
| Media de alunos por turma | ocupacao unica de pessoa canonica em turma regular |
| Conversao | experimental unica confirmada e matricula unica vinculada |
| Retencao | periodo matricula-disciplina-professor exposto |
| Permanencia | periodo matricula-disciplina-professor encerrado |
| Presenca | evento aluno-aula elegivel atribuido ao professor |

### 6.3 Consequencias

- uma pessoa em Bateria com Peterson e Guitarra com Jeyson gera dois vinculos pedagogicos;
- a pessoa conta uma vez na carteira de cada professor;
- dois cursos com o mesmo professor mantem dois historicos de retencao/permanencia;
- para numero de alunos, a mesma pessoa nao deve ser duplicada dentro da carteira do mesmo professor/unidade;
- na mesma turma, a mesma pessoa conta uma ocupacao;
- em duas turmas regulares diferentes, conta uma ocupacao em cada;
- renovacao administrativa com mesma disciplina e professor nao encerra o periodo pedagogico.

---

## 7. Formula do score, nota, peso e meta

### 7.1 Conceitos que nao podem ser confundidos

- **Valor real:** resultado observado, por exemplo 1,43 aluno/turma ou 12,4 meses.
- **Meta:** alvo aprovado para aquela metrica.
- **Nota:** atingimento da meta em escala 0-100.
- **Peso:** importancia do pilar no score.
- **Cobertura:** soma dos pesos originais dos pilares realmente elegiveis.

### 7.2 Normalizacao

Para metricas com meta:

```text
nota = min(100, valor_real / meta_versionada * 100)
```

Para percentuais, a nota pode acompanhar o percentual quando essa for a regra versionada.

### 7.3 Composicao

```text
score = soma(nota_i * peso_i) / soma(pesos_elegiveis)
```

Essa redistribuicao nao autoriza publicar qualquer combinacao como Health Score comparavel.

**REGRA VIGENTE DO CONTRATO:** publicacao exige:

- cobertura minima de 60%; e
- ao menos um pilar de fidelizacao valido: Retencao ou Permanencia.

### 7.4 Faixas iniciais

- `>= 70`: saudavel;
- `>= 50 e < 70`: atencao;
- `< 50`: critico;
- requisitos insuficientes: sem base/parcial, conforme estado.

Ranking e premiacao exigem snapshot oficial fechado.

---

## 8. Os seis pilares

## 8.1 Retencao atribuivel

**Mede:** capacidade de manter vinculos pedagogicos.

```text
100 * (1 - encerramentos_atribuiveis / vinculos_expostos)
```

**Base minima inicial:** 10 vinculos expostos.

### Regra temporal

**REGRA VIGENTE:**

- ate 02/08/2026: qualquer encerramento confirmado entra, pois a classificacao historica de motivos nao e completa;
- a partir de 03/08/2026: somente motivos classificados como atribuiveis ao professor penalizam;
- motivo ausente, ambiguo ou inferido vai para conciliacao;
- uma causa de uma matricula-disciplina nao contamina outros vinculos da pessoa.

Esse corte temporal deve permanecer versionado e auditavel.

## 8.2 Permanencia com o professor

**Mede:** quanto duraram os vinculos pedagogicos encerrados daquele professor.

Chave do periodo:

```text
unidade_id
+ emusys_matricula_id
+ emusys_matricula_disciplina_id
+ professor_id
+ data_inicio_periodo
```

Duracao:

```text
(data_fim - data_inicio) / 30,44
```

Media oficial:

```text
soma dos meses dos vinculos encerrados elegiveis/publicaveis
----------------------------------------------------------------
quantidade de vinculos encerrados elegiveis/publicaveis
```

**REGRA VIGENTE:**

- vinculo ativo nao entra na media de encerrados;
- troca real encerra o periodo do professor A e inicia o do B;
- renovacao com mesma disciplina e professor mantem continuidade;
- mudanca administrativa isolada nao encerra;
- substituicao pontual nao vira troca definitiva;
- vinculos com menos de 4 meses ficam no historico, mas nao entram na media;
- valor bruto pode aparecer desde o primeiro encerramento elegivel;
- pontuacao exige inicialmente ao menos 3 encerramentos elegiveis e publicaveis;
- mostrar media, tamanho da amostra e, para auditoria, mediana auxiliar;
- a mediana nao substitui a regra oficial da media.

### Historico

O historico foi reconstruido desde 2018, inicio do uso do Emusys pela LA, usando staging isolado, IDs Emusys, grade, aulas, jornadas, webhooks e revisao humana.

Confiancas:

- `alta`;
- `media`;
- `revisar`;
- `revisado_aprovado`.

Somente alta ou revisado_aprovado pontuam.

## 8.3 Conversao experimental -> matricula

**Denominador:** experimentais unicas confirmadas como realizadas.

**Numerador:** matriculas unicas vinculadas em ate 30 dias.

```text
100 * matriculas_unicas_vinculadas / experimentais_unicas_confirmadas
```

**REGRA VIGENTE:**

- uma matricula recebe credito de no maximo uma experimental;
- havendo varias, usar a ultima experimental confirmada anterior, dentro de 30 dias;
- matricula direta sem experimental nao entra;
- falta, cancelamento e mero agendamento nao entram no denominador;
- o credito e do professor que ministrou a experimental;
- a taxa nao precisa de teto cosmetico se o vinculo estiver deduplicado;
- base minima inicial: 3 experimentais;
- experimentais recentes ficam `em_maturacao` ate completar 30 dias;
- `em_maturacao` nao deve pontuar.

## 8.4 Media de alunos por turma

```text
ocupacoes_unicas (pessoa_canonica, turma_regular)
--------------------------------------------------
turmas_regulares_elegiveis
```

**REGRA VIGENTE:**

- usar somente turmas regulares elegiveis;
- deduplicar pessoa dentro da mesma turma;
- pessoa em duas turmas diferentes conta uma vez em cada;
- bandas, projetos e categorias nao regulares ficam fora;
- nao inventar segunda aula/curso por nome;
- turma elegivel vazia tem ocupacao zero valida;
- professor sem turma elegivel fica sem base;
- media inferior a 1 pode existir matematicamente quando ha turmas elegiveis vazias no recorte;
- antes de chamar isso de erro, conferir se o denominador inclui turmas realmente ofertadas e vazias;
- meta nao deve ser global: e segmentada por unidade, curso e modalidade.

Agregacao trimestral:

```text
soma das ocupacoes dos fechamentos mensais
-------------------------------------------
soma das turmas elegiveis dos fechamentos
```

Nao usar media simples das medias mensais.

## 8.5 Numero de alunos

**Mede:** alcance da carteira ativa.

**REGRA VIGENTE:**

- pessoa canonica unica por professor/unidade no fechamento;
- linhas operacionais duplicadas nao duplicam a carteira;
- a mesma pessoa pode contar para professores diferentes;
- professor ativo com carteira vazia possui valor bruto zero valido;
- vinculo historico nao reativa professor ou unidade;
- meta e segmentada por unidade, curso e modalidade;
- curso formalmente ofertado com zero alunos permanece visivel;
- zero alunos nao deve penalizar automaticamente um professor antes de existir exposicao/maturidade suficiente.

## 8.6 Presenca dos alunos

```text
100 * presentes / (presentes + faltas_confirmadas)
```

**Fonte obrigatoria:** camada semantica de presenca.

**Nao usar:** `aluno_presenca` bruto como resultado pedagogico.

**Elegibilidade inicial:**

- presente;
- falta_confirmada;
- fora do denominador: falta_provavel, indeterminado, cancelada e justificada;
- professor e unidade resolvidos;
- roster deduplicado no grao aluno-aula;
- base minima: 10 eventos;
- cobertura minima: 95%.

**Regra operacional atual:**

- Barra e Recreio possuem politica de confiabilidade aprovada para os recortes tratados;
- Campo Grande permanece com revisao operacional;
- a politica de KPI e a fila de "chamada nao lancada" sao camadas distintas;
- `aulas_emusys.professor_presenca = 'ausente'` nao e metrica de falta do professor;
- professor_presenca `ausente` pode representar aula nao realizada, roster sem chamada ou falha de cadastro.

---

## 9. Fontes canonicas

| Dominio | Fonte canonica |
|---|---|
| Identidade da pessoa por unidade | `vw_aluno_identidade_unidade_canonica` |
| Jornada atual | `aluno_jornada_matricula_disciplina` |
| Carteira por pessoa | camada canonica derivada de identidade + vinculos ativos |
| Aulas/agenda | `aulas_emusys` |
| Roster | `aula_alunos_emusys` |
| Presenca pedagogica | `vw_aluno_presenca_semantica_v1` |
| Evidencia bruta de presenca | `aluno_presenca`, somente auditoria |
| Experimentais | camada canonica de experimental confirmada/vinculada |
| Motivos de saida | `motivos_saida` |
| Movimentacoes administrativas | `movimentacoes_admin` |
| Trocas de professor | `aluno_professor_transicoes` |
| Periodos professor-aluno | camada V3 de periodos professor-matricula-disciplina |
| Catalogo e modalidade | catalogo Emusys por unidade e IDs |

### 9.1 Fontes proibidas para orientar a V3

- `alunos.professor_atual_id` isolado para carteira historica;
- `alunos.percentual_presenca`;
- `aluno_presenca` bruto como conclusao pedagogica;
- `aulas_emusys.professor_presenca` como metrica de RH;
- `movimentacoes` legada;
- `renovacoes` legada;
- nome de aluno/professor como identidade definitiva;
- `aulas_emusys.tipo` como modalidade oficial do curso;
- `professores_cursos` legado como autoridade operacional;
- RPC V2 com `COALESCE(..., 0)` fabricando indicador;
- media dos scores das unidades para formar o consolidado.

---

## 10. Historico professor-aluno

### 10.1 Por que foi necessario

O banco operacional possuia boa visao do estado atual, mas nao respondia corretamente:

- de qual professor o aluno saiu;
- para qual professor foi;
- quanto tempo permaneceu com cada professor;
- se uma aparicao curta era substituicao ou troca;
- se uma renovacao mantinha a continuidade;
- como preservar professor inativo no historico sem reativa-lo.

### 10.2 Coleta

O backfill usou:

- `GET /aulas` do Emusys;
- paginacao;
- coleta por unidade e janela;
- checkpoints;
- retry/backoff;
- staging idempotente;
- payload bruto, hash e data de coleta;
- resolucao por IDs, nao por nomes;
- protecao para nunca escrever em `anotacoes_fabio`.

### 10.3 Reconstrucao

Os eventos foram:

1. agrupados por unidade, matricula e matricula-disciplina;
2. resolvidos por professor Emusys/local;
3. deduplicados para eventos de turma;
4. ordenados cronologicamente;
5. transformados em periodos continuos;
6. confrontados com jornada atual, grade futura e webhooks;
7. classificados por confianca;
8. submetidos a conciliacao apenas quando a evidencia automatica nao era suficiente.

### 10.4 Aprendizados

- historico de identidade nao significa vinculo ativo atual;
- Vanessa e professores inativos precisam continuar como donos historicos;
- Leonardo pode ter identidade historica em Campo Grande e vinculo ativo somente na Barra;
- uma aula isolada de outro professor e evidencia de substituicao, nao troca definitiva;
- mesma pessoa com cursos diferentes gera periodos independentes;
- nomes divergentes nao podem ser a chave de uniao.

---

## 11. Catalogo Emusys, modalidade e metas segmentadas

### 11.1 Regra de modalidade

**REGRA VIGENTE:**

- `Canto T` e turma, mesmo que exista somente um aluno;
- `Canto IND` e individual;
- a modalidade oficial vem do catalogo/jornada Emusys por ID;
- `aulas_emusys.tipo` descreve o evento e nao redefine a modalidade oficial;
- uma divergencia isolada da aula nao deve abrir centenas de pendencias.

### 11.2 Grao da configuracao segmentada

```text
configuracao
+ unidade
+ curso
+ modalidade (turma ou individual)
```

Para cada segmento podem existir:

- capacidade maxima;
- meta de media por turma;
- meta de carteira;
- estado;
- fonte;
- vigencia;
- justificativa;
- trilha de auditoria.

### 11.3 Precedencia

1. catalogo oficial Emusys;
2. atribuicao formal do professor;
3. jornada ativa como evidencia operacional;
4. aulas como pista, nao autoridade de modalidade;
5. decisao humana somente em conflito persistente.

### 11.4 Curso sem aluno

Um curso formalmente atribuido continua disponivel para configuracao quando tem zero alunos.

**DECISAO APROVADA:** isso nao deve, por si so, prejudicar o professor. A meta fica pronta para quando a carteira existir.

**EM DISCUSSAO:** qual evento inicia a maturidade pontuavel do segmento: primeiro aluno, primeiro fechamento completo ou um ciclo minimo de exposicao.

---

## 12. Governanca da configuracao

### 12.1 Peso nao e meta

- sliders alteram somente pesos;
- metas sao campos numericos independentes;
- o banco preserva valor real, nota, meta e peso.

### 12.2 Fluxo aprovado

```text
configuracao ativa imutavel
        |
        v
criar nova versao em rascunho
        |
        v
editar pesos/metas/segmentos
        |
        v
simular
        |
        v
aprovar/ativar separadamente
```

### 12.3 Regras

- configuracao ativa nao e editada em lugar;
- mudanca cria rascunho;
- rascunho exige vigencia futura, autor e justificativa;
- simulacao e append-only e registra fingerprint;
- ativacao e acao separada;
- alteracao nao reescreve snapshot fechado;
- acesso depende de `professores.editar`;
- persistencia passa pelas RPCs governadas.

### 12.4 RPCs principais

- `get_health_score_professor_v3_config_ui`
- `criar_health_score_professor_v3_config_rascunho`
- `salvar_health_score_professor_v3_config_rascunho`
- `simular_health_score_professor_v3_config`
- `ativar_health_score_professor_v3_config`
- `get_health_score_professor_v3_snapshot_ui`

### 12.5 Frontend principal

- `src/components/App/Professores/HealthScoreV3Config.tsx`
- `src/hooks/useHealthScoreProfessorV3Config.ts`
- `src/hooks/useHealthScoreProfessorV3.ts`
- `src/lib/healthScoreProfessorV3.ts`

---

## 13. Modelo de dados e objetos principais

### 13.1 Configuracao

- `health_score_professor_v3_config_versoes`
- `health_score_professor_v3_config_metricas`
- `health_score_professor_v3_config_metas_curso_modalidade`

### 13.2 Snapshots e detalhe

- snapshots professor/unidade/competencia;
- detalhe por metrica;
- `health_score_professor_v3_snapshot_metrica_segmentos`;
- revisoes preservadas;
- estado `provisorio`, `em_maturacao`, `fechado` ou `invalidado`.

### 13.3 Historico

- staging historico Emusys;
- periodos efetivos professor-matricula-disciplina;
- `aluno_professor_transicoes`;
- evidencia e confianca;
- revisao humana.

### 13.4 Leitura de consumidores

- `get_health_score_professor_v3_performance`
- `get_health_score_professor_v3_snapshot_modal`
- `get_health_score_professor_v3_consumidor_pedagogico`
- `get_kpis_professor_periodo_canonico_v3`

Os nomes exatos e assinaturas devem ser confirmados no banco antes de uma alteracao, pois migrations posteriores podem ter recomposto o corpo mantendo a interface.

---

## 14. Fases e gates executados

| Fase/Gate | Entrega | Estado |
|---|---|---|
| Fase 0 | baseline, inventario e nao regressao | concluida |
| Fase 1 | staging e coletor historico | concluida |
| Fase 2 | piloto de reconstrucao e conciliacao | concluida |
| Fase 3 | captura futura de transicoes | concluida com ressalva de seguranca do webhook registrada |
| Gate 4 | RPCs de leitura canonica e performance | aprovado |
| Gate 5 | metas, normalizacao e calibracao inicial | concluido tecnicamente; semantica parcial reaberta em 27/07 |
| Gate 6 | motor V3 em sombra | concluido |
| Gate 7 | configuracao governada | concluido |
| Gate 8 | modal e consumidores iniciais | concluido parcialmente por consumidor |
| Cutover parcial | V3 visivel sem ranking oficial | ativo |
| Metas segmentadas | unidade/curso/modalidade | implementado; vigencia atual sob ajuste |
| Catalogo Emusys | modalidade e atribuicoes | implementado; excecoes reais reduzidas |
| Homologacao total | todos os consumidores e fechamento oficial | ainda nao concluida |

---

## 15. Consumidores

| Consumidor | Fonte V3 | Estado | Rollback |
|---|---|---|---|
| Gestao de Professores - Performance | `get_health_score_professor_v3_performance` | parcial visivel; elegibilidade reaberta | ocultar V3 e manter leitura anterior |
| Modal individual | `get_health_score_professor_v3_snapshot_modal` | pilares e evidencias visiveis | ocultar bloco V3 |
| Carteira do professor | leitura V3 + enriquecimentos permitidos | migrada | remover campos V3 |
| Dashboard | payload V3 | migrado parcialmente | voltar cards anteriores |
| Analytics | payload V3 | migrado parcialmente | voltar serie anterior |
| Relatorio individual | payload V3 | migrado | desabilitar bloco V3 |
| Relatorio coordenacao | payload V3 | migrado; texto deve respeitar parcial | voltar ao relatorio anterior |
| Relatorio ranking | payload V3 | ranking bloqueado sem oficial | manter ranking indisponivel |
| Edge Functions de insights | payload V3 compartilhado | inventariado/migrado em partes | desativar secao V3 |
| Fabio | RPCs pedagogicas; nao deve inferir score | integracao externa separada | manter sem HS |
| LA Teacher | nao exibe Health Score neste momento | decisao aprovada em 22/07 | nenhuma mudanca |

### 15.1 Regra transversal

Nenhum consumidor pode:

- transformar `sem_base` em zero;
- reclassificar `parcial` como oficial;
- habilitar ranking por conta propria;
- calcular novamente um pilar no frontend;
- usar fonte diferente da RPC canonica do mesmo recorte.

---

## 16. Estado vivo observado em 27/07/2026

Esta secao registra uma fotografia SELECT-only. Ela pode mudar com novas ativacoes.

### 16.1 Configuracoes encontradas

- configuracao `v1`: arquivada, vigencia 01/07 a 18/07;
- configuracao `v2`: ativa para o ciclo aberto 01/06 a 31/08;
- configuracao `v3`: ativa com vigencia futura a partir de 01/09.

Novamente: essas versoes sao revisoes da configuracao do motor V3.

### 16.2 Metricas da configuracao ativa do ciclo Jun-Ago

| Metrica | Peso | Meta | Base/cobertura |
|---|---:|---:|---|
| Retencao | 25% | 90% | base minima 10 |
| Permanencia | 25% | 12 meses | base minima 3 |
| Conversao | 15% | 70% | base minima 3 |
| Media/turma | 15% | metadado global 1,44 | depende de meta segmentada vigente |
| Numero de alunos | 10% | metadado global 33 | depende de meta segmentada vigente |
| Presenca | 10% | 80% | base 10; cobertura 95% |

### 16.3 Metas segmentadas

As regras preenchidas por unidade/curso/modalidade estavam ligadas a configuracao futura:

- Barra: 14 segmentos configurados;
- Campo Grande: 25 configurados e 6 nao ofertados, em 31 linhas;
- Recreio: 24 configurados e 1 nao ofertado, em 25 linhas.

Consequencia no recorte Julho/2026: Media/Turma e Numero de Alunos podem aparecer como valor observado, mas fora do score por `regra_ausente`.

**DECISAO APROVADA EM 27/07:** as metas segmentadas devem passar a valer ja com os dados atuais, de forma versionada, sem reescrever silenciosamente snapshots oficiais fechados.

---

## 17. Achado reaberto - score parcial injusto

### 17.1 O problema

A read model do score parcial atualmente aceita uma nota numerica sempre que encontra:

- valor bruto;
- meta.

Ela nao exige em todos os casos que o estado da metrica seja pontuavel.

Com isso, estados como:

- `sem_base_amostra`;
- `sem_base_cobertura`;
- `em_maturacao`;

podem fornecer peso ao score parcial.

Depois, o score redistribui o denominador somente entre os pesos considerados disponiveis, sem aplicar corretamente o piso global de 60% para tornar o resultado comparavel.

No frontend, a classificacao `saudavel` e apresentada como `Excelente`.

### 17.2 Evidencia de Barra/Julho

Foram observados:

- 12 casos de Retencao `sem_base_amostra` entrando no score;
- 12 casos de Conversao `sem_base_amostra` entrando;
- 7 casos de Presenca `sem_base_cobertura` entrando;
- 4 professores com score visivel abaixo de 60% de cobertura;
- 2 scores iguais a 100.

Exemplos:

| Professor | Score | Cobertura | Por que e enganoso |
|---|---:|---:|---|
| Ana Beatriz | 100 | 35% | Retencao 3/3 abaixo da base e Presenca; demais pilares ausentes |
| Erick | 100 | 50% | Retencao insuficiente, Conversao ainda pequena/maturando e Presenca |
| Peterson | 98,96 | 60% | Retencao 3/3 insuficiente, Permanencia valida e Presenca |
| Daiana | 91,09 | 60% | Presenca abaixo da cobertura minima ainda forneceu nota |

### 17.3 Local tecnico

Objetos/migrations que precisam ser revisitados:

- `supabase/migrations/20260719143000_health_score_v3_parcial_observado_readmodels.sql`
- `supabase/migrations/20260719150000_health_score_v3_presenca_parcial_canonica.sql`
- `src/components/App/Professores/TabPerformanceProfessores.tsx`

### 17.4 Interpretacao correta

O achado nao prova que:

- a carteira esta errada;
- a media por turma esta errada;
- a permanencia esta errada;
- a presenca observada esta errada.

Ele prova que a camada que decide **se o pilar pode pontuar** e **como o score parcial e publicado** esta permissiva demais.

---

## 18. Decisoes aprovadas em 27/07

O Alf aprovou:

1. valores insuficientes continuam visiveis como observacao;
2. `sem_base_amostra`, `sem_base_cobertura` e `em_maturacao` nao pontuam;
3. o score exige cobertura valida minima de 60%;
4. o score exige Retencao ou Permanencia valida;
5. quando os requisitos nao forem atendidos, exibir `Parcial` ou `Sem base`, nunca `Excelente`;
6. metas segmentadas devem comecar a valer no ciclo atual;
7. nenhuma ativacao pode alterar silenciosamente competencia oficial fechada;
8. os resultados devem ser recalculados e confrontados nas tres unidades.

### 18.1 Resultado esperado

Professor novo:

- ve seus valores reais;
- nao recebe zero por falta de historico;
- nao recebe 100 por ter somente dois pilares pequenos;
- fica `em integracao`, `parcial` ou `sem base`;
- passa a receber score comparavel quando acumular base suficiente.

Professor antigo:

- usa historico publicavel de permanencia;
- usa retencao conforme regra temporal;
- nao perde para professor novo apenas porque o novo possui menos dados;
- tambem nao recebe beneficio automatico somente por antiguidade.

---

## 19. Estados de publicacao recomendados

Esta taxonomia e a recomendacao atual para fechar a injustica sem fabricar nota:

| Estado | Significado | Exibe score? | Ranking? |
|---|---|---:|---:|
| `sem_base` | quase nenhum pilar elegivel | nao | nao |
| `em_integracao` | professor/segmento novo formando base | opcional, apenas diagnostico nao comparavel | nao |
| `parcial` | cobertura >=60%, fidelizacao valida, ciclo aberto | sim, rotulado parcial | nao |
| `oficial` | snapshot fechado, auditado e maduro | sim | sim |
| `invalidado` | revisao substituida ou erro comprovado | nao | nao |

**EM DISCUSSAO:** se `em_integracao` deve possuir score numerico diagnostico ou apenas valores dos pilares. A opcao mais conservadora e nao exibir numero agregado antes dos requisitos de parcial.

---

## 20. Pontos ainda em discussao

Nao implementar por suposicao:

1. qual evento inicia a maturidade de uma nova carteira por curso:
   - primeiro aluno;
   - primeiro fechamento mensal completo;
   - primeiro ciclo completo;
2. se `em_integracao` mostra score diagnostico sem comparabilidade;
3. como comunicar cursos formalmente ofertados com zero aluno sem punir o professor;
4. se metas segmentadas do ciclo aberto entram por nova revisao da configuracao atual ou por uma revisao intermediaria;
5. quais snapshots provisorios devem ser recalculados como nova revisao;
6. como apresentar no relatorio a cobertura e os pilares ausentes sem linguagem de fracasso;
7. quando a primeira configuracao pode produzir snapshot oficial e ranking.

---

## 21. Proxima implementacao segura

### Etapa 1 - congelar baseline

- exportar configuracoes, metas segmentadas e snapshots atuais;
- registrar contagem por estado e por unidade;
- preservar exemplos Ana Beatriz, Erick, Peterson e Daiana;
- confirmar que nao ha snapshot oficial fechado no recorte que sera recalculado.

### Etapa 2 - corrigir elegibilidade

- criar migration nova; nunca editar migration ja aplicada;
- derivar `peso_disponivel` somente de estado pontuavel;
- excluir explicitamente:
  - `sem_base`;
  - `sem_base_amostra`;
  - `sem_base_cobertura`;
  - `em_maturacao`;
  - `regra_ausente`;
  - `em_auditoria`, quando a politica assim exigir;
- exigir 60% de cobertura valida;
- exigir Retencao ou Permanencia valida.

### Etapa 3 - corrigir publicacao

- separar score calculavel de score publicavel;
- retornar estado explicito;
- impedir `saudavel -> Excelente` quando nao for oficial;
- mostrar cobertura e motivo de nao publicacao;
- preservar valores brutos dos pilares.

### Etapa 4 - antecipar metas segmentadas

- criar nova revisao governada para o ciclo aberto;
- copiar as metas segmentadas ja preenchidas;
- manter autor, justificativa e vigencia;
- simular antes de ativar;
- nao alterar revisao fechada;
- gerar nova revisao de snapshot, sem apagar a anterior.

### Etapa 5 - recalcular

- Barra;
- Recreio;
- Campo Grande;
- Consolidado.

Comparar:

- score antes/depois;
- cobertura antes/depois;
- pilares elegiveis;
- estado de publicacao;
- carteira;
- media/turma;
- permanencia;
- retencao;
- conversao;
- presenca.

### Etapa 6 - validar consumidores

- Performance;
- card e modal;
- Carteira;
- Dashboard;
- Analytics;
- relatorio individual;
- relatorio coordenacao;
- relatorio ranking;
- Edge Functions;
- consumidores pedagogicos externos.

### Etapa 7 - homologar

- Alf revisa os exemplos;
- coordenacao valida leitura, nao formula;
- ranking continua bloqueado;
- somente depois fechar snapshot oficial.

---

## 22. Testes obrigatorios da correcao

1. Professor com dois pilares abaixo da base nao recebe score 100.
2. `sem_base_amostra` permanece visivel e fora do score.
3. `sem_base_cobertura` permanece visivel e fora do score.
4. `em_maturacao` permanece visivel e fora do score.
5. Cobertura 59% nao publica score parcial.
6. Cobertura 60% sem Retencao/Permanencia valida nao publica.
7. Cobertura 60% com Permanencia valida publica `parcial`.
8. Professor novo nao recebe zero nos pilares historicos ausentes.
9. Professor antigo usa somente periodos publicaveis.
10. Meta segmentada atual altera somente snapshot aberto/revisado.
11. Snapshot oficial fechado permanece byte a byte imutavel.
12. Ranking permanece desabilitado para parcial.
13. Dashboard, Analytics e relatorios mostram o mesmo score/estado.
14. Consolidado recalcula eventos; nao faz media dos scores unitarios.
15. Curso formal com zero aluno fica visivel e nao penaliza sem maturidade.
16. Meta de curso individual nao contamina curso em turma.
17. Meta de Barra nao contamina Recreio/Campo Grande.
18. Usuario sem permissao nao cria, simula ou ativa configuracao.
19. `anon` nao executa RPC interna.
20. Rollback de um consumidor nao apaga snapshots ou historico.

---

## 23. Seguranca e isolamento

As camadas V3 devem:

- nascer sem `SELECT/EXECUTE` para `public` e `anon`;
- usar RLS por unidade e papel;
- usar `security_invoker` em views quando aplicavel;
- usar `security definer` somente com guard explicito e `search_path=public`;
- impedir professor de consultar outro professor;
- impedir LA Teacher/Fabio de receber financeiro;
- evitar payload pessoal bruto em logs;
- auditar configuracao e revisao humana;
- manter webhook nao bloqueante, mas validar origem por segredo/assinatura quando o contrato Emusys permitir.

O tema de assinatura do webhook e uma frente de seguranca separada. Ele nao deve ser esquecido, mas tambem nao autoriza alterar o modelo do Health Score.

---

## 24. Contrato com LA Teacher e Fabio

### 24.1 Decisoes de 22/07

- professor nao corrige a propria chamada depois de enviada;
- retificacao e exclusiva da coordenacao e auditada;
- KPI de presenca e alerta de chamada nao lancada sao politicas distintas;
- Health Score nao aparece no app do professor por enquanto;
- a Ficha do Aluno deve usar presenca semantica;
- Fabio e Sol devem consumir a mesma verdade semantica, respeitando seus papeis.

### 24.2 Escrita de presenca

- professor: RPC do LA Teacher;
- Fabio: RPC propria sobre o core;
- Emusys: upsert bruto;
- coordenacao: `admin_corrigir_presenca`;
- sync nunca sobrescreve fonte humana;
- fonte humana promove sobre fonte automatica fraca;
- fonte humana nao sobrescreve outra humana sem retificacao auditada.

### 24.3 Pendencias conhecidas

- garantir que `fabio_audio` e `professor_whatsapp` sejam reconhecidos como fontes humanas;
- ficha do aluno deve ler semantica, nao bruto;
- unificar matriz de fontes fortes;
- preservar autoria anterior nas retificacoes.

Essas pendencias nao devem ser "resolvidas" recalculando presenca dentro do Health Score.

---

## 25. Nao regressao

Durante a correcao do score parcial:

- nao alterar MRR;
- nao alterar ticket medio;
- nao alterar relatorios gerencial, administrativo ou comercial;
- nao alterar churn/Random Forest;
- nao alterar `anotacoes_fabio`;
- nao alterar `aluno_presenca` bruto;
- nao alterar carteira por uma regra local do frontend;
- nao reativar professor/unidade para resolver identidade historica;
- nao reaproveitar tabelas legadas genericas;
- nao fazer `supabase db push` indiscriminado;
- nao apagar configuracoes, simulacoes ou snapshots anteriores.

---

## 26. Rollback

O rollback deve ser aditivo e por consumidor:

1. desativar a leitura V3 daquele consumidor;
2. manter configuracao, simulacao, historico e snapshots;
3. voltar temporariamente ao componente anterior;
4. registrar a divergencia encontrada;
5. corrigir a RPC/view versionada;
6. revalidar antes de religar.

Nunca usar rollback destrutivo em dados historicos.

---

## 27. Perguntas para Claude Code e Alfredo

Este e o conjunto de perguntas que ainda agrega valor a uma revisao cruzada:

1. A taxonomia `sem_base / em_integracao / parcial / oficial` cobre todos os casos sem beneficiar nem penalizar professor novo?
2. `em_integracao` deve mostrar score numerico ou somente pilares observados?
3. Qual e o criterio mais justo e auditavel de maturidade para carteira de curso?
4. A nova vigencia das metas segmentadas deve iniciar em 01/06, 01/07 ou na data de ativacao, preservando revisoes anteriores?
5. Quais snapshots atuais sao apenas provisorios e podem receber nova revisao?
6. Ha algum consumidor externo ainda recalculando score ou pilar localmente?
7. A matriz de estados pontuaveis deve ficar em tabela versionada ou funcao canonica unica?
8. Quais evidencias devem aparecer para a coordenacao explicar por que um professor esta parcial?
9. O primeiro ranking oficial deve esperar o fechamento Jun-Ago completo?
10. Que testes independentes devem ser exigidos antes da ativacao?

---

## 28. Arquivos de codigo para orientacao

### Frontend

- `src/components/App/Professores/TabPerformanceProfessores.tsx`
- `src/components/App/Professores/HealthScoreV3Config.tsx`
- `src/hooks/useHealthScoreProfessorV3.ts`
- `src/hooks/useHealthScoreProfessorV3Config.ts`
- `src/lib/healthScoreProfessorV3.ts`

### Migrations-chave

Historico e periodos:

- migrations de staging/reconstrucao de 16/07;
- migrations de transicao e metricas de 17/07.

Configuracao e snapshots:

- migrations de configuracao, simulacao e snapshot de 17-18/07.

Cutover parcial:

- `supabase/migrations/20260719143000_health_score_v3_parcial_observado_readmodels.sql`
- `supabase/migrations/20260719150000_health_score_v3_presenca_parcial_canonica.sql`

Metas segmentadas:

- migrations `20260719*` relacionadas a metas por curso/modalidade.

Catalogo e vinculos:

- migrations `20260720*` e `20260721*` relacionadas ao catalogo Emusys, atribuicoes e excecoes.

Presenca e consumidores:

- migrations `20260722*` relacionadas a semantica, read models e homologacao.

Para obter a lista completa no checkout:

```powershell
rg --files supabase/migrations | rg "health_score|professor_curso|catalogo|presenca"
```

---

## 29. Criterio de pronto

O Health Score V3 so pode ser declarado oficial quando:

- metricas insuficientes nao pontuarem;
- cobertura e fidelizacao forem exigidas;
- metas segmentadas vigentes estiverem aprovadas;
- snapshots provisorios forem recalculados por revisao;
- valores baterem nas tres unidades e no consolidado;
- todos os consumidores mostrarem o mesmo estado;
- parcial nao aparecer como Excelente;
- ranking permanecer bloqueado ate fechamento;
- seguranca e grants forem auditados;
- rollback estiver testado;
- Alf homologar os casos de referencia;
- coordenacao confirmar a leitura;
- snapshot oficial do ciclo for fechado.

---

## 30. Veredito final

A migracao V2 -> V3 esta estruturalmente avancada e preservou os elementos mais dificeis:

- dados canonicos;
- historico;
- granularidade correta;
- metas versionadas;
- configuracao governada;
- consumidores desacoplados;
- rollout com rollback.

O bloqueio atual nao exige reconstruir o projeto. Ele exige corrigir a ultima camada de composicao/publicacao:

- quais pilares podem pontuar;
- quando a cobertura permite score;
- quando o score e parcial;
- quando ele pode ser chamado de oficial.

O caminho seguro e uma migration aditiva, uma nova revisao de configuracao para o ciclo aberto, recalculo versionado e homologacao consumidor por consumidor.

Enquanto isso:

- valores brutos podem continuar visiveis;
- scores parciais atuais nao devem orientar ranking ou premiacao;
- `Excelente` nao deve ser inferido de cobertura insuficiente;
- documentos V2 permanecem apenas como historico;
- este handoff e o indice principal para a continuidade.
