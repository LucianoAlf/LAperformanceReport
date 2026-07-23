# Handoff tecnico - Health Score V3, LA Teacher, Fabio e proxima fase de presenca

**Data da auditoria:** 22/07/2026
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Repositorio:** `LAperformanceReport`
**Commit homologado:** `837f12f`
**Publico:** Claude Code, Alfredo, equipe do LA Teacher e agentes pedagogicos
**Escopo:** consumo pedagogico do Health Score Professor V3 e ponto de partida seguro para a nova presenca

---

## Atualizacao pos-auditoria cruzada - 22/07/2026

Claude Code confrontou este handoff com o LA Teacher e o banco vivo. O LA Report
revalidou os achados e aplicou a migration
`20260722153000_presenca_fontes_humanas_ficha_semantica.sql`.

Estado confirmado depois da aplicacao:

- o antigo `ON CONFLICT DO NOTHING` nao existe mais na producao;
- a resposta humana promove uma linha automatica, mas nao sobrescreve outra
  resposta humana;
- o sync do Emusys nao rebaixa nem sobrescreve resposta humana;
- `fn_presenca_e_forte` e agora a matriz unica usada tambem pela presenca
  semantica;
- `fabio_audio` e `professor_whatsapp` sao fontes humanas confirmadas;
- `app_aluno_ficha` continua retornando `status` por compatibilidade e passa a
  expor tambem resultado pedagogico, confianca e revisao operacional;
- a autoria anterior da retificacao ja era preservada pelas colunas e pelo
  trigger `completar_origem_retificacao_presenca`; nenhuma migration duplicada
  foi criada;
- o Health Score continua fora do LA Teacher por decisao do Alf.

As secoes 9 a 11 abaixo ja refletem essa verificacao posterior.

---

## 1. Veredito executivo

O Health Score Professor V3 esta homologado nos consumidores internos do LA Report em modo de publicacao parcial. Performance, cards, modal do professor, Dashboard, Analytics e relatorios internos usam os mesmos KPIs canonicos e os mesmos snapshots V3.

As regras de publicacao estao ativas:

- `parcial`: pode ser exibido como diagnostico;
- `sem_base`: deve permanecer literalmente sem base;
- `oficial`: exige snapshot fechado e liberacao explicita;
- ranking e premiacao so podem usar `oficial + ranking_habilitado=true`;
- ausencia de dado nunca pode ser convertida em zero.

Fabio e LA Teacher ainda nao estao conectados ao read model V3 neste repositorio. O backend seguro ja existe, mas a integracao precisa ser feita no backend de cada consumidor.

**Conclusao operacional:** a fase de presenca pode continuar sobre o contrato de promocao ja ativo. O conflito entre uma linha previamente sincronizada do Emusys e a resposta explicita do professor foi resolvido antes desta auditoria e agora esta congelado em teste de contrato. A proxima frente e a representacao semantica na UI do LA Teacher, sem permitir correcao pelo professor.

---

## 2. O que foi homologado no LA Report

| Consumidor | Fonte de KPI | Fonte V3 | Estado |
|---|---|---|---|
| Performance de Professores | `get_kpis_professor_periodo_canonico_v3` | `get_health_score_professor_v3_performance` | Homologado |
| Modal individual | KPI canonico do periodo | `get_health_score_professor_v3_snapshot_modal` | Homologado |
| Carteira do professor | Carteira canonica do periodo | `get_health_score_professor_v3_performance` | Homologado |
| Cadastro de professores | KPI canonico do periodo | Nao pontua Health | Homologado |
| Dashboard | Mesma camada da Performance | Hook V3 | Homologado |
| Analytics | Mesma camada do Dashboard | Hook V3 | Homologado |
| Relatorio individual | Payload canonico do modal | Snapshot modal V3 | Homologado |
| Relatorio da coordenacao | KPIs canonicos + V3 | Performance V3 | Homologado |
| Relatorio instantaneo/ranking | KPI canonico filtrado por vinculo ativo | Performance V3 | Homologado |

