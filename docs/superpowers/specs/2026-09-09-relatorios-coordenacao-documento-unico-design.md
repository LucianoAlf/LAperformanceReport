# Relatorios da Coordenacao - Documento Unico e Historico Consistente

**Data:** 2026-09-09

**Status:** aprovado pelo Luciano em 2026-09-09

## Objetivo

Fazer os cinco relatorios da Coordenacao apresentarem a mesma fotografia exibida
na pagina de Professores, com as mesmas regras e os mesmos fechamentos usados
pelos relatorios gerenciais. Nenhum consumidor pode recalcular indicadores,
consultar tabelas operacionais ou substituir ausencia de informacao por zero.

Na interface e nos textos enviados ao time, os termos tecnicos de implementacao
nao aparecem. O coordenador ve periodo, data de atualizacao, valores, motivos
operacionais claros e a distincao entre ciclo em andamento e ciclo fechado.

## Problema atual

O leitor `get_relatorio_coordenacao_canonico_v3` ainda monta o resultado no
momento do clique. Ele combina a fotografia do Health Score com consultas de
carteira, movimentacoes administrativas e matriculas comerciais atuais. Os
formatadores transformam esse resultado em cinco relatorios e a Edge acrescenta
narrativa.

Essa composicao tardia produz quatro classes de defeito:

1. um periodo fechado pode mudar quando o cadastro atual muda;
2. consumidores diferentes podem escolher universos ou regras diferentes;
3. consultas amplas no clique podem exceder o tempo limite;
4. mensagens de ausencia, pendencia e elegibilidade podem divergir do painel.

O relatorio gerencial ja oferece o modelo de referencia: fatos fechados ficam em
documentos versionados e a leitura publica nao recompõe os KPIs.

## Principios obrigatorios

- Uma fotografia publicada por unidade ou consolidado, periodo e periodicidade.
- Os cinco relatorios leem exatamente o mesmo `documento_id`, versao e hash.
- A pagina de Professores e os relatorios usam a mesma fotografia de desempenho.
- Relatorios gerenciais e da Coordenacao apontam para os mesmos fechamentos de
  origem quando compartilham um fato.
- Percentuais de ciclo sao derivados da soma de numeradores dividida pela soma
  de denominadores; nunca da media simples de percentuais mensais.
- Contagens usam a chave de negocio do dominio e nao nomes como identidade.
- Valor ausente permanece ausente. Zero so e publicado quando a fonte confirma
  zero para aquele universo.
- A IA escreve apenas narrativa. Nomes, valores, rankings, totais e equacoes sao
  formatados deterministicamente.
- Versoes fechadas nao sao alteradas ou apagadas. Correcao historica cria uma
  nova versao que referencia a anterior.
- O corte para os consumidores e atomico: o V3 atual so passa a delegar ao novo
  leitor depois da carga e das validacoes de paridade.

## Documento publicado

O contrato interno passa a usar `schema_version = 4`. A infraestrutura de
`fechamento_mensal_snapshots` sera reaproveitada:

- `relatorio_coordenacao` identifica a fotografia mensal;
- um dominio proprio identifica a fotografia de ciclo, evitando colisao com o
  fechamento mensal existente;
- cada execucao insere uma nova versao e conserva as anteriores;
- um indice parcial atende a leitura por periodo, escopo, unidade, dominio,
  status e versao decrescente;
- funcoes produtoras permanecem internas e executaveis apenas pelo
  `service_role`;
- o leitor publico preserva a autorizacao por unidade ja usada pelo V3.

O envelope contem:

- `documento`: id, versao, hash, status, gerado_em e supersede_id;
- `periodo`: intervalo nominal, data efetivamente acumulada, periodicidade,
  unidade, estado e data de atualizacao;
- `fontes`: ids, versoes e hashes dos fechamentos usados;
- `resumo_equipe`;
- `professores`, com a matriz completa de indicadores e os estados de cada um;
- `classificacao_painel`, com todos que possuem nota, na mesma ordem da tela;
- `ranking_premiacao`, somente quando o ciclo oficial estiver fechado e os gates
  de premiacao estiverem habilitados;
- `destaques_indicadores`, com ate dez professores por indicador;
- `retencao_permanencia`, `presenca`, `experimentais`, `carteira_carga`,
  `saidas_retencao`, `agenda_treinamentos` e `qualidade_dados`;
