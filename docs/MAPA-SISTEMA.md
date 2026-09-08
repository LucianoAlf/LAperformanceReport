# Mapa do Sistema — LA Music Performance Report

> **Propósito:** guia de referência rápida. Para cada página: rota, componentes, hooks, **RPCs** (funções do Postgres) e **edge functions** que ela usa. Consulte aqui antes de mexer numa página para entender de onde vêm os dados.
>
> **Manutenção (obrigatória):** ao criar/alterar uma página, hook, RPC ou edge function, **atualizar o arquivo do domínio no mesmo commit**. Critérios de cálculo de métricas ficam em [`docs/METRICAS.md`](./METRICAS.md). Ciclo Emusys em [`docs/MAPA-INTEGRACAO-EMUSYS.md`](./MAPA-INTEGRACAO-EMUSYS.md). Schema, RPCs e estado das funções em [`docs/banco/README.md`](./banco/README.md).

Este arquivo é o **índice**. O conteúdo mora em `docs/sistema/<domínio>.md`, no
mesmo vocabulário de oito domínios do [mapa do banco](./banco/README.md) — assim
"onde está X" tem sempre a mesma resposta nas duas metades da documentação.

Atualização de 08/09/2026: a página Alunos passou a receber inadimplência dentro
da leitura financeira única; a reconstrução histórica de professores passou a
usar partições menores, microlotes e orçamento global. Evidências, tempos e o
timeout ainda aberto do relatório de coordenação estão em
[`docs/auditorias/2026-09-08-rpcs-telas-e-timeouts.md`](./auditorias/2026-09-08-rpcs-telas-e-timeouts.md).

## Por domínio

| Domínio | Cobre | Arquivo | Banco |
|---|---|---|---|
| **aluno** | Alunos, Sucesso do Aluno, Retenção, Bandas | [sistema/aluno.md](sistema/aluno.md) | [detalhe/aluno.md](banco/detalhe/aluno.md) |
| **comercial** | Comercial, Pré-Atendimento, Campanhas, Tráfego Pago | [sistema/comercial.md](sistema/comercial.md) | [detalhe/comercial.md](banco/detalhe/comercial.md) |
| **professor** | Professores, Agenda, Health Score V3, LA Teacher, Feedback público | [sistema/professor.md](sistema/professor.md) | [detalhe/professor.md](banco/detalhe/professor.md) |
| **financeiro** | Administrativo, Faturas, Fechamento mensal, Super Folha | [sistema/financeiro.md](sistema/financeiro.md) | [detalhe/financeiro.md](banco/detalhe/financeiro.md) |
| **gestao** | Dashboard, Gestão Mensal, Metas, Relatórios | [sistema/gestao.md](sistema/gestao.md) | [detalhe/gestao.md](banco/detalhe/gestao.md) |
| **operacao** | Salas, Projetos, Time, Automações, Entrada, Lojinha | [sistema/operacao.md](sistema/operacao.md) | [detalhe/operacao.md](banco/detalhe/operacao.md) |
| **plataforma** | Config, Admin, RBAC, ferramentas internas | [sistema/plataforma.md](sistema/plataforma.md) | [detalhe/plataforma.md](banco/detalhe/plataforma.md) |
| **integracao** | Edge functions, crons, Emusys, WhatsApp, Chatwoot | [sistema/integracao.md](sistema/integracao.md) | [detalhe/integracao.md](banco/detalhe/integracao.md) |

## Índice de rotas

| Rota | Página | Domínio |
|---|---|---|
| `/app` | Dashboard | [gestao](sistema/gestao.md) |
| `/app/gestao-mensal` | Gestão Mensal | [gestao](sistema/gestao.md) |
| `/app/metas` | Metas (simuladores) | [gestao](sistema/gestao.md) |
| `/app/relatorios` | Relatórios | [gestao](sistema/gestao.md) |
| `/app/relatorios/diario` | Relatório diário | [gestao](sistema/gestao.md) |
| `/app/comercial` | Comercial | [comercial](sistema/comercial.md) |
| `/app/pre-atendimento` | Pré-Atendimento (CRM/WhatsApp) | [comercial](sistema/comercial.md) |
| `/app/campanhas` | Campanhas (Meta) | [comercial](sistema/comercial.md) |
| `/app/campanhas/:campanhaId` | Detalhe de campanha | [comercial](sistema/comercial.md) |
| `/app/trafego-pago` | Tráfego Pago (Meta Ads) | [comercial](sistema/comercial.md) |
| `/app/alunos` | Alunos | [aluno](sistema/aluno.md) |
| `/app/bandas` | Bandas | [aluno](sistema/aluno.md) |
| `/app/sucesso-aluno` | Sucesso do Aluno | [aluno](sistema/aluno.md) |
| `/app/retencao` | Retenção | [aluno](sistema/aluno.md) |
| `/app/professores` | Professores | [professor](sistema/professor.md) |
| `/app/agenda` | Agenda (grade do dia) | [professor](sistema/professor.md) |
| `/feedback/:token` | Feedback do professor (público) | [professor](sistema/professor.md) |
| `/app/administrativo` | Administrativo | [financeiro](sistema/financeiro.md) |
| `/app/faturas` | Faturas de alunos | [financeiro](sistema/financeiro.md) |
| `/app/salas` | Salas / Inventário | [operacao](sistema/operacao.md) |
| `/app/projetos` | Projetos | [operacao](sistema/operacao.md) |
| `/app/time` | Time | [operacao](sistema/operacao.md) |
| `/app/automacoes` | Automações (saúde) | [operacao](sistema/operacao.md) |
| `/app/entrada/*` | Entrada manual (lead, experimental, matrícula, evasão, renovação, aviso prévio, aluno) | [operacao](sistema/operacao.md) |
| `/app/apresentacoes-2025` | Histórico | [operacao](sistema/operacao.md) |
| `/app/config` | Configurações | [plataforma](sistema/plataforma.md) |
| `/app/admin/usuarios` | Admin — usuários | [plataforma](sistema/plataforma.md) |
| `/app/admin/permissoes` | Admin — permissões | [plataforma](sistema/plataforma.md) |
| `/apresentacao` | Apresentação (gestão, comercial, retenção) | [gestao](sistema/gestao.md) |
| `/login` | Login | [plataforma](sistema/plataforma.md) |
