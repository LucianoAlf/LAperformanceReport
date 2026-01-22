import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface TabelaTrancamentosProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
}

export function TabelaTrancamentos({ data, onEdit, onDelete }: TabelaTrancamentosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-800/50">
          <tr className="text-xs text-slate-400 uppercase tracking-wider">
            <th className="py-3 px-4 text-left">#</th>
            <th className="py-3 px-4 text-left">Data</th>
            <th className="py-3 px-4 text-left">Aluno</th>
            <th className="py-3 px-4 text-left">Escola</th>
            <th className="py-3 px-4 text-left">Professor</th>
            <th className="py-3 px-4 text-left">Previsão Retorno</th>
            <th className="py-3 px-4 text-left">Motivo</th>
            <th className="py-3 px-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-slate-500">
                Nenhum trancamento registrado neste período 🎉
              </td>
            </tr>
          ) : (
            data.map((item, index) => {
              const previsaoFormatada = item.previsao_retorno 
                ? new Date(item.previsao_retorno).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
                : null;

              return (
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
                  <td className="py-3 px-4 text-slate-300">{item.professor_nome || '-'}</td>
                  <td className="py-3 px-4">
                    {previsaoFormatada ? (
                      <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium">
                        {previsaoFormatada}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-sm">Não informado</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-sm max-w-xs truncate" title={item.motivo || ''}>
                    {item.motivo || '-'}
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
                        onClick={() => item.id && onDelete(item.id)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {data.length > 0 && (
          <tfoot className="bg-slate-800/50">
            <tr className="border-t border-slate-600">
              <td colSpan={8} className="py-3 px-4 text-slate-400 font-medium">
                Total: {data.length} trancamento{data.length !== 1 ? 's' : ''}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
