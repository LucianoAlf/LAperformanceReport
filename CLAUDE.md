# LA Music Performance Report

Sistema de gestão operacional e BI para rede de escolas de música. Pipeline comercial, gestão de alunos, metas, retenção, professores, salas e projetos.

> **Referência rápida (consultar PRIMEIRO):**
> - **[`docs/MAPA-SISTEMA.md`](docs/MAPA-SISTEMA.md)** — por página: rota, componentes, hooks, RPCs e edge functions. Use antes de mexer numa página.
> - **[`docs/METRICAS.md`](docs/METRICAS.md)** — critérios canônicos de cada métrica (pagante, ativo, evasão, conversão, ticket, health score…). Use antes de query/KPI/relatório.
> - **[`docs/MAPA-INTEGRACAO-EMUSYS.md`](docs/MAPA-INTEGRACAO-EMUSYS.md)** — ciclo de integração Emusys.
> Manter os três atualizados no mesmo commit ao mexer em páginas/RPCs/edges/métricas.

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
- RPC functions para queries complexas (ex: `get_kpis_consolidados`, `get_kpis_professor_periodo`)
- Tipos gerados: `src/types/database.types.ts`
- `motivos_saida`: tabela com campo `conta_score_professor` (bool) — controla quais motivos penalizam o professor no score. NULL sem match = não conta.
- **`alunos` = matrículas, não pessoas** (pessoa = `nome`+`unidade_id`; 2 cursos = 2 linhas, 1 `is_segundo_curso=false` + N `true`). 2 linhas com mesmo `curso_id` da mesma pessoa = duplicata, não segundo curso. Detalhes e limpeza em `regras-negocio.md`.
- **`alunos_arquivados`**: lixeira oficial para arquivar matrículas duplicadas/erradas (move a linha + DELETE de `alunos`). Não criar `*_backup_<data>`. ⚠️ Sync de presença ignora `status` — só sair de `alunos` para o sync. Ver `dominio-alunos.md` / `integracao-infra.md`.

## Integrações

