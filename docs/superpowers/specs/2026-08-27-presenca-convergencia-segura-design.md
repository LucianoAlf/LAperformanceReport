# Convergência segura da presença canônica

**Data:** 27/08/2026  
**Status:** desenho aprovado; execução autorizada e baseline em revalidação
**Repositório:** LA Performance Report  
**Base da convergência:** `origin/main` em `779c3604`
**Correção operacional preservada:** `08dca49c` (Hugo, PR #239)  
**Projeto Supabase compartilhado:** `ouqwbbermlzqqvtqwlul`

## 1. Objetivo

Convergir a implementação ampla de presença canônica com a correção operacional
do Hugo sem substituir o fluxo que já voltou a funcionar, sem reabrir a falha de
permissão e sem criar uma janela de indisponibilidade entre banco, Edge Functions,
LA Report e LA Teacher.

Ao final, o Git deve voltar a representar o que já existe no ambiente remoto e
as proteções complementares devem entrar em etapas retrocompatíveis, testadas e
reversíveis.

## 2. Problema atual

Há quatro estados que não podem ser misturados em um único merge:

1. `origin/main` contém a correção do Hugo e é a fonte do frontend que está
   funcionando em produção.
2. O banco remoto já contém as 24 migrations `20260827030000` a
   `20260827032300`, mas esses arquivos ainda não estão em `origin/main`.
3. A branch `codex/presenca-canonica-raiz` possui aproximadamente 20 mil linhas
   candidatas em 128 arquivos, incluindo um transporte frontend concorrente.
4. Quatro migrations não commitadas, originalmente numeradas
   `20260827143000` a `20260827143300`, são posteriores em conteúdo, mas
   anteriores no ledger à migration do Hugo `20260827151832`; elas não podem
   ser publicadas nem integradas como estão.

Um merge textual acusaria conflito em poucos arquivos, mas esconderia conflitos
semânticos de contrato, idempotência, precedência e ordem de rollout.

## 3. Grão e fontes canônicas

O grão operacional é uma decisão de presença por aluno em uma ocorrência de
aula, sempre escopada por unidade e pela identidade completa da aula/roster.

- `aluno_presenca`: evidência bruta e trilha de origem;
- projeções canônicas versionadas: resolução semântica e leitura operacional;
- `aulas_emusys`: aula sincronizada;
- `aula_alunos_emusys`: roster esperado;
- recibos e eventos de comando: intenção, autoria, aplicação e rejeição;
- retificações: correção auditável, sem apagar a primeira evidência.

`ausente` bruto do Emusys não pode virar falta humana por inferência. Do mesmo
modo, `aulas_emusys.professor_presenca = 'ausente'` é sinal bruto operacional e
não comprova falta do professor, penalidade ou componente de Health Score.

## 4. Invariantes de segurança

Estas regras são bloqueantes:

1. O frontend do Hugo e suas chamadas diretas `app_* + p_request_id` são a base.
2. A migration `20260827151832` permanece vigente durante toda a convergência.
3. As assinaturas antigas só podem perder `EXECUTE` depois de adoção comprovada,
   período de estabilidade e rollback ensaiado.
4. Não usar `--include-all`, `migration repair` ou renumeração artificial para
   forçar migration fora de ordem.
5. As migrations WIP `143000`–`143300` são somente material de referência; não
   entram em commit, push ou banco com esses nomes ou conteúdo integral.
6. Nenhum backfill pode inventar presença, falta, autoria ou vínculo de roster.
7. Nenhuma decisão humana existente pode ser apagada ou sobrescrita.
8. Nenhuma Edge Function será publicada antes de sua fonte exata estar no Git.
9. `verify_jwt`, grants, RLS, ownership e escopo de unidade são preservados e
   verificados explicitamente.
10. Todas as superfícies continuam em `sombra` até autorização específica de
    ativação; convergir código não autoriza cutover.
11. O checkout `main` local só recebe fast-forward e os documentos locais do
    usuário são preservados.
12. Produção não recebe fixtures sintéticas nem writes de teste inventados.
13. Antes de cada branch/PR, atualizar `origin` e incorporar qualquer avanço de
    `main` antes de editar arquivos concorrentes.

## 5. Decisões sobre as duas implementações

### Manter

- `src/lib/presencaRecibo.ts` do Hugo;
- chamadas diretas das RPCs de Agenda e professor com `p_request_id`;
- interpretação dos formatos diferentes de recibo;
- erro legível do `supabase-js`;
- preservação do ID depois de falha de rede;
- migration de recuperação `20260827151832`;
- migrations e fontes Edge que já foram publicadas, depois de provar paridade
  byte a byte ou por manifesto reproduzível.

### Portar de forma test-first

- persistência do `request_id` após reload;
- chave por usuário, superfície e intenção, permitindo vários pedidos ambíguos;
- distinção entre `não recebido`, `estado desconhecido` e `consulta indisponível`;
- preservação do pedido em resposta HTTP malformada;
- leitura canônica de fonte, conflito, frescor, regra e estado de publicação;
- locks, atomicidade de roster e falha fechada que forem comprovadamente
  complementares.

### Não portar

- substituição das RPCs do Hugo pelo transporte frontend genérico em duas
  chamadas `app_criar_comando_presenca_v1` + `app_aplicar_comando_presenca_v1`;
- `presencaComando.ts` como transporte da Agenda/professor;
- conversões `ausente -> falta` sem política canônica e evidência terminal;
- UUID permanente derivado de usuário+aula+payload, pois uma sequência A-B-A é
  uma nova intenção legítima, não necessariamente retry da primeira A;
- invalidação global de roster antes de banco e Edge operarem em modo dual;
- wrappers clonados dinamicamente por `pg_get_functiondef` sem prova de replay
  seguro.

## 6. Arquitetura de convergência

### Checkpoint A — base local e isolamento

1. Trabalhar em `codex/presenca-convergencia-segura`, criada da `origin/main`.
2. Manter `codex/presenca-canonica-raiz` intacta como referência e preservar seu
   WIP em branch própria antes de qualquer reorganização.
3. Atualizar a `main` local apenas por fast-forward, depois de conferir que os
   arquivos locais do usuário não colidem com o conjunto recebido.

Este checkpoint não altera produção.

### Checkpoint B — paridade da fonte já publicada

Criar uma entrega sem mudança de runtime do frontend:

1. incorporar as 24 migrations `030000`–`032300` já aplicadas;
2. comparar cada versão com `supabase_migrations.schema_migrations.statements`;
3. incorporar as fontes das oito Edge Functions publicadas;
4. comparar versão, `verify_jwt`, dependências e SHA-256 remoto;
5. incorporar contratos, auditorias, runbook e testes que descrevem o estado
   realmente publicado;
6. excluir desse checkpoint os 32 arquivos de runtime frontend candidatos e
   qualquer migration ainda não aplicada.

Se o conteúdo candidato divergir dos statements ou do bundle remoto, o
checkpoint para: não se altera silenciosamente uma migration histórica já
aplicada. A diferença deve ser reconstruída, explicada e revisada primeiro.

O resultado deve reduzir a deriva Git × Supabase sem executar DDL, deploy de
Edge ou deploy funcional novo. O build também deve provar que o bundle da
aplicação não mudou por causa dessa entrega de paridade.

### Checkpoint C — convergência do recibo no frontend

Evoluir o helper do Hugo sem trocar o protocolo:

```text
ação humana
  -> chave estável da intenção atual
  -> request_id persistido por usuário/superfície/intenção
  -> RPC app_* com p_request_id
  -> recibo validado
  -> terminal: limpar pedido
  -> ambíguo/indisponível/malformado: preservar e consultar no retry
```

O pedido só termina depois de recibo terminal válido. Falha de rede, consulta
indisponível ou payload malformado não geram um novo ID silenciosamente.

### Checkpoint D — leituras, visualizações, agentes e indicadores

Integrar por grupos independentes e ainda governados por `sombra`:

1. Agenda e Conciliação;
2. LA Teacher/Fábio;
3. Sol, Lia, Mila e agentes analíticos;
4. KPIs, relatórios e gráficos.

Cada grupo usa a mesma ocorrência canônica e publica período, universo, fonte,
frescor e regra. Dado incompleto vira `Em auditoria`/`dados desatualizados`, não
zero, sucesso ou culpa operacional.

Antes desse checkpoint, o adaptador de rollback/sombra deve parar de converter
ausência bruta de aluno ou professor em decisão terminal.

### Checkpoint E — hardening novo de banco e sync

Refazer o WIP como migrations novas, criadas pelo Supabase CLI e posteriores ao
último ledger remoto. A ordem obrigatória é:

1. expansão aditiva de schema/RPC sem invalidar o legado;
2. núcleo de lock, idempotência, ACL e proteção de slot;
3. Edge em modo dual, compatível com banco antigo e expandido;
4. cobertura nominal comprovada e resync controlado;
5. troca de leitura por flag/unidade;
6. fechamento de portas antigas somente no último gate.

O preflight desta etapa relê o changelog e a documentação atual do Supabase,
confirma a versão do CLI e descobre os comandos por `--help` antes de gerar as
migrations.

Erros transitórios, deadlocks e indisponibilidade não podem virar recibo
terminal permanente. O ledger é append-only para clientes; funções internas
não têm `EXECUTE` público; `anon` não acessa dados de presença.

### Checkpoint F — publicação e rollout

Cada entrega passa por branch, commit, push, revisão e PR. Merge direto ou
force-push em `main` são proibidos.

As autorizações continuam separadas para:

- versionar/paridade de fonte;
- aplicar migration nova;
- publicar Edge Function;
- ativar consumidor por unidade/superfície;
- executar eventual reparo de roster.

## 7. Tratamento de conflito e rollback

- Conflito textual nos arquivos do Hugo: começar pela versão de `origin/main`
  e portar apenas comportamento coberto por teste.
- Conflito semântico: a correção em produção vence até que o candidato prove
  compatibilidade nos dois sentidos.
- Falha no PR de paridade: nenhum efeito operacional, pois não há deploy remoto.
- Falha no frontend: rollback para o commit do Hugo sem alterar recibos já
  gravados.
- Falha em superfície canônica: flag volta para `legado`/`sombra`, sem DDL
  destrutivo e sem apagar eventos.
- Falha Edge: republicar o bundle anterior com o mesmo `verify_jwt`.
- Migration aditiva aplicada não é removida; o comportamento é desativado por
  adapter/flag e corrigido por migration posterior.

## 8. Estratégia de testes

### Base e fonte

- `HEAD == origin/main` no início da worktree;
- migration ledger local/remoto e hashes reproduzíveis;
- manifesto das oito Edge Functions;
- `deno check` dos entrypoints;
- RLS, `proacl`, `relacl`, `security_invoker` e `search_path`.

### Recibo e frontend

- mesmo pedido + mesmo payload reutiliza ID;
- mesmo ID + payload diferente é rejeitado;
- timeout depois do commit + retry não duplica;
- reload preserva pedido;
- dois pedidos ambíguos coexistem;
- payload malformado não encerra pedido;
- concluído, parcial, rejeitado, recebido, processando, desconhecido e consulta
  indisponível;
- chamadas individual, em lote, professor/aula, professor/dia e remoção;
- typecheck, build e suíte integral.

### PostgreSQL real descartável

- concorrência do mesmo request aplica uma vez;
- sequência A-B-A representa três intenções quando solicitada três vezes;
- roster concorrente nunca publica fotografia parcial;
- cancelamento/justificativa de aula gêmea bloqueia escrita conflitante;
- run vencido nunca publica depois do substituto;
- usuário sem unidade/ownership é recusado;
- `anon=false`, `authenticated` somente nas portas autorizadas e Fábio
  service-only onde previsto.

### Leitura e interface

- Barra, Recreio e Campo Grande;
- aluno com dois cursos e IDs Emusys iguais em unidades distintas;
- turma gêmea, roster incompleto, aula cancelada e reagendada;
- ausência bruta nunca promovida sem política/evidência;
- paridade Agenda × Sol × LA Teacher × agentes × KPI;
- navegador autenticado, DOM, console e estabilidade após reload;
- nenhuma ação real de presença em produção sem caso operacional autorizado.

## 9. Critérios de aceite por checkpoint

Um checkpoint só avança quando:

1. diff está limitado ao escopo declarado;
2. nenhuma alteração do usuário foi sobrescrita;
3. testes focados e suíte integral passam;
4. build passa;
5. revisão de segurança e domínio não encontra bloqueador;
6. estado remoto é medido novamente imediatamente antes da publicação;
7. rollback correspondente foi ensaiado;
8. evidências são registradas sem PII;
9. a autorização específica do próximo gate existe.

## 10. Definição de concluído

A convergência não termina no merge ou deploy. Ela termina quando:

- Git, ledger de migrations e fontes Edge estão reconciliados;
- frontend usa o protocolo do Hugo com resiliência durável;
- leituras e consumidores compartilham o contrato canônico;
- não há conversão indevida de ausência bruta em falta;
- as três unidades passam pelo período de estabilidade definido no rollout;
- não há divergência inexplicada entre Agenda, Sol, LA Teacher, agentes e KPIs;
- commits, PRs, migrations, versões Edge, deploys e rollback estão documentados.

Até lá, o estado deve ser descrito como parcial e mensurado, nunca como “100%”.
