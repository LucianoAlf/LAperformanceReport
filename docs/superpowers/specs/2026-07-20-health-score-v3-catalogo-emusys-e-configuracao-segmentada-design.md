# Health Score V3 - catalogo Emusys, vinculos automaticos e configuracao segmentada

**Data:** 2026-07-20

**Status:** desenho funcional aprovado; pronto para plano de implementacao

**Autoridade funcional:** Alf

**Escopo:** catalogo de cursos/modalidades, atribuicoes professor-curso, excecoes operacionais e experiencia de configuracao do Health Score Professor V3

**Documento-base:** `docs/superpowers/specs/2026-07-19-health-score-v3-metas-segmentadas-design.md`

## 1. Decisao

O Emusys passa a ser a origem automatica para:

1. catalogo de disciplinas ofertadas por unidade;
2. modalidade oficial de cada disciplina (`turma` ou `individual`);
3. atribuicao formal de professor por disciplina e unidade;
4. confirmacao dos vinculos ativos observados nas matriculas.

O LA Report continua sendo a central canonica de leitura, auditoria, temporalidade e governanca. Ele sincroniza, resolve identidades, materializa os vinculos e preserva evidencias; nao pede que a coordenacao recadastre manualmente o que o Emusys ja informa.

A fila atual de conciliacao deixa de ser um cadastro paralelo. Ela passa a exibir apenas excecoes reais que a automacao nao consegue resolver com seguranca.

As metas por unidade, curso e modalidade permanecem disponiveis na interface de forma permanente. Uma configuracao ativa e imutavel, mas a coordenacao pode alterar pesos e metas criando uma nova versao rascunho, simulando o impacto e ativando-a com vigencia futura.

## 2. Relacao com a SPEC de 19/07

Este documento nao reabre o contrato do Health Score V3 nem muda as formulas segmentadas ja aprovadas.

Ele substitui especificamente:

- a interpretacao de `aulas_emusys.tipo` como fonte oficial da modalidade;
- o backfill massivo de atribuicoes baseado em pistas de aula e tabela legada;
- a fila operacional que apresenta linhas resolvidas, pistas historicas e falsos conflitos como trabalho manual;
- a representacao de regra ausente como `configurada` com valores zero;
- o bloqueio da conciliacao causado por um rascunho de metas artificialmente marcado como alterado.

Continuam vigentes:

- o grao `configuracao + unidade + curso + modalidade`;
- a separacao entre peso, meta, capacidade, valor observado e nota;
- o fluxo `rascunho -> simulacao -> ativacao`;
- a imutabilidade de configuracoes ativas e snapshots fechados;
- o tratamento nao punitivo de curso formal com zero alunos;
- a preservacao da V2 e dos consumidores ainda nao migrados;
- a migracao individual dos consumidores da V3.

## 3. Evidencia que motivou a revisao

### 3.1 Fila atual

A auditoria de 20/07/2026 encontrou:

| Estado | Fonte | Confianca | Linhas |
|---|---|---:|---:|
| resolvido | jornada | alta | 194 |
| conflito de modalidade jornada/aula | aula | media | 182 |
| pista sem escopo | legado/manual | media | 75 |
| resolvido | aula | media | 51 |
| pendente de materializacao | jornada | alta | 3 |

As 182 divergencias possuem o mesmo formato: `aulas_emusys.tipo = individual` enquanto jornada e matricula classificam a disciplina como turma. Nao existe o conflito inverso na amostra.

As 75 pistas vieram de `professores_cursos`, tabela sem unidade e modalidade. Elas sao uteis para diagnostico historico, mas nao podem formar uma fila operacional da coordenacao.

As tres linhas realmente pendentes e de alta confianca ja possuem evidencia suficiente para materializacao automatica:

- Willer, Campo Grande, Violao, turma;
- Lohana, Recreio, Teclado, turma;
- Willian, Recreio, Contrabaixo, turma.

### 3.2 Payload real do Emusys

O catalogo do Emusys separa formalmente as modalidades:

```text
GET /disciplinas?tipo=turma
GET /disciplinas?tipo=individual
```

Na verificacao de Campo Grande, a disciplina `Musicalizacao Infantil T` apareceu no catalogo de turma, enquanto `Musicalizacao Infantil IND` apareceu com outro ID no catalogo individual. Nenhum ID de disciplina apareceu nas duas listas.

Entretanto, uma aula real da disciplina de turma retornou:

