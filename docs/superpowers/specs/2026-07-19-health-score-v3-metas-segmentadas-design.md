# SPEC - Health Score Professor V3: metas segmentadas por unidade, curso e modalidade

**Data:** 2026-07-19  
**Status:** desenho aprovado; pronto para plano de implementacao  
**Autoridade funcional:** Alf  
**Escopo:** configuracao, calculo em sombra, auditoria e futura publicacao do Health Score Professor V3  
**Documento-base:** `docs/specs/2026-07-16-contrato-health-score-professor-v5-final.md`

## 1. Decisao

As metas de `media_turma` e `numero_alunos` deixam de ser globais nas novas configuracoes do Health Score Professor V3.

O novo grao de configuracao e:

```text
configuracao + unidade + curso canonico + modalidade
```

Modalidades aceitas:

```text
individual | turma
```

Cada combinacao possui tres parametros independentes:

1. capacidade maxima da turma;
2. meta saudavel de alunos por turma;
3. meta de carteira do curso.

Os sliders continuam globais e representam apenas o peso dos seis pilares. Peso, meta, capacidade e nota permanecem conceitos separados.

## 2. Alteracao explicita do contrato V5

Esta SPEC substitui apenas as regras do contrato V5 que determinavam metas globais para `media_turma` e `numero_alunos`, especialmente a frase da secao 7.2 que proibia segmentacao por instrumento.

Continuam vigentes:

- os seis pilares e seus pesos versionados;
- a separacao entre peso, valor bruto, meta e nota;
- a identidade canonica de pessoa por unidade;
- a imutabilidade de configuracoes ativas e snapshots fechados;
- o fluxo rascunho, simulacao e ativacao;
- a exclusao de bandas e projetos configurados como nao regulares;
- a proibicao de fabricar zero quando nao ha base;
- a migracao individual dos consumidores;
- a preservacao do V2 ate a virada completa.

## 3. Motivacao

Uma meta global distorce o desempenho porque a capacidade pedagogica e fisica varia entre unidades, cursos e modalidades.

Exemplos funcionais:

- Bateria em turma pode comportar tres alunos em Campo Grande e dois na Barra;
- Canto em turma pode comportar mais alunos que Bateria;
- uma aula individual precisa ser tratada separadamente de uma aula em turma;
- uma turma com apenas um aluno continua sendo turma;
- a meta total de carteira de um curso nao deve ser inferida pela capacidade da turma.

O objetivo e avaliar o professor contra a estrutura real oferecida pela unidade, sem alterar o dado observado e sem reintroduzir o antigo fator de demanda.

## 4. Nao objetivos

Esta etapa nao autoriza:

- alterar a presenca canonica;
- construir o novo sistema de chamada da secretaria;
- alterar churn ou Random Forest;
- reativar fator de demanda;
- recalcular dados financeiros;
- mudar relatorios gerencial, administrativo ou comercial;
- modificar o de-para canonico de cursos;
- inferir modalidade por nome, quantidade de alunos ou existencia de `turma_nome`;
- publicar rankings ou premiacoes antes do fechamento oficial;
- alterar snapshots fechados.

## 5. Fontes canonicas e invariantes

### 5.1 Curso

O curso local e resolvido por:

```text
unidade_id + curso_emusys_id
    -> curso_emusys_depara
    -> cursos.id
```

Nao sera feito matching por nome.

O de-para existente e preservado. Por exemplo, `Canto T` e `Canto IND` continuam apontando para os cursos canonicos atualmente definidos. Esta SPEC nao funde nem renomeia cursos.

### 5.2 Modalidade

Para aulas, a fonte oficial e:

```text
aulas_emusys.tipo
```

Valores pontuaveis:

```text
individual | turma
```

Para vinculos atuais de carteira, a fonte primaria e:

```text
aluno_jornada_matricula_disciplina.payload_snapshot.disciplina.tipo
```

Fallback permitido para auditoria, nunca silencioso:

```text
tipo da aula normal mais recente da mesma unidade e matricula_disciplina_id
```

Se a modalidade continuar indeterminada, o segmento fica fora da nota e entra na fila de conciliacao.

`turma_nome` serve para identidade operacional da turma, nao para decidir modalidade.

