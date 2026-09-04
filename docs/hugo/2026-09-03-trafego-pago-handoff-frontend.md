# Tráfego Pago — o que existe no motor e o que falta no front

**Para:** Hugo · **De:** Luciano/Claude · **Data:** 03/09/2026
**Escopo:** tudo que foi construído em 03/09 para medir mídia paga ponta a ponta
(Meta + Google), pronto para a tela. **Nada disso tem interface hoje.**

---

## 0. O problema que isso resolve

A página `/app/trafego-pago` é **100% ao vivo** contra a Graph API: o número de
gasto de hoje deixa de existir amanhã. E ela só enxerga **conversa** — nunca
matrícula. Resultado medido em 03/09:

> O anúncio campeão do painel ("Kids bateria", R$ 4,49 por conversa) queimou
> **R$ 1.223 e matriculou zero** em 180 leads. O criativo quase pior do painel
> matriculou a R$ 143.

Agora existe histórico persistido e o cruzamento até a matrícula. Falta a tela.

---

## 1. Mapa do que existe

```
Meta Graph API  ──► capturar-meta-ads-diario   ──► meta_ads_metricas_diarias    (dia × anúncio)
Google Ads API  ──► capturar-google-ads-diario ──► google_ads_metricas_diarias  (dia × campanha)
                                                          │
                                                          ▼
                                              vw_ads_gasto_diario_v1   ← FONTE ÚNICA do gasto
                                                          │
            leads / lead_experimentais / alunos ──────────┤
                                                          ▼
                            radar_trafego_criativo_v1 · radar_trafego_canal_v1
                                     radar_publico_reativacao_v1
```

### Tabelas

| objeto | grão | RLS |
|---|---|---|
| `meta_ads_metricas_diarias` | `(dia, ad_id)` | admin |
| `google_ads_metricas_diarias` | `(dia, campanha_id)` | admin |
| `vw_ads_gasto_diario_v1` | união das duas | `security_invoker = false`, grant só a `authenticated` |

**Estado em 03/09 21h:** Meta **231 linhas** (04/08→03/09) · Google **259 linhas**
(05/06→03/09).

⚠️ **Não leia as tabelas cruas para somar gasto.** A fonte única é
`vw_ads_gasto_diario_v1`. Duas somas do mesmo número em lugares diferentes é
exatamente o que gerou as duplicatas de renovação neste projeto.

### Edge functions

| função | `verify_jwt` | porta |
|---|---|---|
| `capturar-meta-ads-diario` | `false` | header `x-radar-token` = `integracao_tokens.meta_ads_captura` |
| `capturar-google-ads-diario` | `false` | header `x-radar-token` = `integracao_tokens.google_ads_captura` |

**O front NÃO chama estas edges.** Elas são de ingestão, disparadas por `pg_cron`.
A tela lê as RPCs.

### Crons (todos ativos, conferidos rodando em 03/09)

| jobid | nome | schedule (UTC) | janela |
|---|---|---|---|
| 194 | `meta-ads-captura-horaria` | `25 * * * *` | 3 dias |
| 195 | `meta-ads-captura-recalculo-diario` | `20 9 * * *` | 45 dias |
| **197** | `google-ads-captura-horaria` | `35 * * * *` | 3 dias |
| **198** | `google-ads-captura-recalculo-diario` | `30 9 * * *` | 45 dias |

**Por que duas cadências:** a horária é o "tempo real"; a diária de 45 dias existe
porque **as duas plataformas revisam número depois** (Meta em 24-72h; Google pela
janela de atribuição). Reescrever a janela é o comportamento **correto**, não
efeito colateral — o upsert é por PK.

🔴 **Prova de vida pelo DADO, nunca pelo `pg_cron`** — ele marca `succeeded` só por
ter enfileirado o `net.http_post`:
```sql
select max(capturado_em), max(dia), count(*) from google_ads_metricas_diarias;
```

