# Mapa de banco e reorganização da documentação — design

**Data:** 2026-09-02
**Status:** aprovado (Hugo, 02/09/2026)
**Branch:** `docs/mapa-banco-e-reorganizacao`

## Problema

A documentação do projeto cobre bem **o sistema** (páginas, métricas, regras) e
**não cobre o banco**. Medido em 02/09/2026 contra produção:

| Camada | Existe | Citado em algum `.md` | Nos 4 canônicos | Zero menção |
|---|---|---|---|---|
| Tabelas + views | 500 | 404 | 162 | **96** |
| RPCs chamadas pelo front | 159 | — | 93 | **66** |
| Edge functions | 100 | — | 76 | **24** |
| Crons (fora variantes por unidade) | 46 | 34 | — | **12** |

Volume real do banco: **378 tabelas · 122 views · 1.185 funções · 205 triggers ·
74 cron jobs (71 ativos) · 7.101 colunas · 701 FKs · 635 policies · 1.379 índices ·
536 COMMENTs**.

Três consequências concretas:

1. **Não existe documento de schema.** Nenhum `.md` lista colunas, FK, constraint
   ou RLS. `docs/ESTRUTURA-BANCO-ALUNOS.md` cobre só alunos e é de fevereiro.
2. **`src/types/database.types.ts` está morto:** 8 KB, **11 tabelas de 378**,
   gerado em 01/07. O `CLAUDE.md` o aponta como "tipos gerados pelo Supabase".
3. **As 1.185 funções não têm catálogo.** Não há como saber qual RPC é canônica —
   que é exatamente o vazio que produziu as duplicatas de renovação e a leitura
   divergente de presença (dois consumidores reimplementando a mesma regra).

Achado de segurança medido durante o levantamento: **185 funções são executáveis
por `anon`**. É a armadilha do `ALTER DEFAULT PRIVILEGES` que o `CLAUDE.md` já
descreve caso a caso; nunca havia sido contada.

Buraco de conteúdo no `docs/MAPA-SISTEMA.md`: cinco módulos vivos sem nenhuma
seção — `TrafegoPago`, `FaturasAlunos`, `AdminTools`, `Spreadsheet`, `Pages`
(rotas `/app/trafego-pago`, `/app/faturas`, `/app/relatorios/diario`, `/app/time`).

## Objetivo

Fechar os quatro buracos, com a documentação de fato mecânico **gerada do banco**
(não escrita à mão, porque é isso que apodrece) e a de conhecimento **curada e
separada** (porque nenhum script a descobre).

## Não-objetivos (decisões conscientes)

- **Não migrar as armadilhas do `CLAUDE.md` para o `NOTAS.md`.** A regra do
  projeto proíbe a mesma informação em dois lugares, e o `CLAUDE.md` é o ativo
  mais valioso do repo. O `NOTAS.md` nasce só com o que o gerador descobrir e
  aponta para o `CLAUDE.md` no resto. A migração fica para uma rodada 2, com
  decisão explícita do Hugo.
- **Não criar verificação no CI.** Exigiria credencial de banco no CI. Regenerar
  entra no checklist de quem mexe em migration.
- **Não criar a pasta `rules/`.** É outra frente; misturar aumenta o raio da
  mudança sem necessidade.
- **Não reescrever o conteúdo existente do `MAPA-SISTEMA.md`** além de
  redistribuir e preencher o que falta.

## Vocabulário de domínios

Oito domínios, usados igualmente pelo mapa de sistema, pelo detalhe de banco e
pelo catálogo de funções — para que "onde está X" tenha sempre a mesma resposta.

| Domínio | Abrange |
|---|---|
| `aluno` | Alunos, Sucesso do Aluno, Retenção, Bandas, anamnese, pesquisa de evasão, risco |
| `comercial` | Comercial, Pré-Atendimento, Campanhas, Tráfego Pago, leads, experimentais |
| `professor` | Professores, Agenda, Health Score V3, LA Teacher (`fabio_*`), presença |
| `financeiro` | Administrativo, Faturas, Fechamento mensal, caixa da Sol, Super Folha |
| `gestao` | Dashboard, Gestão Mensal, Metas, Relatórios, KPIs, `dados_mensais` |
| `operacao` | Salas, Projetos, Time, Automações, Entrada, Lojinha, inventário |
| `plataforma` | Config, Admin, Auth, RBAC, auditoria, permissões |
| `integracao` | Edge functions, crons, Emusys, WhatsApp/UAZAPI, Chatwoot, n8n, Meta |

A classificação vive em `scripts/mapa-banco/areas.json` (curado, versionado), com
regras por prefixo e uma lista de exceções nominais. Objeto sem domínio cai em
`outros` **e o gerador emite aviso** com o nome — falha diagnosticável, nunca
sumiço silencioso.

## Artefatos

```
docs/banco/
  README.md              índice do banco e como regenerar
  TABELAS.gerado.md      1 linha por tabela/view (500 linhas) — legível inteiro
  FUNCOES.gerado.md      1 linha por função (1.185), agrupada por domínio
  detalhe/<dominio>.md   colunas, tipos, FK, índices, RLS, COMMENT (8 arquivos)
  NOTAS.md               curado — só o que tem pegadinha

docs/sistema/<dominio>.md   8 arquivos: rotas, componentes, hooks, RPCs, edges, crons
docs/MAPA-SISTEMA.md        vira índice (caminho preservado)

scripts/gerar-mapa-banco.mjs
scripts/mapa-banco/areas.json
```

