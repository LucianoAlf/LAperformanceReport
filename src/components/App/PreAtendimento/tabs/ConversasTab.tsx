import { useState, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { useConversas } from '../hooks/useConversas';
import { useMensagens } from '../hooks/useMensagens';
import { useWhatsAppStatus } from '../hooks/useWhatsAppStatus';
import { InboxList } from '../components/chat/InboxList';
import { ChatPanel } from '../components/chat/ChatPanel';
import { LeadSidebar } from '../components/chat/LeadSidebar';
import { WhatsAppBanner } from '../components/chat/WhatsAppBanner';
import type { ConversaCRM, FiltroInbox, LeadCRM } from '../types';

interface ConversasTabProps {
  unidadeId: string;
  onLeadClick?: (lead: LeadCRM) => void;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onArquivar?: (lead: LeadCRM) => void;
}

export function ConversasTab({ unidadeId, onAgendar, onMoverEtapa, onArquivar }: ConversasTabProps) {
  const [conversaSelecionada, setConversaSelecionada] = useState<ConversaCRM | null>(null);
  const [filtro, setFiltro] = useState<FiltroInbox>('todas');
  const [busca, setBusca] = useState('');
  const [fichaVisivel, setFichaVisivel] = useState(true);

  // Hooks
  const { status: whatsappStatus } = useWhatsAppStatus();
  const { conversas, loading: loadingConversas, totalNaoLidas, marcarComoLida } = useConversas({
    unidadeId,
    filtro,
    busca,
  });

  const leadSelecionado = conversaSelecionada?.lead as LeadCRM | null;

  const { mensagens, loading: loadingMensagens, enviando, temMais, carregarMais, enviarMensagem } = useMensagens({
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

  // Toggle ficha do lead
  const toggleFicha = useCallback(() => {
    setFichaVisivel(prev => !prev);
  }, []);

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
        {fichaVisivel && conversaSelecionada && leadSelecionado && (
          <LeadSidebar
            lead={leadSelecionado}
            conversa={conversaSelecionada}
            mensagensCount={mensagens.length}
            onAgendar={onAgendar}
            onMoverEtapa={onMoverEtapa}
            onArquivar={onArquivar}
          />
        )}
      </div>
    </div>
  );
}