---

## 2. Contratos das RPCs (é contra isto que a tela coda)

Todas são `SECURITY DEFINER`, ACL `{postgres, authenticated, service_role}`,
chamadas por `supabase.rpc(...)`.

### 2.1 `radar_trafego_canal_v1(p_dias int = 180, p_maturidade_dias int = 35)`

Desempenho por **canal**, com custo e retorno.

```ts
type CanalRow = {
  canal: string                  // 'Instagram' | 'Google' | 'Indicação' | 'Visita/Placa' | 'SEM ORIGEM' | ...
  leads: number
  agendou: number
  realizou_exp: number
  matriculas: number
  conv_pct: number | null        // matrículas / leads
  gasto: number | null           // ⚠️ null = NÃO SEI (ver abaixo)
  gasto_dias_cobertos: number    // dias da janela com foto de gasto
  janela_dias: number
  custo_lead: number | null
  custo_matricula: number | null
  ltv_estimado: number           // matrículas × LTV mediano
  retorno_x: number | null       // ltv_estimado / gasto
}
```

**Como chamar:**
```ts
// janela com custo disponível hoje (últimos 30 dias, sem descontar maturidade)
const { data } = await supabase.rpc('radar_trafego_canal_v1',
  { p_dias: 30, p_maturidade_dias: 0 })

// coorte madura (conversão final confiável, mas sem custo antes de 04/08)
const { data } = await supabase.rpc('radar_trafego_canal_v1',
  { p_dias: 180, p_maturidade_dias: 35 })
```

⚠️ **`gasto: null` significa *não sei*, nunca *de graça*.** Confira
`gasto_dias_cobertos`: `0` = não temos foto naquela janela. Canais orgânicos
(Indicação, Visita/Placa, Ex-aluno) **sempre** vêm com `gasto: null` — não têm
mídia paga. **Na tela, escreva "—" ou "sem custo de mídia", nunca "R$ 0,00".**

⚠️ **`Site` é dobrado em `Google`** dentro da RPC (regra do Luciano: é a landing
page que roda no Google). Não desfaça isso no front.

### 2.2 `radar_trafego_criativo_v1(p_de date = hoje-30, p_ate date = hoje)`

Funil **por criativo do Meta**: gasto → conversa → lead → agendamento →
experimental → matrícula.

```ts
type CriativoRow = {
  ad_id: string; ad_name: string | null; campanha: string | null
  gasto: number
  conversas: number              // ação messaging_conversation_started_7d
  leads: number                  // leads.meta_ad_source_id casando
  agendou: number
  realizou_exp: number
  matriculou: number
  custo_conversa: number | null
  custo_lead: number | null
  custo_agendamento: number | null   // ← a métrica que inverte o ranking
  custo_matricula: number | null
  taxa_agendamento_pct: number | null
  dias_maturidade: number        // dias entre p_ate e hoje
  cohort_madura: boolean         // dias_maturidade >= 35
}
```

⚠️ **Só Meta.** O Google não entra aqui: Performance Max não expõe anúncio como
o Search expõe, e o equivalente no Google é **termo de busca** — outra consulta,
ainda não construída.

⚠️ **`cohort_madura: false` tem que aparecer na tela.** A mediana lead→matrícula
é **4 dias** e o p90 é **37**; 88% converte em até 30. Coorte nova ainda está
convertendo — sem esse aviso alguém lê "0 matrículas" onde é só falta de tempo.

### 2.3 `radar_publico_reativacao_v1(p_unidade_id uuid = null)`

Tamanho dos públicos prontos para campanha de reativação.

```ts
type PublicoRow = {
  publico: 'experimental_sem_matricula' | 'faltou_experimental'
         | 'familias_ativas_indicacao' | 'ex_alunos' | 'lead_nunca_agendou'
  criterio: string
  pessoas: number
  temperatura: 'quente' | 'morno' | 'frio'
  ordem: number
}
```

