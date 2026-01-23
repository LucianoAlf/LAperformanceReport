import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, Plus, Search, Filter, Download, FileText, 
  TrendingDown, Wrench, AlertTriangle, DollarSign
} from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventarioTable } from './InventarioTable';
import { ModalNovoEquipamento } from './ModalNovoEquipamento';
import { InventarioPorSala } from './InventarioPorSala';
import type { ItemInventario, Sala, Unidade } from './types';
import { CATEGORIAS_EQUIPAMENTO, STATUS_EQUIPAMENTO } from './types';

interface InventarioTabProps {
  unidadeAtual: string;
  salas: Sala[];
  unidades: Unidade[];
}

export function InventarioTab({ unidadeAtual, salas, unidades }: InventarioTabProps) {
  const { isAdmin, user } = useAuth();
  
  // Estados
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState<string>(unidadeAtual !== 'todos' ? unidadeAtual : '');
  const [filtroSala, setFiltroSala] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState<ItemInventario | null>(null);
  const [salaDetalhada, setSalaDetalhada] = useState<number | null>(null);

  // Carregar itens do inventário
  useEffect(() => {
    carregarInventario();
  }, [unidadeAtual]);

  async function carregarInventario() {
    setLoading(true);
    try {
      let query = supabase
        .from('inventario')
        .select(`
          *,
          salas(nome),
          unidades(nome)
        `)
        .eq('ativo', true)
        .order('nome');

      if (unidadeAtual && unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao carregar inventário:', error);
        return;
      }

      if (data) {
        const itensFormatados: ItemInventario[] = data.map((item: any) => ({
          ...item,
          sala_nome: item.salas?.nome || 'Sem sala',
          unidade_nome: item.unidades?.nome || '',
        }));
        setItens(itensFormatados);
      }
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrar itens
  const itensFiltrados = useMemo(() => {
    return itens.filter(item => {
      // Busca por texto
      if (busca) {
        const termoBusca = busca.toLowerCase();
        const matchBusca = 
          item.nome.toLowerCase().includes(termoBusca) ||
          item.marca?.toLowerCase().includes(termoBusca) ||
          item.modelo?.toLowerCase().includes(termoBusca) ||
          item.codigo_patrimonio?.toLowerCase().includes(termoBusca) ||
          item.sala_nome?.toLowerCase().includes(termoBusca);
        if (!matchBusca) return false;
      }
      
      // Filtro por unidade (ignora se for 'todos' ou vazio)
      if (filtroUnidade && filtroUnidade !== 'todos' && item.unidade_id !== filtroUnidade) return false;
      
      // Filtro por sala (ignora se for 'todos' ou vazio)
      if (filtroSala && filtroSala !== 'todos' && item.sala_id?.toString() !== filtroSala) return false;
      
      // Filtro por categoria (ignora se for 'todos' ou vazio)
      if (filtroCategoria && filtroCategoria !== 'todos' && item.categoria !== filtroCategoria) return false;
      
      // Filtro por status (ignora se for 'todos' ou vazio)
      if (filtroStatus && filtroStatus !== 'todos' && item.status !== filtroStatus) return false;
      
      return true;
    });
  }, [itens, busca, filtroUnidade, filtroSala, filtroCategoria, filtroStatus]);

  // KPIs
  const kpis = useMemo(() => {
    const totalItens = itensFiltrados.length;
    const valorTotal = itensFiltrados.reduce((acc, item) => 
      acc + (item.valor_compra || 0) * item.quantidade, 0
    );
    const emManutencao = itensFiltrados.filter(item => item.status === 'em_manutencao').length;
    const atencao = itensFiltrados.filter(item => 
      item.condicao === 'ruim' || item.condicao === 'regular'
    ).length;
    
    return { totalItens, valorTotal, emManutencao, atencao };
  }, [itensFiltrados]);

  // Salas filtradas por unidade selecionada
  const salasFiltradas = useMemo(() => {
    if (!filtroUnidade) return salas;
    return salas.filter(s => s.unidade_id === filtroUnidade);
  }, [salas, filtroUnidade]);

  // Handlers
  function handleNovoEquipamento() {
    setItemParaEditar(null);
    setModalNovoAberto(true);
  }

  function handleEditarItem(item: ItemInventario) {
    setItemParaEditar(item);
    setModalNovoAberto(true);
  }

  function handleSalvarItem() {
    setModalNovoAberto(false);
    setItemParaEditar(null);
    carregarInventario();
  }

  function handleVerSala(salaId: number) {
    setSalaDetalhada(salaId);
  }

  function handleVoltarLista() {
    setSalaDetalhada(null);
  }

  // Se estiver visualizando uma sala específica
  if (salaDetalhada) {
    const sala = salas.find(s => s.id === salaDetalhada);
    const itensDaSala = itens.filter(item => item.sala_id === salaDetalhada);
    
    return (
      <InventarioPorSala
        sala={sala!}
        itens={itensDaSala}
        onVoltar={handleVoltarLista}
        onEditarItem={handleEditarItem}
        onRecarregar={carregarInventario}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Total de Itens</p>
              <p className="text-xl font-bold text-white">{kpis.totalItens}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Valor Total</p>
              <p className="text-xl font-bold text-white">
                {kpis.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Em Manutenção</p>
              <p className="text-xl font-bold text-white">{kpis.emManutencao}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Atenção</p>
              <p className="text-xl font-bold text-white">{kpis.atencao}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Busca */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar equipamento..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
          </div>

          {/* Filtro Unidade (só para admin) */}
          {isAdmin && (
            <div className="w-40">
              <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Filtro Sala */}
          <div className="w-40">
            <Select value={filtroSala} onValueChange={setFiltroSala}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sala" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {salasFiltradas.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Categoria */}
          <div className="w-44">
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {CATEGORIAS_EQUIPAMENTO.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.emoji} {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Status */}
          <div className="w-40">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS_EQUIPAMENTO.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botão Novo Equipamento */}
          <button 
            onClick={handleNovoEquipamento}
            className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Equipamento
          </button>
        </div>
      </div>

      {/* Tabela de Inventário */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 border border-slate-700 rounded-xl">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">
            {busca || filtroCategoria || filtroStatus || filtroSala 
              ? 'Nenhum equipamento encontrado com os filtros aplicados.' 
              : 'Nenhum equipamento cadastrado no inventário.'}
          </p>
          <button 
            onClick={handleNovoEquipamento}
            className="mt-4 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Cadastrar primeiro equipamento
          </button>
        </div>
      ) : (
        <InventarioTable 
          itens={itensFiltrados}
          salas={salas}
          onEditarItem={handleEditarItem}
          onVerSala={handleVerSala}
          onRecarregar={carregarInventario}
        />
      )}

      {/* Modal Novo/Editar Equipamento */}
      {modalNovoAberto && (
        <ModalNovoEquipamento
          item={itemParaEditar}
          salas={salas}
          unidades={unidades}
          onClose={() => {
            setModalNovoAberto(false);
            setItemParaEditar(null);
          }}
          onSalvar={handleSalvarItem}
        />
      )}
    </div>
  );
}
