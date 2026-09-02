# Mapa do sistema — plataforma

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/plataforma.md`](../banco/detalhe/plataforma.md)

## Config (`/app/config`)
`Config/ConfigPage.tsx`. CRUD de `unidades`, `canais_origem`, `motivos_saida`, `tipos_saida`, `cursos` (flag `is_projeto_banda`), `professores`, `unidades_cursos`, destinatários de relatório, config IA/BI.
- **RPCs:** nenhuma · **Edge functions:** nenhuma direta

## Admin (`/app/admin/*`)
- **Usuários (`Admin/GerenciarUsuarios.tsx`):** edge functions `admin-create-user`, `admin-update-email`, `admin-update-password`. Perfis: `admin` | `unidade`.
- **Permissões (`Admin/PainelPermissoes/`):** RPC `usuario_perfis_lista`. Tabelas `perfis`, `permissoes`, `perfil_permissoes`, `usuario_perfis`, `audit_log`/`auditoria_acesso` (toda alteração audita).
