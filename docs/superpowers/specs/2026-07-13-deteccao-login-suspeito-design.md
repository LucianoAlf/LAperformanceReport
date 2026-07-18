# Detecção de Login / Acesso Suspeito — Design

**Data:** 2026-07-13
**Status:** Design aprovado, aguardando plano de implementação
**Contexto:** Pós-incidente de segurança 2026-06-30 (~55 tabelas abertas ao `anon` + tokens vazados). O sistema hoje não tem nenhuma detecção de acesso anômalo. Objetivo: alertar Hugo + Luciano quando alguém logar de forma suspeita.

---

## 1. Escopo e não-escopo

**Dois sistemas independentes, com fontes de dado diferentes** (a arquitetura da Supabase obriga essa separação — ver §2):

- **Sistema 1 — Login de staff no app.** Detecta funcionário logando no LA Performance Report de IP/dispositivo novo ou em "viagem impossível" (credencial de staff vazada/reutilizada).
- **Sistema 2 — Conexão direta no Postgres.** Detecta alguém conectando direto no banco com senha/`service_role` vazado, contornando PostgREST e RLS (o cenário do incidente).

**Fora de escopo (decisão explícita):**
- **Força bruta / tentativas de senha falhas.** O evento de login falho não passa pelo caminho de captura do Sistema 1 (ver §3.1) e exigiria acesso ao log do GoTrue. O Supabase Auth já tem rate-limit nativo de tentativas. Fica para uma fase futura.
- **Log Drains pagos.** Ler o log de conexão do Postgres de forma contínua exigiria um Log Drain (~US$60/mês, plano Team). O Sistema 2 usa uma alternativa grátis (snapshot de `pg_stat_activity`).
- Bloqueio automático de acesso. Ambos os sistemas **só alertam**, não bloqueiam — evita travar acesso legítimo por falso positivo.

---

## 2. Descoberta técnica que define a arquitetura

Levantamento ao vivo de `pg_stat_activity` (2026-07-13):

| Origem | `usename` | `application_name` | `client_addr` |
|---|---|---|---|
| App / staff (via PostgREST) | `authenticator` | `postgrest` | `::1` (localhost) |
| Agentes VPS (Sol, Mila, Lia, Fábio) | `*_acesso_restrito` | `Supavisor` | IP interno do **pooler** |
| Realtime / mgmt-api / exporter | `supabase_admin` / `postgres` | `realtime_*`, `mgmt-api`, `postgres_exporter` | IPs internos Supabase |

Consequências:

1. **`log_connections` não distingue qual funcionário logou no app.** Todo o tráfego do app é uma pool compartilhada `authenticator` vinda de `::1`. Logo, **detecção de login de staff tem que ser na camada de aplicação/Auth, não no log de conexão** → Sistema 1.
2. **Os agentes da VPS passam pelo pooler (Supavisor)**, aparecendo com o IP interno do pooler — não com o IP real da VPS. Isso é uma vantagem: uma conexão *genuinamente direta* (psql/DBeaver/CLI em modo session) se destaca por **não** ser Supavisor/interno → Sistema 2.
3. **Ler o log de conexão por programa é caro/frágil.** O endpoint de logs retorna só ~24h, é dominado por ruído de cron e trunca. Consumo contínuo exigiria Log Drain pago. Por isso o Sistema 2 usa **snapshot de `pg_stat_activity`** (grátis, expõe `client_addr` + `application_name` ao vivo).
4. `auth.audit_log_entries` está **vazia (0 linhas)** — não é fonte confiável. Sistema 1 não depende dela.

---

## 3. Sistema 1 — Login de staff

### 3.1 Captura

Ponto de captura: [`AuthContext.tsx`](../../../src/contexts/AuthContext.tsx) já tem `supabase.auth.onAuthStateChange`. No evento `SIGNED_IN`, disparar **fire-and-forget** uma chamada à edge `registrar-login`.

```
onAuthStateChange((event, session) => {
  ...
  if (event === 'SIGNED_IN' && session?.user) {
    // fire-and-forget — NUNCA await, NUNCA bloquear o login
    supabase.functions.invoke('registrar-login', {
      body: { evento: 'login' }
    }).catch(() => {}) // falha de captura é silenciosa
  }
})
```

Por que client-side e não Auth Hook / trigger:
- O hook de token do GoTrue não entrega IP/user-agent limpos.
- `auth.audit_log_entries` está vazia (não confiável).
- O `SIGNED_IN` → edge é o único caminho que entrega **IP real do cliente** (via `x-forwarded-for` do request HTTP à edge) e **não depende do plano**.

