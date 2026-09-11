# Mapa do sistema — comercial

> Índice geral: [`docs/MAPA-SISTEMA.md`](../MAPA-SISTEMA.md) ·
> Banco: [`docs/banco/detalhe/comercial.md`](../banco/detalhe/comercial.md)

## Comercial (`/app/comercial`)
- **Componentes:** `Comercial/ComercialPage.tsx` (+ `ComercialConciliacaoExperimentais`, `PlanilhaComercial`, `PlanoAcaoComercial`, `TabProgramaMatriculador`, `AlertasComercial`, `FunnelPipelineNav`)
- **Hooks:** `useCompetenciaFiltro`, `useCheckLeadDuplicado`, `useCheckAlunoDuplicado`, `useMatriculadorPrograma`
- **RPCs:** `get_kpis_comercial_canonicos_v2`, `get_conciliacao_experimentais_v2`, `get_experimentais_emusys_operacional_v1`, `pode_gerar_relatorio_comercial_v1`, `buscar_anamnese_pendente`. A aplicação do espelho Emusys usa RPCs privadas: `aplicar_snapshot_experimentais_emusys_admitido_v1` publica a execução cercada do relatório e `aplicar_snapshot_experimentais_emusys_metadados_v1` publica a atualização recorrente somente fora de uma janela protegida. `admitir_refresh_snapshot_experimentais_v1`, `proteger_leitura_snapshot_experimentais_v1` e `finalizar_refresh_snapshot_experimentais_v1` governam o single-flight e a leitura; a conciliação vigente fica no núcleo privado `get_conciliacao_experimentais_snapshot_v1`. Essas RPCs de escrita e coordenação são executáveis somente por `service_role`, enquanto a fachada pública preserva a assinatura e a ACL de `get_conciliacao_experimentais_v2`.
- **Snapshot de experimentais:** `emusys_experimentais_raw` mantém o histórico recebido e marca somente uma linha vigente por `unidade + aula Emusys + participante`. `emusys_experimentais_snapshot_execucoes` registra intervalo, contagens e conclusão de cada lote completo; `emusys_experimentais_refresh_admissoes` serializa atualizações equivalentes por unidade, intervalo, origem e bucket de cinco minutos; `emusys_experimentais_snapshot_publicacoes_vigentes` aponta, sob o lock da unidade, qual execução e cobertura foram publicadas por último. Leituras operacionais e relatórios usam apenas `snapshot_ativo=true`; linhas inativas permanecem exclusivamente como trilha de auditoria. O `payload` versionado contém somente `schema_version`, data, horário, cancelamento, ID da aula e IDs externos do participante. O objeto extensível do Emusys e PII legada são descartados. Usuários authenticated podem ler apenas `id`, `aluno_nome`, `data_aula`, `horario_aula` e `situacao_operacional`, ainda sob RLS de unidade/versão ativa; payload e demais colunas ficam privados ao `service_role`.
- **Conciliação vigente:** os acessos raw do núcleo P24 filtram `snapshot_ativo=true` e vinculam somente por `emusys_lead_id`/`emusys_aluno_id` ou chaves relacionais legadas já materializadas; payload, nome e telefone não criam identidade. `presenca_emusys='ausente'` só é falta quando a situação normalizada é `faltou` (ou no fallback legado sem status), nunca quando `agendada` ou `cancelada`. Reagendamento compara `data + horário` e aceita qualquer estado posterior conhecido; a linha anterior só é ignorada quando não existe presença nem falta raw ativa. A fachada mantém a autorização P23, o cap comercial P21 e a correção de sobra pequena P22, acrescentando a fonte `snapshot_ativo_p24`.
- **Atualização sob demanda:** `sync-presenca-emusys` aceita o modo leve `experimentais` com `unidade_id`, `data_inicio` e `data_fim` explícitos (UUID conhecido e no máximo 45 dias). Somente o bearer interno pode executar `experimentais`, `agenda` ou `metadados`; usuários comuns ficam limitados a `presenca`, uma unidade exata e à RPC `pode_sincronizar_presenca_emusys_v1` (`alunos.ver` fora do perfil da própria unidade). Corpo, modo e alvo são validados antes de criar cliente administrativo ou carregar token Emusys. O modo experimental pagina o intervalo inteiro, aplica uma única fotografia pela RPC privada e somente depois reconcilia por IDs Emusys escopados pela unidade. Quando o relatório fornece a execução já admitida, o sync usa exatamente esse UUID e não cria uma segunda versão. O modo `metadados` continua atualizando `aulas_emusys`; sua publicação raw é adiada, sem reconciliação parcial, quando coincide com a janela de leitura de um relatório, e volta a ocorrer normalmente depois dela. Curso vem do de-para canônico da própria unidade e o horário é normalizado antes das chaves de negócio. A orquestração pura e injetável fica em `_shared/sync-experimentais-mode.ts`; a edge mantém apenas os adapters Emusys/Supabase. A resposta expõe apenas unidade, intervalo, execução e contagens; não inclui nomes, telefones, nascimento ou payload bruto.
- **Documento comercial unificado:** `_shared/relatorio-comercial.ts` é o contrato puro do texto diário consumido pelo gerador. Ele reúne as dez seções aprovadas — cabeçalho, resumo diário, mês/metas, funil, registros do dia, canais/cursos, agenda futura, alertas, lista detalhada e fontes/snapshot — sem consultar banco nem Emusys. Os dois tickets são calculados sobre a mesma coorte agrupada da lista detalhada, com parser monetário único, valores brutos até a média final e denominadores positivos independentes; a meta `ticket_medio` pertence somente às parcelas. A agenda converte data/hora pelo fuso IANA `America/Sao_Paulo`, considera apenas snapshot ativo, situação `agendada`, início estritamente futuro e até D+7, limita a dez itens e nunca admite evento do mesmo dia sem horário. Duplicata só é removida quando `emusysAulaId + participanteChave` coincidem; nome e curso não são identidade. Textos dinâmicos são normalizados antes de entrar na marcação WhatsApp e números não finitos viram zero. Pendências de conciliação acrescentam aviso à taxa e não bloqueiam sua publicação.
- **Orquestração do relatório diário:** `relatorio-admin-whatsapp` admite primeiro o refresh por `unidade + intervalo + origem + bucket de cinco minutos`. A primeira chamada recebe `atualizar`; chamadas equivalentes aguardam ou reutilizam a mesma execução completa, sem novo GET nem nova versão. Antes de qualquer leitura, atualização e reuso passam pelo mesmo lock do writer: a execução ainda vigente recebe lease de sessenta segundos; uma execução já substituída é promovida para novo refresh. Writers admitidos sobrepostos são ordenados no mesmo lock, de modo que prévia e cron não substituem uma leitura em curso; o lote em espera é reaplicado sem novo GET. Uma falha bloqueia novo acesso ao provedor até o lease vencer. Lease expirado é recuperável; se o snapshot já foi aplicado antes de uma interrupção do chamador, a admissão se autocorrige para `completo` e reutiliza o UUID. Prévia e cron usam origens separadas para que um preview recente não substitua a coleta programada. Depois desse gate, o relatório atualiza o snapshot Emusys da unidade, do primeiro dia da competência até D+7, e falha fechado se HTTP, JSON, status, unidade, intervalo ou execução não forem confirmados. Só então lê, em paralelo e com timeout inferior ao lease, KPIs, conciliação, operação Emusys, metas, agenda futura, lançamentos do dia e matrículas detalhadas nas fontes canônicas; joins por IDs externos permanecem escopados por `unidade_id`, inclusive sob `service_role`, e não há uso de `get_dados_comercial_ia`. Os limites diários de `created_at` são instantes UTC calculados a partir do início de cada data civil em `America/Sao_Paulo`, sem offset `-03` fixo e com suporte ao horário de verão histórico. A agenda raw seleciona exclusivamente o `snapshot_execucao_id` confirmado pelo preflight e repete a confirmação operacional após a leitura para detectar substituição concorrente. Prévia e cron chamam o mesmo gerador: a prévia exige JWT válido e `pode_gerar_relatorio_comercial_v1` para uma única unidade, enquanto o cron exige `service_role` e grava somente em `fila_relatorios_whatsapp`. A fila identifica `relatorio_admin` e `relatorio_comercial` em `tipo_relatorio`; sua unicidade por `tipo + unidade + JID + dia` permite os dois documentos no mesmo destino e deduplica cada tipo separadamente. A fila manual `fila_relatorios_sol_hermes` não participa desse fluxo.
- **Consumo na tela:** o gerador diário de `ComercialPage.tsx` exige uma unidade específica e chama somente `relatorio-admin-whatsapp` em `dry_run_comercial`, com `unidade` e `data_referencia`. A edge exige uma data de calendário estrita em `YYYY-MM-DD` e devolve `400` para ausência, timestamp, offset ou data impossível. Essa data civil governa o cabeçalho, o dia consultado e a janela do primeiro dia do mês até D+7; ela não injeta nem substitui o relógio. O instante real de geração do servidor, resolvido em `America/Sao_Paulo`, governa `referencia.hora`, o rodapé `Gerado em` e o corte estritamente futuro da agenda. A injeção de instante existe apenas na assinatura interna para testes determinísticos e não é aceita no payload. O cron não recebe data externa e deriva também a data civil do instante atual. A tela não chama o sync nem as três RPCs comerciais para montar esse documento; exibe exatamente o `texto` devolvido pela edge e o associa a uma origem imutável com tipo, unidade, período, datas e competência. Copiar e enfileirar só ficam disponíveis enquanto essa origem coincide com o contexto atual, e o enqueue usa a unidade armazenada com o texto. IDs independentes de geração e envio invalidam respostas atrasadas, inclusive após regeneração na mesma origem; sucesso/erro de envio são limpos em nova geração, troca de contexto, retorno ou fechamento. O gerador mensal também é servidor: usa `dry_run_mensal_comercial` e o snapshot fechado. Apenas semanal, matrículas e comparativos permanecem locais.
- **Edge functions:** `gemini-insights-comercial` (plano de ação IA), `relatorio-admin-whatsapp`

