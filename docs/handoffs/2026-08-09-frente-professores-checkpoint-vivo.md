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

### CP7 — `conversao` não emite `apta_oficial` no ciclo *(diagnosticado 09/08, NÃO corrigido)*

**27 professores com nota bloqueiam o fechamento** — 2º maior bloqueador, atrás só da retenção. Só apareceu
depois que o CP3 resolveu `media_turma`; até então estava encoberto.

**Diagnóstico completo.** A cadeia vigente para conversão no ciclo é
`get_health_score_professor_v3_metricas_periodo` → `get_hs_prof_v3_metricas_periodo_base_20260803` →
`get_health_score_professor_v3_conversao_ciclo` → `get_hs_prof_v3_conversao_ciclo_base_20260803` (03/08).
**Nenhuma das quatro emite a chave `apta_oficial`.** O `detalhes` gravado não tem a chave, e o filtro do
fechamento faz `coalesce((detalhes->>'apta_oficial')::boolean, false) is not true` — **ausência conta como
reprovação**. Ironia: o mesmo payload traz `ranking_elegivel: true` e `codigo_evidencia: "evidencia_valida"`.

A implementação **anterior** (`get_health_score_prof_v3_metricas_base_20260728_c95`) emitia:

```sql
'apta_oficial', p_periodicidade = 'ciclo'
  and current_date >= v_fim_periodo + 30      -- janela D+30 de maturação
  and coalesce(e.experimentais, 0) >= 3
  and coalesce(e.sem_identidade, 0) = 0
```

⚠️ **NÃO é fix mecânico como o do CP3.** Lá a expressão existia e só recebia entrada velha; aqui a chave
sumiu na reescrita de 03/08 e restaurá-la exige **decidir a regra** para o vocabulário novo. Duas decisões de
negócio embutidas:

1. **Manter a janela D+30?** Se sim, o ciclo `2026-JUN-AGO` (fim 31/08) só amadurece em **30/09** — ou seja,
   **o fechamento oficial não pode ocorrer em 01/09**, mesmo com tudo o mais resolvido. Isso muda a data-alvo
   da frente inteira. A janela existe por um motivo real: uma experimental ainda vira matrícula em até 30 dias.
2. **O que zera hoje?** O payload novo trocou `sem_identidade` por `experimentais_sem_pessoa_canonica`,
   `experimentais_somente_evento` e `conversoes_declaradas_sem_matricula_canonica`. Numa amostra real havia
   **4 experimentais sem pessoa canônica** — sob a regra antiga isso reprovaria. Escolher quais desses
   contadores travam a oficialização é decisão do Alf, não minha.

✅ **DECIDIDO E APLICADO em 09/08 (Alf): manter a janela D+30.** Migration
`20260809200000_cp7_conversao_apta_oficial_janela_d30`. A regra antiga foi traduzida fiel para o vocabulário
novo: `current_date >= periodo_fim + 30` **and** `experimentais >= 3` **and** `sem_pessoa_canonica = 0`.
**A data-alvo do fechamento do ciclo passa a ser 30/09, não 01/09.**

🔴 **Mas isso NÃO destrava o fechamento — e a medição revelou um problema maior (ver CP9).** Com a janela
cumprida, **zero** dos 43 professores passariam: os 27 com amostra suficiente têm **todos**
`experimentais_sem_pessoa_canonica > 0`. No agregado, **99 de 182 experimentais do ciclo (54%) estão sem
pessoa canônica resolvida**, variando de 25% a 87,5% por professor.
A migration ainda vale: antes o bloqueio existia igual, só que **mudo** — sem chave e sem motivo legível.

---

### CP9 — Resíduos de identidade das experimentais *(achado 09/08; escopo corrigido, ver bloco de correção)*

> ⚠️ O título original deste checkpoint era **"54% das experimentais sem pessoa canônica"** e estava errado.
> Os 54% eram o denominador funcionando (gente que fez experimental e não matriculou). O que sobra de verdade
> está na tabela de nomes ao fim desta seção.

**Consequência 1 — a conversão fica subestimada para todo mundo.** Sem pessoa canônica resolvida não dá para
creditar a matrícula, então o **numerador** cai enquanto o denominador fica inteiro. A taxa de conversão de
todos os professores sai para baixo, e nenhum fica apto nem depois de 30/09.

**Consequência 2, mais grave — isso está pontuando o score agora.** A conversão vale **16,67%** do Health
Score do ciclo (15% renormalizado, porque `numero_alunos` saiu da nota). Ou seja, um sexto da nota de cada
professor está sendo calculado sobre um dado com 54% de identidade não resolvida.

⚠️ **E a própria função diz que não deveria pontuar.** `get_hs_prof_v3_conversao_ciclo_base_20260803` marca
`fora_do_score: true` e `provisorio_ciclo: true` para o ciclo `2026-JUN-AGO`, com
`motivo_sem_base = 'ciclo visivel para diagnostico; conversao fora do score'` e
`'aguardando calibracao das escalas antes de pontuar'`. Mas o estágio posterior
`health-score-professor-v3-nota-diagnostica-1` **sobrescreve** para `fora_do_score: false` e atribui o peso.
É a **terceira** ocorrência hoje do mesmo padrão: um estágio decide, o seguinte ignora — as outras duas foram
`media_turma`/`apta_oficial` (CP3) e o `estado_base` congelado.

⚠️ **Cronologia relevante:** a config **v4** (peso 15% para conversão) foi homologada em **27/07**; a função
que a tira do score é de **03/08** — **posterior**. A decisão mais recente é "fora do score", e ela não está
sendo respeitada.

✅ **DECIDIDO pelo Alf em 09/08: a conversão PONTUA.** Opção (b) — manter no score e resolver a identidade.
Também decidido: o crédito da conversão é do **professor que deu a aula experimental**, não daquele com quem
o aluno acabou matriculando (às vezes são pessoas diferentes) — conferir se a implementação respeita isso.

🔎 **RAIZ ENCONTRADA (09/08) — o Emusys já entregou tudo; o vínculo é que nunca foi ligado.**
Em `emusys_experimentais_raw`, no ciclo (1.665 experimentais com professor e presença):

| campo | preenchido |
|---|---|
| `emusys_lead_id` (ID do lado do Emusys) | **1.648 (99%)** |
| `emusys_lead_id_zero` (aluno já cadastrado, `id_lead=0`) | 17 — e têm `emusys_aluno_id` |
| **`lead_id` (FK interna para `leads`)** | **0** |
| `aluno_id` (FK interna) | 260 (15,6%) |
| `situacao_operacional = 'matriculado'` | **0** (todas `presente`) |

1.648 + 17 = 1.665: **cobertura 100% do lado do Emusys, 0% do lado do vínculo.** A API entrega `id_aluno` e
`id_lead` em `AlunoNaAula` desde 21/06/2026; a ingestão guarda o ID do Emusys e nunca resolve a FK.

**Ligando `emusys_lead_id` + `unidade_id` → `leads`:**

| situação | linhas | como resolve |
|---|---|---|
| casa em `leads` | **1.244 (75%)** | só ligar — **sem chamada à API** |
| `emusys_lead_id_zero` | 17 | por `emusys_aluno_id` |
| lead ausente no banco | 304 | precisa vir do Emusys |
| lead existe em **outra** unidade | 100 | ⚠️ investigar: ID é namespaced por unidade, pode ser cadastro na unidade errada — **não casar cross-unidade** |

São só **17 `emusys_lead_id` distintos** gerando as 404 linhas que faltam, e cada um tem **exatamente um nome**
— o dado é consistente, não há colisão.

⚠️ **Anomalia de ingestão dentro desses 404:** `8038` Daniel Barros Pontes Rodrigues com **162 linhas** e
`8015` Benjamin Duarte com **128** — juntos, 290 das 404. Uma pessoa com 162 "experimentais" num ciclo não é
experimental; isso infla o denominador da conversão do professor envolvido. Investigar antes de ligar.

