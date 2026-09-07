# Sol — Fatias 0, 1 e 2 · estado completo (07/09/2026)

> **Como ler:** este é o checkpoint vivo da reconstrução da Sol por **portas**.
> A Fatia 3 começa daqui. Tudo abaixo está **em produção e mergeado** salvo onde
> diz "pendente" ou "aberto".
>
> Antecedentes: [`2026-09-07-sol-tres-frentes-e-o-incidente-do-gateway.md`](2026-09-07-sol-tres-frentes-e-o-incidente-do-gateway.md),
> [`2026-09-07-benchmark-maria-para-a-sol.md`](2026-09-07-benchmark-maria-para-a-sol.md),
> [`2026-09-07-plano-sol-operacional-4-camadas.md`](2026-09-07-plano-sol-operacional-4-camadas.md).

---

## 1. Onde estamos, em uma frase

A Sol deixou de ler o banco por uma **porta larga de SQL livre** e passou a ler
por **13 portas nomeadas por trabalho**, com escopo resolvido no servidor pelo
telefone de quem fala, tudo registrado — e a pauta operacional (2º andar) só
mostra o que **ainda vale hoje**.

---

## 2. O que foi entregue

### Fatia 0 — cercar (PR #376)

| O quê | Onde |
|---|---|
| `SELECT` revogado em **360 tabelas cruas** de `sol_acesso_restrito` | `20260907120000` |
| Rollback de um comando só | tabela `sol_grants_revogados_fatia0` |
| `ALTER DEFAULT PRIVILEGES … REVOKE SELECT` | idem — tabela nova nasce fechada |
| 15 funções marcadas `STABLE`, 25 puladas por escreverem | `20260907130000` |
| Trilha de auditoria em `caixas_diarios` e `caixa_reaberturas_log` | idem |
| 3 papéis `NOLOGIN`: `sol_operacional` / `sol_tatico` / `sol_estrategico` | `20260907140000` |

⚠️ **O teste de "escreve?" é o CORPO da função**, não o nome:
`insert into|update \w|delete from|create temp|nextval|perform set_config`.
Guarda dura: nenhum escritor pode terminar `STABLE`.

### Fatia 1 — as portas (PRs #377, #378, #379, #381)

**`sol_resolver_escopo_v1(telefone, unidade?)`** — a única porta de entrada de
escopo:

- `diretoria` → `estrategico` (unidade pedida, ou REDE)
- `administrativo` + `lider` → `tatico` (só a dele)
- `administrativo` → `operacional` (só a dele)
- **sem unidade no cadastro → RECUSA** (2 dos 9 estão assim: Fabi e Jessyca)
- pediu outra unidade → `fora_do_escopo`

**As 13 portas** (`sol_porta_*_v1`), servidas pelo MCP
`vps/la-hq/sol/scripts/sol-portas-mcp.mjs`:

`caixa_do_dia` · `inadimplencia` · `faturas_do_mes` · `numeros_da_unidade` ·
`situacao_dos_alunos` · `presenca_pendente` · `pendencias_de_cadastro` ·
`aviso_previo` · `renovacoes` · `contratos_vencendo` · `alunos_sem_fatura` ·
`agenda_do_dia` · **`pauta_do_dia`**

Matriz do portão, provada ao vivo:

```
                      operacional(Barra)   tático(CG)        estratégico
caixa_do_dia          OK Barra             OK Campo Grande   caixa_e_por_unidade
numeros_da_unidade    acima_do_seu_papel   OK Campo Grande   OK Rede (3 unidades)
contratos("Recreio")  fora_do_escopo       fora_do_escopo    OK (pode escolher)
telefone fora do cadastro → solicitante_desconhecido
sem telefone nenhum       → sem_solicitante
```

### Fatia 2 — a pauta operacional (PRs #382, #383)

**`vw_radar_sinal_vigencia_v1`** — leitura canônica da pauta. Três estados:

| estado | significado |
|---|---|
| `vigente` | o detector **daquela regra** reemitiu na última rodada boa |
| `sanou` | o detector rodou e parou de reemitir — a condição deixou de valer |
| `sem_rodada` | o detector existe mas está atrasado → **alarme**, não lista vazia |