```json
{
  "id": 637402,
  "tipo": "individual",
  "categoria": "normal",
  "turma_nome": "MI_Sa_09",
  "curso_id": 4,
  "curso_nome": "Musicalizacao Infantil T",
  "matricula_disciplina_id": 3743
}
```

A matricula da mesma disciplina retornou:

```json
{
  "id": 3743,
  "disciplina_id": 4,
  "nome": "Musicalizacao Infantil T",
  "tipo": "Turma",
  "nome_turma": "MI_Sa_09"
}
```

Conclusao: `aulas.tipo` descreve uma caracteristica operacional da aula e nao pode ser usado como autoridade da modalidade curricular. Catalogo e matricula concordam e possuem precedencia.

### 3.3 Atribuicao formal disponivel

O endpoint abaixo retorna os professores formalmente associados a uma disciplina no Emusys:

```text
GET /professores?curso_id={emusys_disciplina_id}
```

O sync atual de professores consulta apenas `GET /professores`. Portanto, o dado necessario existe na origem, mas ainda nao e sincronizado.

## 4. Precedencia canonica

### 4.1 Catalogo e modalidade

Fonte oficial:

```text
token da unidade
+ GET /disciplinas?tipo=turma
+ GET /disciplinas?tipo=individual
```

Chave de origem:

```text
unidade_id + emusys_disciplina_id
```

O catalogo define:

- se a disciplina e ofertada naquela unidade;
- sua modalidade oficial;
- seu nome bruto e ID Emusys;
- seu estado observado na ultima sincronizacao completa.

### 4.2 Atribuicao professor-disciplina

Fonte oficial:

```text
GET /professores?curso_id={emusys_disciplina_id}
```

Chave de origem:

```text
unidade_id + emusys_professor_id + emusys_disciplina_id
```

Esse vinculo representa uma atribuicao formal. Ele pode existir com zero alunos e, conforme o contrato aprovado, permanece visivel sem penalizar o professor.

### 4.3 Vinculo pedagogico ativo

Fonte de confirmacao:

```text
GET /matriculas
-> aluno_jornada_matricula_disciplina
```

A jornada confirma que o professor realmente possui um vinculo ativo naquela disciplina. Ela tambem permite detectar atribuicoes operacionais que o catalogo de professores ainda nao refletiu.

### 4.4 Aulas

Fonte de execucao e evidencia:

```text
GET /aulas
-> aulas_emusys
```

A aula serve para:

- agenda;
- execucao;
- presenca;
- substituicao;
- reagendamento;
- historico.

Ela nao decide a modalidade oficial do curso. Uma divergencia isolada de `aulas.tipo` nao abre excecao quando catalogo e jornada concordam.

### 4.5 Legado

`professores_cursos` permanece apenas como pista diagnostica. Nao cria atribuicao vigente, nao pontua e nao aparece na fila cotidiana da coordenacao.

## 5. Modelo de dados aditivo

### 5.1 Catalogo bruto do Emusys

Criar uma camada de origem dedicada, por exemplo:

```text
emusys_disciplinas_catalogo
```

Campos conceituais minimos:

- `unidade_id`;
- `emusys_disciplina_id`;
- `nome_emusys`;
- `modalidade`;
- `ativo_origem`;
- `primeiro_visto_em`;
- `ultimo_visto_em`;
- `sincronizado_em`;
- `payload_snapshot`;
- `hash_payload`.

Restricao:

```text
unique (unidade_id, emusys_disciplina_id)
```

### 5.2 Atribuicoes brutas do Emusys

Criar uma camada de origem dedicada, por exemplo:

```text
emusys_professor_disciplinas
```

Campos conceituais minimos:

- `unidade_id`;
- `emusys_professor_id`;
- `emusys_disciplina_id`;
- `ativo_origem`;
- `primeiro_visto_em`;
- `ultimo_visto_em`;
- `sincronizado_em`;
- `payload_snapshot`;
- `hash_payload`.

Restricao:

```text
unique (unidade_id, emusys_professor_id, emusys_disciplina_id)
```

### 5.3 Resolucao local

As camadas existentes continuam com responsabilidades distintas:

- `curso_emusys_depara`: resolve disciplina Emusys para `cursos.id`;
- `professores_unidades`: resolve professor Emusys para professor local e unidade;
- `professor_unidade_curso_modalidade`: guarda o vinculo de negocio temporal materializado;
- metas segmentadas: guardam a regra versionada de avaliacao.

As tabelas brutas nao substituem essas camadas. Elas tornam a origem reproduzivel e auditavel.

### 5.4 Temporalidade

Uma sincronizacao completa pode:

