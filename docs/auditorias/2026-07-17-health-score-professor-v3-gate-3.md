# Health Score Professor V3 - Gate 3

**Data:** 2026-07-17
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Status:** concluido
**Escopo:** transicoes futuras de professor e passagem de bastao
**Virada produtiva da V3:** nao realizada

## 1. Objetivo

Preservar toda troca futura de professor no grao
`unidade + matricula-disciplina`, antes de a jornada atual passar a apontar para
o professor novo, sem impedir a atualizacao da carteira quando o enriquecimento
falhar.

## 2. Decisao de arquitetura

Os periodos de `professor_matricula_disciplina_periodos_v1` pertencem a
reconstrucoes concluidas, versionadas e auditadas por hash. Eles nao sao
reescritos pelo webhook.

O desenho aplicado separa:

- **baseline historico imutavel:** periodos produzidos pelas reconstrucoes;
- **livro de eventos futuros:** `aluno_professor_transicoes`;
- **pendencia humana:** `professor_passagem_bastao`;
- **estado atual:** `aluno_jornada_matricula_disciplina`.

Cada transicao futura pode referenciar o periodo anterior por
`periodo_origem_id`. A composicao baseline + eventos futuros sera feita pelos
read models em sombra da Fase 4.

## 3. Banco de dados

Migration principal:

`supabase/migrations/20260717095000_health_score_v3_transicoes_atribuicao.sql`

Campos aditivos em `aluno_professor_transicoes`:

- `motivo_saida_id`;
- `atribuicao_confirmada`;
- `conta_retencao_professor`;
- `revisado_por`;
- `revisado_em`;
- `periodo_origem_id`.

RPC nova:

`public.registrar_transicao_professor_v3(p_contexto jsonb)`

Garantias da RPC:

- `SECURITY DEFINER` com `search_path` fixo;
- `EXECUTE` somente para `service_role`;
- lock transacional por unidade e matricula-disciplina;
- transicao e passagem de bastao na mesma transacao;
- reentrega idempotente;
- payload snapshot montado por campos tecnicos permitidos, sem payload bruto;
- leitura do periodo anterior somente em reconstrucao concluida;
- nenhuma escrita na tabela de periodos reconstruidos.

Migration de hardening:

`supabase/migrations/20260717101500_health_score_v3_transicoes_indices_rls.sql`

Ela adiciona indices de FKs e restringe explicitamente as policies operacionais
ao papel `service_role`. Depois dela, os advisors de seguranca e os avisos de
performance relevantes para as duas tabelas ficaram zerados.

## 4. Webhook

Arquivos:

- `supabase/functions/processar-matricula-emusys/index.ts`;
- `supabase/functions/_shared/jornada-canonica.ts`.

Fluxo implantado:

1. recebe `matricula_alterada`;
2. le a jornada atual da matricula-disciplina;
3. confirma mudanca real de professor;
4. monta contexto tecnico sem PII bruta;
5. chama `registrar_transicao_professor_v3`;
6. em caso de falha, registra erro minimo e continua;
7. atualiza a jornada para o professor novo.

O Edge deixou de inserir diretamente nas duas tabelas. Tambem deixou de conter
tokens literais do Emusys e usa apenas:

- `EMUSYS_TOKEN_CG`;
- `EMUSYS_TOKEN_RECREIO`;
- `EMUSYS_TOKEN_BARRA`.

Os tres secrets existem no projeto. A funcao publicada esta ativa na versao 58,
com `verify_jwt=false` preservado porque se trata do endpoint de webhook ja
existente.

## 5. Validacoes executadas

- testes direcionados do Gate: `15/15`;
- suite completa: `185/185`;
- `deno check` do Edge e helper compartilhado: aprovado;
- build Vite de producao: aprovado;
- smoke HTTP `OPTIONS`: `200`;
- smoke SQL dentro de transacao com rollback:
  - primeira chamada criou a transicao;
  - segunda chamada retornou idempotente;
  - uma unica passagem de bastao foi criada;
  - `periodo_origem_id` foi resolvido;
  - a quantidade de periodos reconstruidos nao mudou;
  - nenhuma linha de teste persistiu.
- grants remotos:
  - `anon`: sem `EXECUTE`;
  - `authenticated`: sem `EXECUTE`;
  - `service_role`: com `EXECUTE`.
- logs da versao 58: inicializacao e smoke sem erro.

## 6. Nao regressao

Este gate nao alterou:

- cards e rankings produtivos de professor;
- Health Score V2;
- relatorios gerencial, administrativo ou comercial;
- pipeline de churn;
- dados brutos de aula ou presenca;
- anotacoes do Emusys ou `anotacoes_fabio`;
- periodos pertencentes a reconstrucoes concluidas.

## 7. Proximo gate

A Fase 4 cria os read models dos seis pilares em sombra. Eles deverao compor o
baseline historico com o livro de transicoes futuras, retornar valor bruto,
numerador, denominador, amostra, confianca, fonte e motivo de falta de base, sem
defaults fabricados e sem trocar consumidores produtivos.
