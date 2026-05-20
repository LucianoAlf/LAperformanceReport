// src/components/App/Automacoes/LinhaEvento.tsx
import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Code2 } from 'lucide-react';
import type { LogAutomacao, Invariante } from '@/hooks/useAutomacoesData';
import { ModalPayloadBruto } from './ModalPayloadBruto';

type Props = {
  log: LogAutomacao;
  onMarcarVistas?: (invariante_ids: number[]) => void;
};

const ICONS = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  erro: <AlertCircle className="w-4 h-4 text-rose-400" />,
};

const COR_LINHA = {
  ok: 'border-l-emerald-500/40',
  warn: 'border-l-amber-500/60',
  erro: 'border-l-rose-500/60',
};

export function LinhaEvento({ log, onMarcarVistas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const naoVistas = (log.invariantes ?? []).filter(i => i.visto_em === null);
  const data = new Date(log.created_at);
  const dataFmt = data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className={`bg-slate-900/60 border border-slate-800 border-l-4 ${COR_LINHA[log.status]} rounded-lg p-4`}>
      <div className="flex items-center gap-3">
        {ICONS[log.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">{dataFmt}</span>
            <span className="text-white font-medium">{log.evento}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-300">{log.aluno_nome}</span>
            {log.unidade_nome && (
              <>
                <span className="text-gray-500">·</span>
                <span className="text-gray-400 text-xs">{log.unidade_nome}</span>
              </>
            )}
          </div>
          {(log.invariantes?.length ?? 0) > 0 && (
            <button
              onClick={() => setAberto(v => !v)}
              className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
            >
              {aberto ? 'Ocultar' : 'Ver'} {log.invariantes!.length} problema(s)
            </button>
          )}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="text-gray-400 hover:text-white p-1"
          title="Ver payload"
        >
          <Code2 className="w-4 h-4" />
        </button>
        {naoVistas.length > 0 && onMarcarVistas && (
          <button
            onClick={() => onMarcarVistas(naoVistas.map(i => i.id))}
            className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded"
          >
            Marcar visto
          </button>
        )}
      </div>

      {aberto && (log.invariantes?.length ?? 0) > 0 && (
        <div className="mt-3 ml-7 space-y-2">
          {log.invariantes!.map((inv: Invariante) => (
            <div key={inv.id} className="flex items-start gap-2 text-xs">
              <span className={
                inv.severidade === 'critico'
                  ? 'text-rose-400 font-medium'
                  : 'text-amber-400 font-medium'
              }>
                [{inv.severidade}]
              </span>
              <code className="text-gray-300">{inv.regra}</code>
              <span className="text-gray-500">·</span>
              <span className="text-gray-400">{inv.mensagem}</span>
              {inv.visto_em && (
                <span className="text-emerald-500 text-[10px]">✓ vista</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ModalPayloadBruto
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        payload={log.payload_bruto ?? log.detalhes}
        titulo={`${log.evento} · ${log.aluno_nome} · ${dataFmt}`}
      />
    </div>
  );
}
