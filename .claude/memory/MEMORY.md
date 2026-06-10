# Memoria do Projeto — LA Music Performance Report

## Indice de Arquivos
- [regras-negocio.md](regras-negocio.md) — Regras de negocio (duplicatas, pipeline, etapas, matricula, evasao, vinculo professor↔aluno, permissoes)
- [metricas.md](metricas.md) — Fórmulas canônicas das KPIs (carteira, saldo líquido, score, conversão, ticket, churn, LTV, renovação)
- [padroes-codigo.md](padroes-codigo.md) — Padroes de codigo (hooks, modais, inline edit, filtros, toasts, supabase, edge functions)
- [dominio-comercial.md](dominio-comercial.md) — Pipeline comercial, leads, funil, etapas, cards de entrada
- [dominio-alunos.md](dominio-alunos.md) — Alunos, matriculas, renovacoes, evasoes, presenca
- [dominio-operacional.md](dominio-operacional.md) — Professores (schema multi-unidade + sync), turmas, salas, metas, lojinha, administrativo
- [integracao-infra.md](integracao-infra.md) — Edge functions, pg_cron, WhatsApp CRM, UAZAPI, Gemini AI
- [emusys-api.md](emusys-api.md) — API Emusys (tokens, endpoints, convenções, webhooks)
- [chatwoot.md](chatwoot.md) — Chatwoot CRM (inboxes, agentes, labels, endpoints, filtros, quirks de timezone)
- [modulo-saude-automacoes.md](modulo-saude-automacoes.md) — Monitoramento de webhooks Emusys (edge auditor, helper invariantes, automacao_log/invariantes, frontend)
- [governanca-dados-mensais-design-2026-06-07.md](governanca-dados-mensais-design-2026-06-07.md) — Governança de mês fechado (P0.0 do Alf). Seção 0-REAL = estado implementado: tabela `competencias_mensais`, trava `assert_competencia_aberta`, Maio/2026 fechado, 2 buracos de trava abertos (snapshot + trigger sync_evasao)
- [todos-pendentes.md](todos-pendentes.md) — Problemas conhecidos sem fix aplicado (priorizados por severidade)
- [pendencias-emusys.md](pendencias-emusys.md) — Limitações do lado do Emusys (API/cadastro) que não podem ser resolvidas no nosso código
- [mapa-metricas-fluxos.md](mapa-metricas-fluxos.md) — Mapa completo: quais dados cada tela consome, fontes (view/RPC/tabela/hook), cálculos banco vs frontend, bugs conhecidos de filtro

## Unidades
- CG (Campo Grande): `2ec861f6-023f-4d7b-9927-3960ad8c2a92`
- Recreio: `95553e96-971b-4590-a6eb-0201d013c14d`
- Barra: `368d47f5-2d88-4475-bc14-ba084a9a348e`

## Integracoes Externas
- **Emusys**: API REST v1.1.2 em `https://api.emusys.com.br/v1/` (ver emusys-api.md)
- **n8n**: Automacoes via webhooks (leads, experimentais, matriculas)
- **UAZAPI**: WhatsApp CRM — caixas por unidade, webhooks, conversas (ver integracao-infra.md e skill `.claude/skills/uazapi-whatsapp/SKILL.md`)
- **Gemini AI**: Insights, relatorios, rankings via edge functions (ver integracao-infra.md)
- **OpenAI**: Assistente IA com function calling (Auditoria de alunos)

## Supabase
- Project ID: `ouqwbbermlzqqvtqwlul`
- 42+ edge functions ativas (ver integracao-infra.md)
- 9 pg_cron jobs (ver integracao-infra.md)
- Tabelas de auditoria: `automacao_log` (extendida com status/lead_id/payload_bruto/idempotency_key) + `automacao_invariantes` (nova, 1 linha por regra violada com soft visto_em)

---

## Protocolo Self-Heal

**INSTRUCAO OBRIGATORIA PARA O CLAUDE:** A atualizacao da memoria e um PASSO OBRIGATORIO do workflow, nao opcional. Nao depende de comando do usuario. O Claude DEVE atualizar os arquivos de memoria automaticamente como parte natural do trabalho.

### Regra Principal
**Toda implementacao que gera commit DEVE ser seguida de atualizacao da memoria ANTES de encerrar a conversa.** Isso inclui: features novas, bug fixes significativos, novos patterns, mudancas de schema, novas edge functions, novos componentes/hooks reutilizaveis.

### Checklist Pos-Implementacao (OBRIGATORIO)
Apos cada commit ou conjunto de mudancas, perguntar-se:
1. Criei um pattern novo (hook, utility, componente)? → Atualizar `padroes-codigo.md`
2. Mudei regra de negocio ou fluxo? → Atualizar `regras-negocio.md`
3. Mudei fórmula de KPI/métrica ou descobri implementação divergente? → Atualizar `metricas.md`
4. Mudei algo no pipeline comercial/leads/funil? → Atualizar `dominio-comercial.md`
5. Mudei algo em alunos/matriculas/presenca? → Atualizar `dominio-alunos.md`
6. Mudei algo em professores/turmas/lojinha/admin? → Atualizar `dominio-operacional.md`
7. Criei/modifiquei edge function, cron job, integracao? → Atualizar `integracao-infra.md`
8. Mudei algo na API Emusys? → Atualizar `emusys-api.md`
Se QUALQUER resposta for sim, atualizar o arquivo correspondente imediatamente.

### Outros Gatilhos
- **Usuario comunica regra nova ou alterada**
- **Usuario corrige o Claude** → atualizar a regra errada
- **Descoberta significativa ao explorar codigo** — padrao nao documentado
- **Mudanca em schema/migration**
- **Usuario pede explicitamente** — "lembre disso", "anote isso"

### Como Atualizar
1. Identificar qual arquivo deve ser atualizado (usar Grep no diretorio memory/ se incerto)
2. Verificar se a informacao ja existe (evitar duplicatas)
3. Editar o arquivo correto: adicionar, corrigir ou remover a entrada
4. Informar brevemente: "Memoria atualizada: [arquivo] — [o que mudou]"

### Regras
- Nunca duplicar informacao entre arquivos
- Bullet points concisos (1-2 linhas max)
- Incluir paths de arquivos quando util
- Remover regras obsoletas ao encontra-las
- MEMORY.md deve ficar < 200 linhas (truncado alem disso)
- Nao salvar estado temporario de sessao — apenas conhecimento permanente
