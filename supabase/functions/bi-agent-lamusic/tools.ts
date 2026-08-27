// Tools do agente BI — migradas do frontend para server-side (Deno)
// Todas são SOMENTE LEITURA (SELECT)

export interface AgentContext {
  isAdmin: boolean;
  unidadeId: string | null;
  unidadeNome: string | null;
  fileData?: Record<string, string>[]; // Dados do arquivo enviado pelo usuário (rows como objetos)
}

// Schema das tools para OpenAI function calling
export const TOOLS_SCHEMA = [
  {
    type: 'function' as const,
    function: {
      name: 'get_unidades',
      description: 'Lista todas as unidades (escolas) ativas da LA Music.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_dados_mensais',
      description: 'Métricas mensais: alunos pagantes, matrículas, evasões, churn, ticket médio, faturamento. Filtra por ano e opcionalmente mês/unidade.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Nome da unidade. Se vazio, retorna todas.' },
          ano: { type: 'number', description: 'Ano (ex: 2026). Obrigatório.' },
          mes: { type: 'number', description: 'Mês (1-12). Opcional.' },
        },
        required: ['ano'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_aluno',
      description: 'Busca alunos por NOME DO ALUNO. NÃO use para buscar por professor — para alunos de um professor, use consultar_banco com JOIN professores.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome ou parte do nome.' },
          unidade_nome: { type: 'string', description: 'Filtrar por unidade (opcional).' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_resumo_unidade',
      description: 'Resumo em tempo real: alunos ativos, distribuição por status, ticket médio cru, faturamento estimado.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Nome da unidade. Obrigatório.' },
        },
        required: ['unidade_nome'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_movimentacoes',
      description: 'Movimentações (evasão, renovação, trancamento, aviso prévio) por unidade e período.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Nome da unidade.' },
          ano: { type: 'number', description: 'Ano.' },
          mes: { type: 'number', description: 'Mês (opcional).' },
        },
        required: ['unidade_nome', 'ano'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_leads',
      description: 'Busca leads por nome, unidade, status ou período. Retorna dados completos do funil.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do lead.' },
          unidade_nome: { type: 'string', description: 'Filtrar por unidade.' },
          status: { type: 'string', description: 'Status: novo, experimental_agendada, experimental_realizada, convertido.' },
          data_inicio: { type: 'string', description: 'Data início (YYYY-MM-DD).' },
          data_fim: { type: 'string', description: 'Data fim (YYYY-MM-DD).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_leads_hoje',
      description: 'Leads que chegaram hoje. Ideal para relatório diário.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Filtrar por unidade.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_funil_leads',
      description: 'Estatísticas do funil por leads. Retorna Lead→Matrícula; taxa Experimental→Matrícula está bloqueada como KPI oficial.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Filtrar por unidade.' },
          data_inicio: { type: 'string', description: 'Data início (YYYY-MM-DD).' },
          data_fim: { type: 'string', description: 'Data fim (YYYY-MM-DD).' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_presenca_canonica',
      description: 'Consulta presença canônica agregada por unidade e data. Sempre retorna período, universo, regra, estado de publicação e frescor; dados inseguros ficam Em auditoria.',
      parameters: {
        type: 'object',
        properties: {
          unidade_nome: { type: 'string', description: 'Nome da unidade. Para não-admins, a unidade autenticada prevalece.' },
          data: { type: 'string', description: 'Data de referência (YYYY-MM-DD).' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'consultar_banco',
      description: 'Executa SQL SELECT genérico. Use quando nenhuma outra tool atende. APENAS SELECT permitido, limite 200 linhas. Presença só pode usar vw_presenca_ocorrencia_canonica_v2; prefira get_presenca_canonica. O filtro de unidade é aplicado automaticamente para não-admins.',
      parameters: {
        type: 'object',
        properties: {
          sql_query: { type: 'string', description: 'Query SELECT a executar.' },
        },
        required: ['sql_query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listar_tabelas',
      description: 'Lista TODAS as tabelas e views do banco em tempo real. Retorna nome e contagem estimada de linhas.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'descobrir_schema',
      description: 'Descobre colunas e tipos de tabelas do banco. Use quando precisar consultar uma tabela que não está no schema conhecido, ou para descobrir a estrutura de tabelas novas (ex: campanhas, crm, conversas).',
      parameters: {
        type: 'object',
        properties: {
          filtro: { type: 'string', description: 'Filtro por nome da tabela (ex: "campanha", "crm", "conversa"). Se vazio, lista todas.' },
          tabelas: { type: 'string', description: 'Nomes exatos de tabelas separados por vírgula (ex: "conversas_campanha,mensagens_campanha"). Retorna colunas detalhadas dessas tabelas.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'comparar_arquivo_com_banco',
      description: 'Compara dados de um arquivo enviado pelo usuário com uma tabela do banco. Faz match em lote (SQL IN) — preciso e rápido. Use SEMPRE que o usuário enviar arquivo e quiser comparar com o banco. Retorna: encontrados, faltantes no banco, faltantes no arquivo, contagens.',
      parameters: {
        type: 'object',
        properties: {
          coluna_arquivo: { type: 'string', description: 'Nome da coluna do arquivo a comparar (ex: "Aluno(a) e Idade", "Nome", "Telefone").' },
          tabela_banco: { type: 'string', description: 'Tabela do banco para comparar (ex: "alunos", "leads", "professores").' },
          coluna_banco: { type: 'string', description: 'Coluna do banco para match (ex: "nome", "telefone").' },
          filtros_banco: { type: 'string', description: 'Filtros SQL adicionais para a tabela do banco (ex: "status = \'ativo\'"). Opcional.' },
        },
        required: ['coluna_arquivo', 'tabela_banco', 'coluna_banco'],
      },
    },
  },
];

// ==================== IMPLEMENTAÇÕES ====================

async function resolverUnidadeId(supabase: any, nome: string): Promise<string | null> {
  const { data } = await supabase
    .from('unidades').select('id').eq('ativo', true)
    .ilike('nome', `%${nome.trim()}%`).limit(1);
  return data?.[0]?.id || null;
}

async function resolverUnidadeEfetiva(
  supabase: any, ctx: AgentContext, nomeArg?: string
): Promise<string | null> {
  if (!ctx.isAdmin && ctx.unidadeId) return ctx.unidadeId;
  if (nomeArg) return await resolverUnidadeId(supabase, nomeArg);
  return null;
}

function normalizarContextoPresenca(data: any, args: any, erro?: string) {
  const contexto = (Array.isArray(data) ? data[0] : data) || {};
  const dadosStatus = contexto.dados_status ?? 'indisponivel';
  const sincronizadoEm = contexto.sincronizado_em ?? null;
  const estadoPublicacao = contexto.estado_publicacao ?? 'bloqueado';
  const publicavelSeguro = dadosStatus === 'atualizados'
    && estadoPublicacao === 'publicavel'
    && Number(contexto.conflitos ?? 0) === 0
    && Number(contexto.revisoes_estruturais ?? 0) === 0;

  return {
    fonte: 'get_presenca_contexto_agente_v1',
    contrato_detalhe: 'vw_presenca_ocorrencia_canonica_v2',
    erro,
    periodo: contexto.periodo ?? { inicio: args.data ?? null, fim: args.data ?? null },
    universo_eventos: contexto.universo_eventos ?? null,
    presentes: contexto.presentes ?? null,
    faltas_confirmadas: contexto.faltas_confirmadas ?? null,
    indeterminados: contexto.indeterminados ?? null,
    conflitos: contexto.conflitos ?? null,
    revisoes_estruturais: contexto.revisoes_estruturais ?? null,
    regra_versao: contexto.regra_versao ?? null,
    dados_status: dadosStatus,
    sincronizado_em: sincronizadoEm,
    estado_publicacao: estadoPublicacao,
    frescor: {
      dados_status: dadosStatus,
      sincronizado_em: sincronizadoEm,
    },
    aviso: publicavelSeguro
      ? undefined
      : 'Em auditoria: não concluir falta nem atribuir culpa operacional.',
  };
}

async function toolGetUnidades(supabase: any): Promise<string> {
  const { data, error } = await supabase.from('unidades').select('id, nome, codigo').eq('ativo', true).order('nome');
  if (error) return JSON.stringify({ erro: error.message });
  return JSON.stringify({ unidades: data });
}

async function toolGetDadosMensais(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  let query = supabase
    .from('dados_mensais')
    .select('unidade_id, ano, mes, alunos_pagantes, alunos_ativos, novas_matriculas, evasoes, churn_rate, ticket_medio, taxa_renovacao, tempo_permanencia, inadimplencia, faturamento_estimado, ticket_medio_passaporte, faturamento_passaporte')
    .eq('ano', args.ano);
  if (args.mes) query = query.eq('mes', args.mes);

  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (uid) query = query.eq('unidade_id', uid);

  const { data, error } = await query.order('mes');
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: 'Nenhum dado encontrado.' });
  return JSON.stringify({ dados_mensais: data, total: data.length });
}

async function toolSearchAluno(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  let query = supabase
    .from('alunos')
    .select('id, nome, status, valor_parcela, is_segundo_curso, cursos:curso_id(nome)')
    .ilike('nome', `%${args.nome.trim()}%`)
    .order('nome').limit(20);

  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (uid) query = query.eq('unidade_id', uid);

  const { data, error } = await query;
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: `Nenhum aluno "${args.nome}" encontrado.` });
  return JSON.stringify({
    alunos: data.map((a: any) => ({
      id: a.id, nome: a.nome, status: a.status, valor_parcela: a.valor_parcela,
      segundo_curso: a.is_segundo_curso, curso: a.cursos?.nome || '-',
    })),
    total: data.length,
  });
}

async function toolGetResumoUnidade(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (!uid) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });

  const [
    { data: kpis, error: kpisError },
    { data: financeiro, error: financeiroError },
    { data: estados, error: estadosError },
  ] = await Promise.all([
    supabase.rpc('get_kpis_alunos_admin_operacional', { p_unidade_id: uid }),
    supabase.rpc('get_kpis_alunos_financeiro_vivo_canonico', { p_unidade_id: uid }),
    supabase
      .from('vw_alunos_estado_operacional_v131')
      .select('status_operacional')
      .eq('unidade_id', uid),
  ]);

  const porStatus: Record<string, number> = {};
  for (const row of estados || []) {
    const status = row.status_operacional || 'desconhecido';
    porStatus[status] = (porStatus[status] || 0) + 1;
  }

  if (kpisError || financeiroError || estadosError) {
    return JSON.stringify({
      erro: kpisError?.message || financeiroError?.message || estadosError?.message,
    });
  }

  const totais = kpis?.totais || {};
  const financeiroUnidade = financeiro?.[0] || {};
  const alunosAtivos = Number(totais.alunos_ativos) || 0;
  const alunosPagantes = Number(financeiroUnidade.alunos_pagantes) || 0;
  const mrr = Number(financeiroUnidade.mrr) || 0;

  return JSON.stringify({
    unidade: args.unidade_nome,
    fonte: 'estado_operacional_v131',
    total_registros: estados?.length || 0,
    alunos_ativos: alunosAtivos,
    alunos_trancados: Number(totais.alunos_trancados) || 0,
    alunos_pagantes: alunosPagantes,
    distribuicao_status: porStatus,
    faturamento_bruto: mrr.toFixed(2),
    ticket_medio_primeiro_curso: alunosPagantes > 0 ? (mrr / alunosPagantes).toFixed(2) : '0',
  });
}

