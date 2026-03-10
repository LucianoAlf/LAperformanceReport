# LA Music Performance Report

Sistema de gestão operacional e BI para rede de escolas de música. Pipeline comercial, gestão de alunos, metas, retenção, professores, salas e projetos.

## Stack

- **Frontend:** React 19 + TypeScript 5.8 + Vite 6 (porta 5175)
- **Styling:** Tailwind CSS (dark mode via `class`) + Radix UI + Lucide icons + CVA
- **Backend:** Supabase (PostgreSQL + Auth + RLS + Storage + RPC)
- **IA:** OpenAI API (assistente com function calling)
- **Automação:** n8n (webhooks)
- **Routing:** React Router 7 (lazy loading por rota)
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Datas:** date-fns

## Estrutura

```
src/
├── components/App/     # Páginas por domínio (Comercial, Alunos, Auditoria, etc.)
├── components/ui/      # ~50 componentes reutilizáveis (shadcn/Radix)
├── hooks/              # 30+ hooks de data fetching e lógica de negócio
├── contexts/           # AuthContext, OnboardingContext, PageTitleContext
├── lib/                # Utilitários (supabase client, formatters, simuladores)
│   └── supabase.ts     # Client Supabase — todas operações de banco passam por aqui
├── types/              # TypeScript types (database.types.ts gerado pelo Supabase)
└── router.tsx          # Rotas com lazy loading
```

Path alias: `@/` = `./src/`

## Convenções

- **Componentes:** PascalCase, funcionais com hooks
- **Hooks:** prefixo `use`, camelCase (ex: `useKPIsComercial`)
- **Styling:** Tailwind utilities, `cn()` de `lib/utils.ts` para merge de classes
- **Estado global:** Context API (sem Redux/Zustand)
- **Data fetching:** hooks customizados com Supabase direto (sem React Query)
- **Formulários:** React Hook Form + Zod para validação
- **Toasts:** Sonner (`toast.success()`, `toast.error()`)
- **Idioma:** variáveis, funções e comentários em português

## Auth e Permissões

- Supabase Auth (email/password)
- `AuthContext` gerencia sessão, perfil e permissões
- Perfis: admin, unidade + permissões granulares por código
- RLS ativo no banco de dados
- Funções úteis: `hasPermission(codigo)`, `canViewConsolidated()`, `canManageUsers()`

## Banco de Dados

- PostgreSQL via Supabase
- Tabelas principais: `unidades`, `alunos`, `leads`, `matriculas`, `renovacoes`, `evasoes`, `professores`, `turmas`, `cursos`, `dados_mensais`, `metas`
- RPC functions para queries complexas (ex: `get_kpis_consolidados`)
- Tipos gerados: `src/types/database.types.ts`

## Integrações

- **OpenAI:** assistente IA em `src/components/App/Alunos/Auditoria/` (agent tools, function calling)
- **n8n:** automações via webhooks (leads, aulas experimentais)
- **WhatsApp (UAZAPI):** pré-atendimento de leads

## Variáveis de Ambiente

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...  # opcional
```

## Regras Importantes

- **Timezone:** BRT (UTC-3) — sempre usar offset ao trabalhar com datas do negócio
- **Banco:** todas operações passam pelo client em `src/lib/supabase.ts`
- **Estado:** não usar Redux ou state managers externos — preferir hooks + Context
- **Hooks:** preferir hooks customizados para lógica de negócio reutilizável
- **MCP (OBRIGATÓRIO):** Sempre utilize ferramentas MCP proativamente para análise e investigação. Antes de explorar código manualmente, verifique se há um MCP disponível que facilite a tarefa (ex: Supabase MCP para consultar banco, n8n MCP para verificar workflows, NocoDB MCP para dados). MCPs são a via preferencial para acessar dados reais do sistema — use-os ANTES de ler código fonte quando precisar entender estado atual do banco, schemas, dados ou configurações.
- **Memória Self-Heal:** manter arquivos em `.claude/memory/` atualizados proativamente. Ao descobrir regras de negócio, padrões de código ou mudanças no domínio, atualizar o arquivo de memória correspondente e informar o usuário. Ver protocolo completo em `MEMORY.md`.
## Skills

Ao trabalhar com agentes IA ou function calling, consulte `.claude/skills/ai-agents-architect/SKILL.md`
Ao trabalhar com LLMs, RAG ou integrações IA, consulte `.claude/skills/ai-engineer/SKILL.md`
Ao trabalhar com schema, queries ou migrations, consulte `.claude/skills/database-design/SKILL.md`
Ao trabalhar com WhatsApp, UAZAPI ou webhooks, consulte `.claude/skills/uazapi-whatsapp/SKILL.md`
