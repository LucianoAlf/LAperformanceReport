import { useState } from 'react'
import { RotateCw, Copy, Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  falhas: number
  onReenviarFalhas: () => Promise<void>
  onCopiarNumeros: () => Promise<number>
  onExportarCSV: () => void
}

export function BulkActionBar({ falhas, onReenviarFalhas, onCopiarNumeros, onExportarCSV }: Props) {
  const [reenviando, setReenviando] = useState(false)

  async function handleReenviar() {
    setReenviando(true)
    try { await onReenviarFalhas() } finally { setReenviando(false) }
  }

  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-4 py-3 flex items-center gap-2">
      <button
        onClick={handleReenviar}
        disabled={falhas === 0 || reenviando}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          falhas > 0
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
            : 'bg-slate-800 text-gray-600 border border-slate-700 cursor-not-allowed',
        )}
      >
        {reenviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
        Reenviar {falhas > 0 ? `(${falhas})` : 'Falhas'}
      </button>

      <button
        onClick={onCopiarNumeros}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors"
      >
        <Copy className="w-3.5 h-3.5" />
        Copiar Números
      </button>

      <button
        onClick={onExportarCSV}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white border border-slate-700 hover:border-slate-600 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Exportar
      </button>
    </div>
  )
}
