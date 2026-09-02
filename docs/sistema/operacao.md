# Mapa do sistema — operacao

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/operacao.md`](../banco/detalhe/operacao.md)

## Salas (`/app/salas`)
`Salas/SalasPage.tsx`; abas Ocupação, Inventário, Pendências.
- **Hooks:** nenhum customizado (lógica inline)
- **RPCs:** nenhuma · **Edge functions:** nenhuma
- **Tabelas:** `salas`, `turmas`, `inventario`, `inventario_pendencias`

## Projetos (`/app/projetos`)
`Projetos/ProjetosPage.tsx`; views Dashboard, Lista, Kanban, Calendário, Timeline, Por Pessoa, Configurações + chat IA Fábio.
- **Hooks:** `useProjetos`, `useProjeto`, `useProjetoTipos`, `useProjetoTipoFases`, `useTarefasPorPessoa`, `useToggleTarefaConcluida`
- **RPCs:** nenhuma
- **Edge functions:** `gemini-fabio-chat` (assistente IA), `projeto-alertas-whatsapp`

## Automações (`/app/automacoes`)
Saúde das automações de dados. `Automacoes/AutomacoesPage.tsx`; abas Jornadas, Feed de Eventos, Saúde dos Crons, Divergências.
- **Hooks:** `useAutomacoesData` (polling 30s), `useSaudeCrons` (polling 60s), `useDivergencias`
- **RPCs:** `get_cron_health`, `get_divergencias_alunos`
- **Edge functions:** `auditor-divergencias-emusys`
- **Tabelas:** `automacao_log`, `automacao_invariantes`

## Entrada (`/app/entrada/*`)
Formulários de lançamento manual (React Hook Form + Zod). Escrevem direto nas tabelas (sem edge/RPC).
- **FormLead** (`/entrada/lead`): escreve `leads` + `leads_automacao_log`. Status inicial `novo`/`agendado`, `etapa_pipeline_id` 1 ou 5. Hook `useCheckLeadDuplicado` (forte por telefone, fraca por nome).
- **FormMatricula** (`/matricula`): escreve `alunos` (status `ativo`, `tipo_matricula_id=1`) + `movimentacoes` (`tipo='matricula'`) + atualiza lead (`status='matriculado'`).
- **FormEvasao** (`/evasao`): atualiza `alunos` (status `inativo`) + `movimentacoes` (`tipo='evasao'`) + `evasoes`.
- **FormRenovacao** (`/renovacao`): atualiza `alunos` + `renovacoes` (status `renovado`) + `movimentacoes` (`tipo='renovacao'`).
- **RelatorioDiario** (`/relatorios/diario`): upsert `relatorios_diarios`. Lê `alunos`/`movimentacoes`/`renovacoes`.
> ⚠️ Estes forms gravam em tabelas legadas (`movimentacoes`, `renovacoes`, `evasoes`). O fluxo canônico atual usa `movimentacoes_admin` + edges Emusys. Ver `docs/MAPA-INTEGRACAO-EMUSYS.md`.

## Histórico (`/app/apresentacoes-2025`)
`Historico/Apresentacoes2025Page.tsx` — shell de abas que embute Gestão/Comercial/Retenção (apresentações 2025). Sem queries próprias.
