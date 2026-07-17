# SPEC Tecnica - Health Score do Professor V3

**Data:** 2026-07-16
**Status:** aprovada para planejamento e implementacao em sombra
**Contrato funcional:** `docs/specs/2026-07-16-contrato-health-score-professor-v5-final.md`
**Projeto Supabase confirmado:** `ouqwbbermlzqqvtqwlul`
**Regra de compatibilidade:** a V2 produtiva permanece intacta ate homologacao e virada por consumidor

---

## 1. Objetivo tecnico

Construir uma cadeia nova e auditavel para:

1. coletar o historico de aulas do Emusys sem contaminar as tabelas produtivas;
2. reconstruir periodos professor-matricula-disciplina;
3. calcular o tempo de permanencia com cada professor somente quando o periodo for encerrado;
4. calcular os seis pilares do Health Score V3 com base, cobertura e versao explicitas;
5. congelar resultados em snapshots imutaveis;
6. executar comparacao em sombra antes de migrar cards, rankings, sliders ou relatorios.

Esta SPEC nao autoriza trocar consumidores produtivos. Ela define as camadas fisicas, contratos de leitura, invariantes, seguranca e ordem de rollout.

---

## 2. Decisoes fechadas

### 2.1 Grao pedagogico

O vinculo historico oficial e:

```text
unidade
+ matricula Emusys
+ matricula-disciplina Emusys
+ professor
+ periodo continuo
```

Uma pessoa com Bateria e Guitarra possui dois vinculos. Se os cursos forem com professores diferentes, cada professor recebe seu proprio periodo. Se forem com o mesmo professor, `Numero de alunos` deduplica a pessoa, enquanto retencao e permanencia preservam os dois vinculos.

### 2.2 Permanencia

- o periodo ativo nao entra na media;
- o tempo e creditado ao professor quando o vinculo e encerrado;
- a duracao precisa e `(data_fim - data_inicio) / 30.44`;
- somente periodos com duracao precisa `>= 4` meses sao elegiveis;
- periodos menores permanecem no historico com `elegivel_permanencia = false`;
- valor bruto aparece com uma passagem elegivel e publicavel;
- a nota exige pelo menos tres passagens elegiveis e publicaveis;
- somente confianca `alta` ou `revisado_aprovado` pontua.

O corte de quatro meses foi conferido em 16/07/2026 na funcao remota `get_historico_ltv`; a nova camada reaplica a regra, mas nao consome a RPC legada.

### 2.3 Presenca

- a fonte do pilar e `vw_aluno_presenca_semantica_v1`;
- `aluno_presenca` bruto e somente evidencia;
- a pontuacao comeca em 03/08/2026;
- nao existe pontuacao retroativa;
- exige dez eventos elegiveis e cobertura minima de 95%.

### 2.4 Retencao

- uma troca A -> B so penaliza A quando o motivo confirmado possui `motivos_saida.conta_score_professor = true`;
- historico reconstruido sem motivo nao recebe causa inventada;
- motivo desconhecido vai para conciliacao e nao penaliza;
- renovacao com o mesmo professor e disciplina nao encerra periodo.

### 2.5 Operacao em sombra

- V2 continua servindo os consumidores atuais;
- V3 nasce em tabelas, views, RPCs e hooks proprios;
- nenhum relatorio gerencial, administrativo ou comercial muda nesta etapa;
- nenhuma tabela ou RPC legada e apagada;
- nenhum score V3 provisorio e apresentado como oficial.

---

## 3. Arquitetura

```text
Emusys GET /aulas
        |
        v
coletor retomavel e limitado por unidade/janela/cursor
        |
        v
staging historico imutavel
  - aula bruta
  - roster/aluno da aula
  - checkpoint e hash
        |
        v
reconstrutor versionado
        |
        +--> periodos professor-matricula-disciplina
        +--> fila de revisao de ambiguidades
        +--> evidencias e confianca
        |
        v
read models dos seis pilares
        |
        v
motor Health Score V3 + configuracao versionada
        |
        v
snapshots mensais/trimestrais imutaveis
        |
        v
RPC de sombra -> comparador V2 x V3 -> homologacao
        |
        v
cutover individual de cards, rankings, sliders e relatorios
```

As setas sao unidirecionais. O staging nunca escreve em `aulas_emusys`, `aluno_presenca`, `anotacoes` ou `anotacoes_fabio`.

---

## 4. Modelo fisico novo

### 4.1 `emusys_historico_backfill_execucoes_v1`

