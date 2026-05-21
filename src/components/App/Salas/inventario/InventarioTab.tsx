import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Package, Plus, Search, Wrench, AlertTriangle, DollarSign, ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InventarioTable } from './InventarioTable';
import { ModalNovoEquipamento } from './ModalNovoEquipamento';
import { ModalPendenciaInventario } from './ModalPendenciaInventario';
import { InventarioPorSala } from './InventarioPorSala';
import type { ItemInventario, PendenciaInventario, Sala, Unidade } from './types';
import { CATEGORIAS_EQUIPAMENTO, STATUS_EQUIPAMENTO } from './types';

interface InventarioTabProps {
  unidadeAtual: string;
  salas: Sala[];
  unidades: Unidade[];
  salaFiltroInicial?: number | null;
  onAbrirPendencias: (salaId: number) => void;
}

export function InventarioTab({ unidadeAtual, salas, unidades, salaFiltroInicial, onAbrirPendencias }: InventarioTabProps) {
  const { isAdmin, user } = useAuth();
  
  const [itens, setItens] = useState<ItemInventario[]>([]);
  const [pendencias, setPendencias] = useState<PendenciaInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState<string>(unidadeAtual !== 'todos' ? unidadeAtual : 'todos');
  const [filtroSala, setFiltroSala] = useState<string>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [itemParaEditar, setItemParaEditar] = useState<ItemInventario | null>(null);
  const [salaDetalhada, setSalaDetalhada] = useState<number | null>(null);
  const [itemParaManutencao, setItemParaManutencao] = useState<ItemInventario | null>(null);
  const [observacaoManutencao, setObservacaoManutencao] = useState('');
  const [salvandoAcao, setSalvandoAcao] = useState(false);
  const [itemParaPendencia, setItemParaPendencia] = useState<ItemInventario | null>(null);
  const [modalPendenciaAberto, setModalPendenciaAberto] = useState(false);

  useEffect(() => {
    if (unidadeAtual !== 'todos') {
      setFiltroUnidade(unidadeAtual);
      return;
    }
    if (!filtroUnidade) {
      setFiltroUnidade('todos');
    }
  }, [filtroUnidade, unidadeAtual]);

  useEffect(() => {
    if (salaFiltroInicial) {
      setFiltroSala(salaFiltroInicial.toString());
    }
  }, [salaFiltroInicial]);

  useEffect(() => {
    carregarInventario();
  }, [unidadeAtual]);

  async function carregarInventario() {
    setLoading(true);
    try {
      let queryItens = supabase
        .from('inventario')
        .select(`
          *,
          salas(nome),
          unidades(nome)
        `)
        .eq('ativo', true)
        .order('nome');

      let queryPendencias = supabase
        .from('inventario_pendencias')
        .select('id, sala_id, unidade_id, prioridade, status')
        .order('created_at', { ascending: false });

      if (unidadeAtual && unidadeAtual !== 'todos') {
        queryItens = queryItens.eq('unidade_id', unidadeAtual);
        queryPendencias = queryPendencias.eq('unidade_id', unidadeAtual);
      }

      const [{ data, error }, { data: pendenciasData, error: pendenciasError }] = await Promise.all([
        queryItens,
        queryPendencias,
      ]);

      if (error) {
        console.error('Erro ao carregar inventário:', error);
        toast.error('Erro ao carregar inventário');
        return;
      }

      if (pendenciasError) {
        console.error('Erro ao carregar pendências do inventário:', pendenciasError);
        toast.error('Erro ao carregar pendências do inventário');
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

      setPendencias((pendenciasData || []) as PendenciaInventario[]);
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao carregar dados do inventário');
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

  const pendenciasEmAberto = useMemo(() => {
    return pendencias.filter((pendencia) => {
      if (filtroUnidade !== 'todos' && pendencia.unidade_id !== filtroUnidade) return false;
      if (filtroSala !== 'todos' && String(pendencia.sala_id) !== filtroSala) return false;
      return pendencia.status === 'aberta' || pendencia.status === 'em_andamento';
    });
  }, [filtroSala, filtroUnidade, pendencias]);

  const pendenciasPorSala = useMemo(() => {
    return pendenciasEmAberto.reduce<Record<number, number>>((acc, pendencia) => {
      acc[pendencia.sala_id] = (acc[pendencia.sala_id] || 0) + 1;
      return acc;
    }, {});
  }, [pendenciasEmAberto]);

  const kpis = useMemo(() => {
    const totalItens = itensFiltrados.length;
    const valorTotal = itensFiltrados.reduce((acc, item) => 
      acc + (item.valor_compra || 0) * item.quantidade, 0
    );
    const emManutencao = itensFiltrados.filter(item => item.status === 'manutencao').length;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const itensRuins = itensFiltrados.filter(item => item.condicao === 'ruim').length;
    const revisoesAtencao = itensFiltrados.filter(item => {
      if (!item.proxima_revisao) return false;
      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + (item.alerta_revisao_dias || 0));
      const revisao = new Date(`${item.proxima_revisao}T00:00:00`);
      return revisao <= limite;
    }).length;
    const pendenciasUrgentes = pendenciasEmAberto.filter(pendencia => pendencia.prioridade === 'urgente').length;
    const atencao = itensRuins + revisoesAtencao + pendenciasUrgentes;
    const totalPendencias = pendenciasEmAberto.length;
    
    return { totalItens, valorTotal, emManutencao, atencao, totalPendencias };
  }, [itensFiltrados, pendenciasEmAberto]);

  // Salas filtradas por unidade selecionada
  const salasFiltradas = useMemo(() => {
    if (!filtroUnidade || filtroUnidade === 'todos') return salas;
    return salas.filter(s => s.unidade_id === filtroUnidade);
  }, [salas, filtroUnidade]);

  const possuiFiltrosAtivos = Boolean(
    busca ||
    (filtroCategoria && filtroCategoria !== 'todos') ||
    (filtroStatus && filtroStatus !== 'todos') ||
    (filtroSala && filtroSala !== 'todos') ||
    (filtroUnidade && filtroUnidade !== 'todos')
  );

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

  async function handleSalvarPendencia(payload: {
    unidade_id: string;
    sala_id: number | null;
    titulo: string;
    categoria: PendenciaInventario['categoria'];
    prioridade: PendenciaInventario['prioridade'];
    descricao: string;
    solicitante: string;
  }) {
    if (!itemParaPendencia) return false;

    try {
      const { error } = await supabase.from('inventario_pendencias').insert({
        unidade_id: payload.unidade_id,
        sala_id: payload.sala_id,
        titulo: payload.titulo,
        categoria: payload.categoria,
        prioridade: payload.prioridade,
        descricao: payload.descricao || null,
        solicitante: payload.solicitante || user?.email || null,
        created_via: `LA Report · inventário · item ${itemParaPendencia.id}`,
        item_vinculado_id: itemParaPendencia.id,
      });

      if (error) throw error;

      toast.success('Pendência criada');
      setItemParaPendencia(null);
      await carregarInventario();
      return true;
    } catch (error) {
      console.error('Erro ao criar pendência:', error);
      toast.error('Erro ao criar pendência');
      return false;
    }
  }

  async function handleAtualizarStatusItem(item: ItemInventario, status: ItemInventario['status'], observacao?: string) {
    setSalvandoAcao(true);
    try {
      const observacoesAtualizadas = observacao?.trim()
        ? [item.observacoes, observacao.trim()].filter(Boolean).join('\n\n')
        : item.observacoes;

      const { error } = await supabase
        .from('inventario')
        .update({
          status,
          observacoes: observacoesAtualizadas || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success(status === 'manutencao' ? 'Item enviado para manutenção' : 'Item marcado como ativo');
      setItemParaManutencao(null);
      setObservacaoManutencao('');
      await carregarInventario();
    } catch (error) {
      console.error('Erro ao atualizar status do item:', error);
      toast.error('Erro ao atualizar status do item');
    } finally {
      setSalvandoAcao(false);
    }
  }

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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
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

        <div className={`border rounded-xl p-4 ${kpis.totalPendencias > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpis.totalPendencias > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'}`}>
              <ClipboardList className={`w-5 h-5 ${kpis.totalPendencias > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase">Pendências</p>
              <p className="text-xl font-bold text-white">{kpis.totalPendencias}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar equipamento..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="border-slate-700 bg-slate-900 pl-10"
              />
            </div>
          </div>

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

          <Button onClick={handleNovoEquipamento} className="bg-purple-600 hover:bg-purple-500">
            <Plus className="w-4 h-4" />
            Novo Equipamento
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      ) : itensFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/50 border border-slate-700 rounded-xl">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">
            {possuiFiltrosAtivos
              ? 'Nenhum equipamento encontrado com os filtros aplicados.' 
              : 'Nenhum equipamento cadastrado no inventário.'}
          </p>
          {!possuiFiltrosAtivos && (
            <button 
            onClick={handleNovoEquipamento}
            className="mt-4 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Cadastrar primeiro equipamento
            </button>
          )}
        </div>
      ) : (
        <InventarioTable 
          itens={itensFiltrados}
          pendenciasPorSala={pendenciasPorSala}
          onEditarItem={handleEditarItem}
          onVerSala={handleVerSala}
          onNovaPendencia={(item) => {
            setItemParaPendencia(item);
            setModalPendenciaAberto(true);
          }}
          onVerPendenciasSala={(salaId) => onAbrirPendencias(salaId)}
          onColocarEmManutencao={(item) => {
            setItemParaManutencao(item);
            setObservacaoManutencao('');
          }}
          onMarcarComoAtivo={(item) => handleAtualizarStatusItem(item, 'ativo')}
          onRecarregar={carregarInventario}
        />
      )}

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

      <ModalPendenciaInventario
        open={modalPendenciaAberto}
        onOpenChange={(open) => {
          setModalPendenciaAberto(open);
          if (!open) setItemParaPendencia(null);
        }}
        onSave={handleSalvarPendencia}
        unidades={unidades}
        salas={salas}
        defaultUnidadeId={itemParaPendencia?.unidade_id}
        defaultSalaId={itemParaPendencia?.sala_id}
        defaultSolicitante={user?.email || ''}
      />

      <Dialog open={!!itemParaManutencao} onOpenChange={(open) => !open && setItemParaManutencao(null)}>
        <DialogContent className="max-w-xl border-slate-700 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/20">
                <Wrench className="h-5 w-5 text-yellow-400" />
              </div>
              Colocar em manutenção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="font-medium text-white">{itemParaManutencao?.nome}</p>
              <p className="mt-1 text-sm text-slate-400">{itemParaManutencao?.sala_nome || 'Sem sala'}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Observação</Label>
              <Textarea
                value={observacaoManutencao}
                onChange={(e) => setObservacaoManutencao(e.target.value)}
                placeholder="Descreva o motivo da manutenção"
                className="min-h-[120px] border-slate-700 bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setItemParaManutencao(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={salvandoAcao || !itemParaManutencao}
                className="bg-yellow-600 text-white hover:bg-yellow-500"
                onClick={() => itemParaManutencao && handleAtualizarStatusItem(itemParaManutencao, 'manutencao', observacaoManutencao)}
              >
                {salvandoAcao ? 'Salvando...' : 'Confirmar manutenção'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
