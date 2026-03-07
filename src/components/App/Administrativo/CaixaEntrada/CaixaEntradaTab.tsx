import { useState, useCallback } from 'react';
import { MessageSquare, X, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminConversas } from './hooks/useAdminConversas';
import { useAdminMensagens } from './hooks/useAdminMensagens';
import { AdminInboxList } from './AdminInboxList';
import { AdminChatPanel } from './AdminChatPanel';
import { NovaConversaModal } from './NovaConversaModal';
import type { AdminConversa, AlunoInbox, FiltroAdminInbox } from './types';
import type { ContatoInbox } from './NovaConversaModal';

interface NotificacaoToast {
  id: string;
  alunoNome: string;
  preview: string;
  conversaId: string;
  timestamp: number;
}

interface CaixaEntradaTabProps {
  unidadeId: string | null;
}

export function CaixaEntradaTab({ unidadeId }: CaixaEntradaTabProps) {
  const { usuario } = useAuth();
  const [conversaSelecionada, setConversaSelecionada] = useState<AdminConversa | null>(null);
  const [filtro, setFiltro] = useState<FiltroAdminInbox>('todas');
  const [busca, setBusca] = useState('');
  const [modalNovaConversa, setModalNovaConversa] = useState(false);
  const [toasts, setToasts] = useState<NotificacaoToast[]>([]);

  const { conversas, loading: loadingConversas, totalNaoLidas, marcarComoLida, refetch } = useAdminConversas({
    unidadeId,
    filtro,
    busca,
  });

  const alunoSelecionado = conversaSelecionada?.aluno as AlunoInbox | null;

  const { mensagens, loading: loadingMensagens, enviando, temMais, carregarMais, enviarMensagem, enviarMidia } = useAdminMensagens({
    conversaId: conversaSelecionada?.id || null,
    alunoId: alunoSelecionado?.id || null,
    remetenteNome: usuario?.nome || usuario?.apelido || 'Admin',
  });

  const handleSelecionarConversa = useCallback((conversa: AdminConversa) => {
    setConversaSelecionada(conversa);
    if (conversa.nao_lidas > 0) {
      marcarComoLida(conversa.id);
    }
  }, [marcarComoLida]);

  const handleNovaConversaCriada = useCallback((contato: ContatoInbox) => {
    refetch().then(() => {
      setTimeout(() => {
        let conversa: AdminConversa | undefined;
        if (contato.tipo === 'aluno' && contato.aluno) {
          conversa = conversas.find(c => c.aluno_id === contato.aluno!.id);
        } else if (contato.tipo === 'externo' && contato.telefone_externo) {
          conversa = conversas.find(c => c.telefone_externo === contato.telefone_externo && c.aluno_id === null);
        }
        if (conversa) {
          setConversaSelecionada(conversa);
        }
      }, 500);
    });
  }, [conversas, refetch]);

  if (!unidadeId || unidadeId === 'todos') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">Selecione uma unidade</h3>
          <p className="text-sm text-slate-500 mt-1">
            Cada unidade tem sua própria caixa de entrada administrativa
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col -mx-6 -mt-2" style={{ height: 'calc(100vh - 220px)' }}>
      {/* Split Panel: Inbox + Chat */}
      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-700/50">
        {/* Coluna 1: Inbox */}
        <AdminInboxList
          conversas={conversas}
          loading={loadingConversas}
          conversaSelecionada={conversaSelecionada}
          filtro={filtro}
          busca={busca}
          totalNaoLidas={totalNaoLidas}
          onSelecionarConversa={handleSelecionarConversa}
          onFiltroChange={setFiltro}
          onBuscaChange={setBusca}
          onNovaConversa={() => setModalNovaConversa(true)}
        />

        {/* Coluna 2: Chat */}
        {conversaSelecionada ? (
          <AdminChatPanel
            conversa={conversaSelecionada}
            aluno={alunoSelecionado}
            mensagens={mensagens}
            loading={loadingMensagens}
            enviando={enviando}
            temMais={temMais}
            onCarregarMais={carregarMais}
            onEnviarMensagem={enviarMensagem}
            onEnviarMidia={enviarMidia}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0d1424 100%)' }}>
            <div className="text-center animate-in fade-in duration-500">
              <div className="w-20 h-20 rounded-full bg-violet-500/10 border border-violet-500/10 flex items-center justify-center mx-auto mb-5">
                <MessageSquare className="w-9 h-9 text-violet-400/50" />
              </div>
              <h3 className="text-lg font-semibold text-slate-300">Caixa de Entrada</h3>
              <p className="text-sm text-slate-500 mt-1.5 max-w-[300px] mx-auto">
                Selecione uma conversa ou inicie uma nova para se comunicar com alunos
              </p>
              <div className="flex items-center justify-center gap-4 mt-6 text-[11px] text-slate-600">
                <span>← Conversas</span>
                <span>·</span>
                <span>{conversas.length} conversa{conversas.length !== 1 ? 's' : ''}</span>
                {totalNaoLidas > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-violet-400">{totalNaoLidas} não lida{totalNaoLidas !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Conversa */}
      <NovaConversaModal
        aberto={modalNovaConversa}
        onClose={() => setModalNovaConversa(false)}
        onIniciarConversa={handleNovaConversaCriada}
        unidadeId={unidadeId}
      />

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="flex items-start gap-3 px-4 py-3 bg-slate-800 border border-violet-500/30 rounded-xl shadow-2xl cursor-pointer hover:bg-slate-700/80 transition animate-in slide-in-from-right-4 fade-in duration-300"
            >
              <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageCircle className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{toast.alunoNome}</p>
                <p className="text-xs text-slate-400 truncate">{toast.preview}</p>
              </div>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
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