Limitação assumida: um atacante que reutiliza um JWT roubado (sem "logar" pelo formulário) não dispara `SIGNED_IN`. O alvo aqui é **login com senha vazada** (pessoa digitando a senha no formulário real), que é o vetor mais provável para credencial de staff.

### 3.2 Edge `registrar-login`

`verify_jwt: true` (só usuário autenticado chama; o JWT identifica quem é).

1. Extrai `auth_user_id` do JWT (`sub`).
2. Extrai `ip = x-forwarded-for` (primeiro IP) e `user_agent` dos headers do request.
3. Resolve o usuário: `SELECT id, nome, telefone, perfil, unidade_id FROM usuarios WHERE auth_user_id = <sub>`.
4. Grava em `auditoria_acesso` (tabela existente): `acao='login'`, `usuario_id`, `usuario_nome`, `ip_address`, `user_agent`, `detalhes` (jsonb com `auth_user_id`, `email`, geo resolvido).
5. Roda as regras (§3.3) comparando com o histórico do **mesmo `usuario_id`** em `auditoria_acesso` (`acao='login'`).
6. Se alguma regra disparar → alerta (§5).

Toda a lógica é resiliente: qualquer erro é logado e engolido (nunca propaga pro cliente).

### 3.3 Regras de avaliação

**Regra A — Localização anômala (por país, não por IP):**
```
geo_atual = geo-IP do ip atual (país/cidade/lat/long)
SE geo_atual.país != 'Brasil' (BR) → flag 'pais_estrangeiro'
```
Decisão de sensibilidade (2026-07-13, escolha do Hugo): **alerta só quando o login vem de fora do Brasil** — não por `/24` novo, não por cidade/estado. Motivo: funcionário trocando de wifi/4G, notebook novo, ou viajando dentro do Brasil = **zero alerta** (é o caso comum e não é ameaça); credencial de staff vazada quase sempre loga de fora do país. O `user_agent` (dispositivo) entra só como detalhe informativo no alerta, **nunca dispara sozinho**. Trocar de dispositivo na mesma rede/país = silêncio.

Todos os logins (inclusive nacionais) são gravados em `auditoria_acesso` com a geo resolvida — o histórico serve à Regra B e a futuras análises. Só o **alerta** é restrito a país estrangeiro.

**Regra B — Viagem impossível (geo-velocity):**
```
ultimo = login anterior mais recente desse usuario_id (com geo)
geo_atual = geo-IP do ip atual  (lat/long/cidade/país)
SE ultimo tem geo:
  dist_km = haversine(geo_atual, geo_ultimo)
  horas   = (agora - ultimo.created_at) em horas
  velocidade = dist_km / max(horas, 0.05)
  SE velocidade > 900 km/h → flag 'viagem_impossivel'
```
Geo-IP via serviço externo grátis (ex. `ip-api.com`, sem chave, ~45 req/min — folgado para volume de staff), usado **tanto pela Regra A quanto pela B**. **Nota de privacidade:** o IP do funcionário é enviado a um serviço externo para geo-resolução; aceitável (IP não é dado sensível de terceiro), documentar.

### 3.4 Dados

Reaproveita `auditoria_acesso` (já tem `ip_address`, `user_agent`, `detalhes` jsonb, `usuario_id`, `usuario_nome`, `created_at`). Nenhuma coluna nova. `acao='login'`; a geo resolvida vai no `detalhes` para a Regra B não re-consultar o geo-IP do histórico.

---

## 4. Sistema 2 — Conexão direta no Postgres

### 4.1 Captura

Cron (edge `varredura-conexoes`, a cada 5 min) chama uma RPC `snapshot_conexoes_suspeitas()` (`SECURITY DEFINER`, só `service_role`) que lê `pg_stat_activity`.

### 4.2 Filtro

Uma conexão é **suspeita** quando **todas** valem:
```
backend_type = 'client backend'
E application_name NÃO em (conhecidos internos):
    'postgrest', 'Supavisor', 'Supavisor (auth_query)',
    'realtime_*', 'mgmt-api', 'postgres_exporter', 'pg_cron', '' (checkpointer etc.)
E client_addr NÃO em (lista branca):
    ::1, IPs internos Supabase (realtime/mgmt), IP(s) do pooler,
    + IPs configurados como esperados (§4.4)
E usename em (roles privilegiados): 'postgres', 'service_role', 'supabase_admin'
    (conexão direta com role restrito de agente é menos crítica; foco no privilégio)
```
Discriminar por **`application_name` + `client_addr` juntos** — um psql/DBeaver/CLI direto carrega `application_name` próprio (ou vazio), diferente dos internos.

### 4.3 Dedup e alerta

