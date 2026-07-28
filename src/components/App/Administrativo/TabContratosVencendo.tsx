import React, { useMemo, useState } from 'react';
import { useContratosVencendo, type JanelaDias } from '@/hooks/useContratosVencendo';
import {
  SortableHeader,
  alternarOrdenacao,
  compararParaOrdenacao,
  type SortConfig,
} from '@/components/ui/SortableHeader';

const JANELAS: JanelaDias[] = [30, 60, 90];

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  // Data pura (date, ex: venc_ultima_fatura): "YYYY-MM-DD" sem hora, os 10
  // primeiros chars já são o dia em BRT — não precisa (e não pode) converter
  // fuso, senão vira Date UTC e desloca o dia.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  // timestamptz (ex: data_ultima_aula, ultima_sincronizacao_emusys): o
  // PostgREST serializa em UTC, então os 10 primeiros chars podem ser o dia
  // seguinte em BRT (ex: cron às 02:00 UTC = 23h BRT do dia anterior).
  // Converter pro fuso de negócio antes de extrair a data.
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Valor de cada coluna para efeito de ordenação. Datas usam a string ISO crua
// (YYYY-MM-DD... ordena igual cronologicamente, sem custo de parse); números vêm
// como número para não cair na comparação textual (onde "9" > "10").
const VALOR_ORDENACAO: Record<string, (c: any) => string | number | null> = {
  aluno: (c) => c.aluno_nome,
  curso: (c) => c.curso_nome,
  professor: (c) => c.professor_nome,
  matricula: (c) => c.data_matricula,
  ultima_aula: (c) => c.data_ultima_aula,
  venc_fatura: (c) => c.venc_ultima_fatura,
  aulas_restantes: (c) => c.nr_aulas_futuras,
  valor: (c) => c.valor_parcela,
  situacao: (c) => (c.inadimplente == null ? null : c.inadimplente ? 'Inadimplente' : 'Em dia'),
};

export function TabContratosVencendo({ unidadeId }: { unidadeId: string }) {
  const [janelaDias, setJanelaDias] = useState<JanelaDias>(30);
  const [busca, setBusca] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const { contratos, loading, erro, ultimoSync } = useContratosVencendo({ unidadeId, janelaDias });

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? contratos.filter((c) => (c.aluno_nome ?? '').toLowerCase().includes(termo))
    : contratos;

  // Sem ordenação escolhida, preserva a ordem do hook (vencimento mais próximo primeiro),
  // que é a leitura natural da tela.
  const visiveis = useMemo(() => {
    if (!sortConfig) return filtrados;
    const extrair = VALOR_ORDENACAO[sortConfig.key];
    if (!extrair) return filtrados;
    return [...filtrados].sort((a, b) =>
      compararParaOrdenacao(extrair(a), extrair(b), sortConfig.direction),
    );
  }, [filtrados, sortConfig]);

  const ordenarPor = (key: string) => setSortConfig((atual) => alternarOrdenacao(atual, key));

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
        <span className="rounded-lg bg-slate-800/50 px-2.5 py-1 text-xs font-medium text-cyan-300">
          {visiveis.length} {visiveis.length === 1 ? 'registro encontrado' : 'registros encontrados'}
        </span>
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
                <SortableHeader label="Aluno" sortKey="aluno" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Curso" sortKey="curso" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Professor" sortKey="professor" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Matrícula" sortKey="matricula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Última aula" sortKey="ultima_aula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Venc. últ. fatura" sortKey="venc_fatura" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Aulas restantes" sortKey="aulas_restantes" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Valor" sortKey="valor" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Situação" sortKey="situacao" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
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
