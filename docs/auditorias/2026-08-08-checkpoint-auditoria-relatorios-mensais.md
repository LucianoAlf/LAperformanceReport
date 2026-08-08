# Checkpoint — Auditoria dos relatórios mensais (2026-08-06 a 08)

Origem: a ADM do Recreio (Fernanda) conferiu o relatório mensal de julho/2026 linha
por linha contra a planilha dela e apontou divergências. A apuração encontrou erro
real, achou coisas que ninguém sabia que existiam e mudou regra de negócio.

**PR aberto:** #75 — `fix/relatorio-mensal-faturamento-realizado-faturas-emusys`

---

## ✅ Resolvido e em produção

### Faturamento realizado vinha de dedução, não de fatura paga
O "Faturamento Realizado (pago)" era `MRR − inadimplência`, não o que entrou no
caixa. Em julho/2026 reportou **R$ 45.006,69 de faturamento inexistente** nas três
unidades (CG +24.990,02 · Barra +11.713,72 · Recreio +8.302,95).

A fonte certa já estava congelada no mesmo snapshot (`financeiro_faturas_emusys`,
de `emusys_faturas_v1`) — mudou apenas de qual chave a leitura extrai o número.
Migration `20260806190041`.

### MRR é base contratual (regra validada pelo Alf em 2026-08-06)
MRR = quanto há **a receber** dos alunos pagantes, independente de quem pagou.
Não migra para a fonte de faturas. O rótulo antigo prometia "pago + em aberto",
que é conta de fatura — daí a unidade comparar com o Emusys e concluir que o
relatório inteiro estava errado.

Os dois relatórios agora mostram três números distintos:
- `MRR / Base contratual` — quanto a base vale
- `Faturado no Emusys (pago + em aberto)` — quanto virou fatura
- `Recebido na competência (pago)` — quanto entrou

### Metas do Fideliza+ liam a fonte errada
O administrativo usava `metas_kpi` (metas operacionais) em vez de
`programa_fideliza_config` (tabela do programa, com pontuação e nota de corte).
Publicava inadimplência ≤1,5% e reajuste ≥10,0% quando o programa exige ≤1,0% e
≥7,0%. O gerencial já lia certo — a mesma unidade recebia dois números para a
mesma meta. Migration `20260807002922`.

⚠️ `programa_fideliza_historico` está **vazia para 2026** — nenhum prêmio foi
registrado ou pago. As correções entraram antes do fechamento do T3, não depois.

### Renovação pendente com data passada conta como renovada
Regra validada pelo Alf em 2026-08-08: se renovou no Emusys, a equipe não é
penalizada por não ter clicado em "confirmar".

⚠️ `pendente_validacao` guarda **duas coisas**: 47 com data passada (renovação
ocorrida, falta conferir) e 41 com data futura (previsão, todos em 28/08/2026).
Só a de data passada conta como realizada — a futura inflaria a taxa com
renovação que ainda nem venceu.

Alterado em `src/lib/retencaoOperacionalCanonica.ts` **e** na cópia dentro da edge
`relatorio-admin-whatsapp` (ela não importa do bundle do front).

### Lançamento manual de renovação passou a gravar a identidade Emusys
Raiz das duplicatas: `FormRenovacao.tsx` não gravava `emusys_matricula_id`, então
lançamento manual e webhook viravam duas linhas sem como casar. A busca já usava
`select('*')` — o campo vinha no objeto e só não era gravado. Agora grava também
`curso_id`, `professor_id` e `competencia_referencia`.

Impede duplicatas novas; **não corrige as existentes**.

### 7 não-renovações de Campo Grande que nunca foram lançadas
Confirmado pela unidade: os alunos saíram, mas as não-renovações nunca entraram em
`movimentacoes_admin`. Taxa de renovação de CG em julho passou de **91,2% para
77,5%** (meta ≥90%). 6 em julho, 1 em junho, R$ 2.419,00 de MRR perdido.

### ⚠️ O sync de faturas nunca teve cron — corrigido

**Causa raiz do relatório financeiro estar errado todo mês.** Entre os 54 jobs do
`pg_cron` havia sync de presença, matrículas, grade, professores, disciplinas,
metadados e agenda — **nenhum de faturas**. Ele só rodava por `internal_refresh`
(disparo interno da aplicação), que atualiza **apenas a competência corrente**.

Quando agosto virou o mês atual, julho congelou em 23/07. Mas o aluno continua
pagando a fatura de julho **durante** agosto:

- 39 faturas pagas entre 24/07 e 05/08 que o banco dava como abertas
- 30 faturas que nem existiam no espelho
- **R$ 15.942,90** a menos no faturamento de julho

Agravante: `fechamento-mensal-automatico` (jobid 83) roda **dia 1 às 01:00 UTC**,
no minuto seguinte ao fim do mês. O snapshot financeiro nascia antes de qualquer
pagamento tardio existir — **nunca teve chance de estar certo**.

Criados dois jobs (migration `20260808185259`):

| Job | Horário | Papel |
|---|---|---|
| `sync-faturas-competencia-atual` (107) | 00:30 UTC | Roda **antes** do fechamento das 01:00 do dia 1 |
| `sync-faturas-competencia-anterior` (108) | 03:00 UTC | Captura pagamento tardio o mês inteiro — **era o que faltava** |

