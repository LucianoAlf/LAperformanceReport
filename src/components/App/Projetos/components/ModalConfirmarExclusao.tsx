import { useState } from 'react';
import { X, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../../ui/button';
import { useDeleteProjeto } from '../../../../hooks/useProjetos';
import type { Projeto } from '../../../../types/projetos';

interface ModalConfirmarExclusaoProps {
  isOpen: boolean;
  projeto: Projeto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ModalConfirmarExclusao({ isOpen, projeto, onClose, onSuccess }: ModalConfirmarExclusaoProps) {
  const { deleteProjeto, loading: excluindo } = useDeleteProjeto();
  const [confirmacao, setConfirmacao] = useState('');

  const handleExcluir = async () => {
    if (!projeto || confirmacao !== 'EXCLUIR') {
      return;
    }

    try {
      await deleteProjeto(projeto.id);
      setConfirmacao('');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erro ao excluir projeto:', error);
    }
  };

  if (!isOpen || !projeto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-rose-500/10">
          <h2 className="text-xl font-semibold text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Excluir Projeto
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
              <Trash2 className="w-8 h-8 text-rose-400" />
            </div>
            <p className="text-white text-lg font-medium mb-2">
              Tem certeza que deseja excluir?
            </p>
            <p className="text-slate-400 text-sm">
              O projeto <strong className="text-white">"{projeto.nome}"</strong> será excluído permanentemente, 
              incluindo todas as suas fases, tarefas e membros da equipe.
            </p>
          </div>

          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
            <p className="text-rose-300 text-sm mb-3">
              ⚠️ Esta ação não pode ser desfeita. Digite <strong>EXCLUIR</strong> para confirmar:
            </p>
            <input
              type="text"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
              placeholder="Digite EXCLUIR"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition-colors text-center font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/50">
          <Button
            variant="outline"
            onClick={() => {
              setConfirmacao('');
              onClose();
            }}
            disabled={excluindo}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExcluir}
            disabled={confirmacao !== 'EXCLUIR' || excluindo}
            className="bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
          >
            {excluindo ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Projeto
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ModalConfirmarExclusao;
