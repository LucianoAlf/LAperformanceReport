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

## Time (`/app/time`)

Cadastro de colaboradores e ficha de pessoa.

- **Componentes:** `TimePage.tsx`, `FichaColaborador.tsx` (inclui o bloco "Minha carreira na música" para o departamento Professores), `ModalAdicionarPessoa.tsx`
- **RPCs:** `criar_ficha_pessoa`
- **Edge functions:** `ficha-tecnica` (ficha pública por token: diagnóstico + Rider + carreira), `ficha-emitir-token` (emite/consulta o link da ficha)
- **Tabelas:** `colaboradores`, `colaborador_rider`, `colaborador_rider_versoes`,
  `colaborador_carreira`, `colaborador_carreira_versoes`,
  `staff_unidade`
- **Leitura externa:** `mike_professores_carreira_v1` (agente Mike — sem telefone, sem e-mail e sem o perfil comportamental)
- **Bloco "Minha carreira na música" (2026-10-09):** só para o cargo PROFESSOR; quem já respondeu a ficha abre o mesmo link de token direto no bloco novo (`resolver` devolve `mostra_carreira`), quem não respondeu recebe a ficha inteira. A ficha no app reexibe o link para reenvio quando a pessoa já respondeu.

## Planilha editável (componente compartilhado)

`src/components/App/Spreadsheet/` não é rota — é a grade editável (célula, dropdown,
autocomplete, `useSpreadsheetData`) reusada por **Auditoria de alunos**,
**Importar alunos**, **Planilha Comercial**, **Planilha de Retenção** e
**Snapshot diário**. Mexer aqui atinge as cinco telas.
