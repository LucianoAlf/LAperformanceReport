import React, { useState, useEffect, useRef } from 'react';
import {
    X, ClipboardCheck, Sparkles, Bot,
    Cpu, Shield, ChevronUp
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuditoriaWidget } from '@/components/App/Alunos/Auditoria/AuditoriaWidget';

type ActiveTool = null | 'auditoria';

interface ToolItem {
    id: ActiveTool;
    label: string;
    icon: React.ReactNode;
    cor: string;
    corBg: string;
    descricao: string;
}

const tools: ToolItem[] = [
    {
        id: 'auditoria',
        label: 'Auditoria Emusys',
        icon: <ClipboardCheck className="w-5 h-5" />,
        cor: 'text-purple-400',
        corBg: 'bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30',
        descricao: 'Comparar dados do Emusys com o banco',
    },
    // Futuros tools podem ser adicionados aqui:
    // { id: 'sync', label: 'Sync Status', icon: <RefreshCw />, ... },
];

export function AdminToolsHub() {
    const { isAdmin } = useAuth();
    const [expanded, setExpanded] = useState(false);
    const [activeTool, setActiveTool] = useState<ActiveTool>(null);
    const [hoveredTool, setHoveredTool] = useState<ActiveTool>(null);
    const hubRef = useRef<HTMLDivElement>(null);

    // Fechar menu ao clicar fora
    useEffect(() => {
        if (!expanded) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (hubRef.current && !hubRef.current.contains(e.target as Node)) {
                setExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [expanded]);

    if (!isAdmin) return null;

    const handleToolClick = (toolId: ActiveTool) => {
        setActiveTool(toolId);
        setExpanded(false);
    };

    const handleCloseTool = () => {
        setActiveTool(null);
    };

    // Se uma tool está ativa, renderiza ela
    if (activeTool === 'auditoria') {
        return <AuditoriaWidget onClose={handleCloseTool} />;
    }

    return (
        <div ref={hubRef} className="fixed bottom-6 right-[5.5rem] md:right-24 z-[55] flex flex-col items-end gap-3">
            {/* Speed dial — ferramentas expandidas */}
            {expanded && (
                <div className="flex flex-col gap-2 animate-in slide-in-from-bottom-2 duration-200">
                    {tools.map((tool, index) => (
                        <button
                            key={tool.id}
                            onClick={() => handleToolClick(tool.id)}
                            onMouseEnter={() => setHoveredTool(tool.id)}
                            onMouseLeave={() => setHoveredTool(null)}
                            className={`group flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-sm
                shadow-lg transition-all duration-200 ${tool.corBg}
                hover:scale-[1.02] active:scale-95`}
                            style={{
                                animationDelay: `${index * 50}ms`,
                                animationFillMode: 'both'
                            }}
                        >
                            <span className={tool.cor}>{tool.icon}</span>
                            <div className="text-left">
                                <p className="text-sm font-medium text-white leading-tight">{tool.label}</p>
                                <p className="text-[10px] text-slate-400 leading-tight">{tool.descricao}</p>
                            </div>
                            <ChevronUp className="w-3.5 h-3.5 text-slate-500 rotate-90 ml-auto" />
                        </button>
                    ))}
                </div>
            )}

            {/* Botão principal — AI Agent Hub */}
            <button
                onClick={() => setExpanded(!expanded)}
                className={`relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center 
          transition-all duration-300 group
          ${expanded
                        ? 'bg-slate-800 border border-slate-600 shadow-slate-500/10 rotate-0'
                        : 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 border border-violet-400/30 shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-110'
                    }
        `}
                title="Ferramentas Admin"
            >
                {/* Glow effect */}
                {!expanded && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 opacity-0 
            group-hover:opacity-30 blur-md transition-opacity duration-500" />
                )}

                {/* Anel pulsante — indica ferramentas disponíveis */}
                {!expanded && (
                    <div className="absolute inset-[-3px] rounded-full border-2 border-purple-400/30 animate-pulse" />
                )}

                {/* Ícone */}
                {expanded ? (
                    <X className="w-6 h-6 text-slate-300" />
                ) : (
                    <div className="relative flex items-center justify-center">
                        {/* Ícone de agente IA — Brain/Sparkles combo */}
                        <Cpu className="w-6 h-6 text-white" />
                        <Sparkles className="absolute -top-1 -right-1 w-3 h-3 text-amber-300 animate-pulse" />
                    </div>
                )}

                {/* Badge de contagem de ferramentas */}
                {!expanded && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-slate-900 
            rounded-full text-[9px] font-bold flex items-center justify-center shadow-sm">
                        {tools.length}
                    </span>
                )}

                {/* Tooltip */}
                {!expanded && (
                    <span className="absolute right-16 bg-slate-800/95 text-white text-[11px] px-3 py-1.5 rounded-lg 
            opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-slate-700
            pointer-events-none backdrop-blur-sm">
                        <span className="flex items-center gap-1.5">
                            <Shield className="w-3 h-3 text-purple-400" />
                            Ferramentas Admin
                        </span>
                    </span>
                )}
            </button>
        </div>
    );
}