Medido em 03/09 (rede): 368 · 173 · 884 · 397 · 8.054.

⚠️ Devolve **tamanho, nunca telefone**. Quem dispara é o módulo de Campanhas,
com opt-out e janela própria.

---

## 3. 🔒 Permissão — leia antes de codar

**`radar_trafego_canal_v1` e `radar_trafego_criativo_v1` exigem `is_admin()`.**
Usuário não-admin recebe:

```
ERROR 42501: acesso_restrito_custo_de_midia
```

Validado nos 3 perfis em 03/09: `service_role` 10 linhas · admin 10 linhas ·
usuário de unidade **barrado**.

⚠️ **O gate está DENTRO da função, não em RLS.** `SECURITY DEFINER` não é
alcançado por RLS — a policy `is_admin()` das tabelas **não** protege quem chega
pela RPC. (Foi um furo que eu abri e fechei no mesmo dia: as duas nasceram com
`grant execute to authenticated` sem guarda interna.)

⚠️ **O gate é `is_admin()` — 9 admins.** É deliberadamente **mais largo** que o
gate de 2 e-mails da página `/app/trafego-pago` (`hugo@` + `lucianoalf.la@`). Se
a tela nova tiver que respeitar os 2 e-mails, **o lugar de apertar é a função
SQL**, não o front — front não é fronteira de segurança.

`radar_publico_reativacao_v1` fica **fora** do gate de propósito: devolve tamanho
de público, não dinheiro, e serve ao time comercial.

---

## 4. Credenciais — onde estão (valores NÃO ficam em repo)

### Segredos do Supabase (`npx supabase secrets list`)
```
GOOGLE_ADS_CLIENT_ID
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_REFRESH_TOKEN
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_ADS_CUSTOMER_ID          = 7179097170   (conta "00 - Grupo L.A", BRL)
META_ADS_TOKEN                                  (já existia)
```
Rotacionar: `npx supabase secrets set --env-file <arquivo fora do repo>`.

### Tokens de porta das edges (`integracao_tokens`, RLS + zero policies)
```
meta_ads_captura · google_ads_captura
```
Rotacionar = `UPDATE` na tabela, **sem redeploy**.

### Google Cloud / Google Ads
Conta `la.tecnology.system@gmail.com` → MCC **Grupo LA Music** (`164-091-0901`)
→ Adm. → Central de API guarda o developer token. Projeto Cloud
`eco-tape-507521-u1`.

### 🔴 Duas armadilhas do Google que custaram tempo

