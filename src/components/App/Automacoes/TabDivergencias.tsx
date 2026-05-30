// src/components/App/Automacoes/TabDivergencias.tsx
import { useState } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  GhostIcon,
  UserX,
  UserMinus,
  Calendar,
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useDivergencias } from '@/hooks/useDivergencias';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type CategoriaId =
  | 'orphans_antigas'
  | 'inativo_com_presenca'
  | 'ativo_sem_presenca'
  | 'inativo_sem_data_saida'
  | 'duplicatas_curso';

type Categoria = {
  id: CategoriaId;
  titulo: string;
  descricao: string;
  icon: typeof GhostIcon;
  severidade: 'critico' | 'aviso';
};

const CATEGORIAS: Categoria[] = [
  {
    id: 'inativo_com_presenca',
    titulo: 'Inativos com aulas recentes',
    descricao: 'Aluno marcado como inativo/evadido/trancado mas teve ≥3 aulas em 30 dias — status provavelmente errado',
    icon: UserX,
    severidade: 'critico',
  },
  {
    id: 'duplicatas_curso',
    titulo: 'Duplicatas (mesmo curso)',
    descricao: 'Mesma pessoa+unidade+curso aparece em 2+ linhas em alunos',
    icon: Copy,
    severidade: 'critico',
  },
  {
    id: 'orphans_antigas',
    titulo: 'Órfãs antigas',
    descricao: 'Segundo curso ativo, sem emusys_matricula_id há +30d, e pessoa não tem outra matrícula viva conhecida pelo Emusys',
    icon: GhostIcon,
    severidade: 'aviso',
  },
  {
    id: 'ativo_sem_presenca',
    titulo: 'Ativos sem presença',
    descricao: 'Status ativo, matriculado há +60d, sem nenhuma aula nos últimos 60 dias — possível evasão silenciosa',
    icon: UserMinus,
    severidade: 'aviso',
  },
  {
    id: 'inativo_sem_data_saida',
    titulo: 'Status terminal sem data_saida',
    descricao: 'Status inativo/evadido/trancado com campo data_saida nulo — backfill pendente',
    icon: Calendar,
    severidade: 'aviso',
  },
];

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return d.toLocaleDateString('pt-BR');
}