async function toolGetMovimentacoes(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (!uid) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });

  const anoStr = String(args.ano);
  let query = supabase.from('movimentacoes_admin').select('id, tipo').eq('unidade_id', uid);
  if (args.mes) {
    const mesStr = String(args.mes).padStart(2, '0');
    query = query.gte('data', `${anoStr}-${mesStr}-01`).lt('data', args.mes === 12 ? `${args.ano + 1}-01-01` : `${anoStr}-${String(args.mes + 1).padStart(2, '0')}-01`);
  } else {
    query = query.gte('data', `${anoStr}-01-01`).lt('data', `${args.ano + 1}-01-01`);
  }

  const { data, error } = await query;
  if (error) return JSON.stringify({ erro: error.message });
  const porTipo: Record<string, number> = {};
  for (const m of (data || [])) porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1;
  return JSON.stringify({ unidade: args.unidade_nome, periodo: args.mes ? `${args.mes}/${args.ano}` : `${args.ano}`, total: data?.length || 0, por_tipo: porTipo });
}

async function toolSearchLeads(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  let query = supabase
    .from('leads')
    .select('id, nome, telefone, status, temperatura, data_contato, experimental_realizada, converteu, data_conversao, canal_origem:canal_origem_id(nome), curso_interesse:curso_interesse_id(nome), etapa_pipeline:etapa_pipeline_id(nome), unidade:unidade_id(nome)')
    .eq('arquivado', false).order('created_at', { ascending: false }).limit(30);

  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (uid) query = query.eq('unidade_id', uid);
  if (args.nome) query = query.ilike('nome', `%${args.nome.trim()}%`);
  if (args.status) query = query.eq('status', args.status);
  if (args.data_inicio) query = query.gte('data_contato', args.data_inicio);
  if (args.data_fim) query = query.lte('data_contato', args.data_fim);

  const { data, error } = await query;
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: 'Nenhum lead encontrado.' });
  return JSON.stringify({
    leads: data.map((l: any) => ({
      id: l.id, nome: l.nome, telefone: l.telefone, status: l.status,
      temperatura: l.temperatura, canal: l.canal_origem?.nome || '-',
      curso: l.curso_interesse?.nome || '-', etapa: l.etapa_pipeline?.nome || '-',
      unidade: l.unidade?.nome || '-', data_contato: l.data_contato,
      converteu: l.converteu, data_conversao: l.data_conversao,
    })),
    total: data.length,
  });
}