⚠️ **`situacao_operacional = 'matriculado'` é zero em 1.665 linhas** — o estado que marcaria a conversão nunca
aparece. Verificar se o crédito de matrícula depende dele.

🔴 **CORREÇÃO (09/08, mesma sessão) — o bloco abaixo está ERRADO e fica à vista de propósito.**
Separando os dois contadores: das 196 experimentais do ciclo, só **14 estão sem lead resolvido** (7%) — a
função já resolve o lead em 93% pela cadeia de fallback. As 106 "sem pessoa canônica" **não são buraco de
dado**: `experimentais_sem_pessoa_canonica` conta quem fez experimental e **não virou aluno**, que é o estado
normal de quem não converteu. Das 92 que têm lead e não têm pessoa, apenas **1** declarou conversão sem
matrícula canônica (contador `conversoes_declaradas_sem_matricula_canonica`) — **esse** é o furo real.

**Consequências da correção:**
- **Os 41,8% são a taxa real de conversão, não um piso.** Os "91,1%" foram calculados tirando os
  não-convertidos do denominador — que é justamente onde eles devem estar. Não há distorção de 2×.
- **A regra que a migration `20260809200000` aplicou estava errada:** `sem_pessoa_canonica = 0` exige na
  prática **100% de conversão** para a métrica virar oficial. Corrigida em `20260809210000` para
  `conversoes_declaradas_sem_matricula_canonica = 0`. Medido: critério errado deixava **0 de 27** passarem;
  o correto deixa **26 de 27**.
- **Cai o alarme do CP9.** A cobertura de identidade não é o problema que eu descrevi; o que sobra é pequeno
  (14 sem lead + 1 conversão sem matrícula canônica) e a duplicação da tabela raw, que não contamina a nota.

**Lição de método:** dois contadores com nomes parecidos mediam coisas opostas. Antes de chamar um número de
"buraco", conferir se ele não é simplesmente **o denominador fazendo o seu trabalho**.

---

<details>
<summary>Bloco original, mantido para rastreabilidade (contém os números errados)</summary>

**IMPACTO MEDIDO (09/08) — a conversão exibida hoje é um piso, não uma medida.**

| medida | valor |
|---|---|
| experimentais no ciclo | 196 |
| matrículas creditadas | 82 |
| sem pessoa canônica | **106** |
| **taxa exibida hoje** | **41,8%** |
| taxa só entre as com identidade resolvida | 91,1% |

A meta é **70%**. Com 41,8% praticamente todo professor reprova na conversão — e ela vale **16,67%** da nota.

⚠️ **Os 91,1% são teto enviesado, não a verdade.** A identidade se resolve preferencialmente para quem
**matriculou** (o vínculo aparece quando a pessoa vira aluno, via `alunos.lead_origem_id`), então o
subconjunto resolvido pende para os convertidos. O que se pode afirmar é a **direção**: 41,8% é um **piso**,
porque identidade não resolvida só remove crédito, nunca adiciona. A verdade está entre 41,8% e 91,1% — e a
meta de 70% cai no meio do intervalo. **Hoje é impossível dizer se a conversão passa ou reprova.**

🔴 **Duas travas explícitas que o estágio de nota ignora.** A função marca, para este ciclo:
`publicavel = false` (**hardcoded**, não é condicional) e `estado_base = 'provisorio_ciclo'`. Ou seja, a
métrica se declara não-publicável e provisória — e mesmo assim entra no score com 16,67%. Não é ambiguidade
de leitura: é uma métrica marcada como não publicável sendo publicada.

</details>

#### Os nomes reais (levantados 09/08 a pedido do Alf, para conferência no painel do Emusys)

**A. Não existem do nosso lado — 3 pessoas, 4 eventos.** Conferidos por `emusys_student_id`, `emusys_lead_id`
e por nome (sem acento, `like`) em `alunos` **e** em `leads`: **nenhum** casa. Não é falha de matching, é
ausência de cadastro.

| pessoa | unidade | data | professor | curso | ID no Emusys | telefone |
|---|---|---|---|---|---|---|
| **Júlia Corrêa Gomes Diniz** | Barra | 11/06 10:00 | Gabriel Santos Teixeira da Silva | Aula Experimental | `aluno:288` ⚠️ | resp. Nathalia dos Santos Corrêa Diniz — 5521240524356 |
| **Manuela Fernandez Barbosa** | Barra | 31/07 17:00 | Isaque Mendes da Silva | Aula Experimental | `lead:7102` | 5521983091029 (resp. Johanna e Diego) |
| **Manuela Fernandez Barbosa** | Barra | 31/07 17:30 | Matheus Lana da Silva | Aula Experimental | `lead:7102` | *(mesma pessoa, 2 instrumentos no mesmo dia)* |
| **Samara Abreu Rodrigues** | Campo Grande | 03/06 19:00 | Matheus dos Santos Silva de Oliveira | Canto T | — (`id_lead=0`, sem `id_aluno`) | 5521981784943 |

⚠️ **Júlia é o caso mais informativo:** o Emusys mandou `emusys_aluno_id = 288` e o `participante_chave` está
gravado como `aluno:288`. **Nós temos o ID e não temos a pessoa** — `emusys_student_id` está preenchido em
1.615 de 1.632 alunos, então a coluna é usada; simplesmente não há linha com 288 na Barra. Vale conferir no
painel se é aluno de outra unidade, cadastro apagado, ou aluno que nunca foi criado no nosso lado.

**B. Lead declarado convertido, sem matrícula nenhuma — 1 caso.** É o **único** furo que trava
`apta_oficial` da conversão (`conversoes_declaradas_sem_matricula_canonica = 1`):

| lead | unidade | experimental | professor | dados |
|---|---|---|---|---|
| **Ravi Marques Leone** | Barra | 05/06 17:00 | Gabriel Antony Alves de Araújo | `leads.id=9764`, `emusys_lead_id=6667`, `converteu=true`, `data_conversao=05/06`, `status='convertido'`, tel. 5521967843373, resp. Karine Marques da Silva |

O lead está marcado como convertido desde 05/06 e **não existe nenhum aluno** com esse `lead_origem_id` nem
com esse nome na Barra. Conferir no Emusys: Ravi matriculou? Se sim, a matrícula não chegou; se não, o lead
foi marcado convertido por engano.

**C. Os outros 10 "sem lead" não precisam de conferência.** Têm `aluno_id` resolvido (José Demétrio, Davi
Guilherme, Heiton Fernando, Davi de Oliveira Azevedo, Luana Ferreira, Gael dos Santos ×2, Flávia Santiago,
Vicente Gomes, Guilherme Ferreira Muniz). Falta só o **lead**, e o lead não entra no cálculo — o numerador
usa `pessoa_chave`, que vem do aluno. É perda de rastreabilidade, não de número.

#### ⚠️ A "duplicação" da raw tem causa exata e não é duplicação: é log append-only

`emusys_experimentais_raw` tem **36.650 linhas para 323 eventos reais** (113,5 linhas por evento, 31 MB).
Mas `snapshot_ativo = true` em exatamente **322** — o mecanismo de snapshot funciona.

A causa está na composição da chave. Amostra do evento 824059 (Benjamin Duarte):

```
95553e96-…:824059:lead:8015:96d06c2c-0755-4391-980e-3d1a9e0f2275   ativo=true   02:55
95553e96-…:824059:lead:8015:473c7844-2bfe-4313-8ee0-16bd554353d6   ativo=false  02:40
95553e96-…:824059:lead:8015:2f5e4af3-d768-4533-b165-455bf1fdd20b   ativo=false  02:25
95553e96-…:824059:lead:8015:dc83ed75-ca5d-41ea-8e55-6a788d0503f6   ativo=false  02:10
```

`raw_key = unidade : aula : participante : **snapshot_execucao_id**`. O UUID da execução está **dentro da
chave**, então cada rodada do cron de 15 min gera uma chave nova e o upsert é impossível por construção.
Os intervalos de 15 minutos são visíveis na coluna de horário.

