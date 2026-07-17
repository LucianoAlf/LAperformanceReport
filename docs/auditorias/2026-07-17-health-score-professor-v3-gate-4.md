# Health Score Professor V3 - Gate 4

**Data:** 2026-07-17
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Status:** concluido
**Escopo:** read models auditaveis dos seis pilares em sombra
**Virada produtiva da V3:** nao realizada

## 1. Objetivo

Criar as fontes calculadas da V3 sem trocar nenhum consumidor produtivo. Cada
metrica retorna valor bruto, numerador, denominador, amostra, estado de base,
publicabilidade, confianca, fonte, versao da regra e motivo de nao publicacao.

## 2. Camada efetiva de periodos

A view `vw_professor_periodos_efetivos_v3_sombra` compoe:

- o ultimo baseline historico concluido e imutavel;
- as transicoes futuras registradas pelo Gate 3;
- o estado atual da jornada, sem reescrever reconstrucoes fechadas.

A view usa `security_invoker`, nao possui grant para navegador e permanece
restrita ao `service_role`.

## 3. Metricas implantadas

A migration
`supabase/migrations/20260717113000_health_score_v3_metricas_sombra.sql`
criou seis RPCs:

- `get_professor_conversao_v3_sombra`;
- `get_professor_media_turma_v3_sombra`;
- `get_professor_numero_alunos_v3_sombra`;
- `get_professor_retencao_v3_sombra`;
- `get_professor_permanencia_v3_sombra`;
- `get_professor_presenca_v3_sombra`.

As RPCs sao `SECURITY DEFINER`, possuem `search_path` fixo e validam perfil e
unidade internamente. `public` e `anon` nao executam. O papel `authenticated`
so atravessa a funcao quando o usuario possui escopo administrativo valido; o
`service_role` permanece habilitado para automacao e auditoria.

Regras principais:

- conversao: credito unico da ultima experimental confirmada anterior, dentro
  de 30 dias, sem taxa acima de 100%;
- media/turma: pessoa canonica por turma regular, sem inferencia por nome ou
  por segunda aula;
- numero de alunos: pessoa canonica nos tres fechamentos mensais;
- retencao: somente encerramento confirmado e atribuivel ao professor;
- permanencia: somente periodo encerrado, elegivel, publicavel e com confianca
  alta ou revisada;
- presenca: semantica canonica, somente a partir de 03/08/2026, com base minima
  e cobertura minima.

Quando a unidade e nula, cada RPC recompila os eventos e vinculos do professor.
O consolidado nao calcula media dos scores das unidades.

## 4. Correcao de desempenho

A primeira versao da media por turma resolvia identidade com um `OR` associado
a busca em array. O resultado estava correto, mas o plano de execucao levou
aproximadamente `19.217 ms` no recorte auditado.

A migration
`supabase/migrations/20260717114500_health_score_v3_media_turma_performance.sql`
substituiu esse caminho por igualdade direta de `emusys_aluno_id`, mantendo um
fallback local explicitamente nao publicavel. O mesmo recorte passou a
aproximadamente `236 ms`, uma reducao de cerca de 81 vezes, sem mudar os valores
de controle.

Cobertura encontrada no roster:

- 6.401 linhas no recorte auditado;
- 6.298 com identidade Emusys;
- 18 apenas com identidade local;
- 85 sem identidade resolvida.

As linhas sem identidade forte permanecem auditaveis e nao sao promovidas
silenciosamente a fato publicavel.

## 5. Validacoes remotas

As migrations foram aplicadas no projeto remoto como:

- `20260717153132 health_score_v3_metricas_sombra`;
- `20260717154308 health_score_v3_media_turma_performance`.

Smokes executados:

- conversao sem numerador maior que denominador e sem valor acima de 100%;
- permanencia nunca publicavel com amostra menor que 3;
- presenca nunca publicavel com amostra menor que 10;
- media/turma e numero de alunos nunca publicaveis sem os tres fechamentos;
- nenhum registro publicavel com `valor_bruto` nulo;
- consolidado com uma linha por professor e sem unidade residual;
- view e RPCs sem referencia ao staging historico.

Exemplos preservados depois da otimizacao, em julho:

- Daiana / Barra: `21 / 11 = 1,91`;
- Gabriel Antony / Barra: `47 / 38 = 1,24`.

Junho permanece `sem_base` onde o roster canonico ainda nao possui cobertura
historica suficiente. Nenhum zero foi fabricado para preencher essa lacuna.

## 6. Testes

- teste isolado de jornada atualizado para a regra real de professor ativo:
  `4/4`;
- suite dirigida do Gate 4: `19/19`;
- suite oficial completa em `tests/*.test.mjs`: `196/196`;
- build Vite de producao: aprovado.

O build conserva avisos preexistentes de chunks grandes e reexportacao circular
do Recharts. Eles nao foram introduzidos por este gate e nao impediram o build.

## 7. Nao regressao

Este gate nao alterou:

- Health Score V2;
- cards, rankings ou relatorios produtivos;
- relatorios gerencial, administrativo ou comercial;
- pipeline de churn;
- dados brutos de aula ou presenca;
- `anotacoes` ou `anotacoes_fabio`;
- baseline historico reconstruido.

## 8. Ressalvas antes do Gate 5

- metas de media/turma, numero de alunos e permanencia ainda nao existem; elas
  devem nascer como rascunho e ser calibradas no Gate 5;
- motivos atribuiveis precisam de confirmacao humana para impactar retencao;
- presenca nao pode pontuar antes de 03/08/2026;
- usuarios autenticados sem perfil/permissao configurado sao negados pelo guard;
- as RPCs seguem em sombra e nao devem ser ligadas a telas produtivas.

## 9. Proximo gate

O Gate 5 cria configuracoes versionadas, snapshots imutaveis e o motor de
materializacao. A configuracao inicial sera rascunho: nenhuma meta sera
inventada e nenhum consumidor produtivo sera migrado.
