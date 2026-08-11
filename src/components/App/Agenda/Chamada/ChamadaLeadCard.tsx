import { AlertTriangle, Check, Phone, User, X } from 'lucide-react';
import type { LeadExperimentalAgenda } from '@/hooks/useAgendaDia';
import { cn } from '@/lib/utils';

interface Props {
  lead: LeadExperimentalAgenda;
  podeOperar: boolean;
  salvando: boolean;
  onMarcar: (experimentalId: number, status: 'experimental_realizada' | 'experimental_faltou') => void;
  onAbrirDrawer?: () => void;
}

/**
 * Card de lead experimental na chamada. Visualmente diferente do aluno
 * matriculado: borda violeta tracejada + badge "Experimental" para ninguém
 * confundir lead com aluno.
 *
 * Campos faltantes (curso de interesse, telefone) aparecem como badge
 * amarelo — o comercial precisa completar antes de fechar a venda.
 */
export function ChamadaLeadCard({ lead, podeOperar, salvando, onMarcar, onAbrirDrawer }: Props) {
  const presente = lead.status === 'experimental_realizada';
  const faltou = lead.status === 'experimental_faltou';
  const semDestino = !presente && !faltou;

  // Campos faltantes que o comercial precisa completar
  const camposFaltantes: string[] = [];
  if (!lead.curso_interesse_id) camposFaltantes.push('curso');
  if (!lead.telefone) camposFaltantes.push('telefone');
  if (!lead.canal_origem_id) camposFaltantes.push('canal');
  if (!lead.faixa_etaria) camposFaltantes.push('faixa etária');
  if (!lead.professor_experimental_id) camposFaltantes.push('professor');

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 transition-colors',
        presente
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : faltou
            ? 'border-rose-500/40 bg-rose-500/5'
            : 'border-dashed border-violet-500/50 bg-violet-500/5',
      )}
    >
      {/* Badge Experimental + nome (clicavel para abrir drawer) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">
            <User className="h-2.5 w-2.5" />
            Lead
          </span>
          {onAbrirDrawer ? (
            <button
              type="button"
              onClick={onAbrirDrawer}
              className="truncate text-sm font-semibold text-white hover:text-violet-300"
            >
              {lead.nome}
            </button>
          ) : (
            <p className="truncate text-sm font-semibold text-white">{lead.nome}</p>
          )}
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-bold',
            presente ? 'text-emerald-400' : faltou ? 'text-rose-400' : 'text-slate-500',
          )}
        >
          {presente ? 'Presente' : faltou ? 'Falta' : 'Aguardando'}
        </span>
      </div>

      {/* Info do lead */}
      <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-500">
        {lead.curso && <p>Curso: {lead.curso}</p>}
        {lead.canal && <p>Canal: {lead.canal}</p>}
        {lead.observacoes && <p className="truncate italic">"{lead.observacoes}"</p>}
      </div>

      {/* Badge de campos faltantes — o comercial precisa completar */}
      {camposFaltantes.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Falta: {camposFaltantes.join(', ')}
        </div>
      )}

      {/* Botões de chamada — só Presente/Falta (experimental não tem justificativa) */}
      {podeOperar && (
        <div className="mt-3 flex gap-1.5" role="group" aria-label={`Destino de ${lead.nome}`}>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onMarcar(lead.experimental_id, 'experimental_realizada')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all hover:-translate-y-px disabled:opacity-50',
              presente
                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]'
                : 'border-slate-700 text-slate-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400',
            )}
          >
            <Check className="h-4 w-4" />
            Presente
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={() => onMarcar(lead.experimental_id, 'experimental_faltou')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all hover:-translate-y-px disabled:opacity-50',
              faltou
                ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.3)]'
                : 'border-slate-700 text-slate-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400',
            )}
          >
            <X className="h-4 w-4" />
            Falta
          </button>
        </div>
      )}

      {/* Telefone do lead */}
      {lead.telefone && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
          <Phone className="h-3 w-3" />
          {lead.telefone}
        </p>
      )}
    </div>
  );
}