## Pré-Atendimento (`/app/pre-atendimento`)
CRM de leads + inbox WhatsApp (UAZAPI). Orquestrador `PreAtendimento/PreAtendimentoPage.tsx`; abas Leads, Pipeline (kanban), Agenda, Dashboard, Metas, Relatórios, Conversas, Mila, Automação, Config.
- **Hooks:** `useLeadsCRM` (central), `useConversas`, `useMensagens`, `useWhatsAppStatus`, `useWhatsAppCaixas`, `useNotificacoes`, `useVisitas`, `useCheckLeadDuplicado`
- **RPCs:** `marcar_conversa_lida`, `toggle_mila_conversa`, `calcular_tempo_medio_resposta_crm`
- **Edge functions:** `enviar-mensagem-lead`, `whatsapp-status`, `whatsapp-connect`, `listar-instancias-uazapi`, `configurar-webhook-caixa`, `buscar-foto-perfil`, `relatorio-admin-whatsapp`, `sync-feriados`

## Campanhas (`/app/campanhas`)
Disparo de templates Meta (WhatsApp Cloud API) + conversas + agentes IA. `Campanhas/CampanhasPage.tsx`; abas Campanhas, Dashboard, Conversas, Analytics, Agentes, Templates, Config.
- **Hooks:** `useCampanhas`, `useKPIsCampanha`, `useConversasCampanha`, `useContatosCampanha`, `useAgentes`, `useNumerosMeta`, `useTemplatesMeta`, `useCampanhasConfig`
- **RPCs:** nenhuma
- **Edge functions:** `enviar-campanha`, `controle-campanha` (pausa/retoma), `enviar-mensagem-meta`, `gerenciar-templates`, `sincronizar-templates`, `gerar-prompt-agente`

