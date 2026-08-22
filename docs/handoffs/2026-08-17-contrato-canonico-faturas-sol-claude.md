# Contrato canônico v4 — Faturas de Alunos, LA Report e Sol

**Data:** 17/08/2026 · **Atualizado:** 22/08/2026 (auditoria completa do módulo de caixa + PR #191)
**Projeto Supabase:** ouqwbbermlzqqvtqwlul
**Fonte de verdade sincronizada:** Emusys → sync_run_items
**Estado:** banco e exportador publicados. A prova visual autenticada da tela permanece pendente nesta data.

> **Atualização 22/08/2026 — módulo de caixa (comprovantes nos grupos do financeiro):**
> 1. `sol_caixa_parcela_canonica`, `sol_caixa_resolver_multi_aluno_v1` e
>    `sol_caixa_inadimplentes` morriam com 42501 ("papel nao autorizado") em **100% das
>    chamadas da Sol** — chamavam as canônicas direto, sem resolver o claim JWT. Corrigido:
>    a chamada interna virou os wrappers `sol_faturas_alunos_v1`/`sol_inadimplencia_v1`.
>    Isso destrava também `sol_caixa_lancar_recebimento_lote_v1` (chama o resolver por
>    dentro) — o lançamento de 2+ alunos num comprovante só (irmãos) agora funciona.
> 2. `sol_caixa_casar_parcela` **foi alterada** (decisão do Alf, 22/08 — a proibição da
>    seção "Carteira da Sol" vale para o lado da Sol, não para o LA Report): o
>    `valor_bate` deixou de comparar com o valor de TABELA e virou **date-aware**.
>    Contrato novo do retorno na seção "Fluxo de caixa" abaixo.
> Migrations `20260822120000` e `20260822121500`, PR #191, testado como a Sol (sem JWT)
> com os casos reais dos grupos de 21/08.
>
> **Atualização 22/08/2026 (2ª rodada):**
> 3. `sol_caixa_inadimplentes` alinhada ao v4 (migration `20260822150000`): o gate era da
>    era v3 (`confirmed_only` + `d_plus_0` + reaplicação de carência) e por isso SEMPRE
>    saía em erro. Agora aceita o contrato v4, exige `schema_version=4` e **não reaplica
>    D+2** (o canônico já cortou). Funciona pela primeira vez: CG devolveu 28 alunos /
>    R$ 17.251,54, batendo com os `confirmados` da canônica.
> 4. `caixa_movimentacoes` ganhou **`aluno_id` e `fatura_id`** (FK, ON DELETE SET NULL) e
>    as duas funções de lançamento gravam o vínculo — a Sol deve mandar `aluno_id` e
>    `fatura_id` no payload do unitário (ela já os recebe do `casar_parcela`); no lote o
>    resolver preenche sozinho (ganhou `aluno_id` no retorno por item). Payload antigo
>    continua válido (grava NULL). Migration `20260822151500`.
> 5. ~~Grants: `corrigir_forma_recebimento` e `autorizar_payload_v1` → `sol_acesso_restrito`~~
>    **REVERTIDO no mesmo dia** (migration `20260822170000`): a auditoria do repo da Sol
>    mostrou que a ausência era DELIBERADA — hardening fail-closed do V3
>    (`20260821094101_..._disable_legacy_corrigir_forma_rpc_for_sol`, ledger
>    `MIGRATIONS_APLICADAS.md`). Correção de forma passa pela `corrigir_movimento_v1`
>    (V3, com approval). `recalcular_cofre` segue sem grant (interna).
> 6. **Snapshot canônico do lote multi-aluno** (migration `20260822180000`, merge do
>    draft do Alfredo com as mudanças de 22/08): preview resolve UMA vez
>    (`resolver_multi_aluno_v1`); o approval valida os MESMOS `canonical_fatura_id`/
>    valores via **`sol_caixa_validar_multi_aluno_snapshot_v1`** (nova) — nunca reescolhe
>    fatura. Recusas ganham motivos específicos `snapshot_*` (fatura_nao_encontrada,
>    valor_fatura_mudou, status_fatura_mudou, categoria_mudou, competencia_mudou,
>    soma_divergente). O runtime da Sol de 22/08 (mensagens humanizadas) já pode ser
>    implantado — a migration que ele espera está aplicada.

## Decisão de produto

Há duas leituras, que não podem ser confundidas:

| Leitura | Quem usa | Universo |
|---|---|---|
| **Faturas de Alunos** | equipe operacional | ciclo completo: pagas, abertas, vencidas, a vencer, canceladas e reconciliação |
| **Cobrar agora D+2** | Sol, em modo sombra | abertas de alunos ativos, identidade exata, pelo menos dois dias em atraso e três competências recentes |

**Em atraso D+0** é informação financeira: venceu, aparece.
**Cobrar agora D+2** é fila operacional: passou pelos gates abaixo.

## Fonte única

### Interface de Faturas

O browser chama somente:

~~~
public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid,
  p_competencia_inicio date,
  p_competencia_fim date,
  p_status text,
  p_curso_id bigint,
  p_forma_pagamento text,
  p_busca text,
  p_as_of_date date
) returns jsonb
~~~

