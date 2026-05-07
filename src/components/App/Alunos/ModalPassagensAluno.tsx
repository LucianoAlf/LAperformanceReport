import { useState } from 'react';
import { X, History, Ban, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RegistroLTV } from '@/hooks/useHistoricoLTV';

interface Props {
  nome: string;
  passagens: RegistroLTV[];
  userName: string;
  onClose: () => void;
  onAnular: (historicoId: number, motivo: string, anuladoPor: string) => Promise<boolean>;
  onReverter: (historicoId: number) => Promise<boolean>;
}

function formatarData(data: string | null): string {
  if (!data) return '—';
  return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatarTempo(meses: number): string {
  if (meses < 12) return `${Math.round(meses * 10) / 10}m`;
  const anos = Math.floor(meses / 12);
  const resto = Math.round(meses - anos * 12);
  return resto === 0 ? `${anos}a` : `${anos}a ${resto}m`;
}

export function ModalPassagensAluno({ nome, passagens, userName, onClose, onAnular, onReverter }: Props) {
  const [confirmandoAnulacao, setConfirmandoAnulacao] = useState<RegistroLTV | null>(null);
  const [motivoAnulacao, setMotivoAnulacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const passagensOrdenadas = [...passagens].sort((a, b) => {
    const dataA = a.data_saida || a.mes_saida || '';
    const dataB = b.data_saida || b.mes_saida || '';
    return dataB.localeCompare(dataA);
  });

  async function confirmarAnulacao() {
    if (!confirmandoAnulacao || !confirmandoAnulacao.historico_id) return;
    if (motivoAnulacao.trim().length < 3) return;

    setSalvando(true);
    const ok = await onAnular(confirmandoAnulacao.historico_id, motivoAnulacao.trim(), userName);
    setSalvando(false);

    if (ok) {
      setConfirmandoAnulacao(null);
      setMotivoAnulacao('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-violet-500/20 border border-violet-500/50">
              <History className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Passagens de {nome}</h2>
              <p className="text-xs text-slate-400">
                {passagens.length} {passagens.length === 1 ? 'passagem registrada' : 'passagens registradas'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista de passagens */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          {passagensOrdenadas.map((p, idx) => {
            const numeroPassagem = passagensOrdenadas.length - idx;
            const isPendente = p.fonte === 'sistema';
            const isAnulada = p.anulado;

            return (
              <div
                key={p.passagem_id}
                className={`p-4 rounded-lg border transition ${
                  isAnulada
                    ? 'bg-slate-900/30 border-slate-800 opacity-60'
                    : 'bg-slate-900/50 border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        isAnulada
                          ? 'bg-slate-700 text-slate-400 line-through'
                          : numeroPassagem === 1 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-violet-500/20 text-violet-300'
                      }`}>
                        {numeroPassagem}ª passagem
                      </span>
                      {isPendente && !isAnulada && (
                        <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                          aguardando consolidação
                        </span>
                      )}
                      {isAnulada && (
                        <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
                          anulada
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {p.fonte === 'historico' ? 'sistema' : 'em alunos'}
                      </span>
                    </div>

                    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${isAnulada ? 'line-through' : ''}`}>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Entrada</p>
                        <p className="text-sm text-white">
                          {p.data_entrada ? formatarData(p.data_entrada) : (p.mes_saida || '—')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Saída</p>
                        <p className="text-sm text-white">
                          {p.data_saida ? formatarData(p.data_saida) : (p.mes_saida || '—')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Tempo</p>
                        <p className="text-sm text-white font-semibold">{formatarTempo(p.tempo_permanencia_meses)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Categoria</p>
                        <p className="text-sm text-white">{p.categoria_saida}</p>
                      </div>
                    </div>

                    {(p.motivo_saida || p.aluno_ids.length > 1) && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                        {p.motivo_saida && (
                          <p className="text-xs text-slate-400">
                            <span className="text-slate-500">Motivo:</span> {p.motivo_saida}
                          </p>
                        )}
                        {p.aluno_ids.length > 1 && (
                          <p className="text-xs text-slate-400">
                            <span className="text-slate-500">Matrículas:</span> {p.aluno_ids.length} cursos paralelos
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {isPendente ? (
                      <span className="text-xs text-slate-500 italic">—</span>
                    ) : isAnulada ? (
                      p.historico_id && (
                        <button
                          onClick={() => onReverter(p.historico_id!)}
                          className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition"
                          title="Reverter anulação"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reverter
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => setConfirmandoAnulacao(p)}
                        className="flex items-center gap-1 text-xs px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded transition"
                        title="Anular passagem (soft delete)"
                      >
                        <Ban className="w-3 h-3" />
                        Anular
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-900/30 text-xs text-slate-500">
          <span>Anular preserva auditoria. Para deletar de vez, use o botão da tabela principal.</span>
          <Button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Fechar
          </Button>
        </div>

        {/* Sub-modal: confirmar anulação */}
        {confirmandoAnulacao && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 border border-red-500/30 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="p-4 border-b border-slate-700 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-500/20 border border-red-500/50">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-base font-bold text-white">Anular passagem</h3>
              </div>

              <div className="p-4 space-y-3">
                <p className="text-sm text-slate-300">
                  Esta passagem será marcada como anulada e somerá da tabela. Os dados ficam preservados no banco — você pode reverter depois.
                </p>

                <div>
                  <label className="text-xs text-slate-400 uppercase mb-1 block">Motivo da anulação *</label>
                  <textarea
                    value={motivoAnulacao}
                    onChange={(e) => setMotivoAnulacao(e.target.value)}
                    placeholder="Ex: cancelamento equivocado pela coordenação, rematriculou em < 7 dias"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 min-h-[80px] resize-y"
                    autoFocus
                  />
                  <p className="text-xs text-slate-500 mt-1">Mínimo 3 caracteres.</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-900/30">
                <Button
                  onClick={() => {
                    setConfirmandoAnulacao(null);
                    setMotivoAnulacao('');
                  }}
                  disabled={salvando}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={confirmarAnulacao}
                  disabled={salvando || motivoAnulacao.trim().length < 3}
                  className="px-6 py-2 text-white rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvando ? 'Anulando...' : 'Confirmar anulação'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
