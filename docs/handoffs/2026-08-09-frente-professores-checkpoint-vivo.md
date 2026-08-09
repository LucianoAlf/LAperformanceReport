# Checkpoint vivo — Frente Professores

**Documento vivo.** Não é relatório de encerramento: é o estado da frente, atualizado a cada checkpoint.
Última atualização: **09/08/2026**. Origem: sessão Claude que recebeu o handoff do Codex
([`2026-08-08-handoff-codex-para-claude.md`](2026-08-08-handoff-codex-para-claude.md)).

---

## 0. Como usar este documento (metodologia)

O trabalho longo se apoia em **três camadas**, e cada uma guarda uma coisa diferente:

| camada | onde | o que guarda | sobrevive a |
|---|---|---|---|
| **Memória** | `~/.claude/projects/<projeto>/memory/` | fatos duráveis e transversais (regra de negócio, feedback, armadilha permanente) | tudo — carrega sozinha em toda sessão |
| **Este documento** | `docs/handoffs/` (versionado no git) | estado da frente: o que foi feito, o que falta, evidência medida | `/compact`, fim de sessão, troca de agente |
| **Contexto do chat** | a conversa | trabalho imediato | nada — é descartável depois do checkpoint |

**Quando gravar um checkpoint aqui** — por evento, não por percentual de contexto (percentual é estimativa
frágil; evento é observável):

1. Ao **fechar um CP** (ou ao abandoná-lo conscientemente).
2. Ao descobrir algo que **muda o plano** — causa raiz nova, hipótese derrubada, escopo que cresceu.
3. **Antes de qualquer cirurgia em produção** (migration, DDL, backfill, ativação de cron).
4. Quando a sessão ficar pesada e valer um `/compact`.

**O ciclo:** gravar aqui → `/compact` → reabrir lendo este arquivo → continuar. Não precisa abrir chat novo.

**Regra de ouro:** o que estiver escrito aqui precisa ser **verificável** — número medido, migration aplicada,
query que reproduz. Hipótese não confirmada entra marcada como hipótese. Este documento já corrigiu duas
conclusões erradas (seção 5); ele só vale se for honesto sobre o que não foi provado.

---

## 1. Concluído e em produção

| item | resultado | evidência |
|---|---|---|
| **Média/Turma — recálculo duplicado** | 1.626 → **299 ms** (mensal), 1.114 → **564 ms** (trimestral); 172.323 → 88.869 buffers | PR #87, migration `20260808213000`, 4 testes novos |
| **ACL `anon`/`PUBLIC`** | fechada em 3 funções (uma `SECURITY DEFINER`) | PR #87, migration `20260808220000` |
| **v3 — diagnóstico** | **sem** trabalho duplicado; 704 ms reais; limite de otimização documentado com decisão de não mexer | PR #88, bloco no `CLAUDE.md` |
| **Cron do Health Score V3** | validado funcionando: 4 escopos, `sem_alteracao`, sem revisão duplicada | execução manual de `executar_health_score_professor_v3_cron_diario()` |
| **Smoke perfil `unidade`** | passa — carteira 31, trancados 9, Média/Turma 31, v3 33, recortado na unidade certa | JWT real de usuário `unidade` (CG) |
| **CP1 — materialização das atribuições** | destravada nas 3 unidades; sync roda com `falhas` vazio e materialização limpa | PR #90, migrations `20260809140000`, `20260809150000`, `20260809151000` |
| **CP2 — Campo Grande** | **108 atribuições ativas em 29 professores** (era 0 desde 29/07); zero sobreposições na tabela inteira | execução real do sync: 37/37, materialização `criados: 108` |
| **Guarda anti-inativação em massa** | finalização aborta sem escrever se ≥50% do catálogo ativo sairia numa execução | `finalizar_sync_professor_disciplinas_emusys_v1` |
| **Falha de materialização visível** | passa a entrar em `falhas`, não só no jsonb de estatísticas | mesma migration |
| **Colisão de cron (429)** | disciplinas movidas de `:15/:35/:55` para `:07/:27/:47` | `20260809151000` |

Todo o conteúdo está na `main` (`9d92d386`, `1fd1929e`). As branches `fix/turmas-v2-elimina-recalculo-duplicado`
e `docs/limite-otimizacao-professores` aparecem como "não mergeadas" apenas porque o merge foi **squash** —
o conteúdo está lá (conferido com `git ls-tree`). Podem ser deletadas.

---

## 2. Checkpoints abertos