async function toolGetLeadsHoje(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  const agora = new Date();
  const hoje = new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  let query = supabase
    .from('leads')
    .select('id, nome, telefone, status, temperatura, canal_origem:canal_origem_id(nome), curso_interesse:curso_interesse_id(nome), unidade:unidade_id(nome)')
    .eq('data_contato', hoje).eq('arquivado', false).order('created_at', { ascending: false });

  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (uid) query = query.eq('unidade_id', uid);

  const { data, error } = await query;
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: `Nenhum lead hoje.`, data: hoje });
  return JSON.stringify({
    leads_hoje: data.map((l: any) => ({
      nome: l.nome, telefone: l.telefone, status: l.status,
      canal: l.canal_origem?.nome || '-', curso: l.curso_interesse?.nome || '-',
      unidade: l.unidade?.nome || '-',
    })),
    total: data.length, data: hoje,
  });
}

async function toolGetFunilLeads(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  let query = supabase.from('leads').select('id, status, converteu, etapa_pipeline:etapa_pipeline_id(nome)').eq('arquivado', false);

  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (uid) query = query.eq('unidade_id', uid);
  if (args.data_inicio) query = query.gte('data_contato', args.data_inicio);
  if (args.data_fim) query = query.lte('data_contato', args.data_fim);

  const { data, error } = await query;
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: 'Nenhum lead no período.' });

  const porEtapa: Record<string, number> = {};
  let convertidos = 0;
  for (const l of data) {
    const etapa = (l.etapa_pipeline as any)?.nome || 'Sem etapa';
    porEtapa[etapa] = (porEtapa[etapa] || 0) + 1;
    if (l.converteu) convertidos++;
  }
  return JSON.stringify({
    total_leads: data.length, por_etapa: porEtapa, convertidos,
    taxa_lead_matricula: `${data.length > 0 ? ((convertidos / data.length) * 100).toFixed(1) : 0}%`,
    taxa_exp_matricula: 'BLOQUEADA - aguardando regra canonica de presenca/vinculo',
    definicao_taxa_lead_matricula: 'convertidos / total_leads; nao e taxa Experimental -> Matricula',
  });
}

