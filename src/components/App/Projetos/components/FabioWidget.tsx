import { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Bot, 
  Loader2,
  AlertTriangle,
  Calendar,
  ListTodo,
  TrendingUp
} from 'lucide-react';
import { useFabioSugestoes, useProjetosStats } from '../../../../hooks/useProjetos';

interface FabioWidgetProps {
  unidadeSelecionada: string;
  isOpen: boolean;
  onToggle: () => void;
}

interface Mensagem {
  id: string;
  tipo: 'bot' | 'user';
  conteudo: string;
  timestamp: Date;
}

export function FabioWidget({ unidadeSelecionada, isOpen, onToggle }: FabioWidgetProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: sugestoes, loading: loadingSugestoes } = useFabioSugestoes(unidadeSelecionada);
  const { stats } = useProjetosStats(unidadeSelecionada);

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Mensagem inicial quando abre
  useEffect(() => {
    if (isOpen && mensagens.length === 0) {
      const mensagemInicial: Mensagem = {
        id: '1',
        tipo: 'bot',
        conteudo: `Olá! 👋 Sou o Fábio, seu assistente pedagógico. Como posso ajudar hoje?`,
        timestamp: new Date()
      };
      
      setMensagens([mensagemInicial]);
      
      // Adicionar resumo após 1 segundo
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

  // Gerar resumo baseado nos stats
  function gerarResumo(): string {
    const ativos = stats.total_ativos;
    const atrasados = stats.total_atrasados;
    const pendentes = stats.total_tarefas_pendentes;
    
    if (ativos === 0 && atrasados === 0 && pendentes === 0) {
      return `📊 **Resumo atual:**\n• Nenhum projeto cadastrado ainda\n• Que tal criar seu primeiro projeto?`;
    }
    
    return `📊 **Resumo da semana:**\n• ${ativos} projeto(s) ativo(s)\n• ${atrasados} projeto(s) atrasado(s)\n• ${pendentes} tarefa(s) pendente(s)`;
  }

  // Processar mensagem do usuário
  async function handleEnviarMensagem() {
    if (!inputValue.trim()) return;
    
    const novaMensagem: Mensagem = {
      id: Date.now().toString(),
      tipo: 'user',
      conteudo: inputValue,
      timestamp: new Date()
    };
    
    setMensagens(prev => [...prev, novaMensagem]);
    setInputValue('');
    setIsTyping(true);
    
    // Simular resposta do Fábio (futuramente integrar com Gemini)
    setTimeout(() => {
      const resposta = gerarRespostaIA(inputValue);
      const respostaMensagem: Mensagem = {
        id: (Date.now() + 1).toString(),
        tipo: 'bot',
        conteudo: resposta,
        timestamp: new Date()
      };
      setMensagens(prev => [...prev, respostaMensagem]);
      setIsTyping(false);
    }, 1500);
  }

  // Gerar resposta baseada em palavras-chave (mock - futuramente usar Gemini)
  function gerarRespostaIA(pergunta: string): string {
    const perguntaLower = pergunta.toLowerCase();
    
    if (perguntaLower.includes('atrasad')) {
      if (stats.total_atrasados === 0) {
        return '✅ Ótima notícia! Não há projetos atrasados no momento. Continue assim!';
      }
      return `⚠️ Há ${stats.total_atrasados} projeto(s) atrasado(s). Recomendo verificar a aba Lista para mais detalhes e priorizar as tarefas pendentes.`;
    }
    
    if (perguntaLower.includes('tarefa') || perguntaLower.includes('pendente')) {
      if (stats.total_tarefas_pendentes === 0) {
        return '✅ Todas as tarefas estão em dia! Nenhuma pendência no momento.';
      }
      return `📋 Você tem ${stats.total_tarefas_pendentes} tarefa(s) pendente(s). Acesse a aba Kanban para visualizar e organizar melhor.`;
    }
    
    if (perguntaLower.includes('projeto') && (perguntaLower.includes('novo') || perguntaLower.includes('criar'))) {
      return '📁 Para criar um novo projeto, clique no botão "+ Novo Projeto" no canto superior direito. Você pode escolher um tipo de projeto e as fases serão criadas automaticamente!';
    }
    
    if (perguntaLower.includes('resumo') || perguntaLower.includes('status')) {
      return gerarResumo();
    }
    
    if (perguntaLower.includes('ajuda') || perguntaLower.includes('help')) {
      return `🤖 Posso te ajudar com:\n• Ver projetos atrasados\n• Listar tarefas pendentes\n• Criar novos projetos\n• Resumo semanal\n• Dicas de organização\n\nÉ só perguntar!`;
    }
    
    return `Entendi sua pergunta sobre "${pergunta}". No momento, estou em fase de aprendizado, mas em breve poderei responder de forma mais completa. Enquanto isso, explore as abas do sistema para encontrar o que precisa! 🚀`;
  }

  // Sugestões rápidas
  const sugestoesRapidas = [
    { icone: <ListTodo className="w-3 h-3" />, texto: 'Listar projetos' },
    { icone: <AlertTriangle className="w-3 h-3" />, texto: 'Ver atrasados' },
    { icone: <TrendingUp className="w-3 h-3" />, texto: 'Resumo semanal' },
  ];

  function handleSugestaoClick(texto: string) {
    setInputValue(texto);
    setTimeout(() => handleEnviarMensagem(), 100);
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-violet-600 to-pink-600 rounded-full shadow-lg flex items-center justify-center text-white hover:scale-110 transition-transform z-50"
        title="Falar com Fábio"
      >
        <Bot className="w-7 h-7" />
        {sugestoes.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-xs flex items-center justify-center font-bold">
            {sugestoes.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-600 to-pink-600">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Fábio</h3>
          <span className="text-xs text-white/70">Assistente Pedagógico IA</span>
        </div>
        <button 
          onClick={onToggle}
          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.tipo === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                msg.tipo === 'user'
                  ? 'bg-violet-600 text-white rounded-br-md'
                  : 'bg-slate-800 text-slate-200 rounded-bl-md'
              }`}
            >
              {msg.conteudo}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
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

      {/* Sugestões Rápidas */}
      <div className="px-4 pb-2 flex gap-2 flex-wrap">
        {sugestoesRapidas.map((sug, idx) => (
          <button
            key={idx}
            onClick={() => handleSugestaoClick(sug.texto)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-full text-xs text-slate-300 transition-colors"
          >
            {sug.icone}
            {sug.texto}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnviarMensagem()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <button
            onClick={handleEnviarMensagem}
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

export default FabioWidget;