## Tráfego Pago (`/app/trafego-pago`)

Atribuição de anúncio Meta Ads **e desempenho de mídia do Google Ads**, em duas abas
que dividem o mesmo seletor de período. **Não confundir com Campanhas** (WhatsApp Cloud API).

- **Componentes:** `TrafegoPagoPage.tsx` (aba Meta + seletor) e `SecaoGoogleAds.tsx` (aba Google)
- **Hooks:** `usePaginacaoTabela`, `useWidgetOverlapSentinel`, `useSetPageTitle`
- **Edge functions:** `meta-ads-insights` (proxy read-only da Graph API; gasto, CTR,
  alcance, funil, tendência diária, por anúncio, por posicionamento, demográfico e região)
  e `google-ads-insights` (proxy read-only da API do Google Ads, 9 consultas GAQL em
  paralelo: conta, campanhas, tendência diária, conversões por ação, dispositivo, rede,
  idade, gênero, grupos de ativos)
- **Alimentado por:** `registrar-atribuicao-meta-ads` (tempo real, via n8n),
  `varrer-atribuicao-meta-ads` (rede de segurança, de hora em hora) e
  `enriquecer-meta-ads` (cron 05:10 BRT, popula `meta_ads_cache`)
- **Tabelas:** `meta_ads_cache`, `leads.meta_ad_source_id`, `leads.meta_ctwa_clid`