### ~~CP0 — Pausar ou não os crons 76/77/78~~ ✅ **resolvido sem pausar**
A recomendação era não pausar, e o CP1 tornou a questão obsoleta: a guarda entrou e os crons foram
realinhados. Seguem ativos.

### ~~CP1 — Estabilizar a materialização~~ ✅ **fechado em 09/08 (PR #90)**
Eram **três** causas, não duas — e a terceira não estava no radar:
1. **`CHAVE_IMUTAVEL` (23514)**, Recreio e Barra. O UPDATE fazia `vigencia_inicio = least(atual, evidência)`
   e o predicado do WHERE selecionava justamente as linhas em que o valor mudaria — enquanto o trigger
   `proteger_historico` proíbe alterar `vigencia_inicio` de linha ativa. **A função pedia o que o trigger
   proíbe.** Uma única evidência com início anterior derrubava a execução da unidade inteira.
2. **`SOBREPOSICAO` (23P01)**, Campo Grande. O INSERT só checava linha **ativa**; o trigger
   `impedir_sobreposicao` compara contra **todas**, inclusive encerradas. Com início retroativo, todo vínculo
   já encerrado colidia com o próprio histórico: **108 de 108**, nenhum passava.
3. **`EMUSYS_HTTP_429`**, Barra e CG desde 07/08. Os três `sync-metadados-aulas-15m` ocupam **todo minuto
   múltiplo de 5** batendo na mesma API, e os crons de disciplinas estavam exatamente em `:15/:35/:55`.

⚠️ **A hipótese "Recreio falhando 4 dias" estava certa no fato e errada na leitura**: o `status='falhou'` de
CG/Barra era do 429 (sync), não da materialização. Quem falhava em silêncio era o Recreio, com
`status='completa'`.

### ~~CP2 — Reativar os vínculos de Campo Grande~~ ✅ **resolvido junto com o CP1**
Não precisou de reativação manual nem de cruzamento com o Emusys: **corrigida a rotina, ela mesma recriou os
vínculos**. As 108 nasceram em `2026-07-30`, dia seguinte ao encerramento em massa — histórico contínuo, sem
buraco e sem sobreposição. O espelho do Emusys já havia confirmado, professor a professor, que esses
professores seguiam ativos.

### ~~CP3 — Rematerializar o ciclo `2026-JUN-AGO`~~ ✅ **fechado em 09/08 (PR #94)**

O ciclo foi rematerializado em produção nos quatro escopos (3 unidades + consolidado), competência
`2026-08-01`, com as atribuições já corrigidas **e** com o bug do `apta_oficial` resolvido.

**Causa do bloqueio, achada e corrigida:** a materialização roda em estágios sucessivos. No estágio 2, o ramo
de `numero_alunos` **substitui** o `detalhes` inteiro (recalculando `apta_oficial`), enquanto o de
`media_turma` **preserva** o `detalhes` do estágio 1 e acrescenta 4 chaves. Ele corrigia `estado_base` para
`'ok'`, calculava `publicavel` e a nota — mas **carregava o `apta_oficial` congelado** de quando o estado
ainda era `segmentacao_incompleta`. A regra não mudou; passou a ser avaliada com os valores que o próprio
estágio acabou de corrigir.

**Estado do fechamento de 01/09 — quem ainda bloqueia** (consolidado, última revisão):

| métrica | com nota | aptas | **bloqueiam** | natureza |
|---|---|---|---|---|
| `media_turma` | 42 | 42 | **0** | ✅ resolvido |
| `numero_alunos` | 0 | 42 | **0** | ✅ não bloqueia (sem nota) |
| `retencao` | 37 | 0 | **37** | trava de data (31/08) + pendências → **CP4** |
| `presenca` | 7 | 0 | **7** | trava de data (31/08), resolve sozinho |
| `conversao` | 27 | 0 | **27** | ⚠️ regra não investigada |
| `permanencia` | 38 | 31 | **7** | sem trava de data — 7 casos reais de curadoria |

⚠️ **`conversao` é item novo**: 27 bloqueios e não sei a regra do `apta_oficial` dela. Não estava em nenhum
checkpoint. Precisa entrar na lista.

Mas `apta_oficial` continua **0**, e a razão **não** é data. A regra das métricas segmentadas é
`periodicidade='ciclo' AND estado_base_calculado='ok' AND nota_segmentada IS NOT NULL` — **sem trava de
`periodo_fim`**, ao contrário de `presenca`/`retencao`.

🔴 **CAUSA ENCONTRADA — e é o verdadeiro bloqueador de 01/09, não as atribuições nem a data.**
Em `get_health_score_professor_v3_metricas_segmentadas_agregadas_v1`, o ramo do ciclo trata `media_turma` e
`numero_alunos` como *fotografia do último mês alcançado* e, por isso, chama a base com **`'mensal'`**:

```sql
-- Metricas de estado usam somente a fotografia do ultimo mes alcancado.
select ... , coalesce(b.detalhes,'{}') || jsonb_build_object('periodicidade','ciclo', ...)
from public.get_hs_prof_v3_segmentadas_agregadas_before_snapshot_20260804(
  v_competencia_fotografia, p_config_id, p_unidade_id, 'mensal'   -- <<<
) b
where b.metrica in ('media_turma','numero_alunos');
```

Mas `apta_oficial` é calculado **dentro** dessa base, com `p_periodicidade = 'ciclo' AND …`. Com `'mensal'`
chegando, a primeira condição é falsa **sempre**. O `||` de fora sobrescreve o rótulo `periodicidade` para
`'ciclo'` e acrescenta `semantica_ciclo: 'fotografia_fim_recorte'`, mas **não recalcula a flag derivada**.

⚠️ **CORREÇÃO (mesma sessão, 09/08).** A conclusão acima — *"`media_turma` e `numero_alunos` nunca podem ser
`apta_oficial` num snapshot de ciclo"* — **é falsa e foi publicada cedo demais**. Fica registrada porque o
erro é instrutivo: eu li a cadeia do **caminho de leitura** (`get_…_agregadas_v1`, que de fato repassa
`'mensal'`) e concluí sobre o **caminho de escrita**, que é outro.

`materializar_health_score_professor_v3_periodo_impl_base_202607` tem **cópia própria e inline** da mesma
expressão, usando o `p_periodicidade` **dele** — que é `'ciclo'`. Prova, medida em transação com rollback
sobre o snapshot real de Campo Grande:

| métrica | `estado_base` | `apta_oficial` | linhas | com nota |
|---|---|---|---|---|
| `numero_alunos` | `ok` | **true** | 54 | 27 |
| `media_turma` | `ok` | **false** | 58 | 58 |

Ou seja: métrica segmentada **pode** ser apta num snapshot de ciclo — `numero_alunos` é. O que sobra é uma
**assimetria entre as duas métricas sob `estado_base` idêntico**, ainda **não explicada**. O repasse de
`'mensal'` no caminho de leitura é real e continua sendo um cheiro forte (afeta o que a API/UI devolve), mas
**não** explica a assimetria, porque lá as duas passam pelo mesmo ramo.

⚠️ **Não mexer ainda.** A causa não está isolada, e o handoff é explícito: *não alterar a fórmula do V3*.
Próximo passo é comparar as duas métricas linha a linha dentro de `pontuadas`/`avaliadas` do impl — o
diferenciador tem que estar em `nota_segmentada` ou no `denominador` agregado, já que `estado_base` e
periodicidade são iguais.

**Duas lições de método:** (1) neste banco a mesma regra aparece **duplicada** em implementação de leitura e
de escrita — achar a expressão numa não diz o que a outra faz; (2) publicar conclusão de causa raiz sem
medir no caminho que realmente grava é como o erro entrou.

⚠️ **Armadilha de leitura que me pegou:** filtrei `detalhes->>'tem_segmentacao_incompleta'` e li "0 bloqueios"
— só que essa chave **não existe** no payload, e `NULL` não é `true`. Contar ausência como negativa dá
falso alívio. Confirmar que a chave existe antes de tirar conclusão de um filtro sobre jsonb.

⚠️ **Descoberta que muda o planejamento de 01/09: nenhuma automação materializa o ciclo.** O cron 109
(`materializar-health-score-professor-v3-diario`, 03:30 BRT) fixa `'mensal'` nos quatro pontos de chamada, e
`executar_health_score_professor_v3_escopo_diario` **levanta exceção** se a periodicidade não for `mensal`
(guard na linha 8). O ciclo está congelado em **22/07** — calculado quando Campo Grande ainda tinha zero
atribuições. Sem rematerialização manual, `fechar_health_score_professor_v3_ciclo` em 01/09 fecharia um
retrato de três semanas atrás, sem agosto.

✅ **Rematerializar em agosto é seguro**: o fechamento escolhe, por professor+unidade,
`order by competencia desc, revisao desc` — a competência mais nova vence. Snapshots de ciclo com competência
`2026-08-01` convivem com os de `2026-07-01`, não conflitam.
Entrada correta: `materializar_health_score_professor_v3_escopo(competência, 'ciclo', escopo, unidade, null)`.