Validacao visual realizada nas tres unidades:

| Recorte ativo | Professores visiveis |
|---|---:|
| Barra | 19 |
| Recreio | 24 |
| Campo Grande | 32 |
| Consolidado | 47 |

Os snapshots rematerializados ficaram sem divergencia contra a fonte corrente no recorte homologado. A tabela de snapshots preserva revisoes historicas; portanto, **nao contar linhas da tabela como quantidade de professores**. Consumidores devem usar as RPCs de leitura, que resolvem a revisao aplicavel.

---

## 3. Arquitetura canonica do Health Score V3

Fluxo autorizado:

```text
fontes canonicas por metrica
  -> motor de metricas por competencia/ciclo
  -> snapshots versionados e imutaveis
  -> read models V3
  -> consumidor autorizado
```

Fontes centrais:

| Pilar | Fonte canonica principal |
|---|---|
| Retencao atribuivel | periodos professor-matricula-disciplina + movimentacoes e motivos confirmados |
| Permanencia com o professor | `vw_professor_periodos_efetivos_v3_sombra` |
| Conversao experimental | experimentais Emusys canonicas e matriculas vinculadas |
| Media de alunos por turma | carteira canonica mensal e ocupacoes/turmas elegiveis |
| Numero de alunos | carteira canonica por pessoa, professor e unidade |
| Presenca dos alunos | `vw_aluno_presenca_semantica_v1` + roster + politica temporal da unidade |

Fontes proibidas para codigo novo:

- `alunos.professor_atual_id` isolado como carteira historica;
- `alunos.percentual_presenca`;
- `aluno_presenca` bruto como resultado pedagogico;
- `aulas_emusys.professor_presenca='ausente'` como falta do professor;
- `movimentacoes` legada;
- `renovacoes` legada;
- nome de professor ou aluno como identidade final;
- RPC legada que usa `COALESCE(..., 0)` para fabricar indicador.

---

## 4. Contrato V3 pronto para Fabio e LA Teacher

RPC existente:

```sql
public.get_health_score_professor_v3_consumidor_pedagogico(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
  p_periodicidade text default 'mensal'
) returns jsonb
```

Retorno: array JSON com uma linha por metrica. Cada item possui:

- `professor_id` e `unidade_id`;
- `periodicidade`, `periodo_inicio`, `periodo_fim` e `ciclo_codigo`;
- `estado_publicacao`, `score_exibivel` e `ranking_habilitado`;
- `score`, `cobertura` e `classificacao`;
- `metrica`, `valor_bruto`, `numerador` e `denominador`;
- `nota`, `meta`, `amostra` e `estado_base`;
- `confianca` e `detalhes`.

O payload nao contem MRR, ticket, parcela, mensalidade, inadimplencia ou qualquer outro dado financeiro.

### 4.1 Permissoes verificadas no banco remoto

| Papel | Pode executar RPC pedagogica V3 |
|---|---|
| `anon` | Nao |
| `authenticated` | Nao |
| `fabio_agent` | Sim |
| `service_role` | Sim |

A funcao e `SECURITY DEFINER` com `search_path=public, pg_temp`.

### 4.2 Regra para o Fabio

O backend do Fabio pode consumir a RPC com `fabio_agent` ou `service_role`. A Edge `gemini-fabio-chat` ainda nao faz essa chamada neste repositorio.

O Fabio deve:

1. solicitar o professor, unidade, competencia e periodicidade exatos;
2. exibir o valor bruto e o estado da metrica;
3. dizer `sem base` quando `estado_base` ou o valor vierem nulos;
4. usar score parcial somente como diagnostico;
5. nunca produzir ranking com snapshot parcial;
6. nunca recalcular o Health Score no prompt.

### 4.3 Regra para o LA Teacher

