'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, FileText, Calendar, TrendingUp, ShoppingCart, Loader2, Send, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Mapeamento de UUIDs para nomes de unidade
const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

interface ModalRelatorioVendasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string;
}

type TipoRelatorio = 'diario' | 'semanal' | 'mensal' | 'meta_fideliza';

const tiposRelatorio: { id: TipoRelatorio; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'diario', label: 'Relatório Diário', icon: <Calendar className="w-5 h-5" />, desc: 'Vendas do dia: produtos, valores, farmers' },
  { id: 'semanal', label: 'Relatório Semanal', icon: <FileText className="w-5 h-5" />, desc: 'Resumo da semana: total vendido, top produtos' },
  { id: 'mensal', label: 'Relatório Mensal', icon: <TrendingUp className="w-5 h-5" />, desc: 'Análise completa: vendas, comissões, estoque' },
  { id: 'meta_fideliza', label: 'Meta Fideliza+ Lojinha', icon: <ShoppingCart className="w-5 h-5" />, desc: 'Progresso da meta de vendas do Fideliza+' },
];

export function ModalRelatorioVendas({ open, onOpenChange, unidadeId }: ModalRelatorioVendasProps) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoRelatorio | null>(null);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  
  // Estado para período do relatório
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'ontem' | 'personalizado'>('ontem');
  const [relatorioData, setRelatorioData] = useState<Date>(new Date());

  const unidadeNome = UUID_NOME_MAP[unidadeId] || 'Consolidado';

  function resetModal() {
    setTipoSelecionado(null);
    setTextoRelatorio('');
    setCopiado(false);
  }

  async function gerarRelatorio(tipo: TipoRelatorio) {
    setLoading(true);
    setTipoSelecionado(tipo);

    try {
      // Calcular datas baseado no período
      let dataInicio: string;
      let dataFim: string;
      const hoje = new Date();
      
      if (relatorioPeriodo === 'ontem') {
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        dataInicio = ontem.toISOString().split('T')[0];
        dataFim = ontem.toISOString().split('T')[0];
      } else {
        dataInicio = relatorioData.toISOString().split('T')[0];
        dataFim = relatorioData.toISOString().split('T')[0];
      }

      // Ajustar período baseado no tipo
      if (tipo === 'semanal') {
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(inicioSemana.getDate() - 7);
        dataInicio = inicioSemana.toISOString().split('T')[0];
        dataFim = hoje.toISOString().split('T')[0];
      } else if (tipo === 'mensal' || tipo === 'meta_fideliza') {
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataInicio = inicioMes.toISOString().split('T')[0];
        dataFim = hoje.toISOString().split('T')[0];
      }

      // Chamar Edge Function
      const { data, error } = await supabase.functions.invoke('lojinha-relatorio-vendas', {
        body: {
          unidade_id: unidadeId === 'todos' ? null : unidadeId,
          tipo_relatorio: tipo,
          data_inicio: dataInicio,
          data_fim: dataFim,
        },
      });

      if (error) throw error;

      if (data?.relatorio) {
        setTextoRelatorio(data.relatorio);
      } else {
        throw new Error('Relatório não gerado');
      }
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório');
      setTextoRelatorio('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function copiarRelatorio() {
    try {
      await navigator.clipboard.writeText(textoRelatorio);
      setCopiado(true);
      toast.success('Relatório copiado!');
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  }

  async function enviarWhatsApp() {
    setEnviandoWhatsApp(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: textoRelatorio,
          tipo: 'lojinha_vendas',
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Relatório enviado via WhatsApp!');
      } else {
        throw new Error(data?.error || 'Erro ao enviar');
      }
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      toast.error('Erro ao enviar via WhatsApp');
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📊 Gerar Relatório de Vendas
            {unidadeNome !== 'Consolidado' && (
              <span className="text-sm font-normal text-slate-400">— {unidadeNome}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!tipoSelecionado ? (
          <div className="space-y-4">
            {/* Seleção de Período */}
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Período do Relatório:</p>
              <div className="flex gap-2">
                <Button
                  variant={relatorioPeriodo === 'ontem' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRelatorioPeriodo('ontem')}
                >
                  Ontem
                </Button>
                <Button
                  variant={relatorioPeriodo === 'personalizado' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRelatorioPeriodo('personalizado')}
                >
                  Personalizado
                </Button>
              </div>
              {relatorioPeriodo === 'personalizado' && (
                <div className="mt-2">
                  <DatePicker
                    date={relatorioData}
                    onDateChange={(date) => date && setRelatorioData(date)}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1">
                📅 {relatorioPeriodo === 'ontem' 
                  ? new Date(Date.now() - 86400000).toLocaleDateString('pt-BR')
                  : relatorioData.toLocaleDateString('pt-BR')
                }
              </p>
            </div>

            {/* Tipos de Relatório */}
            <div>
              <p className="text-sm font-medium text-slate-300 mb-2">Escolha o tipo de relatório:</p>
              <div className="space-y-2">
                {tiposRelatorio.map((tipo) => (
                  <button
                    key={tipo.id}
                    onClick={() => gerarRelatorio(tipo.id)}
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                      "border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:border-slate-600"
                    )}
                  >
                    <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                      {tipo.icon}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white">{tipo.label}</p>
                      <p className="text-xs text-slate-400">{tipo.desc}</p>
                    </div>
                    <span className="text-slate-500">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Botão Voltar */}
            <Button variant="ghost" size="sm" onClick={resetModal} className="text-slate-400">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>

            {/* Loading */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                <span className="ml-3 text-slate-400">Gerando relatório...</span>
              </div>
            ) : (
              <>
                {/* Textarea com relatório */}
                <Textarea
                  value={textoRelatorio}
                  onChange={(e) => setTextoRelatorio(e.target.value)}
                  className="min-h-[300px] font-mono text-sm bg-slate-900 border-slate-700"
                  placeholder="O relatório aparecerá aqui..."
                />

                {/* Botões de ação */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={copiarRelatorio}
                    className="flex-1"
                  >
                    {copiado ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                    {copiado ? 'Copiado!' : 'Copiar'}
                  </Button>
                  <Button
                    onClick={enviarWhatsApp}
                    disabled={enviandoWhatsApp || !textoRelatorio}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {enviandoWhatsApp ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Enviar WhatsApp
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