⚠️ **Nuance do filtro de elegibilidade:** o fechamento exige que **toda métrica que tem `nota`** seja
`apta_oficial`. Métrica com `nota IS NULL` **não** bloqueia. Isso muda a leitura de "quantos faltam".

⚠️ Também apareceu um erro do dia no cron 109: `HEALTH_SCORE_V3_PILARES_INCOMPLETOS` numa unidade (mensal,
09/08 06:30 UTC) — não investigado.

### CP4 — Cruzar os ~166 vínculos em revisão da retenção com o Emusys *(independente)*
Retenção reprova por `pendencias_total > 0`. Cruzar para separar: aluno **ativo** (não houve saída → descartar
da penalização), **trancado**, **finalizado**. ⚠️ A API **não expõe motivo de saída**, só status — o motivo
continua sendo curadoria em `movimentacoes_admin`.

### CP5 — Agosto/consolidado com zero segmentos de `media_turma` *(independente, hipótese)*
43 snapshots e **0 segmentos**, contra 7.606 em julho/consolidado e 948 em agosto/unidade. Suspeita de
materialização emergencial incompleta — **não confirmado**, pode ser diferença de caminho de materialização.

### CP6 — Blindagem + housekeeping *(parcialmente feito)*
✅ Branches órfãs deletadas. ✅ Guarda anti-inativação em massa no ar. ✅ Barra e Recreio validadas com
execução real de sync (21/21 e 29/29, `falhas` vazio) — não dependem mais de ordem de cron.

Pendente:
- **Retry com backoff na edge `sync-professor-disciplinas-emusys`.** Mover o cron reduz a colisão, não elimina
  o risco: qualquer outro consumidor da API no mesmo instante reabre o 429. É a blindagem definitiva.
- ⚠️ **Os crons 76/77/78 mandam só `x-sync-token`, sem `Authorization`.** Funciona porque a edge tem
  `verify_jwt = false`; um redeploy pelo MCP reseta para `true` e o cron morre em **401 silencioso** — o
  `pg_cron` marca `succeeded` de qualquer jeito. Exatamente o que matou o `sync-inadimplencia-emusys`.
- **`HEALTH_SCORE_V3_PILARES_INCOMPLETOS`** no cron 109 de 09/08 (mensal, uma unidade).

---

## 3. Causa raiz do bloqueio do Health Score (provada)

**Campo Grande tem 0 atribuições ativas** em `professor_unidade_curso_modalidade` (124 encerradas).
Barra tem 122 ativas, Recreio 149.

Linha do tempo reconstruída de `emusys_professor_disciplinas_sync_execucoes.estatisticas`:

| dia | o que aconteceu |
|---|---|
| 21/07 | normal — `mantidos: 116, encerrados: 0` |
| 22–28/07 | materialização **falhou 7 dias seguidos** (`CHAVE_IMUTAVEL`), execução seguiu `completa` |
| **29/07** | **`catalogo_inativados: 37`** (37 de 37 disciplinas!) + `atribuicoes_inativadas: 119` → `materializavel` vazio → **`encerrados: 116`** |
| 29/07 (seguinte) | `catalogo_inativados: 0`, `atribuicoes_observadas: 122` — **o catálogo voltou**. Evento transitório |
| 29/07 → 01/08 | falha com `SOBREPOSICAO` — não consegue recriar |

**Mecanismo:** `reconciliar_professor_curso_modalidade_v2` encerra tudo que está ativo e **não** aparece na
temp `_professor_curso_modalidade_v2_materializavel`. Esse conjunto vem de
`fn_professor_curso_modalidade_evidencias_v2`, cuja flag `materializavel` no ramo formal é:

```sql
formal.curso_id is not null
and formal.professor_id is not null
and coalesce(formal.professor_ativo_na_unidade, false)
and not formal.is_projeto_banda
```

Ou seja, depende do **catálogo formal**, não de haver aula. Com o catálogo inativado em massa, o conjunto
ficou vazio e tudo foi encerrado. Motivo gravado nas próprias `evidencias`:
`ausente_no_formal_e_na_jornada_apos_sync_completo`, `regra_versao: professor_curso_modalidade_catalogo_v2`,
sem revisor humano, `confianca='alta'`.

**O Emusys desmente:** o espelho `aluno_jornada_matricula_disciplina` (sync diário) mostra os mesmos
professores ativos em CG — Bateria 6 professores/97 alunos, Canto 7/92, Teclado 10/66, Guitarra 8/61.
O match bate **professor a professor** com a lista que o Health Score acusa como "sem atribuição".

