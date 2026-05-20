// src/components/App/Automacoes/TabJornadas.tsx
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Filtros, LogAutomacao } from '@/hooks/useAutomacoesData';
import { useAutomacoesData } from '@/hooks/useAutomacoesData';
import { LinhaEvento } from './LinhaEvento';

type Props = { filtros: Filtros };

type Jornada = {
  chave: string;
  rotulo: string;
  unidade?: string;
  logs: LogAutomacao[];
  criticos: number;
  avisos: number;
};

export function TabJornadas({ filtros }: Props) {
  const { logs, loading, erro, marcarVistas } = useAutomacoesData(filtros);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const jornadas: Jornada[] = useMemo(() => {
    const mapa = new Map<string, Jornada>();
    for (const log of logs) {
      const chave = log.aluno_id
        ? `aluno:${log.aluno_id}`
        : log.lead_id
          ? `lead:${log.lead_id}`
          : `nome:${log.aluno_nome.toLowerCase()}`;
      let j = mapa.get(chave);
      if (!j) {
        j = { chave, rotulo: log.aluno_nome, unidade: log.unidade_nome ?? undefined, logs: [], criticos: 0, avisos: 0 };
        mapa.set(chave, j);
      }
      j.logs.push(log);
      for (const inv of log.invariantes ?? []) {
        if (inv.severidade === 'critico') j.criticos++;
        else j.avisos++;
      }
    }
    return [...mapa.values()].sort((a, b) => {
      if (b.criticos !== a.criticos) return b.criticos - a.criticos;
      const ta = new Date(a.logs[0]?.created_at ?? 0).getTime();
      const tb = new Date(b.logs[0]?.created_at ?? 0).getTime();
      return tb - ta;
    });
  }, [logs]);

  if (erro) return <div className="text-rose-400 p-4">Erro: {erro}</div>;
  if (loading) return <div className="text-gray-400 p-4">Carregando...</div>;
  if (jornadas.length === 0) return <div className="text-gray-500 p-4">Nenhuma jornada nos critérios.</div>;

  return (
    <div className="space-y-3">
      {jornadas.map(j => {
        const aberto = expanded[j.chave] ?? false;
        const Chevron = aberto ? ChevronDown : ChevronRight;
        return (
          <div key={j.chave} className="bg-slate-900/60 border border-slate-800 rounded-lg">
            <button
              onClick={() => setExpanded(e => ({ ...e, [j.chave]: !aberto }))}
              className="w-full flex items-center gap-3 p-4 hover:bg-slate-800/30 transition-colors text-left"
            >
              <Chevron className="w-5 h-5 text-gray-400" />
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium">{j.rotulo}</div>
                {j.unidade && <div className="text-xs text-gray-500">{j.unidade}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {j.logs.length} evento(s)
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {j.criticos > 0 && <span className="text-rose-400 font-medium">{j.criticos} crítico(s)</span>}
                {j.avisos > 0 && <span className="text-amber-400 font-medium">{j.avisos} aviso(s)</span>}
              </div>
            </button>

            {aberto && (
              <div className="px-4 pb-4 pt-1 space-y-2">
                {j.logs.map(log => (
                  <LinhaEvento key={log.id} log={log} onMarcarVistas={marcarVistas} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
