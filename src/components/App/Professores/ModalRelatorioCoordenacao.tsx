'use client';

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  Copy, 
  Check, 
  Loader2, 
  Sparkles,
  Users,
  Trophy,
  AlertTriangle,
  Send
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';

interface ModalRelatorioCoordenacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string | null;
  unidadeNome: string;
  ano: number;
  mes: number;
}

type TipoRelatorio = 'mensal' | 'ranking';

export function ModalRelatorioCoordenacao({
  open,
  onOpenChange,
  unidadeId,
  unidadeNome,
  ano,
  mes
}: ModalRelatorioCoordenacaoProps) {
  const toast = useToast();
  const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorio | null>(null);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);

  const mesesPorExtenso: Record<number, string> = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
  };

  const gerarRelatorioIA = async (tipo: TipoRelatorio) => {
    setTipoRelatorio(tipo);
    setLoadingIA(true);
    setTextoRelatorio('');

    try {
      // Buscar dados via função SQL
      const { data: dadosRelatorio, error: errorDados } = await supabase
        .rpc('get_dados_relatorio_coordenacao', {
          p_unidade_id: unidadeId,
          p_ano: ano,
          p_mes: mes
        });

      if (errorDados) {
        console.error('Erro ao buscar dados:', errorDados);
        throw new Error('Erro ao buscar dados do relatório');
      }

      // Escolher Edge Function baseado no tipo de relatório
      const edgeFunctionName = tipo === 'ranking' 
        ? 'gemini-ranking-professores' 
        : 'gemini-relatorio-coordenacao';

      // Chamar Edge Function
      const { data: responseIA, error: errorIA } = await supabase.functions.invoke(
        edgeFunctionName,
        {
          body: {
            dados: dadosRelatorio,
            tipo: tipo
          }
        }
      );

      if (errorIA) {
        console.error('Erro na Edge Function:', errorIA);
        throw new Error('Erro ao gerar relatório com IA');
      }

      if (responseIA?.success && responseIA?.relatorio) {
        setTextoRelatorio(responseIA.relatorio);
        const mensagem = tipo === 'ranking' 
          ? 'Ranking de professores gerado com sucesso'
          : 'Relatório de coordenação gerado com sucesso';
        toast.success('Relatório gerado!', mensagem);
      } else {
        throw new Error(responseIA?.error || 'Erro desconhecido');
      }

    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro', error instanceof Error ? error.message : 'Erro ao gerar relatório');
    } finally {
      setLoadingIA(false);
    }
  };

  const copiarRelatorio = async () => {
    if (!textoRelatorio) return;

    try {
      // Método 1: execCommand com textarea visível (mais compatível com IDEs)
      const textarea = document.createElement('textarea');
      textarea.value = textoRelatorio;
      textarea.style.position = 'absolute';
      textarea.style.left = '0';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      // Forçar foco e seleção
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textoRelatorio.length);
      
      let success = false;
      try {
        success = document.execCommand('copy');
      } catch (e) {
        console.error('execCommand falhou:', e);
      }
      
      document.body.removeChild(textarea);
      
      if (success) {
        setCopiado(true);
        toast.success('Copiado!', 'Relatório copiado para a área de transferência');
        setTimeout(() => setCopiado(false), 2000);
        return;
      }
      
      // Método 2: Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textoRelatorio);
        setCopiado(true);
        toast.success('Copiado!', 'Relatório copiado para a área de transferência');
        setTimeout(() => setCopiado(false), 2000);
        return;
      }
      
      // Método 3: Fallback com prompt
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const tecla = isMac ? '⌘+C' : 'Ctrl+C';
      toast.info('Copie manualmente', `Selecione o texto e pressione ${tecla}`);
      
    } catch (error) {
      console.error('Erro ao copiar:', error);
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const tecla = isMac ? '⌘+C' : 'Ctrl+C';
      toast.error('Erro ao copiar', `Selecione o texto manualmente e pressione ${tecla}`);
    }
  };

  const resetarModal = () => {
    setTipoRelatorio(null);
    setTextoRelatorio('');
    setCopiado(false);
    setEnviadoWhatsApp(false);
    setErroWhatsApp(null);
  };

  const enviarWhatsAppGrupo = async () => {
    if (!textoRelatorio || enviandoWhatsApp) return;
    
    setEnviandoWhatsApp(true);
    setErroWhatsApp(null);
    setEnviadoWhatsApp(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-coordenacao-whatsapp', {
        body: {
          texto: textoRelatorio,
          tipoRelatorio: tipoRelatorio,
          unidadeNome: unidadeNome,
          competencia: `${ano}-${String(mes).padStart(2, '0')}`,
        },
      });
      
      if (error) {
        console.error('[WhatsApp Coordenação] Erro ao enviar:', error);
        setErroWhatsApp('Erro ao enviar mensagem');
        toast.error('Erro', 'Não foi possível enviar para o grupo');
        return;
      }
      
      if (data?.success) {
        console.log('[WhatsApp Coordenação] ✅ Mensagem enviada!', data);
        setEnviadoWhatsApp(true);
        toast.success('Enviado!', 'Relatório enviado para o grupo da Coordenação');
        setTimeout(() => setEnviadoWhatsApp(false), 3000);
      } else {
        setErroWhatsApp(data?.error || 'Erro desconhecido');
        toast.error('Erro', data?.error || 'Erro ao enviar');
      }
    } catch (err) {
      console.error('[WhatsApp Coordenação] Erro inesperado:', err);
      setErroWhatsApp('Erro de conexão');
      toast.error('Erro', 'Erro de conexão');
    } finally {
      setEnviandoWhatsApp(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetarModal();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-violet-400" />
            Relatório Coordenação Pedagógica
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {unidadeNome} • {mesesPorExtenso[mes]}/{ano}
          </DialogDescription>
        </DialogHeader>

        {/* Seleção de tipo de relatório */}
        {!tipoRelatorio && !loadingIA && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-6">
            <button
              onClick={() => gerarRelatorioIA('mensal')}
              className="group p-6 rounded-xl border-2 border-slate-700 hover:border-violet-500/50 bg-slate-800/50 hover:bg-slate-800 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                  <Sparkles className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Relatório Mensal com IA</h3>
                  <p className="text-xs text-slate-400">Análise completa da equipe</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Visão geral da equipe, KPIs consolidados, rankings, professores em alerta, 
                sugestões de treinamento e plano de ação gerado por IA.
              </p>
            </button>

            <button
              onClick={() => gerarRelatorioIA('ranking')}
              className="group p-6 rounded-xl border-2 border-slate-700 hover:border-amber-500/50 bg-slate-800/50 hover:bg-slate-800 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                  <Trophy className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Ranking de Professores</h3>
                  <p className="text-xs text-slate-400">Comparativo e destaques</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Rankings detalhados por carteira, retenção, presença, conversão e 
                média de alunos por turma. Ideal para reuniões de equipe.
              </p>
            </button>
          </div>
        )}

        {/* Loading */}
        {loadingIA && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">Gerando relatório com IA...</p>
              <p className="text-sm text-slate-400 mt-1">Analisando dados da equipe pedagógica</p>
            </div>
          </div>
        )}

        {/* Relatório gerado */}
        {textoRelatorio && !loadingIA && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Área do texto */}
            <div className="flex-1 overflow-auto">
              <textarea
                value={textoRelatorio}
                onChange={(e) => setTextoRelatorio(e.target.value)}
                className="w-full h-full min-h-[400px] p-4 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                placeholder="Relatório será exibido aqui..."
              />
            </div>

            {/* Botões de ação */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-700">
              <Button
                variant="outline"
                onClick={resetarModal}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Voltar
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => gerarRelatorioIA(tipoRelatorio || 'mensal')}
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerar
                </Button>

                <Button
                  onClick={copiarRelatorio}
                  disabled={!textoRelatorio}
                  className={`min-w-[140px] ${
                    copiado 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : 'bg-violet-600 hover:bg-violet-700'
                  }`}
                >
                  {copiado ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar
                    </>
                  )}
                </Button>

                <Button
                  onClick={enviarWhatsAppGrupo}
                  disabled={!textoRelatorio || enviandoWhatsApp}
                  className={`min-w-[140px] ${
                    enviadoWhatsApp 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : erroWhatsApp
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {enviandoWhatsApp ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : enviadoWhatsApp ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Enviado!
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      WhatsApp
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
