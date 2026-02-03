'use client';

import React, { useState, useEffect } from 'react';
import { 
  Wallet, MessageCircle, CreditCard, Banknote, History
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { LojaCarteira, LojaCarteiraMovimentacao, Colaborador } from '@/types/lojinha';
import { ModalSaque } from './ModalSaque';
import { ModalUsarLoja } from './ModalUsarLoja';
import { ModalHistoricoCarteira } from './ModalHistoricoCarteira';

interface TabComissoesProps {
  unidadeId: string;
}

export function TabComissoes({ unidadeId }: TabComissoesProps) {
  const [loading, setLoading] = useState(true);
  const [carteirasFarmers, setCarteirasFarmers] = useState<LojaCarteira[]>([]);
  const [carteirasProfessores, setCarteirasProfessores] = useState<LojaCarteira[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<LojaCarteiraMovimentacao[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'farmers' | 'professores'>('todos');

  // Modais
  const [modalSaque, setModalSaque] = useState(false);
  const [modalUsarLoja, setModalUsarLoja] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);
  const [carteiraSelecionada, setCarteiraSelecionada] = useState<LojaCarteira | null>(null);

  useEffect(() => {
    loadData();
  }, [unidadeId]);

  async function loadData() {
    setLoading(true);
    try {
      // Carregar carteiras de farmers
      let farmersQuery = supabase
        .from('loja_carteira')
        .select(`
          *,
          colaboradores(id, nome, apelido, tipo, unidade_id, unidades(codigo, nome)),
          unidades(codigo, nome)
        `)
        .eq('tipo_titular', 'farmer');

      // Filtrar por unidade se não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        farmersQuery = farmersQuery.eq('unidade_id', unidadeId);
      }

      const { data: farmers } = await farmersQuery;
      setCarteirasFarmers(farmers || []);

      // Carregar carteiras de professores
      let professoresQuery = supabase
        .from('loja_carteira')
        .select(`
          *,
          professores(id, nome),
          unidades(codigo, nome)
        `)
        .eq('tipo_titular', 'professor');

      // Filtrar por unidade se não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        professoresQuery = professoresQuery.eq('unidade_id', unidadeId);
      }

      const { data: professores } = await professoresQuery;
      setCarteirasProfessores(professores || []);

      // Carregar movimentações recentes
      const { data: movs } = await supabase
        .from('loja_carteira_movimentacoes')
        .select(`
          *,
          loja_carteira(
            tipo_titular,
            colaboradores(nome, apelido),
            professores(nome)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      setMovimentacoes(movs || []);
    } catch (error) {
      console.error('Erro ao carregar comissões:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSaque(carteira: LojaCarteira) {
    setCarteiraSelecionada(carteira);
    setModalSaque(true);
  }

  function handleUsarLoja(carteira: LojaCarteira) {
    setCarteiraSelecionada(carteira);
    setModalUsarLoja(true);
  }

  function handleHistorico(carteira: LojaCarteira) {
    setCarteiraSelecionada(carteira);
    setModalHistorico(true);
  }

  async function handleEnviarRelatorio(carteira: LojaCarteira) {
    const nome = carteira.tipo_titular === 'farmer' 
      ? carteira.colaboradores?.apelido || carteira.colaboradores?.nome
      : carteira.professores?.nome;
    
    // Só professores podem receber relatório via WhatsApp (têm telefone_whatsapp cadastrado)
    if (carteira.tipo_titular !== 'professor' || !carteira.professor_id) {
      toast.error('Relatório WhatsApp disponível apenas para professores');
      return;
    }

    const toastId = toast.loading(`Enviando relatório para ${nome}...`);

    try {
      const { data, error } = await supabase.functions.invoke('lojinha-relatorio-professor', {
        body: {
          professor_id: carteira.professor_id,
          carteira_id: carteira.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`📱 Relatório enviado para ${nome}!`, { id: toastId });
      } else {
        toast.error(data?.error || 'Erro ao enviar relatório', { id: toastId });
      }
    } catch (error) {
      console.error('Erro ao enviar relatório:', error);
      toast.error('Erro ao enviar relatório. Verifique se o professor tem WhatsApp cadastrado.', { id: toastId });
    }
  }

  // Mapeamento de Farmers por unidade
  const FARMERS_POR_UNIDADE: Record<string, { nomes: string; detalhes: string }> = {
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { nomes: 'Gabi e Jhon', detalhes: 'Gabi R$38 • Jhon R$24' }, // Campo Grande
    '95553e96-971b-4590-a6eb-0201d013c14d': { nomes: 'Fefê e Dai', detalhes: 'Fefê R$35 • Dai R$27' }, // Recreio
    '368d47f5-2d88-4475-bc14-ba084a9a348e': { nomes: 'Duda e Arthur', detalhes: 'Duda R$38 • Arthur R$24' }, // Barra
  };

  // Obter detalhes dos farmers baseado na unidade selecionada
  const getFarmersDetalhes = () => {
    if (!unidadeId || unidadeId === 'todos') {
      // Consolidado: mostrar todos
      return 'Todas as unidades';
    }
    return FARMERS_POR_UNIDADE[unidadeId]?.detalhes || 'Farmers da unidade';
  };

  // KPIs
  const totalComissoesMes = 92; // TODO: calcular do banco
  const comissoesFarmers = 62;
  const comissoesProfessores = 30;
  const moedasLaCreditadas = 4;

  // Cores para avatares
  const coresFarmers = [
    'linear-gradient(135deg, #ec4899, #f97316)',
    'linear-gradient(135deg, #38bdf8, #8b5cf6)',
  ];
  const coresProfessores = [
    'linear-gradient(135deg, #fbbf24, #f59e0b)',
    'linear-gradient(135deg, #a78bfa, #7c3aed)',
    'linear-gradient(135deg, #34d399, #059669)',
  ];

  // Usar dados reais do banco (carteiras já criadas para todos os Farmers e Professores)
  const farmersParaExibir = carteirasFarmers;
  const professoresParaExibir = carteirasProfessores;

  // Dados de exemplo para histórico de movimentações (todas as unidades)
  const movimentacoesExemploCompleto = [
    // Barra
    { data: '02/02', titular: 'Duda', tipoTitular: 'farmer', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tipo: 'comissao_venda', tipoLabel: 'Comissão venda', badgeClass: 'bg-emerald-500/20 text-emerald-400', valor: 3.40, saldoApos: 138.50, referencia: 'Venda #47' },
    { data: '02/02', titular: 'Prof. Gabriel', tipoTitular: 'professor', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tipo: 'lalita', tipoLabel: 'Lalita', badgeClass: 'bg-amber-500/20 text-amber-400', valor: 30.00, saldoApos: 195.00, referencia: 'Matrícula Ana Clara' },
    { data: '01/02', titular: 'Prof. Léo', tipoTitular: 'professor', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tipo: 'comissao_indicacao', tipoLabel: 'Comissão indicação', badgeClass: 'bg-purple-500/20 text-purple-400', valor: 15.00, saldoApos: 60.00, referencia: 'Venda #45' },
    { data: '31/01', titular: 'Duda', tipoTitular: 'farmer', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tipo: 'compra_loja', tipoLabel: 'Compra loja', badgeClass: 'bg-amber-500/20 text-amber-400', valor: -25.00, saldoApos: 135.10, referencia: 'Compra pessoal' },
    { data: '30/01', titular: 'Arthur', tipoTitular: 'farmer', unidade_id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tipo: 'saque', tipoLabel: 'Saque', badgeClass: 'bg-sky-500/20 text-sky-400', valor: -50.00, saldoApos: 76.00, referencia: 'Desc. folha Jan' },
    // Campo Grande
    { data: '02/02', titular: 'Gabi', tipoTitular: 'farmer', unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tipo: 'comissao_venda', tipoLabel: 'Comissão venda', badgeClass: 'bg-emerald-500/20 text-emerald-400', valor: 5.20, saldoApos: 95.00, referencia: 'Venda #52' },
    { data: '01/02', titular: 'Prof. Marcelo', tipoTitular: 'professor', unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tipo: 'lalita', tipoLabel: 'Lalita', badgeClass: 'bg-amber-500/20 text-amber-400', valor: 30.00, saldoApos: 120.00, referencia: 'Matrícula Pedro' },
    { data: '31/01', titular: 'Jhon', tipoTitular: 'farmer', unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tipo: 'comissao_venda', tipoLabel: 'Comissão venda', badgeClass: 'bg-emerald-500/20 text-emerald-400', valor: 2.80, saldoApos: 42.50, referencia: 'Venda #48' },
    { data: '30/01', titular: 'Prof. Ana Paula', tipoTitular: 'professor', unidade_id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tipo: 'comissao_indicacao', tipoLabel: 'Comissão indicação', badgeClass: 'bg-purple-500/20 text-purple-400', valor: 10.00, saldoApos: 75.00, referencia: 'Venda #46' },
    // Recreio
    { data: '02/02', titular: 'Fefê', tipoTitular: 'farmer', unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d', tipo: 'comissao_venda', tipoLabel: 'Comissão venda', badgeClass: 'bg-emerald-500/20 text-emerald-400', valor: 4.50, saldoApos: 110.00, referencia: 'Venda #55' },
    { data: '01/02', titular: 'Prof. Ricardo', tipoTitular: 'professor', unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d', tipo: 'lalita', tipoLabel: 'Lalita', badgeClass: 'bg-amber-500/20 text-amber-400', valor: 30.00, saldoApos: 85.00, referencia: 'Matrícula Julia' },
    { data: '30/01', titular: 'Dai', tipoTitular: 'farmer', unidade_id: '95553e96-971b-4590-a6eb-0201d013c14d', tipo: 'saque', tipoLabel: 'Saque', badgeClass: 'bg-sky-500/20 text-sky-400', valor: -30.00, saldoApos: 65.00, referencia: 'Desc. folha Jan' },
  ];

  // Filtrar movimentações pela unidade e tipo selecionado
  const movimentacoesFiltradas = movimentacoesExemploCompleto.filter(mov => {
    // Filtrar por unidade
    if (unidadeId && unidadeId !== 'todos' && mov.unidade_id !== unidadeId) {
      return false;
    }
    // Filtrar por tipo
    if (filtroTipo === 'todos') return true;
    if (filtroTipo === 'farmers') return mov.tipoTitular === 'farmer';
    if (filtroTipo === 'professores') return mov.tipoTitular === 'professor';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium">Comissões Fev</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">R$ {totalComissoesMes}</p>
          <p className="text-xs text-slate-500 mt-1">Total distribuído</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium">Farmers</p>
          <p className="text-2xl font-bold text-sky-400 font-mono mt-1">R$ {comissoesFarmers}</p>
          <p className="text-xs text-slate-500 mt-1">{getFarmersDetalhes()}</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium">Professores</p>
          <p className="text-2xl font-bold text-purple-400 font-mono mt-1">R$ {comissoesProfessores}</p>
          <p className="text-xs text-slate-500 mt-1">2 indicações</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-medium">Lalitas</p>
          <p className="text-2xl font-bold text-amber-400 font-mono mt-1 flex items-center gap-1">
            <img src="/lalita.svg" alt="Lalita" className="w-5 h-5" />
            {moedasLaCreditadas}
          </p>
          <p className="text-xs text-slate-500 mt-1">R$ 120 creditados</p>
        </div>
      </div>

      {/* Carteiras Farmers */}
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          👩‍💼 Carteira Digital — Farmers
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {farmersParaExibir.map((c, i) => (
            <CarteiraCard
              key={c.id}
              nome={c.colaboradores?.apelido || c.colaboradores?.nome || ''}
              tipo="farmer"
              unidade={c.unidades?.nome || ''}
              info={i === 0 ? "15 vendas este mês" : "8 vendas este mês"}
              saldo={c.saldo}
              moedasLa={c.moedas_la}
              cor={coresFarmers[i % coresFarmers.length]}
              onSaque={() => handleSaque(c)}
              onUsarLoja={() => handleUsarLoja(c)}
              onHistorico={() => handleHistorico(c)}
            />
          ))}
        </div>
      </div>

      {/* Carteiras Professores */}
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
          🎓 Carteira Digital — Professores
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {professoresParaExibir.map((c, i) => {
            const instrumentos = ['Bateria', 'Teclado', 'Violão'];
            const comissoesExemplo = [45.00, 0, 30.00];
            return (
              <CarteiraCardProfessor
                key={c.id}
                nome={c.professores?.nome || ''}
                instrumento={instrumentos[i % instrumentos.length]}
                unidade={c.unidades?.nome || ''}
                saldo={c.saldo}
                moedasLa={c.moedas_la}
                comissoes={comissoesExemplo[i % comissoesExemplo.length]}
                cor={coresProfessores[i % coresProfessores.length]}
                onSaque={() => handleSaque(c)}
                onUsarLoja={() => handleUsarLoja(c)}
                onEnviarRelatorio={() => handleEnviarRelatorio(c)}
              />
            );
          })}
        </div>
      </div>

      {/* Histórico de Movimentações */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-white">📋 Histórico de Movimentações</h3>
          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="farmers">Farmers</SelectItem>
              <SelectItem value="professores">Professores</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900/50">
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Data</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Titular</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Tipo</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Valor</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Saldo Após</th>
                <th className="text-left p-3 text-xs font-semibold text-slate-400">Ref.</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoesFiltradas.map((mov, i) => (
                <tr key={i} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="p-3 font-mono text-xs text-slate-300">{mov.data}</td>
                  <td className="p-3 text-sm text-white">{mov.titular}</td>
                  <td className="p-3">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', mov.badgeClass)}>
                      {mov.tipoLabel}
                    </span>
                  </td>
                  <td className={cn('p-3 font-mono text-sm', mov.valor > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {mov.valor > 0 ? '+' : ''} R$ {Math.abs(mov.valor).toFixed(2).replace('.', ',')}
                  </td>
                  <td className="p-3 font-mono text-sm text-slate-300">R$ {mov.saldoApos.toFixed(2).replace('.', ',')}</td>
                  <td className="p-3 text-xs text-slate-400">{mov.referencia}</td>
                </tr>
              ))}
              {movimentacoesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Nenhuma movimentação encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais */}
      <ModalSaque
        open={modalSaque}
        onClose={() => { setModalSaque(false); setCarteiraSelecionada(null); }}
        onSuccess={() => { setModalSaque(false); loadData(); }}
        carteira={carteiraSelecionada}
      />

      <ModalUsarLoja
        open={modalUsarLoja}
        onClose={() => { setModalUsarLoja(false); setCarteiraSelecionada(null); }}
        onSuccess={() => { setModalUsarLoja(false); loadData(); }}
        carteira={carteiraSelecionada}
      />

      <ModalHistoricoCarteira
        open={modalHistorico}
        onClose={() => { setModalHistorico(false); setCarteiraSelecionada(null); }}
        carteira={carteiraSelecionada}
      />
    </div>
  );
}

// Componente de Card de Carteira (Farmer)
interface CarteiraCardProps {
  nome: string;
  tipo: 'farmer' | 'professor';
  unidade: string;
  info: string;
  saldo: number;
  moedasLa: number;
  cor: string;
  onSaque: () => void;
  onUsarLoja: () => void;
  onHistorico: () => void;
}

function CarteiraCard({ nome, tipo, unidade, info, saldo, moedasLa, cor, onSaque, onUsarLoja, onHistorico }: CarteiraCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div 
          className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg"
          style={{ background: cor }}
        >
          {nome.charAt(0).toUpperCase()}
        </div>
        <div>
          <h4 className="font-semibold text-white">{nome}</h4>
          <p className="text-xs text-slate-400">{unidade} • {info}</p>
        </div>
      </div>
      <p className="text-3xl font-bold text-emerald-400 font-mono">
        R$ {saldo.toFixed(2).replace('.', ',')}
      </p>
      <p className="text-xs text-slate-400 mt-1 mb-4">
        Saldo disponível para saque ou uso na loja
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onUsarLoja}>
          💳 Usar na Loja
        </Button>
        <Button variant="outline" size="sm" onClick={onSaque}>
          💸 Registrar Saque
        </Button>
        <Button variant="outline" size="sm" onClick={onHistorico}>
          📋 Histórico
        </Button>
      </div>
    </div>
  );
}

// Componente de Card de Carteira (Professor)
interface CarteiraCardProfessorProps {
  nome: string;
  instrumento: string;
  unidade: string;
  saldo: number;
  moedasLa: number;
  comissoes: number;
  cor: string;
  onSaque: () => void;
  onUsarLoja: () => void;
  onEnviarRelatorio: () => void;
}

function CarteiraCardProfessor({ nome, instrumento, unidade, saldo, moedasLa, comissoes, cor, onSaque, onUsarLoja, onEnviarRelatorio }: CarteiraCardProfessorProps) {
  const valorMoedasLa = moedasLa * 30; // R$ 30 por moeda
  
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5" style={{ borderLeftWidth: '3px', borderLeftColor: cor.includes('fbbf24') ? '#fbbf24' : cor.includes('a78bfa') ? '#a78bfa' : '#34d399' }}>
      <div className="flex items-center gap-3 mb-4">
        <div 
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg"
          style={{ background: cor, color: cor.includes('fbbf24') ? '#0b0f19' : '#fff' }}
        >
          {nome.split(' ').pop()?.charAt(0).toUpperCase() || 'P'}
        </div>
        <div>
          <h4 className="font-semibold text-white">{nome}</h4>
          <p className="text-xs text-slate-400">{unidade} {instrumento && `• ${instrumento}`}</p>
        </div>
      </div>
      <p className="text-3xl font-bold text-emerald-400 font-mono">
        R$ {saldo.toFixed(2).replace('.', ',')}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        Comissões: R$ {comissoes.toFixed(2).replace('.', ',')} • Lalitas: <img src="/lalita.svg" alt="Lalita" className="inline w-3 h-3 mx-0.5" /> {moedasLa} (R$ {valorMoedasLa.toFixed(2).replace('.', ',')})
      </p>
      
      {moedasLa > 0 && (
        <div className="flex items-center gap-2 mt-3 mb-3">
          <img src="/lalita.svg" alt="Lalita" className="w-5 h-5" />
          <span className="font-mono text-sm font-bold text-amber-400">{moedasLa} Lalitas</span>
          <span className="text-xs text-slate-400">({moedasLa} matrículas convertidas)</span>
        </div>
      )}
      
      <div className="flex gap-2 mt-4">
        <Button size="sm" onClick={onUsarLoja}>
          💳 Usar na Loja
        </Button>
        <Button variant="outline" size="sm" onClick={onSaque}>
          💸 Saque
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onEnviarRelatorio}
          className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
        >
          📱 Enviar Relatório
        </Button>
      </div>
    </div>
  );
}
