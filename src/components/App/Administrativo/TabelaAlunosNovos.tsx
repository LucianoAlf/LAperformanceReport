import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AlunoNovo {
  id: number;
  nome: string;
  data_matricula: string;
  unidade_id: string;
  valor_parcela: number | null;
  is_segundo_curso: boolean;
  tipo_matricula_id: number | null;
  agente_comercial: string | null;
  cursos?: { nome: string } | null;
  professores?: { nome: string } | null;
  tipos_matricula?: { codigo: string; conta_como_pagante: boolean } | null;
  formas_pagamento?: { nome: string; sigla: string } | null;
  unidades?: { codigo: string } | null;
}

interface TabelaAlunosNovosProps {
  data: AlunoNovo[];
}

type Filtro = 'todos' | 'pagantes' | 'segundo_curso' | 'bolsistas';

function isBolsistaOuBanda(a: AlunoNovo) {
  return a.tipo_matricula_id != null && [3, 4, 5].includes(a.tipo_matricula_id) && !a.is_segundo_curso;
}

function isPagante(a: AlunoNovo) {
  return !a.is_segundo_curso && !isBolsistaOuBanda(a);
}

function getTipoBadge(aluno: AlunoNovo) {
  if (aluno.is_segundo_curso) {
    return { label: '2º Curso', className: 'bg-violet-500/20 text-violet-400' };
  }
  const codigo = aluno.tipos_matricula?.codigo;
  if (codigo === 'BOLSISTA_INT') {
    return { label: 'Bolsista Int.', className: 'bg-amber-500/20 text-amber-400' };
  }
  if (codigo === 'BOLSISTA_PARC') {
    return { label: 'Bolsista Parc.', className: 'bg-amber-500/20 text-amber-400' };
  }
  if (codigo === 'BANDA') {
    return { label: 'Banda', className: 'bg-cyan-500/20 text-cyan-400' };
  }
  return { label: 'Pagante', className: 'bg-emerald-500/20 text-emerald-400' };
}

export function TabelaAlunosNovos({ data }: TabelaAlunosNovosProps) {
  const { usuario } = useAuth();
  const isAdmin = usuario?.perfil === 'admin' && usuario?.unidade_id === null;
  const [filtro, setFiltro] = useState<Filtro>('pagantes');

  // Contagens por categoria
  const countPagantes = data.filter(isPagante).length;
  const countSegundoCurso = data.filter(a => a.is_segundo_curso).length;
  const countBolsistas = data.filter(isBolsistaOuBanda).length;

  // Filtrar dados
  const dadosFiltrados = filtro === 'todos' ? data
    : filtro === 'pagantes' ? data.filter(isPagante)
    : filtro === 'segundo_curso' ? data.filter(a => a.is_segundo_curso)
    : data.filter(isBolsistaOuBanda);

  // Ticket médio dos dados filtrados (apenas pagantes com valor)
  const pagantesComValor = dadosFiltrados.filter(a => a.valor_parcela && Number(a.valor_parcela) > 0);
  const ticketMedio = pagantesComValor.length > 0
    ? pagantesComValor.reduce((sum, a) => sum + (Number(a.valor_parcela) || 0), 0) / pagantesComValor.length
    : 0;

  const filtros: { id: Filtro; label: string; count: number; color: string }[] = [
    { id: 'todos', label: 'Todos', count: data.length, color: 'from-slate-500 to-slate-600' },
    { id: 'pagantes', label: 'Novos Pagantes', count: countPagantes, color: 'from-emerald-500 to-teal-500' },
    { id: 'segundo_curso', label: '2º Curso', count: countSegundoCurso, color: 'from-violet-500 to-purple-500' },
    { id: 'bolsistas', label: 'Bolsistas/Banda', count: countBolsistas, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div>
      {/* Sub-filtros */}
      <div className="flex gap-2 p-4 pb-0">
        {filtros.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filtro === f.id
                ? `bg-gradient-to-r ${f.color} text-white shadow-lg`
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr className="text-xs text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4 text-left">#</th>
              <th className="py-3 px-4 text-left">Data</th>
              <th className="py-3 px-4 text-left">Aluno</th>
              <th className="py-3 px-4 text-left">Escola</th>
              <th className="py-3 px-4 text-left">Curso</th>
              <th className="py-3 px-4 text-left">Professor</th>
              <th className="py-3 px-4 text-right">Valor</th>
              <th className="py-3 px-4 text-center">Tipo</th>
              <th className="py-3 px-4 text-left">Agente</th>
            </tr>
          </thead>
          <tbody>
            {dadosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Nenhum aluno encontrado nesta categoria
                </td>
              </tr>
            ) : (
              dadosFiltrados.map((aluno, index) => {
                const badge = getTipoBadge(aluno);
                return (
                  <tr key={aluno.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-slate-500">{index + 1}</td>
                    <td className="py-3 px-4 text-slate-300">
                      {aluno.data_matricula
                        ? new Date(aluno.data_matricula + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-white font-medium">{aluno.nome}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          aluno.unidade_id === 'emla'
                            ? 'bg-violet-500/20 text-violet-400'
                            : 'bg-cyan-500/20 text-cyan-400'
                        }`}>
                          {aluno.unidade_id === 'emla' ? 'EMLA' : 'LAMK'}
                        </span>
                        {isAdmin && aluno.unidades?.codigo && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-slate-600/30 text-slate-300">
                            {aluno.unidades.codigo}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{aluno.cursos?.nome || '-'}</td>
                    <td className="py-3 px-4 text-slate-300">{aluno.professores?.nome || '-'}</td>
                    <td className="py-3 px-4 text-right text-emerald-400 font-medium">
                      {aluno.valor_parcela
                        ? `R$ ${Number(aluno.valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{aluno.agente_comercial || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {dadosFiltrados.length > 0 && (
            <tfoot className="bg-slate-800/50">
              <tr className="border-t border-slate-600">
                <td colSpan={6} className="py-3 px-4 text-right text-slate-400 font-medium">
                  Total: {dadosFiltrados.length} alunos
                </td>
                <td className="py-3 px-4 text-right text-emerald-400 font-bold">
                  {ticketMedio > 0
                    ? `R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : '-'}
                </td>
                <td colSpan={2} className="py-3 px-4 text-slate-400">ticket médio</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
