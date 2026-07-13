# Integracao e Infraestrutura — LA Music

## Supabase
- Project ID: `ouqwbbermlzqqvtqwlul` (LA Performance Report — principal)
- Outros projetos do usuario: `aexacbmirdlcssmjjbzx` (emusys-webhook, nao acessivel via MCP), `rhxqwraqpabgecgojytj` (LA Studio Manager), `ubdvtjbitozhkuvvqkxj` (la-music-folha), `xfqgcfeoswlkcgdtikco` (La_Pulse_v2)
- 41+ edge functions ativas
- Extensions: pg_cron, pg_net (HTTP requests de dentro do banco)

## Edge Functions (por categoria)

### WhatsApp / CRM
- `webhook-whatsapp-inbox` — router UAZAPI (messages + messages_update). Captura nome do contato (pushName) de `message.senderName`/`chat.name`/`chat.wa_name` e atualiza `nome_externo` a cada msg (reflete troca de nome, sem duplicar — elo da conversa é o NÚMERO). Conversa externa em caixa consolidada é casada por telefone+departamento+`aluno_id NULL`+`unidade_id NULL`. Deploy via Supabase CLI (1118 linhas + `_shared/uazapi.ts`), NÃO via MCP inline.
- `enviar-boas-vindas-matricula` — boas-vindas de nova matrícula pela caixa UAZAPI "Sol - Sucesso do Aluno" (id=3). Substitui o workflow n8n `4fohyKMFRE7QFE9S` (que usava WAHA). Busca vídeo do professor (RPC `buscar_video_professor`), envia vídeo+caption ou texto, notifica a equipe de matrícula e registra os envios em `admin_conversas`/`admin_mensagens` (departamento `sucesso_aluno`, `direcao=saida`, `remetente=admin`). **`NOTIFICAR_EQUIPE` (constante) = só Jessyca desde 2026-07-06** — a Fabi saiu daqui e passou a receber o resumo diário de 1ª aula (ver `notificar-primeira-aula-fabi`). Idempotência anti-duplicata via tabela `boas_vindas_enviadas` (UNIQUE) reservada antes do envio. `MODO_TESTE` (constante no topo) redireciona tudo para número de teste. `verify_jwt:true` (deploy via CLI; não é webhook). **EM PRODUCAO desde 2026-06-17 (`MODO_TESTE=false`, edge v10)**. Gatilho: `processar-matricula-emusys` v21 (deploy v26) chama via `fetch` no fim de `handleMatriculaNova`, passando `id_externo=p.matriculaIdEmusys` — só `matricula_nova`, try/catch isolado (falha de WhatsApp não derruba a matrícula). Segundo curso também dispara (sem filtro por `action`); reprocessamento da mesma matrícula = ignorado pela idempotência.
- `enviar-boas-vindas-equipe` — carrossel de boas-vindas da equipe por unidade, via UAZAPI `POST /send/carousel` + `/send/text` (comunidade) pela caixa id 3. `verify_jwt:true`, deploy MCP, **self-contained** (resolve credencial da caixa inline — o MCP não empacota `_shared/uazapi.ts`). Body: `{unidadeId, numeroDestino, responsavel?, aluno?, curso?}`. Lê `staff_unidade` (equipe local + globais `unidade_id NULL` = CEOs, por `ordem`), texto editável de `crm_templates_whatsapp` (slug `boas_vindas_equipe`, placeholders `{responsavel}{aluno}{curso}{unidade}{secretaria_whatsapp}{secretaria_fixo}{equipe}` — `{equipe}`=lista gerada dos locais), e `unidades` (`link_comunidade`, `secretaria_whatsapp`, `secretaria_fixo`). Cada card = foto+nome/cargo+botão URL "Entrar na comunidade". **Renderiza na Caixa de Entrada (2026-07-06):** a edge grava a msg via registrarNaCaixa (Forma A) como `admin_mensagens.tipo='carrossel'` (JSON `{texto, cards:[{nome,cargo,foto}], botao}`) — o webhook fromMe deduplica pelo `whatsapp_message_id`. `AdminChatPanel` desenha os cards (scroll horiz) + botão. ⚠️ o CHECK `admin_mensagens_tipo_check` precisou de `'carrossel'` (migration `20260706170000`); `registrarNaCaixa` casa a conversa por `telefone_externo` (número puro, formato do webhook) p/ não duplicar conversa. **Disparo MANUAL** (Fase 1) pela subaba "Mensagens Automáticas" (Sucesso do Aluno → Acompanhamento: `AutomacoesTab`+`useAutomacoesSucessoAluno`) que lista as 3 automações do módulo e edita o texto do carrossel. Fotos no bucket público `staff-fotos` (`recreio/`,`cg/`,`barra/`,`geral/`). ⚠️ **Carrossel (mensagem interativa) NÃO renderiza em iPhone/iOS** — entregue mas invisível (decisão Hugo: seguir mesmo assim). Spec/plano em `docs/superpowers/`.
- `enviar-vcard` — envia cartão de contato (vCard) via UAZAPI `POST /send/contact` pela caixa id 3 ("Sol – Sucesso do Aluno"). Stateless, `verify_jwt:true`, deploy MCP. Body: `numeroDestino` + (`vcardId` busca em `vcards_unidade` OU `vcard` ad-hoc, ad-hoc tem prioridade). Normaliza destino+telefones p/ `55…`, junta em CSV no `phoneNumber`. Tabela `vcards_unidade` (vários cartões por unidade, `telefones text[]`, RLS padrão `metas`) = fonte única, reuso futuro na Fase 2 (TemplateSelector no inbox) e na régua de boas-vindas. UI: subaba "Cartões" em Sucesso do Aluno → Acompanhamento (`CartoesContatoTab`/`useVcardsUnidade`/`VcardPreview`). **Fase 1 = modo teste** (envio p/ qualquer número + preview). Spec/plano em `docs/superpowers/`.
- `notificar-primeira-aula-fabi` — resumo das 1ªs aulas **de ONTEM** (calouros com presença detectada, pendentes de pesquisa) enviado por WhatsApp p/ a Fabi (número `5521994696489`) pela caixa id 3. **Reaproveita a MESMA RPC da aba Pós-1ª Aula: `get_candidatos_pesquisa_primeira_aula(p_unidade_id=null, p_janela_dias)`** (fonte = `aluno_presenca` status presente, MIN>=data_matricula; exclui quem já recebeu pesquisa), e **filtra `data_primeira_aula === ontem (BRT)`** — só quem teve a 1ª aula ontem, não "últimos N dias". Self-contained, `verify_jwt:true`, deploy CLI. Body opcional `{data_ref (default=ontem BRT, testa outro dia), janela_dias (scan da RPC, default 3), numero_destino, dry_run}`. Sem candidatos → não envia. Cron `notificar-primeira-aula-fabi-diario` (`0 11 * * *` = 08:00 BRT, jobid 32). **Pedido 1 da Fabi (2026-07-06): trocar a notificação de matrícula pela de 1ª aula** — por isso ela saiu da `NOTIFICAR_EQUIPE` da `enviar-boas-vindas-matricula`. ⚠️ Aviso é PÓS-fato ("teve a 1ª aula ontem"), não antecipado — não há agenda futura em `aluno_presenca`.
- `webhook-whatsapp-status` — status de entrega (enviada/entregue/lida)
- `whatsapp-status` — verifica conexao da instancia UAZAPI
- `whatsapp-connect` — conecta instancia UAZAPI
- `enviar-mensagem-lead` — envia msg WhatsApp para lead
- `editar-mensagem-lead` — edita msg enviada
- `deletar-mensagem-lead` — deleta msg
- `reagir-mensagem` — emoji reaction
- `transcrever-audio` — transcreve audio WhatsApp
- `buscar-foto-perfil` (v24, 2026-07-05) — foto de perfil WhatsApp. **Agora BAIXA a imagem via UAZAPI `/chat/details` e PERSISTE no Storage** (bucket `avatars`, pasta `whatsapp/<numero>.jpg`, upsert); grava a URL pública permanente em `foto_perfil_url` (+`?v=` cache-busting). Antes salvava direto a URL `pps.whatsapp.net`, que **expira em ~20 dias** (param `oe=`) → 403 → foto quebrada, nunca renovada. Self-contained (`getUazapiCredentials` inline) p/ deploy via MCP; `verify_jwt:false`. Disparo lazy pelo frontend (`AdminChatPanel`/`ChatPanel`) ao abrir conversa **se `foto_perfil_url` vazio** — com Storage não vence mais (limitação: se a pessoa TROCA a foto no WhatsApp, o cache não renova sozinho, pois só busca quando vazio; refinamento futuro = TTL). Se `/chat/details` não tem foto (privado) ou o download dá 403 (UAZAPI serve URL vencida em cache), não atualiza — nesses casos limpar `foto_perfil_url=NULL` p/ mostrar avatar de inicial. Backfill 2026-07-05: 46 fotos migradas p/ Storage (caixa 3 + CRM).
- `debug-uazapi` — debug de conexao

