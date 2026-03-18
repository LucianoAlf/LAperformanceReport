# Memoria do Projeto — LA Music Performance Report

## Indice de Arquivos
- [regras-negocio.md](regras-negocio.md) — Regras de negocio (duplicatas, pipeline, etapas, matricula, evasao, permissoes)
- [padroes-codigo.md](padroes-codigo.md) — Padroes de codigo (hooks, modais, inline edit, filtros, toasts, supabase, edge functions)
- [dominio-comercial.md](dominio-comercial.md) — Pipeline comercial, leads, funil, etapas, cards de entrada
- [dominio-alunos.md](dominio-alunos.md) — Alunos, matriculas, renovacoes, evasoes, presenca
- [dominio-operacional.md](dominio-operacional.md) — Professores, turmas, salas, metas, lojinha, administrativo
- [integracao-infra.md](integracao-infra.md) — Edge functions, pg_cron, WhatsApp CRM, UAZAPI, Gemini AI
- [emusys-api.md](emusys-api.md) — API Emusys (tokens, endpoints, convenções)
- [chatwoot.md](chatwoot.md) — Chatwoot CRM (inboxes, agentes, labels, endpoints, filtros, quirks de timezone)

## Unidades
- CG (Campo Grande): `2ec861f6-023f-4d7b-9927-3960ad8c2a92`
- Recreio: `95553e96-971b-4590-a6eb-0201d013c14d`
- Barra: `368d47f5-2d88-4475-bc14-ba084a9a348e`

## Integracoes Externas
- **Emusys**: API REST v1.1.0 em `https://api.emusys.com.br/v1/` (ver emusys-api.md)
- **n8n**: Automacoes via webhooks (leads, experimentais, matriculas)
- **UAZAPI**: WhatsApp CRM — caixas por unidade, webhooks, conversas (ver integracao-infra.md e skill `.claude/skills/uazapi-whatsapp/SKILL.md`)
- **Gemini AI**: Insights, relatorios, rankings via edge functions (ver integracao-infra.md)
- **OpenAI**: Assistente IA com function calling (Auditoria de alunos)

## Supabase
- Project ID: `ouqwbbermlzqqvtqwlul`
- 41+ edge functions ativas (ver integracao-infra.md)
- 6 pg_cron jobs (ver integracao-infra.md)

---

## Protocolo Self-Heal

**INSTRUCAO OBRIGATORIA PARA O CLAUDE:** A atualizacao da memoria e um PASSO OBRIGATORIO do workflow, nao opcional. Nao depende de comando do usuario. O Claude DEVE atualizar os arquivos de memoria automaticamente como parte natural do trabalho.

### Regra Principal
**Toda implementacao que gera commit DEVE ser seguida de atualizacao da memoria ANTES de encerrar a conversa.** Isso inclui: features novas, bug fixes significativos, novos patterns, mudancas de schema, novas edge functions, novos componentes/hooks reutilizaveis.

### Checklist Pos-Implementacao (OBRIGATORIO)
Apos cada commit ou conjunto de mudancas, perguntar-se:
1. Criei um pattern novo (hook, utility, componente)? → Atualizar `padroes-codigo.md`
2. Mudei regra de negocio ou fluxo? → Atualizar `regras-negocio.md`
3. Mudei algo no pipeline comercial/leads/funil? → Atualizar `dominio-comercial.md`
4. Mudei algo em alunos/matriculas/presenca? → Atualizar `dominio-alunos.md`
5. Mudei algo em professores/turmas/lojinha/admin? → Atualizar `dominio-operacional.md`
6. Criei/modifiquei edge function, cron job, integracao? → Atualizar `integracao-infra.md`
7. Mudei algo na API Emusys? → Atualizar `emusys-api.md`
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
