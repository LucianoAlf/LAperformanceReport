/**
 * agentTools.ts
 * 
 * Ferramentas (Tools) que o Agente IA pode invocar via OpenAI Function Calling.
 * IMPORTANTE: Todas as funções são SOMENTE LEITURA (SELECT), NUNCA alteram a base.
 */
import { supabase } from '@/lib/supabase';

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

async function toolGetUnidades(): Promise<string> {
    const { data, error } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');

    if (error) return JSON.stringify({ erro: error.message });
    return JSON.stringify({ unidades: data });
}

async function toolGetDadosMensais(args: { unidade_nome?: string; ano: number; mes?: number }): Promise<string> {
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

    if (args.unidade_nome) {
        const unidadeId = await resolverUnidadeId(args.unidade_nome);
        if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });
        query = query.eq('unidade_id', unidadeId);
    }

    const { data, error } = await query.order('mes');
    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum dado encontrado para os filtros informados.' });

    return JSON.stringify({ dados_mensais: data, total_registros: data.length });
}

async function toolSearchAluno(args: { nome: string; unidade_nome?: string }): Promise<string> {
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

    if (args.unidade_nome) {
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

async function toolGetResumoUnidade(args: { unidade_nome: string }): Promise<string> {
    const unidadeId = await resolverUnidadeId(args.unidade_nome);
    if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });

    const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, status, valor_parcela, is_segundo_curso')
        .eq('unidade_id', unidadeId);

    if (error) return JSON.stringify({ erro: error.message });
    if (!data || data.length === 0) return JSON.stringify({ mensagem: 'Nenhum aluno encontrado nesta unidade.' });

    // Agrupar por status
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
        unidade: args.unidade_nome,
        total_registros: data.length,
        alunos_ativos: countAtivos,
        alunos_primeiro_curso_ativos: countPrimeiroCursoAtivos,
        distribuicao_status: porStatus,
        faturamento_bruto_estimado: somaValorAtivos.toFixed(2),
        ticket_medio_primeiro_curso: ticketMedio,
    });
}

async function toolGetMovimentacoes(args: { unidade_nome: string; ano: number; mes?: number }): Promise<string> {
    const unidadeId = await resolverUnidadeId(args.unidade_nome);
    if (!unidadeId) return JSON.stringify({ erro: `Unidade "${args.unidade_nome}" não encontrada.` });

    let query = supabase
        .from('movimentacoes_admin')
        .select('id, tipo, data_registro, observacoes')
        .eq('unidade_id', unidadeId);

    // Filtrar por período
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

    // Agrupar por tipo
    const porTipo: Record<string, number> = {};
    for (const m of (data || [])) {
        porTipo[m.tipo] = (porTipo[m.tipo] || 0) + 1;
    }

    return JSON.stringify({
        unidade: args.unidade_nome,
        periodo: args.mes ? `${args.mes}/${args.ano}` : `${args.ano}`,
        total_movimentacoes: data?.length || 0,
        por_tipo: porTipo,
    });
}

// ==================== EXECUTOR CENTRAL ====================

export async function executeTool(toolName: string, argsJson: string): Promise<string> {
    try {
        const args = JSON.parse(argsJson);
        switch (toolName) {
            case 'get_unidades':
                return await toolGetUnidades();
            case 'get_dados_mensais':
                return await toolGetDadosMensais(args);
            case 'search_aluno':
                return await toolSearchAluno(args);
            case 'get_resumo_unidade':
                return await toolGetResumoUnidade(args);
            case 'get_movimentacoes':
                return await toolGetMovimentacoes(args);
            default:
                return JSON.stringify({ erro: `Ferramenta "${toolName}" não reconhecida.` });
        }
    } catch (err: any) {
        return JSON.stringify({ erro: `Erro ao executar ferramenta: ${err.message}` });
    }
}
