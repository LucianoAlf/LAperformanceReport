import { ArrowRightLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface AlunoTransferencia {
  id: number;
  nome: string;
  data_matricula: string | null;
  unidade_id: string;
  valor_parcela: number | string | null;
  agente_comercial: string | null;
  cursos?: { nome?: string | null } | null;
  professores?: { nome?: string | null } | null;
  unidades?: { codigo?: string | null } | null;
  transferencia?: {
    data_transferencia?: string | null;
    unidade_origem_nome?: string | null;
    unidade_origem_codigo?: string | null;
    unidade_destino_nome?: string | null;
    unidade_destino_codigo?: string | null;
    observacao?: string | null;
  } | null;
}

interface TabelaTransferenciasProps {
  data: AlunoTransferencia[];
}

export function TabelaTransferencias({ data }: TabelaTransferenciasProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;

  const labelUnidade = (nome?: string | null, codigo?: string | null, fallback?: string) => {
    if (nome) return nome;
    if (codigo) return codigo;
    return fallback || '-';
  };

  return (
    <div className="p-4 overflow-x-auto">
      {data.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">#</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Data</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Aluno</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Movimento</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Curso</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30">Professor</th>
              <th className="pb-3 px-2 font-medium border-r border-slate-700/30 text-right">Parcela</th>
              <th className="pb-3 px-2 font-medium">Regra</th>
            </tr>
          </thead>
          <tbody>
            {data.map((aluno, index) => (
              <tr
                key={aluno.id}
                className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors"
              >
                <td className="py-3 px-2 text-slate-500 font-medium border-r border-slate-700/30">{index + 1}</td>
                <td className="py-3 px-2 text-slate-300 border-r border-slate-700/30">
                  {aluno.data_matricula
                    ? new Date(`${aluno.data_matricula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                    : '-'}
                </td>
                <td className="py-3 px-2 border-r border-slate-700/30">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-sky-400" />
                    <span className="text-white font-medium">{aluno.nome}</span>
                  </div>
                </td>
                <td className="py-3 px-2 border-r border-slate-700/30">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700/60 text-slate-300">
                        {labelUnidade(
                          aluno.transferencia?.unidade_origem_nome,
                          aluno.transferencia?.unidade_origem_codigo,
                          'Origem nao informada',
                        )}
                      </span>
                      <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        aluno.unidades?.codigo
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-slate-600/30 text-slate-300',
                      )}>
                        {labelUnidade(
                          aluno.transferencia?.unidade_destino_nome,
                          aluno.transferencia?.unidade_destino_codigo || aluno.unidades?.codigo,
                          'Destino nao informado',
                        )}
                      </span>
                    </div>
                    {aluno.transferencia?.observacao && (
                      <span className="max-w-xs truncate text-xs text-slate-500">
                        {aluno.transferencia.observacao}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-2 text-slate-300 border-r border-slate-700/30">
                  {aluno.cursos?.nome || '-'}
                </td>
                <td className="py-3 px-2 text-slate-300 border-r border-slate-700/30">
                  {aluno.professores?.nome || '-'}
                </td>
                <td className="py-3 px-2 text-right text-emerald-400 font-medium border-r border-slate-700/30">
                  {aluno.valor_parcela
                    ? `R$ ${Number(aluno.valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '-'}
                </td>
                <td className="py-3 px-2">
                  <span className="inline-flex rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300">
                    transferencia interna
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600">
              <td colSpan={8} className="py-3 px-2 text-slate-400 font-medium">
                Total: {data.length} transferencia{data.length !== 1 ? 's' : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div className="py-8 text-center text-slate-500">
          Nenhuma transferencia registrada nesta competencia
        </div>
      )}
    </div>
  );
}
