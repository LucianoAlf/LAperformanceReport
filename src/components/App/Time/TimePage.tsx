import { useState, useMemo } from 'react';
import { Users, ChevronRight, Search } from 'lucide-react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { useColaboradores } from '@/hooks/useColaboradores';
import { useAuth } from '@/contexts/AuthContext';
import {
  formatarCodinome,
  formatarValorizacao,
  corDoPerfil,
  PERFIL_NOMES,
} from '@/data/perfilTextos';
import type { Colaborador } from './types';
import { FichaColaborador } from './FichaColaborador';

type UnidadeId = string | 'todos';

export function TimePage() {
  useSetPageTitle({
    titulo: 'Time',
    subtitulo: 'Quem é quem — perfis, reconhecimento e Rider',
    icone: Users,
    iconeCor: 'text-cyan-400',
    iconeWrapperCor: 'bg-cyan-500/20',
  });

  const context = useOutletContext<{
    unidadeSelecionada: UnidadeId;
  }>();
  const unidadeHeader = context?.unidadeSelecionada || 'todos';

  const { isAdmin } = useAuth();

  // Filtros locais
  const [unidadeFiltro, setUnidadeFiltro] = useState<UnidadeId>('todos');
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string | 'todos'>('todos');
  const [apenasRespondidos, setApenasRespondidos] = useState(false);
  const [busca, setBusca] = useState('');
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<number | null>(null);

  const { colaboradores, unidades, departamentos, isLoading } = useColaboradores(
    unidadeFiltro,
    departamentoFiltro,
    apenasRespondidos,
  );

  // Filtro por busca textual
  const colaboradoresFiltrados = useMemo(() => {
    if (!busca.trim()) return colaboradores;
    const q = busca.toLowerCase().trim();
    return colaboradores.filter((c) => {
      const nome = (c.apelido || c.nome || '').toLowerCase();
      return nome.includes(q);
    });
  }, [colaboradores, busca]);

  // Se uma ficha está selecionada, mostra a tela de ficha
  if (colaboradorSelecionado !== null) {
    return (
      <FichaColaborador
        colaboradorId={colaboradorSelecionado}
        onVoltar={() => setColaboradorSelecionado(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filtro de unidade */}
        {isAdmin && (
          <div className="bg-slate-800 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setUnidadeFiltro('todos')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                unidadeFiltro === 'todos'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Todas
            </button>
            {unidades.map((u) => (
              <button
                key={u.id}
                onClick={() => setUnidadeFiltro(u.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  unidadeFiltro === u.id
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {u.nome}
              </button>
            ))}
          </div>
        )}

        {/* Filtro de departamento — opções dinâmicas do banco */}
        {departamentos.length > 0 && (
          <div className="bg-slate-800 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setDepartamentoFiltro('todos')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                departamentoFiltro === 'todos'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              Todos
            </button>
            {departamentos.map((d) => (
              <button
                key={d}
                onClick={() => setDepartamentoFiltro(d)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  departamentoFiltro === d
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        {/* Toggle "só quem respondeu" */}
        <button
          onClick={() => setApenasRespondidos(!apenasRespondidos)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            apenasRespondidos
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
              : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          {apenasRespondidos ? '✓ Só quem respondeu' : 'Só quem respondeu'}
        </button>

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : colaboradoresFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Users className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-400">
            {apenasRespondidos
              ? 'Ninguém respondeu ainda com esses filtros.'
              : 'Nenhum colaborador encontrado.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colaboradoresFiltrados.map((c) => (
            <ColaboradorCard
              key={c.id}
              colaborador={c}
              onClick={() => setColaboradorSelecionado(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CARD DA LISTA
// ---------------------------------------------------------------------------
function ColaboradorCard({
  colaborador: c,
  onClick,
}: {
  colaborador: Colaborador;
  onClick: () => void;
}) {
  const cor = corDoPerfil(c.temperamento_codinome);
  const perfilFormatado = formatarCodinome(c.temperamento_codinome);
  const valorizacaoFormatada = formatarValorizacao(c.valorizacao_codinome);
  const temPerfil = !!perfilFormatado;
  const nome = c.apelido || c.nome;
  const isCandidato = c.situacao === 'candidato';

  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60 transition-all text-left"
    >
      {/* Foto / Iniciais */}
      <div
        className="w-14 h-14 rounded-xl flex-none overflow-hidden flex items-center justify-center font-bold text-lg"
        style={
          cor
            ? { background: `${cor}22`, color: cor, boxShadow: `0 0 0 2px ${cor}55` }
            : { background: '#16233a', color: '#5c7093' }
        }
      >
        {c.foto_url ? (
          <img src={c.foto_url} alt={nome} className="w-full h-full object-cover" />
        ) : (
          nome?.charAt(0).toUpperCase() || '?'
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate">{nome}</span>
          {isCandidato && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
              Candidato
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {c.unidade_nome || 'Sem unidade'}
          {c.cargo ? ` · ${c.cargo}` : ''}
        </p>

        {/* Selos */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {temPerfil ? (
            <>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                style={
                  cor
                    ? {
                        borderColor: `${cor}55`,
                        color: cor,
                        background: `${cor}12`,
                      }
                    : undefined
                }
              >
                {perfilFormatado}
              </span>
              {valorizacaoFormatada && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-slate-700 text-slate-400 bg-slate-800/50">
                  {valorizacaoFormatada}
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-slate-700/50 text-slate-500 bg-slate-800/30">
              Ficha pendente
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 flex-none transition-colors" />
    </button>
  );
}
