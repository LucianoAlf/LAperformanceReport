import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import {
    X, FileSpreadsheet, Upload, Loader2, Send, Minimize2, Maximize2,
    Bot, Paperclip, Database, MessageSquarePlus, History, ThumbsUp, ThumbsDown, ChevronLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { chatComIA, loadConversations, loadMessages, saveFeedback, type ChatMessage, type Role, type AgentContext } from './useAgentChat';
import { BIVisualization } from './BIVisualization';

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

    return (
        <>
            <div className={`${panelClasses} bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl 
                shadow-black/40 flex flex-col overflow-hidden backdrop-blur-sm
                animate-in slide-in-from-bottom-3 duration-200 ring-1 ring-violet-500/20`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                {/* DRAG AND DROP OVERLAY GLOBAL */}
                {dragActive && (
                    <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-md border-[3px] border-violet-500 border-dashed rounded-2xl flex flex-col items-center justify-center text-violet-300 pointer-events-none transition-all">
                        <Upload className="w-14 h-14 mb-3 animate-bounce" />
                        <p className="font-bold text-lg">Solte ficheiros xlsx para auditar</p>
                        <p className="text-sm opacity-70 mt-1">(Alunos Ativos e Matrículas)</p>
                    </div>
                )}

                {/* Header UI (App-like) */}
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 border-b border-slate-700/60 shrink-0">
                    <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-800"></span>
                    </div>

                    <div className="flex flex-col flex-1 pl-1">
                        <h3 className="text-[13px] font-bold text-white flex items-center gap-1.5 leading-tight">
                            Assistente IA LA Music
                        </h3>
                        <span className="text-[10px] text-slate-400 leading-tight">Suporte Geral & Auditoria DB</span>
                    </div>

                    <button
                        onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
                        className={`text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700/60 transition-colors ${showHistory ? 'text-violet-400 bg-violet-500/10' : ''}`}
                        title="Histórico de conversas"
                    >
                        <History className="w-4 h-4" />
                    </button>
                    <button
                        onClick={startNewConversation}
                        className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700/60 transition-colors"
                        title="Nova conversa"
                    >
                        <MessageSquarePlus className="w-4 h-4" />
                    </button>
                    <button onClick={() => setFullscreen(!fullscreen)} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700/60 transition-colors">
                        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700/60 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Toolbar Secundária (Unidade) — Admin pode selecionar, outros veem sua unidade fixa */}
                <div className="px-3 py-2 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Database className="w-3.5 h-3.5" />
                        {isAdmin ? 'Auditar Unidade:' : 'Unidade:'}
                    </div>
                    {isAdmin ? (
                        <select
                            value={unidadeSelecionada}
                            onChange={(e) => setUnidadeSelecionada(e.target.value)}
                            className="bg-slate-800 border-transparent text-xs py-1 px-2 rounded-md outline-none focus:ring-1 ring-violet-500 text-slate-300 max-w-[140px]"
                        >
                            {unidades.map(u => (
                                <option key={u.id} value={u.id}>{u.nome}</option>
                            ))}
                        </select>
                    ) : (
                        <span className="text-xs text-slate-300 font-medium">{agentCtx.unidadeNome || 'Carregando...'}</span>
                    )}
                </div>

                {/* --- SIDEBAR HISTÓRICO --- */}
                {showHistory && (
                    <div className="absolute inset-0 top-[90px] z-30 bg-slate-900 flex flex-col overflow-hidden rounded-b-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
                            <h4 className="text-sm font-semibold text-white">Conversas</h4>
                            <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700/60">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
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
                                            className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${isActive
                                                ? 'bg-violet-500/15 border border-violet-500/30'
                                                : 'hover:bg-slate-800/70 border border-transparent'
                                            }`}
                                        >
                                            <p className={`text-[13px] leading-snug line-clamp-2 ${isActive ? 'text-violet-200 font-medium' : 'text-slate-300'}`}>
                                                {conv.title || 'Conversa sem título'}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <span className="text-[10px] text-slate-500">{dateStr}, {timeStr}</span>
                                                {conv.total_tokens > 0 && (
                                                    <>
                                                        <span className="text-slate-700">·</span>
                                                        <span className="text-[10px] text-slate-600">{conv.total_tokens.toLocaleString()} tokens</span>
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

                {/* --- CORPO DO CHAT --- */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 relative">

                    {/* LISTA DE MENSAGENS */}
                    {messages.map((msg, i) => {
                        const isUser = msg.role === 'user';

                        return (
                            <div key={msg.id} className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>

                                {/* Avatar para bot */}
                                {!isUser && i === 0 && (
                                    <span className="text-[10px] text-slate-500 ml-1">IA Assistant</span>
                                )}

                                {/* Bubble */}
                                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] ${isUser
                                    ? 'bg-violet-600 text-white rounded-br-sm shadow-md'
                                    : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/60 shadow-sm'
                                    } text-sm leading-relaxed`}
                                >
                                    {isUser ? (
                                        <span className="whitespace-pre-wrap">{msg.content}</span>
                                    ) : (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
                                                th: ({ children }) => <th className="border border-slate-600 px-2 py-1 bg-slate-700/50 text-left font-semibold text-slate-300">{children}</th>,
                                                td: ({ children }) => <td className="border border-slate-700 px-2 py-1">{children}</td>,
                                                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                                                h2: ({ children }) => <h2 className="text-md font-bold mt-3 mb-1">{children}</h2>,
                                                h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 text-violet-300">{children}</h3>,
                                                ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
                                                ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
                                                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                                                p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                                                code: ({ children }) => <code className="bg-slate-900 px-1 py-0.5 rounded text-xs text-violet-300">{children}</code>,
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    )}

                                    {/* Gráfico BI se houver dados de visualização */}
                                    {!isUser && msg.visualizationType && msg.sqlResult && Array.isArray(msg.sqlResult) && msg.sqlResult.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-slate-700/50">
                                            <BIVisualization
                                                type={msg.visualizationType}
                                                data={msg.sqlResult}
                                                config={msg.visualizationConfig}
                                            />
                                        </div>
                                    )}

                                    {/* Feedback thumbs up/down em mensagens do assistente */}
                                    {!isUser && msg.id !== 'welcome_1' && (
                                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-700/30">
                                            <button
                                                onClick={() => handleFeedback(msg.id, 5)}
                                                className={`p-1 rounded transition-colors ${feedbackGiven[msg.id] === 5 ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                                                title="Resposta útil"
                                            >
                                                <ThumbsUp className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => handleFeedback(msg.id, 1)}
                                                className={`p-1 rounded transition-colors ${feedbackGiven[msg.id] === 1 ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'}`}
                                                title="Resposta ruim"
                                            >
                                                <ThumbsDown className="w-3 h-3" />
                                            </button>
                                            {msg.metadata?.tokens_used && (
                                                <span className="ml-auto text-[9px] text-slate-600 font-mono">
                                                    {msg.metadata.tokens_used.toLocaleString()} tokens
                                                    {msg.metadata.cost_usd ? ` · $${msg.metadata.cost_usd.toFixed(4)}` : ''}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Mostra Anexos enviados na mensagem */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className={`flex flex-wrap gap-2 mt-3 pt-3 border-t ${isUser ? 'border-violet-500/50' : 'border-slate-700'} `}>
                                            {msg.attachments.map((f, i) => (
                                                <div key={i} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium 
                          ${isUser ? 'bg-violet-700/50 text-violet-100' : 'bg-slate-700 text-slate-300'}`}>
                                                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                                                    <span className="truncate max-w-[120px]">{f.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            </div>
                        );
                    })}

                    {/* Bubble de loading da Sol */}
                    {isTyping && (
                        <div className="flex items-end gap-2 mt-2">
                            <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                                <Bot className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="bg-slate-700/80 border border-slate-600/50 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[75%]">
                                {loadingMsg !== 'Pensando...' ? (
                                    <span className="text-xs text-slate-300 flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                                        {loadingMsg}
                                    </span>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
                                        </div>
                                        <span className="text-xs text-slate-400 transition-all duration-500">
                                            {SOL_TYPING_MESSAGES[typingPhase]}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* --- ÁREA DE INPUT --- */}
                <div className="p-3 bg-slate-800/95 border-t border-slate-700 shrink-0">

                    {/* Anexos pendentes para enviar */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {attachments.map((file, i) => (
                                <div key={i} className="flex items-center gap-1.5 bg-slate-700/50 border border-slate-600 rounded-lg pl-2 pr-1 py-1 text-xs text-slate-200">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="truncate max-w-[100px]">{file.name}</span>
                                    <button onClick={() => removeAttachment(i)} className="text-slate-400 hover:text-rose-400 hover:bg-slate-600 p-1 rounded transition-colors">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="relative flex items-end bg-slate-900 border border-slate-600 rounded-xl focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500/50 transition-all overflow-hidden">

                        {/* Input para Upload esporádico (clip icon) */}
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
                            className="p-3 text-slate-400 hover:text-violet-400 transition-colors"
                            title="Anexar arquivo de Auditoria"
                        >
                            <Paperclip className="w-4 h-4" />
                        </button>

                        <textarea
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ex: Resume as divergências desta base de alunos..."
                            className="flex-1 max-h-32 min-h-[44px] bg-transparent text-sm text-white focus:outline-none py-3 resize-none custom-scrollbar leading-relaxed"
                            rows={1}
                            style={{
                                height: inputText ? Math.min(120, Math.max(44, inputText.split('\n').length * 20 + 24)) + 'px' : '44px'
                            }}
                        />

                        <button
                            onClick={handleSend}
                            disabled={isTyping || (!inputText.trim() && attachments.length === 0)}
                            className="p-3 text-slate-400 hover:text-violet-400 transition-colors disabled:opacity-50 disabled:hover:text-slate-400"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="text-center mt-2 flex justify-between items-center px-1">
                        <span className="text-[10px] text-slate-500">
                            Pressione <kbd className="bg-slate-800 px-1 py-0.5 rounded border border-slate-700">Enter</kbd> para enviar
                        </span>
                        <span className="text-[9px] text-slate-600 font-mono">BI Agent · GPT-4o-mini</span>
                    </div>

                </div>
            </div>
        </>
    );
}