⚠️ **Validar por `sync_runs`, nunca por `pg_cron`** (que marca `succeeded` mesmo em
401 — foi assim que o `sync-inadimplencia-emusys` ficou 13 dias morto). Teste real
em 08/08: `succeeded`, `requested_by='sync_admin_token'`, 1.042 atualizadas, 28
inseridas, `snapshot_complete=true`, 27 segundos.

### Faturamento e inadimplência reais de julho (após ressincronização)

⚠️ **Faturamento = SÓ PARCELAS** (regra do Alf, 2026-08-08). Passaporte, lojinha,
taxa de matrícula, ingresso de evento e locação **não entram**.

| Unidade | Faturamento realizado | Inadimplência | Alunos inadimplentes |
|---|---|---|---|
| Recreio | **R$ 142.351,40** | R$ 480,00 | **1** |
| Campo Grande | **R$ 137.319,06** | R$ 9.447,00 | 26 |
| Barra | **R$ 97.235,13** | R$ 1.397,00 | 3 |

O relatório publicado de julho mostrava R$ 141.032,20 (Recreio) e R$ 124.505,56
(CG) — **os snapshots seguem congelados com os valores antigos**.

### Outros
- **193 divergências de conciliação resolvidas**; status divergente **zerado** nas 3 unidades
- **41 nomes de responsável** completados (só onde o Emusys era complemento do nome)
- **Unidade fantasma `ZZTESTEUI`** removida com toda a cadeia (3 leads, 3 aulas,
  experimentais, vínculos, registros e áudios do Fábio) — era resíduo de teste de UI
- **Kailane (Comercial Barra):** o nome do lead na Conciliação abre o
  `ModalEditarLead`; ao salvar, a lista recarrega
- **Inadimplência real de CG apurada na API:** 6 alunos (R$ 2.589,00), não os 15 do
  espelho — 8 deles estão **sem cobrança automática configurada**

---

## ⏳ Em aberto

| # | Item | Observação crítica |
|---|---|---|
| 1 | **101 duplicatas de renovação** | `vw_renovacoes_duplicadas_suspeitas`. ⚠️ **Vitória da Silva Nobre** (Recreio) aparece na lista mas é **legítima** — dois tempos do mesmo curso, validado pelo Alf em 2026-06-07. Conferir cada grupo no Emusys. **Nunca deletar fisicamente** — foi um DELETE que criou o fantasma da Catarina. |
| 2 | **28 responsáveis divergentes** | São **pessoa diferente**, não complemento de nome. Decisão caso a caso. |
| 3 | **71 divergências de cadastro** | Barra 17 · Recreio 15 · CG 39. ⚠️ **Telefone não trazer**: são números diferentes, e é por ele que Sol e Mila disparam WhatsApp. |
| 4 | **Sync de faturas de CG defasado** | Espelho dizia 15 inadimplentes, API disse 6. Disparar `sync-faturas-emusys` para `2026-07-01` fora da janela dos crons. |
| 5 | **PR #75 sem revisão** | Mexe em rótulo que vai para as unidades. |
| 6 | **Texto para a Fernanda** | Pronto na conversa de 08/08. |
| 7 | **Snapshots de julho congelados com valores antigos** | O relatório mensal ainda publica o faturamento e a inadimplência de antes da ressincronização. Atualizar exige reescrever o payload **e recalcular `payload_hash`** — se errar, `hash_jsonb_canonico(payload) <> payload_hash` derruba a leitura do relatório nas 3 unidades. Mexer **só** nas chaves financeiras. |
| 8 | **28 faturas não-parcela fora do banco** | Passaporte, ingresso do L.A Session #4, locação, taxa de matrícula (R$ 9.172,66). O sync oficial já as inseriu em 08/08; ficam registradas porque não são faturamento e não devem entrar nesse KPI. |

---

## Armadilhas que custaram caro (não repetir)

- **Espelho ≠ API.** `alunos_emusys_atributos_divergencias` indicava 15 inadimplentes
  em CG; a API ao vivo mostrou 6. Aplicar em bloco teria marcado **9 alunos
  adimplentes como devedores**, incluindo um com 4 faturas pagas.
- **`GET /faturas` aceita `aluno_id`.** Paginar o endpoint inteiro rende 429; filtrar
  por aluno resolve em 13 chamadas leves. A skill `emusys-api` lista o endpoint como
  inexistente — **está desatualizada**; a fonte é `docs/api_emusys_v1.4.0.json`.
- **Rate limit da API: 60 req/min por IP**, compartilhado com os crons de produção.
- **Funções duplicadas entre front e edge.** `isRenovacaoConfirmadaOperacional` existe
  nos dois lugares; mudar um só faz o WhatsApp divergir da tela.
- **Deploy de edge via MCP reseta `verify_jwt`.** Sempre conferir depois.
- **Migrations aplicadas via MCP não geram arquivo no repo.** Versionar à mão e
  conferir o md5 do corpo da função contra produção.

---

## Números que não são bug (e vão ser perguntados de novo)

- **Trancados "2" e "3":** o primeiro é quem seguia trancado no fechamento; o segundo
  são trancamentos ocorridos no mês, contados **por matrícula**. Aluno de 2 cursos
  entra duas vezes.
- **"Alunos com 2 cursos: 25" x 26:** 25 têm exatamente 2 cursos, 1 tem 3 → **26
  pessoas** com curso adicional e **27 matrículas** adicionais.
- **Funil do gerencial usa 14 e 17:** `Experimental → Matrícula` conta só quem veio de
  experimental; `Lead → Matrícula` conta todas. É a regra canônica.
