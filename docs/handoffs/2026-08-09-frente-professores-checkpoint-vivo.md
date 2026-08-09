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

Todo o conteúdo está na `main` (`9d92d386`, `1fd1929e`). As branches `fix/turmas-v2-elimina-recalculo-duplicado`
e `docs/limite-otimizacao-professores` aparecem como "não mergeadas" apenas porque o merge foi **squash** —
o conteúdo está lá (conferido com `git ls-tree`). Podem ser deletadas.

---

## 2. Checkpoints abertos

### CP0 — Pausar ou não os crons 76/77/78
**Recomendação: não pausar.** As execuções que **falham** abortam a transação e não encerram nada; o dano de
29/07 veio de uma execução que **passou** com o catálogo vazio. Pausar adia o risco em vez de eliminá-lo, e o
custo (catálogo desatualizado) já está ocorrendo de fato no Recreio. Quem protege é a guarda do CP1.
Se quiser margem até lá: `select cron.unschedule(78);` (só CG, a unidade já ferida). Reversível.

### CP1 — Estabilizar a materialização de `professor_unidade_curso_modalidade` ⬅️ **PRÓXIMO**
Escopo real (maior do que o handoff supunha):
- **(a) Falha intermitente nas TRÊS unidades.** Medido em 09/08: Recreio falhando **4 dias seguidos**
  (06–09/08); Barra falhou 06 e 07; CG falhou 06. Erros: `PROFESSOR_CURSO_MODALIDADE_CHAVE_IMUTAVEL`
  (23514) e `PROFESSOR_CURSO_MODALIDADE_SOBREPOSICAO` (23P01).
- **(b) Falha silenciosa.** A execução do sync fica `status='completa'` mesmo com a materialização falhando.
  Mesmo padrão que já queimou `sync-inadimplencia-emusys` e `sync-presenca-emusys`.
- **(c) Falta guarda contra inativação em massa do catálogo** — a causa do desastre (seção 3).
  Precedente no projeto: `atualizar-inadimplencia-emusys` **aborta sem escrever** se a paginação da API vier
  incompleta. Copiar essa postura.

Alvos: `reconciliar_professor_curso_modalidade_v2` (8.058 chars, `SECURITY DEFINER`) e
`fn_professor_curso_modalidade_evidencias_v2`.

### CP2 — Reativar os 123 vínculos de Campo Grande *(bloqueado por CP1)*
Cruzar professor × curso × modalidade × **unidade** contra a jornada do Emusys. ⚠️ IDs do Emusys são
**namespaced por unidade** — nunca cruzar sem a unidade. Reativar antes do CP1 é remendo: a rotina desfaz.

### CP3 — Rematerializar o ciclo `2026-JUN-AGO` e reconferir `apta_oficial` *(bloqueado por CP2)*
Baseline a superar: **0 aptos** em 09/08.

### CP4 — Cruzar os ~166 vínculos em revisão da retenção com o Emusys *(independente)*
Retenção reprova por `pendencias_total > 0`. Cruzar para separar: aluno **ativo** (não houve saída → descartar
da penalização), **trancado**, **finalizado**. ⚠️ A API **não expõe motivo de saída**, só status — o motivo
continua sendo curadoria em `movimentacoes_admin`.

### CP5 — Agosto/consolidado com zero segmentos de `media_turma` *(independente, hipótese)*
43 snapshots e **0 segmentos**, contra 7.606 em julho/consolidado e 948 em agosto/unidade. Suspeita de
materialização emergencial incompleta — **não confirmado**, pode ser diferença de caminho de materialização.

### CP6 — Blindagem + housekeeping
Confirmar que o CP1 protege Barra e Recreio (elas escaparam em julho por **ordem de cron**, não por regra).
Deletar as duas branches órfãs já squashed.

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