O cliente autenticado do LA Teacher **nao pode chamar diretamente** a RPC pedagogica V3. Isso e intencional: a funcao aceita IDs de professor e unidade, e o cliente nao pode escolher livremente a carteira de outra pessoa.

O LA Teacher deve usar uma destas opcoes:

1. backend proprio com `service_role`, validando previamente usuario, professor e unidade; ou
2. nova RPC `app_*` escopada, que resolva `fn_professor_do_usuario()` e nao aceite um `professor_id` arbitrario.

Contrato recomendado para a futura RPC escopada:

```sql
app_meu_health_score_v3(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text default 'mensal'
) returns jsonb
```

Guardas obrigatorios:

- resolver professor pelo usuario autenticado;
- validar que o professor possui vinculo com a unidade solicitada;
- impedir leitura de outro professor;
- omitir dados financeiros;
- delegar o calculo a `get_health_score_professor_v3_consumidor_pedagogico`;
- devolver nulo/sem base, nunca zero sintetico;
- revogar `anon` e `public`;
- testar professor multiunidade e usuario sem professor.

**Nunca colocar a chave `service_role` no aplicativo.**

---

## 5. Edge Functions auditadas

As seguintes Edge Functions recebem V3 por payload ou modulo compartilhado:

- `gemini-insights-equipe`;
- `gemini-insights-professor`;
- `gemini-ranking-professores`;
- `gemini-relatorio-coordenacao`;
- `gemini-relatorio-professor-individual`.

Contrato atual:

- relatorio/insight pode interpretar snapshot parcial como diagnostico;
- ranking exige snapshot oficial e habilitado;
- metrica sem base permanece sem base;
- a Edge nao consulta outra fonte para recalcular o score;
- rollback consiste em remover o bloco V3 do payload, sem apagar snapshots.

Pendencia externa:

- integrar o Fabio ao contrato V3;
- integrar o LA Teacher por wrapper autenticado;
- validar chamadas reais do provedor de IA em ambiente controlado, sem misturar essa validacao com a paridade dos dados.

---

## 6. Presenca: grao e fontes canonicas

O grao oficial da presenca e:

```text
aluno + aula Emusys
```

Fontes:

| Necessidade | Fonte |
|---|---|
| Aula e horario | `aulas_emusys` |
| Roster esperado | `aula_alunos_emusys` |
| Evidencia bruta | `aluno_presenca` |
| Resultado pedagogico | `vw_aluno_presenca_semantica_v1` |
| Politica temporal | `presenca_politicas_confiabilidade` |
| Revisao de ausencias automaticas | `aluno_presenca_revisoes_operacionais` |
| Justificativa administrativa | `aluno_presenca_administrativo` |
| Retificacao auditada | `aluno_presenca_retificacoes` |

Estados semanticos atuais:

- `presente`;
- `falta_confirmada`;
- `falta_provavel`;
- `indeterminado`;
- `aula_justificada`;
- `aula_cancelada`.

Somente `presente` e `falta_confirmada` entram no denominador de frequencia. Aula justificada e cancelada ficam fora. Falta provavel e indeterminado nao podem ser apresentados como fato confirmado.

---

## 7. Politica temporal de presenca vigente

Politicas verificadas no banco em 22/07/2026:

| Unidade | Periodo | Ausencia Emusys | Revisao operacional |
|---|---|---|---|
| Barra | 01/06/2026 a 31/07/2026 | `falta_confirmada` | Nao |
| Recreio | 01/06/2026 a 31/07/2026 | `falta_confirmada` | Nao |
| Campo Grande | 01/06/2026 a 31/07/2026 | `falta_confirmada` | Sim |
| Barra | 01/08/2026 em diante | `falta_confirmada` | Nao |
| Recreio | 01/08/2026 em diante | `falta_confirmada` | Nao |
| Campo Grande | 01/08/2026 em diante | `falta_confirmada` | Sim |