### 5.3 Evidencia de cobertura em 2026-07-19

- 99,97% das aulas de junho e julho possuem curso canonico resolvido;
- 100% das jornadas ativas possuem `curso_id`;
- 100% das jornadas ativas observadas possuem modalidade `individual` ou `turma` no payload;
- `aulas_emusys.tipo` distingue aulas individuais e de turma mesmo quando ambas possuem `turma_nome`.

Esses numeros sao diagnosticos datados e devem ser recalculados durante a implementacao.

### 5.4 Media observada

O valor bruto de media por turma permanece:

```text
ocupacoes unicas (pessoa canonica, turma regular)
-------------------------------------------------
turmas regulares elegiveis
```

Regras preservadas:

- mesma pessoa na mesma turma conta uma ocupacao;
- mesma pessoa em turmas diferentes conta uma ocupacao em cada turma;
- reagendamento nao cria ocupacao adicional;
- bandas e projetos nao regulares ficam fora;
- aulas experimentais, extras, avulsas, ensaios e canceladas nao formam a base regular;
- uma turma com um aluno produz media `1`, sem mudar sua modalidade para individual;
- o valor bruto nao e limitado pela capacidade maxima.

## 6. Modelo de dados

### 6.1 Matriz versionada de metas

Criar uma tabela dedicada, ligada a `health_score_professor_v3_config_versoes`:

```text
health_score_professor_v3_config_metas_curso_modalidade
```

Campos minimos:

| Campo | Regra |
|---|---|
| `id` | UUID, chave primaria |
| `config_id` | FK para a versao da configuracao V3 |
| `unidade_id` | FK para `unidades` |
| `curso_id` | FK para `cursos` |
| `modalidade` | `individual` ou `turma` |
| `estado` | `configurada` ou `nao_ofertada` |
| `capacidade_maxima` | maior ocupacao operacional esperada por turma |
| `meta_media_turma` | ocupacao saudavel usada na nota de media/turma |
| `meta_carteira_curso` | meta independente de carteira do segmento |
| `parametros` | metadados adicionais auditaveis |
| `criado_em` | timestamp |
| `atualizado_em` | timestamp |

Restricao de unicidade:

```text
unique (config_id, unidade_id, curso_id, modalidade)
```

Validacoes:

- valores configurados devem ser positivos;
- `meta_media_turma <= capacidade_maxima`;
- `nao_ofertada` exige metas nulas;
- configuracao ativa ou usada por snapshot fechado e imutavel;
- nao existe fallback global oculto para segmento sem regra.

### 6.2 Atribuicao formal do professor

O cadastro atual `professores_cursos` nao possui unidade nem modalidade. Nao pode ser cruzado indiscriminadamente com `professores_unidades`, pois isso criaria cursos falsos em professores multiunidade.

Criar uma camada temporal propria:

```text
professor_unidade_curso_modalidade
```

Campos minimos:

| Campo | Regra |
|---|---|
| `id` | UUID |
| `professor_id` | FK para `professores` |
| `unidade_id` | FK para `unidades` |
| `curso_id` | FK para `cursos` |
| `modalidade` | `individual` ou `turma` |
| `vigencia_inicio` | inicio da atribuicao |
| `vigencia_fim` | fim opcional |
| `status` | `ativo` ou `inativo` |
| `fonte` | `manual`, `jornada`, `aula` ou `revisao` |
| `confianca` | `alta`, `media` ou `revisada` |
| `revisado_por` | usuario responsavel |
| `revisado_em` | timestamp |
| `evidencias` | JSONB auditavel |

Regras:

- nao substituir nem apagar `professores_cursos`;
- backfill automatico somente com evidencia de jornada ativa ou aula regular recente;
- atribuicao inferida de confianca media nao pode pontuar ate revisao ou confirmacao por nova evidencia;
- professor inativo na unidade nao e reativado por historico;
- atribuicao com zero alunos continua visivel;
- curso com zero alunos nao penaliza o professor.

### 6.3 Segmentos do snapshot

Criar uma filha estruturada para auditoria:

```text
health_score_professor_v3_snapshot_metrica_segmentos
```

Ela deve armazenar, para `media_turma` e `numero_alunos`:

- snapshot e metrica de origem;
- unidade, curso e modalidade;
- pessoas, vinculos, turmas e ocupacoes observadas;
- capacidade maxima aplicada;
- meta aplicada;
- numerador, denominador e nota do segmento;
- estado de base;
- fonte e regra;
- referencia da atribuicao do professor;
- versao da configuracao.

O JSON de `detalhes` pode continuar como resumo, mas nao sera a unica trilha da segmentacao.

## 7. Regra da media de alunos por turma

Para cada segmento `s`:

```text
ocupacoes_s = ocupacoes unicas pessoa/turma
turmas_s = turmas regulares elegiveis
meta_assentos_s = turmas_s * meta_media_turma_s
```

Valor bruto consolidado, preservado para exibicao:

```text
media_observada = soma(ocupacoes_s) / soma(turmas_s)
```

Nota do pilar:

```text
nota_media_turma = min(
  100,
  100 * soma(ocupacoes_s) / soma(meta_assentos_s)
)
```

Capacidade:

- nao participa do denominador da nota;
- nao limita ocupacao observada;
- gera alerta quando a ocupacao de uma turma supera `capacidade_maxima`;
- o alerta registra turma, curso, modalidade, ocupacao, capacidade e competencia.

Sem base:

- professor sem turma regular elegivel fica sem base neste pilar;
- segmento sem regra configurada fica pendente e bloqueia a publicacao da metrica;
- segmento explicitamente `nao_ofertada` que apareca nos dados gera divergencia de configuracao.

## 8. Regra da carteira por curso

### 8.1 Dois numeros diferentes e explicitos

O sistema preserva:

```text
Alunos = pessoas canonicas unicas na carteira do professor/unidade
```

O pilar segmentado usa:

```text
Carteira por curso = vinculos unicos (pessoa, curso, modalidade)
```

Uma pessoa com dois cursos com o mesmo professor:

- conta uma pessoa no total visual de `Alunos`;
- conta um vinculo em cada meta de carteira correspondente;
- nunca e duplicada dentro do mesmo curso e modalidade.

O nome visivel do pilar deve ser `Carteira por curso`. Nao se deve mostrar a nota segmentada como se fosse apenas `numero de pessoas`.

### 8.2 Elegibilidade do segmento

Um segmento participa da matriz do professor quando existe atribuicao formal vigente em `professor_unidade_curso_modalidade`.

Quando possui pelo menos um vinculo ativo:

```text
nota_segmento = min(
  100,
  100 * vinculos_ativos_segmento / meta_carteira_curso
)
```

Nota agregada do pilar:

```text
nota_carteira = min(
  100,
  100 * soma(vinculos_ativos_segmentos_pontuaveis)
      / soma(metas_segmentos_pontuaveis)
)
```

### 8.3 Curso atribuido com zero alunos

Decisao aprovada:

- permanece visivel com `0 alunos` e sua meta;
- recebe estado `sem_base_zero_carteira`;
- nao recebe nota zero;
- nao reduz o Health Score;
- fica fora do numerador e do denominador da nota agregada;
- passa a pontuar quando surgir o primeiro vinculo ativo;
- continua disponivel para acompanhamento operacional da coordenacao.

Essa regra evita responsabilizar o professor por captacao, disponibilidade de agenda ou decisao comercial que nao estejam sob seu controle.

Se todos os segmentos atribuidos estiverem zerados, o pilar inteiro fica sem base e seu peso e redistribuido conforme a regra V3 vigente.

## 9. Configuracao global e segmentada

### 9.1 Pesos

Os pesos continuam em:

```text
health_score_professor_v3_config_metricas
```

Uma linha por pilar. Os sliders:

- alteram somente `peso`;
- devem totalizar 100%;
- nao alteram metas;
- nao alteram snapshots fechados.

### 9.2 Metas globais remanescentes

Retencao, permanencia, conversao e presenca continuam com metas na tabela global de metricas.

Nas novas configuracoes segmentadas:

- `media_turma.meta` fica nula;
- `numero_alunos.meta` fica nula;
- `parametros.normalizacao` identifica `segmentada_unidade_curso_modalidade`;
- a ativacao valida a matriz segmentada no lugar da meta global.