- criar uma atribuicao nova;
- manter uma atribuicao observada novamente;
- encerrar uma atribuicao que deixou de existir na origem.

Uma sincronizacao parcial ou com falha nunca encerra vinculos. O encerramento so ocorre quando todas as paginas e disciplinas da unidade forem processadas com sucesso e o resultado completo estiver registrado.

Historico nao e apagado. Cada materializacao preserva fonte, evidencia, vigencia e versao do sync.

## 6. Sincronizacao

### 6.1 Fluxo por unidade

1. carregar catalogo `turma`;
2. carregar catalogo `individual`;
3. validar que o mesmo ID nao pertence simultaneamente as duas modalidades;
4. fazer upsert do catalogo bruto;
5. para cada disciplina, consultar os professores formais;
6. fazer upsert das atribuicoes brutas;
7. resolver curso e professor por IDs, sempre escopados pela unidade;
8. confrontar com jornadas ativas;
9. materializar vinculos de alta confianca;
10. publicar apenas as excecoes nao resolvidas.

O fluxo pode ser implementado como uma Edge Function focada ou como uma extensao modular do sync atual. A escolha final deve preservar responsabilidade clara, checkpoint e observabilidade; nao deve transformar o sync de identidade de professores em uma rotina monolitica dificil de recuperar.

### 6.2 Frequencia e operacao

- sincronizacao automatica diaria;
- botao manual `Sincronizar com Emusys` para coordenacao autorizada;
- ritmo conservador de 45 a 50 requisicoes por minuto;
- retry com backoff para timeout, `429` e falha transitoria;
- checkpoint por unidade, disciplina e cursor;
- resumo final com criados, mantidos, encerrados, pendentes e erros.

Com o catalogo observado na auditoria, a carga completa das tres unidades exige aproximadamente 92 requisicoes. Em ritmo conservador, o ciclo cabe em cerca de dois minutos, sem necessidade de chamadas por aluno.

### 6.3 Idempotencia

Reexecutar o mesmo ciclo nao duplica catalogo, atribuicoes, vinculos ou excecoes. Hash e chaves naturais permitem distinguir dado inalterado de alteracao real.

## 7. Regras de materializacao

### 7.1 Automaticas

| Evidencia | Resultado |
|---|---|
| catalogo + atribuicao formal + identidades resolvidas | vinculo ativo, confianca alta |
| catalogo + jornada ativa + identidades resolvidas | vinculo ativo, confianca alta, com alerta se a atribuicao formal estiver ausente |
| jornada futura de alta confianca | materializacao automatica |
| vinculo formal com zero alunos | visivel e nao punitivo |
| aula isolada de outro professor | evidencia de substituicao, nao troca automatica |

### 7.2 Excecoes verdadeiras

Entram na fila:

- professor Emusys sem identidade local resolvida;
- disciplina Emusys sem de-para canonico;
- disciplina presente em matricula mas ausente do catalogo oficial apos sync completo;
- contradicao entre atribuicao formal e jornada ativa que persiste apos sync completo;
- um mesmo ID de disciplina classificado nas duas modalidades;
- sobreposicao temporal impossivel que nao pode ser resolvida automaticamente.

### 7.3 Itens que nao entram na fila

- divergencia isolada de `aulas.tipo`;
- linha ja resolvida;
- vinculo historico encerrado;
- pista da tabela legada `professores_cursos`;
- vinculo de jornada de alta confianca aguardando apenas materializacao;
- curso formal com zero alunos.

## 8. Experiencia da configuracao

### 8.1 Estrutura da tela

A pagina `Configuracoes de Performance` fica organizada em quatro blocos:

1. **Versao e governanca** - ativa, rascunho, vigencia e justificativa;
2. **Pesos dos pilares** - sliders que totalizam 100%;
3. **Metas por unidade, curso e modalidade** - matriz editavel;
4. **Excecoes de vinculos Emusys** - painel recolhido, exibido apenas quando houver pendencias reais.

Metas e conciliacao nao compartilham estado de bloqueio. Uma alteracao de meta nao desabilita a analise de excecoes.

### 8.2 Metas sempre editaveis por versao

A configuracao ativa continua somente leitura. O comando principal e `Criar nova versao`.

Ao criar um rascunho:

- pesos e metas da ativa sao clonados;
- a coordenacao altera apenas o que precisa;
- salvamentos parciais sao permitidos;
- a simulacao mostra impacto e pendencias;
- a ativacao exige matriz completa e valida;
- a nova vigencia nao reescreve snapshots fechados.

Portanto, as metas nao sao um preenchimento unico. Elas permanecem governaveis ao longo do tempo, com historico completo.