**272 abertos → 135 vigentes canônicos.**

---

## 3. As cinco lições que valem além desta frente

1. **Ferramenta disponível não vence instrução escrita.** Com as 12 portas no ar
   e visíveis, `automacao_log` registrou **zero** chamadas: ela ia pela porta
   larga porque `sol-bi-admin/SKILL.md:14` mandava usar "sempre que possível".
   Eram **três** instruções, e eu tratei duas na primeira passada.

2. **Escrita em helper compartilhado desliga chamador `STABLE` em silêncio.**
   PostgREST roda `STABLE` em transação READ ONLY: a auditoria que eu criei
   nasceu cega em **9 das 12** portas, e o `exception when others` comprou o
   silêncio perfeito.

3. **Para revalidar um alerta, não reescreva a regra — pergunte se o detector
   reemitiu.** Duplicar as 11 condições é a causa-raiz das duplicatas de
   renovação desta casa.

4. **"Não reemitiu" só é "sanou" com prova de que AQUELE detector rodou.** Cinco
   regras vinham de uma edge que eu não chamava e iam ser fechadas em silêncio.

5. **Guarda que não pode falhar é pior que guarda nenhuma.** `NULL <> 'x'` é
   NULL; e `now()` não anda dentro da transação. Uma prova minha passou
   imprimindo `<NULL>` sem levantar nada.

---

## 4. O ruído da conversa — resposta à pergunta do Luciano

