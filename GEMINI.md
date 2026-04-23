# Gemini Context — LA Music Performance Report

Este arquivo contém instruções fundamentais para o Gemini CLI atuar neste projeto.

## 🚀 Inicialização Obrigatória
Sempre que iniciar uma sessão, carregue o contexto lendo os seguintes arquivos:
1. `CLAUDE.md` (Stack e Estrutura)
2. `docs/PRD.md` (Regras de Negócio e KPIs)
3. `.claude/memory/MEMORY.md` (Índice de memórias do projeto)

## 📌 Informações Críticas
- **Timezone:** BRT (UTC-3) para todas as datas de negócio.
- **IDs das Unidades:**
  - CG (Campo Grande): `2ec861f6-023f-4d7b-9927-3960ad8c2a92`
  - Recreio: `95553e96-971b-4590-a6eb-0201d013c14d`
  - Barra: `368d47f5-2d88-4475-bc14-ba084a9a348e`
- **Stack:** React 19 + Vite + Tailwind + Supabase (PostgreSQL).

## 🛠️ Regras de Ouro
- **MCP Primeiro:** Sempre use as ferramentas MCP do Supabase para consultar o banco antes de assumir estados ou schemas.
- **Não Duplicar:** Verifique `src/hooks/` e `src/components/ui/` antes de criar novas funcionalidades para evitar duplicatas.
- **Surgical Edits:** Use a ferramenta `replace` para edições precisas, mantendo o estilo e idioma (Português-BR) do código.
- **Memória:** Siga o protocolo de atualização de memória em `.claude/memory/MEMORY.md` após implementações significativas.

## 📂 Estrutura de Memória (Documentação Interna)
- `.claude/memory/regras-negocio.md` — Pipeline, Churn, Matriculas.
- `.claude/memory/padroes-codigo.md` — Hooks, Modais, Inline Edit.
