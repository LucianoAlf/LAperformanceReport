// src/components/App/Automacoes/AutomacoesPage.tsx
import { useState } from 'react';
import { Activity, GitBranch, List, Search, Clock, AlertTriangle } from 'lucide-react';
import type { Filtros } from '@/hooks/useAutomacoesData';
import { defaultFiltros } from '@/hooks/useAutomacoesData';
import { TabJornadas } from './TabJornadas';
import { TabFeedEventos } from './TabFeedEventos';
import { TabSaudeCrons } from './TabSaudeCrons';
import { TabDivergencias } from './TabDivergencias';
import { BotaoRodarAuditoria } from './BotaoRodarAuditoria';

type Aba = 'jornadas' | 'feed' | 'crons' | 'divergencias';

const PRESETS_PERIODO: Array<{ label: string; dias: number }> = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
];

export function AutomacoesPage() {
  const [aba, setAba] = useState<Aba>('jornadas');
  const [filtros, setFiltros] = useState<Filtros>(defaultFiltros());
  const [refreshKey, setRefreshKey] = useState(0);

  function aplicarPreset(dias: number) {
    const fim = new Date();
    const ini = new Date();
    if (dias === 0) {
      ini.setHours(0, 0, 0, 0);
    } else {
      ini.setDate(ini.getDate() - dias);
    }
    setFiltros(f => ({ ...f, dataInicio: ini, dataFim: fim }));
  }

  function setStatus(s: Filtros['status']) {
    setFiltros(f => ({ ...f, status: s }));
  }

  function setBusca(busca: string) {
    setFiltros(f => ({ ...f, busca }));
  }

  function toggleNaoVistos() {
    setFiltros(f => ({ ...f, apenasNaoVistos: !f.apenasNaoVistos }));
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" key={refreshKey}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            Saúde das Automações
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Monitoramento de webhooks Emusys (lead, experimental, matrícula)
          </p>
        </div>
        <BotaoRodarAuditoria onConcluido={() => setRefreshKey(k => k + 1)} />
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS_PERIODO.map(p => (
            <button
              key={p.label}
              onClick={() => aplicarPreset(p.dias)}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-md"
            >
              {p.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-2 bg-slate-800 rounded-md px-3 py-1.5 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={filtros.busca}
              onChange={e => setBusca(e.target.value)}
              className="bg-transparent text-sm text-gray-200 placeholder:text-gray-500 outline-none flex-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Status:</span>
          {(['ok', 'warn', 'erro'] as const).map(s => {
            const ativo = filtros.status.includes(s);
            return (
              <button
                key={s}
                onClick={() => setStatus(ativo
                  ? filtros.status.filter(x => x !== s)
                  : [...filtros.status, s])}
                className={`px-3 py-1 text-xs rounded-full border ${
                  ativo
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'text-gray-400 border-slate-700 hover:border-slate-600'
                }`}
              >
                {s}
              </button>
            );
          })}
          <label className="flex items-center gap-2 ml-4 cursor-pointer">
            <input
              type="checkbox"
              checked={filtros.apenasNaoVistos}
              onChange={toggleNaoVistos}
              className="accent-cyan-500"
            />
            <span className="text-xs text-gray-300">Apenas não vistas (críticas)</span>
          </label>
        </div>
      </div>

      <div className="flex items-center border-b border-slate-800 mb-4">
        <button
          onClick={() => setAba('jornadas')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'jornadas'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <GitBranch className="w-4 h-4" /> Jornadas
        </button>
        <button
          onClick={() => setAba('feed')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'feed'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <List className="w-4 h-4" /> Feed de eventos
        </button>
        <button
          onClick={() => setAba('crons')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'crons'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" /> Crons
        </button>
        <button
          onClick={() => setAba('divergencias')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'divergencias'
              ? 'text-cyan-400 border-cyan-400'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Divergências
        </button>
      </div>

      {aba === 'jornadas' && <TabJornadas filtros={filtros} />}
      {aba === 'feed' && <TabFeedEventos filtros={filtros} />}
      {aba === 'crons' && <TabSaudeCrons />}
      {aba === 'divergencias' && <TabDivergencias />}
    </div>
  );
}
