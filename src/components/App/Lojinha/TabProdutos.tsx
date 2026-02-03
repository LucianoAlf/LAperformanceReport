'use client';

import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Download, Edit2, Trash2,
  AlertTriangle, Check, X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { LojaProduto, LojaCategoria, FiltrosProdutos } from '@/types/lojinha';
import { ModalProduto } from './ModalProduto';
import { ModalEntradaLote } from './ModalEntradaLote';

interface TabProdutosProps {
  unidadeId: string;
}

export function TabProdutos({ unidadeId }: TabProdutosProps) {
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<LojaProduto[]>([]);
  const [categorias, setCategorias] = useState<LojaCategoria[]>([]);
  const [filtros, setFiltros] = useState<FiltrosProdutos>({
    busca: '',
    categoria_id: null,
    status: 'todos',
  });
  
  // Modais
  const [modalProduto, setModalProduto] = useState(false);
  const [modalEntradaLote, setModalEntradaLote] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<LojaProduto | null>(null);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [unidadeId]);

  async function loadData() {
    setLoading(true);
    try {
      // Carregar categorias
      const { data: cats } = await supabase
        .from('loja_categorias')
        .select('*')
        .eq('ativo', true)
        .order('ordem');
      
      setCategorias(cats || []);

      // Carregar produtos com estoque
      const { data: prods } = await supabase
        .from('loja_produtos')
        .select(`
          *,
          loja_categorias(*),
          loja_variacoes(*)
        `)
        .order('nome');

      // Calcular estoque total por produto
      if (prods) {
        const produtosComEstoque = await Promise.all(
          prods.map(async (p) => {
            const { data: estoque } = await supabase
              .from('loja_estoque')
              .select('quantidade')
              .eq('produto_id', p.id)
              .eq('unidade_id', unidadeId === 'todos' ? unidadeId : unidadeId);
            
            const estoqueTotal = estoque?.reduce((acc, e) => acc + e.quantidade, 0) || 0;
            return {
              ...p,
              estoque_total: estoqueTotal,
              variacoes_count: p.loja_variacoes?.length || 0,
            };
          })
        );
        setProdutos(produtosComEstoque);
      }
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrar produtos
  const produtosFiltrados = produtos.filter((p) => {
    // Busca
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase();
      if (!p.nome.toLowerCase().includes(busca) && !p.sku?.toLowerCase().includes(busca)) {
        return false;
      }
    }
    // Categoria
    if (filtros.categoria_id && p.categoria_id !== filtros.categoria_id) {
      return false;
    }
    // Status
    if (filtros.status === 'ativos' && !p.ativo) return false;
    if (filtros.status === 'inativos' && p.ativo) return false;
    if (filtros.status === 'estoque_baixo' && (p.estoque_total || 0) >= p.estoque_minimo) return false;
    
    return true;
  });

  // KPIs
  const totalProdutos = produtos.length;
  const produtosAtivos = produtos.filter(p => p.ativo).length;
  const produtosInativos = produtos.filter(p => !p.ativo).length;
  const produtosEstoqueBaixo = produtos.filter(p => (p.estoque_total || 0) < p.estoque_minimo).length;
  const valorEstoque = produtos.reduce((acc, p) => acc + ((p.custo || 0) * (p.estoque_total || 0)), 0);

  function handleEditProduto(produto: LojaProduto) {
    setProdutoEditando(produto);
    setModalProduto(true);
  }

  function handleNovoProduto() {
    setProdutoEditando(null);
    setModalProduto(true);
  }

  function handleSuccess() {
    loadData();
    setModalProduto(false);
    setModalEntradaLote(false);
    setProdutoEditando(null);
  }

  // Função para obter cor da barra de estoque
  function getEstoqueColor(quantidade: number, minimo: number) {
    if (quantidade === 0) return 'bg-rose-500';
    if (quantidade < minimo) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  function getEstoquePercent(quantidade: number, minimo: number) {
    if (quantidade === 0) return 0;
    const max = minimo * 3;
    return Math.min((quantidade / max) * 100, 100);
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium tracking-wide">Total Produtos</p>
          <p className="text-2xl font-bold text-sky-400 font-mono mt-1">{totalProdutos}</p>
          <p className="text-xs text-slate-500 mt-1">{produtosAtivos} ativos • {produtosInativos} inativos</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium tracking-wide">Categorias</p>
          <p className="text-2xl font-bold text-purple-400 font-mono mt-1">{categorias.length}</p>
          <p className="text-xs text-slate-500 mt-1">Todas ativas</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium tracking-wide">Estoque Baixo</p>
          <p className="text-2xl font-bold text-rose-400 font-mono mt-1">{produtosEstoqueBaixo}</p>
          <p className="text-xs text-slate-500 mt-1">Produtos abaixo do mínimo</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium tracking-wide">Valor em Estoque</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
            R$ {valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-slate-500 mt-1">Preço de custo</p>
        </div>
      </div>

      {/* Tabela de Produtos */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Package className="w-4 h-4" />
            Catálogo de Produtos
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar produto..."
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                className="pl-9 w-48"
              />
            </div>
            {/* Filtro Categoria */}
            <Select
              value={filtros.categoria_id?.toString() || 'todas'}
              onValueChange={(v) => setFiltros({ ...filtros, categoria_id: v === 'todas' ? null : parseInt(v) })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todas Categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">📂 Todas Categorias</SelectItem>
                {categorias.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.icone} {cat.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Filtro Status */}
            <Select
              value={filtros.status}
              onValueChange={(v) => setFiltros({ ...filtros, status: v as FiltrosProdutos['status'] })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Todos Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">� Todos Status</SelectItem>
                <SelectItem value="ativos">🟢 Ativos</SelectItem>
                <SelectItem value="inativos">🔴 Inativos</SelectItem>
                <SelectItem value="estoque_baixo">🟡 Estoque Baixo</SelectItem>
              </SelectContent>
            </Select>
            {/* Botões */}
            <Button variant="outline" size="sm" onClick={() => setModalEntradaLote(true)}>
              <Download className="w-4 h-4 mr-1" />
              Entrada Lote
            </Button>
            <Button size="sm" onClick={handleNovoProduto}>
              <Plus className="w-4 h-4 mr-1" />
              Novo Produto
            </Button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide"></th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Produto</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Categoria</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Variações</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Preço</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Estoque</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Comissão</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Carregando produtos...
                  </td>
                </tr>
              ) : produtosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Nenhum produto encontrado
                  </td>
                </tr>
              ) : (
                produtosFiltrados.map((produto) => (
                  <tr 
                    key={produto.id} 
                    className={cn(
                      'border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors',
                      !produto.ativo && 'opacity-50'
                    )}
                  >
                    {/* Ícone */}
                    <td className="p-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-lg">
                        {produto.loja_categorias?.icone || '📦'}
                      </div>
                    </td>
                    {/* Nome */}
                    <td className="p-3">
                      <p className="font-semibold text-white">{produto.nome}</p>
                      <p className="text-xs text-slate-400 font-mono">SKU: {produto.sku || '—'}</p>
                    </td>
                    {/* Categoria */}
                    <td className="p-3">
                      <Badge variant="secondary" className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                        {produto.loja_categorias?.nome || '—'}
                      </Badge>
                    </td>
                    {/* Variações */}
                    <td className="p-3 text-sm text-slate-300">
                      {produto.variacoes_count ? `${produto.variacoes_count} variações` : '—'}
                    </td>
                    {/* Preço */}
                    <td className="p-3 font-mono text-sm text-white">
                      R$ {produto.preco.toFixed(2).replace('.', ',')}
                    </td>
                    {/* Estoque */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={cn('h-full rounded-full', getEstoqueColor(produto.estoque_total || 0, produto.estoque_minimo))}
                            style={{ width: `${getEstoquePercent(produto.estoque_total || 0, produto.estoque_minimo)}%` }}
                          />
                        </div>
                        <span className={cn(
                          'font-mono text-xs',
                          (produto.estoque_total || 0) === 0 ? 'text-rose-400' :
                          (produto.estoque_total || 0) < produto.estoque_minimo ? 'text-amber-400' : 'text-slate-300'
                        )}>
                          {produto.estoque_total || 0}
                        </span>
                      </div>
                    </td>
                    {/* Comissão */}
                    <td className="p-3">
                      <span className={cn(
                        'font-mono text-xs',
                        produto.comissao_especial ? 'text-amber-400' : 'text-slate-400'
                      )}>
                        {produto.comissao_especial ? `${produto.comissao_especial}%` : 'Padrão (5%)'}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="p-3">
                      <Badge variant={produto.ativo ? 'success' : 'error'}>
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    {/* Ações */}
                    <td className="p-3">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditProduto(produto)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais */}
      <ModalProduto
        open={modalProduto}
        onClose={() => { setModalProduto(false); setProdutoEditando(null); }}
        onSuccess={handleSuccess}
        produto={produtoEditando}
        categorias={categorias}
        unidadeId={unidadeId}
      />

      <ModalEntradaLote
        open={modalEntradaLote}
        onClose={() => setModalEntradaLote(false)}
        onSuccess={handleSuccess}
        unidadeId={unidadeId}
      />
    </div>
  );
}
