# Presenca Confiavel por Unidade e Conciliacao Operacional

**Data:** 2026-07-15  
**Status:** desenho aprovado, aguardando plano de implementacao  
**Decisao de negocio:** Alf  
**Implementacao:** Codex

## 1. Objetivo

Liberar os indicadores de presenca da pagina de Professores sem reescrever a
evidencia bruta do Emusys e sem apresentar uma inferencia tecnica como se fosse
uma certeza universal.

Para junho e julho de 2026, a coordenacao confirmou que os estados `presente` e
`ausente` do Emusys devem ser tratados como resultado pedagogico nas tres
unidades. Campo Grande tera uma camada adicional de conciliacao para que a ADM
possa confirmar a chamada ou corrigir um aluno individualmente.

## 2. Decisoes confirmadas

### Barra e Recreio

- Periodo: `2026-06-01` a `2026-07-31`, inclusive.
- `presente` no Emusys continua como `presente`.
- `ausente` no Emusys passa a `falta_confirmada`.
- Aulas canceladas e justificadas preservam sua classificacao atual.
- A decisao se apoia no processo operacional atestado em 15/07/2026 por Arthur
  (ADM Barra) e Fernanda (ADM Recreio), confirmado por Alf.
- Nao sera criada pendencia operacional para essas duas unidades nesse recorte.

### Campo Grande

- Periodo: `2026-06-01` a `2026-07-31`, inclusive.
- `presente` no Emusys continua como `presente`.
- `ausente` no Emusys passa imediatamente a `falta_confirmada`, liberando os
  indicadores da pagina de Professores.
- Cada ausencia elegivel tambem aparece em `Alunos > Conciliacao > Presencas a
  confirmar`.
- A conciliacao nao bloqueia a publicacao do indicador. Ela e uma revisao
  operacional posterior.
- Confirmar preserva o dado bruto e registra a revisao.
- Corrigir para presente usa a retificacao auditada existente e registra quem,
  quando e por que corrigiu.

## 3. O que nao muda

- `public.aluno_presenca` continua sendo a evidencia bruta/operacional.
- Nenhum backfill atualiza linhas brutas apenas para fabricar confianca.
- `aluno_presenca_retificacoes` continua sendo a trilha append-only das
  correcoes administrativas.
- Cancelamentos e justificativas continuam fora da regra de falta.
- Presencas registradas pelo LA Teacher continuam com precedencia sobre a
  politica de unidade.
- O pipeline de churn permanece pausado e fora deste escopo.
- Relatorios administrativos, comerciais e gerenciais nao recebem mudanca de
  regra fora dos consumidores pedagogicos de presenca.

## 4. Abordagens consideradas

### A. Alterar em massa `aluno_presenca`

Rejeitada. Apagaria a diferenca entre o que veio do Emusys e o que foi decidido
pela coordenacao, alem de tornar o historico dificil de auditar.

### B. Hardcode de nomes de unidade na view

Rejeitada. Funcionaria no curto prazo, mas esconderia a decisao de negocio
dentro de SQL e dificultaria expirar ou ampliar o periodo com seguranca.

### C. Politica versionada + semantica + revisao derivada

Escolhida. Preserva a origem, registra a decisao com periodo e evidencia,
atualiza os consumidores canonicos e cria a fila de Campo Grande sem inserir
milhares de pendencias fisicas desnecessarias.

## 5. Arquitetura escolhida

### 5.1 Politica de confiabilidade

Nova tabela sugerida: `public.presenca_politicas_confiabilidade`.

Campos centrais:

- `id uuid`;
- `unidade_id uuid`;
- `data_inicio date`;
- `data_fim date`;
- `ausencia_emusys_resultado text`;
- `exige_revisao_operacional boolean`;
- `decidido_em date`;
- `decidido_por text`;
- `evidencia text`;
- `regra_versao text`;
- `ativa boolean`;
- `created_at timestamptz`.

Restricoes:

- periodo valido (`data_fim >= data_inicio`);
- uma unica politica ativa e aplicavel por unidade/data;
- valores fechados para o resultado da ausencia;
- escrita somente por migration/service role;
- leitura apenas pelas camadas canonicas.

Registros iniciais:

| Unidade | Inicio | Fim | Resultado de `ausente` | Revisao |
|---|---|---|---|---|
| Barra | 2026-06-01 | 2026-07-31 | falta_confirmada | nao |
| Recreio | 2026-06-01 | 2026-07-31 | falta_confirmada | nao |
| Campo Grande | 2026-06-01 | 2026-07-31 | falta_confirmada | sim |

A politica expira em 31/07/2026. Agosto volta ao comportamento conservador ate
nova decisao explicita da coordenacao.

### 5.2 Presenca semantica

`public.vw_aluno_presenca_semantica_v1` mantem o nome para compatibilidade e
passa a declarar uma nova `regra_versao`.

Precedencia obrigatoria:

1. presenca explicita;
2. aula cancelada;
3. aula justificada;
4. resposta manual ou LA Teacher;
5. politica ativa da unidade/data;
6. classificacao conservadora atual (`falta_provavel` ou `indeterminado`).

A politica nunca transforma aula cancelada ou justificada em falta. Novas
colunas podem ser anexadas ao final da view, sem alterar as existentes:

- `politica_confiabilidade_id`;
- `fundamento_confianca`;
- `revisao_operacional_exigida`;
- `revisao_operacional_status`.

### 5.3 Revisao de Campo Grande

Nova tabela sugerida: `public.aluno_presenca_revisoes_operacionais`.

Ela guarda apenas decisoes humanas, nao uma copia de toda a fila:

- `id uuid`;
- `aluno_presenca_id uuid unique`;
- `unidade_id uuid`;
- `politica_confiabilidade_id uuid`;
- `status text`: `confirmada` ou `corrigida`;
- `status_origem text`;
- `status_final text`;
- `motivo text`;
- `revisado_por_usuario_id integer`;
- `revisado_por_auth_user_id uuid`;
- `revisado_em timestamptz`;
- `created_at timestamptz`.

A fila e uma view derivada das ausencias de Campo Grande cobertas pela politica,
menos as linhas ja revisadas. Assim, a implantacao nao cria milhares de linhas
de pendencia e o sync pode trazer novas evidencias normalmente.

View sugerida: `public.vw_aluno_presenca_conciliacao_operacional`.

Grao: um aluno em uma aula. A interface agrupa por aula para facilitar o uso.

### 5.4 RPCs

- `get_conciliacao_presencas(p_unidade_id, p_data_inicio, p_data_fim,
  p_status)`: retorna grupos por aula, alunos e totais.
- `admin_confirmar_presencas_aula(p_aula_emusys_id, p_motivo)`: confirma em
  lote as ausencias pendentes da chamada.
- `admin_revisar_presenca_conciliacao(p_aluno_presenca_id, p_decisao,
  p_motivo)`: confirma a falta ou corrige individualmente para presente.

Na correcao individual, a RPC reutiliza o contrato de
`admin_corrigir_presenca`, que ja valida `professores.editar` na unidade,
atualiza a linha operacional e escreve em `aluno_presenca_retificacoes`.

Todas as RPCs usam `SECURITY DEFINER`, `set search_path = public`, validacao de
usuario ativo e permissao escopada por unidade. `public` e `anon` nao recebem
`EXECUTE`.

## 6. Interface

Na aba existente `Alunos > Conciliacao`, adicionar uma secao funcional chamada
`Presencas a confirmar`.

Comportamento:

- contador de aulas e alunos pendentes;
- filtros por competencia, professor e curso;
- agrupamento por data/hora/aula/professor;
- acao de grupo `Confirmar chamada`;
- acao individual `Corrigir para presente`;
- motivo obrigatorio em qualquer correcao;
- atualizacao local imediata depois da resposta;
- historico revisado disponivel por filtro, sem misturar com pendencias abertas.