- **OpenAI:** assistente IA em `src/components/App/Alunos/Auditoria/` (agent tools, function calling)
- **n8n:** automações via webhooks (leads, aulas experimentais)
- **WhatsApp (UAZAPI):** pré-atendimento de leads, caixas de entrada por departamento (admin, sucesso do aluno)
- **Boas-vindas de matrícula:** edge function `enviar-boas-vindas-matricula` envia a mensagem de boas-vindas (vídeo do professor ou texto) pela caixa "Sol - Sucesso do Aluno" (UAZAPI) e registra na Caixa de Entrada. Substitui o workflow n8n antigo (WAHA). Idempotente (não duplica por matrícula, chave `ext:<emusys_matricula_id>`). **EM PRODUÇÃO desde 2026-06-17** (`MODO_TESTE=false`): disparada por `processar-matricula-emusys` (v21) no fim de `handleMatriculaNova` — só `matricula_nova`. Detalhes em `.claude/memory/integracao-infra.md`.
- **Boas-vindas da Equipe (carrossel por unidade):** subaba **"Mensagens Automáticas"** em Sucesso do Aluno → Acompanhamento (`AutomacoesTab` + hook `useAutomacoesSucessoAluno`) lista as automações do módulo (boas-vindas matrícula, pesquisa 1ª aula, carrossel da equipe) e **edita o texto** do carrossel. Edge `enviar-boas-vindas-equipe` (UAZAPI `/send/carousel` + `/send/text`, caixa 3, `verify_jwt:true`, self-contained) monta um carrossel com a equipe da unidade (tabela `staff_unidade`: locais + globais `unidade_id NULL`=CEOs, por `ordem`) + card da comunidade + contato da secretaria, lendo texto editável de `crm_templates_whatsapp` (slug `boas_vindas_equipe`) e `unidades` (`link_comunidade`/`secretaria_whatsapp`/`secretaria_fixo`). Fotos no bucket `staff-fotos`. **Disparo MANUAL (Fase 1)**. ⚠️ Carrossel (mensagem interativa) **não renderiza em iPhone**. Detalhes em `.claude/memory/integracao-infra.md`.
- **vCard de Contato (Cartões de secretaria):** subaba **"Cartões"** em Sucesso do Aluno → Acompanhamento (`CartoesContatoTab` + hook `useVcardsUnidade` + `VcardPreview`). Gerencia cartões de contato por unidade (tabela `vcards_unidade`: vários por unidade, `telefones text[]`, RLS por unidade padrão `metas`) e **testa o envio** para qualquer número via edge `enviar-vcard` (stateless, `POST /send/contact` UAZAPI pela caixa "Sol – Sucesso do Aluno", id 3; aceita `vcardId` salvo OU `vcard` ad-hoc; normaliza telefones p/ `55…`). Preview simula o cartão do WhatsApp em tempo real. **Fase 1 = modo teste** (atual). **Fase 2 (pendente):** plugar os cartões no `TemplateSelector` do inbox (disparo em conversa real, padrão `isTemplateAutomacao`) + uso futuro na régua de boas-vindas. Spec/plano em `docs/superpowers/`. Detalhes em `.claude/memory/integracao-infra.md`.
- **Pesquisa NPS pós-1ª aula (Sucesso do Aluno):** edge `enviar-pesquisa-pos-primeira-aula` manda a pesquisa da Fabi via UAZAPI `/send/menu type=list` (5 níveis ⭐ Esperava mais=1 … ⭐⭐⭐⭐⭐ Amei=5); resposta capturada por `processar-resposta-pesquisa` (lê `buttonOrListid`, grava `nota` em `pesquisas_whatsapp`, avisa o gerente). Aba **"Respostas"** em `PesquisasTab` (Sucesso do Aluno → Acompanhamento → Pesquisas) mostra análise (KPIs, recortes por professor/unidade/curso, evolução) e o registro individual, via RPCs `get_analise_pesquisas`/`get_respostas_pesquisa`; notas baixas (≤2★) têm deep-link "abrir conversa" para a Caixa. **Lançamento manual**: `ModalLancarRespostaManual` (busca de aluno OU modo contextual com aluno+marco fixos; nota OU "não respondeu" + comentário) registra via RPC `registrar_resposta_pesquisa_manual(p_aluno_id,p_data,p_tipo,p_nota,p_comentario,p_nao_respondeu)` — upsert lógico por (aluno_id,tipo), grava `manual=true`. **Timeline por aluno** (`TimelinePesquisasAluno`): régua 1ª aula → 3 meses → evasão (só 1ª aula ativa; resto "Em breve") embutida na ficha de detalhe — aba "Pesquisas" do `ModalFichaAluno` (módulo Alunos) e seção no `ModalDetalhesSucessoAluno`; via RPC `get_timeline_pesquisas_aluno`. Colunas `comentario`/`status` em `pesquisas_whatsapp`. Detalhes em `.claude/memory/integracao-infra.md`.
- **Conciliação Emusys (aba em Alunos):** edge `sync-matriculas-emusys` (varredura `GET /matriculas` por unidade, **dry-run** por env `SYNC_MATRICULAS_DRYRUN`) detecta divergências nosso×API e popula a fila `matriculas_divergencias`. AUTO aplica o seguro (status, data_fim, curso, professor, valor LIMPO, **dia_aula + horario_aula** derivados do `nome_turma` — ex. `G_Ter_14`→Terça 14:00, via `parseDiaDeTurma`/`parseHorarioDeTurma`; só quando turma tem 1 dia/horário único); FILA = decisão humana (`ambiguo`, `ausente_api`, `valor_divergente`, `classificacao_divergente`). **Nada é alterado sem aprovação humana** (decisão Hugo): o sync (dry-run) só audita/propõe; o usuário aprova ou mantém cada item na aba. As mudanças AUTO viram **"Sugestão do sync"** (`auto_preview`, 1/aluno, `valor_api.patch`=upd a aplicar) — selecionáveis e aprováveis (Aprovar/Manter/Ignorar + lote). `ambiguo` guarda TODOS os candidatos enriquecidos e a aba mostra **cartões por candidato** (dia/turma/curso/professor/parcela) com botão **Vincular** (escopo: só linhas existentes; avisa homônimo). Aplicação centralizada na RPC `aplicar_conciliacao_decisao` (SECURITY DEFINER) com **trava anti-vínculo-duplicado** (`emusys_matricula_id` é text sem unique); parcela recalculada pelo trigger; vincular NÃO fixa campos (segue sincronizando). Colunas `fonte`('sync'|'sol')+`analise_sol` preparam a **esteira com a Sol** (auditora IA escreve análise só nessa tabela — gated, bloco 2). `valor_divergente`/`classificacao_divergente` mantêm Aplicar/Editar/Reclassificar (esses fixam em `matriculas_campos_fixados`). ⚠️ A API embute às vezes o `desconto_fixo` no `valor_mensalidade` (líquido<0) e o flag `bolsa` não é confiável — por isso esses casos vão pra fila, não auto. Detalhes em `.claude/memory/integracao-infra.md`.
- **Campanhas (Meta WhatsApp Cloud API):** módulo `src/components/App/Campanhas/` (disparo de templates, conversas, agentes IA). **Autoreply por caixa**: cada `numeros_meta` tem `auto_reply_ativo` + `auto_reply_message` (editáveis em Campanhas→Config→Número Meta). Quando a caixa não tem agente IA ativo, o webhook `meta-webhook-campanhas` responde qualquer inbound reorientando para os canais de atendimento (debounce 10 min/contato). Detalhes em `.claude/memory/integracao-infra.md`.