Todo arquivo `*.gerado.md` abre com um cabeçalho:

```
<!-- GERADO POR scripts/gerar-mapa-banco.mjs — NÃO EDITE À MÃO.
     Banco: <project-ref> · Gerado em: <data> · Commit: <sha> -->
```

## O gerador

**Conexão:** `pg` como devDependency, credenciais `SUPABASE_DB_*` já presentes no
`.env.local` (host, porta, user e senha conferidos em 02/09). Se a conexão direta
falhar — `db.*.supabase.co` pode ser IPv6-only —, cai para o pooler
(`supabase/.temp/pooler-url`). Falha de conexão aborta com mensagem dizendo qual
host foi tentado e qual erro voltou; nunca escreve arquivo parcial.

**Extrai, para tabelas e views:** colunas (tipo, nullable, default, identidade),
PK, FKs com destino, índices únicos, RLS (ativa? nº de policies), `COMMENT ON`,
contagem aproximada de linhas (`pg_class.reltuples`), triggers e consumidores.

**Extrai, para funções:** assinatura, `SECURITY DEFINER`/`INVOKER`, ACL
(destacando `anon`), tipo de retorno, se é função de trigger, e consumidores.

**Consumidores** são resolvidos cruzando seis fontes: chamadas `.rpc()` em `src/`,
código das edge functions em `supabase/functions/`, corpo das demais funções,
definição das views, `cron.job.command` e `pg_trigger`.

**Saída determinística:** ordenação estável e formatação fixa, para que
`git diff` entre duas execuções mostre apenas o que mudou no banco. O carimbo de
data no cabeçalho tornaria todo arquivo sujo a cada execução, então o gerador
compara o corpo novo com o do arquivo existente e **só reescreve quando o corpo
mudou** — arquivo sem mudança conserva a data da última alteração real, que é a
informação útil.

**Comando:** `npm run mapa:banco`.

## Classificação de funções

Estado derivado de sinal objetivo, nunca de opinião:

| Estado | Critério |
|---|---|
| **ATIVA** | tem consumidor vivo (front, edge, cron, trigger, view) |
| **SÓ-INTERNA** | chamada apenas por outra função |
| **ÓRFÃ** | zero consumidor — candidata a morta |
| **LEGADO** | existe versão maior do mesmo nome-base (`_v1` com `_v3` vivo) |
| 🔓 **ANON** | executável por `anon` (185 hoje) — marca ortogonal às demais |

ÓRFÃ é **sinal, não veredito**: a função pode ser chamada por consumidor que o
gerador não enxerga (n8n, script na VPS, PostgREST direto). O catálogo diz "sem
consumidor conhecido", nunca "pode apagar".

## Reorganização do MAPA-SISTEMA

`docs/MAPA-SISTEMA.md` passa a ser índice: rota → domínio → arquivo. O caminho é
preservado porque 30+ arquivos apontam para ele (CLAUDE.md, 2 skills, specs,
daily-notes). Cada `docs/sistema/<dominio>.md` recebe, por rota: componentes,
hooks, RPCs, edge functions, crons e armadilhas.

Na redistribuição, preencher o que falta: os 5 módulos ausentes, as 24 edge
functions e os 12 crons sem menção.

## database.types.ts

Regenerado com `supabase gen types typescript --linked` (11 → 378 tabelas).
Rodar `tsc --noEmit` antes e depois e reportar o delta de erros: tipagem que hoje
não existe pode acender erro em código que passa por omissão. Se o delta for
grande, o arquivo é entregue em commit separado, para o Hugo decidir.

## Riscos

| Risco | Mitigação |
|---|---|
| Conexão direta IPv6-only falha | Fallback para o pooler; erro explícito com host tentado |
| `database.types.ts` acende erros de TS | Medir delta com `tsc --noEmit`; commit separado se grande |
| Quebrar referências ao `MAPA-SISTEMA.md` | Caminho preservado como índice; verificar links após a divisão |
| Domínio mal escolhido para um objeto | `areas.json` é editável e o gerador avisa sobre `outros` |
| Doc gerado apodrecer como o `database.types.ts` | Cabeçalho com data e commit; regenerar no checklist de migration |

## Critérios de aceite

1. `npm run mapa:banco` roda ponta a ponta e reescreve os arquivos gerados.
2. Rodar duas vezes seguidas sem mexer no banco produz `git diff` vazio.
3. As 500 tabelas/views e as 1.185 funções aparecem no catálogo, cada uma com
   domínio e — no caso das funções — estado e consumidores.
4. Nenhum objeto cai em `outros` sem estar listado no aviso do gerador.
5. `docs/MAPA-SISTEMA.md` continua existindo e resolve para todos os domínios.
6. Os 5 módulos, 24 edges e 12 crons hoje ausentes passam a ter menção.
7. `database.types.ts` cobre as 378 tabelas e o delta de `tsc --noEmit` está
   reportado.