async function toolGetPresencaCanonica(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  const uid = await resolverUnidadeEfetiva(supabase, ctx, args.unidade_nome);
  if (!uid) {
    return JSON.stringify(normalizarContextoPresenca(
      null,
      args,
      `Unidade "${args.unidade_nome || ''}" não encontrada.`,
    ));
  }

  const { data, error } = await supabase.rpc('get_presenca_contexto_agente_v1', {
    p_unidade_id: uid,
    p_data: args.data,
    p_escopo: 'bi',
  });

  return JSON.stringify(normalizarContextoPresenca(data, args, error?.message));
}

async function toolConsultarBanco(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  const { validateSQL } = await import('./sql-validator.ts');
  const validation = validateSQL(args.sql_query);
  if (!validation.valid) return JSON.stringify({ erro: validation.reason });

  const { data, error } = await supabase.rpc('execute_bi_query_lamusic', {
    query_text: args.sql_query,
    p_unidade_id: ctx.isAdmin ? null : ctx.unidadeId,
    max_rows: 200,
  });
  if (error) return JSON.stringify({ erro: error.message });
  const result = data || [];
  if (result.error) return JSON.stringify({ erro: result.error, detalhe: result.detail });
  return JSON.stringify({ resultado: result, total: Array.isArray(result) ? result.length : 0 });
}

