# Health Score Professor V3 - Gate 8 modal e Performance

**Data:** 2026-07-18

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status:** checkpoint tecnico em homologacao; Gate 8 ainda aberto

## 1. Escopo

Esta entrega migra em homologacao dois consumidores para leitura V3:

- modal individual, sob `VITE_HEALTH_SCORE_V3_MODAL_ENABLED`;
- tabela Performance e rankings, sob
  `VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED`.

Continuam inalterados:

- relatorios individual e da coordenacao;
- Dashboard e Analytics;
- consumidores do Fabio e LA Teacher;
- motor e consumidores V2 produtivos.

## 2. Leitura auditavel

A RPC `get_health_score_professor_v3_snapshot_modal` entrega o ultimo snapshot
da competencia no escopo exato solicitado:

- unidade: filtra somente o `unidade_id` recebido;
- consolidado: exige `unidade_id is null`;
- professor e competencia sao obrigatorios;
- a revisao mais recente do snapshot e selecionada sem fan-out entre escopos.

Para cada pilar, o retorno preserva:

- valor real e nota sem substituir `null` por zero;
- numerador, denominador e tamanho da amostra;
- peso original, peso disponivel e contribuicao;
- estado de base e publicabilidade;
- fonte, versao da regra e detalhes;
- motivo de exclusao ou bloqueio.

A RPC batch `get_health_score_professor_v3_performance` entrega a mesma
evidencia para todos os professores da competencia e do escopo exato. Ela:

- seleciona somente a ultima revisao de cada professor;
- nao mistura Consolidado com unidade;
- retorna as seis metricas sem `coalesce` para zero;
- faz uma unica chamada por recorte da tabela, evitando uma RPC por linha.

## 3. Seguranca

As duas RPCs usam `SECURITY DEFINER`, `search_path = public, pg_temp` e o guard
`fn_health_score_professor_v3_ator_gerenciador()` antes de ler os snapshots.

Permissoes conferidas:

- `public`: sem `EXECUTE`;
- `anon`: sem `EXECUTE`;
- `authenticated`: com `EXECUTE`, sujeito ao guard;
- `service_role`: com `EXECUTE`.

As tabelas internas continuam sem leitura direta pelo navegador.

## 4. Frontend e rollback

Quando a flag do modal esta ativa, ele mostra:

- selo `V3 em homologacao`;
- recorte de competencia, unidade ou consolidado e versao da configuracao;
- score e cobertura somente quando disponiveis;
- os seis pilares com valor, amostra, base, cobertura do pilar, fonte e motivo;
- `Sem base` quando o snapshot nao autoriza publicacao.

O hook usa uma chave completa de requisicao e descarta respostas obsoletas. Uma
troca rapida de professor, competencia ou unidade mascara imediatamente o
resultado anterior e nao pode sobrescrever o recorte atual com a resposta
atrasada da selecao anterior. Isso elimina o frame intermediario em que o
cabecalho ja mostrava o novo escopo, mas os valores ainda eram do escopo antigo.

Quando o valor trimestral ainda nao e pontuavel, o modal pode mostrar um
`Valor observado` canonico sem converte-lo em nota:

- Numero de alunos: ultimo fechamento mensal disponivel, com o contador de
  fechamentos do trimestre;
- Presenca: leitura mensal da camada semantica, com cobertura e eventos
  classificados, mantendo a pontuacao bloqueada ate `03/08/2026`.

A publicacao do observado de Presenca respeita a politica temporal versionada
em `presenca_politicas_confiabilidade`:

- Barra e Recreio: o percentual observado e publicado normalmente;
- Campo Grande: o percentual permanece nos detalhes do snapshot para auditoria,
  mas o card mostra `Em auditoria` em vez de publicar o numero como indicador;
- Consolidado: fica `Em auditoria` quando o professor possui eventos observados
  em alguma unidade cuja politica exige revisao operacional.

O frontend nao possui regra fixa pelo nome `Campo Grande`. A decisao chega no
snapshot pelos campos `observacao_publicacao` e
`observacao_exige_revisao_operacional`. A regra afeta somente a publicacao do
observado de junho/julho; a vigencia pontuavel do pilar continua em
`03/08/2026`.

Quando a flag vale explicitamente `false`, o caminho V3 fica desligado e o
modal preserva a apresentacao V2 existente. Em desenvolvimento, a homologacao
fica ligada por padrao, salvo esse desligamento explicito.

Quando a flag da Performance esta ativa:

- a tabela mostra Health, Alunos, Media/Turma, Retencao, Permanencia,
  Conversao, Presenca e Status usando somente snapshots V3;
- `Fator` e `Saidas`, conceitos da composicao V2, nao aparecem na grade V3;
- `Sem base`, `provisorio`, `observado` e `Em auditoria` permanecem estados
  distintos;
- score e metrica so entram em ranking quando o snapshot os declara
  publicaveis;
- erro da RPC V3 e exibido; nao existe retorno silencioso para numeros V2.

Quando `VITE_HEALTH_SCORE_V3_PERFORMANCE_ENABLED=false`, a tabela e os rankings
voltam integralmente ao caminho V2. Em producao, a V3 exige a flag
explicitamente `true`; em desenvolvimento, fica ligada por padrao para
homologacao.

## 5. Evidencia remota

Para Peterson Biancamano em julho de 2026:

- consolidado: media/turma `1,42` (`37/26`), permanencia `14,51 meses`
  (`57` vinculos), numero de alunos observado `36` e presenca observada
  `30,83%`, com cobertura de `84,51%` (`120/142`);