Configuracoes antigas permanecem legiveis e nao sao reescritas.

## 10. Interface de configuracao

A tela `Configuracoes de Performance` tera dois blocos independentes.

### 10.1 Pesos dos pilares

- seis sliders globais;
- soma visivel e obrigatoriamente igual a 100%;
- sem metas embutidas no slider.

### 10.2 Matriz de metas

Interface de trabalho densa, com:

- abas por unidade;
- filtro por curso;
- filtro por modalidade;
- filtro `pendentes de configuracao`;
- uma linha por curso e modalidade;
- edicao somente em rascunho.

Colunas:

```text
Curso | Modalidade | Capacidade maxima | Meta media/turma |
Meta carteira | Estado | Fonte/ultima alteracao
```

Comportamentos:

- curso `individual` e `turma` aparecem em linhas separadas;
- uma combinacao pode ser marcada explicitamente como `nao ofertada`;
- a UI nao sugere modalidade pela quantidade de alunos;
- a UI alerta quando a meta saudavel supera a capacidade;
- a UI mostra quantos segmentos estao sem regra;
- a UI mostra quantos professores possuem atribuicoes com zero alunos;
- a configuracao ativa e somente leitura;
- toda mudanca ocorre em novo rascunho.

## 11. RPCs e ciclo de governanca

As RPCs existentes devem evoluir de forma aditiva para carregar a matriz, sem permitir escrita direta do navegador.

Responsabilidades:

1. `get_health_score_professor_v3_config_ui`
   - devolver ativa, rascunho, pesos, metas globais e matriz segmentada;
   - devolver pendencias de cobertura e atribuicao.

2. `criar_health_score_professor_v3_config_rascunho`
   - clonar pesos, metas globais e toda a matriz da versao ativa;
   - nao alterar a configuracao ativa.

3. `salvar_health_score_professor_v3_config_rascunho`
   - validar pesos, metas, capacidades, estados e unicidade;
   - salvar a matriz em transacao atomica;
   - exigir `professores.editar`.

4. `simular_health_score_professor_v3_config`
   - recalcular sem publicar snapshots;
   - devolver impacto por professor e por segmento;
   - mostrar sem base, zero carteira, superlotacao e regra ausente.

5. `ativar_health_score_professor_v3_config`
   - exigir simulacao atual da mesma impressao digital da configuracao;
   - impedir ativacao com regra obrigatoria ausente;
   - impedir sobreposicao de vigencia;
   - preservar configuracoes e snapshots anteriores.

## 12. Resolucao e precedencia

Nao existe heranca silenciosa de meta global.

Para cada segmento, a resolucao e exata:

```text
config_id + unidade_id + curso_id + modalidade
```

Se nao houver linha:

- o segmento fica `regra_ausente`;
- a simulacao evidencia o problema;
- a configuracao nao pode ser ativada se o segmento possuir dado ou atribuicao vigente;
- nenhum valor de outra unidade, curso ou modalidade e reutilizado.

## 13. Consolidado multiunidade

O consolidado nao calcula media simples dos scores das unidades.

Media/turma:

```text
soma das ocupacoes das unidades
--------------------------------
soma das metas de assentos das unidades
```

Carteira por curso:

```text
soma dos vinculos pontuaveis das unidades
------------------------------------------
soma das metas pontuaveis das unidades
```

As identidades Emusys continuam escopadas por unidade. O detalhamento preserva cada componente unitario.

## 14. Seguranca

- novas tabelas nascem com RLS habilitada;
- `public` e `anon` nao recebem acesso;
- leitura gerencial respeita unidade e papel;
- escrita exige `professores.editar`;
- RPCs de escrita usam `security definer`, `search_path` fixo e guard explicito;
- browser nao executa `insert`, `update` ou `delete` direto;
- `service_role` permanece restrito a automacao autorizada;
- logs nao armazenam payload pessoal desnecessario.

## 15. Compatibilidade e nao regressao

A implantacao sera aditiva.

Permanecem inalterados durante a sombra:

- `get_carteira_professor_periodo_canonica` como fonte dos valores brutos;
- cards e totais canonicos de alunos;
- Administrativo;
- Comercial;
- Dashboard e Analytics nao migrados;
- relatorios gerencial, administrativo e comercial;
- presenca atual;
- V2 do Health Score;
- configuracoes V3 ativas anteriores;
- snapshots fechados.