**Ela enxerga o Chatwoot?** Sim. R7 ("ficaram de me retornar"), R8 ("pediu e
ninguém respondeu"), R2, R9, R10, R14 saem do espelho do Chatwoot via
`vw_atendimento_candidatos_sinal` (projeto SOL) → edge `extrair-sinais-conversa`.

**Tinha ruído?** Tinha, e medi: **5 de 30 vigentes (17%) já tinham sido
respondidos**, com 4 dias de operação. O sinal era uma fotografia do instante e
ninguém tirava a segunda.

**Corrigido** de graça: a foto que o extrator já busca *é* a segunda foto. Sair
dela tem três causas e só duas são boas:

1. o time respondeu → sanou ✅
2. a conversa foi **resolvida** no Chatwoot → sanou ✅ *(a lição da Daiana
   chegando de graça no lado aluno)*
3. passou de 14 dias sem ninguém responder → **NÃO** sanou ❌ — sumiria o
   cliente mais abandonado. Detectado pelo `ultima_msg_em` do próprio sinal.

**E um falso negativo no mesmo run:** conversa 20629 do Recreio virou sinal e o
insert morreu por `unidade_id` nulo — conversa lida, OpenAI paga, nada na pauta.
A unidade estava no nome do inbox; virou fallback (nunca preferência).

---

## 5. O que está aberto — ordenado por risco

### 🔴 Alto

**(a) O telefone é uma AFIRMAÇÃO do modelo.** Descoberto ao ligar: o processo
MCP recebe env **estático** (`mcp_tool.py:3027`, `_build_safe_env(user_env)`) e
há **um** conjunto de MCP por gateway, não um por conversa. Então o telefone
viaja no argumento e o modelo *pode* informar o de um colega.

- Mitigação hoje: toda chamada registrada em `automacao_log` (evento
  `sol_portas`), com telefone alegado, para quem resolveu, público e recusa.
- **Fix certo:** crachá opaco emitido pelo bridge (forma do `agentId` da Maria).
  Não foi feito porque o bridge é **read-only por desenho**
  (`BEGIN READ ONLY` em `runPsqlReadonly`) — dar escrita a ele é decisão sua.

**(b) Não há teto por pessoa ENTRE agentes.** A Sol limita 8 por turno, mas nada
impede a mesma ADM de receber Sol + TOM + Fábio no mesmo dia. O acúmulo que
gera "só recebo cobrança" é entre agentes, e ninguém mede isso.

**(c) A precisão do extrator LLM nunca foi medida contra julgamento humano.**
Sabe-se que a versão determinística dava 24%. Antes de ligar o 3º andar, vale
alguém olhar uma pauta real e dizer quantos itens mereciam a ligação.

### ⚠️ Médio

- **A porta larga (`sol-acesso-restrito__query`) continua ligada**, como
  fallback. O plano é ela definhar por desuso, medido em `automacao_log` contra
  `pg_stat_statements`. **Aposentar é decisão com número, não com fé.**
- **Fabi e Jessyca estão sem unidade no cadastro** → a porta recusa por desenho.
  Vai aparecer como "a Sol parou de me responder". Corrigir cadastro ou avisar.
- **R18 sem detector** (comercial, 2 sinais) → fail-open permanente até a edge
  de calor registrar rodada.
- **Inbox `Global` (Instagram) não tem unidade** → sinal de lá continua falhando
  com log. Não inventar unidade é o certo; o que não pode é a perda ser invisível.

### 📋 Herdados de antes (não tocados hoje)

- **V4 da Sol:** o flip espera sombra nova cobrindo aprovações. Terça 08/09 é o
  primeiro dia útil com o código corrigido em memória.
- **Rotacionar credenciais:** chave do OpenCode Zen e service_role/PAT da
  Superfolha (transitaram em chat).
- **`LucianoAlf/maria-backup` está PÚBLICO** apesar da alegação de "privado
  desde as 15h" — espelha `workspace/` e `bridges/` da VPS.
- `src/types/database.types.ts` está velho (editado cirurgicamente, nunca
  regenerado).

---

## 6. Fatia 3 — o 3º andar (próxima)

O que falta para a Sol deixar de só responder e passar a **falar**:

1. **Bloco no grupo da unidade** — a pauta como mensagem espontânea, nos
   horários dos `radar_destinatarios` (`horarios`, hoje `{09:00,16:00}`).
   Os 3 destinatários por unidade **já existem e estão ativos**; falta o
   disparo e o registro em `radar_entregas` (`radar_pauta_v1(p_registrar=true)`
   já faz a idempotência por `dest|sinal|turno`).
2. **Cutucada e briefing privados** — DM para líder/diretoria, camada
   `estrategica` (o texto dessa camada já existe em `radar_pauta_v1` e nomeia
   cada caso).
3. **Escrita sob pedido** — a Sol registrar desfecho do sinal quando a ADM
   responde "já liguei, ela vai ficar". Hoje `status`/`desfecho` de
   `radar_sinais` só mudam à mão.

⚠️ **Antes de ligar qualquer envio**, resolver (b) e (c) da seção 5 — o
combinado com o Luciano é que o agente seja **parceiro e cirúrgico**, e volume
sem teto entre agentes é o caminho mais curto para o oposto.

---

## 7. Objetos novos (para não recriar)

**Tabelas:** `radar_rodadas` (uma linha por detector por rodada) ·
`sol_grants_revogados_fatia0`

**Colunas:** `radar_sinais.visto_em` · `radar_regras.detector` ·
`radar_rodadas.detector`

**Views:** `vw_radar_sinal_vigencia_v1` ← **leitura canônica da pauta, não
filtrar `radar_sinais` cru**

**Funções:** `sol_resolver_escopo_v1` · 13 × `sol_porta_*_v1` ·
`radar_rodada_diaria_v1` · `radar_sincronizar_detectores_v1` ·
`radar_marcar_foto_conversas_v1` · `radar_texto_operacional_v1`

**Crons:** `radar-rodada-diaria` (jobid 235, `0 9 * * *`).
⚠️ **192 e 196 foram DESATIVADOS, não deletados** — voltar é `alter_job`.

**VPS** (`vps/la-hq/sol/scripts/`): `sol-portas-mcp.mjs` + 6 patches versionados
do dia. Config: `/home/sol/.hermes/profiles/sol/config.yaml`, bloco
`mcp_servers.sol-portas`. Serviço: `systemctl --user` do usuário `sol`
(**não** é unit de sistema).

**Skills tocadas** (as três apontavam para a porta larga):
`sol-bi-admin/SKILL.md` · `sol-la-report-business-rules/SKILL.md` ·
`sol-caixa-consulta/SKILL.md`. A viva é a do **perfil**
(`/home/sol/.hermes/profiles/sol/skills/`), não a do workspace —
`config.yaml` tem `skills.external_dirs: []`.
