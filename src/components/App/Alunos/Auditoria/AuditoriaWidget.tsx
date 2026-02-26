import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import {
    X, FileSpreadsheet, Upload, Loader2, Send, Minimize2, Maximize2, Cpu,
    Bot, Trash2, ArrowLeft, Paperclip, AlertCircle, Database
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getOpenAIConfig, analisarComIA } from './useOpenAIAnalysis';
import { type RelatorioAuditoria, executarAuditoria } from './useAuditoriaEmusys';
import { parseEmusysFiles, type ParseResult } from './parseEmusysFile';
import { chatComIA, type ChatMessage, type Role } from './useAgentChat';
import type { AgentContext } from './agentTools';

interface Unidade {
    id: string;
    nome: string;
}

interface AuditoriaWidgetProps {
    onClose: () => void;
}

// O Chat do Agente atuará também como Auditoria se arquivos forem anexados
export function AuditoriaWidget({ onClose }: AuditoriaWidgetProps) {
    const { isAdmin, usuario } = useAuth();

    // Contexto de permissão para as tools do agente
    const agentCtx: AgentContext = {
        isAdmin,
        unidadeId: usuario?.unidade_id ?? null,
        unidadeNome: usuario?.unidade_nome ?? null,
    };

    const [fullscreen, setFullscreen] = useState(false);
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [unidadeSelecionada, setUnidadeSelecionada] = useState('');

    // Estados do Chat
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome_1',
            role: 'assistant',
            content: 'Olá! Sou a **Inteligência Artificial da LA Music** 🎵\n\nPosso ajudar você com:\n- 📊 **Métricas**: ticket médio, faturamento, evasão, churn\n- 🔍 **Buscar alunos** pelo nome no sistema\n- 📈 **Leads & CRM**: leads de hoje, funil de conversão, buscar leads\n- 🗄️ **Consultar qualquer dado** do banco: turmas, professores, evasões, loja, etc.\n- 📋 **Auditoria**: anexe arquivos do Emusys para comparar com o banco\n\nPergunta o que quiser!',
        }
    ]);
    const [inputText, setInputText] = useState('');
    const [attachments, setAttachments] = useState<File[]>([]);

    const [isTyping, setIsTyping] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');

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

        // Se houver arquivos e nenhuma unidade foi selecionada, falhar graciosamente
        if (hasAttachments && !unidadeSelecionada && unidades.length > 1) {
            addMessage('assistant', '⚠️ Para processar relatórios de alunos, por favor **selecione a Unidade** no topo do chat antes de enviá-los.');
            return;
        }

        const config = getOpenAIConfig();
        if (!config.apiKey) {
            addMessage('assistant', '⚠️ AVISO: A API Key da OpenAI não está configurada.\nPor favor, vá a **Configurações > Inteligência Artificial** e configure antes de falar comigo.');
            return;
        }

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

        let systemContextContent = '';

        try {
            // 1. Processar Arquivos (Auditoria Emusys), se houverem
            if (hasAttachments) {
                setLoadingMsg('O agente está a processar os documentos...');

                let fileAlunos = currentAttachments.find(f => f.name.toLowerCase().includes('aluno') || f.name.toLowerCase().includes('ativo'));
                let fileMatriculas = currentAttachments.find(f => f.name.toLowerCase().includes('matr') || f.name.toLowerCase().includes('curso'));

                // Se a heurística falhou, deduzimos por ordem (1 = alunos, 2 = matriculas)
                if (!fileAlunos && currentAttachments.length > 0) fileAlunos = currentAttachments[0];
                if (!fileMatriculas && currentAttachments.length > 1) fileMatriculas = currentAttachments[1];

                if (!fileAlunos) {
                    throw new Error('Não foi possível identificar um arquivo de base de alunos.');
                }

                const parseResult: ParseResult = await parseEmusysFiles(fileAlunos, fileMatriculas);
                setLoadingMsg(`Base Extraída (${parseResult.alunosAtivos.size} alunos). Verificando banco de dados...`);

                const relatorio = await executarAuditoria(parseResult, unidadeSelecionada);
                setLoadingMsg('Comparação Completa. Analisando as divergências...');

                // Montar Resumo das Divergências para a IA compreender
                systemContextContent = `
[CONTEXTO DE FICHEIROS ENVIADOS - ANALISE DE BASE DE DADOS DB VS EMUSYS]
## Dados Extraídos da Auditoria:
- Total no Emusys (ficheiro): ${relatorio.resumo.totalEmusys}
- Total na Base de Dados interna (DB): ${relatorio.resumo.totalDB}
- Faltantes no DB (A criar): ${relatorio.faltantesDB.length}
- Faltantes no Emusys (Excesso no DB): ${relatorio.faltantesCRM.length}
- Status Divergente (Ex: inativo no emusys e ativo no db): ${relatorio.statusErrado.length}
- Duplicatas/Erros Cadastrais: ${relatorio.duplicatas.length}
- Cursos Faltando DB: ${relatorio.cursosFaltando.length}

DETALHES DA ANÁLISE (LISTAS): (Priorize responder sobre isso se for pedido) 
- Faltantes no DB (A criar): ${JSON.stringify(relatorio.faltantesDB.slice(0, 50).map(x => x.nome))}
- Faltantes no Emusys: ${JSON.stringify(relatorio.faltantesCRM.slice(0, 50).map(x => x.nome))}
- Status Divergente: ${JSON.stringify(relatorio.statusErrado)}
- Duplicatas: ${JSON.stringify(relatorio.duplicatas)}
============================
`;

                // Se o utilizador apenas enviou os arquivos sem prompt escrito, usamos um prompt padrão:
                if (!txt) {
                    newUserMsg.content = "Fiz o upload da base. Pode me dar um resumo das divergências identificadas e recomendações das prioridades?";
                }
            }

            // 2. Comunicar com OpenAI (com Tool Calling)
            setLoadingMsg('Pensando...');
            const historyToSend: { role: string; content: string }[] = messages
                .filter(m => !m.isAnalyzedData)
                .map(m => ({ role: m.role, content: m.content }));

            // Injetamos a mensagem "sistema" se acabamos de analisar o arquivo
            if (systemContextContent) {
                historyToSend.push({
                    role: 'system',
                    content: 'Você é um analista de dados especialista em cruzamento de banco de dados vs CRM (Emusys). Aqui estão os dados da última extração de arquivos feita pelo usuário. Faça uma análise detalhada e priorize as correções.\n\n' + systemContextContent
                });
            }

            // Adicionamos o que o usuário disse
            historyToSend.push({ role: 'user', content: newUserMsg.content });

            const TOOL_LABELS: Record<string, string> = {
                get_unidades: 'Consultando unidades...',
                get_dados_mensais: 'Buscando métricas no banco de dados...',
                search_aluno: 'Procurando aluno no sistema...',
                get_resumo_unidade: 'Calculando resumo da unidade...',
                get_movimentacoes: 'Verificando movimentações...',
                search_leads: 'Buscando leads no CRM...',
                get_leads_hoje: 'Verificando leads de hoje...',
                get_funil_leads: 'Calculando funil de conversão...',
                consultar_banco: 'Consultando banco de dados...',
                listar_tabelas: 'Listando tabelas disponíveis...',
            };

            // System prompt dinâmico que avisa sobre dias atuais e auditorias
            const dataHoje = new Date().toLocaleDateString('pt-BR');

            // Construir regra de permissão dinâmica
            const permissaoPrompt = agentCtx.isAdmin
                ? 'Você tem acesso ADMIN — pode consultar dados de TODAS as unidades.'
                : `REGRA DE PERMISSÃO: O usuário atual pertence à unidade "${agentCtx.unidadeNome || 'desconhecida'}" (unidade_id: ${agentCtx.unidadeId}). Você DEVE retornar APENAS dados desta unidade. Se o usuário perguntar sobre outras unidades, informe educadamente que ele só tem acesso aos dados da sua unidade. Ao usar consultar_banco, SEMPRE inclua WHERE unidade_id = '${agentCtx.unidadeId}' nas queries.`;

            const iaResponseString = await chatComIA([{
                role: 'system',
                content: `Você é a Inteligência Artificial assistente da LA Music, uma rede de escolas de música.
Hoje é dia ${dataHoje}.
Você SEMPRE responde em Português do Brasil (PT-BR).

${permissaoPrompt}

Você tem acesso a ferramentas que consultam o banco de dados da empresa em tempo real. Use-as sempre que o usuário perguntar sobre dados, métricas, alunos, faturamento, ticket médio, evasão, leads, CRM, professores, turmas, etc.

FERRAMENTAS DISPONÍVEIS:
- get_unidades: listar unidades
- get_dados_mensais: métricas mensais (alunos, matrículas, evasões, ticket médio, faturamento)
- search_aluno: buscar alunos por nome
- get_resumo_unidade: resumo de auditoria da unidade
- get_movimentacoes: movimentações de alunos (evasão, renovação, trancamento)
- search_leads: buscar leads/contatos comerciais por nome, status, período, unidade
- get_leads_hoje: leads que chegaram hoje
- get_funil_leads: estatísticas do funil/pipeline de leads
- consultar_banco: consulta SQL genérica para qualquer tabela (apenas SELECT)
- listar_tabelas: listar tabelas e views disponíveis

ATENÇÃO SOBRE O TICKET MÉDIO E FATURAMENTO: Os valores que você calcula na ferramenta get_resumo_unidade são valores "crus" (raw) mensurando a média real das parcelas ativas. Eles PODEM e DEVEM divergir propositalmente dos relatórios do Dashboard (pois o card tem regras de descontos de bolsas). O seu papel é reportar o valor que você encontrou servindo como uma dupla-checagem de auditoria para o usuário.
NUNCA invente dados. Se não souber, use as ferramentas disponíveis para buscar.
Responda de forma clara, profissional e objetiva, usando tabelas markdown e listas quando apropriado.
Você NÃO pode alterar nenhum dado — apenas consultar e analisar.
Se o usuário anexar arquivos, analise as divergências entre Emusys (CRM) e o banco de dados interno.`
            }, ...historyToSend], agentCtx, (progress) => {
                if (progress.status === 'calling') {
                    setLoadingMsg(TOOL_LABELS[progress.toolName] || `Executando ${progress.toolName}...`);
                }
            });

            // Adicionar a resposta
            addMessage('assistant', iaResponseString);

        } catch (err: any) {
            addMessage('assistant', `❌ **Ocorreu um Erro**:\n ${err.message}`);
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
        : 'fixed bottom-24 right-[5.5rem] md:right-24 z-[60] w-[450px] md:w-[500px] h-[600px] max-h-[85vh]';

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
                                    } text-sm whitespace-pre-wrap leading-relaxed`}
                                >
                                    {/* Markdown simplificado - se quiser usar react-markdown, importe depois */}
                                    <div dangerouslySetInnerHTML={{
                                        __html: msg.content
                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            .replace(/##\s(.*?)\n/g, '<h2 class="text-md font-bold mt-2 mb-1">$1</h2>')
                                            .replace(/###\s(.*?)\n/g, '<h3 class="text-sm font-bold mt-1 text-violet-300">$1</h3>')
                                            .replace(/\n\n/g, '<br/><br/>')
                                    }} />

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

                    {/* Loader se a IA estiver pensando / auditando localmente */}
                    {isTyping && (
                        <div className="flex flex-col gap-2 items-start mt-2">
                            <span className="flex items-center gap-2 text-xs font-semibold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                                <Loader2 className="w-3 h-3 animate-spin" /> {loadingMsg}
                            </span>
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
                        <span className="text-[9px] text-slate-600 font-mono">Modelo GPT-4o</span>
                    </div>

                </div>
            </div>
        </>
    );
}
