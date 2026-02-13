import { useState, useCallback } from 'react';
import { MessageSquare, X, MessageCircle } from 'lucide-react';
import { useConversas } from '../hooks/useConversas';
import { useMensagens } from '../hooks/useMensagens';
import { useWhatsAppStatus } from '../hooks/useWhatsAppStatus';
import { useNotificacoes } from '../hooks/useNotificacoes';
import { InboxList } from '../components/chat/InboxList';
import { ChatPanel } from '../components/chat/ChatPanel';
import { LeadSidebar } from '../components/chat/LeadSidebar';
import { WhatsAppBanner } from '../components/chat/WhatsAppBanner';
import type { ConversaCRM, FiltroInbox, LeadCRM } from '../types';

interface NotificacaoToast {
  id: string;
  leadNome: string;
  preview: string;
  conversaId: string;
  timestamp: number;
}

interface ConversasTabProps {
  unidadeId: string;
  onLeadClick?: (lead: LeadCRM) => void;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onMatricular?: (lead: LeadCRM) => void;
  onArquivar?: (lead: LeadCRM) => void;
}

export function ConversasTab({ unidadeId, onAgendar, onMoverEtapa, onMatricular, onArquivar }: ConversasTabProps) {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaCRM | null>(null);
  const [filtro, setFiltro] = useState<FiltroInbox>('todas');
  const [busca, setBusca] = useState('');
  const [sidebarColapsada, setSidebarColapsada] = useState(false);
  const [toasts, setToasts] = useState<NotificacaoToast[]>([]);

  // Hooks
  const { status: whatsappStatus } = useWhatsAppStatus();
  const { conversas, loading: loadingConversas, totalNaoLidas, marcarComoLida } = useConversas({
    unidadeId,
    filtro,
    busca,
  });

  const leadSelecionado = conversaSelecionada?.lead as LeadCRM | null;

  const { mensagens, loading: loadingMensagens, enviando, temMais, carregarMais, enviarMensagem, enviarMidia } = useMensagens({
    conversaId: conversaSelecionada?.id || null,
    leadId: leadSelecionado?.id || null,
  });

  // Selecionar conversa
  const handleSelecionarConversa = useCallback((conversa: ConversaCRM) => {
    setConversaSelecionada(conversa);
    // Marcar como lida quando abrir
    if (conversa.nao_lidas > 0) {
      marcarComoLida(conversa.id);
    }
  }, [marcarComoLida]);

  // Toggle ficha do lead (colapsar/expandir sidebar)
  const toggleFicha = useCallback(() => {
    setSidebarColapsada(prev => !prev);
  }, []);

  // Callback de notificação: nova mensagem de entrada
  const handleNovaMensagem = useCallback((leadNome: string, preview: string, conversaId: string) => {
    const id = `notif-${Date.now()}`;
    setToasts(prev => [...prev, { id, leadNome, preview, conversaId, timestamp: Date.now() }]);
    // Auto-remover após 5 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // Remover toast manualmente
  const removerToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clicar no toast para abrir a conversa
  const handleToastClick = useCallback((conversaId: string) => {
    const conversa = conversas.find(c => c.id === conversaId);
    if (conversa) {
      handleSelecionarConversa(conversa);
    }
  }, [conversas, handleSelecionarConversa]);

  // Hook de notificações (som + título da página + callback)
  useNotificacoes({
    conversaAbertaId: conversaSelecionada?.id || null,
    totalNaoLidas,
    onNovaMensagem: handleNovaMensagem,
  });

  return (
    <div className="flex flex-col -mx-6 -mt-6" style={{ height: 'calc(100vh - 180px)' }}>
      {/* Banner de status WhatsApp */}
      <WhatsAppBanner status={whatsappStatus} />

      {/* Split Panel: Inbox + Chat + Ficha */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coluna 1: Inbox */}
        <InboxList
          conversas={conversas}
          loading={loadingConversas}
          conversaSelecionada={conversaSelecionada}
          filtro={filtro}
          busca={busca}
          totalNaoLidas={totalNaoLidas}
          onSelecionarConversa={handleSelecionarConversa}
          onFiltroChange={setFiltro}
          onBuscaChange={setBusca}
        />

        {/* Coluna 2: Chat */}
        {conversaSelecionada && leadSelecionado ? (
          <ChatPanel
            conversa={conversaSelecionada}
            lead={leadSelecionado}
            mensagens={mensagens}
            loading={loadingMensagens}
            enviando={enviando}
            temMais={temMais}
            onCarregarMais={carregarMais}
            onEnviarMensagem={enviarMensagem}
            onEnviarMidia={enviarMidia}
            onToggleFicha={toggleFicha}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-900">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-400">Selecione uma conversa</h3>
              <p className="text-sm text-slate-500 mt-1">Escolha uma conversa no inbox para começar</p>
            </div>
          </div>
        )}

        {/* Coluna 3: Ficha do Lead (colapsável) */}
        {conversaSelecionada && leadSelecionado && (
          <LeadSidebar
            lead={leadSelecionado}
            conversa={conversaSelecionada}
            mensagensCount={mensagens.length}
            colapsada={sidebarColapsada}
            onToggle={toggleFicha}
            onAgendar={onAgendar}
            onMoverEtapa={onMoverEtapa}
            onMatricular={onMatricular}
            onArquivar={onArquivar}
          />
        )}
      </div>

      {/* Toasts de notificação flutuantes */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() => { handleToastClick(toast.conversaId); removerToast(toast.id); }}
              className="flex items-start gap-3 px-4 py-3 bg-slate-800 border border-violet-500/30 rounded-xl shadow-2xl cursor-pointer hover:bg-slate-700/80 transition animate-in slide-in-from-right-4 fade-in duration-300"
            >
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{toast.leadNome}</p>
                <p className="text-xs text-slate-400 truncate">{toast.preview}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removerToast(toast.id); }}
                className="p-0.5 rounded text-slate-500 hover:text-white transition flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
