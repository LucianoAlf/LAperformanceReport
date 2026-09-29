'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Search, AlertTriangle, MessageCircle, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LojaEstoque, LojaMovimentacaoEstoque, AlertaEstoque } from '@/types/lojinha';
import { ModalEntradaLote } from './ModalEntradaLote';
import { agruparEstoque, filtrarEstoquePorBusca, tituloDaUnidade } from '@/lib/lojinhaEstoque';

interface TabEstoqueProps {
  unidadeId: string;
}

export function TabEstoque({ unidadeId }: TabEstoqueProps) {
  const [loading, setLoading] = useState(true);
  const [alertas, setAlertas] = useState<AlertaEstoque[]>([]);
  const [estoque, setEstoque] = useState<any[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<LojaMovimentacaoEstoque[]>([]);
  const [busca, setBusca] = useState('');
  const [nomeUnidade, setNomeUnidade] = useState<string | null>(null);
  const [modalEntradaLote, setModalEntradaLote] = useState(false);

  useEffect(() => {
    loadData();
  }, [unidadeId]);

  async function loadData() {
    setLoading(true);
    try {
      // O nome da unidade vai no titulo da tabela. Ate 29/09/2026 ele estava
      // escrito fixo ("Barra"), e quem estava em Campo Grande lia Barra.
      if (unidadeId && unidadeId !== 'todos') {
        const { data: unidade, error: erroUnidade } = await supabase
          .from('unidades')
          .select('nome')
          .eq('id', unidadeId)
          .maybeSingle();
        if (erroUnidade) {
          console.error(`[TabEstoque] nome da unidade ${unidadeId}:`, erroUnidade.message);
        }
        setNomeUnidade(unidade?.nome ?? null);
      } else {
        setNomeUnidade(null);
      }

      // Carregar estoque com produtos
      let estoqueQuery = supabase
        .from('loja_estoque')
        .select(`
          *,
          loja_produtos(id, nome, estoque_minimo, loja_categorias(nome, icone)),
          loja_variacoes(id, nome),
          unidades(codigo, nome)
        `);

      // Filtrar por unidade se não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        estoqueQuery = estoqueQuery.eq('unidade_id', unidadeId);
      }

      const { data: estoqueData } = await estoqueQuery.order('loja_produtos(nome)');
      setEstoque(estoqueData || []);

      // Identificar alertas
      const alertasTemp: AlertaEstoque[] = [];
      for (const e of estoqueData || []) {
        const minimo = e.loja_produtos?.estoque_minimo || 5;
        if (e.quantidade < minimo) {
          alertasTemp.push({
            produto_id: e.produto_id,
            variacao_id: e.variacao_id,
            produto_nome: e.loja_produtos?.nome || '',
            variacao_nome: e.loja_variacoes?.nome || null,
            categoria_nome: e.loja_produtos?.loja_categorias?.nome || '',
            quantidade_atual: e.quantidade,
            estoque_minimo: minimo,
            nivel: e.quantidade === 0 ? 'zerado' : e.quantidade < minimo / 2 ? 'critico' : 'atencao',
          });
        }
      }
      setAlertas(alertasTemp.sort((a, b) => a.quantidade_atual - b.quantidade_atual));

      // Carregar movimentações recentes
      let movQuery = supabase
        .from('loja_movimentacoes_estoque')
        .select(`
          *,
          loja_produtos(nome),
          loja_variacoes(nome),
          colaboradores(nome, apelido)
        `);

      // Filtrar por unidade se não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        movQuery = movQuery.eq('unidade_id', unidadeId);
      }

      const { data: movData } = await movQuery
        .order('created_at', { ascending: false })
        .limit(20);

      setMovimentacoes(movData || []);
    } catch (error) {
      console.error('Erro ao carregar estoque:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleEnviarAlerta(alerta: AlertaEstoque) {
    const toastId = toast.loading('Enviando alerta...');

    try {
      const { data, error } = await supabase.functions.invoke('lojinha-alerta-estoque', {
        body: {
          unidade_id: unidadeId,
          produtos: [{
            nome: alerta.produto_nome,
            variacao: alerta.variacao_nome,
            estoque_atual: alerta.quantidade_atual,
            estoque_minimo: alerta.estoque_minimo,
          }],
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`📱 Alerta enviado para ${data.responsavel}!`, { id: toastId });
      } else {
        toast.error(data?.error || 'Erro ao enviar alerta', { id: toastId });
      }
    } catch (error) {
      console.error('Erro ao enviar alerta:', error);
      toast.error('Erro ao enviar alerta. Verifique se há responsável cadastrado.', { id: toastId });
    }
  }

  async function handleEnviarTodosAlertas() {
    if (alertas.length === 0) {
      toast.info('Nenhum produto com estoque baixo');
      return;
    }

    const toastId = toast.loading(`Enviando alerta com ${alertas.length} produtos...`);

    try {
      const produtos = alertas.map(a => ({
        nome: a.produto_nome,
        variacao: a.variacao_nome,
        estoque_atual: a.quantidade_atual,
        estoque_minimo: a.estoque_minimo,
      }));

      const { data, error } = await supabase.functions.invoke('lojinha-alerta-estoque', {
        body: {
          unidade_id: unidadeId,
          produtos,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`📱 Alerta com ${alertas.length} produtos enviado para ${data.responsavel}!`, { id: toastId });
      } else {
        toast.error(data?.error || 'Erro ao enviar alerta', { id: toastId });
      }
    } catch (error) {
      console.error('Erro ao enviar alertas:', error);
      toast.error('Erro ao enviar alertas. Verifique se há responsável cadastrado.', { id: toastId });
    }
  }

  // Agrupar estoque por produto — a regra mora em `@/lib/lojinhaEstoque`,
  // a mesma que o celular le.
  const estoqueAgrupado = agruparEstoque(estoque);
  // 🔴 A caixa "Buscar..." guardava o texto e nao filtrava nada ate 29/09/2026.
  const estoqueLista = filtrarEstoquePorBusca(estoqueAgrupado, busca);

  return (
    <div className="space-y-6">
      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Alertas de Reposição
          </h3>

          {alertas.slice(0, 5).map((alerta, i) => (
            <div 
              key={i}
              className={cn(
                'bg-slate-800/50 border rounded-xl p-4 flex items-center gap-4',
                alerta.nivel === 'zerado' ? 'border-rose-500/50' :
                alerta.nivel === 'critico' ? 'border-rose-500/30' : 'border-amber-500/30'
              )}
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: alerta.nivel === 'zerado' ? 'rgb(244 63 94)' :
                                 alerta.nivel === 'critico' ? 'rgb(248 113 113)' : 'rgb(251 191 36)'
              }}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
                alerta.nivel === 'zerado' ? 'bg-rose-500/20' :
                alerta.nivel === 'critico' ? 'bg-rose-500/10' : 'bg-amber-500/10'
              )}>
                {alerta.nivel === 'zerado' ? '⚫' : alerta.nivel === 'critico' ? '🔴' : '🟡'}
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-white">
                  {alerta.produto_nome}
                  {alerta.variacao_nome && <span className="text-slate-400 font-normal"> — {alerta.variacao_nome}</span>}
                </h4>
                <p className="text-sm text-slate-400">
                  Estoque: <strong className={alerta.nivel === 'zerado' || alerta.nivel === 'critico' ? 'text-rose-400' : 'text-amber-400'}>
                    {alerta.quantidade_atual} unidades
                  </strong> (mínimo: {alerta.estoque_minimo}) — {alerta.categoria_nome}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleEnviarAlerta(alerta)}
                className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                variant="outline"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                Alertar
              </Button>
            </div>
          ))}

          {alertas.length > 0 && (
            <div className="text-right">
              <Button
                onClick={handleEnviarTodosAlertas}
                className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                variant="outline"
              >
                <MessageCircle className="w-4 h-4 mr-1" />
                Disparar Todos os Alertas ({alertas.length})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tabela de Estoque */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Estoque — {tituloDaUnidade(unidadeId, nomeUnidade)}
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setModalEntradaLote(true)}>
              <Download className="w-4 h-4 mr-1" />
              Entrada Lote
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left p-3 text-xs font-semibold text-slate-400"></th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Produto</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Variação</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Estoque</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Mínimo</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Status</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Última Mov.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Carregando...
                  </td>
                </tr>
              ) : estoqueLista.length === 0 && busca.trim() ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhum produto ou variação com “{busca.trim()}”.
                  </td>
                </tr>
              ) : (
                estoqueLista.map((grupo: any) => (
                  grupo.variacoes.map((v: any, i: number) => (
                    <tr key={`${grupo.produto_id}-${v.variacao_id}`} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-3">
                        {i === 0 && (
                          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-lg">
                            {grupo.icone}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-sm text-white">
                        {i === 0 ? grupo.produto_nome : ''}
                      </td>
                      <td className="p-3 text-sm text-slate-300">
                        {v.variacao_nome || '—'}
                      </td>
                      <td className={cn(
                        'p-3 font-mono text-sm',
                        v.quantidade === 0 ? 'text-rose-400' :
                        v.quantidade < v.minimo ? 'text-amber-400' : 'text-slate-300'
                      )}>
                        {v.quantidade}
                      </td>
                      <td className="p-3 font-mono text-sm text-slate-400">
                        {v.minimo}
                      </td>
                      <td className="p-3">
                        <Badge 
                          variant={v.quantidade === 0 ? 'error' : v.quantidade < v.minimo ? 'warning' : 'success'}
                          className={cn(
                            v.quantidade === 0 && 'bg-rose-500/20 text-rose-400',
                            v.quantidade > 0 && v.quantidade < v.minimo && 'bg-amber-500/20 text-amber-400',
                            v.quantidade >= v.minimo && 'bg-emerald-500/20 text-emerald-400'
                          )}
                        >
                          {v.quantidade === 0 ? '⚫ Zerado' : 
                           v.quantidade < v.minimo ? '🟡 Atenção' : '🟢 OK'}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-slate-400">
                        {v.ultima_mov ? new Date(v.ultima_mov).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  ))
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movimentações Recentes */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">📋 Movimentações Recentes</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Data</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Produto</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Tipo</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Qtd</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Saldo</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Por</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((mov) => (
                <tr key={mov.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="p-3 font-mono text-xs text-slate-300">
                    {new Date(mov.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-3 text-sm text-white">
                    {mov.loja_produtos?.nome || '—'}
                    {mov.loja_variacoes?.nome && <span className="text-slate-400"> ({mov.loja_variacoes.nome})</span>}
                  </td>
                  <td className="p-3">
                    <Badge 
                      variant={mov.tipo === 'entrada' ? 'success' : mov.tipo === 'venda' ? 'error' : 'warning'}
                      className={cn(
                        mov.tipo === 'entrada' && 'bg-emerald-500/20 text-emerald-400',
                        mov.tipo === 'venda' && 'bg-rose-500/20 text-rose-400',
                        mov.tipo === 'estorno' && 'bg-amber-500/20 text-amber-400'
                      )}
                    >
                      {mov.tipo === 'entrada' ? 'Entrada' : 
                       mov.tipo === 'venda' ? 'Venda' : 
                       mov.tipo === 'estorno' ? 'Estorno' : 'Ajuste'}
                    </Badge>
                  </td>
                  <td className={cn(
                    'p-3 font-mono text-sm',
                    mov.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {mov.quantidade > 0 ? '+' : ''}{mov.quantidade}
                  </td>
                  <td className="p-3 font-mono text-sm text-slate-300">
                    {mov.saldo_apos}
                  </td>
                  <td className="p-3 text-sm text-slate-300">
                    {mov.colaboradores?.apelido || mov.colaboradores?.nome || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Entrada Lote */}
      <ModalEntradaLote
        open={modalEntradaLote}
        onClose={() => setModalEntradaLote(false)}
        onSuccess={() => { setModalEntradaLote(false); loadData(); }}
        unidadeId={unidadeId}
      />
    </div>
  );
}