Consequencias:

- Barra e Recreio podem publicar a presenca segundo a politica aprovada;
- Campo Grande exibe o dado em auditoria e fica fora da pontuacao enquanto exigir revisao;
- a classificacao vem da tabela de politicas, nunca de `if unidade = ...` no consumidor;
- a resposta explicita do LA Teacher e considerada evidencia humana confirmada.

---

## 8. Cobertura observada no banco remoto

Distribuicao atual da evidencia bruta:

| Origem | Registros | Primeira aula | Ultima aula |
|---|---:|---|---|
| Emusys | 48.988 | 25/02/2026 | 18/07/2026 |
| LA Teacher | 15 | 13/07/2026 | 16/07/2026 |
| Manual | 2 | 06/05/2026 | 16/07/2026 |

O LA Teacher ja escreveu um piloto real, mas ainda nao possui cobertura operacional ampla.

Resumo semantico de junho e julho. Numeros dinamicos, medidos em 22/07/2026:

| Unidade/mes | Presentes | Faltas confirmadas | Aulas justificadas | Ausencias que exigem revisao |
|---|---:|---:|---:|---:|
| Barra - Jun | 1.253 | 758 | 45 | 0 |
| Barra - Jul | 824 | 477 | 10 | 0 |
| Recreio - Jun | 2.283 | 998 | 106 | 0 |
| Recreio - Jul | 1.415 | 743 | 59 | 0 |
| Campo Grande - Jun | 2.571 | 1.571 | 278 | 1.571 |
| Campo Grande - Jul | 814 | 1.723 | 4 | 1.717 |

Em Campo Grande, registros explicitos do LA Teacher/manual nao entram na fila de revisao; a fila cobre ausencias automaticas do Emusys.

---

## 9. RPCs de presenca que ja existem

### 9.1 Agenda e carteira

```sql
app_minha_carteira()
app_minha_agenda_sessao(p_data date)
```

Ambas resolvem o professor pelo usuario autenticado. `anon` nao executa.

### 9.2 Registro de chamada

```sql
app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'
) returns jsonb
```

Comportamento atual:

- resolve o professor por `fn_professor_do_usuario()`;
- valida ownership da aula;
- bloqueia aula cancelada;
- exige a aula ancora de turma;
- abre 15 minutos antes da aula;
- fecha 24 horas depois;
- exige roster sincronizado e alunos vinculados;
- recebe a lista dos ausentes;
- marca os demais alunos como presentes;
- registra `respondido_por='professor_la_teacher'` e `respondido_em=now()`;
- delega a `fn_registrar_presencas_core`;
- promove uma linha fraca do Emusys/sistema para a resposta humana;
- nunca sobrescreve uma fonte humana forte;
- aceita completar chamada parcial enquanto o roster ainda nao estiver todo
  coberto por fonte forte;
- retorna `chamada_ja_enviada` quando o roster completo ja possui resposta
  humana forte.

Permissoes verificadas:

- `authenticated`: pode executar;
- `anon`: nao pode executar;
- `service_role`: pode executar;
- `fabio_agent`: nao executa essa RPC.

### 9.3 Correcao administrativa

```sql
admin_corrigir_presenca(
  p_aluno_presenca_id uuid,
  p_status_presenca text,
  p_motivo text
)
```

Essa funcao preserva trilha em `aluno_presenca_retificacoes`. As colunas
`respondido_por_anterior` e `respondido_em_anterior`, complementadas pelo
trigger `completar_origem_retificacao_presenca`, guardam a autoria anterior.
Correcao nao apaga silenciosamente a primeira escrita.

---

## 10. P0 encerrado e riscos remanescentes

O conflito `Emusys primeiro x professor depois` esta encerrado no banco vivo:

1. `fn_registrar_presencas_core` promove a linha automatica para a resposta
   humana;
