import { X } from 'lucide-react';

interface ModalTreinamentoProps {
  isOpen: boolean;
  onClose: () => void;
  treinamentoSlug: string;
}

export function ModalTreinamento({ isOpen, onClose, treinamentoSlug }: ModalTreinamentoProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full h-full bg-slate-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>
        
        <iframe
          src={`/treinamentos/${treinamentoSlug}.html`}
          className="w-full h-full border-0"
          title="Treinamento"
        />
      </div>
    </div>
  );
}