⚠️ **Corrigido o número que eu tinha dado:** eram 128 linhas para Benjamin (não 139) e 126 para Bernardo.

**A métrica não é contaminada** — a função faz `distinct on (evento_chave)` e colapsa. Mas qualquer consumidor
que leia a raw sem deduplicar (ou sem filtrar `snapshot_ativo`) erra por ~113×. Não precisa de conferência
no Emusys; é decisão nossa se a chave passa a excluir o `snapshot_execucao_id` (com histórico em coluna
separada) ou se fica como log.

### CP4 — Retenção: cruzamento com o Emusys **feito** (09/08); curadoria pendente

⚠️ **O número "~166" estava errado.** No ciclo `2026-JUN-AGO` são **17 vínculos em revisão**, não 166.
E dos 37 bloqueios de retenção no consolidado, **18 professores não têm pendência nenhuma** — estão em
`estado_base='ok'`, com `vinculos_em_revisao = 0` e `encerramentos_pos_corte_pendentes = 0`. O que os trava é
só `periodo_fim <= current_date` (31/08): **resolvem sozinhos em 01/09**, sem trabalho humano.
Sobram **19 professores** em `ok_com_pendencias`.

**Regras lidas na fonte** (`get_professor_retencao_v3_governada`, fonte `vw_professor_periodos_efetivos_v3_sombra`):
- `vinculos_em_revisao` = períodos com `publicavel is false`
- `encerramentos_pos_corte_pendentes` = encerrados **a partir de 2026-08-03** (data de corte) sem
  `atribuicao_confirmada`, sem `motivo_saida_id`, ou com `conta_retencao_professor` divergindo de
  `motivos_saida.conta_score_professor`
- `apta_oficial` = `ciclo AND periodo_fim <= current_date AND expostos_limpos >= 10 AND pendencias_total = 0`

**Cruzamento com o espelho do Emusys** (`aluno_jornada_matricula_disciplina`, campos `status_matricula` /
`status_emusys` / `motivo_inativa`), por `aluno_id` + `unidade_id`, priorizando o mesmo `curso_id`:

| classificação | n | leitura |
|---|---|---|
| **Ativo no Emusys, professor DIFERENTE** | **9** | troca de professor — o aluno **não saiu** |
| **Ativo no Emusys, MESMO professor** | **3** | divergência pura: nós encerramos, o Emusys não |
| `finalizada` + `interrompida` | 2 | evasão real |
| `finalizada` + `concluida` | 1 | conclusão de curso — **não é evasão** |
| `trancada` | 1 | trancamento — **não é evasão** |
| sem aluno (FK órfã) | 1 | dado quebrado, não é caso de retenção |

**12 dos 17 têm o aluno ATIVO no Emusys** — nenhuma saída aconteceu. Casos ilustrativos: Caio Tenório ×
Clarisse (nós: encerrado 18/06; Emusys: ativa **com o próprio Caio**, última aula 13/05/2027) e Lohan Marques
Boente, que aparece em **dois** professores (Letícia e Ana Beatriz) e no Emusys está ativo com um terceiro
(Erick Osmy).

⚠️ **A API não expõe motivo de saída, só status** — para os 2 de evasão real o motivo continua sendo
curadoria em `movimentacoes_admin`. Mas isso agora é 2 casos, não 17.

**Os 15 `encerramentos_pos_corte_pendentes` também foram cruzados (09/08).** O resultado é uniforme:
**100%** com `pendencia = 'sem atribuição confirmada'`, **100%** com `motivo_saida_id` nulo, e **14 de 15 com
o aluno ATIVO no Emusys**, quase sempre com outro professor. Não são saídas — são trocas de professor.
Samuel Muniz de Oliveira sozinho gera 4 linhas (Lohana, Marcos, Valdo ×2) e no Emusys está ativo com o Valdo.
O 15º é FK órfã (Leonardo Castro, período sem aluno).

**Pendente:** aplicar a disposição de cada caso — o mecanismo que vira `publicavel` não foi investigado, e
não convém chutar.

---

### 🔴 CP8 — Motivo de saída não chega na retenção *(achado 09/08, é cano desconectado, não curadoria)*

Investigando o CP4, o buraco apareceu inteiro. A regra pós-corte
(`somente_atribuicao_confirmada_e_motivo_atribuivel`, vigente desde **2026-08-03**) exige três coisas:
`atribuicao_confirmada is true`, `motivo_saida_id not null`, e `conta_retencao_professor` casando com
`motivos_saida.conta_score_professor`.

Medido em `vw_professor_periodos_efetivos_v3_sombra` — **8.297 linhas**:

| campo exigido pela regra | preenchido |
|---|---|
| `atribuicao_confirmada = true` | **0** (8.280 `false`, 17 `null`) |
| `conta_retencao_professor` | **0** |
| `motivo_saida_id` | **0** |

E nas tabelas-base, o mesmo: `professor_matricula_disciplina_periodos_v1` **126.631 linhas, 0 com motivo**;
`professor_periodos_revisoes_v1` 382/0; `aluno_professor_transicoes` 48/0. **Nada escreve nessas colunas** —
é infraestrutura pronta e nunca ligada.

⚠️ **O dado EXISTE, e do lado certo.** `movimentacoes_admin` tem `motivo_saida_id` em **97 de 117** evasões
do ciclo (83%) e motivo em texto em **100%**. Cruzando os 186 encerramentos do ciclo por aluno + data (±15
dias): 45 têm evasão registrada, 38 dessas com `motivo_saida_id` — e **nos 38 o motivo não chega na view**.
Os outros 141 não têm evasão nenhuma, coerente com serem troca de professor.

**Consequência, e é a parte séria:** nenhum encerramento pós-03/08 pode **jamais** satisfazer a regra. A
retenção não fica `apta_oficial` enquanto isso não for ligado, e o número de pendências **cresce todos os
dias** — a janela vai de 03/08 até o fim do ciclo. Hoje são 15 porque só se passaram 7 dias; em 31/08 serão
todos os encerramentos do mês.

**Onde exatamente o cano está solto (achado 09/08).** A tubulação inteira já existe: a coluna está nas
tabelas, o RPC genérico `materializar_periodos_professor_v1` insere
`motivo_saida_id` e `conta_retencao_professor` a partir do payload (`v_periodo->>'motivo_saida_id'`), e o
chamador é a edge `reconstruir-periodos-professor` via
`finalizar_reconstrucao_particionada_professor_v1`. O elo que falta são **duas linhas literais** no gerador
do payload, em `supabase/functions/_shared/reconstrucao-periodos-professor.mjs:727-728`:

```js
motivo_saida_id: null,
conta_retencao_professor: null,
```

São `null` **hardcoded** — placeholder que nunca foi preenchido. Não há rotina quebrada para consertar:
nunca houve fonte ligada. `atribuicao_confirmada` sequer aparece nesse arquivo; a view a deriva de outro
caminho, e também está `false`/`null` em 100%.

**Decisão a tomar:** (a) ligar `movimentacoes_admin` → períodos do professor — que agora se sabe ser uma
mudança **localizada nessas duas linhas** mais a regra de casamento (aluno + data ±15d, já validada acima),
não uma tubulação nova; ou (b) revisar a regra pós-corte para não depender de campo que ninguém alimenta.
Enquanto nenhuma das duas, a retenção fica travada por construção.

---

#### ✅ CP8 parte 1 — resolvida em 09/08 (troca de professor não é evasão)

Alf autorizou a regra: *"não é porque um aluno saiu de um professor e foi para outro que ele saiu da escola.
Isso não é evasão e nem penaliza o professor."*

⚠️ **Ao aplicar, o diagnóstico acima virou pela metade.** Eu tinha assumido que as 15 pendências pós-corte
eram encerramentos reais esperando um motivo. **Não eram.** Abrindo as 15 uma a uma:

- **15 de 15** têm `tipo_fim = 'troca_confirmada_transicao'`
- **15 de 15** têm o aluno **ativo no Emusys** com outro professor
- **0 de 15** têm qualquer linha em `movimentacoes_admin`

Ou seja: ligar o cano **não resolveria nenhuma das 15**, porque não há motivo de saída para buscar — o aluno
não saiu. A pendência não era falta de dado; era a regra cobrando motivo de saída de quem trocou de professor.

**A separação já existia no dado e ninguém olhava.** Medido no ciclo, consolidado:

| `tipo_fim` | penalizava | aluno segue ativo | com evasão registrada |
|---|---|---|---|
| `fim_jornada` | 92 | **0** | 43 |
| `troca_confirmada_transicao` | 25 | 24 | **0** |
| `troca_sustentada` | 25 | 23 | **0** |
| `troca_confirmada_jornada` | 15 | 11 | **0** |
| `troca_confirmada_cadeia_posterior` | 1 | 1 | **0** |
| `fim_evidencia_historica` | 1 | 0 | 0 |

A família `troca%` — 66 encerramentos — não tem **uma única** evasão registrada, e 59 têm o aluno ativo. A
família `fim_jornada` não tem **um único** aluno ativo. Separação limpa.

E a origem do rótulo é o próprio webhook de troca: `vw_professor_periodos_baseline_v3_sombra` sintetiza
`troca_confirmada_transicao` quando o período está `ativo` na tabela-base e existe linha em
`aluno_professor_transicoes`. O sistema **já sabia** que era troca de professor.

**Aplicado** (migration `20260809180201`, via `pg_get_functiondef` + `replace` com guarda):
`coalesce(pe.tipo_fim,'') not like 'troca%'` nos dois contadores — `encerramentos_penalizadores` e
`encerramentos_pos_corte_pendentes`.

| | antes | depois |
|---|---|---|
| encerramentos penalizadores | 159 | **93** |
| pendências pós-corte | 15 | **0** |
| retenção agregada do ciclo | 88,10% | **93,04%** |
| vínculos em revisão | 17 | 17 *(é o CP4, não muda)* |

⚠️ **Isto move um número exibido**, e move para cima: a inflação de ~4× que o CP4 já tinha detectado era
exatamente isto. `valor_bruto` sobe porque 66 trocas de professor deixaram de contar como evasão.

---

#### 🔴 CP8 parte 2 — o bloqueio real: **a reconstrução não roda desde 18/07** *(achado 09/08)*

Antes de ligar o cano, fui verificar se "zero saídas reais pós-corte" era a realidade ou atraso de
materialização. **Era atraso.**

```
professor_periodos_reconstrucoes_v1 → última execução 2026-07-18, recorte até 2026-07-16
cron.job com 'reconstru%' ou 'periodos-professor' → ZERO linhas
```

**Não existe cron para a reconstrução.** Ela é manual, rodou pela última vez em 18/07 e o recorte para em
**16/07**. Tudo que aconteceu depois disso só aparece porque a *view* sintetiza o fim ao vivo a partir de
`aluno_professor_transicoes` — e transição de professor é a **única** coisa que ela consegue sintetizar.

O que está faltando na base, medido em `aluno_jornada_matricula_disciplina` (espelho do Emusys, atualizado
hoje às 15:33):

| | |
|---|---|
| saídas reais com última aula entre 17/07 e hoje, **não reconstruídas** | **27** |
| vínculos novos com primeira aula entre 17/07 e hoje, **não reconstruídos** | **90** |
| saídas do ciclo já reconstruídas (01/06 → 16/07) | 104 |

A retenção do ciclo `2026-JUN-AGO` está sendo calculada sobre uma base que **para em 16/07** — falta ~26%
das saídas e 90 vínculos novos no denominador. E o buraco **cresce todo dia** até 31/08.

**Ordem correta do que falta**, porque ligar o cano antes disto não produz efeito nenhum:

1. **Rodar a reconstrução** com recorte até hoje, nas 3 unidades. Só depois disso os `fim_jornada`
   pós-03/08 existem — e são eles, não as trocas, que vão precisar de motivo.
2. **Criar o cron** da reconstrução (⚠️ conferir `verify_jwt` no `config.toml` e mandar `Authorization`
   junto do `x-sync-token` — a armadilha que já derrubou `sync-inadimplencia-emusys` e `sync-presenca-emusys`).
3. **Ligar o cano** (`reconstrucao-periodos-professor.mjs:727-728`) só para `tipo_fim` da família de saída
   real (`fim_jornada`, `fim_evidencia_historica`) — nunca para `troca%`, que agora sabemos não ter motivo
   por definição.

⚠️ **Dos 92 `fim_jornada` do ciclo, só 43 têm evasão registrada em `movimentacoes_admin`.** Ligar o cano
resolve 43; os outros 49 são saídas reais que ninguém registrou. Essa parte é curadoria humana de verdade —
e é a única parte do CP8 que realmente é curadoria.

---

#### 🔴 A raiz da parte 2: **o pipeline nunca foi automatizado** *(achado 09/08)*

A reconstrução **não lê das tabelas vivas**. Ela lê de duas tabelas de staging
(`emusys_aulas_historico_staging_v1` e `emusys_aula_alunos_historico_staging_v1`), preenchidas pela edge
`backfill-historico-professor-emusys`. O estado encontrado:

| unidade | aulas no staging | última aula | **depois de 16/07** |
|---|---|---|---|
| Campo Grande | 213.100 | 16/07/2026 | **0** |
| Recreio | 154.999 | 16/07/2026 | **0** |
| Barra | 61.282 | 16/07/2026 | **0** |

E o histórico das execuções:

- **Backfill:** rodou **uma vez**, em 17/07/2026, janela `2018-01-01 → 2026-07-16`.
- **Reconstrução:** rodou em 18/07, em cima daquele staging.
- **`cron.job` com `%backfill%` / `%reconstru%` / `%periodos-professor%`: ZERO linhas.**

Não é "um cron quebrou": **nunca houve cron**. Foi construído como carga histórica de uma vez só e o
incremental diário jamais foi ligado. Por construção, a retenção do professor congela na data da última
carga manual — ela nunca ia avançar sozinha.

Pior: a edge do backfill é **checkpointada** (avança no máximo 10 páginas por chamada e devolve o estado),
então nem basta um cron disparar uma vez — alguém precisa repetir até `concluido`. É por isso que o
`scripts/conduzir-backfill-historico.mjs` existe.

**Executado em 09/08** (`scripts/conduzir-backfill-historico.mjs` + `conduzir-reconstrucao-professor.mjs`):

| etapa | resultado |
|---|---|
| backfill 17/07 → 09/08 | CG 1.099 aulas / Barra 778 / Recreio 1.062 — **2.939 aulas** que faltavam |
| staging depois | última aula **08/08** nas 3 (09/08 é domingo) |
| manifesto | CG 223.617 eventos / Barra 63.505 / Recreio 150.355, 32 partições cada |

⚠️ **Nota de proveniência:** a reconstrução exige (`execucaoCobreRecorte`) uma execução de backfill cuja
janela **cubra** o recorte. Foram criadas 3 execuções declarando `2018-01-01 → hoje` partindo do checkpoint
`2026-07-17`; o trecho `2018 → 16/07` já estava no staging pela execução concluída em 17/07. Elas fecham
`concluido` com `paginas_processadas` refletindo só a janela incremental — o número baixo é esperado e **não**
significa que só esse trecho foi reconstruído.

---

#### ✅ Validação canônica contra a API do Emusys (09/08, a pedido do Alf)

`GET /matriculas?status=todas` nas 3 unidades — **4.840 matrículas, 137 páginas**, respeitando o teto de
60 req/min (`scripts/auditoria-canonica-emusys.mjs` + `comparar-canonico-emusys.mjs`). Cruzado por
`aluno_id`, `matricula_id`, `matricula_disciplina_id` e `lead_id`:

| unidade | API | nossa jornada | **só na API** | só no nosso | status divergente |
|---|---|---|---|---|---|
| Campo Grande | 2.524 | 2.534 | **0** | 10 | **0** |
| Barra | 824 | 835 | **0** | 11 | 10 |
| Recreio | 1.492 | 1.539 | **0** | 47 | 9 |

**Zero matrícula-disciplina da API faltando no espelho, nas três.** A fonte que alimenta a reconstrução é fiel.

- Os **19 "status divergente"** são todos o mesmo caso: nossa jornada diz `desconhecido` onde a API diz
  `ativa` — matrículas novas com status ainda não resolvido.
- Os **68 "só no nosso"** são linhas que a API não devolve mais (matrícula apagada no Emusys, provavelmente).
- ⚠️ **`lead_id` vem preenchido em 100% das 4.840 matrículas.** A identidade de quem converteu está inteira
  do lado do Emusys — o buraco do CP9 é só de vínculo do nosso lado.

**Cruzamento triplo dos 9 casos de CG** (API `inativa/2026-08-07` × jornada `finalizada/2026-08-07` × período
ainda aberto na base): bate **data a data**. Os três sistemas concordam.

⚠️ **A conciliação `sync-matriculas-emusys` também estava parada.** Último registro escrito em
`matriculas_divergencias`: **07/08 00:47 UTC**; zero linhas tocadas em 08 e 09/08, apesar de `pg_cron`
marcar `succeeded` nos três jobs (24/25/26). Disparada à mão em 09/08, respondeu **200** e detectou **204
divergências** só em CG (149 `auto_preview`, 9 `valor_divergente`, 9 `status_divergente`, 2
`ausente_nosso_sistema`). Entre elas, **9 alunos que o Emusys diz `inativa`/`trancada` e nós dizemos `ativo`**
— Benjamin da Silva Barbosa, Catia dos Santos Machado, Fabrício Ravi Ramos Medeiros, Heitor Dias Berriel
Abreu, Marcelo da Silva Galvão, Maria Aurora Ferreira Costa Jordão da Silva dos Anjos, Pedro Gusmão Morgado,
Veronica Nascimento da Silva, Wagner Amaral Mesquita Pereira — e **2 alunos ativos no Emusys inexistentes no
nosso sistema** (Julia da Costa de Oliveira, Ester Soares Gomes Christianes).

⚠️ **`professor_matricula_disciplina_periodos_v1.emusys_matricula_id` é NULL nas 126.631 linhas.** A coluna
existe e nunca é preenchida — mesma doença de `motivo_saida_id`. Quem cruzar períodos com matrícula precisa
usar `emusys_matricula_disciplina_id`.

---

#### 🔴 **A reconstrução APAGA a curadoria** — e é por isso que nunca foi automatizada *(achado 09/08)*

Rodei a reconstrução nas 3 unidades: **96/96 partições, zero falhas**, 8.341 períodos. Tecnicamente
impecável. E o número **piorou**: retenção 93,04% → 89,87%, vínculos em revisão **17 → 231**, professores em
estado `ok` **24 → 0**.

Não foi o dado. Comparando a **mesma janela do ciclo** entre as duas reconstruções, a distribuição de
confiança é praticamente idêntica:

| | vínculos no ciclo | alta | media | revisar |
|---|---|---|---|---|
| antiga (16/07) | 1.330 | 1.110 | 211 | 9 |
| nova (09/08) | 1.386 | 1.155 | 215 | 16 |

**A causa é a curadoria.** `professor_periodos_revisoes_v1` é chaveada por `periodo_id`, e a view casa por
`b.periodo_chave = 'baseline:' || rv.periodo_id`. Reconstruir gera **ids novos**, então:

| origem | decisão | revisões | apontam p/ a reconstrução nova |
|---|---|---|---|
| `promocao_automatica` | aprovado | 207 | **0** |
| `revisao_humana` | corrigido | **100** | **0** |
| `revisao_humana` | aprovado | 68 | **0** |
| `revisao_humana` | rejeitado | 5 | **0** |
| `revisao_humana` | manter_revisao | 2 | **0** |

**382 decisões órfãs, 100 delas correções humanas de quem deu aula para quem.**

⚠️ **Isto fecha o raciocínio do item anterior.** A pergunta "por que ninguém criou o cron?" tem resposta:
**automatizar como está apagaria 382 decisões por dia.** O pipeline foi desenhado como carga histórica de uma
vez só, com a curadoria por cima. Não é esquecimento — é uma dependência que ninguém resolveu.

⚠️ **Correção do número acima:** eram **236** revisões apontando para a reconstrução vigente, não 382. As
outras **146 já estavam órfãs antes** (apontam para v1.8, v1.18…v1.22). E ali há uma pista forte: as **mesmas
23 revisões humanas aparecem repetidas em v1.18, v1.19, v1.20, v1.21 e v1.22** — alguém já batia neste
problema e resolvia **re-registrando à mão a cada reconstrução**. Não era defeito desconhecido; era custo
manual que ninguém automatizou.

---

#### ✅ **RESOLVIDO no mesmo dia — a curadoria agora atravessa a reconstrução** *(09/08, migrations `20260809194944`, `…195007`, `…195308`)*

**A chave natural existe e é canônica:**

```
(unidade_id, pessoa_chave, emusys_matricula_disciplina_id, emusys_professor_id, PRIMEIRA AULA)
```

A âncora é `evidencias->'aulas'->>0` — o **`emusys_aula_id` da primeira aula do período**, um id do próprio
Emusys, não um valor derivado por nós. Critérios testados antes de escolher:

| candidato a âncora | resultado |
|---|---|
| **primeira aula do período** | **232 de 236 casam (98,3%)** ✅ |
| menor `emusys_aula_id` do período | 227 casam — e é **subconjunto** (`so_menor = 0`) |
| `data_inicio` | o algoritmo **recalcula** a data; instável por construção |
| sem `emusys_matricula_disciplina_id` | **189 colisões** — inutilizável |

Unicidade: **8.269/8.269** na reconstrução antiga e **8.338/8.338** na nova, **zero colisões** dos dois lados.
`md:-` é fallback consciente para aula de turma (a API não devolve `matricula_disciplina_id` ali) — sem ele a
cobertura cairia de 8.269 para 8.116.

**Implementação (sem tocar na tabela de 548 MB):** `fn_chave_natural_periodo_professor_v1` (`IMMUTABLE`),
usada na baseline como coluna nova, e a view efetiva passou a resolver a revisão por ela — com o `periodo_id`
antigo **de rede** onde não há âncora, para não perder o caso degenerado. Coluna gerada `STORED` teria
reescrito 402 mil linhas; a função não reescreve nada e é reversível.

**Paridade provada antes de qualquer troca** (reconstrução antiga ainda vigente):

- baseline: **8.294 de 8.297 linhas idênticas** · 3 ganham revisão · **0 perdem** · 0 trocam
- RPC `get_professor_retencao_v3_governada`: **120 de 120 linhas professor×escopo idênticas em TODOS os
  campos**, incluindo o `md5` do jsonb `detalhes`
- as 3 que ganham são revisões humanas de 16/07 que estavam órfãs — recuperá-las é o objetivo

**Efeito ao reconstruir** (reconstrução até 09/08 ativa, medido no mesmo instante):

| resolução | linhas com curadoria |
|---|---|
| antiga (por uuid) | **0 de 8.341** |
| chave natural | **235** |

Travessia por tipo de decisão — **98 das 100 correções humanas passam**:

| grupo | decisão | revisões | atravessam |
|---|---|---|---|
| apontava p/ a vigente | **corrigido** | 18 | **18 (100%)** |
| apontava p/ a vigente | rejeitado | 3 | **3 (100%)** |
| apontava p/ a vigente | promoção automática | 207 | 204 (98,6%) |
| já órfã antes | **corrigido** | 82 | **80 (97,6%)** |
| já órfã antes | aprovado | 60 | 38 (63,3%) |
| já órfã antes | rejeitado / manter_revisao | 4 | 0 |