O detalhamento segmentado deve ser construido sobre a mesma base canonica, nunca por uma segunda query independente que possa divergir.

Cada consumidor sera migrado individualmente, com comparacao antes/depois e rollback proprio.

## 16. Sequencia de implementacao

1. Registrar baseline de RPCs, telas, relatorios e configuracao ativa.
2. Criar tabelas segmentadas e politicas de seguranca.
3. Criar camada de atribuicao professor/unidade/curso/modalidade.
4. Fazer backfill de atribuicoes com confianca e fila de revisao.
5. Extrair uma camada canonica detalhada de ocupacao por segmento.
6. Criar formulas segmentadas sem alterar o agregado bruto.
7. Evoluir RPCs de rascunho, salvamento, simulacao e ativacao.
8. Implementar a matriz de configuracao na UI.
9. Criar uma nova versao rascunho, sem ativacao automatica.
10. Preencher metas com a direcao por unidade, curso e modalidade.
11. Simular professores mono e multicurso nas tres unidades.
12. Validar com coordenacao e direcao.
13. Ativar com vigencia futura.
14. Gerar snapshots em sombra.
15. Migrar consumidores um por vez.

## 17. Testes obrigatorios

1. Turma com um aluno permanece modalidade `turma`.
2. Aula individual com `turma_nome` permanece `individual`.
3. `Canto T` e `Canto IND` usam seus `curso_id` canonicos atuais.
4. Bateria Barra e Bateria Campo Grande recebem metas diferentes.
5. Mesmo curso com modalidades individual e turma recebe regras diferentes.
6. Mesma pessoa duplicada na mesma turma conta uma ocupacao.
7. Mesma pessoa em duas turmas conta uma vez em cada turma.
8. Mesma pessoa em dois cursos conta uma pessoa no total e dois vinculos de carteira.
9. Reagendamento nao multiplica turma, ocupacao ou carteira.
10. Banda e projeto nao regular permanecem excluidos.
11. Capacidade excedida gera alerta sem alterar o valor bruto.
12. Meta saudavel maior que capacidade bloqueia salvamento ou ativacao.
13. Segmento atribuido com zero alunos aparece e nao penaliza.
14. Primeiro aluno ativo torna o segmento pontuavel.
15. Professor sem segmento pontuavel fica sem base no pilar.
16. Regra ausente bloqueia ativacao, sem fallback global.
17. Professor multiunidade e recalculado pelos componentes, sem media simples.
18. Curso de uma unidade nao e inferido para outra por produto cartesiano.
19. Configuracao ativa e snapshot fechado permanecem imutaveis.
20. Rascunho clona matriz completa e pode ser descartado sem efeito produtivo.
21. Simulacao nao publica nem altera snapshots.
22. Usuario sem `professores.editar` nao consegue salvar ou ativar.
23. `anon` nao le nem escreve a matriz.
24. Cards e relatorios nao migrados permanecem identicos durante a sombra.
25. A soma dos pesos globais continua obrigatoriamente em 100%.

## 18. Criterios de aceite

A configuracao segmentada esta pronta para ativacao somente quando:

- todos os cursos e modalidades ofertados estiverem configurados ou explicitamente marcados como nao ofertados;
- todas as atribuicoes pontuaveis tiverem identidade de unidade, curso e modalidade resolvida;
- nao houver produto cartesiano falso de curso por unidade;
- os valores brutos forem identicos aos consumidores canonicos atuais;
- a nota segmentada puder ser reproduzida pelo detalhamento do snapshot;
- cursos zerados estiverem visiveis e fora da penalizacao;
- alertas de capacidade nao alterarem os KPIs;
- simulacao tiver sido validada nas tres unidades;
- seguranca, RLS, grants e desempenho tiverem sido auditados;
- rollback por consumidor estiver documentado.

## 19. Proxima etapa

O proximo artefato obrigatorio e o plano de implementacao detalhado, com migrations, RPCs, componentes, testes e pontos de verificacao. Nenhuma alteracao de banco ou consumidor deve ocorrer antes desse plano.
