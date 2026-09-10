import { useState } from 'react';
import { Pencil, Trash2, Info, AlertTriangle } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { TabelaAvisosVencidos } from './TabelaAvisosVencidos';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface TabelaAvisosPreviosProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
  startDate: string;
  endDate: string;
  /** null = todas as unidades. Só a aba "Vencidos" usa: ela consulta o banco. */
  unidadeId?: string | null;
  /** Repassado à aba "Vencidos", que recarrega por conta própria. */
  versaoDados?: number;
}

type FiltroAviso = 'todos' | 'registrados' | 'saida' | 'vencidos';

export function TabelaAvisosPrevios({ data, onEdit, onDelete, startDate, endDate, unidadeId = null, versaoDados = 0 }: TabelaAvisosPreviosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const [filtro, setFiltro] = useState<FiltroAviso>('todos');

  // Registrados no mês: data (criação do aviso) dentro do período
  const registradosNoMes = data.filter(item => item.data >= startDate && item.data <= endDate);
  // Saída no mês: mes_saida dentro do período
  const saidaNoMes = data.filter(item => item.mes_saida && item.mes_saida >= startDate && item.mes_saida <= endDate);

  const dadosFiltrados = filtro === 'registrados'
    ? registradosNoMes
    : filtro === 'saida'
      ? saidaNoMes
      : data;

  const perdaPotencial = dadosFiltrados.reduce((acc, item) => acc + (item.valor_parcela_novo || item.valor_parcela_anterior || 0), 0);

  // "Vencidos" fica FORA desta lista de propósito: as três acima refiltram o
  // array do mês, e ela consulta o banco por conta própria — por isso não tem
  // contagem aqui (ninguém sabe o número antes de perguntar) e é renderizada
  // por outro componente.
  const filtros: { id: FiltroAviso; label: string; count: number }[] = [
    { id: 'todos', label: 'Todos', count: data.length },
    { id: 'registrados', label: 'Registrados no mês', count: registradosNoMes.length },
    { id: 'saida', label: 'Saída no mês', count: saidaNoMes.length },
  ];

  return (
    <div className="overflow-x-auto">
      {/* Filtro */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-800/30 border-b border-slate-700/30">
        {filtros.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filtro === f.id
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {f.label} <span className="opacity-60">({f.count})</span>
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-slate-700" aria-hidden />

        <button
          onClick={() => setFiltro('vencidos')}
          title="Avisos já vencidos e não resolvidos, de qualquer mês"
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
            filtro === 'vencidos'
              ? 'bg-amber-600/80 text-white'
              : 'text-amber-400/80 hover:text-amber-300 hover:bg-slate-700/50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Vencidos
        </button>
      </div>

      {/* Consulta própria, fora do período da tela — ver TabelaAvisosVencidos. */}
      {filtro === 'vencidos' && (
        <TabelaAvisosVencidos unidadeId={unidadeId} onEditar={onEdit} versaoDados={versaoDados} />
      )}

      {filtro !== 'vencidos' && (
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr className="text-xs text-slate-400 uppercase tracking-wider">
            <th className="py-3 px-4 text-left">#</th>
            <th className="py-3 px-4 text-left">Data Aviso</th>
            <th className="py-3 px-4 text-left">Aluno</th>
            <th className="py-3 px-4 text-left">Escola</th>
            <th className="py-3 px-4 text-right">Parcela</th>
            <th className="py-3 px-4 text-left">Professor</th>
            <th className="py-3 px-4 text-left">Mês Saída</th>
            <th className="py-3 px-4 text-left">Motivo</th>
            <th className="py-3 px-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {dadosFiltrados.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                {filtro === 'registrados'
                  ? 'Nenhum aviso prévio registrado neste mês'
                  : filtro === 'saida'
                    ? 'Nenhum aviso prévio com saída prevista neste mês'
                    : 'Nenhum aviso prévio neste período'}
              </td>
            </tr>
          ) : (
            dadosFiltrados.map((item, index) => (
              <tr key={item.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                <td className="py-3 px-4 text-slate-500">{index + 1}</td>
                <td className="py-3 px-4 text-slate-300">
                  {new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </td>
                <td className="py-3 px-4 text-white font-medium">{item.aluno_nome}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      item.unidade_id === 'emla'
                        ? 'bg-violet-500/20 text-violet-400'
                        : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {item.unidade_id === 'emla' ? 'EMLA' : 'LAMK'}
                    </span>
                    {isAdmin && item.unidades?.codigo && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                        {item.unidades.codigo}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-orange-400 font-medium">
                  R$ {(item.valor_parcela_novo || item.valor_parcela_anterior || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-slate-300">{item.professor_nome || '-'}</td>
                <td className="py-3 px-4">
                  {item.mes_saida ? (
                    <Tooltip content={new Date(item.mes_saida + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} side="top">
                      <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-xs font-medium cursor-help">
                        {new Date(item.mes_saida + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-400 text-xs font-medium">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-sm max-w-xs truncate">
                      {item.motivo || '-'}
                    </span>
                    {item.observacoes && (
                      <Tooltip content={item.observacoes} side="top">
                        <Info className="w-4 h-4 text-blue-400 cursor-help flex-shrink-0" />
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(item)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(item.id)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
        {dadosFiltrados.length > 0 && (
          <tfoot className="bg-slate-800/50">
            <tr className="border-t border-slate-600">
              <td colSpan={3} className="py-3 px-4 text-slate-400 font-medium">
                Total: {dadosFiltrados.length} avisos prévios
              </td>
              <td className="py-3 px-4 text-right text-orange-400 font-bold">
                R$ {perdaPotencial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
              <td colSpan={4} className="py-3 px-4 text-slate-400">Perda potencial/mês</td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </div>
  );
}
