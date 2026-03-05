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
};

const origemLabels: Record<string, string> = {
  emusys: 'Emusys',
  nocodb: 'NocoDB',
  // Valores antigos
  lead_criado: 'Lead Criado',
  lead_editado: 'Lead Editado',
  lead_arquivado: 'Lead Arquivado',
  aula_experimental_criada: 'Experimental Criada',
  aula_experimental_reagendada: 'Experimental Reagendada',
  aula_experimental_cancelada: 'Experimental Cancelada',
};

const origemStyles: Record<string, { bg: string; text: string }> = {
  emusys: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  nocodb: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
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

  useEffect(() => {
    carregarRegistros();
  }, [filtroOrigem, filtroAcao, filtroPeriodo, filtroIncompleto, unidadeAtual]);

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
        // Mapear para incluir valores antigos
        const acaoMap: Record<string, string[]> = {
          inserted: ['inserted', 'lead_inserido'],
          updated: ['updated', 'lead_atualizado'],
          archived: ['archived', 'lead_arquivado'],
        };
        const valores = acaoMap[filtroAcao];
        if (valores) {
          query = query.in('acao', valores);
        }
      }

      if (filtroIncompleto === 'sem_telefone') {
        query = query.eq('detalhes->sem_telefone', true);
      } else if (filtroIncompleto === 'sem_nome') {
        query = query.eq('detalhes->sem_nome', true);
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

      const { data } = await query;
      if (data) setRegistros(data);
    } catch (error) {
      console.error('Erro ao carregar log de automacao de leads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtro local por busca de nome
  const registrosFiltrados = busca.trim()
    ? registros.filter(r => r.lead_nome?.toLowerCase().includes(busca.toLowerCase()))
    : registros;

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
    return alertas;
  };

  const totalPorAcao = registrosFiltrados.reduce((acc, r) => {
    acc[r.acao] = (acc[r.acao] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Contadores resumidos */}
      {registrosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                placeholder="Buscar por nome..."
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
              </SelectContent>
            </Select>
            <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-[160px] bg-slate-900 border-slate-600">
                <SelectValue placeholder="Acao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas acoes</SelectItem>
                <SelectItem value="inserted">Criado</SelectItem>
                <SelectItem value="updated">Atualizado</SelectItem>
                <SelectItem value="archived">Arquivado</SelectItem>
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

        <div className="p-4">
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
            <div className="space-y-2">
              {registrosFiltrados.map((registro) => {
                const style = acaoStyles[registro.acao] || acaoStyles.updated;
                const detalhesStr = formatarDetalhes(registro);
                const alertas = getAlertas(registro);
                const origemStyle = origemStyles[registro.evento];

                return (
                  <div
                    key={registro.id}
                    className="flex items-start gap-4 p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/80 transition-colors"
                  >
                    <div className="min-w-[130px] text-sm text-slate-400">
                      {formatarData(registro.created_at)}
                    </div>
                    <div className="min-w-[110px] flex flex-col gap-1">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded text-xs font-medium w-fit',
                        style.bg,
                        style.text
                      )}>
                        {style.label}
                      </span>
                      {origemStyle && (
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded text-xs font-medium w-fit',
                          origemStyle.bg,
                          origemStyle.text
                        )}>
                          {origemLabels[registro.evento] || registro.evento}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{registro.lead_nome || '(sem nome)'}</span>
                        {registro.unidade_nome && (
                          <span className="text-slate-500 text-sm">({registro.unidade_nome})</span>
                        )}
                        {alertas.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-xs cursor-help"
                            title={alertas.join(', ')}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {alertas.join(', ')}
                          </span>
                        )}
                      </div>
                      {detalhesStr && (
                        <p className="text-slate-400 text-sm mt-0.5 truncate">{detalhesStr}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!origemStyle && (
                        <span className="text-slate-600 text-xs">
                          {origemLabels[registro.evento] || registro.evento}
                        </span>
                      )}
                      {registro.execution_id && (
                        <span
                          className="text-slate-600 text-xs font-mono cursor-help"
                          title={`Execucao N8N #${registro.execution_id}`}
                        >
                          #{registro.execution_id}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