- `validacoes`, com as equacoes e contagens que fecharam na publicacao.

Os metadados tecnicos ficam no contrato e nos logs. Os formatadores nao os
exibem ao coordenador.

## Fontes e regras por bloco

### Roster, nota e indicadores pedagogicos

O roster e a matriz de desempenho vem da mesma fotografia usada pela pagina de
Professores. Para um periodo fechado, a lista de professores do proprio retrato
historico e preservada; o cadastro ativo atual nao pode apagar ou acrescentar
pessoas retroativamente.

A classificacao do painel inclui todos os professores com nota observada e usa
ordenacao deterministica: nota decrescente e, nos empates, nome. A premiacao
oficial e um conjunto separado, sujeito aos gates de fechamento. Um professor
sem nota permanece na lista da equipe, fora da classificacao, sem receber zero.

### Carteira e carga

A carteira exclui atividade extra da contagem regular e apresenta atividade
extra separadamente quando houver. Para Jun-Jul-Ago/2026, a versao retificada
reconstroi a contagem a partir do detalhe historico e nao aceita a precedencia do
total antigo contaminado.

No ciclo, cada metrica conserva sua agregacao governada. Estoques mensais nao
sao somados como pessoas unicas; ocupacoes e turmas usam seus numeradores e
denominadores do periodo. O documento registra esses componentes para permitir
prova posterior.

### Presenca

A taxa e `presencas_confirmadas / chamadas_elegiveis`. Mes futuro nao entra no
denominador do ciclo aberto. Calendario sem aula elegivel e um estado operacional
valido e nao uma pendencia de dados. Pendencia so existe quando havia evidencia
esperada e a fonte realmente nao a entregou.

### Retencao, saidas e MRR

Somente movimentacoes vigentes e validas entram no periodo. Linhas anuladas nao
entram, mesmo que um helper legado as classifique como elegiveis. Atividade
extra e tipos de matricula excluidos continuam seguindo o predicado unico do
dominio.

MRR ausente permanece `null` e e contado em `movimentos_sem_valor_mrr`; nao vira
`R$ 0,00`. Totais monetarios somam somente valores conhecidos e informam a
cobertura monetaria.

### Experimentais, conversao e Matriculador

Conversao e Matriculador permanecem indicadores distintos:

- conversao usa matriculas pos-experimental divididas pelas experimentais
  elegiveis;
- Matriculador usa quantidade absoluta de matriculas comerciais atribuidas ao
  professor que realizou a experimental, conforme a regra aprovada.

Em periodo fechado, as matriculas vem do fechamento comercial da mesma unidade
e competencia. O cadastro atual de `alunos` nao pode alterar o resultado. No
ciclo, os meses sao combinados pelas identidades comerciais registradas nos
fechamentos, evitando dupla contagem.

### Relatorios gerenciais

Um fato compartilhado nao sera copiado de um texto gerencial nem recalculado em
paralelo. A Coordenacao referencia o fechamento Administrativo, Comercial ou
Gerencial que detem o fato e registra seu id e hash.

Antes da publicacao de Jun-Jul-Ago, um validador compara os campos compartilhados
entre os documentos. Se o fechamento gerencial publicado contrariar a regra
vigente, ele recebe uma retificacao append-only pelos mecanismos existentes. A
Coordenacao somente e publicada depois que a equacao e os hashes fecharem.

## Periodos abertos

Set-Out-Nov/2026 e materializado diariamente nas tres unidades e no consolidado.
O intervalo nominal continua sendo o ciclo completo, mas `dados_ate` limita os
fatos ao dia corrente:

- em setembro, entram apenas fatos de setembro ate a data de corte;
- em outubro, entram setembro e outubro ate a data de corte;
- em novembro, entram setembro, outubro e novembro ate a data de corte.

O texto publico usa `Ciclo em andamento` e informa a atualizacao. Nao ha
premiacao oficial antes do fechamento. A ausencia de outubro ou novembro antes
de esses meses comecarem nao gera aviso, zero ou estado de auditoria.

O job do documento roda depois das materializacoes pedagogicas e dos
fechamentos/sincronizacoes necessarios. Cada escopo e isolado para que a falha de
uma unidade nao invalide as demais. A execucao e idempotente: payload igual nao
cria uma nova versao.

## Retificacao Jun-Jul-Ago/2026

A decisao anterior de preservar os totais antigos de carteira deixa de valer
para a versao publica mais recente. As versoes antigas continuam imutaveis para
auditoria.

