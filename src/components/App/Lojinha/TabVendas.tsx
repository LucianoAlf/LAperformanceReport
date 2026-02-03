'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Search, Eye, Plus, Minus, X, 
  CreditCard, Banknote, Smartphone, FileText, Wallet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { 
  LojaProduto, LojaVenda, ItemCarrinho, DadosPDV,
  FormaPagamento, TipoCliente, FORMAS_PAGAMENTO, TIPOS_CLIENTE 
} from '@/types/lojinha';
import { ModalVendaDetalhes } from './ModalVendaDetalhes';
import { ModalEstorno } from './ModalEstorno';

interface TabVendasProps {
  unidadeId: string;
}

type SubTab = 'pdv' | 'historico';

export function TabVendas({ unidadeId }: TabVendasProps) {
  const [subTab, setSubTab] = useState<SubTab>('pdv');
  const [loading, setLoading] = useState(true);
  
  // PDV State
  const [produtos, setProdutos] = useState<LojaProduto[]>([]);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [dadosPDV, setDadosPDV] = useState<DadosPDV>({
    itens: [],
    tipo_cliente: 'aluno',
    aluno_id: null,
    colaborador_cliente_id: null,
    cliente_nome: '',
    professor_indicador_id: null,
    forma_pagamento: 'pix',
    parcelas: 1,
    desconto: 0,
    desconto_tipo: 'valor',
    observacoes: '',
    enviar_comprovante: true,
  });

  // Histórico State
  const [vendas, setVendas] = useState<LojaVenda[]>([]);
  const [buscaVenda, setBuscaVenda] = useState('');

  // Modais
  const [modalDetalhes, setModalDetalhes] = useState(false);
  const [modalEstorno, setModalEstorno] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<LojaVenda | null>(null);

  // Autocomplete de alunos e professores
  const [buscaAluno, setBuscaAluno] = useState('');
  const [alunosSugestoes, setAlunosSugestoes] = useState<{ id: number; nome: string }[]>([]);
  const [showAlunosSugestoes, setShowAlunosSugestoes] = useState(false);
  const [buscaProfessor, setBuscaProfessor] = useState('');
  const [professoresSugestoes, setProfessoresSugestoes] = useState<{ id: number; nome: string }[]>([]);
  const [showProfessoresSugestoes, setShowProfessoresSugestoes] = useState(false);

  // Vendedores (Farmers) da unidade
  const [vendedores, setVendedores] = useState<{ id: number; nome: string; apelido: string }[]>([]);
  const [vendedorId, setVendedorId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
    loadVendedores();
  }, [unidadeId]);

  async function loadData() {
    setLoading(true);
    try {
      // Carregar produtos para o PDV
      const { data: prods } = await supabase
        .from('loja_produtos')
        .select(`
          *,
          loja_categorias(*),
          loja_variacoes(*)
        `)
        .eq('ativo', true)
        .order('nome');

      if (prods) {
        // Adicionar estoque
        const produtosComEstoque = await Promise.all(
          prods.map(async (p) => {
            const { data: estoque } = await supabase
              .from('loja_estoque')
              .select('quantidade')
              .eq('produto_id', p.id);
            
            const estoqueTotal = estoque?.reduce((acc, e) => acc + e.quantidade, 0) || 0;
            return { ...p, estoque_total: estoqueTotal };
          })
        );
        setProdutos(produtosComEstoque);
      }

      // Carregar vendas
      const { data: vendasData } = await supabase
        .from('loja_vendas')
        .select(`
          *,
          unidades(codigo, nome),
          alunos(nome),
          professores(nome),
          loja_vendas_itens(*)
        `)
        .order('data_venda', { ascending: false })
        .limit(50);

      setVendas(vendasData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  // Carregar vendedores (Farmers) da unidade
  async function loadVendedores() {
    if (!unidadeId || unidadeId === 'todos') {
      setVendedores([]);
      return;
    }
    
    const { data } = await supabase
      .from('colaboradores')
      .select('id, nome, apelido')
      .eq('unidade_id', unidadeId)
      .eq('tipo', 'farmer')
      .eq('ativo', true)
      .order('nome');
    
    setVendedores(data || []);
  }

  // Filtrar produtos
  const produtosFiltrados = produtos.filter((p) => {
    if (!buscaProduto) return true;
    const busca = buscaProduto.toLowerCase();
    return p.nome.toLowerCase().includes(busca) || p.sku?.toLowerCase().includes(busca);
  });

  // Adicionar ao carrinho
  function addToCart(produto: LojaProduto) {
    const existente = carrinho.find(i => i.produto_id === produto.id && !i.variacao_id);
    
    if (existente) {
      setCarrinho(carrinho.map(i => 
        i.produto_id === produto.id && !i.variacao_id
          ? { ...i, quantidade: i.quantidade + 1, subtotal: (i.quantidade + 1) * i.preco_unitario }
          : i
      ));
    } else {
      setCarrinho([...carrinho, {
        produto_id: produto.id,
        variacao_id: null,
        produto_nome: produto.nome,
        variacao_nome: null,
        quantidade: 1,
        preco_unitario: produto.preco,
        subtotal: produto.preco,
      }]);
    }
  }

  function updateQuantidade(index: number, delta: number) {
    const updated = [...carrinho];
    updated[index].quantidade += delta;
    if (updated[index].quantidade <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index].subtotal = updated[index].quantidade * updated[index].preco_unitario;
    }
    setCarrinho(updated);
  }

  function removeFromCart(index: number) {
    setCarrinho(carrinho.filter((_, i) => i !== index));
  }

  // Buscar alunos para autocomplete
  async function buscarAlunos(termo: string) {
    if (termo.length < 2) {
      setAlunosSugestoes([]);
      return;
    }
    
    let query = supabase
      .from('alunos')
      .select('id, nome')
      .ilike('nome', `%${termo}%`)
      .is('data_saida', null)
      .limit(10);
    
    // Filtrar por unidade se não for consolidado
    if (unidadeId && unidadeId !== 'todos') {
      query = query.eq('unidade_id', unidadeId);
    }
    
    const { data } = await query;
    setAlunosSugestoes(data || []);
  }

  // Buscar professores para autocomplete
  async function buscarProfessores(termo: string) {
    if (termo.length < 2) {
      setProfessoresSugestoes([]);
      return;
    }
    
    const { data } = await supabase
      .from('professores')
      .select('id, nome')
      .ilike('nome', `%${termo}%`)
      .eq('ativo', true)
      .limit(10);
    
    setProfessoresSugestoes(data || []);
  }

  // Selecionar aluno do autocomplete
  function selecionarAluno(aluno: { id: number; nome: string }) {
    setDadosPDV({ ...dadosPDV, aluno_id: aluno.id, cliente_nome: aluno.nome });
    setBuscaAluno(aluno.nome);
    setShowAlunosSugestoes(false);
  }

  // Selecionar professor do autocomplete
  function selecionarProfessor(professor: { id: number; nome: string }) {
    setDadosPDV({ ...dadosPDV, professor_indicador_id: professor.id });
    setBuscaProfessor(professor.nome);
    setShowProfessoresSugestoes(false);
  }

  // Cálculos
  const subtotal = carrinho.reduce((acc, i) => acc + i.subtotal, 0);
  const descontoValor = dadosPDV.desconto_tipo === 'percentual' 
    ? subtotal * (dadosPDV.desconto / 100) 
    : dadosPDV.desconto;
  const total = subtotal - descontoValor;

  // Parcelas
  const parcelasOptions = [1, 2, 3, 4, 5, 6].map(n => ({
    value: n,
    label: `${n}x de R$ ${(total / n).toFixed(2).replace('.', ',')}`,
  }));

  async function finalizarVenda() {
    if (carrinho.length === 0) {
      alert('Adicione produtos ao carrinho');
      return;
    }

    setLoading(true);
    try {
      // Criar venda
      const { data: venda, error: vendaError } = await supabase
        .from('loja_vendas')
        .insert({
          unidade_id: unidadeId !== 'todos' ? unidadeId : null,
          tipo_cliente: dadosPDV.tipo_cliente,
          aluno_id: dadosPDV.aluno_id,
          colaborador_cliente_id: dadosPDV.colaborador_cliente_id,
          cliente_nome: dadosPDV.cliente_nome || null,
          professor_indicador_id: dadosPDV.professor_indicador_id,
          vendedor_id: vendedorId,
          subtotal,
          desconto: descontoValor,
          desconto_tipo: dadosPDV.desconto_tipo,
          total,
          forma_pagamento: dadosPDV.forma_pagamento,
          parcelas: dadosPDV.parcelas,
          observacoes: dadosPDV.observacoes || null,
          comprovante_enviado: dadosPDV.enviar_comprovante,
        })
        .select('id')
        .single();

      if (vendaError) throw vendaError;

      // Criar itens da venda
      for (const item of carrinho) {
        await supabase
          .from('loja_vendas_itens')
          .insert({
            venda_id: venda.id,
            produto_id: item.produto_id,
            variacao_id: item.variacao_id,
            produto_nome: item.produto_nome,
            variacao_nome: item.variacao_nome,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            subtotal: item.subtotal,
          });

        // Atualizar estoque
        const { data: estoque } = await supabase
          .from('loja_estoque')
          .select('id, quantidade')
          .eq('produto_id', item.produto_id)
          .is('variacao_id', item.variacao_id)
          .eq('unidade_id', unidadeId)
          .single();

        if (estoque) {
          const novoSaldo = estoque.quantidade - item.quantidade;
          await supabase
            .from('loja_estoque')
            .update({ quantidade: novoSaldo })
            .eq('id', estoque.id);
        }
      }

      // Enviar comprovante via WhatsApp se marcado
      if (dadosPDV.enviar_comprovante && venda.id) {
        try {
          const { data: funcData, error: funcError } = await supabase.functions.invoke('lojinha-enviar-comprovante', {
            body: { venda_id: venda.id }
          });
          
          if (funcError) {
            console.warn('Erro ao enviar comprovante WhatsApp:', funcError);
          } else if (funcData?.success) {
            console.log('Comprovante WhatsApp enviado com sucesso!');
          } else {
            console.warn('Comprovante não enviado:', funcData?.error);
          }
        } catch (whatsappError) {
          console.warn('Erro ao chamar Edge Function de comprovante:', whatsappError);
        }
      }

      // Limpar carrinho e dados
      setCarrinho([]);
      setVendedorId(null);
      setBuscaAluno('');
      setBuscaProfessor('');
      setDadosPDV({
        ...dadosPDV,
        cliente_nome: '',
        aluno_id: null,
        professor_indicador_id: null,
        desconto: 0,
        observacoes: '',
      });

      // Recarregar dados
      loadData();

      alert('✓ Venda registrada com sucesso!');
    } catch (error) {
      console.error('Erro ao finalizar venda:', error);
      alert('Erro ao finalizar venda');
    } finally {
      setLoading(false);
    }
  }

  function handleVerDetalhes(venda: LojaVenda) {
    setVendaSelecionada(venda);
    setModalDetalhes(true);
  }

  function handleEstornar(venda: LojaVenda) {
    setVendaSelecionada(venda);
    setModalEstorno(true);
  }

  // KPIs do Histórico
  const vendasHoje = vendas.filter(v => {
    const hoje = new Date().toISOString().split('T')[0];
    return v.data_venda.startsWith(hoje) && v.status === 'concluida';
  });
  const totalHoje = vendasHoje.reduce((acc, v) => acc + v.total, 0);
  const vendasMes = vendas.filter(v => v.status === 'concluida');
  const totalMes = vendasMes.reduce((acc, v) => acc + v.total, 0);
  const ticketMedio = vendasMes.length > 0 ? totalMes / vendasMes.length : 0;

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('pdv')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            subTab === 'pdv'
              ? 'bg-sky-500 text-slate-900'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          )}
        >
          🛒 Novo Pedido
        </button>
        <button
          onClick={() => setSubTab('historico')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            subTab === 'historico'
              ? 'bg-sky-500 text-slate-900'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          )}
        >
          📋 Histórico
        </button>
      </div>

      {/* PDV */}
      {subTab === 'pdv' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Produtos */}
          <div className="lg:col-span-2 space-y-4">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar produto por nome ou SKU..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Grid de Produtos */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {produtosFiltrados.slice(0, 12).map((produto) => (
                <div
                  key={produto.id}
                  onClick={() => addToCart(produto)}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-sky-500 hover:-translate-y-0.5 transition-all"
                >
                  <div className="w-full h-20 bg-slate-700 rounded-lg flex items-center justify-center text-3xl mb-3">
                    {produto.loja_categorias?.icone || '📦'}
                  </div>
                  <p className="font-semibold text-white text-sm truncate">{produto.nome}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {produto.loja_categorias?.nome} • {produto.estoque_total || 0} em estoque
                  </p>
                  <p className="font-mono font-bold text-emerald-400 mt-2">
                    R$ {produto.preco.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Carrinho */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl flex flex-col h-fit sticky top-4">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-semibold text-white">Carrinho</span>
              <Badge variant="secondary" className="ml-auto bg-sky-500/20 text-sky-400">
                {carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}
              </Badge>
            </div>

            {/* Itens */}
            <div className="p-3 max-h-64 overflow-y-auto space-y-2">
              {carrinho.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  Carrinho vazio
                </p>
              ) : (
                carrinho.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.produto_nome}</p>
                      <p className="text-xs text-slate-400">
                        {item.quantidade}x R$ {item.preco_unitario.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-emerald-400">
                        R$ {item.subtotal.toFixed(2).replace('.', ',')}
                      </span>
                      <button
                        onClick={() => removeFromCart(i)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cliente */}
            <div className="p-4 border-t border-slate-700 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">Cliente</label>
                <Select
                  value={dadosPDV.tipo_cliente}
                  onValueChange={(v) => setDadosPDV({ ...dadosPDV, tipo_cliente: v as TipoCliente })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aluno">👤 Aluno</SelectItem>
                    <SelectItem value="colaborador">👨‍💼 Colaborador</SelectItem>
                    <SelectItem value="avulso">🏷️ Venda Avulsa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Autocomplete de Aluno */}
              <div className="relative">
                <Input
                  placeholder="Buscar aluno..."
                  value={buscaAluno}
                  onChange={(e) => {
                    setBuscaAluno(e.target.value);
                    buscarAlunos(e.target.value);
                    setShowAlunosSugestoes(true);
                  }}
                  onFocus={() => setShowAlunosSugestoes(true)}
                  onBlur={() => setTimeout(() => setShowAlunosSugestoes(false), 200)}
                />
                {showAlunosSugestoes && alunosSugestoes.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {alunosSugestoes.map((aluno) => (
                      <button
                        key={aluno.id}
                        type="button"
                        onClick={() => selecionarAluno(aluno)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 text-white"
                      >
                        {aluno.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Autocomplete de Professor Indicador */}
              <div className="relative">
                <label className="text-xs font-semibold text-slate-400 uppercase">
                  Professor Indicador (opcional)
                </label>
                <Input
                  placeholder="Buscar professor..."
                  className="mt-1"
                  value={buscaProfessor}
                  onChange={(e) => {
                    setBuscaProfessor(e.target.value);
                    buscarProfessores(e.target.value);
                    setShowProfessoresSugestoes(true);
                  }}
                  onFocus={() => setShowProfessoresSugestoes(true)}
                  onBlur={() => setTimeout(() => setShowProfessoresSugestoes(false), 200)}
                />
                {showProfessoresSugestoes && professoresSugestoes.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {professoresSugestoes.map((prof) => (
                      <button
                        key={prof.id}
                        type="button"
                        onClick={() => selecionarProfessor(prof)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 text-white"
                      >
                        {prof.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Vendedor (Farmer) */}
              {vendedores.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">
                    Vendedor
                  </label>
                  <Select
                    value={vendedorId?.toString() || ''}
                    onValueChange={(v) => setVendedorId(v ? parseInt(v) : null)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione o vendedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id.toString()}>
                          {v.apelido || v.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Totais */}
            <div className="p-4 border-t border-slate-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-mono">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Desconto</span>
                <span className="font-mono text-rose-400">
                  - R$ {descontoValor.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-700">
                <span>Total</span>
                <span className="font-mono text-emerald-400">
                  R$ {total.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* Pagamento */}
            <div className="p-4 border-t border-slate-700 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">Pagamento</label>
                <Select
                  value={dadosPDV.forma_pagamento}
                  onValueChange={(v) => setDadosPDV({ ...dadosPDV, forma_pagamento: v as FormaPagamento })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">💰 Pix</SelectItem>
                    <SelectItem value="dinheiro">💵 Dinheiro</SelectItem>
                    <SelectItem value="debito">💳 Cartão Débito</SelectItem>
                    <SelectItem value="credito">💳 Cartão Crédito</SelectItem>
                    <SelectItem value="folha">📋 Desconto em Folha</SelectItem>
                    <SelectItem value="saldo">👛 Saldo Carteira</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dadosPDV.forma_pagamento === 'credito' && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase">Parcelas</label>
                  <Select
                    value={dadosPDV.parcelas.toString()}
                    onValueChange={(v) => setDadosPDV({ ...dadosPDV, parcelas: parseInt(v) })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parcelasOptions.map((p) => (
                        <SelectItem key={p.value} value={p.value.toString()}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">Desconto</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    value={dadosPDV.desconto || ''}
                    onChange={(e) => setDadosPDV({ ...dadosPDV, desconto: parseFloat(e.target.value) || 0 })}
                    placeholder="0,00"
                    className="flex-1 font-mono"
                  />
                  <Select
                    value={dadosPDV.desconto_tipo}
                    onValueChange={(v) => setDadosPDV({ ...dadosPDV, desconto_tipo: v as 'valor' | 'percentual' })}
                  >
                    <SelectTrigger className="w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor">R$</SelectItem>
                      <SelectItem value="percentual">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase">Observações</label>
                <Input
                  value={dadosPDV.observacoes}
                  onChange={(e) => setDadosPDV({ ...dadosPDV, observacoes: e.target.value })}
                  placeholder="Observações da venda..."
                  className="mt-1"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dadosPDV.enviar_comprovante}
                  onChange={(e) => setDadosPDV({ ...dadosPDV, enviar_comprovante: e.target.checked })}
                  className="rounded"
                />
                Enviar comprovante WhatsApp
              </label>
            </div>

            {/* Botão Finalizar */}
            <div className="p-4 border-t border-slate-700">
              <Button
                className="w-full"
                size="lg"
                onClick={finalizarVenda}
                disabled={loading || carrinho.length === 0}
              >
                ✅ Finalizar Venda (R$ {total.toFixed(2).replace('.', ',')})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      {subTab === 'historico' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase font-medium">Vendas Hoje</p>
              <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                R$ {totalHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">{vendasHoje.length} vendas</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase font-medium">Vendas Fev/2026</p>
              <p className="text-2xl font-bold text-sky-400 font-mono mt-1">
                R$ {totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">{vendasMes.length} vendas</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase font-medium">Ticket Médio</p>
              <p className="text-2xl font-bold text-amber-400 font-mono mt-1">
                R$ {ticketMedio.toFixed(0)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Média por venda</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase font-medium">Meta Lojinha Q1</p>
              <p className="text-2xl font-bold text-purple-400 font-mono mt-1">62%</p>
              <p className="text-xs text-slate-500 mt-1">R$ {totalMes.toFixed(0)} / R$ 3.000</p>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">📋 Histórico de Vendas</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Buscar venda..."
                  value={buscaVenda}
                  onChange={(e) => setBuscaVenda(e.target.value)}
                  className="pl-9 w-48"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Data</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Cliente</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Itens</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Total</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Pagamento</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Vendedor</th>
                    <th className="text-left p-3 text-xs font-semibold text-slate-400">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((venda) => (
                    <tr 
                      key={venda.id} 
                      className={cn(
                        'border-b border-slate-700/50 hover:bg-slate-700/30',
                        venda.status === 'estornada' && 'opacity-50'
                      )}
                    >
                      <td className="p-3 font-mono text-xs text-slate-300">
                        {new Date(venda.data_venda).toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-white text-sm">
                          {venda.cliente_nome || venda.alunos?.nome || 'Avulso'}
                        </p>
                        <p className="text-xs text-slate-400 capitalize">{venda.tipo_cliente}</p>
                      </td>
                      <td className="p-3 text-sm text-slate-300">
                        {venda.loja_vendas_itens?.map(i => `${i.quantidade}x ${i.produto_nome}`).join(', ') || '—'}
                      </td>
                      <td className={cn(
                        'p-3 font-mono font-semibold',
                        venda.status === 'estornada' ? 'text-slate-400 line-through' : 'text-emerald-400'
                      )}>
                        R$ {venda.total.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="p-3">
                        <Badge 
                          variant={venda.forma_pagamento === 'pix' ? 'success' : 
                                   venda.forma_pagamento === 'credito' || venda.forma_pagamento === 'debito' ? 'secondary' :
                                   'warning'}
                          className={cn(
                            venda.forma_pagamento === 'pix' && 'bg-emerald-500/20 text-emerald-400',
                            (venda.forma_pagamento === 'credito' || venda.forma_pagamento === 'debito') && 'bg-sky-500/20 text-sky-400',
                            venda.forma_pagamento === 'folha' && 'bg-amber-500/20 text-amber-400',
                            venda.forma_pagamento === 'dinheiro' && 'bg-emerald-500/20 text-emerald-400',
                          )}
                        >
                          {venda.forma_pagamento === 'pix' ? 'Pix' :
                           venda.forma_pagamento === 'credito' ? 'Cartão' :
                           venda.forma_pagamento === 'debito' ? 'Débito' :
                           venda.forma_pagamento === 'folha' ? 'Desc. Folha' :
                           venda.forma_pagamento === 'dinheiro' ? 'Dinheiro' : 'Saldo'}
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-slate-300">
                        {venda.vendedor?.apelido || venda.vendedor?.nome || '—'}
                      </td>
                      <td className="p-3">
                        <Badge variant={venda.status === 'concluida' ? 'success' : 'error'}>
                          {venda.status === 'concluida' ? '✓' : 'Estornada'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalhes(venda)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      <ModalVendaDetalhes
        open={modalDetalhes}
        onClose={() => { setModalDetalhes(false); setVendaSelecionada(null); }}
        venda={vendaSelecionada}
        onEstornar={() => {
          setModalDetalhes(false);
          setModalEstorno(true);
        }}
      />

      <ModalEstorno
        open={modalEstorno}
        onClose={() => { setModalEstorno(false); setVendaSelecionada(null); }}
        onSuccess={() => {
          setModalEstorno(false);
          setVendaSelecionada(null);
          loadData();
        }}
        venda={vendaSelecionada}
      />
    </div>
  );
}