const TABELAS_INTERNAS = [
  'bi_agent_config_lamusic', 'bi_query_cache_lamusic', 'bi_query_templates_lamusic',
  'bi_conversations_lamusic', 'bi_messages_lamusic',
  'assistente_ia_config', 'whatsapp_caixas', 'mila_config',
  'usuario_onboarding', 'perfil_permissoes',
];

const TABELAS_PRESENCA_LEGADAS = [
  'aluno_presenca',
  'vw_aluno_presenca_semantica_v1',
  'vw_aluno_frequencia_canonica_v1',
  'vw_absenteismo_aluno',
];
const TABELAS_PRESENCA_CANONICAS = ['vw_presenca_ocorrencia_canonica_v2'];
const MARCADOR_TABELA_PRESENCA = /(?:presenca|frequencia|absenteismo)/iu;

function isTabelaAnaliticaPermitida(nome: string): boolean {
  const normalizado = nome.trim().toLowerCase().replace(/^public\./u, '');
  if (TABELAS_INTERNAS.includes(normalizado) || TABELAS_PRESENCA_LEGADAS.includes(normalizado)) return false;
  if (MARCADOR_TABELA_PRESENCA.test(normalizado)) return TABELAS_PRESENCA_CANONICAS.includes(normalizado);
  return true;
}

async function toolListarTabelas(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc('execute_bi_query_lamusic', {
    query_text: `SELECT t.table_name, pg_stat_user_tables.n_live_tup as linhas_estimadas
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_name`,
    p_unidade_id: null,
    max_rows: 200,
  });

  if (!data || data.error) return JSON.stringify({ erro: data?.error || 'Erro ao listar tabelas' });

  const tabelas = (Array.isArray(data) ? data : [])
    .filter((t: any) => isTabelaAnaliticaPermitida(t.table_name))
    .map((t: any) => ({ tabela: t.table_name, linhas: t.linhas_estimadas || 0 }));

  return JSON.stringify({ tabelas, total: tabelas.length });
}