## Variáveis de Ambiente

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...  # opcional
```

## Módulo de Professores

- **`TabPerformanceProfessores`**: tabela de KPIs por professor, dados via RPC `get_kpis_professor_periodo`
- **Taxa de conversão do professor (fonte = `lead_experimentais`, desde 2026-06-20)**: a RPC lê o CTE `experimentais` de `lead_experimentais` (1 linha por aula, presença real), **não mais de `leads`** (que agregava 1 por pessoa e subcontava realizadas → taxa inflada). Denominador = `status IN ('experimental_realizada','convertido')`; numerador (`matriculas_pos_exp`) = realizadas cujo lead converteu (join `leads.converteu`); matrícula direta sem experimental = 0. Experimental de aluno existente (2º instrumento) **conta**. A presença das experimentais é alimentada pela reconciliação da edge `sync-presenca-emusys` (auto-faltou subordinado ao `/aulas/`, grava `curso_interesse_id`). Detalhes: `docs/hugo/2026-06-20-regua-professor-fonte-lead-experimentais.md`.
- **Modo Mensal vs Trimestral**: toggle local na aba Performance. Em Trimestral, agrega 3 meses (T1=Mar/Abr/Mai, T2=Jun/Jul/Ago, T3=Set/Out/Nov, "Período Não Considerado"=Dez/Jan/Fev) para diluir distorções estatísticas em professores com poucas experimentais. RPC aceita `p_data_inicio` + `p_data_fim` opcionais (sobrescrevem `p_ano + p_mes`).
- **`ModalDetalhesPresenca`**: detalhe de presença por aluno, com paginação, busca e filtro por faixa
- **`ModalDetalhesEvasoes`**: detalhe de evasões com coluna "Score" (Conta/Não conta), lookup em `motivos_saida` por FK ou texto, filtro por score, card "Contam no Score"
- **`ModalDetalhesRetencao`**: detalhe de renovações/não-renovações/evasões com mesma lógica de score que o modal de evasões
- **`ModalDetalhesConversao`**: detalhe lead-a-lead da taxa de conversão. Classifica leads em 6 categorias (Realizou+Matriculou, Realizou sem matrícula, Faltou, Matriculou sem realizar, Matrícula direta, Agendada/Pendente). Destaca casos "ambíguos" que distorcem a taxa para >100% (ver regras-negocio.md).
- **Modais aceitam range de datas**: todos os 4 modais (Presença, Evasões, Retenção, Conversão) recebem props opcionais `dataInicio`/`dataFim`/`periodoLabel` para funcionar tanto em modo Mensal quanto Trimestral.
- **`MotivosScoreConfig`**: gerencia quais motivos penalizam o professor (toggles de `conta_score_professor`)
- **Score de evasões**: RPC filtra apenas `ms.conta_score_professor = true`. Motivo NULL sem match em `motivos_saida` = não conta (alterado de comportamento anterior onde NULL contava por padrão)
- **Edge function `processar-matricula-emusys` v12** (2026-05-07): mantém matching em camadas + backfill `emusys_matricula_id` + fallback de telefone. **Novo**: `handleEvasao` chama `registrarPassagemFinalizada` que grava 1 linha em `alunos_historico` quando o aluno saiu de TODAS as matrículas (`data_entrada=MIN(data_matricula)`, `data_saida=hoje`, `aluno_ids=[...]`). Idempotência via UNIQUE constraint `(aluno_id, data_saida) WHERE anulado = false`.
- **`is_projeto_banda`** em `cursos`: exclui curso de médias de turma, carteira e score do professor
- **Curso + id da aula na ORIGEM da experimental (2026-06-23)**: `lead_experimentais` ganhou `emusys_aula_id` (id único da aula no Emusys) → 1 linha por aula real, destravando multi-instrumento (2 cursos no mesmo dia deixam de colapsar). O webhook de experimental (n8n sub-workflow `j41tPbyjGXUQUxrN`, chamado pelo ativo `Fucq0bQwF4oeuWnv`) captura `body.aula.curso` + `body.id` e passa ao `registrar_experimental` (overload única de 12 params: `p_curso`→curso_id, `p_emusys_aula_id`). A edge `sync-presenca-emusys` (v37) reconcilia por `emusys_aula_id` e sobrescreve curso/professor pelo `/aulas`. **Régua = só LEAD por ora** (dúvida em aberto Hugo×Alf: experimental de aluno antigo conta?); **sem backfill** (vale pra frente). Detalhes: `.claude/memory/pendencias-2026-06-20-costura-experimental.md`.

## Módulo de Histórico LTV (Tempo de Permanência)

- **`TabHistoricoLTV`**: tela de ex-alunos. 4 KPIs (Total, Tempo Médio, **Taxa de Retorno** = % pessoas com 2+ passagens, Sistema). Tabela com edição inline + botão `History` (abrir passagens) + botão `Trash2` (DELETE físico, UX planilha).
- **Hook `useHistoricoLTV`**: usa RPC `get_historico_ltv(p_unidade_id)` que une `alunos_historico` (anulado=false) + `alunos` agrupados por pessoa (`NOT EXISTS` matrícula viva). Retorna `qtd_passagens_pessoa` via window function.
- **`ModalPassagensAluno`**: lista cronológica de passagens da pessoa. Soft delete via flag `anulado` em `alunos_historico` (motivo obrigatório, reversível). DELETE físico continua na tabela principal — soft é recurso adicional.
- **Edge function v12 + RPC** centralizam a regra "saiu de tudo": tempo só conta quando aluno encerra TODAS as matrículas. Trigger `fn_alunos_reentrada_historico` simplificada (só zera `data_saida` na reentrada — INSERT é da edge).
- Detalhes: `regras-negocio.md` seção "Histórico LTV / Tempo de Permanência".

## Regras Importantes

- **Timezone:** BRT (UTC-3) — sempre usar offset ao trabalhar com datas do negócio
- **Banco:** todas operações passam pelo client em `src/lib/supabase.ts`
- **Estado:** não usar Redux ou state managers externos — preferir hooks + Context
- **Hooks:** preferir hooks customizados para lógica de negócio reutilizável
- **MCP (OBRIGATÓRIO):** Sempre utilize ferramentas MCP proativamente para análise e investigação. Antes de explorar código manualmente, verifique se há um MCP disponível que facilite a tarefa (ex: Supabase MCP para consultar banco, n8n MCP para verificar workflows, NocoDB MCP para dados). MCPs são a via preferencial para acessar dados reais do sistema — use-os ANTES de ler código fonte quando precisar entender estado atual do banco, schemas, dados ou configurações.
- **Ler a fonte antes de afirmar (OBRIGATÓRIO):** ao descrever como QUALQUER automação/fluxo funciona (webhook, endpoint Emusys, edge function, workflow n8n, trigger, RPC), é proibido afirmar de memória ou por inferência do nome. SEMPRE abrir a fonte primeiro — `n8n_get_workflow` (mode full/structure), o código da edge, a definição da função no banco. Frases como "X não é usado", "Y é só manual", "Z não chama o Emusys" exigem verificação na fonte antes de serem ditas. As memórias podem estar desatualizadas (ex: o NocoDB já foi documentado como ativo quando não era mais) — memória é pista, não prova. Mapa canônico do ciclo Emusys: `docs/MAPA-INTEGRACAO-EMUSYS.md`.
- **Memória Self-Heal:** manter arquivos em `.claude/memory/` atualizados proativamente. Ao descobrir regras de negócio, padrões de código ou mudanças no domínio, atualizar o arquivo de memória correspondente e informar o usuário. Ver protocolo completo em `MEMORY.md`.
## Subagents

- **`fiscal-dados`** (em `.claude/agents/fiscal-dados.md`): auditor read-only de automações de dados (webhooks Emusys, syncs, Mila SDR, WhatsApp). Use proativamente quando o usuário pedir verificação de integridade, divergências entre sistemas, FK NULLs, duplicatas, falhas silenciosas. Lê `integracao-infra.md` + auto-discovery via `list_edge_functions` → reporta gaps de documentação. Tools restritas (sem Edit/Write).

## Skills

Ao trabalhar com agentes IA ou function calling, consulte `.claude/skills/ai-agents-architect/SKILL.md`
Ao trabalhar com LLMs, RAG ou integrações IA, consulte `.claude/skills/ai-engineer/SKILL.md`
Ao trabalhar com schema, queries ou migrations, consulte `.claude/skills/database-design/SKILL.md`
Ao trabalhar com WhatsApp, UAZAPI ou webhooks, consulte `.claude/skills/uazapi-whatsapp/SKILL.md`