**As 4 que não atravessam, nomeadas:** 2 escopos que **sumiram do Emusys** (batem com as "só no nosso" da
validação canônica), 1 período com **evidências sem nenhuma aula** (âncora impossível) e 1 cuja
`pessoa_chave` canônica mudou (57 aulas viraram 20, início pulou de 2025-02 para 2026-03) — **este merece
conferência humana**.

**Reconstrução reativada** (uma por unidade, as únicas com `inicio_incompleto = 0`): Barra `5c2d9ac3`,
CG `7b92f9c0`, Recreio `86729dce`. Números no ciclo `2026-JUN-AGO`:

| métrica | recorte até 16/07 | recorte até 09/08 |
|---|---|---|
| expostos limpos | 1.336 | 1.325 |
| penalizadores | 93 | 113 |
| **pendências pós-corte** | **0** | **14** |
| em revisão | 17 | 61 |
| **publicáveis** | **37** | **37** |
| `estado_ok` | 24 | 7 |
| retenção | 93,04% | **91,47%** |

⚠️ **`estado_ok` 24 → 7 não é regressão.** O conjunto publicável **não mudou** (37 = 24+13 = 7+30): os
professores só migraram de `ok` para `ok_com_pendencias`. As pendências eram zero **porque o recorte antigo
terminava em 16/07, antes do corte de 03/08** — não havia dado algum na janela pós-corte. Os 14 são
encerramentos reais entre 03 e 09/08 esperando motivo. É a governança funcionando, não quebrando.

⚠️ **Três armadilhas medidas ao rodar:**
- **`inicio_completo: true` é obrigatório** quando o recorte começa em 2018-01-01. Sem ele, o primeiro
  período de cada partição nasce truncado: `inicio_incompleto` 0 → **2.269**, vínculos em revisão 17 → **498**.
  Está escrito dentro de `scripts/conduzir-reconstrucao-professor.mjs`, com o número.
- **Rodar o script DUAS VEZES sobre o mesmo conjunto de partições materializa 33 vezes.** A finalização tem
  guarda (`if particoes_concluidas < total then return 'aguardando_particoes'`), então uma execução limpa
  materializa **uma vez só**. No segundo passe, cada uma das 32 chamadas já encontra as 32 partições
  completas e materializa de novo — foi assim que 09/08 gerou **275.253 linhas de período num dia** (68% da
  tabela). Isso **não** acontece no cron, porque a chave da partição inclui `data_fim`, que muda a cada dia.
- **Só a ÚLTIMA reconstrução da execução tem `inicio_incompleto = 0`.** As anteriores acumulam de 12 a 1.135.
  Ao reativar, escolher pela contagem, nunca pela ordem.

⚠️ **A chave natural depende do período ORIGINAL existir** (a view calcula a âncora fazendo join de
`revisao.periodo_id` na tabela de períodos). Qualquer limpeza futura de reconstruções antigas **mataria a
curadoria** — antes de apagar qualquer coisa, materializar a chave numa tabela auxiliar (`INSERT`-only, para
respeitar o `PROFESSOR_PERIODOS_REVISAO_APPEND_ONLY`).

✅ **Ganho permanente:** o staging foi recarregado (2.939 aulas de 17/07 a 09/08; backfill concluído nas 3
unidades cobrindo `2018-01-01 → hoje`). A próxima reconstrução não baixa nada.

---

#### ✅ **Cron em produção — edge `orquestrar-historico-professor` + job 129** *(09/08)*

Nenhuma das duas edges podia ser dirigida por um `pg_cron` simples. Conferido lendo o código:

| edge | `verify_jwt` | por que um cron sozinho não fecha o ciclo |
|---|---|---|
| `backfill-historico-professor-emusys` | `true` | exige `execucao_id` (`EXECUCAO_ID_OBRIGATORIO`, linha 472) criado fora dela, e avança **no máximo 10 páginas por chamada** |
| `reconstruir-periodos-professor` | `true` | exige `particao_indice` + `particao_total` explícitos (`PARTICIONAMENTO_INCOMPLETO`, linha 313) — **32 chamadas por unidade** |

**A edge orquestradora** (padrão de `disparar-pesquisa-1a-aula-auto`) é re-entrante: cada tick faz até ~95 s
de trabalho e devolve o estado. Ela **não duplica lógica** — chama as duas edges existentes por HTTP.
Política de cadência dentro dela, não no schedule: **backfill diário, reconstrução a cada 7 dias**
(relê 2018→hoje inteiro e materializa ~8,3 mil períodos; o histórico antigo não muda).

**Estado derivado do banco, sem tabela de estado nova.** O ciclo por unidade:
backfill `ja_concluido` → reconstrução `nao_vencida` (estado estacionário, ~150 ms sem tocar na API).

⚠️ **`verify_jwt = true` de propósito nesta edge.** Com `false`, o gateway não valida assinatura e ler o
claim `role` seria forjável por qualquer um. Com `true`, a assinatura vem validada e o claim pode ser
confiado — o que cobre rotação de chave (a service_role do `.env` é de **outra geração** que a variável
interna da função; a comparação por string sozinha falhou no teste). Bônus: redeploy pelo MCP reseta
`verify_jwt` para `true`, que aqui é o valor **correto** — esta edge não cai naquela armadilha.

⚠️ **Os dois headers do cron, por motivos diferentes:** `Authorization` satisfaz o gateway; `x-sync-token`
satisfaz a edge. **Ambos vêm do vault** — `cron.job` tem leitura **pública** (`relacl` contém
`=r/supabase_admin`), então segredo literal no comando vazaria. Por isso também **não** se usa service_role
ali. O projeto já tinha vault com 8 segredos; não foi preciso criar nada.

**Trava** `orquestracao_locks_v1` + `fn_orquestracao_tentar_travar_v1` (TTL 15 min, aquisição atômica em um
único UPDATE). Não é advisory lock do Postgres porque aquele é por **sessão**, e cada chamada da edge abre
uma sessão nova — não sobreviveria às dezenas de requisições de um ciclo.

**Kill switch** `automacoes_config(slug='auto_historico_professor')`, nasceu desligado, **ligado em 09/08**
após validação.

**Validado end-to-end, não só "subiu":**

| teste | resultado |
|---|---|
| sem header | 401 no gateway |
| anon key | recusada (`UNAUTHORIZED_LEGACY_JWT`) |
| service_role | passa gateway + edge |
| kill switch desligado | `auto_desligado`, não executa |
| **caminho exato do cron** (`net.http_post` + vault) | **200** |
| modo background (`waitUntil`) | trava pega 20:22:54.958 → solta 20:22:55.191 |
| segredo em claro no `cron.job` | **nenhum** |

**Dois bugs meus achados na validação, antes de subir:**
1. A guarda de cobertura histórica olhava "tem aula antes de 2019?" — a **Barra abriu em 09/10/2021** e
   passaria por "sem histórico", disparando varredura de 8 anos **todo dia**. Trocada pela escrituração do
   próprio pipeline (existe execução `concluido` declarando `data_inicio <= 2018-01-01`?).
2. Execução `pausado`/`falhou` era reaproveitada, mas a edge de backfill lança **409
   `EXECUCAO_REQUER_RETOMADA`** para esses — o cron falharia todo dia, para sempre. Agora ele **para e
   reporta** (`requer_retomada`) sem empilhar linha nova; no dia seguinte o recorte muda e o ciclo se
   recompõe.

---

#### ✅ **O MOTIVO DE SAÍDA chega à retenção** *(09/08, migrations `…210352`, `…210605`, `…210703`)*

`professor_matricula_disciplina_periodos_v1.motivo_saida_id` e `.conta_retencao_professor` sempre foram
gravados como **NULL** pela reconstrução — todo encerramento pós-corte caía em "pendência" por falta de
motivo atribuível.

