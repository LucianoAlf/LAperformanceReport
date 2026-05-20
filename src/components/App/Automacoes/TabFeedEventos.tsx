// src/components/App/Automacoes/TabFeedEventos.tsx
import type { Filtros, LogAutomacao } from '@/hooks/useAutomacoesData';
import { useAutomacoesData } from '@/hooks/useAutomacoesData';
import { LinhaEvento } from './LinhaEvento';

type Props = { filtros: Filtros };

export function TabFeedEventos({ filtros }: Props) {
  const { logs, loading, erro, marcarVistas } = useAutomacoesData(filtros);

  if (erro) return <div className="text-rose-400 p-4">Erro: {erro}</div>;
  if (loading) return <div className="text-gray-400 p-4">Carregando...</div>;
  if (logs.length === 0) return <div className="text-gray-500 p-4">Nenhum evento nos critérios.</div>;

  return (
    <div className="space-y-2">
      {logs.map((log: LogAutomacao) => (
        <LinhaEvento key={log.id} log={log} onMarcarVistas={marcarVistas} />
      ))}
    </div>
  );
}
