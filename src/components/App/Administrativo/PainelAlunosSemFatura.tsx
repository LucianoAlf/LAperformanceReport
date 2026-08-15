import React, { useMemo, useState } from 'react';
import {
  useAlunosSemFatura,
  competenciasDisponiveis,
  rotuloCompetencia,
  type AlunoSemFatura,
} from '@/hooks/useAlunosSemFatura';
import {
  SortableHeader,
  alternarOrdenacao,
  compararParaOrdenacao,
  type SortConfig,
} from '@/components/ui/SortableHeader';

/**
 * "Alunos com aula mas sem fatura por mês" — espelha a tela homônima do Emusys,
 * inclusive as três abas de competência.
 *
 * Painel separado da tabela de contratos vencendo de propósito: a pergunta é outra
 * (não "quando vence", e sim "teve aula e não foi cobrado"), a fonte é outra
 * (`vw_alunos_sem_fatura_mes`) e as colunas são outras. Espremer os dois na mesma
 * tabela só produziria condicionais.
 */

function formatarDataISO(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const VALOR_ORDENACAO: Record<string, (a: AlunoSemFatura) => string | number | null> = {
  aluno: (a) => a.aluno_nome,
  curso: (a) => a.curso_nome,
  primeira_aula: (a) => a.data_primeira_aula,
  ultima_aula: (a) => a.data_ultima_aula,
  parcelas: (a) => a.nr_faturas,
  valor: (a) => a.valor_parcela,
  situacao: (a) => a.status_matricula,
};

export function PainelAlunosSemFatura({ unidadeId }: { unidadeId: string }) {
  const competencias = useMemo(() => competenciasDisponiveis(), []);
  // Abre no mês corrente, que é o do meio das três — mesmo padrão da tela do Emusys.
  const [competencia, setCompetencia] = useState(competencias[1]);
  const [busca, setBusca] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const { alunos, loading, erro, ultimoSync } = useAlunosSemFatura({ unidadeId, competencia });

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? alunos.filter((a) => (a.aluno_nome ?? '').toLowerCase().includes(termo))
    : alunos;

  const visiveis = useMemo(() => {
    if (!sortConfig) return filtrados;
    const extrair = VALOR_ORDENACAO[sortConfig.key];
    if (!extrair) return filtrados;
    return [...filtrados].sort((a, b) =>
      compararParaOrdenacao(extrair(a), extrair(b), sortConfig.direction),
    );
  }, [filtrados, sortConfig]);

  const ordenarPor = (key: string) => setSortConfig((atual) => alternarOrdenacao(atual, key));

  // Contrato de 1 parcela com o ano inteiro de aula costuma ser pagamento à vista, não
  // cobrança parada. Avisar antes que alguém saia cobrando quem já pagou.
  const possiveisAVista = visiveis.filter((a) => (a.nr_faturas ?? 0) === 1).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* As 3 abas de competência do Emusys (mês anterior | atual | seguinte). */}
        <div className="flex rounded-xl border border-slate-700/50 bg-slate-800/50 p-1">
          {competencias.map((c) => (
            <button
              key={c}
              onClick={() => setCompetencia(c)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium uppercase transition-colors ${
                competencia === c
                  ? 'bg-cyan-500 text-white'
                  : 'text-gray-300 hover:bg-slate-700/50'
              }`}
            >
              {rotuloCompetencia(c)}
            </button>
          ))}
        </div>
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
            Dados do Emusys sincronizados em{' '}
            {new Date(ultimoSync).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {!loading && visiveis.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-gray-300">
          <b className="font-semibold text-gray-100">Tem aula em {rotuloCompetencia(competencia)} e não tem mensalidade emitida.</b>{' '}
          Conta apenas mensalidade — taxa de matrícula e cobrança avulsa não valem. Inclui quem já
          saiu (evadiu devendo é o caso que mais interessa cobrar) e exclui trancados e atividades
          extras, igual à tela do Emusys.
          {possiveisAVista > 0 && (
            <>
              {' '}⚠️ {possiveisAVista}{' '}
              {possiveisAVista === 1 ? 'contrato tem 1 parcela só' : 'contratos têm 1 parcela só'} —
              pode ser pagamento à vista, confira antes de cobrar.
            </>
          )}
        </div>
      )}

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
            : `Nenhum aluno com aula em ${rotuloCompetencia(competencia)} sem mensalidade emitida.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50 text-gray-300">
              <tr>
                <SortableHeader label="Aluno" sortKey="aluno" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Curso" sortKey="curso" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="1ª aula" sortKey="primeira_aula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Última aula" sortKey="ultima_aula" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
                <SortableHeader label="Parcelas" sortKey="parcelas" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Valor" sortKey="valor" sortConfig={sortConfig} onSort={ordenarPor} className="text-right" />
                <SortableHeader label="Situação" sortKey="situacao" sortConfig={sortConfig} onSort={ordenarPor} className="text-left" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((a) => (
                <tr
                  key={`${a.unidade_id}-${a.emusys_matricula_disciplina_id}`}
                  className="border-t border-slate-700/40 text-gray-200"
                >
                  <td className="px-4 py-3">
                    {a.aluno_nome}
                    {unidadeId === 'todos' && (
                      <span className="ml-2 text-xs text-gray-400">{a.unidade_nome}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{a.curso_nome ?? '—'}</td>
                  <td className="px-4 py-3">{formatarDataISO(a.data_primeira_aula)}</td>
                  <td className="px-4 py-3">{formatarDataISO(a.data_ultima_aula)}</td>
                  <td
                    className="px-4 py-3 text-right tabular-nums"
                    title={(a.nr_faturas ?? 0) === 1 ? 'Uma parcela só: pode ser pagamento à vista' : undefined}
                  >
                    {a.nr_faturas ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{formatarMoeda(a.valor_parcela)}</td>
                  <td className="px-4 py-3">
                    {/* "finalizada" aqui não é ruído: é aluno que teve aula no mês e saiu
                        sem a mensalidade emitida — o caso mais urgente da lista. */}
                    {a.status_matricula === 'finalizada' ? (
                      <span className="rounded-lg bg-rose-500/15 px-2 py-1 text-xs text-rose-300">
                        Já saiu
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Ativa</span>
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

export default PainelAlunosSemFatura;
