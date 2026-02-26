/**
 * agentTools.ts
 *
 * Ferramentas (Tools) que o Agente IA pode invocar via OpenAI Function Calling.
 * IMPORTANTE: Todas as funções são SOMENTE LEITURA (SELECT), NUNCA alteram a base.
 *
 * Cada tool recebe um AgentContext com isAdmin/unidadeId para filtrar dados por permissão.
 */
import { supabase } from '@/lib/supabase';

// ==================== CONTEXTO DE PERMISSÃO ====================

export interface AgentContext {
    isAdmin: boolean;
    unidadeId: string | null;   // null = admin (acesso a todas as unidades)
    unidadeNome: string | null;
}

// ==================== DEFINIÇÕES DAS TOOLS (JSON Schema para OpenAI) ====================

export const AGENT_TOOLS_SCHEMA = [
    {
        type: 'function' as const,
        function: {
            name: 'get_unidades',
            description: 'Lista todas as unidades (escolas) ativas da LA Music. Retorna id e nome de cada unidade.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_dados_mensais',
            description: 'Consulta métricas mensais de uma unidade: alunos pagantes, novas matrículas, evasões, churn rate, ticket médio, taxa de renovação, tempo de permanência, inadimplência, faturamento estimado, ticket médio passaporte e faturamento passaporte. Pode filtrar por unidade, ano e mês.',
            parameters: {
                type: 'object',
                properties: {
                    unidade_nome: {
                        type: 'string',
                        description: 'Nome da unidade (ex: "Barra", "Campo Grande", "Recreio"). Se vazio ou não informado, retorna todas.'
                    },
                    ano: {
                        type: 'number',
                        description: 'Ano de referência (ex: 2026). Obrigatório.'
                    },
                    mes: {
                        type: 'number',
                        description: 'Mês de referência (1-12). Se não informado, retorna todos os meses do ano.'
                    },
                },
                required: ['ano'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'search_aluno',
            description: 'Busca alunos pelo nome na base de dados. Retorna nome, status, unidade, curso e valor da parcela. Útil para consultar se um aluno existe, qual o status dele, e em que unidade está.',
            parameters: {
                type: 'object',
                properties: {
                    nome: {
                        type: 'string',
                        description: 'Nome (ou parte do nome) do aluno para buscar.'
                    },
                    unidade_nome: {
                        type: 'string',
                        description: 'Filtrar por unidade (opcional). Ex: "Barra".'
                    },
                },
                required: ['nome'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_resumo_unidade',
            description: 'Retorna um resumo de auditoria da unidade em tempo real: total de alunos ativos, total de alunos por status, soma das parcelas, e ticket médio "cru" (raw) calculado. Atenção: este valor de ticket e faturamento difere propositalmente do Dashboard comercial, pois reflete o retrato atual de contratos cadastrados. Use para auditar e reportar a verdadeira média de mensalidades ativas (excluindo bolsas totais 100%).',
            parameters: {
                type: 'object',
                properties: {
                    unidade_nome: {
                        type: 'string',
                        description: 'Nome da unidade (ex: "Barra", "Recreio", "Campo Grande"). Obrigatório.'
                    },
                },
                required: ['unidade_nome'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_movimentacoes',
            description: 'Consulta movimentações de alunos (evasão, renovação, trancamento, aviso prévio, não renovação) de uma unidade em um período. Retorna contagens por tipo de movimentação.',
            parameters: {
                type: 'object',
                properties: {
                    unidade_nome: {
                        type: 'string',
                        description: 'Nome da unidade. Obrigatório.'
                    },
                    ano: {
                        type: 'number',
                        description: 'Ano de referência. Obrigatório.'
                    },
                    mes: {
                        type: 'number',
                        description: 'Mês de referência (1-12). Se não informado, retorna o ano inteiro.'
                    },
                },
                required: ['unidade_nome', 'ano'],
            },
        },
    },
    // ==================== NOVAS TOOLS: LEADS ====================
    {
        type: 'function' as const,
        function: {
            name: 'search_leads',
            description: 'Busca leads (contatos comerciais / potenciais alunos) na base de dados. Pode filtrar por nome, unidade, status, e período. Retorna nome, telefone, status, canal de origem, curso de interesse, etapa do pipeline, temperatura e datas.',
            parameters: {
                type: 'object',
                properties: {
                    nome: {
                        type: 'string',
                        description: 'Nome (ou parte do nome) do lead para buscar.'
                    },
                    unidade_nome: {
                        type: 'string',
                        description: 'Filtrar por unidade (ex: "Barra"). Se não informado e o usuário for admin, retorna todas.'
                    },
                    status: {
                        type: 'string',
                        description: 'Filtrar por status do lead. Valores possíveis: "novo", "experimental_agendada", "experimental_realizada", "experimental_faltou", "convertido".'
                    },
                    data_inicio: {
                        type: 'string',
                        description: 'Data início do período (formato YYYY-MM-DD). Filtra por data_contato.'
                    },
                    data_fim: {
                        type: 'string',
                        description: 'Data fim do período (formato YYYY-MM-DD). Filtra por data_contato.'
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_leads_hoje',
            description: 'Retorna os leads que chegaram HOJE (data de criação de hoje). Ideal para saber quantos e quais contatos novos chegaram no dia.',
            parameters: {
                type: 'object',
                properties: {
                    unidade_nome: {
                        type: 'string',
                        description: 'Filtrar por unidade (ex: "Barra"). Se não informado e o usuário for admin, retorna de todas as unidades.'
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_funil_leads',
            description: 'Retorna estatísticas do funil/pipeline de leads: contagem por etapa (Novo Lead, Mila/SDR Bot, Andreza, Em Contato, Experimental Agendada, Visita Agendada, Experimental Realizada, Visita Realizada, Faltou, Matriculado, Arquivado) e taxas de conversão. Pode filtrar por unidade e período.',
            parameters: {
                type: 'object',
                properties: {
                    unidade_nome: {
                        type: 'string',
                        description: 'Filtrar por unidade (ex: "Barra"). Se não informado e o usuário for admin, retorna consolidado.'
                    },
                    data_inicio: {
                        type: 'string',
                        description: 'Data início do período (formato YYYY-MM-DD). Filtra por data_contato.'
                    },
                    data_fim: {
                        type: 'string',
                        description: 'Data fim do período (formato YYYY-MM-DD). Filtra por data_contato.'
                    },
                },
                required: [],
            },
        },
    },
    // ==================== TOOL GENÉRICA: SQL ====================
    {
        type: 'function' as const,
        function: {
            name: 'consultar_banco',
            description: 'Executa uma consulta SQL SELECT no banco de dados da LA Music. Use esta ferramenta quando nenhuma outra ferramenta específica cobre a informação desejada. APENAS SELECT é permitido — qualquer INSERT/UPDATE/DELETE será rejeitado. Limite de 50 linhas. Principais tabelas: leads, alunos, professores, turmas, cursos, dados_mensais, movimentacoes_admin, evasoes_v2, renovacoes, dados_comerciais, experimentais_mensal_unidade, horarios, crm_pipeline_etapas, canais_origem, crm_lead_historico, crm_followups, loja_vendas, loja_vendas_itens, loja_produtos, inventario, metas, metas_comerciais, farmer_checklists, projetos. Views úteis: vw_funil_conversao_mensal, vw_kpis_comercial_mensal, vw_kpis_professor_mensal, vw_leads_comercial, vw_leads_por_canal, vw_evasoes_resumo, vw_renovacoes_mensal, vw_ranking_unidades, vw_turmas_completa.',
            parameters: {
                type: 'object',
                properties: {
                    sql_query: {
                        type: 'string',
                        description: 'Consulta SQL SELECT a executar. Apenas SELECT permitido. Limite automático de 50 linhas. IMPORTANTE: Se o usuário não é admin, SEMPRE filtre por unidade_id do usuário.'
                    },
                },
                required: ['sql_query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'listar_tabelas',
            description: 'Lista as principais tabelas e views disponíveis no banco de dados, com breve descrição de cada uma. Use para descobrir onde buscar informações antes de usar consultar_banco.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
];

// ==================== IMPLEMENTAÇÕES DAS TOOLS (SOMENTE LEITURA) ====================

async function resolverUnidadeId(nomeUnidade: string): Promise<string | null> {
    const { data } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .ilike('nome', `%${nomeUnidade.trim()}%`)
        .limit(1);
    return data?.[0]?.id || null;
}

/** Retorna o unidade_id efetivo: se não-admin, força a unidade do contexto. */
async function resolverUnidadeEfetiva(ctx: AgentContext, unidadeNomeArg?: string): Promise<{ id: string | null; bloqueado: boolean }> {
    if (!ctx.isAdmin && ctx.unidadeId) {
        // Não-admin: sempre retorna a unidade do contexto, ignora argumento
        return { id: ctx.unidadeId, bloqueado: false };
    }
    if (unidadeNomeArg) {
        const id = await resolverUnidadeId(unidadeNomeArg);
        if (!id) return { id: null, bloqueado: true };
        return { id, bloqueado: false };
    }
    return { id: null, bloqueado: false }; // admin sem filtro = todas
}

async function toolGetUnidades(): Promise<string> {
    const { data, error } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

    if (error) return JSON.stringify({ erro: error.message });
    return JSON.stringify({ unidades: data });
}

async function toolGetDadosMensais(args: { unidade_nome?: string; ano: number; mes?: number }, ctx: AgentContext): Promise<string> {
    let query = supabase
        .from('dados_mensais')
        .select(`
            unidade_id,
            ano,
            mes,
            alunos_pagantes,
            novas_matriculas,
            evasoes,
            churn_rate,
            ticket_medio,
            taxa_renovacao,
            tempo_permanencia,
            inadimplencia,
            faturamento_estimado,
            saldo_liquido,
            ticket_medio_passaporte,
            faturamento_passaporte
        `)
        .eq('ano', args.ano);

    if (args.mes) {
        query = query.eq('mes', args.mes);
    }

    // Filtro de permissão
    if (!ctx.isAdmin && ctx.unidadeId) {
        query = query.eq('unidade_id', ctx.unidadeId);
    } else if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });
        query = query.eq('unidade_id', unidadeId);
    }

    const { data, error } = await query.order('mes');
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum dado encontrado para os filtros informados.' });

    return JSON.stringify({ dados_mensais: data, total_registros: data.length });
}

async function toolSearchAluno(args: { nome: string; unidade_nome?: string }, ctx: AgentContext): Promise<string> {
    let query = supabase
        .from('alunos')
        .select(`
            id,
            nome,
            status,
            valor_parcela,
            is_segundo_curso,
            unidade_id,
            cursos:curso_id!left(nome)
        `)
        .ilike('nome', `%${args.nome.trim()}%`)
        .order('nome')
        .limit(20);

    // Filtro de permissão
    if (!ctx.isAdmin && ctx.unidadeId) {
        query = query.eq('unidade_id', ctx.unidadeId);
    } else if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: `Nenhum aluno encontrado com o nome "${args.nome}".` });

    const resultado = data.map((a: any) => ({
        id: a.id,
        nome: a.nome,
        status: a.status,
        valor_parcela: a.valor_parcela,
        segundo_curso: a.is_segundo_curso,
        curso: a.cursos?.nome || 'Sem curso',
    }));

    return JSON.stringify({ alunos: resultado, total: resultado.length });
}

async function toolGetResumoUnidade(args: { unidade_nome: string }, ctx: AgentContext): Promise<string> {
    let unidadeId: string | null;
    let nomeExibicao = args.unidade_nome;

    if (!ctx.isAdmin && ctx.unidadeId) {
        unidadeId = ctx.unidadeId;
        nomeExibicao = ctx.unidadeNome || args.unidade_nome;
    } else {
        unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });
    }

    const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, status, valor_parcela, is_segundo_curso')
        .eq('unidade_id', unidadeId);

    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum aluno encontrado nesta unidade.' });

    const porStatus: Record<string, number> = {};
    let somaValorAtivos = 0;
    let countAtivos = 0;
    let countPrimeiroCursoAtivos = 0;
    let somaValorPrimeiroCurso = 0;

    for (const a of data) {
        porStatus[a.status] = (porStatus[a.status] || 0) + 1;
        if (a.status === 'ativo') {
            somaValorAtivos += (a.valor_parcela || 0);
            countAtivos++;
            if (!a.is_segundo_curso) {
                countPrimeiroCursoAtivos++;
                somaValorPrimeiroCurso += (a.valor_parcela || 0);
            }
        }
    }

    const ticketMedio = countPrimeiroCursoAtivos > 0
        ? (somaValorPrimeiroCurso / countPrimeiroCursoAtivos).toFixed(2)
        : '0';

    return JSON.stringify({
        unidade: nomeExibicao,
        total_registros: data.length,
        alunos_ativos: countAtivos,
        alunos_primeiro_curso_ativos: countPrimeiroCursoAtivos,
        distribuicao_status: porStatus,
        faturamento_bruto_estimado: somaValorAtivos.toFixed(2),
        ticket_medio_primeiro_curso: ticketMedio,
    });
}

async function toolGetMovimentacoes(args: { unidade_nome: string; ano: number; mes?: number }, ctx: AgentContext): Promise<string> {
    let unidadeId: string | null;
    let nomeExibicao = args.unidade_nome;

    if (!ctx.isAdmin && ctx.unidadeId) {
        unidadeId = ctx.unidadeId;
        nomeExibicao = ctx.unidadeNome || args.unidade_nome;
    } else {
        unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });
    }

    let query = supabase
        .from('movimentacoes_admin')
        .select('id, tipo, data_registro, observacoes')
        .eq('unidade_id', unidadeId);

    const anoStr = String(args.ano);
    if (args.mes) {
        const mesStr = String(args.mes).padStart(2, '0');
        const inicioMes = `${anoStr}-${mesStr}-01`;
        const proximoMes = args.mes === 12 ? `${args.ano + 1}-01-01` : `${anoStr}-${String(args.mes + 1).padStart(2, '0')}-01`;
        query = query.gte('data_registro', inicioMes).lt('data_registro', proximoMes);
    } else {
        query = query.gte('data_registro', `${anoStr}-01-01`).lt('data_registro', `${args.ano + 1}-01-01`);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ erro: error.message });

    const porTipo: Record<string, number> = {};
    for (const m of (data || [])) {
        porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1;
    }

    return JSON.stringify({
        unidade: nomeExibicao,
        periodo: args.mes ? `${args.mes}/${args.ano}` : `${args.ano}`,
        total_movimentacoes: data?.length || 0,
        por_tipo: porTipo,
    });
}

// ==================== NOVAS TOOLS: LEADS ====================

async function toolSearchLeads(
    args: { nome?: string; unidade_nome?: string; status?: string; data_inicio?: string; data_fim?: string },
    ctx: AgentContext,
): Promise<string> {
    let query = supabase
        .from('leads')
        .select(`
            id,
            nome,
            telefone,
            whatsapp,
            status,
            temperatura,
            faixa_etaria,
            data_contato,
            created_at,
            experimental_agendada,
            data_experimental,
            horario_experimental,
            experimental_realizada,
            faltou_experimental,
            converteu,
            data_conversao,
            agente_comercial,
            observacoes,
            canal_origem:canal_origem_id(nome),
            curso_interesse:curso_interesse_id(nome),
            etapa_pipeline:etapa_pipeline_id(nome, slug),
            unidade:unidade_id(nome)
        `)
        .order('created_at', { ascending: false })
        .limit(30);

    // Filtro de permissão
    if (!ctx.isAdmin && ctx.unidadeId) {
        query = query.eq('unidade_id', ctx.unidadeId);
    } else if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);
    }

    if (args.nome) {
        query = query.ilike('nome', `%${args.nome.trim()}%`);
    }
    if (args.status) {
        query = query.eq('status', args.status);
    }
    if (args.data_inicio) {
        query = query.gte('data_contato', args.data_inicio);
    }
    if (args.data_fim) {
        query = query.lte('data_contato', args.data_fim);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum lead encontrado com os filtros informados.' });

    const resultado = data.map((l: any) => ({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone || l.whatsapp,
        status: l.status,
        temperatura: l.temperatura,
        faixa_etaria: l.faixa_etaria,
        canal_origem: l.canal_origem?.nome || 'Desconhecido',
        curso_interesse: l.curso_interesse?.nome || 'Não informado',
        etapa_pipeline: l.etapa_pipeline?.nome || 'Sem etapa',
        unidade: l.unidade?.nome || '',
        data_contato: l.data_contato,
        criado_em: l.created_at,
        experimental_agendada: l.experimental_agendada,
        data_experimental: l.data_experimental,
        horario_experimental: l.horario_experimental,
        experimental_realizada: l.experimental_realizada,
        faltou: l.faltou_experimental,
        converteu: l.converteu,
        data_conversao: l.data_conversao,
        agente_comercial: l.agente_comercial,
        observacoes: l.observacoes,
    }));

    return JSON.stringify({ leads: resultado, total: resultado.length });
}

async function toolGetLeadsHoje(args: { unidade_nome?: string }, ctx: AgentContext): Promise<string> {
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let query = supabase
        .from('leads')
        .select(`
            id,
            nome,
            telefone,
            whatsapp,
            status,
            temperatura,
            faixa_etaria,
            data_contato,
            created_at,
            agente_comercial,
            canal_origem:canal_origem_id(nome),
            curso_interesse:curso_interesse_id(nome),
            etapa_pipeline:etapa_pipeline_id(nome),
            unidade:unidade_id(nome)
        `)
        .gte('created_at', `${hoje}T00:00:00`)
        .order('created_at', { ascending: false });

    // Filtro de permissão
    if (!ctx.isAdmin && ctx.unidadeId) {
        query = query.eq('unidade_id', ctx.unidadeId);
    } else if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: `Nenhum lead chegou hoje${args.unidade_nome ? ` na unidade ${args.unidade_nome}` : ''}.` });

    const resultado = data.map((l: any) => ({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone || l.whatsapp,
        status: l.status,
        temperatura: l.temperatura,
        faixa_etaria: l.faixa_etaria,
        canal_origem: l.canal_origem?.nome || 'Desconhecido',
        curso_interesse: l.curso_interesse?.nome || 'Não informado',
        etapa_pipeline: l.etapa_pipeline?.nome || 'Sem etapa',
        unidade: l.unidade?.nome || '',
        hora_chegada: l.created_at,
        agente_comercial: l.agente_comercial,
    }));

    return JSON.stringify({ leads_hoje: resultado, total: resultado.length, data: hoje });
}

async function toolGetFunilLeads(
    args: { unidade_nome?: string; data_inicio?: string; data_fim?: string },
    ctx: AgentContext,
): Promise<string> {
    let query = supabase
        .from('leads')
        .select(`
            id,
            status,
            converteu,
            etapa_pipeline_id,
            etapa_pipeline:etapa_pipeline_id(nome, slug, ordem)
        `);

    // Filtro de permissão
    if (!ctx.isAdmin && ctx.unidadeId) {
        query = query.eq('unidade_id', ctx.unidadeId);
    } else if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (unidadeId) query = query.eq('unidade_id', unidadeId);
    }

    if (args.data_inicio) {
        query = query.gte('data_contato', args.data_inicio);
    }
    if (args.data_fim) {
        query = query.lte('data_contato', args.data_fim);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum lead encontrado no período.' });

    // Agrupar por etapa do pipeline
    const porEtapa: Record<string, number> = {};
    const porStatus: Record<string, number> = {};
    let totalConvertidos = 0;

    for (const l of data) {
        const etapaNome = (l.etapa_pipeline as any)?.nome || 'Sem etapa';
        porEtapa[etapaNome] = (porEtapa[etapaNome] || 0) + 1;
        porStatus[l.status] = (porStatus[l.status] || 0) + 1;
        if (l.converteu) totalConvertidos++;
    }

    const totalLeads = data.length;
    const taxaConversao = totalLeads > 0 ? ((totalConvertidos / totalLeads) * 100).toFixed(1) : '0';

    return JSON.stringify({
        total_leads: totalLeads,
        por_etapa_pipeline: porEtapa,
        por_status: porStatus,
        total_convertidos: totalConvertidos,
        taxa_conversao_geral: `${taxaConversao}%`,
    });
}

// ==================== TOOL GENÉRICA: SQL ====================

async function toolConsultarBanco(args: { sql_query: string }, ctx: AgentContext): Promise<string> {
    const querySanitizada = args.sql_query.trim();

    // Validação: somente SELECT
    if (!querySanitizada.toUpperCase().startsWith('SELECT')) {
        return JSON.stringify({ erro: 'Apenas consultas SELECT são permitidas.' });
    }

    const proibidos = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b/i;
    if (proibidos.test(querySanitizada)) {
        return JSON.stringify({ erro: 'Operação não permitida. Apenas SELECT.' });
    }

    try {
        const { data, error } = await supabase.rpc('executar_query_readonly', {
            query_sql: querySanitizada,
        });

        if (error) return JSON.stringify({ erro: error.message });

        const resultado = data || [];
        return JSON.stringify({
            resultado,
            total: Array.isArray(resultado) ? resultado.length : 0,
            aviso: 'Limite de 50 linhas aplicado automaticamente.',
        });
    } catch (err: any) {
        return JSON.stringify({ erro: `Erro ao executar consulta: ${err.message}` });
    }
}

async function toolListarTabelas(): Promise<string> {
    const tabelas = [
        { tabela: 'leads', descricao: 'Leads/contatos comerciais — nome, telefone, status, canal, curso interesse, etapa pipeline, temperatura, experimental, conversão' },
        { tabela: 'alunos', descricao: 'Alunos matriculados — nome, status, curso, valor parcela, unidade' },
        { tabela: 'professores', descricao: 'Professores — nome, unidade, cursos que leciona' },
        { tabela: 'turmas', descricao: 'Turmas de aulas — professor, curso, horário, sala, alunos' },
        { tabela: 'cursos', descricao: 'Cursos oferecidos (guitarra, violão, piano, etc.)' },
        { tabela: 'unidades', descricao: 'Unidades/escolas da rede (Barra, Recreio, Campo Grande, etc.)' },
        { tabela: 'dados_mensais', descricao: 'Métricas mensais por unidade — alunos pagantes, matrículas, evasões, churn, ticket médio, faturamento' },
        { tabela: 'movimentacoes_admin', descricao: 'Movimentações de alunos — evasão, renovação, trancamento, aviso prévio' },
        { tabela: 'evasoes_v2', descricao: 'Registro detalhado de evasões — motivo, professor, curso, data' },
        { tabela: 'renovacoes', descricao: 'Registro de renovações de contratos' },
        { tabela: 'dados_comerciais', descricao: 'Dados comerciais mensais por unidade (matrículas, experimentais, leads)' },
        { tabela: 'experimentais_mensal_unidade', descricao: 'Experimentais agendadas/realizadas por mês e unidade' },
        { tabela: 'experimentais_professor_mensal', descricao: 'Experimentais por professor e mês' },
        { tabela: 'canais_origem', descricao: 'Canais de origem de leads (Instagram, Google, Indicação, etc.)' },
        { tabela: 'crm_pipeline_etapas', descricao: 'Etapas do pipeline de vendas (Novo Lead, Em Contato, Experimental Agendada, Matriculado, etc.)' },
        { tabela: 'crm_lead_historico', descricao: 'Histórico de interações/mudanças de status do lead' },
        { tabela: 'crm_followups', descricao: 'Follow-ups agendados para leads' },
        { tabela: 'crm_etiquetas', descricao: 'Etiquetas/tags do CRM' },
        { tabela: 'crm_lead_etiquetas', descricao: 'Etiquetas associadas a cada lead' },
        { tabela: 'horarios', descricao: 'Grade de horários de aulas' },
        { tabela: 'metas', descricao: 'Metas de performance' },
        { tabela: 'metas_comerciais', descricao: 'Metas comerciais mensais por unidade' },
        { tabela: 'loja_vendas', descricao: 'Vendas da lojinha' },
        { tabela: 'loja_produtos', descricao: 'Produtos da lojinha' },
        { tabela: 'inventario', descricao: 'Inventário de instrumentos e equipamentos' },
        { tabela: 'projetos', descricao: 'Projetos pedagógicos' },
        { tabela: 'colaboradores', descricao: 'Colaboradores da empresa' },
        { tabela: 'leads_automacao_log', descricao: 'Log de automações executadas para leads' },
        // Views úteis
        { tabela: 'vw_funil_conversao_mensal', descricao: 'VIEW: Funil de conversão mensal' },
        { tabela: 'vw_kpis_comercial_mensal', descricao: 'VIEW: KPIs comerciais mensais' },
        { tabela: 'vw_kpis_professor_mensal', descricao: 'VIEW: KPIs de professores mensais' },
        { tabela: 'vw_leads_comercial', descricao: 'VIEW: Leads com dados comerciais completos' },
        { tabela: 'vw_leads_por_canal', descricao: 'VIEW: Leads agrupados por canal de origem' },
        { tabela: 'vw_evasoes_resumo', descricao: 'VIEW: Resumo de evasões' },
        { tabela: 'vw_renovacoes_mensal', descricao: 'VIEW: Renovações mensais' },
        { tabela: 'vw_ranking_unidades', descricao: 'VIEW: Ranking de performance das unidades' },
        { tabela: 'vw_turmas_completa', descricao: 'VIEW: Turmas com dados completos' },
        { tabela: 'vw_kpis_mensais', descricao: 'VIEW: KPIs mensais consolidados' },
        { tabela: 'vw_motivos_nao_matricula', descricao: 'VIEW: Motivos de não matrícula' },
        { tabela: 'vw_matriculas_por_canal', descricao: 'VIEW: Matrículas agrupadas por canal de origem' },
    ];

    return JSON.stringify({ tabelas, total: tabelas.length });
}

// ==================== EXECUTOR CENTRAL ====================

export async function executeTool(toolName: string, argsJson: string, ctx: AgentContext): Promise<string> {
    try {
        const args = JSON.parse(argsJson);
        switch (toolName) {
            case 'get_unidades':
                return await toolGetUnidades();
            case 'get_dados_mensais':
                return await toolGetDadosMensais(args, ctx);
            case 'search_aluno':
                return await toolSearchAluno(args, ctx);
            case 'get_resumo_unidade':
                return await toolGetResumoUnidade(args, ctx);
            case 'get_movimentacoes':
                return await toolGetMovimentacoes(args, ctx);
            // Novas tools: Leads
            case 'search_leads':
                return await toolSearchLeads(args, ctx);
            case 'get_leads_hoje':
                return await toolGetLeadsHoje(args, ctx);
            case 'get_funil_leads':
                return await toolGetFunilLeads(args, ctx);
            // Tool genérica: SQL
            case 'consultar_banco':
                return await toolConsultarBanco(args, ctx);
            case 'listar_tabelas':
                return await toolListarTabelas();
            default:
                return JSON.stringify({ erro: `Ferramenta "${toolName}" não reconhecida.` });
        }
    } catch (err: any) {
        return JSON.stringify({ erro: `Erro ao executar ferramenta: ${err.message}` });
    }
}