### 8.3 Regra ausente

Uma regra ausente deve aparecer como:

```text
Capacidade: -
Meta media/turma: -
Meta carteira: -
Estado: Nao configurada
```

Ela nunca nasce como `Configurada` com zero.

O rascunho nao e marcado como alterado apenas porque a UI materializou visualmente segmentos ausentes. `dirty` so muda depois de uma acao real do usuario.

### 8.4 Matriz de metas

A matriz usa:

- abas por unidade;
- filtros por curso, modalidade e estado;
- contadores de configuradas, pendentes e nao ofertadas;
- edicao inline com validacao contextual;
- destaque de erro apenas depois de edicao ou tentativa de simulacao/ativacao;
- salvamento parcial sem transformar toda a tela em erro;
- acao explicita `Copiar metas`, com origem, destino e confirmacao;
- acao em lote para marcar combinacoes realmente nao ofertadas;
- resumo fixo de progresso e erros enquanto a lista rola.

Copias nunca sao silenciosas. A interface mostra quantas regras serao alteradas e exige confirmacao antes de aplicar no rascunho.

### 8.5 Excecoes de vinculos

O bloco atual passa a se chamar `Excecoes de vinculos Emusys`.

Comportamento:

- recolhido por padrao quando nao houver excecao;
- badge com quantidade acionavel;
- filtros apenas por unidade, professor, tipo de excecao e estado;
- motivo em linguagem direta;
- evidencias tecnicas em area expansivel;
- sugestao automatica quando houver uma opcao segura;
- acao humana somente para ambiguidade real;
- aba avancada de auditoria para resolvidos e historico, fora do fluxo cotidiano;
- pistas legadas disponiveis apenas no diagnostico avancado.

### 8.6 Design System e acessibilidade

Todos os controles desta experiencia devem usar componentes do Design System:

- `Select` baseado em Radix para opcoes;
- componente reutilizavel de `Slider`, com trilho, preenchimento, thumb, foco e teclado;
- `DatePicker` do sistema para vigencia;
- `Input`, `Button`, `Badge`, `Tooltip`, `Dialog` e `Collapsible` existentes;
- estados de loading, vazio, erro, sucesso e desabilitado coerentes;
- foco visivel, labels programaticos e navegacao por teclado;
- dimensoes estaveis em desktop e mobile;
- nenhum `select`, `input[type=range]` ou seletor de data nativo visivel neste fluxo.

O componente de slider deve exibir valor numerico e permitir ajuste por teclado. O uso de `color-scheme: dark` e apenas fallback defensivo, nao substitui o componente do sistema.

## 9. Seguranca

- tabelas novas nascem com RLS;
- `public` e `anon` nao recebem `SELECT` ou `EXECUTE`;
- leitura e escrita respeitam unidades autorizadas;
- alteracao de metas, materializacao e revisao exigem `professores.editar`;
- sync usa `service_role` dentro da Edge Function;
- tokens Emusys permanecem somente em secrets;
- views usam `security_invoker` quando aplicavel;
- RPCs `security definer` possuem `search_path` fixo e guard explicito;
- payloads pessoais nao sao copiados para logs de erro;
- toda decisao manual registra usuario, data, evidencia e valor anterior.

## 10. Compatibilidade e nao regressao

Durante a implantacao:

- a configuracao V3 ativa atual permanece intacta;
- o novo rascunho nao e ativado automaticamente;
- V2 e rollback continuam disponiveis;
- snapshots fechados nao sao recalculados;
- formulas e valores brutos canonicos nao mudam;
- relatorios gerencial, administrativo e comercial nao mudam de fonte;
- Dashboard e Analytics nao migrados permanecem inalterados;
- churn e Random Forest permanecem fora do escopo;
- `aulas_emusys`, `aluno_presenca` e `anotacoes_fabio` nao recebem escrita deste fluxo;
- nenhuma tabela legada e apagada, renomeada ou reativada.

A segmentacao continua derivando dos mesmos valores observados canonicos. O catalogo define o contexto e a meta; nao inventa alunos, turmas, ocupacoes ou conversoes.

## 11. Testes obrigatorios

### 11.1 Origem e sincronizacao

