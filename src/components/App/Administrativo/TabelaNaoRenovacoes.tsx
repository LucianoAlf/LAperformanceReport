import { Pencil, Trash2, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface TabelaNaoRenovacoesProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
}

export function TabelaNaoRenovacoes({ data, onEdit, onDelete }: TabelaNaoRenovacoesProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;

  // Calcular MRR perdido total
  const mrrPerdido = data.reduce((acc, item) => acc + (item.valor_parcela_evasao || item.valor_parcela_anterior || 0), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr className="text-xs text-slate-400 uppercase tracking-wider">
            <th className="py-3 px-4 text-left">#</th>
            <th className="py-3 px-4 text-left">Data</th>
            <th className="py-3 px-4 text-left">Aluno</th>
            <th className="py-3 px-4 text-left">Escola</th>
            <th className="py-3 px-4 text-right">Parcela</th>
            <th className="py-3 px-4 text-center">Permanência</th>
            <th className="py-3 px-4 text-left">Professor</th>
            <th className="py-3 px-4 text-left">Motivo</th>
            <th className="py-3 px-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-slate-500">
                Nenhuma não renovação registrada neste período
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr key={item.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                <td className="py-3 px-4 text-slate-500">{index + 1}</td>
                <td className="py-3 px-4 text-slate-300">
                  {new Date(item.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
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
                <td className="py-3 px-4 text-right text-amber-400 font-medium">
                  R$ {(item.valor_parcela_evasao || item.valor_parcela_anterior || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-center">
                  {item.tempo_permanencia_meses ? (
                    <span className="text-slate-300 font-medium">
                      {item.tempo_permanencia_meses} {item.tempo_permanencia_meses === 1 ? 'mês' : 'meses'}
                    </span>
                  ) : (
                    <span className="text-slate-500 text-sm">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-300">{item.professor_nome || '-'}</td>
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
        {data.length > 0 && (
          <tfoot className="bg-slate-800/50">
            <tr className="border-t border-slate-600">
              <td colSpan={4} className="py-3 px-4 text-slate-400 font-medium">
                Total: {data.length} não renovação{data.length !== 1 ? 'ões' : ''}
              </td>
              <td className="py-3 px-4 text-right text-amber-400 font-bold">
                R$ {mrrPerdido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
              <td colSpan={4} className="py-3 px-4 text-slate-400">MRR perdido</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
