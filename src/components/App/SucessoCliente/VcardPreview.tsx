import { User, Phone } from 'lucide-react';

interface Props {
  fullName: string;
  telefones: string[];
  organizacao?: string | null;
}

// Simula o cartão de contato como o WhatsApp exibe ao receber um vCard.
export function VcardPreview({ fullName, telefones, organizacao }: Props) {
  const tels = telefones.filter(Boolean);
  return (
    <div className="bg-[#0b141a] rounded-2xl p-4 border border-slate-700/50 max-w-sm">
      <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">Pré-visualização (WhatsApp)</p>
      <div className="bg-[#202c33] rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-slate-300" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-medium truncate">{fullName || 'Nome do contato'}</p>
            {organizacao ? <p className="text-slate-400 text-xs truncate">{organizacao}</p> : null}
          </div>
        </div>
        {tels.length > 0 && (
          <div className="border-t border-slate-700/60 px-3 py-2 space-y-1">
            {tels.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 border-t border-slate-700/60">
          <span className="text-center py-2 text-emerald-400 text-sm font-medium">Conversar</span>
          <span className="text-center py-2 text-emerald-400 text-sm font-medium border-l border-slate-700/60">Adicionar</span>
        </div>
      </div>
    </div>
  );
}