É a fonte de /app/faturas. O browser não lê emusys_faturas, sync_run_items,
alunos ou Emusys diretamente.

### Carteira da Sol

A Sol chama, **somente no backend com service_role**:

~~~
public.get_inadimplencia_canonica(
  p_unidade_id uuid,
  p_as_of_date date
) returns jsonb
~~~

O retorno esperado é **schema v4**. Para a carteira em modo sombra a fonte é
`sol_inadimplencia_v1` (envelope v4 puro, com gate deste documento aplicado
pelo consumidor). `sol_caixa_inadimplentes` está alinhada ao v4 desde 22/08 e
serve ao fluxo de CAIXA (resumo por aluno com faixas critico/atencao/normal
para conversa de recebimento) — não substitui o gate da carteira.
As RPCs de caixa abaixo permanecem fora do escopo **da Sol** (ela não as
altera; mudanças são do LA Report, versionadas em migration):

- sol_caixa_lancar_recebimento
- sol_caixa_abrir
- sol_caixa_fechar
- sol_caixa_casar_parcela (alterada pelo LA Report em 22/08 — ver "Fluxo de caixa")

## Gate obrigatório da Sol

Antes de apresentar, exportar ou preparar abordagem, validar:

~~~
schema_version = 4
status IN ('ok', 'partial')
fonte = 'sync_run_items'
operational.collection_allowed = true
operational.collection_scope = 'confirmed_active_d2_3_competencias'
operational.consumer_must_apply_collection_grace = false
operational.block_reasons = []
policy.delinquency_rule = 'd_plus_2'
policy.collection_grace_days = 2
policy.student_scope =
  'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2'
freshness.fresh_until > agora
~~~

Qualquer falha: lista vazia, motivo auditado, nenhum fallback em cache,
emusys_faturas, flag booleano, nome de aluno ou sync próprio. Em partial, usar
apenas os items confirmados que a RPC publicou.

Cada item já é D+2, está entre mês atual e dois anteriores, tem status=aberta,
source_missing=false, pagamento nulo, identidade exata, matrícula atual ativa
e cadastro não arquivado. Não reaplicar D+2 no consumidor:
consumer_must_apply_collection_grace é false porque o canônico já fez o corte.

Antes de WhatsApp, a Sol usa somente contact_resolution_status=resolved,
preserva IDs exatos de fatura, matrícula e contrato e nunca junta por nome.

## Fluxo de caixa (comprovantes nos grupos) — contratos vigentes desde 22/08

O fluxo é separado da carteira D+2: a equipe manda o comprovante no grupo do
financeiro, a Sol casa aluno/responsável/fatura, pede autorização ("pode") e
lança em caixa_movimentacoes. Funções e contratos:

**`sol_caixa_parcela_canonica(p_unidade_id, p_aluno, p_valor, p_as_of)`** —
funcionando desde 22/08 (antes: 42501 em toda chamada). Devolve os três
valores da regra de pontualidade: `valor_da_parcela` (até o vencimento),
`valor_sem_desconto_condicional` (cheio) e `valor_hoje` (com multa/mora, conta
da canônica). É a fonte preferida do card de comprovante.