1. disciplina de turma cuja aula retorna `tipo=individual` permanece turma e nao abre excecao;
2. IDs de disciplina iguais em unidades diferentes permanecem escopados;
3. disciplina presente nos dois catalogos bloqueia materializacao e abre excecao;
4. professor multiunidade resolve identidades separadamente;
5. professor formal com zero alunos permanece visivel e nao punitivo;
6. sync repetido e idempotente;
7. falha parcial nao encerra atribuicoes existentes;
8. disciplina ou professor sem de-para abre uma unica excecao;
9. jornada futura de alta confianca e materializada automaticamente;
10. aula de substituto nao troca o titular;
11. pista legada nao entra na fila operacional;
12. payload bruto e hash permitem reproduzir a decisao.

### 11.2 Configuracao e governanca

13. regra ausente aparece vazia, nunca zero configurado;
14. carregar a pagina nao marca o rascunho como alterado;
15. salvar rascunho incompleto e permitido;
16. simular ou ativar com regra obrigatoria ausente e bloqueado com mensagem objetiva;
17. editar metas depois da ativacao cria nova versao;
18. versao ativa e snapshots fechados permanecem imutaveis;
19. copiar metas exige destino e confirmacao;
20. curso nao ofertado tem metas nulas;
21. meta media/turma acima da capacidade e rejeitada;
22. metas diferentes por unidade, curso e modalidade permanecem independentes.

### 11.3 Interface

23. nao ha controle nativo visivel de select, range ou data nesse fluxo;
24. sliders funcionam por mouse, toque e teclado;
25. labels, foco e mensagens de erro sao acessiveis;
26. tabelas nao quebram largura nem sobrepoem texto em desktop e mobile;
27. conciliacao continua utilizavel com rascunho de metas alterado;
28. estados vazio, loading, erro, sucesso e retry sao verificaveis no navegador;
29. contadores refletem apenas excecoes verdadeiras;
30. a tela preserva filtros e posicao apos salvar uma linha.

### 11.4 Nao regressao

31. os 182 falsos conflitos deixam de aparecer sem apagar sua evidencia historica;
32. as 75 pistas legadas saem da fila operacional;
33. as tres pendencias de alta confianca sao materializadas automaticamente;
34. cards e relatorios nao migrados mantem os mesmos valores;
35. build, suite atual e novos testes passam;
36. comparacao ponta a ponta confirma o mesmo professor/unidade/curso na configuracao, Performance, modal e relatorio.

## 12. Rollout

1. registrar baseline da fila, metas, vinculos e consumidores;
2. criar tabelas privadas de catalogo e atribuicao de origem;
3. implementar sync em modo diagnostico, sem materializar ou encerrar vinculos;
4. validar uma unidade contra o Emusys;
5. executar as tres unidades e comparar catalogo, atribuicoes e jornadas;
6. habilitar materializacao de alta confianca;
7. substituir a leitura da fila pelo modelo de excecoes;
8. corrigir semantica de regra ausente e isolamento de estados na UI;
9. aplicar os componentes do Design System;
10. criar e salvar um rascunho real da configuracao;
11. simular os tres escopos unitarios e o consolidado;
12. validar com direcao e coordenacao;
13. ativar separadamente, com vigencia futura;
14. migrar consumidores individualmente, cada um com rollback.

Rollback:

- interromper o novo sync;
- desativar materializacao automatica;
- restaurar a RPC anterior da fila;
- manter catalogo bruto e historico para auditoria;
- descartar o rascunho sem afetar a configuracao ativa;
- nao apagar evidencias nem snapshots.

## 13. Criterios de aceite

O desenho esta implementado quando:

- catalogo e modalidade sao sincronizados por ID e unidade;
- atribuicoes formais de professores sao sincronizadas por disciplina;
- `aulas.tipo` nao cria conflito de modalidade contra catalogo e jornada;
- os 182 falsos conflitos deixam de ocupar a fila;
- as 75 pistas legadas ficam apenas no diagnostico avancado;
- somente excecoes verdadeiras exigem acao humana;
- pendencias de alta confianca sao materializadas sem trabalho manual;
- as 47 regras ausentes aparecem vazias e editaveis, sem zero fabricado;
- metas podem ser alteradas futuramente por nova versao;
- rascunho incompleto pode ser salvo, mas nao ativado;
- conciliacao nao e bloqueada por alteracao de meta;
- os controles seguem o Design System em desktop e mobile;
- seguranca, idempotencia e falha parcial foram testadas;
- consumidores e relatorios nao relacionados nao regrediram.

## 14. Proxima etapa

Depois da aprovacao deste documento, o proximo artefato e o plano de implementacao detalhado. Ele deve listar migrations, Edge Functions, RPCs, componentes, testes, checkpoints e rollback por etapa.

Nenhuma mudanca de banco, sync ou consumidor deve ser executada antes desse plano.