A retificacao ocorre nesta ordem:

1. medir Administrativo, Comercial, Gerencial, Health Score e Coordenacao por
   unidade e competencia;
2. produzir um diff nominal e agregado sem escrita;
3. retificar, quando necessario, os documentos de origem compartilhados;
4. publicar a nova versao mensal da Coordenacao;
5. publicar o ciclo Jun-Ago a partir das versoes mensais confirmadas;
6. validar as tres unidades e o consolidado;
7. somente entao trocar o leitor usado pela interface e pela Edge.

Nenhuma retificacao inventa fatos ausentes. Uma fonte insuficiente bloqueia a
publicacao daquele escopo e mantem o leitor antigo ate a correcao ser comprovada.

## Apresentacao publica

Os relatorios nao exibem `canonico`, `snapshot`, `RPC`, `migration`, hash, nome
de tabela, nome de funcao, `sem_pilares_validos` ou `dados em auditoria`.

Estados publicos permitidos incluem:

- valor calculado;
- nao realizou evento no periodo;
- calendario sem aulas elegiveis;
- informacao ainda nao recebida para um evento esperado;
- sem nota no periodo;
- ciclo em andamento;
- ciclo fechado.

Os destaques por indicador usam Top 10. Empates sao estaveis e nenhum item nulo
e transformado em zero para entrar no ranking.

## Consumidores

Os cinco relatorios do modal e a narrativa da Edge recebem o mesmo objeto V4.
O frontend nao recebe permissao direta de escrita na estrutura de publicacao.
O entrypoint V3 e mantido por compatibilidade, mas apos o corte apenas delega ao
leitor V4. Formatadores antigos deixam de ser importados e testes impedem sua
reintroducao.

## Desempenho e seguranca

- O clique do usuario faz uma leitura indexada de um unico documento.
- Nenhuma funcao publica percorre `movimentacoes_admin`, `alunos`, aulas ou
  jornadas durante a geracao do texto.
- O trabalho pesado acontece no produtor interno, fora da requisicao do usuario.
- A captura usa transacoes curtas, advisory lock por periodo/escopo e versao
  calculada sob o mesmo lock.
- A estrutura permanece com RLS, sem acesso de `anon` e sem porta de escrita para
  `authenticated`.
- Funcoes `security definer` revogam `PUBLIC` explicitamente, fixam
  `search_path` e validam o ator.

## Gates de validacao

O corte publico exige todos os gates abaixo:

1. testes de contrato estaticos e PostgreSQL real, escritos antes da
   implementacao;
2. hash recalculado igual ao hash armazenado;
3. um documento selecionado de forma deterministica por escopo e periodo;
4. roster do documento igual ao roster exibido no painel;
5. classificacao completa igual a ordem do painel;
6. Top 10 de cada indicador derivado do mesmo array de professores;
7. equacoes de presenca, conversao, media por turma, retencao e MRR fechadas;
8. nenhuma movimentacao anulada e nenhuma atividade extra indevida;
9. nenhuma coercao de `null` para zero;
10. paridade dos fatos compartilhados com a versao vigente dos relatorios
    gerenciais;
11. carga inicial validada para Jun, Jul, Ago, ciclo Jun-Ago e ciclo aberto
    Set-Nov, nas tres unidades e no consolidado;
12. leitura repetida sem timeout e dentro do orcamento definido pelo teste de
    desempenho;
13. build, testes completos e verificacao autenticada no navegador real, com
    recarga, DOM, console e rede.

## Rollout e reversao

O rollout tem dois cortes independentes:

1. **Sombra:** criar produtor, leitor, indice e documentos V4; manter V3 publico
   inalterado; medir diff e latencia.
2. **Publicacao:** depois dos gates, substituir o corpo do V3 por uma delegacao
   ao V4 e publicar os formatadores ajustados.

Reverter o segundo corte restaura somente o delegador V3; nao apaga documentos,
retificacoes ou auditoria. Os relatorios gerenciais nao sao alterados pelo
rollback da Coordenacao.

## Fora de escopo

- mudar pesos, metas ou formula do Health Score;
- promover ciclo aberto a ranking ou premiacao oficial;
- alterar dados brutos do Emusys para fazer uma equacao fechar;
- reescrever ou excluir versoes historicas;
- expor metadados tecnicos ao time da Coordenacao.
