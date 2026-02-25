export interface OpenAIConfig {
    apiKey: string;
    model: string;
}

const STORAGE_KEY = 'auditoria_openai_config';

export const MODELOS_DISPONIVEIS = [
    { id: 'gpt-4o', label: 'GPT-4o (Recomendado)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido)' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Econômico)' },
];

export function getOpenAIConfig(): OpenAIConfig {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch { }
    return { apiKey: '', model: 'gpt-4o-mini' };
}

export function saveOpenAIConfig(config: OpenAIConfig) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function validarApiKey(apiKey: string): Promise<boolean> {
    try {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
    } catch {
        return false;
    }
}

import type { RelatorioAuditoria } from './useAuditoriaEmusys';

export async function analisarComIA(
    relatorio: RelatorioAuditoria,
    config: OpenAIConfig
): Promise<string> {
    // Montar resumo das divergências para a IA
    const resumo = `
## Dados da Auditoria
- Total de alunos no Emusys (CRM): ${relatorio.resumo.totalEmusys}
- Total de alunos no Banco de Dados: ${relatorio.resumo.totalDB}
- Alunos faltantes no DB: ${relatorio.faltantesDB.length}
- Alunos faltantes no CRM: ${relatorio.faltantesCRM.length}
- Status divergente: ${relatorio.statusErrado.length}
- Cursos faltando: ${relatorio.cursosFaltando.length}
- Duplicatas: ${relatorio.duplicatas.length}

### Detalhes das Divergências

#### Faltantes no DB (${relatorio.faltantesDB.length})
${relatorio.faltantesDB.slice(0, 30).map(d => `- ${d.nome}: ${d.cursosCRM?.join(', ')}`).join('\n')}

#### Faltantes no CRM (${relatorio.faltantesCRM.length})
${relatorio.faltantesCRM.slice(0, 30).map(d => `- ${d.nome}: ${d.cursosDB?.join(', ')}`).join('\n')}

#### Status Divergente (${relatorio.statusErrado.length})
${relatorio.statusErrado.map(d => `- ${d.nome}: Status DB = ${d.statusDB}`).join('\n')}

#### Cursos Faltando (${relatorio.cursosFaltando.length})
${relatorio.cursosFaltando.slice(0, 30).map(d => `- ${d.nome}: CRM: ${d.cursosCRM?.join(', ')} | DB: ${d.cursosDB?.join(', ')}`).join('\n')}

#### Duplicatas (${relatorio.duplicatas.length})
${relatorio.duplicatas.map(d => `- ${d.nome}: ${d.detalhes}`).join('\n')}
  `.trim();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: `Você é um analista de dados de uma escola de música. Analise as divergências entre o sistema de gestão (Emusys/CRM) e o banco de dados interno (Supabase).

Sua resposta deve ser em Português do Brasil e incluir:
1. **Resumo Executivo** (2-3 frases sobre a situação geral)
2. **Prioridades** (o que precisa ser corrigido primeiro, numerado)
3. **Padrões Identificados** (tendências ou problemas recorrentes)
4. **Recomendações** (ações práticas para resolver)

IMPORTANTE: 
- Muitos "faltantes" podem ser variações de nome (acentos, sobrenomes diferentes). Identifique esses possíveis matches.
- "Curso faltando" geralmente indica segundo curso não importado.
- Status "aviso_previo" ou "trancado" no DB com ativo no CRM pode significar que o aluno retornou.
- Use formatação markdown.`
                },
                {
                    role: 'user',
                    content: resumo
                }
            ],
            temperature: 0.3,
            max_tokens: 2000,
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Erro na API OpenAI: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sem resposta da IA.';
}
