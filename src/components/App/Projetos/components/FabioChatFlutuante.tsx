import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Send, 
  Loader2,
  AlertTriangle,
  Calendar,
  ListTodo,
  TrendingUp,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useProjetosStats, useProximosPrazos } from '../../../../hooks/useProjetos';
import { supabase } from '../../../../lib/supabase';

interface Mensagem {
  id: string;
  tipo: 'bot' | 'user';
  conteudo: string;
  timestamp: Date;
}

interface FabioChatFlutuanteProps {
  unidadeSelecionada: string;
}

export function FabioChatFlutuante({ unidadeSelecionada }: FabioChatFlutuanteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [useGemini, setUseGemini] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { stats } = useProjetosStats(unidadeSelecionada);
  const { data: proximosPrazos } = useProximosPrazos(unidadeSelecionada);

  const askFabioGemini = useCallback(async (pergunta: string): Promise<string> => {
    try {
      const contexto = {
        projetosAtivos: stats?.total_ativos || 0,
        projetosAtrasados: stats?.total_atrasados || 0,
        tarefasPendentes: stats?.total_tarefas_pendentes || 0,
        taxaConclusao: stats?.taxa_conclusao || 0,
        proximosPrazos: (proximosPrazos || []).slice(0, 5).map(p => ({
          nome: p.nome,
          prazo: p.prazo,
          tipo: p.tipo as 'projeto' | 'tarefa'
        })),
        unidade: unidadeSelecionada === 'todas' ? 'Consolidado' : unidadeSelecionada,
      };

      const historicoMensagens = mensagens.slice(-6).map(m => ({
        tipo: m.tipo === 'bot' ? 'fabio' as const : 'usuario' as const,
        texto: m.conteudo
      }));

      const { data, error } = await supabase.functions.invoke('gemini-fabio-chat', {
        body: { 
          pergunta, 
          contexto,
          historicoMensagens 
        }
      });

      if (error) {
        console.error('[FabioChat] Erro na Edge Function:', error);
        throw error;
      }

      if (data?.resposta) {
        return data.resposta;
      }

      throw new Error('Resposta vazia');
    } catch (error) {
      console.error('[FabioChat] Erro ao chamar Gemini:', error);
      return gerarRespostaIA(pergunta);
    }
  }, [stats, proximosPrazos, unidadeSelecionada, mensagens]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  useEffect(() => {
    if (isOpen && mensagens.length === 0) {
      const hora = new Date().getHours();
      const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      
      const mensagemInicial: Mensagem = {
        id: '1',
        tipo: 'bot',
        conteudo: `${saudacao}! 👋 Sou o Fábio, seu assistente de projetos pedagógicos. Como posso ajudar?`,
        timestamp: new Date()
      };
      
      setMensagens([mensagemInicial]);
      
      setTimeout(() => {
        const resumo: Mensagem = {
          id: '2',
          tipo: 'bot',
          conteudo: gerarResumo(),
          timestamp: new Date()
        };
        setMensagens(prev => [...prev, resumo]);
      }, 1000);
    }
  }, [isOpen]);

  function gerarResumo(): string {
    const ativos = stats?.total_ativos || 0;
    const atrasados = stats?.total_atrasados || 0;
    const pendentes = stats?.total_tarefas_pendentes || 0;
    
    if (ativos === 0 && atrasados === 0 && pendentes === 0) {
      return `📊 **Resumo atual:**\n• Nenhum projeto cadastrado ainda\n• Que tal criar seu primeiro projeto?`;
    }
    
    let resumo = `📊 **Resumo do dia:**\n`;
    resumo += `• ${ativos} projeto(s) ativo(s)\n`;
    
    if (atrasados > 0) {
      resumo += `• ⚠️ ${atrasados} projeto(s) atrasado(s)\n`;
    }
    
    if (pendentes > 0) {
      resumo += `• ${pendentes} tarefa(s) pendente(s)`;
    } else {
      resumo += `• ✅ Todas as tarefas em dia!`;
    }
    
    return resumo;
  }

  async function handleEnviarMensagem(texto?: string) {
    const mensagemTexto = texto || inputValue;
    if (!mensagemTexto.trim()) return;
    
    const novaMensagem: Mensagem = {
      id: Date.now().toString(),
      tipo: 'user',
      conteudo: mensagemTexto,
      timestamp: new Date()
    };
    
    setMensagens(prev => [...prev, novaMensagem]);
    setInputValue('');
    setIsTyping(true);
    
    try {
      let resposta: string;
      if (useGemini) {
        resposta = await askFabioGemini(mensagemTexto);
      } else {
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
        resposta = gerarRespostaIA(mensagemTexto);
      }
      
      const respostaMensagem: Mensagem = {
        id: (Date.now() + 1).toString(),
        tipo: 'bot',
        conteudo: resposta,
        timestamp: new Date()
      };
      setMensagens(prev => [...prev, respostaMensagem]);
    } catch (error) {
      console.error('[FabioChat] Erro:', error);
      const erroMensagem: Mensagem = {
        id: (Date.now() + 1).toString(),
        tipo: 'bot',
        conteudo: 'Ops! Tive um probleminha técnico. 😅 Pode tentar de novo?',
        timestamp: new Date()
      };
      setMensagens(prev => [...prev, erroMensagem]);
    } finally {
      setIsTyping(false);
    }
  }

  function gerarRespostaIA(pergunta: string): string {
    const perguntaLower = pergunta.toLowerCase();
    const atrasados = stats?.total_atrasados || 0;
    const pendentes = stats?.total_tarefas_pendentes || 0;
    const ativos = stats?.total_ativos || 0;
    
    if (perguntaLower.includes('atrasad')) {
      if (atrasados === 0) {
        return '✅ Ótima notícia! Não há projetos atrasados no momento. Continue assim! 🎉';
      }
      return `⚠️ Há **${atrasados} projeto(s) atrasado(s)**.\n\nRecomendo:\n1. Verificar a aba **Lista** para detalhes\n2. Priorizar as tarefas pendentes\n3. Redistribuir responsabilidades se necessário`;
    }
    
    if (perguntaLower.includes('prazo') || perguntaLower.includes('venc')) {
      return `📅 Para ver os próximos prazos:\n\n1. Acesse a aba **Calendário** para visão mensal\n2. Ou veja a **Timeline** para visão de Gantt\n3. O Dashboard também mostra os prazos próximos\n\nDica: Clique em um evento para ver detalhes!`;
    }
    
    if (perguntaLower.includes('tarefa') || perguntaLower.includes('pendente')) {
      if (pendentes === 0) {
        return '✅ Todas as tarefas estão em dia! Nenhuma pendência no momento. 🎉';
      }
      return `📋 Você tem **${pendentes} tarefa(s) pendente(s)**.\n\nSugestões:\n• Acesse o **Kanban** para organizar por status\n• Use **Por Pessoa** para ver por responsável\n• Priorize tarefas com prazo próximo`;
    }
    
    if (perguntaLower.includes('projeto') && (perguntaLower.includes('novo') || perguntaLower.includes('criar'))) {
      return `📁 Para criar um novo projeto:\n\n1. Clique em **"+ Novo Projeto"** no canto superior\n2. Escolha o tipo de projeto\n3. As fases serão criadas automaticamente!\n\nDica: Configure os templates em **Configurações** > **Templates de Fases**`;
    }
    
    if (perguntaLower.includes('resumo') || perguntaLower.includes('status') || perguntaLower.includes('semana')) {
      return gerarResumo();
    }
    
    if (perguntaLower.includes('redistribuir') || perguntaLower.includes('delegar')) {
      return `🔄 Para redistribuir tarefas:\n\n1. Acesse **Por Pessoa** para ver carga de cada um\n2. Clique na tarefa para abrir detalhes\n3. Altere o responsável no modal\n\nDica: Equilibre a carga entre a equipe!`;
    }
    
    if (perguntaLower.includes('ajuda') || perguntaLower.includes('help') || perguntaLower.includes('o que')) {
      return `🤖 Posso te ajudar com:\n\n• **"Projetos atrasados"** - Ver pendências\n• **"Próximos prazos"** - Calendário de entregas\n• **"Resumo semanal"** - Status geral\n• **"Redistribuir tarefas"** - Balancear equipe\n• **"Criar projeto"** - Novo projeto\n\nÉ só perguntar! 💬`;
    }
    
    if (perguntaLower.includes('kanban') || perguntaLower.includes('board')) {
      return `📊 O **Kanban** organiza tarefas em colunas:\n\n• **A Fazer** - Tarefas não iniciadas\n• **Em Progresso** - Em andamento\n• **Concluído** - Finalizadas\n\nArraste e solte para mover tarefas entre colunas!`;
    }
    
    if (perguntaLower.includes('timeline') || perguntaLower.includes('gantt')) {
      return `📈 A **Timeline** mostra projetos em formato Gantt:\n\n• Visualize duração de cada projeto\n• Veja sobreposições de datas\n• Identifique gargalos de tempo\n\nUse os filtros para focar em projetos específicos!`;
    }
    
    return `Entendi sua pergunta sobre "${pergunta}".\n\nAinda estou aprendendo, mas posso ajudar com:\n• Projetos atrasados\n• Próximos prazos\n• Resumo semanal\n• Redistribuir tarefas\n\nTente uma dessas opções! 🚀`;
  }

  const sugestoesRapidas = [
    { icone: <AlertTriangle className="w-3 h-3" />, texto: 'Projetos atrasados' },
    { icone: <Calendar className="w-3 h-3" />, texto: 'Próximos prazos' },
    { icone: <TrendingUp className="w-3 h-3" />, texto: 'Resumo semanal' },
    { icone: <RefreshCw className="w-3 h-3" />, texto: 'Redistribuir tarefas' },
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-violet-600 rounded-full shadow-lg shadow-violet-500/30 flex items-center justify-center hover:scale-110 transition-all duration-300 z-50 group overflow-hidden"
        title="Falar com Fábio"
      >
        <img 
          src="/Fábio.svg" 
          alt="Fábio" 
          className="w-full h-full object-cover"
        />
        <span className="absolute inset-0 rounded-full bg-violet-500 animate-ping opacity-20" />
        <span className="absolute right-full mr-3 px-3 py-1.5 bg-slate-800 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Falar com Fábio
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[380px] h-[600px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-violet-500/10 flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-600 to-pink-600">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-violet-600">
          <img 
            src="/Fábio.svg" 
            alt="Fábio" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white flex items-center gap-2">
            Fábio
            <Sparkles className="w-4 h-4 text-yellow-300" />
          </h3>
          <button 
            onClick={() => setUseGemini(!useGemini)}
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white transition-colors"
            title={useGemini ? 'Usando Gemini IA - Clique para modo local' : 'Modo local - Clique para usar Gemini IA'}
          >
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Online
            {useGemini ? (
              <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[10px]">
                <Wifi className="w-3 h-3" /> Gemini
              </span>
            ) : (
              <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-white/10 rounded text-[10px]">
                <WifiOff className="w-3 h-3" /> Local
              </span>
            )}
          </button>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.tipo === 'bot' && (
              <div className="w-7 h-7 rounded-full overflow-hidden mr-2 flex-shrink-0 mt-1 bg-violet-600">
                <img 
                  src="/Fábio.svg" 
                  alt="Fábio" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                msg.tipo === 'user'
                  ? 'bg-violet-600 text-white rounded-br-md'
                  : 'bg-slate-800 text-slate-200 rounded-bl-md'
              }`}
            >
              {msg.conteudo.split('**').map((part, i) => 
                i % 2 === 1 ? <strong key={i}>{part}</strong> : part
              )}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full overflow-hidden mr-2 flex-shrink-0 bg-violet-600">
              <img 
                src="/Fábio.svg" 
                alt="Fábio" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 pb-2 flex gap-2 flex-wrap">
        {sugestoesRapidas.map((sug, idx) => (
          <button
            key={idx}
            onClick={() => handleEnviarMensagem(sug.texto)}
            disabled={isTyping}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-violet-600/30 hover:border-violet-500/50 border border-slate-700 rounded-full text-xs text-slate-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sug.icone}
            {sug.texto}
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isTyping && handleEnviarMensagem()}
            placeholder="Digite sua mensagem..."
            disabled={isTyping}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={() => handleEnviarMensagem()}
            disabled={!inputValue.trim() || isTyping}
            className="w-10 h-10 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl flex items-center justify-center text-white transition-colors"
          >
            {isTyping ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FabioChatFlutuante;