**`sol_caixa_resolver_multi_aluno_v1(p_unidade_id, p_itens, p_valor_total)`** —
funcionando desde 22/08. Recebe 2+ itens `{aluno_nome, categoria, valor,
competencia?}`, valida cada um contra a fatura canônica e confere a soma com o
total do comprovante. É o caminho para irmãos e pagamento composto do mesmo
responsável (caso real: passaportes João Victor + Pedro Victor, R$ 360 + 360 =
720). Cada item volta com `aluno_id` e `canonical_fatura_id`.

**Fluxo snapshot do lote (desde 22/08, desenho do Alfredo):** o resolver roda
**no preview**; o "pode" NÃO reescolhe fatura — `lancar_recebimento_lote_v1`
chama `sol_caixa_validar_multi_aluno_snapshot_v1`, que confere que os MESMOS
`canonical_fatura_id`/valores/status do preview continuam válidos na fonte
canônica. Se algo mudou entre o preview e a autorização, recusa com motivo
específico (`snapshot_valor_fatura_mudou`, `snapshot_fatura_nao_encontrada`,
…) e **nada é lançado parcialmente**. O preview original fica preservado.

**`sol_caixa_casar_parcela(p_unidade_id, p_aluno, p_valor, p_competencia)`** —
contrato de retorno NOVO em `parcela` (22/08):

| Campo | Significado |
|---|---|
| valor | **líquido** (até o vencimento) — antes era o valor de tabela |
| valor_tabela | valor_original do Emusys (todo CG = 447) |
| valor_apos_vencimento | original − desconto fixo (sem multa/mora) |
| atrasada / dias_atraso | hoje BRT × data_vencimento |
| valor_bate | casa com líquido OU pós-vencimento |
| valor_bate_como | 'ate_vencimento' \| 'apos_vencimento' \| null |