### Mensagens Agendadas
- `processar-mensagens-agendadas` — processa fila de msgs (pg_cron a cada minuto). Também processa `fila_relatorios_whatsapp` (relatórios admin diários). **Retry seguro (v12, 24/06):** colunas `tentativas`/`ultima_tentativa_em`; só reenvia status `erro` quando a falha indica que a msg NÃO saiu (sessão WAHA fora, conexão, 50x — regex `relatorioErroRetryavel`); erro do WhatsApp após receber a requisição vira `falhou` (terminal, não reenvia → anti-duplicata); `enviada`/`falhou` nunca repescados; confere sessão `WORKING` antes de enviar; máx 8 tentativas; janela 2h (não reenvia relatório de dias atrás); destrava `enviando` preso +5min. Motivo: 23/06 os 3 relatórios falharam (`Session status is not as expected` — sessão Sol caída às 20h) e a fila não tinha retry.
- ⚠️ **Erro WAHA 463** (caixa Sol, engine GOWS `2026.5.1`): "reach-out time-lock"/`tctoken` — primeira msg 1:1 p/ contato SEM conversa prévia é barrada (bug GOWS não envia tctoken; issues WAHA #1992/#2050). Afeta notificação 360 do professor novo. Sessão sã (grupo e contato com histórico funcionam). Saída: contato manda 1 msg antes; fundo: engine GOWS→NOWEB/WEBJS ou update WAHA.
- `gerar-mensagem-aniversario` — texto IA para aniversario
- `gerar-mensagem-boas-vindas` — texto IA boas-vindas
- `gerar-mensagem-checklist` — texto IA checklist

### IA / MILA
- `mila-processar-mensagem` — agente IA MILA (pre-atendimento automatico)

### Gemini Insights / Relatorios
- `gemini-insights` — insights gerais
- `gemini-insights-comercial` — KPIs comerciais
- `gemini-insights-equipe` — performance equipe
- `gemini-insights-professor` — performance professor
- `gemini-insights-retencao` — retencao/churn
- `gemini-insights-turma` — insights por turma
- `gemini-ranking-professores` — ranking comparativo
- `gemini-relatorio-coordenacao` — relatorio coordenacao
- `gemini-relatorio-gerencial` — relatorio gerencial
- `gemini-relatorio-professor-individual` — relatorio individual
- `gemini-fabio-chat` — chatbot Gemini

### WhatsApp Reports
- `professor-360-whatsapp` — feedback 360 via WhatsApp
- `projeto-alertas-whatsapp` — alertas de projetos
- `relatorio-admin-whatsapp` — relatorio admin (tipos: gerencial_ia, diario, mensal, renovacoes, avisos, evasoes)
  - **modo cron** (`{"modo":"cron"}`, jobs 13 seg-sex 23h UTC / 22 sab 19h UTC): `processarCron` gera o texto por unidade e faz **INSERT em `fila_relatorios_whatsapp`** (status `pendente`); quem envia é `processar-mensagens-agendadas` (a cada min). modo `dry_run` (`{"modo":"dry_run","unidade":<uuid>}`, `verify_jwt:false`) gera o texto **sem enfileirar/enviar** — seguro p/ teste.
  - ⚠️ **GOTCHA `data_dia` (incidente 2026-06-27):** o INSERT do `processarCron` **nunca** preencheu a coluna `data_dia` (NOT NULL) — sempre dependeu do **DEFAULT** da coluna. Em 2026-06-27 o default sumiu (mudança de banco fora de migration versionada) e os 3 INSERTs do sábado falharam com `null value in column "data_dia" violates not-null constraint` → 0 relatórios na fila, nada enviado. Cron mostrava "succeeded" (net.http_post é fire-and-forget); a resposta real fica em `net._http_response.content`. **Fix:** migration `fila_relatorios_data_dia_default_brt` restaurou `DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date`. Se mexer no INSERT, preencher `data_dia` explicitamente OU manter o default.
  - **Lição (2026-06-27):** o "git↔prod divergente" observado durante o incidente era só o **local 4 commits atrás** do `origin/main` (commit `b8e1aea` já tinha a v44 com `get_kpis_alunos_admin_operacional` + `anexarCursosMovimentacoes`). Após `pull`, local == prod. Antes de concluir divergência, `git fetch` + comparar com `origin/main`, e `get_edge_function` antes de redeployar.
  - Sem retry de envio quando a falha é no enfileiramento: o retry do `processar-mensagens-agendadas` só reprocessa itens já na fila (`pendente`/`erro`).
- `relatorio-coordenacao-whatsapp` — relatorio coordenacao (tipos similares)
- Modais de envio: `ModalRelatorio.tsx` (Administrativo), `ModalRelatorioVendas.tsx` (Lojinha), `ModalRelatorioCoordenacao.tsx` (Professores), `RelatoriosTab.tsx` (PreAtendimento)
- Periodos: hoje, ontem, semana, mes, personalizado
- Lojinha tipos: diario, semanal, mensal, meta_fideliza

### Lojinha
- `lojinha-alerta-estoque` — alerta estoque baixo via WhatsApp
- `lojinha-enviar-comprovante` — comprovante de venda via WhatsApp
- `lojinha-relatorio-professor` — relatorio comissoes professor
- `lojinha-relatorio-vendas` — relatorio de vendas

### Presenca / Sync Emusys
- `sync-presenca-emusys` (v31, 2026-06-09) — sync aulas/presenca do Emusys (pg_cron diario **19:50-19:54 BRT**, antecipado de 22h em 2026-06-23). **Só registra presença; NÃO calcula mais `dia_aula`/`horario_aula`** (movido para a função SQL `sincronizar_grade_horaria_alunos`).
- **Horário antecipado, 10min antes do fechamento de cada unidade (2026-06-23):** os 3 crons rodavam 22:00/22:20/22:40 → o relatório operacional (consultado ~20h) nunca tinha as aulas do próprio dia. Reagendados p/ 10min antes do fechamento, com job separado p/ semana (seg-sex, dow 1-5) e sábado (dow 6). Cada job = 1 unidade c/ token próprio (sem conflito). Não há aula iniciando no horário do cron (aulas começam de hora em hora), então captura o dia todo sem perder nada; o que começar depois entra no sync seguinte (janela 5-7d resgata). **Domingo não roda** (sem aula). Grade horária (01:30 UTC) continua depois, ordem preservada.
  - **Fechamentos:** semana — CG/Recreio 21h, Barra 20h; sábado — CG/Recreio 15h, Barra 16h.
- **Vínculo de presença POR CURSO (v31):** o `aluno_id` de `aluno_presenca` passou a ser resolvido pela matrícula do **curso da aula** (`mapaAlunosComposto` chave `nome|nascimento|curso_id`), com fallback ao nome quando ambíguo/sem curso. Antes resolvia só por nome → embaralhava alunos com 2+ cursos. `normalizarCurso` agora remove sufixos `" t"`/`" ind"` (turma/individual) do `curso_nome` do Emusys.
- **`sincronizar_grade_horaria_alunos` (reescrita 2026-06-09) — fonte ÚNICA do `dia_aula`/`horario_aula`.** Deriva por **pessoa (nome+unidade) + curso da aula** a partir de `aluno_presenca` (moda do dia/horário, 30d com fallback 60d, ≥3 ocorrências), `UPDATE` só quando muda. Robusta a homônimos/multi-curso e ao histórico embaralhado (reagrupa pelo curso da aula). Cron `sincronizar-grade-horaria` 01:30 UTC. Roda em <1s. Helpers `grade_norm_nome`/`grade_norm_curso` (espelham o TS). **Resolveu o flapping** (horários trocados entre matrículas de aluno multi-curso, oscilando 2×/noite — ex: Mateus K. Paulino com Canto/Power Kids/Canto Coral). Forward-only: histórico de `aluno_presenca` (~60d) não foi saneado.
- **GOTCHA (provado 2026-05-27): o sync de presenca IGNORA o `status` do aluno.** Casa aula→aluno por nome+curso. 64 alunos inativo/evadido/trancado receberam 176 presencas nos ultimos 30 dias. Consequencia: marcar `status='inativo'` NAO para o sync nem tira o aluno de metricas que leem `aluno_presenca` direto (score professor, frequencia). Para um aluno realmente sumir, a linha tem que SAIR de `alunos` (mover p/ `alunos_arquivados`). Soft-delete via status é leaky.
- **Curso real vem da aula, nao do cadastro.** `aulas_emusys` (espelho do endpoint de aula) tem `curso_nome`/`turma_nome`/`professor_nome` corretos. O `alunos.curso_id` (rotulo da matricula via webhook) pode estar errado. Para saber o curso real de um aluno: `aluno_presenca` → `aulas_emusys.curso_nome`. Constraint `uq_presenca_aluno_aula (aluno_id, aula_emusys_id)` garante integridade ao migrar presenca (dedupe obrigatorio por aula_emusys_id, ou por data_aula quando aula_emusys_id IS NULL via indice legado).
- `marcos-jornada` (v1, 2026-06-15) — **on-demand** (chamada pelo front, sem cron). Busca `/v1/aulas/` **FUTURAS** (hoje..hoje+janela, default 7d) por unidade, deduplica individual+turma, resolve `aluno_id` reusando o matching do `sync-presenca-emusys` (copiado: `normalizarNome`/`normalizarCurso` + chave `nome|nasc|curso_id`). Retorna `primeiras_aulas` (nr=1 + matrícula recente) e `marco_aula` (nr=nr_alvo + `numero_renovacoes=0`), ambos excl. projeto banda. **Ignora presença** (Emusys pré-marca futuro como 'ausente'). Aulas futuras NÃO entram em `aluno_presenca`. Aba: Sucesso do Aluno → Acompanhamento → Marcos. Ver [[dominio-alunos.md]].
- `sync-professores-emusys` (v1, 2026-05-20) — sync semanal de professores. Auto-cura `emusys_id` por nome, cria professores novos, vincula a unidades existentes, loga "sumiu da lista" sem desativar. Cron `sync-professores-emusys-semanal`: Domingo 04:00 BRT. Audita em `professores_sync_log`.
- `sync-students-studio` — sync alunos com LA Studio (projeto separado)
- `sync-feriados` — sincroniza feriados (via BrasilAPI) para agenda

### Webhook Matricula (Emusys)
- `processar-matricula-emusys` (v21, 2026-06-05) — recebe webhook Emusys (matricula_nova/renovacao/trancamento/finalizacao). Insere/atualiza `alunos`, `movimentacoes_admin`, atualiza `leads` para convertido. v16 adiciona CAMADA 2 ao `resolverProfessorId` (fallback por nome+unidade com auto-cura do `emusys_id`). **v17**: integra helper `_shared/invariantes.ts` — cada handler chama `checar*()` + `gravarLog()` no final; try/catch externo grava `processamento_falhou_excecao` em exceção. **v20** (2026-05-28): captura `tipo_pagamento` do payload → grava `forma_pagamento_id` em `alunos` (map: Recorrente→1, Cheque→2, Pix→3, Dinheiro→4, Link→5, Boleto→6, Débito→7; desconhecido→null). **v21** (2026-06-05): `converterLead` grava `alunos.lead_origem_id = leadId` após achar o lead (FK `alunos→leads`, reverso do `leads.aluno_id`). Guard `.is('lead_origem_id', null)` evita sobrescrever vínculo existente. Fiscal: aluno convertido de lead deve ter `lead_origem_id` preenchido; matrícula direta (sem lead) fica NULL legitimamente.

### Saude das Automacoes
- `auditor-divergencias-emusys` (v1, 2026-05-20, NOVA) — varre banco com 13 regras SQL idempotentes via RPC `executar_query_auditoria`. Disparo: pg_cron horário OU botão manual no frontend. Grava em `automacao_invariantes` com `idempotency_key='audit:<regra>:<id>'` (re-execução não duplica). Detalhes completos: ver `modulo-saude-automacoes.md`.
- Helper `supabase/functions/_shared/invariantes.ts` — exports: types (`Severidade`, `Invariante`, `GravarLogParams`, `ResultadoMatricula`), `comFallback`, `gravarLog`, `computarHash` (SHA-256), `checarMatricula/Renovacao/Trancamento/Finalizacao`. Usado pela edge de matrícula.
- RPC `executar_query_auditoria(p_sql text)` — SECURITY DEFINER, restrita a `service_role`, aceita só `SELECT`/`WITH`. Usada pelo auditor para rodar queries sem hardcode.
- Tabela `automacao_log` ganhou colunas `status` (ok/warn/erro), `lead_id`, `payload_bruto` (jsonb), `idempotency_key` (UNIQUE).
- Tabela nova `automacao_invariantes` — 1 linha por regra violada, com soft `visto_em`. RLS: SELECT para `authenticated`, UPDATE só para admin.

### Meta WhatsApp Cloud API (Campanhas)
- `meta-webhook-campanhas` — webhook receiver da Meta WhatsApp API (mensagens inbound + status updates). Roteia para agente IA se houver; **autoreply por caixa** (v11, 2026-06-23): se a caixa (`numeros_meta.auto_reply_ativo=true`) não tem agente ativo, responde QUALQUER inbound com `numeros_meta.auto_reply_message` (reorienta para canais de atendimento). Debounce de 10 min por contato (verifica último outbound `metadata->>auto_reply='true'` na conversa). Substituiu o autoreply antigo amarrado a `agentes.auto_reply_message` (que nunca disparou: caixas com `unidade_id=NULL` + trava de campanha). Editável em Campanhas→Config→Número Meta (toggle + textarea). Ativo na caixa "Envio de Avisos (Sem Agente)" (`931b0c24`). ⚠️ Deploy via MCP achata `_shared` → imports `./_shared/`, `verify_jwt:false`.
- `enviar-campanha` — dispatcher batch de campanhas (recursivo, batch 50, delay 100ms)
- `controle-campanha` — UI controller (iniciar/pausar/retomar). Atualiza status em `campanhas`, invoca `enviar-campanha`
- `enviar-mensagem-meta` — envio individual via Meta Cloud API
- `sincronizar-templates` — sync templates aprovados pela Meta
- `gerenciar-templates` — CRUD de templates locais

### Agente Webhook (BI / IA)
- `agente-webhook` — webhook generico para agentes IA (BI agent)
- `bi-agent-lamusic` — BI agent que responde perguntas via LLM (insights ad-hoc)
- `gerar-prompt-agente` — gera prompt customizado para agentes IA
- `jarvis-chat` — chatbot interno IA

### Admin
- `admin-create-user` — criar usuario
- `admin-update-password` — alterar senha
- `enviar-pesquisa-evasao` — pesquisa churn via WhatsApp
- `enviar-pesquisa-pos-primeira-aula` — NPS pós-1ª-aula (Fabi/Sucesso do Aluno). UAZAPI `/send/menu type=list` (v5, botão "Avaliar"; antes `type=button`). 5 opções → notas 1-5 (Esperava mais=1, Foi ok=2, Gostei=3, Gostei muito=4, Amei=5) via `buttonOrListid`. **Captura: `webhook-whatsapp-inbox` (v48) invoca `processar-resposta-pesquisa` quando há `msg.buttonOrListid` (fire-and-forget, idempotente — só grava se houver pesquisa pendente por `remote_jid`). Validado E2E 2026-06-23 (clique real → nota gravada).** A edge `processar-resposta-pesquisa` v2 (mapa `NOTA_POR_BOTAO`) grava `nota` em `pesquisas_whatsapp` + avisaria o gerente. ⚠️ ANTES de 23/06 o wiring NÃO existia (comentário da edge dizia que sim, mas o webhook só registrava como texto "↩️ ..." — respostas não eram capturadas). ⚠️ `unidades.telefone_gerente` está NULL nas 3 unidades → o aviso ao gerente NÃO dispara hoje (edge sai antes). ⚠️ notas históricas usavam escala 1/3/5. Sem coluna de comentário (feedback textual = pendente).
- **Aba "Respostas"** (Sucesso do Aluno → Acompanhamento → Pesquisas, sub-aba): análise + registro das notas. RPCs `get_analise_pesquisas(p_unidade_id,p_data_inicio,p_data_fim)→jsonb` (KPIs+distribuição+recortes professor/unidade/curso+evolução semanal por `respondido_em`) e `get_respostas_pesquisa(...)→linhas` (lista individual). Filtram `tipo='pos_primeira_aula'`,`enviado_ok`,período por `enviado_em`; recorte via vínculo atual do aluno (`professor_atual_id`,`curso_id`). Front: `RespostasPesquisaTab`+`useAnalisePesquisas`; deep-link "abrir conversa" (nota≤2) → `CaixaEntradaTab` prop `alunoIdInicial`. Sem status "tratado" (decisão: começar simples). **Lançamento manual (2026-06-23):** `ModalLancarRespostaManual` (busca aluno ilike OU modo contextual `alunoFixo`+`tipoFixo` sem busca; nota 1-5 OU toggle "não respondeu" + Textarea comentário + data) grava via RPC `registrar_resposta_pesquisa_manual(p_aluno_id,p_data,p_tipo,p_nota,p_comentario,p_nao_respondeu)` SECURITY DEFINER. **Upsert lógico por (aluno_id,tipo)**: atualiza o registro existente (inclusive o `pendente` da edge de envio) — só insere se não houver, nunca duplica. `data_matricula`=`COALESCE(data_inicio_contrato, p_data)` (coluna é NOT NULL e 916 alunos têm data_inicio NULL). `enviado_em=respondido_em`=data@12h BRT, `manual=true`.
- **Timeline de pesquisas por aluno (2026-06-23):** `TimelinePesquisasAluno({alunoId,alunoNome})` — régua fixa **1ª aula → 3 meses → evasão** (`pos_primeira_aula` ativo; `tres_meses`/`evasao` `ativo=false`="Em breve") via RPC **`get_timeline_pesquisas_aluno(p_aluno_id)→jsonb`** (DISTINCT ON por tipo, SECURITY DEFINER). Por marco: estrelas+comentário (respondida) / "Não respondeu" / "Aguardando resposta" / "Sem registro" + botão Registrar→Editar (abre modal contextual). Embutido em `ModalDetalhesSucessoAluno` (seção) e `ModalFichaAluno` do módulo Alunos (aba "Pesquisas"). Colunas `comentario`/`status` (`respondida`/`nao_respondida`/`pendente`) em `pesquisas_whatsapp`; edge `processar-resposta-pesquisa` v4 grava `status='respondida'` na captura. Coluna `manual` (bool) distingue manual×WhatsApp.
- **Auto-disparo da pesquisa de 1ª aula (opt-in, 2026-07-06):** edge `disparar-pesquisa-1a-aula-auto` (v1, `verify_jwt:true`) + cron `disparar-pesquisa-1a-aula-diario` (`0 14 * * *` = 11h BRT, jobid 33). Gated pela tabela **`automacoes_config`** (slug `auto_pesquisa_1a_aula`, `ativo bool` — **começa DESLIGADO**; RLS `authenticated` select/insert/update). Se ligado: roda a RPC `get_candidatos_pesquisa_primeira_aula(null, 1, true)`, filtra quem tem `whatsapp_jid`, dispara **até 15/dia** (teto) chamando `enviar-pesquisa-pos-primeira-aula` (reaproveita o 1/1 com 10s + idempotência); acima de 15, avisa a Fabi (`5521994696489`, caixa 3) pra completar o resto na aba. Responde rápido ao cron e envia em `EdgeRuntime.waitUntil`. **Retry automático** (v2): reenvia só nos que falharam (idempotente) e, se ainda sobrar, avisa a Fabi **com a lista de quem não recebeu** pra recuperar na aba. Body `{dry_run?, forcar?}` — **`forcar` (fura o toggle) é gated por e-mail** (`hugo@gmail.com`/`lucianoalf.la@gmail.com`, via `emailDoJwt`, mesmo mecanismo do Tráfego Pago), pois a anon key é pública; anon sozinha → 403. Toggle liga/desliga no **cabeçalho da aba Pesquisas → Pós-1ª Aula** (`PesquisaPrimeiraAulaTab` + `usePesquisaPrimeiraAula.toggleAutoPesquisa`), junto do botão de envio manual (governa o robô desta mesma lista). Os TEXTOS (aluno/responsável) seguem em Mensagens Automáticas. ⚠️ **RPC `get_candidatos_pesquisa_primeira_aula` ganhou 3º param `p_apenas_ontem boolean`** (filtra `data_primeira_aula = ontem BRT`) e passou a calcular o MIN da 1ª aula sobre TODA a presença (antes era MIN da janela = falso positivo p/ veterano com aula recente) — a aba Pós-1ª Aula agora usa `p_apenas_ontem:true` (sem seletor de janela).
- `enviar-mensagem-admin` — envia msg WhatsApp admin→aluno (texto+midia), v6 com health check ping (`body.ping` retorna early), `verify_jwt: false`. Retry no frontend via `invokeWithRetry()` (ver padroes-codigo.md). Campo `erro_motivo` em admin_mensagens para tooltip de erro no chat
- `validar-token-feedback` — validar token feedback
- `gerar-relatorio-aluno` — relatorio IA do aluno
- `gerar-plano-aluno` — plano de acao IA do aluno

## pg_cron Jobs
| Job | Schedule | Descricao |
|-----|----------|-----------|
| `processar-mensagens-agendadas` | `* * * * *` (cada minuto) | Processa fila de mensagens WhatsApp |
| `sync-presenca-{cg,barra,recreio}` (semana, dow 1-5) | Barra `50 22`, CG `50 23`, Recreio `52 23` (= 19h50/20h50/20h52 BRT) | Sync presenca do Emusys por unidade (CG `dias:5`, Barra/Recreio `dias:7`). 10min antes do fechamento (CG/Rec 21h, Barra 20h) |
| `sync-presenca-{cg,recreio,barra}-sabado` (dow 6) | CG `50 17`, Recreio `52 17`, Barra `50 18` (= 14h50/14h52/15h50 BRT) | Idem, sábado. Fechamento sáb: CG/Rec 15h, Barra 16h |
| `sincronizar-grade-horaria` | `30 1 * * *` (22h30 BRT) | `sincronizar_grade_horaria_alunos()` — deriva dia_aula/horario_aula por pessoa+curso |
| `alertas-diarios` | `0 11 * * *` (diario 8h BRT) | Alertas de projetos via WhatsApp |
| `alertas-tarefas-atrasadas` | a cada 2h (11-23 UTC) | Alertas tarefas atrasadas |
| `resumo-semanal` | `0 12 * * 1` (segunda 9h BRT) | Resumo semanal via WhatsApp |
| `snapshot_dados_mensais` | `0 3 1 * *` (dia 1, 0h BRT) | Snapshot mensal de KPIs |
| `warm-enviar-mensagem-admin` | `*/5 * * * *` (cada 5 min) | Warm-up ping para evitar cold start |
| `sync-professores-emusys-semanal` | `0 7 * * 0` (Domingo 4h BRT) | Sync professores Emusys → professores_unidades |
| `auditor-divergencias-cron` | `0 * * * *` (toda hora cheia) | Roda `auditor-divergencias-emusys` (13 regras SQL → `automacao_invariantes`) |
| `notificar-primeira-aula-fabi-diario` | `0 11 * * *` (8h BRT, jobid 32) | Resumo das 1ªs aulas de ontem p/ a Fabi (caixa 3), reaproveita RPC `get_candidatos_pesquisa_primeira_aula` |
| `disparar-pesquisa-1a-aula-diario` | `0 14 * * *` (11h BRT, jobid 33) | Auto-disparo **opt-in** da pesquisa de 1ª aula (só ontem, teto 15/dia). Gated por `automacoes_config.auto_pesquisa_1a_aula` (default OFF) |

## n8n Workflows

> **Mapa canônico do ciclo Emusys:** `docs/MAPA-INTEGRACAO-EMUSYS.md` (verificado na fonte 2026-06-08, exaustivo). Consultar antes de afirmar como um fluxo Emusys funciona.
> ⚠️ **NocoDB NÃO alimenta mais o Supabase/Performance Report.** Os ramos NocoDB no EB0 e no [Nocodb] leads estão **desconectados/`disabled`**. O NocoDB segue como CRM paralelo (escrito direto pelos agentes Mila), mas fora do nosso ciclo.

### Emusys Webhook — `EB0LibpOJCLhKp7M` ("[ Emusys] WBHK - leads criados")
- Webhook: `POST /webhook/lead_criado` (recebe lead_criado, lead_editado, lead_arquivado)
- Switch "Filtro Evento": case 0 = lead_criado, case 1 = lead_arquivado, case 2 = lead_editado
- **Branch lead_criado:** Preparar Dados Lead → `upsert_lead()` (Supabase). (Nós "Preparar NocoDB" existem mas terminam num IF **sem nó de escrita** → NocoDB NÃO é gravado.)
- **Branch lead_editado:** preparar dados → `upsert_lead()` (Supabase). (Ramo NocoDB desconectado, igual ao criado.)
- **Branch lead_arquivado:** `UPDATE leads SET arquivado=true, status='arquivado', etapa_pipeline_id=11` (Supabase). Preserva leads já `convertido`/`matriculado`.
- Lead criado no NocoDB recebe `Observacoes: "emusys"`
- **`data_contato` (fix 2026-05-25):** `upsert_lead()` passou a re-alinhar `data_contato` no UPDATE (`COALESCE(p_data_contato, data_contato)`), não só no INSERT. Origem: `body.lead.data_hora_criacao`. Antes era write-once → leads migrados (26/03, ~2053) ficavam com data congelada/divergente do Emusys (ex: lead 4522 Renato `05/12/2025` vs Emusys `25/04/2026`). Overload legado `(...,date,boolean)` DROPADO em 2026-05-25 (duplicata morta, sem callers). Validação no agente fiscal-dados (Seção J). Limitação: leads já convertidos/arquivados não recebem mais webhook → não se auto-corrigem (precisariam backfill via API Emusys).

### NocoDB webhook — `1uP2GhoHG1shEFLg` ("[ Nocodb ] Criacao/Atualizacao de leads")
- Webhook: `POST /webhook/nocodb_leads` (disparo automatico do NocoDB on insert/update)
- Branches:
  1. `Webhook` → `Transformar NocoDB → Emusys` → `Preparar Dados Arquivamento1` → `Upsert Lead` (Supabase, origem='nocodb') — **NÓ DESATIVADO (`disabled`) desde ~2026-03-28**. NÃO sincroniza mais NocoDB→Supabase.
  2. `Webhook` → `Call '[ Controle ] Registrar Lead Metrics'` (sub-workflow YiSWPwsuvO74XNAs) — log em tabela NocoDB controle
- **OBSOLETO (verificado 2026-05-25):** a afirmação "upsert_lead sincroniza TODO lead do NocoDB" não vale mais — o nó Upsert está `disabled` e há **0 eventos `evento='nocodb'`** em `leads_automacao_log` (30d). Hoje TODO lead chega ao Supabase só pela via Emusys (`EB0LibpOJCLhKp7M`).
- Nó orfao (desconectado): `Transformar NocoDB → Emusys1` → `enviar para o dashboard do rayan` — outro projeto, nao relevante
- `[ Controle ] Registrar Lead Metrics` (YiSWPwsuvO74XNAs) — apenas log em NocoDB `musrzcrvkkwl27j`

### Sincronizacao bidirecional de leads (confirmado 2026-03-21)
| Origem | → Supabase | → NocoDB | → Emusys |
|--------|------------|----------|----------|
| Emusys webhook | ✅ via EB0LibpOJCLhKp7M | ✅ via EB0LibpOJCLhKp7M | — (ja esta) |
| NocoDB (agente SDR) | ❌ nó Upsert desativado (~28/03/2026) | — (ja esta) | ❌ nao sincroniza |
| Manual (Supabase) | — (ja esta) | ❌ | ❌ |

**Por design:** leads criados no NocoDB (via agente SDR) NAO vao para o Emusys. O Emusys e populado apenas quando o agente SDR chama a API do Emusys diretamente.

### Agentes Mila SDR (3 workflows) — PRINCIPAL FONTE DE LEADS
| Unidade | ID | Nos |
|---------|-----|-----|
| Mila CG | `aHD4kJdzByLwFXA1` | ~110 |
| Mila Recreio | `gSHJHYMOYDQZqleW` | ~110 |
| Mila Barra | `yko5HstPTze0gsIM` | ~110 |

**A maioria dos leads do sistema vem destes 3 fluxos.** Cada agente Mila recebe mensagens WhatsApp, processa com IA (SDR) e chama a API Emusys de cadastro de leads. O Emusys entao dispara o webhook que ativa `EB0LibpOJCLhKp7M`, que faz o upsert no Supabase + NocoDB.

**Cadeia completa:** WhatsApp → Mila SDR → `Cadastrar no Emusys` (API) → Emusys webhook → `EB0LibpOJCLhKp7M` → Supabase + NocoDB

**Fluxo real (ordem confirmada) quando novo lead chega via WhatsApp:**
```
É Aluno Ativo? (NÃO)
  → Cadastrar no Emusys        ← chama API Emusys DIRETAMENTE (UrlEmusys + token por unidade)
  → [sentimentos + SDR agent]
  → Verificacao (NocoDB read)
  → Ta no CRM? (NÃO)
      → Adicionar no CRM de FollowUp   ← cria registro NocoDB (m1e7k051jr4czww)
      → novosLeads                      ← Chatwoot API (custom_attributes) — dead-end
```

**Pipeline completo quando Emusys aceita:**
`Cadastrar no Emusys` → Emusys cria lead → webhook → `EB0LibpOJCLhKp7M` → `upsert_lead()` → Supabase

**Bug conhecido — falha silenciosa:**
- `Cadastrar no Emusys` tem `neverError: true` + `onError: continueRegularOutput`
- Se Emusys rejeita (ex: telefone duplicado → 4xx), a execucao continua como "success"
- Nenhum webhook Emusys e disparado → `EB0LibpOJCLhKp7M` nao roda → Supabase nao recebe o lead
- Resultado: lead aparece no NocoDB mas NAO no Supabase
- Fix pendente: adicionar IF `statusCode >= 300` → Postgres `upsert_lead()` direto

**Outros nodes relevantes:**
- `novosLeads`: chamada Chatwoot API (custom_attributes funil_de_leads="Novos Leads") — NAO eh Supabase
- `update_emusys`: atualiza lead no Emusys quando status muda
- `Verificacao`, `Puxar do CRM`, `retorna pra followup`, `Update de hora no CRM`: NocoDB ops

### Gerenciar CRM NocoDB — `dJ7Dc9LHLTSnKIsi`
- Triggered by Chatwoot webhook (mudanca de estagio)
- Faz apenas **UPDATEs** em registros existentes no NocoDB (Estagio, Lead Score, etc.)
- **NAO cria leads** — nao e responsavel por leads novos

### NocoDB Config
- Credencial: `NocoDB Luciano` (ID: `2KWPkp1f1X1SSto1`, auth: `nocoDbApiToken`)
- Base: `pyhap3besob1yjr`
- Table "Gestao De Leads LA Music": `m1e7k051jr4czww`
- typeVersion: 3

### Mapeamento Estagio Emusys → NocoDB
| Emusys | NocoDB |
|---|---|
| Novo / Novo Lead | Novos Leads |
| Experimental Agendada | Experimental Marcada |
| Realizou experimental / Compareceu | Compareceram |
| Matriculado | Matriculado |
| Faltou aula experimental | Faltaram |

### Telefone entre sistemas
- Supabase: com prefixo 55 (ex: `5521999999999`)
- NocoDB: sem prefixo 55 (ex: `21999999999`)
- Emusys webhook: formato `(21) 99999-9999`

## WhatsApp CRM (UAZAPI)
- Caixas por unidade em `whatsapp_caixas` (uazapi_url, uazapi_token, funcao: agente|sistema|ambos|administrativo)
- Conversas CRM em `crm_conversas` (status: aberta|pausada|encerrada|aguardando, lead_id)
- Mensagens CRM em `crm_mensagens` (direcao: entrada|saida, remetente: lead|mila|andreza|sistema)
- Atribuicao: mila (IA), andreza (humano), nao_atribuido
- Hooks: `useWhatsAppStatus()`, `useWhatsAppCaixas()`, `useMensagens()`, `useConversas()`
- Servico: `src/services/whatsapp.ts` (sendWhatsAppMessage, getWhatsAppConnectionStatus)

## Webhook UAZAPI — auto-configuração (2026-06-15)
- Edge `configurar-webhook-caixa(caixa_id)`: resolve url+token da caixa e faz `POST {uazapi_url}/webhook` com `{enabled:true, url:".../webhook-whatsapp-inbox?caixa_id=<id>", events:["messages","messages_update"], excludeMessages:["wasSentByApi"]}`. UAZAPI only (WAHA retorna não-suportado).
- **GOTCHA**: `POST /webhook` da UAZAPI cria o webhook com `enabled:false` por padrão — SEMPRE incluir `enabled:true`. Conferir com `GET /webhook` (retorna array; `null` = sem webhook = não recebe nada).
- `CaixasManager`: ao salvar caixa UAZAPI ativa, invoca a edge automaticamente (conecta o recebimento sem colar URL manual). Botão Zap por caixa = "Reconectar webhook".
- Sintoma de webhook ausente: `webhook_debug_log` sem linhas + recebidas não aparecem (envio funciona, recebimento não). `admin_conversas`/`admin_mensagens` já estão na publication `supabase_realtime` (realtime OK no banco).
- **MÚLTIPLOS webhooks por instância** (UAZAPI suporta): `POST /webhook` com `action:"add"` (sem `id`, cria novo) / `"update"` (com `id`) / `"delete"` (com `id`). `GET /webhook` retorna o array de todos. Permite a MESMA instância entregar para 2+ destinos.
- **Incidente recebimento parado (diag. 2026-06-30, parou ~25-26/06)**: caixa 3 "Sol - Sucesso do Aluno" não recebia no inbox. Causa: o ÚNICO webhook da instância apontava para o VPS da **Lia** (`http://89.116.73.186:3001/uazapi-webhook/<token>`), desviando tudo do Supabase. NÃO era verify_jwt (está `false`, correto) nem RLS. Instância estava `connected`. Fix: `action:"add"` do webhook do Supabase (sem remover o da Lia) + `action:"update" enabled:true` → **webhook duplo** (Lia responde no VPS + LA Report registra no inbox). Diagnóstico rápido: `GET {uazapi_url}/webhook` e conferir se a URL do Supabase está lá e `enabled:true`. LA Report NÃO tem autoreply na caixa 3 (sem resposta dobrada).
- **ATUALIZAÇÃO 2026-07-05 (supera a nota acima)**: caixa 3 renomeada **"Lia - Sucesso do Aluno"** (número `552123425316`, token `3a536b03…`). A **Lia (VPS `la-hq`, runtime Hermes) NÃO usa mais webhook** — recebe por **SSE**: a bridge `/home/lia/uazapi-bridge/bridge.js` (porta 3001, `hermes-gateway-lia.service`) abre conexão outbound persistente `GET {uazapi_url}/sse?token=…&events=messages`. O endpoint `/uazapi-webhook` da bridge é só fallback (ninguém aponta pra ele). Logo o UAZAPI faz **fan-out**: webhook→LA Report **+** SSE→Lia, em paralelo, canais independentes. Consequências: (1) mexer/remover webhook NÃO afeta a Lia. (2) Achado nesse dia: a instância tinha **2 webhooks DUPLICADOS** ambos→`webhook-whatsapp-inbox?caixa_id=3` (um `["messages","messages_update"]`, outro só `["messages"]`) → cada entrada processada 2× (inócuo p/ a caixa: UNIQUE index em `crm_mensagens`/`admin_mensagens.whatsapp_message_id` descarta a 2ª; mas inflava `webhook_debug_log` 2× + 2× invocação + risco de transcrição 2×). **Removido o duplicado** (`action:"delete"` do só-`messages`), mantido o `messages`+`messages_update`. Origem do duplicado: config manual/externa (a edge `configurar-webhook-caixa` sempre manda os 2 eventos, então não foi ela). (3) **`excludeMessages:["wasSentByApi"]` — RESOLVIDO 2026-07-06**. O filtro fazia as mensagens enviadas via API (respostas da Lia via `/send/text` pela bridge; a Lia JÁ responde quem está na allowlist `ALLOWED_NUMBERS`, NÃO é Fase 0 total) não voltarem pelo webhook → respostas da Lia sumiam da caixa (conversa aparecia só com o lado do aluno — provado via UAZAPI `POST /message/find`: `fromMe:true` "Oi, Hugo. Estou aqui." existia no WhatsApp mas não na caixa). **Fix (2 partes):** (a) o webhook JÁ grava saídas em caixa admin (`webhook-whatsapp-inbox` linha ~1004: `if (fromMe && !isAdminCaixa) continue` — só pula fromMe em CRM) e conta com dedup por `whatsapp_message_id`, mas o dedup usava **igualdade exata** e os formatos divergem: `enviar-mensagem-admin` grava `uazapiData.id` = `<numero>:<hash>` (COM prefixo) e o webhook grava `messageid` (SEM prefixo) → o eco da própria saída NÃO era reconhecido → duplicaria. Criado **trigger `trg_normalizar_wa_msg_id`** (função `normalizar_whatsapp_message_id()`, BEFORE INSERT OR UPDATE OF whatsapp_message_id em `admin_mensagens` E `crm_mensagens`) que remove o prefixo `^[0-9]+:` → formato unificado sem prefixo → dedup por igualdade exata passa a funcionar. (b) Removido `excludeMessages` (agora `[]`) do webhook da caixa 3 (`action:"update"` id `r0cf4360375a7ff`). Resultado testado (payloads sintéticos no webhook, sem enviar msg real): eco de saída existente → dedup (1 linha); resposta nova da Lia → gravada como `saida`. **Efeito colateral (desejável):** mensagens automáticas enviadas pela caixa 3 (pesquisas, boas-vindas) que não eram gravadas localmente agora também aparecem via eco. Sem loop (webhook não reenvia; caixa 3 sem autoreply).

## Caixa de Entrada Administrativa
- Tabelas: `admin_conversas` (1 por aluno por unidade, RLS por unidade; `unidade_id` é NULLABLE desde 2026-06-12) + `admin_mensagens` (CASCADE)
- **Caixa "Todas as unidades"** (2026-06-12): caixa admin com `whatsapp_caixas.unidade_id=NULL` (select grava sentinel `'todas'` → null). Webhook roteia admin mesmo sem unidade fixa, busca aluno GLOBAL e grava conversa na unidade real do aluno. Contato não-aluno → conversa com `unidade_id=NULL` + `aluno_id=NULL` (não-cadastrado); RLS (`NULL IN (...)`=falso) deixa visível só p/ admin. Inbox unificada quando filtro global='todos': `useAdminConversas` não filtra unidade, `AdminInboxList` mostra badge de unidade / "Sem unidade". Nova conversa bloqueada no modo todos.
- **Departamento** (2026-06-12, webhook v39): `whatsapp_caixas.departamento` + `admin_conversas.departamento` ('administrativo' | 'sucesso_aluno', CHECK). Índices únicos da conversa agora incluem departamento: `idx_admin_conversas_aluno_unidade_depto (aluno_id,unidade_id,departamento) WHERE aluno_id NOT NULL` e `idx_admin_conversas_externo_unidade_depto (telefone_externo,unidade_id,departamento) NULLS NOT DISTINCT WHERE aluno_id NULL`. Mesmo aluno pode ter 1 conversa por departamento. CaixasManager: select Departamento aparece quando funcao='administrativo' (dropdowns migrados p/ Radix `@/components/ui/select`). Caixa de Entrada: abas `[Administrativo][Sucesso do Aluno]` filtram `useAdminConversas` por departamento. **Fase 2 PENDENTE**: liga/desliga robô por botão (flag no banco + Sol na VPS respeitar, via la-agents). Sucesso do Aluno = Sol + humano; todas as caixas devem poder ter robô.
- RPC: `admin_conversa_nova_mensagem(p_conversa_id, p_preview, p_whatsapp_jid)` — incrementa nao_lidas atomicamente
- Caixas com `funcao='administrativo'` roteiam msgs do webhook para admin_conversas/admin_mensagens
- Edge Function: `enviar-mensagem-admin` (texto+midia via UAZAPI)
- Webhook: `webhook-whatsapp-inbox` estendido — detecta caixa admin e roteia para alunos
- Hooks: `useAdminConversas()`, `useAdminMensagens()` (com Realtime)
- Componentes: `src/components/App/Administrativo/CaixaEntrada/` (CaixaEntradaTab, AdminInboxList, AdminChatPanel, NovaConversaModal)
- Gravacao de audio: botao Mic (quando textarea vazio) → MediaRecorder API → envia como `tipo: 'audio'` → ptt no WhatsApp
- Widget sentinel: `useWidgetOverlapSentinel()` esconde AdminToolsHub/AuditoriaWidget quando o elemento entra na viewport. ⚠️ `registerSentinel` é singleton (observa 1 elemento) — `BottomSentinel` global do AppLayout compete e geralmente vence, furando o sentinel das páginas. Para esconder de forma confiável use `useForceHideWidgets(ativo)` (imperativo, contador). `CaixaEntradaTab` usa `useForceHideWidgets(!!conversaSelecionada)`.
- Permissao: `administrativo.caixa-entrada`

## Sync Matrículas Emusys + Conciliação (2026-06-23)
- Edge **`sync-matriculas-emusys`** (v13, verify_jwt=true, **dry-run** via env `SYNC_MATRICULAS_DRYRUN` default true): varredura `GET /matriculas` (status=todas, throttle 1.1s) por unidade (`?u=cg|recreio|barra`). Motor `reconciliar()` puro → `{upd(AUTO), divergencias[], detalhes.diffs}`. AUTO (só aplica se NÃO dry-run): status, data_fim, curso_id, professor_atual_id, **valor comercial** (`parcela=cheio−cond`, `desconto_fixo` ignorado/auditado). FILA (`matriculas_divergencias`, gravada SEMPRE mesmo em dry-run): `ambiguo`, `ausente_api`, `disciplina_nao_mapeada`, `valor_divergente`, `classificacao_divergente`.
- **Prévia/sugestão (`auto_preview`, 2026-06-24)**: em dry-run cada mudança AUTO vira 1 linha `auto_preview` por aluno, `campo=''`, `valor_api`={diffs:{campo:{de,para}}, patch:r.upd, status_api}. A aba mostra como **"Sugestão do sync"** (não mais read-only) — selecionável + **Aprovar** (aplica `valor_api.patch` via RPC) + lote. Cleanup a cada rodada; em produção (`!dry-run`) não gera preview e resolve todos.
- **`ambiguo` enriquecido (2026-06-24)**: a edge guarda **TODOS** os candidatos (antes descartava no narrowing por turma) em `valor_api.candidatos[]`, cada um com `{id,status,aluno_id,dia,turmas,curso_id,professor_id,cheio,fixo,cond,parcela,parcela_invalida,data_fim,sugerido_por_turma}`. Coluna `fonte` ('sync'|'sol') e `analise_sol` (texto da auditora IA) em `matriculas_divergencias`.
- **Régua de valor**: `parcela=cheio−cond` (desconto_fixo NÃO entra; ver guard `trg_alunos_valor_parcela_comercial_canonico`). Parcela inválida (`<0` ou API embute fixo no `valor_mensalidade`) → enfileira `valor_divergente` sugerindo a parcela comercial (só se >0). NUNCA grava parcela negativa.
- **Régua de classificação**: bolsista→REGULAR só se paga cheio integral (`liquido===cheio`); REGULAR→bolsista se API `bolsa=true`. Flag `bolsa` da API não é confiável sozinho (parciais vêm bolsa=false).
- **Dedup**: `(aluno_id|tipo)` já com decisão em `matriculas_divergencias_decisoes` não reenfileira. Upsert da fila por `onConflict (aluno_id,tipo_divergencia,campo)`.
- RPC **`get_conciliacao_matriculas(p_unidade_id)`** lê da fila (resolvido=false E sem decisão) → `{resumo, items}` (inclui `fonte`+`analise_sol`). Devolve QUALQUER tipo.
- RPC **`aplicar_conciliacao_decisao(p_divergencia_id,p_aluno_id,p_decisao,p_patch,p_emusys_matricula_id,p_decidido_por)`** (2026-06-24, SECURITY DEFINER): ponto único de escrita das decisões da aba. `decisao` = aprovar|vincular|manter|ignorar. **Trava anti-vínculo-duplicado**: não vincula um `emusys_matricula_id` a 2 alunos da mesma unidade (o campo é text SEM unique). Aplica `p_patch` (whitelist: curso_id, professor_atual_id, valor_cheio, desconto_fixo, desconto_condicional, data_fim_contrato, dia_aula, status, data_saida) + emusys_matricula_id; **valor_parcela fica fora** (trigger recalcula). NÃO fixa campos (segue sincronizando). Registra decisão + resolvido.
- UI: aba **Conciliação Emusys** (`ConciliacaoMatriculas.tsx`) — nada é alterado sem o usuário aprovar. `auto_preview` = "Sugestão do sync" aprovável (Aprovar/Manter/Ignorar + lote). `ambiguo` = **cartões por candidato** (dia/turma/curso/professor/parcela, badge sugerido, aviso homônimo se aluno_id distinto) com botão **Vincular** → RPC `vincular` (escopo: só linhas existentes). Mostra `analise_sol` quando houver. `valor_divergente`/`classificacao_divergente` mantêm Aplicar/Editar/Reclassificar via `resolverDivergencia` (esse ainda fixa em `matriculas_campos_fixados`).
- Frente 1 (pontual): `complementarDescontoMatricula` em `processar-matricula-emusys` complementa desconto na matrícula nova/renovação (conservador).
- **Sol como auditora (2026-06-24, esteira)**: a edge é o scanner determinístico (`fonte='sync'`); a **Sol** (agente OpenClaw na VPS la-hq) investiga os `ambiguo` e escreve só `analise_sol` (proposta) — humano decide na tela. Caminho de escrita: RPC **`sol_registrar_divergencia(p_aluno_id,p_unidade_id,p_emusys_matricula_id,p_tipo_divergencia,p_analise,p_campo,p_valor_api,p_sugestao,p_severidade)`** SECURITY DEFINER, escreve SÓ em `matriculas_divergencias` (enriquece `analise_sol` sem clobber, ou cria com `fonte='sol'`); `GRANT EXECUTE` só ao role `sol_acesso_restrito`. O MCP read-only da Sol NÃO escreve (transação READ ONLY); ela grava via o helper `scripts/sol-conciliacao-write.js` (psql read-write, default dry-run, `--send` grava) seguindo a skill `skills/sol-conciliacao/SKILL.md`. Regra de ouro da skill: mapear curso por `curso_emusys_depara`, NUNCA `cursos.emusys_ids` (falso positivo). Análise roda na subscription dela (OAuth, sem API key). Tokens Emusys dela em `secrets/emusys.env` (CG/Recreio realinhados 24/06). Worker dela `sol-emusys-lareport-monitor.js` é OUTRA auditoria (`/aulas`/agenda → base sol-brain), não confundir.
- **Cron (decisão Hugo 2026-06-23 = opção A "só fila")**: 3 jobs pg_cron `sync-matriculas-{cg,recreio,barra}` (jobids 24/25/26), 1×/dia defasados 20min (02:00/02:20/02:40 UTC = 23:00/23:20/23:40 BRT), `net.http_post` com `?u=<unidade>` + anon key. **Roda em dry-run** (env não setada → default true) → NUNCA toca em `alunos`, só popula a fila. Em dry-run a edge NÃO grava `automacao_log` de AUTO (evita ~250 logs/rodada); em vez disso grava as prévias `auto_preview` (ver acima). Ligar AUTO no futuro: setar `SYNC_MATRICULAS_DRYRUN=false` (validar amostra antes) — aí os previews param de ser gerados e são resolvidos automaticamente.

## Motivo de desinteresse do lead frio — edge `classificar-desinteresse` (2026-07-12)
- **Edge `classificar-desinteresse`** (v1, `verify_jwt=false`, Gemini `gemini-3-flash-preview`; fonte versionada `supabase/functions/classificar-desinteresse/index.ts`). Projeto `ouqwbbermlzqqvtqwlul`.
- **Gatilho**: `followup-cron.sh` na VPS la-hq detecta "estágio 5 do follow-up da Mila enviado há ≥24h sem resposta" e faz `POST {conversation_id, phone, transcript}` fire-and-forget. A edge NÃO acessa Chatwoot — o transcript vem pronto no corpo.
- **2 passos no LLM** (temperature 0, responseSchema): (1) **portão** `tipo_registro` ∈ `lead_frio|agendou_experimental|invalido|fora_do_perfil` (anti-contaminação: só `lead_frio` segue); (2) **motivo** ∈ `preco|financeiro|horario|distancia|concorrente|desistiu|pesquisando|atendimento|sem_sinal|outro` (`sem_sinal`=abstain, "melhor abster que inventar"). Retorna `{tipo_registro, motivo_principal, motivos[], confianca, resumo}`.
- **Match do lead por telefone**: `phoneVariants()` gera 55…/sem-55, casa `leads.telefone`/`leads.whatsapp` via `.or(...).limit(1)`. ⚠️ homônimo de número → grava no primeiro lead retornado.
- **Modos** (body): `dry_run=true` (classifica+match, não grava); **default = event-only** (INSERT `crm_lead_historico`); `write_temperatura=true` (**fase 2, default OFF**: além do evento, UPDATE `leads.temperatura='frio'` só se `tipo_registro='lead_frio'`).
- **Escrita**: INSERT em `crm_lead_historico` `tipo='desinteresse_frio'`, `descricao=resumo`, `dados` jsonb = `{tipo_registro, motivo_principal, motivos, confianca, fonte:'ia', modelo, conversation_id}`. `created_by` fica NULL. **Idempotência**: pula se já existe evento do `lead_id` com `dados @> {conversation_id}`. `crm_lead_historico.lead_id` é NOT NULL → sem match de telefone não grava (`motivo_nao_gravou:'sem_match_telefone'`).
- **Impacto no report (verificado read-only 2026-07-12, não quebra)**:
  - `leads.temperatura` CHECK = `quente|morno|frio` → `'frio'` válido. Já vivo: ~108 frio / 25 morno / 7.942 quente. Frontend Pré-Atendimento já consome (`DashboardTab` contador frios, `PipelineTab`/`LeadDrawer`/`InboxList`/`LeadSidebar` badge `TemperaturaTag`, `LeadsTab` filtro). Ligar `write_temperatura` "acende" o dado sem tocar no front.
  - `crm_lead_historico.tipo` SEM CHECK constraint → aceita `desinteresse_frio` livremente. `LeadDrawer.tsx:477` renderiza `iconeMap[item.tipo] || '•'` (bullet genérico, sem ícone dedicado ainda).
  - **Nenhuma função/view de KPI usa `temperatura`** (só `resetar_teste_mila`) → marcar frio NÃO remove lead de funil/conversão/dashboard comercial. Efeito 100% visual.
- **Pendente**: reversão frio→quente quando o lead volta a responder (hoje não reverte no report — o webhook da Mila só mexe no `lead_threads` dela). Sugestão: reconciliação periódica (lead frio com inbound recente → volta quente). Enquanto rodar event-only não é problema; só antes de ligar `write_temperatura`.
- **Migration fora do report**: valor `'classificado'` add à check de `mila.followup_queue.status` (marcador de idempotência do cron) — no Supabase da **Mila**, projeto diferente.
- 2 achados de análise (roteiro, não código do report): (a) recusa da Mila de passar valores ("melhor vir à escola") mata lead quente → cai como `atendimento`; (b) notificações de aula experimental (outgoing) re-armam o follow-up do SDR → quem marca aula cai na fila de frios (investigar re-arme no `chatwoot-followup-webhook`).