2. `upsert_presenca_emusys_bruta` nao atualiza linha de fonte humana forte;
3. `emusys_presenca_bruta` e `sincronizado_emusys_em` preservam a evidencia da
   origem automatica;
4. retry nao duplica resposta nem permite forte-sobre-forte;
5. correcao posterior continua exclusiva da coordenacao e auditada.

Riscos remanescentes:

- o frontend do LA Teacher ainda precisa renderizar
  `resultado_pedagogico`, distinguindo falta confirmada, falta provavel e
  indeterminado;
- linhas promovidas antes da captura da evidencia bruta em 16/07 possuem uma
  lacuna historica pequena e documentada;
- uma camada append-only de payload integral permanece opcional, nao e
  requisito para a leitura canonica atual.

---

## 11. Plano recomendado para a fase de presenca

### Fase P0 - contrato e auditoria - concluida

1. escritores de `aluno_presenca` mapeados;
2. promocao Emusys primeiro x professor depois confirmada no banco vivo;
3. aula individual e ancora de turma confirmadas;
4. correcao mantida exclusivamente com a coordenacao;
5. estados, autoria e idempotencia congelados em teste de contrato.

### Fase P1 - backend aditivo - concluida no LA Report

1. manter a RPC autenticada de registro e seu core de promocao;
2. usar `fn_presenca_e_forte` como matriz unica das fontes humanas;
3. classificar `fabio_audio` e `professor_whatsapp` como evidencia humana;
4. publicar `vw_aluno_presenca_semantica_v1` na regra `v1.3`;
5. expor a semantica em `app_aluno_ficha` sem remover o `status` legado;
6. preservar politicas temporais e a auditoria de Campo Grande;
7. manter view direta fechada e acesso do LA Teacher somente pela RPC.

### Fase P2 - LA Teacher - frontend pendente

1. agenda, roster e envio continuam pelas RPCs `app_*` existentes;
2. a Ficha deve preferir `resultado_pedagogico` ao `status` legado;
3. mostrar `presente`, `falta_confirmada`, `falta_provavel`,
   `indeterminado`, `aula_justificada` e `aula_cancelada` sem ambiguidade;
4. manter o envio idempotente e a confirmacao de persistencia existentes;
5. nao oferecer edicao da chamada ao professor;
6. encaminhar qualquer correcao para o fluxo auditado da coordenacao.

### Fase P3 - LA Report/secretaria

1. consumir a mesma camada semantica;
2. mostrar contador de pendencias por unidade;
3. permitir conciliacao de Campo Grande;
4. separar falta confirmada, falta provavel e chamada nao feita;
5. nao editar diretamente tabelas brutas.

### Fase P4 - agentes e Health Score

1. Fabio e Sol leem a mesma RPC escopada;
2. nenhum agente infere falta por texto;
3. Health Score consome apenas a view semantica;
4. snapshots fechados so mudam por retificacao formal;
5. ranking continua bloqueado ate fechamento oficial.

### Fase P5 - rollout

1. piloto com poucos professores;
2. comparar LA Teacher, Emusys e LA Report por aula;
3. medir cobertura, conflitos e retries;
4. expandir por unidade;
5. manter rollback por consumidor.

---

## 12. Testes obrigatorios da presenca

1. professor autenticado registra a propria aula;
2. professor nao acessa aula de outro professor;
3. usuario sem professor recebe bloqueio;
4. aula cancelada nao aceita chamada;
5. aula futura fora da janela nao aceita chamada;
6. chamada depois de 24 horas segue a regra aprovada;
7. roster vazio ou incompleto bloqueia envio;
8. aluno fora do roster nao pode ser marcado;
9. turma com varias linhas usa uma ancora;
10. aula individual nao duplica a chamada da turma;
11. dois cursos do mesmo aluno permanecem separados;
12. mesmo aluno em duas unidades nao colide;
13. retry de rede e idempotente;
14. sync Emusys anterior nao apaga a resposta humana;
15. sync Emusys posterior nao apaga a resposta humana;
16. correcao preserva a primeira versao;
17. justificativa fica fora do denominador;
18. Campo Grande gera pendencia sem bloquear a leitura;
19. Barra e Recreio publicam conforme politica vigente;
20. `respondido_em` humano registra o momento real;
21. chamadas nao feitas nao viram falta automaticamente fora de politica;
22. Fabio, Sol e LA Teacher recebem o mesmo resultado semantico;
23. usuario anonimo nao le nem escreve presenca;
24. nenhum payload do LA Teacher contem financeiro.

