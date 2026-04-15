import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, Search } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface LeadsAutomacaoLogItem {
  id: number;
  lead_nome: string;
  lead_id: number | null;
  unidade_nome: string | null;
  evento: string;
  acao: string;
  detalhes: Record<string, any> | null;
  workflow_id: string | null;
  execution_id: string | null;
  created_at: string;
}

const acaoStyles: Record<string, { bg: string; text: string; label: string }> = {
  // Novos valores (RPC)
  inserted: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Novo Lead' },
  updated: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualizado' },
  archived: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Arquivado' },
  // Valores antigos (backward compat)
  lead_inserido: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Novo Lead' },
  lead_atualizado: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualizado' },
  lead_arquivado: { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Arquivado' },
  experimental_agendada: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Exp. Agendada' },
  experimental_reagendada: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Exp. Reagendada' },
  experimental_cancelada: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Exp. Cancelada' },
  // Sync experimental presença
  confirmada: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Exp. Confirmada' },
  nao_encontrada: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Não Encontrada' },
  cancelada: { bg: 'bg-rose-500/20', text: 'text-rose-400', label: 'Exp. Cancelada' },
  erro: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Erro' },
};

const origemLabels: Record<string, string> = {
  emusys: 'Emusys',
  nocodb: 'NocoDB',
  manual: 'Manual',
  // Valores antigos
  lead_criado: 'Lead Criado',
  lead_editado: 'Lead Editado',
  lead_arquivado: 'Lead Arquivado',
  aula_experimental_criada: 'Experimental Criada',
  aula_experimental_reagendada: 'Experimental Reagendada',
  aula_experimental_cancelada: 'Experimental Cancelada',
  sync_experimental_presenca: 'Sync Presença',
  matricula_registrada: 'Matrícula',
};

const origemStyles: Record<string, { bg: string; text: string }> = {
  emusys: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  nocodb: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  manual: { bg: 'bg-slate-500/20', text: 'text-slate-300' },
  sync_experimental_presenca: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  matricula_registrada: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  aula_experimental_criada: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  aula_experimental_reagendada: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  aula_experimental_cancelada: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
};

const fluxoMap: Record<string, { label: string; bg: string; text: string }> = {
  nocodb: { label: 'Sync NocoDB', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  emusys: { label: 'Sync Emusys', bg: 'bg-violet-500/20', text: 'text-violet-400' },
  manual: { label: 'Manual', bg: 'bg-slate-500/20', text: 'text-slate-300' },
  lead_criado: { label: 'N8N Leads', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  lead_editado: { label: 'N8N Leads', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  lead_arquivado: { label: 'N8N Leads', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  aula_experimental_criada: { label: 'N8N Experimental', bg: 'bg-amber-500/20', text: 'text-amber-400' },
  aula_experimental_reagendada: { label: 'N8N Experimental', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  aula_experimental_cancelada: { label: 'N8N Experimental', bg: 'bg-rose-500/20', text: 'text-rose-400' },
  sync_experimental_presenca: { label: 'Sync Presenca', bg: 'bg-teal-500/20', text: 'text-teal-400' },
  matricula_registrada: { label: 'Matricula', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

// Contadores agrupam valores novos e antigos
const contadorAcoes = [
  { keys: ['inserted', 'lead_inserido'], bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Novos' },
  { keys: ['updated', 'lead_atualizado'], bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Atualizados' },
  { keys: ['archived', 'lead_arquivado'], bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Arquivados' },
];

interface TabAutomacaoLeadsProps {
  unidadeAtual: string;
}

export function TabAutomacaoLeads({ unidadeAtual }: TabAutomacaoLeadsProps) {
  const [registros, setRegistros] = useState<LeadsAutomacaoLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos');
  const [filtroAcao, setFiltroAcao] = useState<string>('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('7');
  const [filtroIncompleto, setFiltroIncompleto] = useState<string>('todos');
  const [busca, setBusca] = useState('');

  // Debounce da busca para não disparar query a cada tecla
  const [buscaDebounced, setBuscaDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca.trim()), 400);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    carregarRegistros();
  }, [filtroOrigem, filtroAcao, filtroPeriodo, filtroIncompleto, unidadeAtual, buscaDebounced]);

  const carregarRegistros = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads_automacao_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filtroPeriodo) {
        const dias = parseInt(filtroPeriodo);
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - dias);
        query = query.gte('created_at', dataLimite.toISOString());
      }

      if (filtroOrigem && filtroOrigem !== 'todos') {
        query = query.eq('evento', filtroOrigem);
      }

      if (filtroAcao && filtroAcao !== 'todos') {
        const acaoMap: Record<string, string[]> = {
          inserted: ['inserted', 'lead_inserido'],
          updated: ['updated', 'lead_atualizado'],
          archived: ['archived', 'lead_arquivado'],
        };
        const valores = acaoMap[filtroAcao];
        if (valores) {
          query = query.in('acao', valores);
        } else {
          query = query.eq('acao', filtroAcao);
        }
      }

      if (filtroIncompleto === 'sem_telefone') {
        query = query.eq('detalhes->sem_telefone', true);
      } else if (filtroIncompleto === 'sem_nome') {
        query = query.eq('detalhes->sem_nome', true);
      } else if (filtroIncompleto === 'sem_professor') {
        query = query.eq('detalhes->sem_professor', true);
      }

      if (unidadeAtual && unidadeAtual !== 'todos') {
        const unidadeNomes: Record<string, string> = {
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
          '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
          '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
        };
        const nome = unidadeNomes[unidadeAtual];
        if (nome) {
          query = query.eq('unidade_nome', nome);
        }
      }

      // Busca server-side por nome ou telefone
      if (buscaDebounced) {
        const termo = buscaDebounced;
        const somenteDigitos = termo.replace(/\D/g, '');
        // Se parece telefone (4+ dígitos), buscar no campo detalhes->telefone
        if (somenteDigitos.length >= 4) {
          query = query.or(`lead_nome.ilike.%${termo}%,detalhes->telefone.ilike.%${somenteDigitos}%`);
        } else {
          query = query.ilike('lead_nome', `%${termo}%`);
        }
      }

      const { data } = await query;
      if (data) setRegistros(data);
    } catch (error) {
      console.error('Erro ao carregar log de automacao de leads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Busca agora é server-side — registros já vêm filtrados
  const registrosFiltrados = registros;

  const formatarData = (data: string) => {
    const date = new Date(data);
    const agora = new Date();
    const diffHoras = (agora.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHoras < 24) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    }
    return format(date, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR });
  };

  const formatarDetalhes = (item: LeadsAutomacaoLogItem): string => {
    const detalhes = item.detalhes || {};
    const partes: string[] = [];

    // Sync experimental presença — mostrar motivo e data
    if (item.evento === 'sync_experimental_presenca') {
      if (detalhes.data) partes.push(detalhes.data);
      if (detalhes.motivo) partes.push(detalhes.motivo);
      return partes.join(' · ');
    }

    if (detalhes.professor) partes.push(`Prof. ${detalhes.professor}`);
    if (detalhes.data && detalhes.horario) partes.push(`${detalhes.data} ${detalhes.horario}`);
    if (detalhes.telefone) partes.push(detalhes.telefone);
    if (detalhes.canal) partes.push(detalhes.canal);
    if (detalhes.curso) partes.push(detalhes.curso);

    return partes.length > 0 ? partes.join(' · ') : '';
  };

  const getAlertas = (item: LeadsAutomacaoLogItem): string[] => {
    const detalhes = item.detalhes || {};
    const alertas: string[] = [];
    if (detalhes.sem_nome) alertas.push('Sem nome');
    if (detalhes.sem_telefone) alertas.push('Sem telefone');
    if (detalhes.sem_professor) alertas.push('Sem professor');
    return alertas;
  };

  const totalPorAcao = registrosFiltrados.reduce((acc, r) => {
    acc[r.acao] = (acc[r.acao] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalSemProfessor = registrosFiltrados.filter(r => r.detalhes?.sem_professor === true).length;

  return (
    <div className="space-y-6">
      {/* Contadores resumidos */}
      {registrosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {contadorAcoes.map((grupo) => {
            const total = grupo.keys.reduce((sum, key) => sum + (totalPorAcao[key] || 0), 0);
            return (
              <div
                key={grupo.label}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border',
                  grupo.bg,
                  'border-slate-700/50'
                )}
              >
                <span className={cn('text-2xl font-bold', grupo.text)}>
                  {total}
                </span>
                <span className="text-slate-400 text-sm">{grupo.label}</span>
              </div>
            );
          })}
          {totalSemProfessor > 0 && (
            <button
              onClick={() => setFiltroIncompleto(filtroIncompleto === 'sem_professor' ? 'todos' : 'sem_professor')}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors',
                filtroIncompleto === 'sem_professor'
                  ? 'bg-orange-500/30 border-orange-500/50'
                  : 'bg-orange-500/20 border-slate-700/50 hover:border-orange-500/30',
              )}
            >
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <span className="text-2xl font-bold text-orange-400">{totalSemProfessor}</span>
              <span className="text-slate-400 text-sm">Sem Professor</span>
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="p-4 border-b border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">⚡</span>
              <h2 className="text-lg font-semibold text-white">Log da Automacao de Leads</h2>
              <span className="text-sm text-slate-400">
                {registrosFiltrados.length} registro{registrosFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar nome ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-[200px] pl-9 bg-slate-900 border-slate-600"
              />
            </div>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-[150px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas origens</SelectItem>
                <SelectItem value="emusys">Emusys</SelectItem>
                <SelectItem value="nocodb">NocoDB</SelectItem>
                <SelectItem value="aula_experimental_criada">Exp. Criada</SelectItem>
                <SelectItem value="aula_experimental_reagendada">Exp. Reagendada</SelectItem>
                <SelectItem value="aula_experimental_cancelada">Exp. Cancelada</SelectItem>
                <SelectItem value="sync_experimental_presenca">Sync Presença</SelectItem>
                <SelectItem value="matricula_registrada">Matrícula</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-[160px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Acao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas ações</SelectItem>
                <SelectItem value="inserted">Criado</SelectItem>
                <SelectItem value="updated">Atualizado</SelectItem>
                <SelectItem value="archived">Arquivado</SelectItem>
                <SelectItem value="experimental_agendada">Exp. Agendada</SelectItem>
                <SelectItem value="experimental_reagendada">Exp. Reagendada</SelectItem>
                <SelectItem value="experimental_cancelada">Exp. Cancelada</SelectItem>
                <SelectItem value="confirmada">Exp. Confirmada</SelectItem>
                <SelectItem value="nao_encontrada">Não Encontrada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroIncompleto} onValueChange={setFiltroIncompleto}>
              <SelectTrigger className="w-[170px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Dados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os dados</SelectItem>
                <SelectItem value="sem_telefone">Sem telefone</SelectItem>
                <SelectItem value="sem_nome">Sem nome</SelectItem>
                <SelectItem value="sem_professor">Sem professor</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-[170px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Ultimos 7 dias</SelectItem>
                <SelectItem value="30">Ultimos 30 dias</SelectItem>
                <SelectItem value="90">Ultimos 3 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="text-4xl mb-4 block">⚡</span>
            <p className="text-lg font-medium">Nenhum registro de automacao encontrado</p>
            <p className="text-sm mt-1">Os logs aparecerao aqui quando os workflows do N8N processarem eventos de leads.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr className="text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 text-left">Data</th>
                  <th className="py-3 px-4 text-left">Acao</th>
                  <th className="py-3 px-4 text-left">Origem</th>
                  <th className="py-3 px-4 text-left">Lead</th>
                  <th className="py-3 px-4 text-left">Unidade</th>
                  <th className="py-3 px-4 text-left">Detalhes</th>
                  <th className="py-3 px-4 text-left">Fluxo</th>
                  <th className="py-3 px-4 text-left">Execucao</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.map((registro) => {
                  const style = acaoStyles[registro.acao] || acaoStyles.updated;
                  const detalhesStr = formatarDetalhes(registro);
                  const alertas = getAlertas(registro);
                  const origemStyle = origemStyles[registro.evento];

                  return (
                    <tr
                      key={registro.id}
                      className="border-t border-slate-700/30 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-sm text-slate-400 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatarData(registro.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
                          style.bg,
                          style.text
                        )}>
                          {style.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {origemStyle ? (
                          <span className={cn(
                            'inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
                            origemStyle.bg,
                            origemStyle.text
                          )}>
                            {origemLabels[registro.evento] || registro.evento}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs whitespace-nowrap">
                            {origemLabels[registro.evento] || registro.evento}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium whitespace-nowrap">{registro.lead_nome || '(sem nome)'}</span>
                          {alertas.length > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs whitespace-nowrap"
                              title={alertas.join(', ')}
                            >
                              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                        {registro.unidade_nome || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-sm max-w-[250px] truncate">
                        {detalhesStr || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const fluxo = fluxoMap[registro.evento];
                          return fluxo ? (
                            <span className={cn(
                              'inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
                              fluxo.bg,
                              fluxo.text
                            )}>
                              {fluxo.label}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs whitespace-nowrap">
                              {registro.evento}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        {registro.execution_id ? (
                          <span
                            className="text-slate-600 text-xs font-mono cursor-help"
                            title={`Execucao N8N #${registro.execution_id}`}
                          >
                            #{registro.execution_id}
                          </span>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