**1. NÃO mandar `login-customer-id`.** A API responde `403 USER_PERMISSION_DENIED`
com uma mensagem que sugere **exatamente o contrário** (*"o customer id do
gerenciador DEVE estar no header"*). Medido: `listAccessibleCustomers` devolve
**só** `customers/7179097170` — o usuário OAuth alcança a conta **direto** e não é
membro do MCC. Sem o header, `200` na hora. A env
`GOOGLE_ADS_LOGIN_CUSTOMER_ID` foi **removida** e o código só a envia se existir.

**2. As versões da API mudam.** Em 03/09, **v21, v20 e v19 já não existem**;
vivas são **v22–v25**. A edge tenta em ordem (`GOOGLE_ADS_API_VERSIONS`, default
`v25,v24,v23,v22`) e o fallback foi usado **na primeira execução**. Versão fixa
aposentada viraria *"o gasto parou de atualizar"* — sintoma que ninguém percebe
olhando o `pg_cron`.

---

## 5. O que a tela precisa mostrar (proposta)

**Aba nova em Tráfego Pago — "Resultado", ao lado das que já existem.**

1. **Faixa de topo:** gasto total do período por plataforma, custo por lead,
   custo por matrícula, retorno em LTV. Fonte: `radar_trafego_canal_v1`.
2. **Tabela por canal**, com os orgânicos junto (é o contraste que importa —
   Indicação converte 35,7% contra 2,7% do Instagram).
3. **Funil por criativo** (`radar_trafego_criativo_v1`), ordenado por
   **`custo_agendamento`**, não por `custo_conversa`. É a coluna que inverte o
   ranking e a razão de tudo isso existir.
4. **Badge de coorte imatura** quando `cohort_madura = false`.
5. **Públicos de reativação** (`radar_publico_reativacao_v1`) como cards, com o
   custo estimado de alcançar cada um (~R$ 0,34/pessoa por template oficial).

### Regras de exibição que não podem ser esquecidas

- `gasto: null` → **"—"** ou "sem mídia paga". **Nunca R$ 0,00.**
- `conversoes_plataforma` da view **não é comparável entre plataformas** (no Meta
  é conversa de WhatsApp; no Google é a ação configurada na conta). Serve para
  acompanhar cada uma contra ela mesma. **Não ranquear uma contra a outra.**
- Custo por matrícula **não é gravado** em lugar nenhum — nasce do cruzamento
  `ad_id → leads.meta_ad_source_id → converteu`. Guardar congelaria um número que
  muda toda vez que um lead antigo converte.

---

## 6. Limites conhecidos — ditos antes de você descobrir

🔴 **39,7% das matrículas não têm canal.** Na coorte madura são 423 matrículas e
**168 sem origem nenhuma**. O ranking entre canais conhecidos se sustenta, mas
dois quintos do resultado são invisíveis. Diagnóstico completo em
[`docs/auditorias/2026-09-03-canal-de-origem-da-matricula.md`](../auditorias/2026-09-03-canal-de-origem-da-matricula.md).

🔴 **Google não tem detalhe por criativo.** Grão é campanha. As 3 campanhas
Performance Max são **uma por unidade** (`[BARRA]`, `[RECREIO]`, `[CG]`) — recorte
que o Meta **não** permite (a campanha dele é "Todas as unidades"). Vale expor
Google por unidade na tela; é informação que só existe desse lado.

🟡 **A Barra é um ponto de interrogação, não uma conclusão.** R$ 1.215 de Google,
4.008 cliques, **7 leads atribuídos, 0 matrículas** — contra 64 leads do Recreio
com gasto e cliques quase idênticos. **Mas** a Barra tem 35% de leads sem origem
(o Recreio tem 2,6%). Campanha quebrada e atribuição quebrada cabem igualmente no
dado. **Não pintar de vermelho na tela** até alguém rastrear onde o clique do
P.Max da Barra aterrissa.

🟡 **Histórico curto.** Meta desde 04/08, Google desde 05/06. `retorno_x` na
coorte madura vem `null` até o Meta acumular 35+ dias antes da janela.

---

## 7. Arquivos

| o quê | onde |
|---|---|
| tabela Meta | `supabase/migrations/20260903290000_meta_ads_metricas_diarias.sql` |
| RPCs | `supabase/migrations/20260903300000_radar_trafego_e_publicos.sql` |
| Site→Google + cobertura | `supabase/migrations/20260903310000_radar_trafego_canal_site_no_google.sql` |
| tabela Google | `supabase/migrations/20260903320000_google_ads_metricas_diarias.sql` |
| view única + canal com Google | `supabase/migrations/20260903330000_vw_ads_gasto_diario_e_canal_com_google.sql` |
| crons Google | `supabase/migrations/20260903340000_crons_google_ads_captura.sql` |
| gate de admin | `supabase/migrations/20260903350000_radar_trafego_gate_admin.sql` |
| edge Meta | `supabase/functions/capturar-meta-ads-diario/index.ts` |
| edge Google | `supabase/functions/capturar-google-ads-diario/index.ts` |
| achados (PC5–PC10) | `docs/superpowers/specs/2026-09-03-motor-mapa-de-sinais-design.md` |
