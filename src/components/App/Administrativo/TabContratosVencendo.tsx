import React, { useState } from 'react';
import { useContratosVencendo, type JanelaDias } from '@/hooks/useContratosVencendo';

const JANELAS: JanelaDias[] = [30, 60, 90];

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function TabContratosVencendo({ unidadeId }: { unidadeId: string }) {
  const [janelaDias, setJanelaDias] = useState<JanelaDias>(30);
  const [busca, setBusca] = useState('');

  const { contratos, loading, erro, ultimoSync } = useContratosVencendo({ unidadeId, janelaDias });

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? contratos.filter((c) => (c.aluno_nome ?? '').toLowerCase().includes(termo))
    : contratos;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {JANELAS.map((dias) => (
          <button
            key={dias}
            onClick={() => setJanelaDias(dias)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              janelaDias === dias
                ? 'bg-cyan-500 text-white'
                : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            {dias} dias
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno…"
          className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500"
        />
        {ultimoSync && (
          <span className="ml-auto text-xs text-gray-400">
            Dados do Emusys sincronizados em {formatarData(ultimoSync)}
          </span>
        )}
      </div>

      {erro && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Erro ao carregar: {erro}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="text-gray-400">
          {termo
            ? `Nenhum aluno encontrado para "${busca}".`
            : `Nenhuma matrícula com contrato acabando nos próximos ${janelaDias} dias.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left">Aluno</th>
                <th className="px-4 py-3 text-left">Curso</th>
                <th className="px-4 py-3 text-left">Professor</th>
                <th className="px-4 py-3 text-left">Matrícula</th>
                <th className="px-4 py-3 text-left">Última aula</th>
                <th className="px-4 py-3 text-left">Venc. últ. fatura</th>
                <th className="px-4 py-3 text-right">Aulas restantes</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr
                  key={`${c.unidade_id}-${c.emusys_matricula_disciplina_id}`}
                  className="border-t border-slate-700/40 text-gray-200"
                >
                  <td className="px-4 py-3">
                    {c.aluno_nome ?? <span className="text-gray-500">— (sem cadastro local)</span>}
                    {unidadeId === 'todos' && (
                      <span className="ml-2 text-xs text-gray-400">{c.unidade_nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.curso_nome ?? '—'}</td>
                  <td className="px-4 py-3">{c.professor_nome ?? '—'}</td>
                  <td className="px-4 py-3">{formatarData(c.data_matricula)}</td>
                  <td className="px-4 py-3">{formatarData(c.data_ultima_aula)}</td>
                  <td className="px-4 py-3">{formatarData(c.venc_ultima_fatura)}</td>
                  <td className="px-4 py-3 text-right">{c.nr_aulas_futuras ?? '—'}</td>
                  <td
                    className="px-4 py-3 text-right"
                    title="Valor como está na API do Emusys; pode estar bruto. Confira na Conciliação."
                  >
                    {formatarMoeda(c.valor_parcela)}
                  </td>
                  <td className="px-4 py-3">
                    {c.inadimplente == null ? (
                      <span className="text-gray-500">—</span>
                    ) : c.inadimplente ? (
                      <span className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs text-rose-300">
                        Inadimplente
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Em dia</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TabContratosVencendo;
