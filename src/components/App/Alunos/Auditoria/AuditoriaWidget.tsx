import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import {
    X, FileSpreadsheet, Upload, Loader2, Send, Minimize2, Maximize2,
    Bot, Paperclip, MessageSquarePlus, History, ThumbsUp, ThumbsDown, ChevronLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { chatComIA, loadConversations, loadMessages, saveFeedback, type ChatMessage, type Role, type AgentContext } from './useAgentChat';
import { BIVisualization } from './BIVisualization';

// Algumas respostas do agente vêm com markdown "achatado" (## e bullets sem \n).
// Re-quebra os blocos sem destruir prosa: insere \n antes de headers e antes
// de " - Maiúscula" (padrão clássico de bullet do agente). Mantém prose intacta.
function normalizeAgentMarkdown(text: string): string {
    if (!text) return text;
    return text
        // headers ## / ### / #### que não estão no início de linha
        .replace(/([^\n])\s*(#{2,4}\s+)/g, '$1\n\n$2')
        // bullets " - Label" onde Label começa com letra maiúscula/acentuada
        .replace(/\s-\s+(?=[A-ZÀ-Ý])/g, '\n- ')
        // bullets que ainda continuam inline com lowercase "label:" (raros mas
        // acontecem em listas de critério tipo " - tipo: 'evasao'")
        .replace(/\.\s+-\s+(?=[a-zà-ÿ])/g, '.\n- ')
        // compacta múltiplas quebras
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

interface Unidade {
    id: string;
    nome: string;
}

interface AuditoriaWidgetProps {
    onClose: () => void;
    widgetsHidden?: boolean;
}

// O Chat do Agente atuará também como Auditoria se arquivos forem anexados
export function AuditoriaWidget({ onClose, widgetsHidden = false }: AuditoriaWidgetProps) {
    const { isAdmin, usuario } = useAuth();

    // Contexto de permissão para as tools do agente
    const agentCtx: AgentContext = {
        isAdmin,
        unidadeId: usuario?.unidade_id ?? null,
        unidadeNome: usuario?.unidade_nome ?? null,
        colaboradorId: usuario?.id ?? null,
        colaboradorTipo: usuario?.perfil ?? null,
    };

    const welcomeMessage: ChatMessage = {
        id: 'welcome_1',
        role: 'assistant',
        content: 'Olá! Sou a **Inteligência Artificial da LA Music** 🎵\n\nPosso ajudar você com:\n- 📊 **Métricas**: ticket médio, faturamento, evasão, churn\n- 🔍 **Buscar alunos** pelo nome no sistema\n- 📈 **Leads & CRM**: leads de hoje, funil de conversão, buscar leads\n- 🗄️ **Consultar qualquer dado** do banco: turmas, professores, evasões, loja, etc.\n- 📋 **Auditoria**: anexe arquivos do Emusys para comparar com o banco\n\nPergunta o que quiser!',
    };

    const [fullscreen, setFullscreen] = useState(false);
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [unidadeSelecionada, setUnidadeSelecionada] = useState(agentCtx.unidadeId || '');

    // Estados do Chat
    const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
    const [inputText, setInputText] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);

    const [isTyping, setIsTyping] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    const [typingPhase, setTypingPhase] = useState(0);

    const SOL_TYPING_MESSAGES = [
        'Consultando o banco de dados...',
        'Analisando os resultados...',
        'Cruzando as informações...',
        'Verificando os dados...',
        'Montando a resposta...',
        'Preparando a análise...',
        'Processando os dados...',
    ];

    useEffect(() => {
        if (!isTyping || loadingMsg !== 'Pensando...') return;
        setTypingPhase(0);
        const interval = setInterval(() => {
            setTypingPhase(p => (p + 1) % SOL_TYPING_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, [isTyping, loadingMsg]);
    const [conversationId, setConversationId] = useState<string | null>(null);

    // Histórico de conversas
    const [showHistory, setShowHistory] = useState(false);
    const [conversations, setConversations] = useState<{ id: string; title: string; updated_at: string; total_tokens: number; total_cost_usd: number }[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState<Record<string, number>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, loadingMsg]);

    // Carregar unidades
    useEffect(() => {
        if (unidades.length === 0) {
            supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome')
                .then(({ data }) => {
                    if (data) {
                        setUnidades(data);
                        if (data.length === 1) setUnidadeSelecionada(data[0].id);
                    }
                });
        }
    }, []);

    // Carregar lista de conversas ao abrir histórico
    const fetchConversations = useCallback(async () => {
        setLoadingHistory(true);
        const convs = await loadConversations();
        setConversations(convs);
        setLoadingHistory(false);
    }, []);

    // Abrir uma conversa do histórico
    const openConversation = useCallback(async (convId: string) => {
        setLoadingHistory(true);
        const msgs = await loadMessages(convId);
        setMessages([welcomeMessage, ...msgs]);
        setConversationId(convId);
        setShowHistory(false);
        setLoadingHistory(false);
    }, []);

    // Nova conversa
    const startNewConversation = useCallback(() => {
        setMessages([welcomeMessage]);
        setConversationId(null);
        setShowHistory(false);
        setFeedbackGiven({});
    }, []);

    // Feedback handler
    const handleFeedback = useCallback(async (messageId: string, rating: number) => {
        if (messageId === 'welcome_1') return;
        setFeedbackGiven(prev => ({ ...prev, [messageId]: rating }));
        await saveFeedback(messageId, rating);
    }, []);

    // --- Funções de Drag and Drop ---
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            // Apenas desativa se ralmente sair do contentor
            const target = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(target)) {
                setDragActive(false);
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files).filter((f: File) =>
                f.name.match(/\.(xlsx|xls|csv)$/i)
            );
            if (newFiles.length > 0) {
                setAttachments(prev => [...prev, ...newFiles].slice(0, 2)); // limitar 2 anexos max para evitar sobrecarga (alunos e matrículas)
            }
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setAttachments(prev => [...prev, ...newFiles].slice(0, 2));
        }
        // reseta o file input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- Função Envio (Workflow do Agente) ---
    const handleSend = async () => {
        const txt = inputText.trim();
        const hasAttachments = attachments.length > 0;

        if (!txt && !hasAttachments) return;


        // Criar a mensagem do Utilizador visível
        const userMessageContent = txt || (hasAttachments ? 'Por favor analise os ficheiros em anexo.' : '');
        const currentAttachments = [...attachments];

        const newUserMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: userMessageContent,
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputText('');
        setAttachments([]);
        setIsTyping(true);

        try {
            let messageToSend: string;

            // 1. Se tem arquivo: faz upload para Storage e manda file_url para a Sol
            if (hasAttachments) {
                setLoadingMsg('Enviando arquivo...');

                const fileUrls: string[] = [];
                const fileNames: string[] = [];

                for (const file of currentAttachments) {
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const filePath = `uploads/${Date.now()}-${safeName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('bi-uploads')
                        .upload(filePath, file);

                    if (uploadError) throw new Error(`Erro ao enviar arquivo: ${uploadError.message}`);

                    const { data: signedData } = await supabase.storage
                        .from('bi-uploads')
                        .createSignedUrl(filePath, 3600);

                    if (signedData?.signedUrl) fileUrls.push(signedData.signedUrl);
                    fileNames.push(file.name);
                }

                const userText = txt || 'Analise o arquivo enviado e me dê um resumo.';
                newUserMsg.content = `📎 ${fileNames.join(', ')} — ${userText}`;

                messageToSend = JSON.stringify({
                    text: userText,
                    file_url: fileUrls[0],
                    file_name: fileNames[0],
                });
            } else {
                messageToSend = txt;
            }

            // 2. Enviar para a fila da Sol
            setLoadingMsg('Pensando...');

            const result = await chatComIA(messageToSend, conversationId, agentCtx, txt || currentAttachments[0]?.name);

            // Salvar conversation_id para mensagens futuras
            if (result.conversationId) {
                setConversationId(result.conversationId);
            }

            // Adicionar a resposta (com visualização se disponível)
            const newAssistantMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: result.content,
                sqlResult: result.sqlResult,
                visualizationType: result.visualizationType,
                visualizationConfig: result.visualizationConfig,
                metadata: result.metadata,
            };
            setMessages(prev => [...prev, newAssistantMsg]);

        } catch (err: any) {
            addMessage('assistant', `❌ **Ocorreu um Erro**: ${err.message}`);
        } finally {
            setIsTyping(false);
            setLoadingMsg('');
        }
    };

    const addMessage = (role: Role, content: string, attachments?: File[]) => {
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role,
            content,
            attachments
        }]);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const panelClasses = fullscreen
        ? 'fixed inset-4 z-[60]'
        : `fixed bottom-24 right-[5.5rem] md:right-24 z-[60] w-[450px] md:w-[500px] h-[600px] max-h-[85vh] transition-all duration-300 ease-in-out ${widgetsHidden ? 'translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`;

    // Derivados de UI
    const headerStatus = isTyping
        ? (loadingMsg && loadingMsg !== 'Pensando...' ? loadingMsg.toLowerCase().replace('...', '…') : 'pensando…')
        : 'online';
    const headerStatusClass = isTyping ? 'text-violet-300' : 'text-emerald-400';
    const nomeUnidadeAtual = isAdmin
        ? (unidades.find(u => u.id === unidadeSelecionada)?.nome || 'Selecione')
        : (agentCtx.unidadeNome || 'Carregando…');

    // Markdown components compartilhados (welcome + respostas)
    const markdownComponents = {
        table: ({ children }: any) => <div className="overflow-x-auto my-2.5 rounded-md border border-slate-700"><table className="text-xs border-collapse w-full font-mono">{children}</table></div>,
        thead: ({ children }: any) => <thead className="bg-slate-900/60 border-b border-slate-700">{children}</thead>,
        th: ({ children }: any) => <th className="text-left px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-medium">{children}</th>,
        td: ({ children }: any) => <td className="px-2.5 py-1.5 text-slate-200 border-b border-slate-800/50 last:border-b-0">{children}</td>,
        strong: ({ children }: any) => <strong className="font-semibold text-slate-100">{children}</strong>,
        em: ({ children }: any) => <em className="text-violet-300 not-italic font-medium">{children}</em>,
        h1: ({ children }: any) => <h2 className="text-[15px] font-semibold mt-3.5 mb-2 text-slate-100 pb-1.5 border-b border-slate-700/60 first:mt-0">{children}</h2>,
        h2: ({ children }: any) => <h2 className="text-[14px] font-semibold mt-3.5 mb-2 text-slate-100 pb-1.5 border-b border-slate-700/60 first:mt-0">{children}</h2>,
        h3: ({ children }: any) => <h3 className="text-[13px] font-semibold mt-3 mb-1.5 text-violet-200 first:mt-0">{children}</h3>,
        h4: ({ children }: any) => <h4 className="font-mono text-[10px] uppercase tracking-wider mt-3 mb-1 text-slate-500 first:mt-0">{children}</h4>,
        ul: ({ children }: any) => <ul className="list-none pl-0 my-1.5 space-y-1">{children}</ul>,
        ol: ({ children }: any) => <ol className="list-decimal pl-5 my-1.5 space-y-1 marker:text-violet-400">{children}</ol>,
        li: ({ children }: any) => <li className="pl-[18px] relative leading-snug before:content-['◆'] before:absolute before:left-0 before:top-[7px] before:text-[7px] before:text-violet-400">{children}</li>,
        p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        code: ({ children }: any) => <code className="bg-slate-900 px-1.5 py-0.5 rounded text-[12px] text-violet-300 font-mono border border-slate-700/60">{children}</code>,
        hr: () => <hr className="my-3 border-slate-700" />,
        blockquote: ({ children }: any) => <blockquote className="border-l-2 border-violet-500 pl-3 my-2 text-slate-300 italic">{children}</blockquote>,
    };

    return (
        <>
            <div
                className={`${panelClasses} bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden animate-in slide-in-from-bottom-3 duration-200`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                {/* DRAG OVERLAY */}
                {dragActive && (
                    <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-md border-[3px] border-violet-500 border-dashed rounded-2xl flex flex-col items-center justify-center text-violet-300 pointer-events-none transition-all">
                        <Upload className="w-14 h-14 mb-3 animate-bounce" />
                        <p className="font-bold text-lg">Solte ficheiros xlsx para auditar</p>
                        <p className="text-sm opacity-70 mt-1">(Alunos Ativos e Matrículas)</p>
                    </div>
                )}

                {/* TOPBAR */}
                <div className="flex items-center justify-between px-3.5 py-3 bg-[#131c30] border-b border-slate-700 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                            <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center ring-1 ring-inset ring-violet-300/15">
                                <Bot className="w-[14px] h-[14px] text-white" />
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[#131c30]"></span>
                        </div>
                        <div className="flex flex-col leading-tight min-w-0">
                            <span className="text-[13px] font-semibold text-slate-100 tracking-tight truncate">Assistente IA LA Music</span>
                            <span className="text-[10.5px] font-mono text-slate-500 mt-0.5">
                                bi · auditoria · <span className={headerStatusClass}>{headerStatus}</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
                            className={`w-7 h-7 grid place-items-center rounded-md transition-colors ${showHistory ? 'text-violet-300 bg-violet-500/12' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
                            title="Histórico de conversas"
                        >
                            <History className="w-[15px] h-[15px]" />
                        </button>
                        <button
                            onClick={startNewConversation}
                            className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            title="Nova conversa"
                        >
                            <MessageSquarePlus className="w-[15px] h-[15px]" />
                        </button>
                        <button
                            onClick={() => setFullscreen(!fullscreen)}
                            className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            title={fullscreen ? 'Minimizar' : 'Expandir'}
                        >
                            {fullscreen ? <Minimize2 className="w-[15px] h-[15px]" /> : <Maximize2 className="w-[15px] h-[15px]" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                            title="Fechar"
                        >
                            <X className="w-[15px] h-[15px]" />
                        </button>
                    </div>
                </div>

                {/* SCOPE ROW — pills mono */}
                <div className="flex items-stretch px-3.5 bg-slate-900 border-b border-slate-700 shrink-0">
                    <div className="flex items-center gap-1.5 py-2 pr-2.5 mr-2 border-r border-slate-700 text-[11.5px] font-mono">
                        <span className="text-slate-500">unidade</span>
                        {isAdmin ? (
                            <select
                                value={unidadeSelecionada}
                                onChange={(e) => setUnidadeSelecionada(e.target.value)}
                                className="bg-emerald-500/12 text-emerald-300 text-[11.5px] font-mono py-0 px-1.5 rounded-[3px] border-0 outline-none focus:ring-1 focus:ring-emerald-500/50 max-w-[140px]"
                            >
                                {unidades.map(u => (
                                    <option key={u.id} value={u.id} className="bg-slate-800 text-slate-100">{u.nome}</option>
                                ))}
                            </select>
                        ) : (
                            <span className="text-emerald-300 bg-emerald-500/12 px-1.5 rounded-[3px]">{nomeUnidadeAtual}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 py-2 text-[11.5px] font-mono">
                        <span className="text-slate-500">modo</span>
                        <span className="text-violet-300 bg-violet-500/12 px-1.5 rounded-[3px]">auditoria_db</span>
                    </div>
                </div>

                {/* HISTORY DRAWER (overlay) */}
                {showHistory && (
                    <div className="absolute inset-0 top-[90px] z-30 bg-[#0e1729] flex flex-col overflow-hidden rounded-b-2xl">
                        <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-700 shrink-0">
                            <h4 className="text-[13px] font-semibold text-slate-100">Histórico</h4>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                                title="Fechar histórico"
                            >
                                <ChevronLeft className="w-[15px] h-[15px]" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {loadingHistory ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                                </div>
                            ) : conversations.length === 0 ? (
                                <div className="text-center py-12">
                                    <MessageSquarePlus className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                                    <p className="text-slate-500 text-xs">Nenhuma conversa ainda</p>
                                </div>
                            ) : (
                                conversations.map(conv => {
                                    const isActive = conversationId === conv.id;
                                    const date = new Date(conv.updated_at);
                                    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

                                    return (
                                        <button
                                            key={conv.id}
                                            onClick={() => openConversation(conv.id)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${isActive
                                                ? 'bg-violet-500/12 border-violet-500/30'
                                                : 'hover:bg-white/[0.03] border-transparent'
                                                }`}
                                        >
                                            <p className={`text-[12.5px] leading-snug line-clamp-2 font-medium ${isActive ? 'text-violet-200' : 'text-slate-200'}`}>
                                                {conv.title || 'Conversa sem título'}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-500">
                                                <span>{dateStr}, {timeStr}</span>
                                                {conv.total_tokens > 0 && (
                                                    <>
                                                        <span>·</span>
                                                        <span>{conv.total_tokens.toLocaleString()} tokens</span>
                                                    </>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* TRANSCRIPT */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-slate-900 relative">

                    {messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        const isWelcome = msg.id === 'welcome_1';

                        // Welcome card (sempre como primeira mensagem)
                        if (isWelcome) {
                            return (
                                <div key={msg.id} className="bg-[#131c30] border border-slate-700 border-l-2 border-l-violet-500 rounded-r-lg px-3.5 py-3">
                                    <div className="font-mono text-[10.5px] text-slate-500 tracking-wider uppercase mb-2">Como posso ajudar</div>
                                    <div className="text-[13px] text-slate-200 leading-relaxed">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            );
                        }

                        // User bubble
                        if (isUser) {
                            return (
                                <div key={msg.id} className="flex flex-col items-end">
                                    <div className="max-w-[86%] bg-violet-600 text-white text-sm leading-snug px-3.5 py-2.5 rounded-[10px] rounded-br-[4px] shadow-md shadow-violet-700/30">
                                        <span className="whitespace-pre-wrap">{msg.content}</span>
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-violet-500/40">
                                                {msg.attachments.map((f, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-violet-700/50 text-violet-100">
                                                        <FileSpreadsheet className="w-3 h-3 shrink-0" />
                                                        <span className="truncate max-w-[120px]">{f.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        // Assistant — answer-card com meta line
                        const isErr = typeof msg.content === 'string' && msg.content.startsWith('❌');
                        const idNum = Number(msg.id);
                        const ts = Number.isFinite(idNum) && idNum > 1577836800000
                            ? new Date(idNum).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : null;

                        return (
                            <div key={msg.id} className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500 px-0.5">
                                    {ts && <span className="text-slate-400">{ts}</span>}
                                    <span className={`px-1.5 py-px rounded-[3px] border ${isErr ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'}`}>
                                        {isErr ? 'erro' : 'resposta'}
                                    </span>
                                </div>
                                <div className={`bg-slate-800 border rounded-[10px] overflow-hidden ${isErr ? 'border-rose-500/30' : 'border-slate-700'}`}>
                                    <div className="px-3.5 py-3 text-[14px] leading-snug text-slate-100">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                            {normalizeAgentMarkdown(msg.content)}
                                        </ReactMarkdown>
                                    </div>

                                    {msg.visualizationType && msg.sqlResult && Array.isArray(msg.sqlResult) && msg.sqlResult.length > 0 && (
                                        <div className="px-3.5 pb-3 pt-1 border-t border-slate-700/60">
                                            <BIVisualization
                                                type={msg.visualizationType}
                                                data={msg.sqlResult}
                                                config={msg.visualizationConfig}
                                            />
                                        </div>
                                    )}

                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="px-3.5 pb-3 pt-2 border-t border-slate-700/60 flex flex-wrap gap-1.5">
                                            {msg.attachments.map((f, i) => (
                                                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono bg-slate-700 text-slate-200">
                                                    <FileSpreadsheet className="w-3 h-3 shrink-0" />
                                                    <span className="truncate max-w-[120px]">{f.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Reactions */}
                                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-slate-700 bg-[#131c30]">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleFeedback(msg.id, 5)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11.5px] font-medium transition-all ${feedbackGiven[msg.id] === 5 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-slate-700 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10'}`}
                                                title="Resposta útil"
                                            >
                                                <ThumbsUp className="w-3 h-3" />
                                                útil
                                            </button>
                                            <button
                                                onClick={() => handleFeedback(msg.id, 1)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11.5px] font-medium transition-all ${feedbackGiven[msg.id] === 1 ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' : 'text-slate-400 border-slate-700 hover:text-slate-100 hover:border-slate-500 hover:bg-slate-700/40'}`}
                                                title="Resposta ruim"
                                            >
                                                <ThumbsDown className="w-3 h-3" />
                                                não foi
                                            </button>
                                        </div>
                                        {msg.metadata?.tokens_used && (
                                            <span className="font-mono text-[10.5px] text-slate-500">
                                                {msg.metadata.tokens_used.toLocaleString()} tokens{msg.metadata.cost_usd ? ` · $${msg.metadata.cost_usd.toFixed(4)}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {/* LOADING STATE — pulsos + etapa */}
                    {isTyping && (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500 px-0.5">
                                <span className="text-slate-400">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                <span className="px-1.5 py-px rounded-[3px] border border-slate-700 bg-slate-800 text-slate-300">processando</span>
                            </div>
                            <div className="bg-slate-800 border border-slate-700 rounded-[10px] overflow-hidden">
                                <div className="flex items-center gap-2.5 px-3.5 py-3.5 text-slate-400 text-[13px]">
                                    <div className="inline-flex gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                                    </div>
                                    <span className="font-mono text-[11px] text-slate-500 tracking-wider">
                                        {loadingMsg === 'Pensando...' ? SOL_TYPING_MESSAGES[typingPhase] : loadingMsg}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* COMPOSER */}
                <div className="px-3.5 pt-3 pb-2.5 bg-[#131c30] border-t border-slate-700 shrink-0">

                    {/* Anexos pendentes */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {attachments.map((file, i) => (
                                <div key={i} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-300">
                                    <FileSpreadsheet className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span className="truncate max-w-[140px]">{file.name}</span>
                                    <span className="text-slate-500 text-[10px]">{(file.size / 1024).toFixed(0)} KB</span>
                                    <button
                                        onClick={() => removeAttachment(i)}
                                        className="w-4 h-4 grid place-items-center rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title="Remover"
                                    >
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-end gap-2 px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-[10px] focus-within:border-violet-500 focus-within:ring-[3px] focus-within:ring-violet-500/15 transition-all">
                        <input
                            type="file"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            multiple
                            accept=".xlsx,.xls,.csv"
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
                            title="Anexar arquivo de auditoria"
                        >
                            <Paperclip className="w-[15px] h-[15px]" />
                        </button>

                        <textarea
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Pergunte sobre alunos, turmas, evasões…"
                            className="flex-1 bg-transparent text-slate-100 text-[13.5px] leading-snug placeholder:text-slate-500 focus:outline-none resize-none py-1 min-h-[22px] max-h-[120px]"
                            rows={1}
                            style={{
                                height: inputText ? Math.min(120, Math.max(22, inputText.split('\n').length * 20 + 4)) + 'px' : '22px'
                            }}
                        />

                        <button
                            onClick={handleSend}
                            disabled={isTyping || (!inputText.trim() && attachments.length === 0)}
                            className="w-[30px] h-[30px] grid place-items-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors shrink-0"
                            title="Enviar"
                        >
                            <Send className="w-[15px] h-[15px]" />
                        </button>
                    </div>
                </div>

                {/* STATUSBAR */}
                <div className="flex items-center font-mono text-[10.5px] bg-slate-900 border-t border-slate-700 shrink-0">
                    <span className="px-2.5 py-1.5 bg-violet-600 text-white font-semibold tracking-wider">BI</span>
                    <span className="px-2.5 py-1.5 text-emerald-300 bg-emerald-500/10 border-r border-slate-700 truncate max-w-[140px]">{nomeUnidadeAtual}</span>
                    <span className="flex-1 px-3 py-1.5 text-slate-500 flex gap-3.5 items-center min-w-0 overflow-hidden">
                        {isTyping ? (
                            <span className="text-violet-300 inline-flex items-center gap-1.5">
                                <span className="w-[5px] h-[5px] rounded-full bg-violet-400 animate-pulse" />
                                {loadingMsg === 'Pensando...' ? 'processando…' : (loadingMsg.toLowerCase().replace('...', '…') || 'pensando…')}
                            </span>
                        ) : (
                            <>
                                <span className="hidden sm:inline"><kbd className="text-[9.5px] px-1 bg-slate-800 border border-slate-700 rounded-[3px] text-slate-300">↵</kbd> enviar</span>
                                <span className="hidden md:inline"><kbd className="text-[9.5px] px-1 bg-slate-800 border border-slate-700 rounded-[3px] text-slate-300">⇧</kbd>+<kbd className="text-[9.5px] px-1 bg-slate-800 border border-slate-700 rounded-[3px] text-slate-300">↵</kbd> quebra</span>
                                {attachments.length > 0 && <span className="text-emerald-400">{attachments.length} anexo{attachments.length > 1 ? 's' : ''}</span>}
                            </>
                        )}
                    </span>
                    <span className="px-2.5 py-1.5 text-violet-300 shrink-0">gpt-4o-mini</span>
                </div>
            </div>
        </>
    );
}
