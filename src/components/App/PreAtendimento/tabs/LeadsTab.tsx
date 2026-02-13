import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Download,
  ChevronLeft,
  ChevronRight,
  Tag,
  MoreHorizontal,
  MessageSquare,
  ArrowUpDown,
  Filter,
  X,
  Eye,
  Calendar,
  ArrowRightLeft,
  Archive,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import type { LeadCRM, PipelineEtapa, CanalOrigem, CursoCRM } from '../types';

interface LeadsTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
  onLeadClick?: (lead: LeadCRM) => void;
  onNovoLead?: () => void;
  onAgendar?: (lead: LeadCRM) => void;
  onMoverEtapa?: (lead: LeadCRM) => void;
  onArquivar?: (lead: LeadCRM) => void;
  canais?: CanalOrigem[];
  cursos?: CursoCRM[];
  refetch?: () => void;
}

const ITENS_POR_PAGINA = 20;

export function LeadsTab({ unidadeId, ano, mes, onLeadClick, onNovoLead, onAgendar, onMoverEtapa, onArquivar, canais: canaisExternos, cursos: cursosExternos, refetch: refetchExterno }: LeadsTabProps) {
  const { leads, etapas, canais: canaisHook, cursos: cursosHook, loading, refetch: refetchHook } = useLeadsCRM({ unidadeId, ano, mes });
  const canaisDisponiveis = canaisExternos || canaisHook;
  const cursosDisponiveis = cursosExternos || cursosHook;
  const refetch = refetchExterno || refetchHook;

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState<string>('todos');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todos');
  const [filtroCanal, setFiltroCanal] = useState<string>('todos');
  const [filtroCurso, setFiltroCurso] = useState<string>('todos');
  const [filtroTemperatura, setFiltroTemperatura] = useState<string>('todos');
  const [filtroKPI, setFiltroKPI] = useState<string>('todos');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Paginação
  const [pagina, setPagina] = useState(1);

  // Seleção em lote
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // Ordenação
  const [ordenacao, setOrdenacao] = useState<{ campo: string; direcao: 'asc' | 'desc' }>({
    campo: 'created_at',
    direcao: 'desc',
  });

  // Edição inline
  const [editandoCurso, setEditandoCurso] = useState<number | null>(null);
  const [editandoCanal, setEditandoCanal] = useState<number | null>(null);
  const [salvandoInline, setSalvandoInline] = useState<number | null>(null);

  // Exclusão
  const [leadParaExcluir, setLeadParaExcluir] = useState<LeadCRM | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Filtrar leads
  const leadsFiltrados = useMemo(() => {
    let resultado = [...leads];

    // Busca por nome/telefone
    if (busca) {
      const termo = busca.toLowerCase();
      resultado = resultado.filter(l => {
        const nome = (l.nome || '').toLowerCase();
        const tel = (l.telefone || '').toLowerCase();
        return nome.includes(termo) || tel.includes(termo);
      });
    }

    // Filtro por etapa
    if (filtroEtapa !== 'todos') {
      resultado = resultado.filter(l => String(l.etapa_pipeline_id) === filtroEtapa);
    }

    // Filtro por unidade
    if (filtroUnidade !== 'todos') {
      resultado = resultado.filter(l => l.unidade_id === filtroUnidade);
    }

    // Filtro por temperatura
    if (filtroTemperatura !== 'todos') {
      resultado = resultado.filter(l => l.temperatura === filtroTemperatura);
    }

    // Filtro por KPIs incompletos
    if (filtroKPI !== 'todos') {
      resultado = resultado.filter(l => {
        switch (filtroKPI) {
          case 'sem_canal': return l.canal_origem_id === null;
          case 'sem_curso': return l.curso_interesse_id === null;
          case 'sem_faixa': return l.faixa_etaria === null;
          case 'sem_preco': return l.sabia_preco === null;
          case 'qualquer': {
            return l.canal_origem_id === null ||
              l.curso_interesse_id === null ||
              l.faixa_etaria === null ||
              l.sabia_preco === null;
          }
          default: return true;
        }
      });
    }

    // Ordenação
    resultado.sort((a, b) => {
      const dir = ordenacao.direcao === 'asc' ? 1 : -1;
      switch (ordenacao.campo) {
        case 'nome': return ((a.nome || '').localeCompare(b.nome || '')) * dir;
        case 'created_at': return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        case 'etapa': return ((a.etapa_pipeline_id || 0) - (b.etapa_pipeline_id || 0)) * dir;
        default: return 0;
      }
    });

    return resultado;
  }, [leads, busca, filtroEtapa, filtroUnidade, filtroTemperatura, filtroKPI, ordenacao]);

  // Paginação
  const totalPaginas = Math.ceil(leadsFiltrados.length / ITENS_POR_PAGINA);
  const leadsNaPagina = leadsFiltrados.slice(
    (pagina - 1) * ITENS_POR_PAGINA,
    pagina * ITENS_POR_PAGINA
  );

  // Toggle seleção
  const toggleSelecionado = (id: number) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const toggleTodos = () => {
    if (selecionados.size === leadsNaPagina.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(leadsNaPagina.map(l => l.id)));
    }
  };

  // Toggle ordenação
  const toggleOrdenacao = (campo: string) => {
    setOrdenacao(prev => ({
      campo,
      direcao: prev.campo === campo && prev.direcao === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Contar tags completas
  const contarTags = (lead: LeadCRM): { completas: number; total: number } => {
    const checks = [
      lead.canal_origem_id !== null,
      lead.curso_interesse_id !== null,
      lead.faixa_etaria !== null,
      lead.sabia_preco !== null,
    ];
    return { completas: checks.filter(Boolean).length, total: 4 };
  };

  // Resetar filtros
  const limparFiltros = () => {
    setBusca('');
    setFiltroEtapa('todos');
    setFiltroUnidade('todos');
    setFiltroCanal('todos');
    setFiltroCurso('todos');
    setFiltroTemperatura('todos');
    setFiltroKPI('todos');
    setPagina(1);
  };

  const temFiltrosAtivos = busca || filtroEtapa !== 'todos' || filtroUnidade !== 'todos' ||
    filtroTemperatura !== 'todos' || filtroKPI !== 'todos';

  // Salvar curso inline
  const salvarCursoInline = async (leadId: number, cursoId: string) => {
    setSalvandoInline(leadId);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ curso_interesse_id: cursoId === 'null' ? null : Number(cursoId) })
        .eq('id', leadId);
      if (error) throw error;
      refetch();
    } catch (err) {
      console.error('Erro ao salvar curso:', err);
    } finally {
      setSalvandoInline(null);
      setEditandoCurso(null);
    }
  };

  // Salvar canal inline
  const salvarCanalInline = async (leadId: number, canalId: string) => {
    setSalvandoInline(leadId);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ canal_origem_id: canalId === 'null' ? null : Number(canalId) })
        .eq('id', leadId);
      if (error) throw error;
      refetch();
    } catch (err) {
      console.error('Erro ao salvar canal:', err);
    } finally {
      setSalvandoInline(null);
      setEditandoCanal(null);
    }
  };

  // Excluir lead
  const handleExcluir = async () => {
    if (!leadParaExcluir) return;
    setExcluindo(true);
    try {
      // Excluir histórico primeiro (FK)
      await supabase.from('crm_lead_historico').delete().eq('lead_id', leadParaExcluir.id);
      // Excluir followups
      await supabase.from('crm_followups').delete().eq('lead_id', leadParaExcluir.id);
      // Excluir lead
      const { error } = await supabase.from('leads').delete().eq('id', leadParaExcluir.id);
      if (error) throw error;
      refetch();
      setLeadParaExcluir(null);
    } catch (err) {
      console.error('Erro ao excluir lead:', err);
    } finally {
      setExcluindo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de filtros principal */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            className="pl-9 bg-slate-800/50 border-slate-700"
          />
        </div>

        <Select value={filtroUnidade} onValueChange={v => { setFiltroUnidade(v); setPagina(1); }}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="2ec861f6-023f-4d7b-9927-3960ad8c2a92">Campo Grande</SelectItem>
            <SelectItem value="95553e96-971b-4590-a6eb-0201d013c14d">Recreio</SelectItem>
            <SelectItem value="368d47f5-2d88-4475-bc14-ba084a9a348e">Barra</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroEtapa} onValueChange={v => { setFiltroEtapa(v); setPagina(1); }}>
          <SelectTrigger className="w-[170px] bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas etapas</SelectItem>
            {etapas.map(e => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.icone} {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroTemperatura} onValueChange={v => { setFiltroTemperatura(v); setPagina(1); }}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700">
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="quente">🔥 Quente</SelectItem>
            <SelectItem value="morno">🌡️ Morno</SelectItem>
            <SelectItem value="frio">❄️ Frio</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "border-slate-700",
            mostrarFiltros ? "text-violet-400 border-violet-500/50" : "text-slate-400"
          )}
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
        >
          <Filter className="w-4 h-4 mr-1" />
          KPIs
        </Button>

        {temFiltrosAtivos && (
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-white" onClick={limparFiltros}>
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-400">
            <Download className="w-4 h-4 mr-1" /> Exportar
          </Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={onNovoLead}>
            <Plus className="w-4 h-4 mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Filtros de KPIs expandidos */}
      {mostrarFiltros && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3 flex-wrap animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-xs text-slate-400 font-medium">🏷️ KPIs incompletos:</span>
          <Select value={filtroKPI} onValueChange={v => { setFiltroKPI(v); setPagina(1); }}>
            <SelectTrigger className="w-[200px] bg-slate-800/50 border-slate-700 h-8 text-xs">
              <SelectValue placeholder="Filtrar por KPI" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="sem_canal">Sem Canal de Origem</SelectItem>
              <SelectItem value="sem_curso">Sem Curso de Interesse</SelectItem>
              <SelectItem value="sem_faixa">Sem Faixa Etária</SelectItem>
              <SelectItem value="sem_preco">Sem "Sabe Preço"</SelectItem>
              <SelectItem value="qualquer">Qualquer KPI faltando</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/50">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={selecionados.size === leadsNaPagina.length && leadsNaPagina.length > 0}
                    onChange={toggleTodos}
                    className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                  />
                </th>
                <th className="text-left p-3 text-slate-400 font-medium cursor-pointer hover:text-white" onClick={() => toggleOrdenacao('nome')}>
                  <span className="flex items-center gap-1">Nome <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-left p-3 text-slate-400 font-medium">Unid</th>
                <th className="text-left p-3 text-slate-400 font-medium cursor-pointer hover:text-white" onClick={() => toggleOrdenacao('etapa')}>
                  <span className="flex items-center gap-1">Etapa <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-left p-3 text-slate-400 font-medium">Curso</th>
                <th className="text-left p-3 text-slate-400 font-medium">Canal</th>
                <th className="text-left p-3 text-slate-400 font-medium cursor-pointer hover:text-white" onClick={() => toggleOrdenacao('created_at')}>
                  <span className="flex items-center gap-1">Últ.Contato <ArrowUpDown className="w-3 h-3" /></span>
                </th>
                <th className="text-center p-3 text-slate-400 font-medium">Tags</th>
                <th className="text-center p-3 text-slate-400 font-medium">Tent.</th>
                <th className="text-center p-3 text-slate-400 font-medium w-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {leadsNaPagina.map(lead => {
                const etapa = etapas.find(e => e.id === lead.etapa_pipeline_id);
                const tags = contarTags(lead);
                const unidadeCodigo = getUnidadeCodigo(lead.unidade_id);
                const cursoNome = (lead.cursos as any)?.nome || '';
                const canalNome = (lead.canais_origem as any)?.nome || '';
                const ultimoContato = formatarData(lead.data_ultimo_contato || lead.created_at);

                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      "border-b border-slate-700/30 hover:bg-slate-800/50 transition-colors cursor-pointer",
                      selecionados.has(lead.id) && "bg-violet-500/10"
                    )}
                    onClick={() => onLeadClick?.(lead)}
                  >
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(lead.id)}
                        onChange={() => toggleSelecionado(lead.id)}
                        className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                      />
                    </td>
                    <td className="p-3">
                      <span className="text-white font-medium text-xs">{lead.nome || 'Sem nome'}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                        {unidadeCodigo}
                      </span>
                    </td>
                    <td className="p-3">
                      {etapa ? (
                        <span
                          className="text-[10px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1"
                          style={{ backgroundColor: `${etapa.cor}20`, color: etapa.cor }}
                        >
                          {etapa.icone} {etapa.nome}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    {/* Curso — edição inline */}
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      {editandoCurso === lead.id ? (
                        <Select
                          defaultValue={lead.curso_interesse_id ? String(lead.curso_interesse_id) : 'null'}
                          onValueChange={v => salvarCursoInline(lead.id, v)}
                          open
                          onOpenChange={open => { if (!open) setEditandoCurso(null); }}
                        >
                          <SelectTrigger className="h-7 text-[10px] bg-slate-800 border-violet-500 w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">Nenhum</SelectItem>
                            {cursosDisponiveis.map(c => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {getCursoEmoji(c.nome)} {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          className="text-xs text-slate-300 truncate max-w-[120px] block hover:text-violet-400 hover:underline transition-colors text-left"
                          onClick={() => setEditandoCurso(lead.id)}
                          title="Clique para editar"
                        >
                          {salvandoInline === lead.id ? (
                            <Loader2 className="w-3 h-3 animate-spin inline" />
                          ) : cursoNome ? (
                            `${getCursoEmoji(cursoNome)} ${cursoNome}`
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </button>
                      )}
                    </td>
                    {/* Canal — edição inline */}
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      {editandoCanal === lead.id ? (
                        <Select
                          defaultValue={lead.canal_origem_id ? String(lead.canal_origem_id) : 'null'}
                          onValueChange={v => salvarCanalInline(lead.id, v)}
                          open
                          onOpenChange={open => { if (!open) setEditandoCanal(null); }}
                        >
                          <SelectTrigger className="h-7 text-[10px] bg-slate-800 border-violet-500 w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">Nenhum</SelectItem>
                            {canaisDisponiveis.map(c => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          className="text-xs text-slate-400 hover:text-violet-400 hover:underline transition-colors text-left"
                          onClick={() => setEditandoCanal(lead.id)}
                          title="Clique para editar"
                        >
                          {salvandoInline === lead.id ? (
                            <Loader2 className="w-3 h-3 animate-spin inline" />
                          ) : canalNome ? (
                            canalNome
                          ) : (
                            <span className="text-slate-500 italic">—</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-slate-400">{ultimoContato}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        tags.completas === 4
                          ? "bg-emerald-500/20 text-emerald-400"
                          : tags.completas >= 2
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-rose-500/20 text-rose-400"
                      )}>
                        {tags.completas === 4 ? '✅' : '⚠️'} {tags.completas}/{tags.total}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {lead.qtd_tentativas_sem_resposta > 0 ? (
                        <span className="text-[10px] font-bold text-amber-400">
                          {lead.qtd_tentativas_sem_resposta}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">0</span>
                      )}
                    </td>
                    {/* Menu de ações */}
                    <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            className="text-xs cursor-pointer gap-2"
                            onClick={() => onLeadClick?.(lead)}
                          >
                            <Eye className="w-3.5 h-3.5" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer gap-2"
                            onClick={() => onAgendar?.(lead)}
                          >
                            <Calendar className="w-3.5 h-3.5" /> Agendar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer gap-2"
                            onClick={() => onMoverEtapa?.(lead)}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Mover Etapa
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer gap-2"
                            onClick={() => onArquivar?.(lead)}
                          >
                            <Archive className="w-3.5 h-3.5" /> Arquivar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs cursor-pointer gap-2 text-rose-400 hover:!text-rose-300"
                            onClick={() => setLeadParaExcluir(lead)}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer: Seleção + Paginação */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">
              Selecionados: <strong className="text-white">{selecionados.size}</strong>
            </span>
            {selecionados.size > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700 text-slate-400">
                  <MessageSquare className="w-3 h-3 mr-1" /> WhatsApp em lote
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs border-slate-700 text-slate-400">
                  <Tag className="w-3 h-3 mr-1" /> Mover etapa
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {(pagina - 1) * ITENS_POR_PAGINA + 1}-{Math.min(pagina * ITENS_POR_PAGINA, leadsFiltrados.length)} de {leadsFiltrados.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-slate-700"
                disabled={pagina <= 1}
                onClick={() => setPagina(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPaginas, 5) }, (_, i) => {
                const p = pagina <= 3 ? i + 1 : pagina + i - 2;
                if (p < 1 || p > totalPaginas) return null;
                return (
                  <Button
                    key={p}
                    variant={p === pagina ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      "h-7 w-7 p-0 text-xs",
                      p === pagina
                        ? "bg-violet-600 text-white"
                        : "border-slate-700 text-slate-400"
                    )}
                    onClick={() => setPagina(p)}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 border-slate-700"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* AlertDialog de confirmação de exclusão */}
      <AlertDialog open={!!leadParaExcluir} onOpenChange={open => { if (!open) setLeadParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-white">{leadParaExcluir?.nome || 'este lead'}</strong>?
              Esta ação não pode ser desfeita. Todo o histórico e follow-ups serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} disabled={excluindo}>
              {excluindo ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> Excluir</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function getUnidadeCodigo(unidadeId: string): string {
  const map: Record<string, string> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'CG',
    '95553e96-971b-4590-a6eb-0201d013c14d': 'REC',
    '368d47f5-2d88-4475-bc14-ba084a9a348e': 'BAR',
  };
  return map[unidadeId] || '?';
}

function getCursoEmoji(cursoNome: string): string {
  const lower = cursoNome.toLowerCase();
  if (lower.includes('violão') || lower.includes('guitarra')) return '🎸';
  if (lower.includes('piano') || lower.includes('teclado')) return '🎹';
  if (lower.includes('bateria')) return '🥁';
  if (lower.includes('canto') || lower.includes('vocal')) return '🎤';
  if (lower.includes('baixo')) return '🎸';
  if (lower.includes('saxofone') || lower.includes('flauta')) return '🎷';
  return '🎵';
}

function formatarData(dataStr: string): string {
  const data = new Date(dataStr);
  const agora = new Date();
  const diffMs = agora.getTime() - data.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffH < 1) return 'Agora';
  if (diffH < 24) return `Hoje ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffH < 48) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default LeadsTab;