function fmtRelativo(iso: string | null): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function TabDivergencias() {
  const { dados, loading, erro, refetch } = useDivergencias();
  const [aberto, setAberto] = useState<CategoriaId | null>(null);

  function contar(id: CategoriaId): number {
    const arr = dados[id];
    return Array.isArray(arr) ? arr.length : 0;
  }

  const totalCriticos = CATEGORIAS
    .filter(c => c.severidade === 'critico')
    .reduce((sum, c) => sum + contar(c.id), 0);
  const totalAvisos = CATEGORIAS
    .filter(c => c.severidade === 'aviso')
    .reduce((sum, c) => sum + contar(c.id), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {totalCriticos + totalAvisos} divergências
          </span>
          {totalCriticos > 0 && (
            <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {totalCriticos} crítica{totalCriticos !== 1 ? 's' : ''}
            </span>
          )}
          {totalAvisos > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> {totalAvisos} aviso{totalAvisos !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm">Carregando divergências...</div>
      )}

      {erro && (
        <div className="text-center py-8 text-rose-400 text-sm">
          Erro ao carregar: {erro}
        </div>
      )}

      {!loading && !erro && (
        <div className="space-y-2">
          {CATEGORIAS.map(cat => {
            const qtd = contar(cat.id);
            const Icon = cat.icon;
            const isAberto = aberto === cat.id;
            const corBadge = cat.severidade === 'critico'
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30';
            const corQtd = qtd === 0
              ? 'text-gray-600'
              : cat.severidade === 'critico'
                ? 'text-rose-400'
                : 'text-amber-400';

            return (
              <div
                key={cat.id}
                className={`border rounded-lg overflow-hidden transition-colors ${
                  qtd === 0
                    ? 'border-slate-800 bg-slate-900/20'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <button
                  onClick={() => qtd > 0 && setAberto(isAberto ? null : cat.id)}
                  disabled={qtd === 0}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
                    qtd === 0 ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <div className={`p-2 rounded-md border ${corBadge}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-100">{cat.titulo}</span>
                      <span className={`text-2xl font-bold ${corQtd}`}>{qtd}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{cat.descricao}</p>
                  </div>
                  {qtd > 0 && (
                    isAberto
                      ? <ChevronDown className="w-4 h-4 text-gray-500" />
                      : <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </button>

                {isAberto && qtd > 0 && (
                  <div className="border-t border-slate-800 px-3 py-2 bg-slate-950/40">
                    <TabelaCategoria categoria={cat.id} dados={dados} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-600 mt-1">
        Snapshot ao vivo direto do banco. Atualizado {fmtRelativo(dados.atualizado_em)}.
        Limite de 200 linhas por categoria.
      </p>
    </div>
  );
}

function TabelaCategoria({ categoria, dados }: { categoria: CategoriaId; dados: ReturnType<typeof useDivergencias>['dados'] }) {
  if (categoria === 'orphans_antigas') {
    return (
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1.5 px-2 text-left font-medium">ID</th>
            <th className="py-1.5 px-2 text-left font-medium">Aluno</th>
            <th className="py-1.5 px-2 text-left font-medium">Unidade</th>
            <th className="py-1.5 px-2 text-left font-medium">Curso</th>
            <th className="py-1.5 px-2 text-right font-medium">Dias órfã</th>
          </tr>
        </thead>
        <tbody>
          {dados.orphans_antigas.map(linha => (
            <tr key={linha.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 font-mono text-gray-500">{linha.id}</td>
              <td className="py-1.5 px-2 text-gray-200">{linha.nome}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.unidade ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.curso ?? '—'}</td>
              <td className="py-1.5 px-2 text-right text-amber-300">{linha.dias_sem_id}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (categoria === 'inativo_com_presenca') {
    return (
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1.5 px-2 text-left font-medium">ID</th>
            <th className="py-1.5 px-2 text-left font-medium">Aluno</th>
            <th className="py-1.5 px-2 text-left font-medium">Status</th>
            <th className="py-1.5 px-2 text-left font-medium">Unidade</th>
            <th className="py-1.5 px-2 text-left font-medium">Curso</th>
            <th className="py-1.5 px-2 text-right font-medium">Aulas 30d</th>
            <th className="py-1.5 px-2 text-left font-medium">Última aula</th>
          </tr>
        </thead>
        <tbody>
          {dados.inativo_com_presenca.map(linha => (
            <tr key={linha.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 font-mono text-gray-500">{linha.id}</td>
              <td className="py-1.5 px-2 text-gray-200">{linha.nome}</td>
              <td className="py-1.5 px-2"><span className="text-rose-300">{linha.status}</span></td>
              <td className="py-1.5 px-2 text-gray-400">{linha.unidade ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.curso ?? '—'}</td>
              <td className="py-1.5 px-2 text-right text-rose-300 font-medium">{linha.aulas_30d}</td>
              <td className="py-1.5 px-2 text-gray-400">{fmtData(linha.ultima_aula)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (categoria === 'ativo_sem_presenca') {
    return (
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1.5 px-2 text-left font-medium">ID</th>
            <th className="py-1.5 px-2 text-left font-medium">Aluno</th>
            <th className="py-1.5 px-2 text-left font-medium">Unidade</th>
            <th className="py-1.5 px-2 text-left font-medium">Curso</th>
            <th className="py-1.5 px-2 text-left font-medium">Matrícula</th>
            <th className="py-1.5 px-2 text-left font-medium">Última aula</th>
          </tr>
        </thead>
        <tbody>
          {dados.ativo_sem_presenca.map(linha => (
            <tr key={linha.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 font-mono text-gray-500">{linha.id}</td>
              <td className="py-1.5 px-2 text-gray-200">{linha.nome}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.unidade ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.curso ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{fmtData(linha.data_matricula)}</td>
              <td className="py-1.5 px-2 text-amber-300">{fmtData(linha.ultima_aula)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (categoria === 'inativo_sem_data_saida') {
    return (
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1.5 px-2 text-left font-medium">ID</th>
            <th className="py-1.5 px-2 text-left font-medium">Aluno</th>
            <th className="py-1.5 px-2 text-left font-medium">Status</th>
            <th className="py-1.5 px-2 text-left font-medium">Unidade</th>
            <th className="py-1.5 px-2 text-left font-medium">Curso</th>
            <th className="py-1.5 px-2 text-left font-medium">Última alteração</th>
          </tr>
        </thead>
        <tbody>
          {dados.inativo_sem_data_saida.map(linha => (
            <tr key={linha.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 font-mono text-gray-500">{linha.id}</td>
              <td className="py-1.5 px-2 text-gray-200">{linha.nome}</td>
              <td className="py-1.5 px-2"><span className="text-gray-400">{linha.status}</span></td>
              <td className="py-1.5 px-2 text-gray-400">{linha.unidade ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.curso ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{fmtRelativo(linha.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (categoria === 'duplicatas_curso') {
    return (
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1.5 px-2 text-left font-medium">Aluno</th>
            <th className="py-1.5 px-2 text-left font-medium">Unidade</th>
            <th className="py-1.5 px-2 text-left font-medium">Curso</th>
            <th className="py-1.5 px-2 text-left font-medium">IDs</th>
            <th className="py-1.5 px-2 text-left font-medium">Status</th>
            <th className="py-1.5 px-2 text-right font-medium">Qtd</th>
          </tr>
        </thead>
        <tbody>
          {dados.duplicatas_curso.map((linha, idx) => (
            <tr key={`${linha.nome}-${idx}`} className="border-t border-slate-800/60 hover:bg-slate-800/30">
              <td className="py-1.5 px-2 text-gray-200">{linha.nome}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.unidade ?? '—'}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.curso ?? '—'}</td>
              <td className="py-1.5 px-2 font-mono text-gray-500">{linha.ids.join(', ')}</td>
              <td className="py-1.5 px-2 text-gray-400">{linha.statuses.join(', ')}</td>
              <td className="py-1.5 px-2 text-right text-rose-300 font-medium">{linha.qtd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}