⚠️ **Acesso restrito em 3 camadas**: `TrafegoPagoGuard` em [router.tsx:44](../../src/router.tsx#L44)
(lista fixa de e-mails), filtro no `AppSidebar` e **gate de e-mail dentro da própria
edge** — este último protege o custo de mídia contra chamada direta à API.

⚠️ Métricas vivas (gasto) **nunca** são persistidas por lead — sempre consulta na hora.

### Google Ads na aba (desde 2026-09-11)

⚠️ **`google-ads-insights` ≠ `capturar-google-ads-diario`.** A primeira é proxy ao vivo e
não grava nada; a segunda GRAVA em `google_ads_metricas_diarias` e é a **memória** do gasto,
usada pelo radar de tráfego para dividir custo por leads. Reusam os **mesmos secrets**, então
trocar o refresh token num lugar conserta os dois — não há credencial duplicada.

⚠️ **A conta do Google é UMA para as três unidades.** O recorte por unidade sai do NOME da
campanha (`[CG]`, `[BARRA]`, `[RECREIO]`), e é informação que só existe desse lado — a
campanha do Meta é "Todas as unidades". Campanha sem marca reconhecível aparece como
"Sem unidade", nunca atribuída por chute.

🔴 **Conversão do Google NÃO é comparável com conversa do Meta** e o aviso é permanente na
tela, não tooltip: no Meta é conversa de WhatsApp, no Google é a ação configurada na conta
(que inclui rotas, visita à loja e view no YouTube). Como as duas viraram abas do mesmo
layout, o convite a comparar é imediato. Cada plataforma serve para acompanhar a si mesma.

⚠️ **O KPI conta metas primárias; o painel "por ação" soma TODAS** (779,7 × 1.545,7 em
30 dias). Não fecham por construção — a API não oferece o recorte por ação dentro de
`conversions`. A tela declara os dois números lado a lado em vez de esconder a diferença.

⚠️ **Não existe detalhe por criativo no Performance Max.** O grão mais fino é o grupo de
ativos, e o painel diz isso — rotular de "criativo" faria parecer comparável com o Meta.

⚠️ **Nunca mandar `login-customer-id`.** A API responde `403 USER_PERMISSION_DENIED` com
mensagem que sugere o contrário. Medido duas vezes por caminhos independentes (03/09 e
11/09): `listAccessibleCustomers` devolve só `customers/7179097170` e a conta é alcançada
**direto**. O secret `GOOGLE_ADS_LOGIN_CUSTOMER_ID` não existe, e o código só envia o header
se existir. O MCC `164-091-0901` do registro de governança **não gerencia** essa conta.

⚠️ **Versões da API são tentadas em ordem** (`v25,v24,v23,v22`). Medido em 11/09: v22-v25
vivas, v17-v21 devolvem **404**. Versão fixa aposentada viraria "a aba do Google parou".

⚠️ **KPI e gráfico podem divergir por centavos no dia corrente** — são consultas paralelas e
o gasto de hoje sobe entre elas (medido: R$ 0,16 em R$ 3.130). Com `campaign.id` na consulta
o total fecha **exato** contra a soma das campanhas. Não é bug; não "consertar".

⚠️ A aba do Meta **só consulta quando está à vista** (`plataforma !== 'meta'` sai do efeito):
cada chamada custa requisição na Graph API.
