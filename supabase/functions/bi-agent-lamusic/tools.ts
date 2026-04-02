// Tools do agente BI — migradas do frontend para server-side (Deno)
// Todas são SOMENTE LEITURA (SELECT)

export interface AgentContext {
  isAdmin: boolean;
  unidadeId: string | null;
  unidadeNome: string | null;
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
      description: 'Busca alunos por nome. Retorna nome, status, curso, valor parcela.',
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
      description: 'Estatísticas do funil: contagem por etapa, taxas de conversão.',
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
      name: 'consultar_banco',
      description: 'Executa SQL SELECT genérico. Use quando nenhuma outra tool atende. APENAS SELECT permitido, limite 200 linhas. O filtro de unidade é aplicado automaticamente para não-admins.',
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
      description: 'Lista tabelas e views disponíveis no banco.',
      parameters: { type: 'object', properties: {}, required: [] },
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

  const { data, error } = await supabase
    .from('alunos').select('id, status, valor_parcela, is_segundo_curso').eq('unidade_id', uid);
  if (error) return JSON.stringify({ erro: error.message });
  if (!data?.length) return JSON.stringify({ mensagem: 'Nenhum aluno nesta unidade.' });

  const porStatus: Record<string, number> = {};
  let somaAtivos = 0, countAtivos = 0, countPrimeiro = 0, somaPrimeiro = 0;
  for (const a of data) {
    porStatus[a.status] = (porStatus[a.status] || 0) + 1;
    if (a.status === 'ativo') {
      somaAtivos += (a.valor_parcela || 0); countAtivos++;
      if (!a.is_segundo_curso) { countPrimeiro++; somaPrimeiro += (a.valor_parcela || 0); }
    }
  }
  return JSON.stringify({
    unidade: args.unidade_nome, total_registros: data.length, alunos_ativos: countAtivos,
    alunos_primeiro_curso_ativos: countPrimeiro, distribuicao_status: porStatus,
    faturamento_bruto: somaAtivos.toFixed(2),
    ticket_medio_primeiro_curso: countPrimeiro > 0 ? (somaPrimeiro / countPrimeiro).toFixed(2) : '0',
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
    taxa_conversao: `${data.length > 0 ? ((convertidos / data.length) * 100).toFixed(1) : 0}%`,
  });
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

async function toolListarTabelas(): Promise<string> {
  const tabelas = [
    { tabela: 'alunos', desc: 'Alunos matriculados — nome, status, curso, valor, unidade' },
    { tabela: 'leads', desc: 'Pipeline comercial — nome, telefone, status, canal, experimental, conversão' },
    { tabela: 'professores', desc: 'Professores ativos' },
    { tabela: 'cursos', desc: 'Cursos oferecidos' },
    { tabela: 'unidades', desc: 'Escolas da rede (CG, Recreio, Barra)' },
    { tabela: 'dados_mensais', desc: 'Snapshots mensais: alunos, matrículas, evasões, ticket, faturamento' },
    { tabela: 'movimentacoes_admin', desc: 'Evasões, renovações, trancamentos, aviso prévio' },
    { tabela: 'metas', desc: 'Metas por unidade/ano/mês' },
    { tabela: 'turmas', desc: 'Turmas com professor, curso, horário, capacidade' },
    { tabela: 'canais_origem', desc: 'Canais: Instagram, Google, Indicação, etc.' },
    { tabela: 'tipos_matricula', desc: 'Normal, 2º Curso, Bolsa, Banda' },
    { tabela: 'professor_metas', desc: 'Metas individuais de professores' },
    { tabela: 'professor_acoes', desc: 'Ações agendadas (reunião, treinamento, checkpoint)' },
  ];
  return JSON.stringify({ tabelas, total: tabelas.length });
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
      case 'consultar_banco': return await toolConsultarBanco(supabase, args, ctx);
      case 'listar_tabelas': return await toolListarTabelas();
      default: return JSON.stringify({ erro: `Tool "${toolName}" não reconhecida.` });
    }
  } catch (err: any) {
    return JSON.stringify({ erro: `Erro na tool: ${err.message}` });
  }
}
