// src/components/App/Automacoes/ModalPayloadBruto.tsx
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  payload: unknown;
  titulo: string;
  onClose: () => void;
};

export function ModalPayloadBruto({ open, payload, titulo, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h3 className="text-white font-semibold">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <pre className="overflow-auto p-6 text-xs text-gray-300 whitespace-pre-wrap break-words">
          {payload === null || payload === undefined
            ? '(vazio)'
            : JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