**Cadeia de impacto:** vínculo encerrado → `media_turma` acusa `segmentacao_incompleta`/`atribuicao_ausente`
→ `apta_oficial: false` → fechamento oficial travado → ranking impossível (constraint
`health_score_professor_v3_snapshot_publicacao_chk` exige `fechado`+`oficial`+`publicado`).

---

## 4. Fechamento oficial e ranking — o que é regra, não bug

**O Health Score V3 oficializa CICLO trimestral, não mês.** `apta_oficial` tem
`periodicidade = 'ciclo'` como **primeira condição** — todo snapshot mensal é `false` por construção.
O P2 do handoff do Codex ("fechamento mensal oficial + promoção no dia 5") pede uma máquina que o modelo
não prevê. A máquina correta já existe: `fechar_health_score_professor_v3_ciclo(codigo, justificativa)`.

Regras lidas na fonte (09/08):
- `presenca`: `periodicidade='ciclo' AND fim_periodo <= current_date AND classificados_confiaveis >= 10 AND classificados/esperados >= 0.95`
- `retencao`: `periodicidade='ciclo' AND periodo_fim <= current_date AND vinculos_expostos_limpos >= 10 AND pendencias_total = 0`
- `permanencia`: `vinculos >= 3 AND em_revisao = 0 AND NOT historico_incompleto` — **não** exige ciclo nem data
- `fechar_..._ciclo` recusa com `ciclo ainda aberto` enquanto `current_date < data_fim`

O ciclo `2026-JUN-AGO` termina **31/08/2026** → antes de **01/09** não há o que fechar. Não é decisão, é calendário.

**Projeção para 01/09** (medida em 09/08, sobre snapshots de ciclo):

| métrica | aptas projetadas | situação |
|---|---|---|
| `presenca` | **7/7 e 12/12** | pronta, só espera a data |
| `permanencia` | 68/79 | maioria pronta |
| `numero_alunos` | 0 | `meses_com_base: 2` de `3` — **resolve sozinho** quando agosto fechar |
| `media_turma` | 0 | travada pela seção 3 |
| `retencao` | 0 | ~166 vínculos em revisão (CP4) |

---

## 5. Armadilhas — erros cometidos nesta frente, para não repetir

1. **Medir tempo sem aquecer engana.** Comparações isoladas sugeriram ~714 ms de CPU sobrando na v3;
   remedindo com os filhos aquecidos **na mesma transação**, a função dá 341 ms e a v3 inteira 704 ms
   (não 1.731). Ao decompor pai × filhos, aqueça os filhos antes. **A conta de buffers é estável e não mente** —
   foi ela que achou a duplicação real da Média/Turma.
2. **Snapshot de ciclo tem `detalhes` com estrutura DIFERENTE do mensal.** No ciclo, `retencao` traz
   `vinculos_expostos` + `vinculos_em_revisao`; **não** existe `vinculos_expostos_limpos` nem
   `encerramentos_pos_corte_pendentes` (esses são do mensal). Ler o campo do formato errado produz projeção falsa.
3. **Rodar dry-run na periodicidade errada.** O primeiro dry-run de fechamento foi feito sobre snapshots
   **mensais**, que nunca são aptos — deu "1 apto em 42", número sem sentido.
4. **Ir à fonte antes de gerar lista de curadoria.** A lista que quase geramos teria mandado as unidades
   recadastrarem à mão 384 segmentos que o próprio sistema apagou. Cruzar com o Emusys revelou o bug.

---

## 6. Retomada rápida

```sql
-- Materialização está falhando agora?
select u.nome, e.finalizado_em::date,
       coalesce(e.estatisticas->'materializacao_v2'->>'status','ok') as materializacao,
       e.estatisticas->'materializacao_v2'->>'mensagem' as mensagem
from public.emusys_professor_disciplinas_sync_execucoes e
join public.unidades u on u.id=e.unidade_id
where e.finalizado_em >= current_date - 5
order by u.nome, e.finalizado_em desc;

-- Campo Grande recuperou atribuições ativas?
select u.nome, p.status, count(*)
from public.professor_unidade_curso_modalidade p
join public.unidades u on u.id=p.unidade_id
group by 1,2 order by 1,2;
```

⚠️ Medir RPC sempre como `authenticated` com JWT real (`set local role authenticated` +
`set local request.jwt.claims`), nos três perfis — `service_role` ignora RLS e já escondeu bug por 14 tasks
neste projeto.

**Frentes que NÃO se misturam com esta:** competência fechada em Alunos (P5), retenção/compactação de
snapshots (P4, só simulação aprovada), e as ~20 branches abertas de outros agentes (`codex/`, `devin/`, `p02*`).