- Campo Grande: media/turma `1,44` (`26/18`), permanencia `15,19 meses`
  (`43` vinculos), numero de alunos observado `26` e presenca observada
  `8,64%`, com cobertura de `79,41%` (`81/102`);
- Barra: media/turma `1,38` (`11/8`), permanencia `12,41 meses`
  (`14` vinculos), numero de alunos observado `10` e presenca observada
  `76,92%`, com cobertura de `97,50%` (`39/40`);
- Recreio: nenhuma linha, como esperado para o escopo atual;
- conversao com amostra `1/1` permanece `sem base` por nao atingir tres
  experimentais;
- numero de alunos e presenca ficam visiveis como observados, mas permanecem
  fora do score enquanto as regras de fechamento nao forem satisfeitas;
- retencao em revisao fica fora do score, mesmo exibindo o valor bruto.

Na revisao 3, a politica de publicacao da Presenca ficou persistida assim:

- Barra: `76,92%`, `observacao_publicacao = normal`;
- Campo Grande: `8,64%` preservado nos detalhes,
  `observacao_publicacao = em_auditoria`;
- Consolidado: `30,83%` preservado nos detalhes,
  `observacao_publicacao = em_auditoria` por conter Campo Grande;
- Recreio: os professores com observado retornam `normal`; por exemplo, Caio
  Tenorio retorna `88,89%` e Isaque Mendes `75,76%`.

A materializacao criou `129` snapshots na revisao 3 (`120` provisorios e `9`
em maturacao), mantendo as revisoes 1 e 2 intactas.

Os valores `1,44` e `15,2 meses` pertencem a Campo Grande. Os valores `1,42` e
`14,5 meses` pertencem ao consolidado Barra + Campo Grande. A diferenca e de
escopo, nao oscilacao do calculo.

## 6. Validacao visual

No Chrome autenticado em `http://localhost:5175/app/professores` foram
confirmados:

- recorte exato de Campo Grande;
- recorte exato Consolidado;
- seis cards preenchidos com valores oficiais ou observados, sem nota
  fabricada;
- Campo Grande aberto diretamente com `1,44`, `15,2 meses`, `26` alunos e
  Presenca como `Em auditoria`, sem publicar os `8,64%` preservados no
  snapshot;
- Consolidado aberto com `1,42`, `14,5 meses`, `36` alunos e Presenca como
  `Em auditoria`, sem publicar os `30,83%` preservados no snapshot;
- Barra mantendo `76,9%` como valor observado normal;
- Recreio mantendo `88,9%` como valor observado normal no caso Caio Tenorio;
- ausencia de sobreposicao ou texto cortado no modal desktop;
- motivo de bloqueio visivel no cabecalho;
- separacao entre cobertura total e peso disponivel de cada pilar;
- permanencia exibida como meses e vinculos elegiveis, sem expor a soma bruta
  como se fosse denominador;
- tabela Performance com a coluna Permanencia e sem Fator/Saidas;
- rankings vazios com `Sem ranking publicavel` quando nao ha base;
- Campo Grande com Presenca `Em auditoria` em todas as linhas com observado;
- Barra e Recreio com percentuais `observado` visiveis;
- 19 professores na Barra, 32 em Campo Grande, 24 no Recreio e 48 ativos no
  Consolidado, sem fan-out de unidade;
- modal V3 aberto a partir da propria tabela Performance;
- zero erro de console no fluxo autenticado;
- V2 preservado nas secoes ainda fora do escopo deste checkpoint.

Evidencias visuais locais:

- `output/playwright/health-score-v3-performance-campo-grande.png`;
- `output/playwright/health-score-v3-performance-recreio-modal.png`.

## 7. Verificacoes

- testes direcionados de contrato, frontend e Performance: `29/29`;
- `node --test tests/*.test.mjs`: `257/257`;
- `npm run build`: exit `0`;
- `git diff --check`: sem erro de whitespace;
- quatro migrations aplicadas no Supabase remoto;
- materializacao de julho concluida com `129` snapshots na revisao 3 e
  preservacao das revisoes 1 e 2;
- leitura real da RPC nos recortes Consolidado, Barra, Campo Grande e Recreio;
- validacao visual em navegador autenticado.

## 8. Pendencia controlada

Os seis cards possuem agora leitura util e auditavel. Isso nao significa que os
seis pilares ja sejam pontuaveis: Numero de alunos tem somente `1/3`
fechamentos trimestrais, Presenca inicia pontuacao em `03/08/2026`, Conversao
nao atingiu a amostra minima e Retencao ainda possui vinculos em revisao.

Assim, o estado incompleto foi validado de ponta a ponta sem fabricar score. A
Task 18 esta concluida em homologacao, com rollback independente. A validacao
visual de um professor com todos os pilares publicaveis permanece aberta para
o primeiro trimestre que satisfizer as bases e fechamentos.

O Gate 8 ainda nao esta fechado. Permanecem fora deste checkpoint:

1. Task 19: configuracao V3 oficial, com rascunho, simulacao e ativacao
   governada;
2. Task 20: relatorios individual e da coordenacao consumindo snapshot V3;
3. Task 21: Dashboard, Analytics, Fabio e LA Teacher, um consumidor por vez;
4. homologacao de um snapshot com base completa, quando o dado existir;
5. encerramento do V2 somente depois da migracao e observacao de todos os
   consumidores.