async function toolDescobrirSchema(supabase: any, args: any): Promise<string> {
  const { filtro, tabelas: tabelasArg } = args;

  if (tabelasArg) {
    // Modo detalhado: colunas de tabelas específicas
    const tableNames = tabelasArg.split(',').map((t: string) => t.trim());
    const bloqueadas = tableNames.filter((tableName: string) => !isTabelaAnaliticaPermitida(tableName));
    if (bloqueadas.length > 0) {
      return JSON.stringify({
        erro: `Relação analítica não permitida: ${bloqueadas.join(', ')}. Para presença use vw_presenca_ocorrencia_canonica_v2 ou get_presenca_canonica.`,
      });
    }
    const { data } = await supabase.rpc('introspect_schema_lamusic', { table_names: tableNames });
    return JSON.stringify({ schema: data || [], tabelas_consultadas: tableNames });
  }

  // Modo listagem: tabelas filtradas por nome
  let sql = `SELECT t.table_name, pg_stat_user_tables.n_live_tup as linhas
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
    WHERE t.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW')`;

  if (filtro) {
    // Buscar tabelas que contêm o filtro OU tabelas relacionadas (ex: "campanha" → conversas_campanha + mensagens_campanha)
    sql += ` AND (t.table_name LIKE '%${filtro.replace(/'/g, "''")}%'`;
    // Incluir tabelas com prefixo/sufixo relacionado
    if (['conversa', 'campanha', 'crm', 'admin', 'mensag'].some(k => filtro.toLowerCase().includes(k))) {
      sql += ` OR t.table_name LIKE '%campanha%' OR t.table_name LIKE '%conversa%' OR t.table_name LIKE '%mensag%'`;
    }
    sql += `)`;
  }
  sql += ` ORDER BY t.table_name`;

  const { data } = await supabase.rpc('execute_bi_query_lamusic', {
    query_text: sql, p_unidade_id: null, max_rows: 100,
  });

  if (!data || data.error) return JSON.stringify({ erro: data?.error || 'Erro ao buscar schema' });

  const tabelas = (Array.isArray(data) ? data : [])
    .filter((t: any) => isTabelaAnaliticaPermitida(t.table_name));

  // Para cada tabela encontrada, buscar colunas
  const tableNames = tabelas.map((t: any) => t.table_name);
  if (tableNames.length > 0 && tableNames.length <= 10) {
    const { data: schemaData } = await supabase.rpc('introspect_schema_lamusic', { table_names: tableNames });
    return JSON.stringify({
      tabelas: tabelas.map((t: any) => ({ tabela: t.table_name, linhas: t.linhas || 0 })),
      schema: schemaData || [],
      total: tabelas.length,
    });
  }

  return JSON.stringify({
    tabelas: tabelas.map((t: any) => ({ tabela: t.table_name, linhas: t.linhas || 0 })),
    total: tabelas.length,
    dica: tabelas.length > 10 ? 'Muitas tabelas. Use o parâmetro "tabelas" com nomes específicos para ver colunas.' : undefined,
  });
}

