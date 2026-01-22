import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MovimentacaoAdmin } from './AdministrativoPage';

interface TabelaTrancamentosProps {
  data: MovimentacaoAdmin[];
  onEdit: (item: MovimentacaoAdmin) => void;
  onDelete: (id: number) => void;
}

export function TabelaTrancamentos({ data, onEdit, onDelete }: TabelaTrancamentosProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <p className="text-lg mb-2">Nenhum trancamento registrado neste período</p>
        <p className="text-sm">🎉 Ótimo! Todos os alunos estão ativos</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left p-3 text-slate-400 font-medium">#</th>
            <th className="text-left p-3 text-slate-400 font-medium">Data</th>
            <th className="text-left p-3 text-slate-400 font-medium">Aluno</th>
            <th className="text-left p-3 text-slate-400 font-medium">Professor</th>
            <th className="text-left p-3 text-slate-400 font-medium">Previsão Retorno</th>
            <th className="text-left p-3 text-slate-400 font-medium">Motivo</th>
            <th className="text-right p-3 text-slate-400 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const dataFormatada = new Date(item.data).toLocaleDateString('pt-BR');
            const previsaoFormatada = item.previsao_retorno 
              ? new Date(item.previsao_retorno).toLocaleDateString('pt-BR')
              : '-';

            return (
              <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                <td className="p-3 text-slate-300">{index + 1}</td>
                <td className="p-3 text-slate-300">{dataFormatada}</td>
                <td className="p-3 text-white font-medium">{item.aluno_nome}</td>
                <td className="p-3 text-slate-300">{item.professor_nome || '-'}</td>
                <td className="p-3 text-slate-300">
                  {item.previsao_retorno ? (
                    <span className="text-amber-400">{previsaoFormatada}</span>
                  ) : (
                    <span className="text-slate-500">Não informado</span>
                  )}
                </td>
                <td className="p-3 text-slate-400 text-sm max-w-xs truncate">
                  {item.motivo || '-'}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(item)}
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => item.id && onDelete(item.id)}
                      className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="p-4 bg-slate-800/30 border-t border-slate-700">
        <p className="text-sm text-slate-400">
          <strong className="text-white">{data.length}</strong> trancamento{data.length !== 1 ? 's' : ''} registrado{data.length !== 1 ? 's' : ''} neste período
        </p>
      </div>
    </div>
  );
}