Motivo: 722 de 1.040 faturas abertas (69%) têm desconto condicional de
pontualidade (CG 96,6%) e o card saía contraditório ("Valor: R$ 377 / o
comprovante de R$ 377 difere"). Regra do Alf: em dia paga o líquido; atrasado
perde o condicional. **A comparação sinaliza, não recusa** — atrasado pagando
o valor de até o vencimento é decisão humana (caso Amaia, 21/08, autorizado).
No card, usar `valor_bate_como`: em vez de "difere — confere", dizer "pagou o
valor de até o vencimento, mas está atrasada há N dias".

**Composto canônico + abrir/fechar V3 (22/08, migration `20260822233000`, PR #203 —
autoria Alfredo, spec `docs/specs/2026-08-22-sol-caixa-abrir-fechar-v3.md`):**
- **`sol_caixa_resolver_composto_aluno_v1(jsonb)`** — recebe `{unidade_id,
  aluno_nome, competencia?, valor_total}` e acha o subconjunto de 2+ faturas
  canônicas que soma EXATO o total. Mata as leituras REST diretas de
  `alunos`/`emusys_faturas` do runtime. Fail-closed em tudo: aluno ambíguo,
  2+ subconjuntos válidos (`composicao_ambigua` — nunca escolhe por heurística),
  >12 candidatas (`composicao_complexa_revisao_manual`), só
  parcela/passaporte/matrícula. `itens[]` no MESMO shape do multi-aluno.
  **Identidade:** `aluno.id` é matrícula, não pessoa; a resolução do nome agrupa
  pelo `emusys_student_id` do envelope. Só há ambiguidade entre `student_id`s
  distintos. Cada item devolve o `aluno_id` da sua própria fatura/matrícula.
- **Abrir/fechar V3**: `resolver_abertura_v3`/`resolver_fechamento_v3` (snapshot
  + hash no banco via `extensions.digest`), `abrir_v3`/`fechar_v3` (validam
  approval, revalidam snapshot, advisory xact lock, idempotência por
  `sol_caixa_v3_caixa_operacoes_v1`), `v3_cancelar_preview_v1`. **Consumo do
  "pode" só DEPOIS da mutação efetiva** — corrida que impede abrir/fechar
  preserva o approval (provado no harness). Snapshot de fechamento inclui
  contagem de movimentos POR AMBIENTE — pix/cartão entre preview e "pode"
  força preview novo mesmo sem mexer no cofre. Expiração = min(4h, fim do dia
  BRT). Reabertura fora de escopo (fluxo humano, `caixa_reaberturas_log`).
- As RPCs legadas `sol_caixa_abrir`/`fechar` seguem vivas até o runtime migrar;
  a trava de pendência vale nos dois trilhos.

**Reabertura do caixa do dia (22/08 ~16h, migration `20260822250000`, PR #209):**
`sol_caixa_reabrir_caixa_v1(jsonb)` — nasceu de incidente real (Arthur fechou
15:30 com expediente aberto; comprovantes represados; a Sol corretamente
recusou contornar com SQL). **Política do Alf: qualquer membro do grupo
financeiro oficial autoriza reabrir** (mesmo caminho grupo+policy do
abrir/fechar). Guardas: motivo obrigatório, SÓ o dia corrente BRT (dia
anterior = manual/admin), lock, log completo em `caixa_reaberturas_log`
(com snapshots) + auditoria. Fluxo esperado da Sol: "Sol, reabre o caixa"
+ motivo → RPC → confirma no grupo → time reenvia comprovantes → fechamento
normal depois. ⚠️ **Runtime precisa apontar o intent de reabertura para esta
RPC** (a rotina interna antiga dá permission denied). ⚠️ **Nota V3:**
pós-reabertura, `fechar_v3` bateria na idempotência do UNIQUE
(unidade,data,operacao) — tratar antes do deploy do runtime V3 de abrir/fechar.

**Trava de fechamento pendente na abertura (22/08, migration `20260822230000`):**
`sol_caixa_abrir` RECUSA abrir o dia quando o dia anterior está aberto —
motivo `fechamento_pendente_dia_anterior` + payload `pendencia`
(`caixa_diario_id`, `data_caixa`, `saldo_final_calculado` recomputado dos
movimentos). Nasceu do incidente da Barra (21-22/08): o preview de fechamento
ficou sem "pode" (Arthur fora do horário), o dia ficou aberto, e a abertura
seguinte fez carry-over do último FECHADO (20/08) — a retirada de R$ 950
sumiu do saldo (1.012,80 em vez de 62,80). Corrigido retroativamente com
rastro em `sol_caixa_lancamento_auditoria`. **Fluxo esperado da Sol ao receber
o motivo novo: oferecer o fechamento de ontem com os números da `pendencia`,
pedir um "pode" para fechar ontem, e só então abrir hoje.** Enquanto o runtime
não tratar o motivo, ela simplesmente não abre — fail-closed, nunca mais abre
com saldo errado. Regra organizacional que acompanha (Alf): fechamento é de
quem está NA UNIDADE no horário (gerente organiza a escala); automatizar
abrir/fechar sem "pode" foi recusado por ora.

**Vínculo estruturado no lançamento (22/08):** `caixa_movimentacoes` tem
`aluno_id` e `fatura_id`. No lançamento unitário, mandar os dois no payload
(`casar_parcela` devolve `aluno_id` e `parcela.fatura_id`); no lote o resolver
preenche sozinho. Vínculo inválido vira NULL sem derrubar o lançamento — é
metadado de reconciliação, não gate.

⚠️ Pagamento **parcial** (ex.: "restante do passaporte R$ 199") não tem fatura
com esse valor para validar — segue conferência humana, sem match automático.
⚠️ **Grants seguem o fail-closed do V3, que é DELIBERADO:**
`corrigir_forma_recebimento` (legada, sem approval) e `autorizar_payload_v1`
(interna das 4 mutadoras) **não** têm EXECUTE para os papéis da Sol — revogado
em `20260821094101` (ledger V3) e re-revogado em `20260822170000` depois que a
auditoria concedeu por engano. Correção de forma = `corrigir_movimento_v1`
(V3, com approval). `recalcular_cofre` idem, interna.
**Regra: antes de conceder EXECUTE em `sol_caixa_*`, conferir o ledger
`MIGRATIONS_APLICADAS.md` e o STATUS mais recente no repo da Sol
(github.com/LucianoAlf/sol-openclaw-backup) — grant ausente pode ser decisão.**

## Regras e reconciliação

- Trancado temporário, evadido, inativo e ex-aluno ficam fora de Cobrar agora D+2.
- Reingresso entra apenas com matrícula ativa atual e identidade Emusys comprovadas.
- A janela é de três competências, não 90 dias corridos.
- source_missing é “não observado na fotografia atual”; nunca é pagamento,
  não reduz saldo e não entra em cobrança ou total.
- **Exceção da substituta viva (20/08):** o Emusys apaga e recria a fatura ao
  editar a parcela. Quando existe outra fatura da MESMA pessoa na MESMA
  competência, com id diferente e valor > 0, a antiga sai da fila de
  reconciliação do leitor de faturas (`get_faturas_alunos_financeiro_v1`).
  ⚠️ A regra ainda NÃO existe em `get_inadimplencia_canonica` — o efeito é só
  na contagem de `reconciliation` do envelope dela (21 source_missing em CG em
  22/08, dos quais parte tem substituta viva). **Não bloqueia a carteira**: o
  canônico publica `collection_allowed=true` com `block_reasons=[]` mesmo
  assim (source_missing vai para reconciliação, nunca para cobrança).
- Somente status=paga em sincronização válida confirma quitação.
- source_missing, identidade inválida e contato pendente ficam na
  **Reconciliação financeira** de /app/faturas. Não bloqueiam o subconjunto
  confirmado seguro nem são misturados à cobrança.

## Valores financeiros e forma de pagamento

| Campo | Significado |
|---|---|
| valor_com_desconto | original menos descontos fixo e condicional |
| valor_sem_desconto_condicional | original menos desconto fixo |
| valor_atualizado | valor sem desconto condicional + multa 2% + mora 1% ao mês pro rata |

~~~
multa = valor_sem_desconto_condicional × 0,02
mora = valor_sem_desconto_condicional × 0,01 × dias_atraso / 30
valor_atualizado = valor_sem_desconto_condicional + multa + mora
~~~

Para faturas pagas, a tela mostra o valor efetivamente pago. Para abertas ou
canceladas, a forma exibida é a forma prevista da matrícula. Sem dado:
**Forma não informada**, sem inferir boleto, Pix ou cartão.

O GET /faturas do Emusys documenta juros_e_multa dinâmico. Na sondagem
controlada de 17/08, três faturas vencidas retornaram zero nesse campo; por
isso o LA Report usa a fórmula contratual explícita, não apresenta esse zero
como valor autoritativo e mantém o fato registrado para acompanhamento.

## Frescor e sincronização

Uma única fila sincroniza competências. A Sol não cria cron, polling ou sync
paralelo.

| Recorte | Cadência | Frescor publicado |
|---|---:|---:|
| competência atual | 15 minutos | 30 minutos |
| dois meses anteriores | 60 minutos | 75 minutos |
| backlog antigo aberto/source_missing | 2 horas | 2 horas |

O worker é serial, persiste 429 com backoff e põe identificador inválido de
matrícula em validação/quarentena sem derrubar a coleta. A Edge
sync-faturas-emusys está ativa na versão 33. Atualizar agora usa essa mesma
fila.

## Evidência da reconciliação

Sincronizações controladas de junho, julho e agosto de 2026 foram comparadas
aos seis arquivos enviados pelo Emusys. Contagem e valor original em atraso
coincidiram exatamente:

| Unidade | Jun/2026 | Jul/2026 | Ago/2026 |
|---|---:|---:|---:|
| Campo Grande | 6 / R$ 2.682,00 | 8 / R$ 3.576,00 | 3 / R$ 1.341,00 |
| Recreio | 1 / R$ 480,00 | 1 / R$ 480,00 | 5 / R$ 2.390,87 |
| Barra | 0 / R$ 0,00 | 1 / R$ 397,00 | 18 / R$ 7.579,00 |

A prova ao vivo de agosto em Campo Grande também ficou item a item igual:
459 faturas no Emusys e 459 no snapshot, sem item exclusivo nem diferença nos
campos centrais.

## Prompt pronto para o Claude/Sol

~~~
Implemente apenas o consumidor da Sol para a carteira canônica v4 do LA Report.

Chame no backend (service_role) public.get_inadimplencia_canonica(unidade_id,
as_of_date). Não use sol_caixa_inadimplentes, emusys_faturas, flags de aluno,
cache de lista, sync próprio ou qualquer join por nome.

Aceite somente schema_version=4; status ok/partial; fonte=sync_run_items;
operational.collection_allowed=true;
collection_scope=confirmed_active_d2_3_competencias;
consumer_must_apply_collection_grace=false; block_reasons=[];
policy.delinquency_rule=d_plus_2; policy.collection_grace_days=2; e
freshness.fresh_until no futuro. Caso contrário, lista vazia e motivo auditado;
nunca faça fallback.

Use somente items retornados. Eles já são D+2, das três competências recentes,
de alunos ativos e identidade exata. Não aplique outra carência. Exclua da ação
todo item sem contact_resolution_status=resolved. Preserve
emusys_fatura_id/emusys_matricula_id/emusys_contrato_id. Não deduza pagamento
de source_missing: é reconciliação, nunca cobrança.

Exiba valor_com_desconto, valor_sem_desconto_condicional e valor_atualizado.
Não recalcule juros na Sol. Não altere sol_caixa_lancar_recebimento,
sol_caixa_abrir, sol_caixa_fechar ou sol_caixa_casar_parcela.

No fluxo de caixa (comprovantes no grupo): use sol_caixa_parcela_canonica para
o card (valor_da_parcela = até o vencimento; valor_sem_desconto_condicional =
cheio; valor_hoje = com multa/mora). Para 2+ alunos no mesmo comprovante
(irmãos, composto), use sol_caixa_resolver_multi_aluno_v1 e lance com
sol_caixa_lancar_recebimento_lote_v1 — nunca lance o total num aluno só. No
retorno de sol_caixa_casar_parcela, leia valor_bate_como: 'ate_vencimento' em
atraso significa "pagou o valor de até o vencimento, mas está atrasada há N
dias — com multa/mora seria R$ X"; não diga "difere" quando o valor casa com o
de até o vencimento. Pagamento parcial (não casa com nenhuma fatura) é
conferência humana. Ao lançar, inclua aluno_id e fatura_id no payload do
sol_caixa_lancar_recebimento (vêm do casar_parcela); no lote o resolver
preenche. Para o resumo de devedores na conversa de recebimento, use
sol_caixa_inadimplentes (v4 desde 22/08).

Mantenha modo sombra: pode listar, agrupar e auditar, mas não envia WhatsApp,
não liga cron de cobrança e não efetua baixa sem aprovação humana posterior e
comparação sombra verde nas três unidades.
~~~

## Auditoria de permissões — item 8 do roadmap (executada em 22/08/2026)

Estado medido no banco (read-only), para a fase de promoção do classificador:

**✅ Aprovado:**
- **Zero DML de tabela** para os papéis da Sol (`sol_acesso_restrito`,
  `sol_caixa_readonly`, `sol_atendimento_externo`) — toda escrita passa por RPC.
- 46 funções com grant nominal a `sol_acesso_restrito`, todas de negócio
  autorizadas (caixa V3 + wrappers canônicos + KPIs); 15 a `sol_caixa_readonly`,
  todas de leitura. Nenhuma fora do ledger.
- Fail-closed das legadas preservado (`corrigir_forma`, `autorizar_payload`,
  `recalcular_cofre` sem grant).
- Guard das canônicas **barra anon** (testado: `get_faturas_alunos_financeiro_v1`
  com claim anon → "papel nao autorizado").

**✅ Itens 1–3 FECHADOS em 22/08** (migration `20260822210000`, após Alfredo e
Sol confirmarem no runtime vivo que o Hermes chama com service_role):
- `sol_kpis_alunos_v1` e `sol_custo_seguranca_v1`: anon E authenticated fora
  (vazavam dados sem guard; zero consumidor browser/edge).
- Fila Hermes: anon fora em todas. ⚠️ **O mapa de consumidores corrigiu o
  plano**: `caixa_validate`/`caixa_enqueue`/`report_enqueue` são chamadas PELO
  BROWSER (CaixaWhatsAppPreview, ModalRelatorio, ComercialPage) — authenticated
  FICA nelas; `report_error_retryavel`/`report_watchdog` perderam os dois.
- `get_faturas_alunos_financeiro_v1`: anon fora (era via PUBLIC na ACL — o
  revoke nominal de anon não bastava, precisou `revoke from public`);
  authenticated fica (browser de /app/faturas). Higiene: `sol_caixa_ator_ok`,
  `sol_tel_chave` (PUBLIC fora) e `sol_registrar_divergencia` (authenticated
  fora).

**⚠️ Gates ABERTOS pré-STRICT=1 (do Alfredo, endossados):**
1. **Tirar a service_role do bridge da Sol.** Enquanto a key mora no processo,
   a allowlist de 46 RPCs é convenção, não enforcement — e o Alfredo achou no
   próprio `caixa-financeiro.cjs` caminhos legados de REST direto a `alunos` e
   `emusys_faturas`, que contrariam a regra de RPC canônica. Saída: relay/edge
   com allowlist OU credencial própria de `sol_acesso_restrito` (JWT com claim
   dessa role — as 46 funções viram limite real).
2. **Só depois** reduzir o SELECT amplo (421 tabelas) de `sol_acesso_restrito`
   — antes disso a redução não protege o processo, que tem service_role.

> ✅ **RESOLVIDO em 22/08 ~14:45** (deploy `alfredo/remove-runtime-rabiolas`,
> blob `0c9e11a4` = vivo, verificado): os 3 buracos abaixo morreram — REST
> direto a `alunos`/`emusys_faturas` = 0 ocorrências no runtime vivo, correção
> legada = 0 chamadas (usa `corrigir_movimento_v1`), composto via RPC canônica.
> **A troca de credencial está DESBLOQUEADA** — falta só o dual-run no canário.

**Mapa de não-regressão da troca de credencial (inventário do runtime vivo,
22/08 — para a Sol NÃO parar de atender os grupos):** o `caixa-financeiro.cjs`
chama 18 RPCs `sol_caixa_*`; **17 já estão cobertas** pelo grant de
`sol_acesso_restrito`. Os 3 buracos que quebrariam o atendimento se a troca
fosse feita hoje, e que precisam fechar ANTES dela:
1. **`sol_caixa_corrigir_forma_recebimento`** — o runtime AINDA chama a RPC
   legada, que hoje só funciona porque a service_role atropela o próprio
   fail-closed do V3. Com credencial restrita → 42501 no fluxo "era cartão,
   não pix". Fix: rotear a correção de forma para `corrigir_movimento_v1`
   (V3) no runtime — já está na lista de rabiolas do Alfredo.
2. **REST direto a `alunos`** — com credencial restrita, a RLS de `alunos`
   não tem policy para a role → **0 linhas em silêncio** (o match por
   responsável degrada sem erro). Trocar por RPC.
3. **REST direto a `emusys_faturas`** — idem (policy só de service_role).
   Trocar por RPC (`parcela_canonica`/`sol_faturas_alunos_v1`).
Protocolo da troca: dual-run com a credencial nova num grupo canário
comparando com a atual, janela fora do horário de caixa, rollback = voltar a
env var, e monitorar `caixa.log` + `sol_caixa_lancamento_auditoria` (pico de
recusas) por 48h.

## Fora desta etapa

- Cobrança de ex-alunos ou débitos fora das três competências: fluxo histórico
  separado, ainda a decidir.
- Envio automático de WhatsApp, baixa, negociação ou recebimento.
- Financeiro estratégico, contas a pagar e conciliação bancária.