async function toolCompararArquivoComBanco(supabase: any, args: any, ctx: AgentContext): Promise<string> {
  if (!ctx.fileData || ctx.fileData.length === 0) {
    return JSON.stringify({ erro: 'Nenhum arquivo foi enviado pelo usuário nesta mensagem.' });
  }

  const { coluna_arquivo, tabela_banco, coluna_banco, filtros_banco } = args;

  // Extrair valores da coluna do arquivo
  const fileValues = ctx.fileData
    .map(row => {
      const val = row[coluna_arquivo];
      return val ? String(val).trim() : '';
    })
    .filter(v => v.length > 0);

  if (fileValues.length === 0) {
    const colsDisponiveis = Object.keys(ctx.fileData[0] || {});
    return JSON.stringify({ erro: `Coluna "${coluna_arquivo}" não encontrada no arquivo. Colunas disponíveis: ${colsDisponiveis.join(', ')}` });
  }

  // Tabelas permitidas para comparação
  const tabelasPermitidas = ['alunos', 'leads', 'professores', 'cursos', 'turmas', 'movimentacoes_admin'];
  if (!tabelasPermitidas.includes(tabela_banco)) {
    return JSON.stringify({ erro: `Tabela "${tabela_banco}" não permitida. Use: ${tabelasPermitidas.join(', ')}` });
  }
  if (
    !isTabelaAnaliticaPermitida(tabela_banco)
    || /\bpercentual_presenca\b/iu.test(coluna_banco)
    || /\bpercentual_presenca\b/iu.test(filtros_banco || '')
    || /\baluno_presenca\b/iu.test(filtros_banco || '')
  ) {
    return JSON.stringify({
      erro: 'Porta analítica legada de presença bloqueada. Use get_presenca_canonica.',
    });
  }

  // Buscar dados do banco em blocos (contornar limite de IN clause)
  const BLOCK_SIZE = 200;
  const dbMatches: string[] = [];
  const unidadeFilter = !ctx.isAdmin && ctx.unidadeId ? `AND unidade_id = '${ctx.unidadeId}'` : '';
  const extraFilter = filtros_banco ? `AND ${filtros_banco}` : '';

  for (let i = 0; i < fileValues.length; i += BLOCK_SIZE) {
    const block = fileValues.slice(i, i + BLOCK_SIZE);
    const inClause = block.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
    const sql = `SELECT ${coluna_banco} FROM ${tabela_banco} WHERE ${coluna_banco} IN (${inClause}) ${unidadeFilter} ${extraFilter}`;

    const { data: result } = await supabase.rpc('execute_bi_query_lamusic', {
      query_text: sql, p_unidade_id: null, max_rows: 1000,
    });

    if (result && Array.isArray(result)) {
      for (const row of result) {
        if (row[coluna_banco]) dbMatches.push(String(row[coluna_banco]).trim());
      }
    }
  }

  // Comparação case-insensitive
  const dbMatchesLower = new Set(dbMatches.map(n => n.toLowerCase()));
  const fileValuesLower = fileValues.map(v => v.toLowerCase());

  const encontrados = fileValues.filter(v => dbMatchesLower.has(v.toLowerCase()));
  const faltantesNoBanco = fileValues.filter(v => !dbMatchesLower.has(v.toLowerCase()));

  // Buscar todos do banco para achar quem está no banco mas não no arquivo
  const allDbSql = `SELECT ${coluna_banco} FROM ${tabela_banco} WHERE 1=1 ${unidadeFilter} ${extraFilter}`;
  const { data: allDb } = await supabase.rpc('execute_bi_query_lamusic', {
    query_text: allDbSql, p_unidade_id: null, max_rows: 2000,
  });
  const allDbNames = (allDb && Array.isArray(allDb)) ? allDb.map((r: any) => String(r[coluna_banco]).trim()) : [];
  const fileValuesSet = new Set(fileValuesLower);
  const faltantesNoArquivo = allDbNames.filter((n: string) => !fileValuesSet.has(n.toLowerCase()));

  return JSON.stringify({
    resumo: {
      total_arquivo: fileValues.length,
      total_banco: allDbNames.length,
      encontrados: encontrados.length,
      faltantes_no_banco: faltantesNoBanco.length,
      faltantes_no_arquivo: faltantesNoArquivo.length,
    },
    encontrados: encontrados.slice(0, 50),
    faltantes_no_banco: faltantesNoBanco.slice(0, 50),
    faltantes_no_arquivo: faltantesNoArquivo.slice(0, 50),
    nota: encontrados.length > 50 || faltantesNoBanco.length > 50
      ? 'Listas truncadas em 50 nomes. Use as contagens do resumo para números exatos.'
      : undefined,
  });
}

// ==================== EXECUTOR CENTRAL ====================

export async function executeTool(supabase: any, toolName: string, argsJson: string, ctx: AgentContext): Promise<string> {
  try {
    const args = JSON.parse(argsJson);
    switch (toolName) {
      case 'get_unidades': return await toolGetUnidades(supabase);
      case 'get_dados_mensais': return await toolGetDadosMensais(supabase, args, ctx);
      case 'search_aluno': return await toolSearchAluno(supabase, args, ctx);
      case 'get_resumo_unidade': return await toolGetResumoUnidade(supabase, args, ctx);
      case 'get_movimentacoes': return await toolGetMovimentacoes(supabase, args, ctx);
      case 'search_leads': return await toolSearchLeads(supabase, args, ctx);
      case 'get_leads_hoje': return await toolGetLeadsHoje(supabase, args, ctx);
      case 'get_funil_leads': return await toolGetFunilLeads(supabase, args, ctx);
      case 'get_presenca_canonica': return await toolGetPresencaCanonica(supabase, args, ctx);
      case 'consultar_banco': return await toolConsultarBanco(supabase, args, ctx);
      case 'listar_tabelas': return await toolListarTabelas(supabase);
      case 'descobrir_schema': return await toolDescobrirSchema(supabase, args);
      case 'comparar_arquivo_com_banco': return await toolCompararArquivoComBanco(supabase, args, ctx);
      default: return JSON.stringify({ erro: `Tool "${toolName}" não reconhecida.` });
    }
  } catch (err: any) {
    return JSON.stringify({ erro: `Erro na tool: ${err.message}` });
  }
}