Controla uma coleta retomavel.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `unidade_id` | uuid | obrigatorio |
| `data_inicio` | date | inicio global do job |
| `data_fim` | date | fim global do job |
| `janela_inicio_atual` | date | checkpoint |
| `janela_fim_atual` | date | checkpoint |
| `cursor_atual` | text | cursor opaco do Emusys |
| `status` | text | `pendente`, `executando`, `pausado`, `concluido`, `falhou` |
| `paginas_processadas` | integer | default 0 |
| `aulas_recebidas` | integer | default 0 |
| `tentativas` | integer | default 0 |
| `ultimo_erro_codigo` | text | sem payload pessoal |
| `ultimo_erro_em` | timestamptz | nullable |
| `iniciado_em` | timestamptz | nullable |
| `atualizado_em` | timestamptz | obrigatorio |
| `concluido_em` | timestamptz | nullable |
| `criado_por` | integer | usuario LA Report nullable |

Restricao: uma unica execucao `executando` por unidade.

### 4.2 `emusys_aulas_historico_staging_v1`

Guarda uma aula bruta por unidade e ID Emusys.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | bigint | PK |
| `execucao_id` | uuid | FK do job |
| `unidade_id` | uuid | escopo obrigatorio |
| `emusys_aula_id` | bigint | ID cru |
| `data_hora_inicio` | timestamptz | America/Sao_Paulo -> UTC |
| `data_hora_inicio_original` | timestamptz | nullable |
| `categoria` | text | valor cru normalizado apenas para consulta |
| `cancelada` | boolean | valor cru |
| `reagendada` | boolean | valor cru |
| `turma_nome` | text | nullable |
| `emusys_disciplina_id` | bigint | nullable |
| `disciplina_nome` | text | nullable |
| `emusys_professor_id` | bigint | nullable; zero significa sem acompanhamento |
| `professor_nome` | text | nullable |
| `payload` | jsonb | payload bruto da aula |
| `payload_hash` | text | SHA-256 canonico |
| `coletado_em` | timestamptz | obrigatorio |

Unicidade: `(unidade_id, emusys_aula_id)`. Uma nova coleta com hash diferente gera revisao/auditoria; nao apaga a evidencia anterior sem registro.

### 4.3 `emusys_aula_alunos_historico_staging_v1`

Explode o roster sem perder o payload de origem.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | bigint | PK |
| `aula_staging_id` | bigint | FK da aula |
| `unidade_id` | uuid | obrigatorio |
| `emusys_aula_id` | bigint | redundancia indexavel |
| `emusys_aluno_id` | bigint | nullable |
| `aluno_id` | integer | vinculo local nullable |
| `aluno_nome_origem` | text | evidencia, nao identidade |
| `emusys_matricula_id` | bigint | nullable |
| `emusys_matricula_disciplina_id` | bigint | chave preferencial |
| `presenca_origem` | text | evidencia, nao KPI |
| `linha_hash` | text | deduplicacao idempotente |
| `payload` | jsonb | fragmento bruto do aluno |

Identidade preferencial: `unidade_id + emusys_aluno_id`. Nome nunca e chave definitiva.

### 4.4 `professor_matricula_disciplina_periodos_v1`

E a camada canonica historica.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `unidade_id` | uuid | obrigatorio |
| `pessoa_chave` | text | chave canonica por unidade |
| `aluno_id` | integer | nullable |
| `emusys_aluno_id` | bigint | nullable |
| `emusys_matricula_id` | bigint | nullable, preservado quando disponivel |
| `emusys_matricula_disciplina_id` | bigint | obrigatorio para alta confianca |
| `emusys_disciplina_id` | bigint | nullable |
| `curso_id` | integer | nullable |
| `professor_id` | integer | nullable somente enquanto nao resolvido |
| `emusys_professor_id` | bigint | ID escopado pela unidade |
| `data_inicio` | timestamptz | obrigatorio |
| `data_fim` | timestamptz | nullable para ativo |
| `status_periodo` | text | `ativo`, `encerrado`, `invalidado` |
| `tipo_inicio` | text | webhook, primeira aula, grade, revisao |
| `tipo_fim` | text | troca, fim disciplina, saida escola, revisao |
| `duracao_dias` | numeric | calculada sem arredondamento destrutivo |
| `duracao_meses` | numeric | `duracao_dias / 30.44` |
| `elegivel_permanencia` | boolean | encerrado e duracao >= 4 |
| `motivo_saida_id` | bigint | nullable |
| `conta_retencao_professor` | boolean | nullable ate confirmacao |
| `confianca` | text | `alta`, `media`, `revisar`, `revisado_aprovado` |
| `publicavel` | boolean | derivado da confianca e integridade |
| `versao_reconstrucao` | text | obrigatorio |
| `evidencias` | jsonb | IDs, limites e razoes |
| `revisado_por` | integer | nullable |
| `revisado_em` | timestamptz | nullable |
| `created_at` | timestamptz | obrigatorio |
| `updated_at` | timestamptz | obrigatorio |