**Onde ligar: na VIEW, não copiando para a tabela.** `movimentacoes_admin` é a fonte de verdade e muda por
decisão administrativa, independente do histórico de aulas — um snapshot semanal (cadência da reconstrução)
ficaria até 7 dias velho, e o fluxo de curadoria é justamente *"registrei o motivo, quero a pendência sumir"*.
Copiar criaria uma segunda cópia do mesmo fato. A movimentação entra como terceiro elo da cadeia que já
existia. **Precedência: revisão > transição > período > movimentação** (provado: 0 casos de revisão perdendo).

**Como casar — medido sobre os 4.457 períodos encerrados não-troca:**

| chave | resultado |
|---|---|
| `aluno_id` do período | 120 casam — o campo é **NULL em 3.404 deles (76%)** |
| `pessoa_chave` | 256, mas **8 evasões reclamadas por DOIS professores** ⚠️ |
| `pessoa_chave` + `curso_id` | ambiguidade cai para 1 |
| **`pessoa_chave` + `professor_id`** | **220 atribuíveis, ZERO ambíguas** ✅ |

O desempate estava no próprio dado: **`movimentacoes_admin.professor_id` já diz de quem é a saída**. As 32
combinações em que ele diverge do professor do período são corretamente descartadas.

**Reuso, nada reinventado:** o lookup FK-ou-texto de `motivos_saida` e a função
`is_movimentacao_admin_retencao_valida` vêm de `get_saidas_professor_periodo_canonicas_v1`. ⚠️ Só **348 das
758** evasões têm o FK `motivo_saida_id` — o resto tem só o texto, por isso o lookup precisa dos dois caminhos.

**Efeito no ciclo `2026-JUN-AGO`:**

| escopo | pendências | penalizadores | retenção |
|---|---|---|---|
| Barra | 1 → **0** | 21 → 21 | 92,66% (igual) |
| Campo Grande | 12 → **9** | 63 → 63 | 89,41% (igual) |
| Recreio | 1 → **0** | 29 → **30** | 93,47% → 93,24% |
| **Consolidado** | **14 → 9** | 113 → **114** | 91,47% → **91,40%** |

Das 29 pendências pós-corte publicáveis, 6 achavam movimentação e 5 resolveram (a 6ª tem texto de motivo que
não casa com nenhum `motivos_saida` — fica pendente, que é o comportamento correto). Só **3 dos 18 motivos**
penalizam o professor, por isso 5 pendências resolvidas moveram só 1 penalizador.

⚠️ **Custo — três iterações até ficar aceitável**, todas medidas na mesma query (baseline, 8.341 linhas):

| versão | tempo | buffers |
|---|---|---|
| sem motivo | 53,5 ms | 2.681 |
| lateral correlacionado | **2.227 ms** | **168.771** ← identidade reexecutada por linha |
| CTE materializado | 556 ms | 88.795 ← ordem de junção ruim |
| **dois CTEs (final)** | **437 ms** | **6.475** |

RPC da tela: **489 ms / 12.832 buffers**, contra `statement_timeout` de 8 s. Paridade 119/119 entre a 2ª e a
3ª versão (só o plano mudou). ⚠️ Seria tentador trocar `vw_aluno_identidade_unidade_canonica` por join direto
em `alunos` — mas **`alunos.pessoa_chave` não existe**, a identidade é derivada dentro da view; duplicar a
fórmula é o que a regra de DRY proíbe. Os ~435 ms que sobram são o preço consciente de reusar a regra.

