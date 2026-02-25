import React, { useState } from 'react';
import {
    ChevronDown, ChevronRight, UserMinus, UserPlus, AlertTriangle,
    BookOpen, Copy, Download, Sparkles
} from 'lucide-react';
import type { RelatorioAuditoria, Divergencia } from './useAuditoriaEmusys';

interface RelatorioAuditoriaProps {
    relatorio: RelatorioAuditoria;
    analiseIA?: string;
}

interface CategoriaProps {
    titulo: string;
    icon: React.ReactNode;
    cor: string;
    items: Divergencia[];
    defaultOpen?: boolean;
}

function Categoria({ titulo, icon, cor, items, defaultOpen = false }: CategoriaProps) {
    const [aberto, setAberto] = useState(defaultOpen);

    if (items.length === 0) return null;

    return (
        <div className="border border-slate-700/50 rounded-lg overflow-hidden">
            <button
                onClick={() => setAberto(!aberto)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-800/60 transition-colors text-left`}
            >
                {aberto ? (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className={`${cor}`}>{icon}</span>
                <span className="text-sm font-medium text-slate-200 flex-1">{titulo}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor} bg-opacity-20`}
                    style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    {items.length}
                </span>
            </button>

            {aberto && (
                <div className="border-t border-slate-700/30 max-h-[300px] overflow-y-auto">
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className="px-3 py-2 border-b border-slate-800/40 last:border-b-0 hover:bg-slate-800/30 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm text-white font-medium">{item.nome}</p>
                                {item.ids && (
                                    <span className="text-[10px] text-slate-500 shrink-0">
                                        ID: {item.ids.join(', ')}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{item.detalhes}</p>
                            {item.cursosCRM && item.cursosCRM.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {item.cursosCRM.map((c, j) => (
                                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/20">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {item.cursosDB && item.cursosDB.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {item.cursosDB.map((c, j) => (
                                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/20">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {item.statusDB && (
                                <span className={`inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded font-medium ${item.statusDB.includes('evadido') ? 'bg-red-500/20 text-red-300' :
                                    item.statusDB.includes('trancado') ? 'bg-amber-500/20 text-amber-300' :
                                        item.statusDB.includes('aviso_previo') ? 'bg-orange-500/20 text-orange-300' :
                                            'bg-slate-500/20 text-slate-300'
                                    }`}>
                                    {item.statusDB}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function RelatorioAuditoriaView({ relatorio, analiseIA }: RelatorioAuditoriaProps) {
    const [mostrarIA, setMostrarIA] = useState(!!analiseIA);
    const totalDivergencias =
        relatorio.faltantesDB.length +
        relatorio.faltantesCRM.length +
        relatorio.statusErrado.length +
        relatorio.cursosFaltando.length +
        relatorio.duplicatas.length;

    const handleCopiar = () => {
        const texto = gerarTextoRelatorio(relatorio, analiseIA);
        navigator.clipboard.writeText(texto);
    };

    const handleDownload = () => {
        const texto = gerarTextoRelatorio(relatorio, analiseIA);
        const blob = new Blob([texto], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `auditoria-emusys-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-3">
            {/* Resumo numérico */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-purple-400">{relatorio.resumo.totalEmusys}</p>
                    <p className="text-[10px] text-slate-400">Alunos Emusys</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-blue-400">{relatorio.resumo.totalDB}</p>
                    <p className="text-[10px] text-slate-400">Alunos DB</p>
                </div>
            </div>

            {/* Badge total divergências */}
            <div className={`text-center py-1.5 rounded-lg text-xs font-medium ${totalDivergencias === 0
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                {totalDivergencias === 0
                    ? '✅ Nenhuma divergência encontrada!'
                    : `⚠ ${totalDivergencias} divergência(s) encontrada(s)`}
            </div>

            {/* Análise IA */}
            {analiseIA && (
                <div className="border border-purple-500/30 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setMostrarIA(!mostrarIA)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-purple-900/20 hover:bg-purple-900/30 transition-colors text-left"
                    >
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-medium text-purple-300 flex-1">Análise Inteligente (IA)</span>
                        <svg
                            className={`w-3.5 h-3.5 text-purple-500 transition-transform ${mostrarIA ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {mostrarIA && (
                        <div className="p-3 bg-slate-900/40 border-t border-purple-500/20">
                            <div
                                className="text-xs text-slate-300 leading-relaxed prose prose-invert prose-xs max-w-none 
                  [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-purple-300 [&_h2]:mt-3 [&_h2]:mb-1
                  [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-slate-200 [&_h3]:mt-2 [&_h3]:mb-1
                  [&_strong]:text-white [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:mb-0.5
                  [&_p]:mb-1.5"
                                dangerouslySetInnerHTML={{ __html: formatMarkdown(analiseIA) }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Categorias */}
            <div className="space-y-2">
                <Categoria
                    titulo="Faltantes no DB"
                    icon={<UserMinus className="w-4 h-4" />}
                    cor="text-red-400"
                    items={relatorio.faltantesDB}
                    defaultOpen={relatorio.faltantesDB.length <= 10}
                />
                <Categoria
                    titulo="Faltantes no CRM"
                    icon={<UserPlus className="w-4 h-4" />}
                    cor="text-orange-400"
                    items={relatorio.faltantesCRM}
                />
                <Categoria
                    titulo="Status Divergente"
                    icon={<AlertTriangle className="w-4 h-4" />}
                    cor="text-amber-400"
                    items={relatorio.statusErrado}
                    defaultOpen={true}
                />
                <Categoria
                    titulo="Cursos Faltando"
                    icon={<BookOpen className="w-4 h-4" />}
                    cor="text-blue-400"
                    items={relatorio.cursosFaltando}
                />
                <Categoria
                    titulo="Duplicatas no DB"
                    icon={<Copy className="w-4 h-4" />}
                    cor="text-purple-400"
                    items={relatorio.duplicatas}
                />
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-1">
                <button
                    onClick={handleCopiar}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700/60 hover:bg-slate-600/60 rounded-lg text-xs text-slate-300 transition-colors"
                >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                </button>
                <button
                    onClick={handleDownload}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700/60 hover:bg-slate-600/60 rounded-lg text-xs text-slate-300 transition-colors"
                >
                    <Download className="w-3.5 h-3.5" />
                    Exportar .md
                </button>
            </div>
        </div>
    );
}

// Helpers
function formatMarkdown(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h2>$1</h2>')
        .replace(/^\d+\.\s+/gm, (match) => `<li>${match.replace(/^\d+\.\s+/, '')}`)
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        .replace(/\n/g, '<br/>');
}

function gerarTextoRelatorio(relatorio: RelatorioAuditoria, analiseIA?: string): string {
    const lines: string[] = [
        '# Relatório de Auditoria Emusys vs DB',
        `Data: ${new Date(relatorio.timestamp).toLocaleString('pt-BR')}`,
        '',
        '## Resumo',
        `- Alunos Emusys: ${relatorio.resumo.totalEmusys}`,
        `- Alunos DB: ${relatorio.resumo.totalDB}`,
        `- Faltantes no DB: ${relatorio.faltantesDB.length}`,
        `- Faltantes no CRM: ${relatorio.faltantesCRM.length}`,
        `- Status divergente: ${relatorio.statusErrado.length}`,
        `- Cursos faltando: ${relatorio.cursosFaltando.length}`,
        `- Duplicatas: ${relatorio.duplicatas.length}`,
        '',
    ];

    if (analiseIA) {
        lines.push('## Análise IA', analiseIA, '');
    }

    const categorias = [
        { titulo: 'Faltantes no DB', items: relatorio.faltantesDB },
        { titulo: 'Faltantes no CRM', items: relatorio.faltantesCRM },
        { titulo: 'Status Divergente', items: relatorio.statusErrado },
        { titulo: 'Cursos Faltando', items: relatorio.cursosFaltando },
        { titulo: 'Duplicatas', items: relatorio.duplicatas },
    ];

    for (const cat of categorias) {
        if (cat.items.length > 0) {
            lines.push(`## ${cat.titulo} (${cat.items.length})`);
            for (const item of cat.items) {
                lines.push(`- **${item.nome}**: ${item.detalhes}`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}