O bloco usa uma secao propria. Nao sera encaixado em
`alunos_emusys_atributos_divergencias`, porque aquela tabela tem grao de
atributo cadastral, enquanto presenca tem grao aluno/aula.

## 7. Compatibilidade e impacto

Os consumidores que ja usam a camada canonica recebem a nova classificacao sem
troca de assinatura:

- pagina de Performance dos Professores;
- card individual do professor;
- Dashboard pedagogico;
- relatorio de coordenacao;
- RPCs canonicas de frequencia e KPI de professor.

A publicacao continua sujeita aos demais criterios de qualidade, como base
minima e conflitos. Portanto, a mudanca remove o bloqueio causado por
`falta_provavel/indeterminado`, mas nao fabrica base suficiente onde existem
poucas aulas.

## 8. Evidencia quantitativa de partida

Consulta SELECT-only em 15/07/2026, para `01/06/2026` a `31/07/2026`:

- Barra: 883 `falta_provavel` e 167 `indeterminado` do Emusys;
- Recreio: 1.402 `falta_provavel` e 97 `indeterminado` do Emusys;
- Campo Grande: 1.853 `falta_provavel` e 989 `indeterminado` do Emusys;
- aulas justificadas existentes permanecem inalteradas.

Esses valores sao dinamicos enquanto o sync continua rodando. Servem como
baseline de validacao, nao como total fechado.

## 9. Testes obrigatorios

### Banco

1. Ausencia Emusys em Barra/Recreio, junho/julho, vira `falta_confirmada`.
2. Ausencia Emusys em Campo Grande, junho/julho, vira `falta_confirmada` e
   aparece na fila.
3. Presenca, cancelamento e justificativa mantem a classificacao anterior.
4. Datas anteriores a 01/06 e posteriores a 31/07 mantem a regra conservadora.
5. Confirmacao em lote nao altera `aluno_presenca`.
6. Correcao individual gera uma retificacao e remove a pendencia.
7. Segunda confirmacao da mesma linha e idempotente.
8. Usuario sem permissao na unidade recebe erro `42501`.
9. `anon` nao le tabela, view ou RPC sensivel.
10. A regra de deduplicacao por evento/pessoa continua intacta.

### Aplicacao

1. Selecionar junho e julho e abrir cards de professores nas tres unidades.
2. Verificar que a competencia selecionada continua respeitada.
3. Confirmar que a presenca deixa de aparecer apenas como `Em auditoria` quando
   todos os demais portoes de publicacao forem atendidos.
4. Abrir Campo Grande em `Alunos > Conciliacao > Presencas a confirmar`.
5. Confirmar uma aula em lote e corrigir um aluno individualmente.
6. Recarregar e verificar contadores, historico e KPI do professor.
7. Validar ao menos um professor de cada unidade contra o Emusys.

## 10. Rollout e rollback

1. Criar politica, revisoes, views e RPCs de forma aditiva.
2. Rodar comparacao sombra antes/depois sem mudar a UI.
3. Validar casos ouro e invariantes.
4. Publicar a semantica e verificar os consumidores canonicos.
5. Adicionar a secao de conciliacao.
6. Fazer teste visual autenticado e registrar evidencias.

Rollback logico: desativar as tres politicas. A view volta imediatamente a regra
conservadora sem apagar presencas, retificacoes ou revisoes ja registradas.

## 11. Criterios de aceite

- Junho e julho publicam presenca/falta nas tres unidades conforme a decisao.
- Campo Grande possui fila auditavel sem bloquear os indicadores.
- Nenhum dado bruto e alterado por promocao de confianca.
- Correcao humana preserva trilha completa.
- Canceladas e justificadas nao viram falta.
- A pagina de Professores e a conciliacao exibem a mesma leitura canonica.
- Agosto nao herda silenciosamente uma regra ainda nao confirmada.
- Churn e demais pipelines fora do escopo permanecem intocados.