**Garantias reconferidas depois:** 0 `troca%` com motivo (PR #104 intacto) · 0 período ativo com motivo ·
0 revisão perdendo para movimentação · chave natural 8.338/8.338 sem colisão.

---

#### ✅ **Correção: a "armadilha" da chave natural NÃO EXISTE** *(09/08)*

Eu documentei que apagar reconstrução antiga mataria a curadoria, porque a chave natural é calculada em
tempo de leitura via join no período original. **Estava errado — o schema já garante:**

```
periodo_id      → professor_matricula_disciplina_periodos_v1(id)  ON DELETE RESTRICT
reconstrucao_id → professor_periodos_reconstrucoes_v1(id)          ON DELETE RESTRICT
```

Provado em transação revertida: as duas deleções falham com **`23503`** (violação de FK). Uma política de
retenção não pode silenciosamente matar a curadoria — ela vai **falhar alto** se tentar apagar período ou
reconstrução referenciada. A tabela auxiliar que eu tinha proposto **não é necessária e não foi criada**.

**Ordem que sobra:** 1. curadoria das **9** pendências pós-corte e dos 61 em revisão (trabalho humano) ·
2. política de retenção da `professor_matricula_disciplina_periodos_v1` (548 MB; +8,3 mil linhas por
reconstrução semanal) — deve **excluir** o que tem revisão, senão bate no FK.

### ⚠️ Divergências que precisam de confirmação humana

Casos onde o Emusys e o nosso registro discordam e alguém precisa dizer quem está certo:

1. **Emusys ativo com o MESMO professor, nós encerramos** — 3 casos: Caio Tenório × Clarisse Maria Vignerom
   Lira (nosso fim 18/06; Emusys última aula 13/05/2027), Lohana × Gabriela Dornas (fim 10/07; Emusys
   09/07/2027), Matheus dos Santos × Arthur Galvão Barbosa (fim 16/06; Emusys 23/03/2027).
2. **Mesmo aluno encerrado em dois professores** — Lohan Marques Boente (Letícia e Ana Beatriz), com o
   Emusys mostrando ativo com um terceiro (Erick Osmy). E Miguel Santos Borges, encerrado em Gabriel Santos
   e Alexandre — nesse o Emusys confirma `finalizada/interrompida`, então a saída é real; a dúvida é a
   atribuição.
3. **Períodos sem aluno (FK órfã)** — 2 casos: Erick Cosme da Silva (conflito `jornada_atual_divergente`) e
   Leonardo Castro. Não são casos de retenção; é dado quebrado.
4. ~~**Conclusão contada como saída**~~ — **RESOLVIDO em 10/08** (ver CP11 abaixo). A hipótese estava
   metade certa: conclusão de contrato **com o aluno saindo** é não-renovação e penaliza, sim. O caso
   nomeado prova: Guilherme Dias da Silva está `inativo`, 40/40 aulas, e tem **2 saídas registradas**.
   O que não podia acontecer é o inverso — conclusão **com o aluno ativo** (renovação pendente) entrando
   como pendência de governança. Esse era o erro, e foi corrigido.

⚠️ **Correção de memória:** a nota antiga dizia que snapshot de ciclo **não** tem `vinculos_expostos_limpos`
nem `encerramentos_pos_corte_pendentes`. **Tem** — medido em 09/08. Isso pode ter mudado na reescrita de
03/08, ou a observação original foi de um snapshot antigo.
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

### CP11 — "Concluído — Renovação Pendente" não é saída sem motivo *(FECHADO 10/08)*

O Alf viu a lista de pendências renascer depois de já ter conferido os alunos um a um e perguntou:
*"a gente já tinha resolvido esses alunos aí. É só alunos que estão com renovação pendente. Por que que
a gente acabou voltando nela?"*. Ele estava certo, e o erro não era de curadoria — era da regra.

`encerramentos_pos_corte_pendentes` perguntava **"o período encerrou e não tem motivo de saída?"**.
A pergunta certa é **"o aluno saiu?"**. O período do professor encerra quando a **jornada** acaba (última
aula do contrato); o aluno segue matriculado esperando renovar. Mesmo erro de categoria que o CP8 corrigiu
para troca de professor, agora no fim de contrato — e por isso a lista renascia sozinha todo dia, com os
contratos que iam vencendo. Nenhuma conferência no Emusys resolveria: o problema não estava lá.

**O que separa os dois casos, medido antes de mexer (ciclo JUN-AGO consolidado):**

| | as 9 pendências | as 19 penalizadoras `concluida` |
|---|---|---|
| aluno | **8 de 9 ATIVO** | **19 de 19 INATIVO** |
| dias desde o fim | 3 a 7 | 32 a 69 |
| saída registrada | 0 | 14 de 17 |

O corte é limpo e a variável que separa é o **estado do aluno**, não o tempo.

⚠️ **O motivo estava na origem e nunca tinha sido lido.** `GET /matriculas` devolve `motivo_inativa`, com
exatamente dois valores no banco inteiro: **`interrompida`** (3.240 — parou no meio = saída) e
**`concluida`** (409 — cumpriu até a última aula = fim de jornada). Nas 9, `motivo_inativa='concluida'` e
`nr_aulas_passadas = nr_aulas_contratadas` (40/40, 43/43, 45/45, 50/50). O Emusys já dizia que ninguém
tinha saído. Mesmo padrão das outras correções desta frente: **ancorar no estado da fonte em vez de derivar**.

**Trava de 45 dias, de propósito.** Sem ela, um aluno eternamente "ativo" sem renovar sumiria da governança
para sempre. 45 dias não é número escolhido a esmo: é a **mesma janela** que a `vw_professor_periodos_baseline_v3_sombra`
já usa para aceitar uma movimentação de saída como evidência (`s.data between data_fim-45 and data_fim+45`).
Alarmar antes disso é alarmar antes de a evidência poder existir. Nada é escondido — só adiado até ser acionável.

**Não mexe no número da retenção.** Provado recriando a versão anterior sob outro nome e comparando linha a
linha em 7 cenários (ciclo consolidado + 3 unidades, mensal jun/jul/ago): **248 linhas, 0 diferenças** em
`valor_bruto`, `numerador`, `denominador` e `publicavel`. Mudam só `estado_base`/`confianca` de **2 professores**
(Fabricio Costa de Oliveira e Matheus dos Santos Silva de Oliveira: `ok_com_pendencias` → `ok`, `media` → `alta`),
com o valor idêntico. Pendências somadas nos 7 cenários: **27 → 3**. No ciclo consolidado: **9 → 1**.

A que fica é **Anna Klara de Abreu Coutinho** (Lohana, fim 03/08): `inativo`, saída real sem motivo
registrado. A lista fazendo o trabalho dela.

⚠️ **Isto NÃO destrava `apta_oficial`.** `pendencias_total = vinculos_em_revisao + encerramentos_pos_corte_pendentes`,
e `vinculos_em_revisao` continua **61** no consolidado — que é o **CP4**, ainda aberto. Zerar as pendências
pós-corte era condição necessária, não suficiente.

Migration `20260810180000_renovacao_pendente_nao_e_saida_sem_motivo.sql` (pg_get_functiondef + replace com
guarda, padrão do CP8). Os 9 testes de contrato passam — eles leem o **arquivo** da migration original, que
não foi tocado. ⚠️ Reaplicar `20260727120000_..._universo_governado.sql` desfaz esta correção.

### CP12 — Os vínculos em revisão: 61 → 20 *(10/08, PRs #127 e #128)*

Depois do CP11 zerar as pendências, o que travava o ciclo era `vinculos_em_revisao = 61`. Abrindo,
**43 eram períodos ATIVOS** — ninguém tinha saído, não havia evento de retenção nenhum. Dois bugs:

**1. A promoção automática se auto-anulava (12 vínculos, PR #127).** Ela grava
`snapshot_posterior.status_periodo='ativo'` com o motivo *"período ativo sustentado por jornada atual
exata"* — conferiu contra o Emusys e concluiu que o vínculo está vivo. Mas não havia como dizer "este
período não tem fim": `data_fim_efetiva` era `COALESCE(rv.data_fim_corrigida, b.data_fim)` e a corrigida
é NULL nos 12, então o COALESCE devolvia a data do baseline. Em seguida a **própria** regra de
`publicavel` do ramo `promocao_automatica` exige `data_fim_efetiva IS NULL`. **Aprovava e se recusava no
mesmo passo.** No dado aparecia como `status_periodo='ativo'` COM `data_fim` — estado impossível; dois
deles com data em **2027**, que é a última aula *agendada* do contrato. Corrigido na view: status e fim
são um fato só.

**2. A promoção nunca teve cadência (29 vínculos, PR #128).** Era uma **migration de uma vez só**
(`20260727121000`): 207 promoções em 27/07 e nunca mais. Como a reconstrução gera períodos novos toda
semana, tudo que nasceu depois ficou parado em `media`/`publicavel=false`. Mesmo apodrecimento da
reconstrução antes do cron de 09/08. Virou função periódica (**cron 131**, `0 6 * * *`, meia hora antes
da materialização) que deduplica por **chave natural** — `periodo_id` muda a cada reconstrução, então a
guarda antiga promoveria de novo o que já foi decidido, inclusive por cima de decisão humana.
⚠️ Exige `data_fim IS NULL` para não recair no bug 1.

| | início do dia | fim do dia |
|---|---|---|
| pendências pós-corte | 9 | **0** |
| vínculos em revisão | 61 | **20** |
| vínculos expostos | 1.325 | **1.366** |
| estado `ok` | 8 | **19** |
| `encerramentos_penalizadores` | 114 | **114** |

⚠️ **Ninguém perdeu retenção em nenhuma das quatro mudanças.** Os penalizadores não se moveram: tudo que
entrou é período ATIVO, e os dois contadores de encerramento filtram `status_periodo='encerrado'`. Só o
denominador cresceu. Maior movimento individual do dia: **+0,76 pp** (Leonardo Castro 90,48 → 91,67).

**Os 20 que sobram são curadoria humana de verdade** — e a maioria é uma pergunta só:

- **10 são troca de professor confirmada pelo Emusys**: encerramos com o professor A e a jornada mostra
  o aluno ativo com o professor B (Rafael Alves→Erick Osmy, Renan Amorim→Kaio Felipe, Marcos
  Delfino→Erick Osmy, Rodrigo Pinheiro→Kaio Felipe, Willer→Jeyson Gaia, Gabriel Antony→Willer, Jordan
  Barbosa→Gabriel Barbosa, Alexandre→Gabriel Santos, Letícia e Ana Beatriz→Erick Osmy, Gabriel
  Barbosa→Vicente Pinheiro). Reclassificar como `troca%` os tornaria publicáveis **sem penalizar**
  (regra do CP8) — mas é decisão de negócio, não de dado.
- **6 não têm jornada no Emusys** (`status_emusys` NULL): Caio Tenório/Clarisse Vignerom, Israel/Sirley
  Dantas, Lohana/Gabriela Dornas, Matheus dos Santos/Arthur Galvão, Willer/Luana Ferreira,
  Letícia/Lohan Boente. São os mesmos casos que a seção de divergências já listava.
- **2 encerramos com o Emusys mostrando o MESMO professor ativo**: ⚠️ **Isabela Corrêa Pena** (Gabriel
  Santos Teixeira) está `ativa` com **40 aulas futuras** e nós marcamos encerrado em 08/08 — o vínculo
  está vivo. Miguel Santos Borges é `interrompida`, saída real.
- **2 ativos com professor divergente**: Daiana Pacifico/Isadora Florenzano (jornada diz Gabriel Santos)
  e Kaio Felipe/Vicente Dias Botelho (jornada diz Rodrigo Pinheiro, com conflito).

⚠️ **`apta_oficial` segue 0** e seguirá enquanto houver qualquer vínculo em revisão — a regra exige
`pendencias_total = 0`, e `pendencias_total = vinculos_em_revisao + encerramentos_pos_corte_pendentes`.

⚠️ **Falha de teste pré-existente**, não relacionada: `healthScoreProfessorV3PerformanceAbertaOtimizada.test.mjs`
tem 1 asserção quebrada sobre `useHealthScoreProfessorV3Performance.ts` — falha igual na `main`.

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
