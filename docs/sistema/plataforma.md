# Mapa do sistema — plataforma

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/plataforma.md`](../banco/detalhe/plataforma.md)

## Config (`/app/config`)
`Config/ConfigPage.tsx`. CRUD de `unidades`, `canais_origem`, `motivos_saida`, `tipos_saida`, `cursos` (flag `is_projeto_banda`), `professores`, `unidades_cursos`, destinatários de relatório, config IA/BI.
- **RPCs:** nenhuma · **Edge functions:** nenhuma direta

## Admin (`/app/admin/*`)
- **Usuários (`Admin/GerenciarUsuarios.tsx`):** edge functions `admin-create-user`, `admin-update-email`, `admin-update-password`. Perfis: `admin` | `unidade`.
- **Permissões (`Admin/PainelPermissoes/`):** RPC `usuario_perfis_lista`. Tabelas `perfis`, `permissoes`, `perfil_permissoes`, `usuario_perfis`, `audit_log`/`auditoria_acesso` (toda alteração audita).

## Ferramentas administrativas (`AdminTools`)

`AdminToolsHub.tsx` — hub interno que reúne ferramentas de admin, entre elas o
**Assistente IA**. Não tem rota própria no `router.tsx`: é montado dentro de outras
telas de admin.

## Rotas sem página real

| Rota | Situação |
|---|---|
| `/app/relatorios` | **`PlaceholderPage`** — a rota existe e não há tela por trás |

⚠️ `src/components/App/Pages/HomePage.tsx` **não tem consumidor** em todo o `src/`:
código morto, não uma página viva.