---

## 13. Queries de conferencia para os consumidores

### Health Score pedagogico, somente backend autorizado

```sql
select public.get_health_score_professor_v3_consumidor_pedagogico(
  date '2026-07-01',
  '<unidade_uuid>'::uuid,
  <professor_id>,
  'mensal'
);
```

### Politicas de presenca

```sql
select
  u.nome,
  p.data_inicio,
  p.data_fim,
  p.ausencia_emusys_resultado,
  p.exige_revisao_operacional,
  p.regra_versao,
  p.ativa
from public.presenca_politicas_confiabilidade p
join public.unidades u on u.id = p.unidade_id
order by u.nome, p.data_inicio;
```

### Resultado semantico agregado

```sql
select
  unidade_id,
  date_trunc('month', data_aula)::date as competencia,
  resultado_pedagogico,
  proveniencia,
  count(*) as registros
from public.vw_aluno_presenca_semantica_v1
where data_aula between date '2026-06-01' and date '2026-07-31'
group by unidade_id, date_trunc('month', data_aula)::date,
         resultado_pedagogico, proveniencia;
```

Essas consultas sao para backend autorizado. O aplicativo nao deve receber acesso direto as tabelas internas.

---

## 14. Evidencias de qualidade

- `462/462` testes automatizados passaram na homologacao dos consumidores V3;
- build de producao concluido;
- Performance, Dashboard, Analytics e modal validados no navegador;
- ranking parcial bloqueado, inclusive em coorte mista;
- relatorio da coordenacao corrigido para 47 professores ativos;
- `main` e `origin/main` convergiram no commit `837f12f`;
- projeto remoto confirmado: `https://ouqwbbermlzqqvtqwlul.supabase.co`;
- grants das RPCs de Health e presenca conferidos por SELECT no banco remoto.

---

## 15. Rollback

Health Score V3:

- remover a leitura V3 do consumidor especifico;
- manter snapshots, configuracoes e historico;
- nao reverter dados brutos.

Presenca nova:

- feature flag por consumidor/unidade;
- manter Emusys como evidencia bruta;
- interromper somente a nova escrita humana se houver incidente;
- preservar submissao e retificacao ja gravadas;
- recompor a view semantica sem apagar historico.

---

## 16. Decisao para a proxima etapa

**Pode continuar a presenca pelo LA Teacher. O contrato P0 e o backend P1 estao concluidos.**

O proximo entregavel e a Fase P2 no LA Teacher: consumir os campos semanticos ja expostos por `app_aluno_ficha` e apresentar `falta_confirmada`, `falta_provavel` e `indeterminado` sem ambiguidade. O campo legado `status` permanece temporariamente no payload apenas para compatibilidade; consumidores novos devem preferir `resultado_pedagogico` e os metadados de confianca e revisao.

Nao deve ser criada correcao de chamada pelo professor. Retificacao continua exclusiva da coordenacao pelo fluxo auditado. O Health Score V3 permanece fora do aplicativo do professor e nao precisa ser reaberto; ele continuara lendo a mesma camada semantica quando novas evidencias humanas entrarem.

O objetivo nao e criar uma segunda presenca. E permitir que Emusys, LA Teacher, LA Report, Fabio e Sol compartilhem uma unica interpretacao canonica, com origem e auditoria preservadas.