Unicidade operacional: `(unidade_id, emusys_matricula_disciplina_id, emusys_professor_id, data_inicio, versao_reconstrucao)`.

### 4.5 `professor_periodos_revisoes_v1`

Trilha append-only de decisoes humanas. Nao sobrescreve silenciosamente a evidencia reconstruida.

Campos minimos: periodo, decisao, motivo, professor corrigido, datas corrigidas, motivo de saida, atribuicao de retencao, revisor, data e snapshot anterior/posterior.

### 4.6 Configuracao V3

Criar:

- `health_score_professor_v3_config_versoes`;
- `health_score_professor_v3_config_metricas`.

A tabela-pai versiona vigencia, status, faixas, cobertura minima, autor e justificativa. A tabela-filha possui uma linha por pilar com peso, meta, amostra minima, cobertura minima e parametros especificos.

A ativacao deve ser feita por RPC transacional que valida:

- soma dos pesos = 100;
- seis pilares unicos;
- vigencia sem sobreposicao;
- faixas coerentes;
- nenhuma alteracao em versao ja usada por snapshot fechado.

### 4.7 Snapshots V3

Criar:

- `health_score_professor_v3_snapshots`;
- `health_score_professor_v3_snapshot_metricas`.

O snapshot-pai possui professor, unidade, competencia, trimestre, revisao, estado, configuracao, score, cobertura, classificacao, publicabilidade e motivo de bloqueio. A filha guarda valor bruto, numerador, denominador, amostra, nota, peso, contribuicao, fonte, confianca e versao de regra de cada pilar.

Um snapshot `fechado` e imutavel. Retificacao cria nova revisao e invalida a publicacao anterior sem apagar seu historico.

---

## 5. Coletor historico Emusys

### 5.1 Endpoint e limite

- endpoint: `GET /aulas`;
- paginacao por `cursor`;
- limite por pagina: 100;
- rate limit documentado: 60 requisicoes por minuto por IP;
- ritmo operacional: no maximo 45 requisicoes por minuto;
- uma unidade por job;
- janelas mensais, quebradas em quinzenais somente se a API ou o volume exigir.

### 5.2 Edge Function

Nome: `backfill-historico-professor-emusys`.

Entrada:

```json
{
  "execucao_id": "uuid",
  "max_paginas": 10
}
```

Saida:

```json
{
  "status": "executando",
  "paginas_processadas": 10,
  "aulas_recebidas": 837,
  "tem_mais": true,
  "proximo_checkpoint": {
    "janela_inicio": "2024-01-01",
    "janela_fim": "2024-01-31",
    "cursor": "opaco"
  }
}
```

Regras:

- autenticar apenas service role ou usuario administrativo explicitamente autorizado;
- carregar token da unidade no servidor;
- aplicar timezone com a mesma funcao validada no sync atual;
- em 429, respeitar `Retry-After` ou usar backoff exponencial com jitter;
- persistir checkpoint depois de cada pagina confirmada;
- upsert idempotente por ID Emusys e hash;
- nao logar nome, telefone, e-mail ou payload completo em erros;
- nunca chamar por aluno. O pull e por unidade e periodo.

### 5.3 Orquestrador local

Criar `scripts/backfill-historico-professor-emusys.mjs` para iniciar, retomar, pausar e consultar jobs. O script apenas chama a Edge e le o checkpoint; credenciais permanecem em variaveis de ambiente.

### 5.4 Ordem do backfill

1. piloto pequeno com casos conhecidos das tres unidades;
2. alunos/vinculos iniciados antes de 2022;
3. iniciados antes de 2024;
4. restante da base;
5. reconciliacao residual por CSV apenas para lacunas comprovadas.

A priorizacao acelera validacao, mas a arquitetura nao corta o historico em cinco anos nem trata alunos recentes como dispensaveis.

---

## 6. Reconstrucao dos periodos

### 6.1 Identidade

Resolver nesta ordem:

1. `unidade_id + emusys_matricula_disciplina_id`;
2. `unidade_id + emusys_aluno_id + emusys_disciplina_id` como fallback sinalizado;
3. vinculo local revisado;
4. nome apenas como pista para fila de revisao.

Professor e resolvido por `professores_unidades.emusys_id` escopado pela unidade. Identidade historica valida nao reativa `emusys_ativo` nem cria carteira atual.

### 6.2 Segmentacao

Para cada matricula-disciplina:

1. ordenar eventos por data/hora;
2. deduplicar a mesma aula/roster;
3. ignorar `prof_id = 0` como professor, preservando `sem_acompanhamento`;
4. abrir periodo no primeiro evento confiavel ou na data contratual confirmada;
5. manter continuidade em renovacao com o mesmo professor;
6. encerrar A e iniciar B quando houver webhook/grade ou sequencia sustentada de B;
7. tratar uma ou duas aulas isoladas de B, seguidas do retorno de A, como substituicao candidata;
8. mandar conflitos para revisao, sem publica-los.

`Sequencia sustentada` exige ao menos tres eventos consecutivos ou confirmacao pela jornada/grade corrente. Ela aumenta confianca, mas nao substitui evidencia contraditoria.

### 6.3 Limites temporais

- com transicao exata: usar `data_transicao`;
- somente com aulas: fim de A e inicio de B na primeira aula sustentada de B;
- historico truncado a esquerda: marcar `inicio_incompleto` e reduzir confianca;
- periodo sem fim confirmado permanece ativo e nao entra na permanencia;
- sobreposicao de titulares para a mesma matricula-disciplina vai para revisao.

### 6.4 Confianca

`alta` exige IDs completos, professor resolvido por ID, limites coerentes e ausencia de conflito. `media` permite fallback consistente. `revisar` cobre lacuna, nome, sobreposicao ou substituicao ambigua. `revisado_aprovado` e decisao humana append-only.

### 6.5 Idempotencia e versao

O reconstrutor recebe `versao_reconstrucao`. Rodar novamente a mesma versao sobre o mesmo hash nao cria periodo novo. Uma nova regra gera nova versao comparavel; ela nao apaga periodos da versao anterior.

---

## 7. Read models dos pilares

Nomes finais:

- `get_professor_conversao_v3_sombra`;
- `get_professor_media_turma_v3_sombra`;
- `get_professor_numero_alunos_v3_sombra`;
- `get_professor_retencao_v3_sombra`;
- `get_professor_permanencia_v3_sombra`;
- `get_professor_presenca_v3_sombra`;
- `get_health_score_professor_v3_sombra`.

Todos recebem unidade e competencia explicitas. O consolidado recebe `p_unidade_id = null` e recalcula os eventos brutos, sem fazer media dos scores unitarios.

Cada retorno de metrica inclui no minimo:

```text
valor_bruto
numerador
denominador
amostra
estado_base
publicavel
confianca
fonte
regra_versao
motivo_sem_base
```

Nenhuma RPC usa `COALESCE(indicador, 0)` para substituir falta de base. Zero so e valido quando o denominador existe e o resultado observado e realmente zero.

---

## 8. Motor e fechamento

### 8.1 Calculo

```text
score = soma(nota * peso_disponivel) / soma(pesos_disponiveis)
cobertura = soma(pesos_originais_disponiveis)
```

Publicacao exige cobertura >= 60 e pelo menos retencao ou permanencia disponivel.

### 8.2 Fechamento mensal

RPC interna: `materializar_health_score_professor_v3(p_competencia, p_config_versao, p_modo)`.

Modos:

- `provisorio`: pode ser reexecutado e gera revisao;
- `fechado`: exige validacoes e bloqueia alteracao;
- `retificacao`: exige justificativa e cria nova revisao.

### 8.3 Trimestre

- media/turma usa soma de ocupacoes / soma de turmas;
- numero de alunos usa media dos tres fechamentos mensais;
- retencao usa tres meses rolantes;
- conversao fecha D+30;
- permanencia usa passagens encerradas elegiveis no recorte definido pela configuracao;
- presenca no trimestre jul-set/2026 usa somente 03/08 a 30/09.

---

## 9. Consumidores e compatibilidade

### 9.1 Consumidores V2 que permanecem intactos durante a sombra

- `src/hooks/useHealthScore.ts`;
- `src/hooks/useHealthScoreConfig.ts`;
- `src/components/App/Professores/HealthScoreConfig.tsx`;
- `src/components/App/Professores/TabPerformanceProfessores.tsx`;
- `src/components/App/Professores/ModalDetalhesProfessorPerformance.tsx`;
- `src/components/App/Professores/TabCarteiraProfessores.tsx`;
- `src/lib/professoresKpisCanonicos.ts`;
- `src/lib/relatorioCoordenacaoInstantaneo.ts`;
- Edge Functions de relatorio de professor e coordenacao.

### 9.2 Camada frontend V3

Criar paralelamente:

- `src/lib/healthScoreProfessorV3.ts` para tipos e normalizacao;
- `src/hooks/useHealthScoreProfessorV3.ts` para leitura de snapshots;
- `src/hooks/useHealthScoreProfessorV3Config.ts` para versoes editaveis;
- `src/components/App/Professores/HealthScoreV3Config.tsx` para os seis sliders novos;
- componentes de comparacao V2/V3 restritos a coordenacao durante homologacao.

Os sliders V3 editam um rascunho. Salvar nao altera a versao ativa; ativacao exige justificativa e vigencia futura.

### 9.3 Ordem de migracao visual

1. tela de comparacao interna;
2. modal individual do professor;
3. tabela Performance;
4. ranking e resumo da equipe;
5. relatorio individual;
6. relatorio da coordenacao;
7. Dashboard/Analytics de professores;
8. consumidores autorizados do Fabio/LA Teacher.

Cada item possui feature flag e rollback independente.

---

## 10. Seguranca

- RLS habilitada em todas as tabelas novas;
- sem grants para `public` ou `anon`;
- staging e jobs: somente `service_role` e administracao autorizada;
- views `security_invoker` quando aplicavel;
- RPCs `security definer` apenas com `search_path = public, pg_temp` e guard por unidade/perfil;
- professor nao acessa comparacao de equipe nem configuracao;
- Fabio/LA Teacher recebem somente os campos pedagogicos autorizados;
- payload bruto nao e exposto ao frontend;
- revisoes e ativacoes registram autor, data e justificativa.

---

## 11. Observabilidade

Medir por job:

- paginas, aulas e rosters recebidos;
- duplicatas por hash;
- 429, timeout e retries;
- aulas sem matricula-disciplina;
- professores sem identidade por ID;
- periodos alta/media/revisar;
- sobreposicoes;
- duracoes negativas ou zero;
- periodos menores de quatro meses;
- divergencia V2 x V3 por pilar;
- tempo das RPCs e snapshots.

Alertas nao incluem PII.

---

## 12. Portoes de qualidade

### Gate A - staging

- zero escrita em tabelas produtivas;
- retomada comprovada depois de falha;
- idempotencia comprovada;
- timezone validado em casos de borda;
- rate limit respeitado.

### Gate B - piloto historico

- casos das tres unidades;
- troca, renovacao, substituicao, segundo curso e professor inativo;
- nenhuma identidade resolvida definitivamente por nome;
- ambiguidades visiveis na fila;
- coordenacao aprova amostra nominal.

### Gate C - periodos canonicos

- nenhum periodo publicavel sobreposto na mesma matricula-disciplina;
- periodo ativo fora da permanencia;
- menos de quatro meses fora da media;
- renovacao continua;
- motivo desconhecido nao penaliza.

### Gate D - motor V3

- seis pilares com numerador/denominador;
- sem defaults fabricados;
- snapshots fechados imutaveis;
- configuracao versionada;
- cobertura e sem_base corretos.

### Gate E - sombra

- junho/julho confrontados nos pilares sem presenca;
- agosto/setembro confrontados com presenca;
- lista ouro de professores validada;
- diferencas explicadas nominalmente;
- V2, relatorios gerencial/administrativo/comercial e telas nao migradas sem regressao.

### Gate F - cutover

- seguranca e desempenho aprovados;
- coordenacao homologa pesos, metas e faixas;
- feature flag e rollback testados;
- um consumidor por vez.

---

## 13. Rollback

O rollback nunca apaga historico. Para qualquer falha:

1. desativar a feature flag do consumidor;
2. voltar a leitura para a V2;
3. marcar snapshot V3 afetado como `invalidado`;
4. pausar job/coletor pelo status;
5. preservar staging, periodos e logs para diagnostico;
6. corrigir em nova versao de reconstrucao ou configuracao.

Como a V3 e aditiva, o rollback nao exige restaurar `aulas_emusys`, `aluno_presenca`, cards ou relatorios existentes.

---

## 14. Arquivos de documentacao obrigatorios na implementacao

Atualizar na mesma serie de commits:

- `docs/MAPA-SISTEMA.md`;
- `docs/METRICAS.md`;
- `docs/MAPA-INTEGRACAO-EMUSYS.md`;
- `docs/specs/2026-07-16-contrato-health-score-professor-v5-final.md` somente por nova revisao aprovada, nunca silenciosamente;
- relatorio de execucao e auditoria do piloto.

---

## 15. Sem pendencias funcionais para iniciar

As regras necessarias para comecar a camada aditiva estao fechadas. Metas numericas de `Media/Turma`, `Numero de alunos` e `Permanencia` serao calibradas em sombra e aprovadas pela coordenacao antes da ativacao; isso e um gate de governanca, nao uma permissao para o codigo inventar valores.