Uma sessão persistente ficaria visível em vários snapshots → não realertar a cada 5 min. Tabela nova `conexoes_suspeitas`:
```
id, pid, backend_start, usename, client_addr, application_name,
primeiro_visto, ultimo_visto, alertado_em, resolvido
```
Chave lógica = `(pid, backend_start)`. Alerta **uma vez** por sessão nova; atualiza `ultimo_visto` nas repetições.

**Limitação assumida:** o snapshot pega **sessão ativa no instante da foto**. Uma conexão relâmpago (abre, roda, fecha entre duas fotos de 5 min) pode escapar. Cobre o caso real "sessão aberta com credencial vazada". Se um dia precisar de cobertura total → Log Drain pago.

### 4.4 Lista branca / config

Tabela `seguranca_config` (1 linha, jsonb) ou secrets da edge:
- `ips_esperados`: IPs que conectam direto de propósito (a confirmar se Hugo/Luciano/n8n usam CLI em modo session direto — se for via pooler, a lista pode ficar vazia).
- `destinatarios_alerta`: telefones (Hugo, Luciano).
- `ativo`: kill switch (começa ligado).

---

## 5. Alerta (compartilhado)

Ambos os sistemas alertam via **WhatsApp (UAZAPI)**, reaproveitando o padrão das edges `notificar-*` existentes. Destinatários: Hugo + Luciano (config, não hardcoded).

Formato:
- **Sistema 1:** `⚠️ Login suspeito: <nome> — <cidade/país> (IP <ip>, <dispositivo>) às <hora BRT>. Motivo: <pais_estrangeiro | viagem_impossivel>.`
- **Sistema 2:** `🚨 Conexão direta ao banco: role <usename> de <client_addr> (<application_name>) desde <hora BRT>.`

Throttle: Sistema 1 alerta por evento; Sistema 2 alerta 1×/sessão (§4.3).

---

## 6. Componentes (resumo)

| Componente | Tipo | Sistema |
|---|---|---|
| `AuthContext.tsx` (hook `SIGNED_IN`) | Front | 1 |
| `registrar-login` | Edge (`verify_jwt:true`) | 1 |
| `auditoria_acesso` (reuso) | Tabela | 1 |
| `snapshot_conexoes_suspeitas()` | RPC (`SECURITY DEFINER`) | 2 |
| `varredura-conexoes` | Edge + cron 5 min | 2 |
| `conexoes_suspeitas` | Tabela nova | 2 |
| `seguranca_config` | Tabela nova (config + kill switch) | 1 e 2 |
| Envio de alerta WhatsApp | Edge/módulo UAZAPI (reuso) | 1 e 2 |

---

## 7. Tratamento de erro

- **Captura de login nunca bloqueia o login** — fire-and-forget no front, `.catch(()=>{})`; edge engole exceções.
- **Geo-IP externo pode falhar/estar rate-limited** — geo é central para as duas regras. Se falhar, grava o login sem geo e **não alerta** (fail-open: melhor perder uma detecção rara do que gerar alerta cego). Volume de staff é baixo, rate-limit improvável.
- **Snapshot com muitas conexões** — filtro roda no banco (RPC), retorna só as suspeitas; volume ínfimo.
- **Falha de envio WhatsApp** — logar, não travar o resto; opcional: retry simples.

---

## 8. Testes

- **Sistema 1 / Regra A:** logar via VPN de país estrangeiro → alerta `pais_estrangeiro`. Logar de outro dispositivo/rede no Brasil (4G, notebook novo, outra cidade) → **sem alerta**, mas gravado com geo. Geo-IP indisponível → sem alerta (fail-open).
- **Sistema 1 / Regra B:** inserir manualmente em `auditoria_acesso` um login "de Moscou há 20 min" e logar do Rio → alerta `viagem_impossivel`.
- **Sistema 2:** conectar via psql/DBeaver direto (porta 5432, session) com role privilegiado de um IP fora da lista → alerta em ≤5 min. Rodar 2 snapshots → só 1 alerta (dedup). Conexão via pooler/app → sem alerta.

---

## 9. Questões abertas

1. **Modo de conexão de Hugo/Luciano/n8n/VPS** — CLI em session direto (porta 5432) ou pooler? Define se `ips_esperados` precisa de conteúdo. A verificar antes de ligar o Sistema 2 em produção (senão, primeiro alerta pode ser vocês mesmos).
2. **Confirmar retenção/rotação de `auditoria_acesso`** — a Regra A olha 90 dias; garantir que a tabela não é limpa antes disso.
3. **Estabilidade do IP do pooler** — se o `client_addr` do Supavisor rotacionar, preferir discriminar por `application_name='Supavisor'` (já contemplado no filtro §4.2) em vez de fixar o IP.
