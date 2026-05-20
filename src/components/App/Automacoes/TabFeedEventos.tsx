// src/components/App/Automacoes/TabFeedEventos.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Filtros, LogAutomacao } from '@/hooks/useAutomacoesData';
import { useAutomacoesData } from '@/hooks/useAutomacoesData';
import { LinhaEvento } from './LinhaEvento';
import { Paginacao } from './Paginacao';

type Props = { filtros: Filtros };

export function TabFeedEventos({ filtros }: Props) {
  const { logs, loading, erro, marcarVistas } = useAutomacoesData(filtros);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  // Reseta pra página 1 sempre que muda filtro ou dataset
  useEffect(() => { setPagina(1); }, [filtros, logs.length]);

  const { paginados, totalPaginas } = useMemo(() => {
    const tp = Math.max(1, Math.ceil(logs.length / porPagina));
    const p = Math.min(pagina, tp);
    const inicio = (p - 1) * porPagina;
    return {
      paginados: logs.slice(inicio, inicio + porPagina),
      totalPaginas: tp,
    };
  }, [logs, pagina, porPagina]);

  if (erro) return <div className="text-rose-400 p-4">Erro: {erro}</div>;
  if (loading) return <div className="text-gray-400 p-4">Carregando...</div>;
  if (logs.length === 0) return <div className="text-gray-500 p-4">Nenhum evento nos critérios.</div>;

  return (
    <div>
      <div className="space-y-2">
        {paginados.map((log: LogAutomacao) => (
          <LinhaEvento key={log.id} log={log} onMarcarVistas={marcarVistas} />
        ))}
      </div>
      <Paginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        totalItens={logs.length}
        porPagina={porPagina}
        onMudarPagina={setPagina}
        onMudarPorPagina={n => { setPorPagina(n); setPagina(1); }}
      />
    </div>
  );
}
