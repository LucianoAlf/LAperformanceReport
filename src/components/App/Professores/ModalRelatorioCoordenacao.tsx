'use client';

import { useEffect, useMemo, useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { 
  FileText, 
  Copy, 
  Check, 
  Loader2, 
  Sparkles,
  Calendar,
  Trophy,
  Activity,
  BriefcaseBusiness,
  ShieldAlert,
  Send,
  TriangleAlert,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { copyTextToClipboard, getManualCopyShortcut } from '@/lib/clipboard';
import {
  gerarRelatorioCoordenacaoCanonico,
  type RelatorioCoordenacaoCanonicoV2,
  type TipoRelatorioCoordenacaoCanonico,
} from '@/lib/relatorioCoordenacaoCanonico';
import { getHealthScoreV3Period } from '@/lib/healthScoreProfessorV3Periodos';

interface ModalRelatorioCoordenacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: string | null;
  unidadeNome: string;
  ano: number;
  mes: number;
  periodicidade: 'mensal' | 'ciclo';
}

type TipoRelatorio = 'mensal' | TipoRelatorioCoordenacaoCanonico;
type ModoPeriodo = 'mes_anterior' | 'competencia_tela' | 'personalizado';
type DocumentoRelatorioV4 = RelatorioCoordenacaoCanonicoV2 & {
  schema_version: 4;
  documento: NonNullable<RelatorioCoordenacaoCanonicoV2['documento']>;
};

function inicioMes(ano: number, mes: number): Date {
  return new Date(ano, mes - 1, 1);
}

function fimMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 0);
}

function competenciaAnteriorHoje() {
  const hoje = new Date();
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return {
    ano: anterior.getFullYear(),
    mes: anterior.getMonth() + 1,
  };
}

function deveAbrirMesAnterior(
  anoTela: number,
  mesTela: number,
  periodicidade: 'mensal' | 'ciclo',
): boolean {
  if (periodicidade !== 'mensal') return false;
  const hoje = new Date();
  const telaEhMesAtual = anoTela === hoje.getFullYear() && mesTela === hoje.getMonth() + 1;
  return telaEhMesAtual && hoje.getDate() <= 10;
}

export function ModalRelatorioCoordenacao({
  open,
  onOpenChange,
  unidadeId,
  unidadeNome,
  ano,
  mes,
  periodicidade,
}: ModalRelatorioCoordenacaoProps) {
  const toast = useToast();
  const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorio | null>(null);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);
  const [numeroTeste, setNumeroTeste] = useState('');
  const [documentoCarregado, setDocumentoCarregado] = useState<{
    chave: string;
    documento: DocumentoRelatorioV4;
  } | null>(null);
  const { usuario } = useAuth();

  const mesesPorExtenso: Record<number, string> = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
  };

  const competenciaInicial = useMemo(() => {
    return deveAbrirMesAnterior(ano, mes, periodicidade)
      ? competenciaAnteriorHoje()
      : { ano, mes };
  }, [ano, mes, periodicidade]);

  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>(
    deveAbrirMesAnterior(ano, mes, periodicidade) ? 'mes_anterior' : 'competencia_tela'
  );
  const [dataInicio, setDataInicio] = useState<Date>(() => inicioMes(competenciaInicial.ano, competenciaInicial.mes));
  const [dataFim, setDataFim] = useState<Date>(() => fimMes(competenciaInicial.ano, competenciaInicial.mes));

  useEffect(() => {
    if (!open) return;

    const abrirMesAnterior = deveAbrirMesAnterior(ano, mes, periodicidade);
    const proximaCompetencia = abrirMesAnterior ? competenciaAnteriorHoje() : { ano, mes };

    setModoPeriodo(abrirMesAnterior ? 'mes_anterior' : 'competencia_tela');
    setDataInicio(inicioMes(proximaCompetencia.ano, proximaCompetencia.mes));
    setDataFim(fimMes(proximaCompetencia.ano, proximaCompetencia.mes));
    setDocumentoCarregado(null);
    setErroRelatorio(null);
  }, [ano, mes, open, periodicidade]);

  const periodoSelecionado = useMemo(() => {
    const mesmoMes = dataInicio.getFullYear() === dataFim.getFullYear()
      && dataInicio.getMonth() === dataFim.getMonth();

    const mesSelecionado = dataInicio.getMonth() + 1;
    const periodoCanonico = getHealthScoreV3Period(
      dataInicio.getFullYear(),
      mesSelecionado,
      periodicidade,
    );

    return {
      ano: dataInicio.getFullYear(),
      mes: mesSelecionado,
      mesmoMes,
      label: periodicidade === 'ciclo'
        ? periodoCanonico.label
        : `${mesesPorExtenso[mesSelecionado]}/${dataInicio.getFullYear()}`,
      intervalo: periodicidade === 'ciclo'
        ? `${new Date(`${periodoCanonico.inicio}T12:00:00`).toLocaleDateString('pt-BR')} até ${new Date(`${periodoCanonico.fim}T12:00:00`).toLocaleDateString('pt-BR')}`
        : dataInicio.toLocaleDateString('pt-BR') === dataFim.toLocaleDateString('pt-BR')
          ? dataInicio.toLocaleDateString('pt-BR')
          : `${dataInicio.toLocaleDateString('pt-BR')} ate ${dataFim.toLocaleDateString('pt-BR')}`,
    };
  }, [dataFim, dataInicio, mesesPorExtenso, periodicidade]);

  const selecionarPeriodo = (modo: ModoPeriodo) => {
    setModoPeriodo(modo);
    setDocumentoCarregado(null);

    if (modo === 'mes_anterior') {
      const competencia = competenciaAnteriorHoje();
      setDataInicio(inicioMes(competencia.ano, competencia.mes));
      setDataFim(fimMes(competencia.ano, competencia.mes));
      return;
    }

    if (modo === 'competencia_tela') {
      setDataInicio(inicioMes(ano, mes));
      setDataFim(fimMes(ano, mes));
      return;
    }

    // Personalizado preserva a competencia ja selecionada e apenas libera os date pickers.
  };

  const validarCompetenciaMensal = () => {
    if (!periodoSelecionado.mesmoMes) {
      throw new Error('O relatorio pedagogico mensal precisa ficar dentro de uma unica competencia.');
    }

    // A tabela pode chegar ao ciclo a partir de qualquer um dos seus meses.
    // O documento usa sempre o inicio do ciclo, inclusive dez do ano anterior.
    const periodoDocumento = getHealthScoreV3Period(
      periodoSelecionado.ano,
      periodoSelecionado.mes,
      periodicidade,
    );
    return {
      anoRelatorio: Number(periodoDocumento.inicio.slice(0, 4)),
      mesRelatorio: Number(periodoDocumento.inicio.slice(5, 7)),
    };
  };

  const obterDocumento = async (
    anoRelatorio: number,
    mesRelatorio: number,
  ): Promise<DocumentoRelatorioV4> => {
    const chave = [
      unidadeId || 'consolidado',
      anoRelatorio,
      mesRelatorio,
      periodicidade,
    ].join(':');
    if (documentoCarregado?.chave === chave) return documentoCarregado.documento;

    const { data, error } = await supabase.rpc('get_relatorio_coordenacao_documento_v4', {
      p_unidade_id: unidadeId,
      p_ano: anoRelatorio,
      p_mes: mesRelatorio,
      p_periodicidade: periodicidade,
    });
    if (error) {
      console.error('Erro ao consultar os dados da Coordenação:', error);
      throw new Error('Não foi possível reunir os dados da Coordenação deste período.');
    }

    const documento = data as unknown as DocumentoRelatorioV4;
    if (
      documento?.schema_version !== 4
      || !documento.documento?.id
      || !Array.isArray(documento.professores)
    ) {
      throw new Error('Os dados da Coordenação estão incompletos para este período.');
    }
    setDocumentoCarregado({ chave, documento });
    return documento;
  };

  const gerarRelatorioIA = async () => {
    const tipo: TipoRelatorio = 'mensal';
    setTipoRelatorio(tipo);
    setLoadingIA(true);
    setTextoRelatorio('');
    setErroRelatorio(null);

    try {
      const { anoRelatorio, mesRelatorio } = validarCompetenciaMensal();
      const documento = await obterDocumento(anoRelatorio, mesRelatorio);

      // Edge Function apenas para o relatório mensal narrativo com IA.
      const edgeFunctionName = 'gemini-relatorio-coordenacao';

      // Chamar Edge Function
      const { data: responseIA, error: errorIA } = await supabase.functions.invoke(
        edgeFunctionName,
        {
          body: {
            unidade: unidadeId,
            ano: anoRelatorio,
            mes: mesRelatorio,
            periodicidade,
            documento_id: documento.documento.id,
          }
        }
      );

      if (errorIA) {
        console.error('Erro na Edge Function:', errorIA);
        // Extrair detalhe e origem do corpo da resposta de erro (status non-2xx)
        let detalhe = errorIA.message || 'Erro ao gerar relatório com IA';
        let origem = '';
        try {
          const corpo = await (errorIA as any).context?.json?.();
          if (corpo?.error) detalhe = corpo.error;
          if (corpo?.origem) origem = corpo.origem;
        } catch { /* corpo não-JSON, mantém mensagem padrão */ }
        const origemLabel: Record<string, string> = {
          api_gemini: 'API Gemini',
          api_openai: 'API OpenAI',
          config: 'Configuração',
          interno: 'Interno',
        };
        const prefixo = origem ? `[${origemLabel[origem] || origem}] ` : '';
        throw new Error(`${prefixo}${detalhe}`);
      }

      if (responseIA?.success && responseIA?.relatorio) {
        if (responseIA.documento_id !== documento.documento.id) {
          throw new Error('O relatório retornou uma versão diferente da selecionada. Tente novamente.');
        }
        setTextoRelatorio(responseIA.relatorio);
        toast.success('Relatório gerado!', 'Relatório de coordenação gerado com sucesso');
      } else {
        throw new Error(responseIA?.error || 'Erro desconhecido');
      }

    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      const mensagem = error instanceof Error ? error.message : 'Erro ao gerar relatório';
      setErroRelatorio(mensagem);
      toast.error('Erro', mensagem);
    } finally {
      setLoadingIA(false);
    }
  };

  const gerarRelatorioInstantaneo = async (tipo: TipoRelatorioCoordenacaoCanonico) => {
    setTipoRelatorio(tipo);
    setLoadingIA(true);
    setTextoRelatorio('');
    setErroRelatorio(null);

    try {
      const { anoRelatorio, mesRelatorio } = validarCompetenciaMensal();
      const contrato = await obterDocumento(anoRelatorio, mesRelatorio);
      setTextoRelatorio(gerarRelatorioCoordenacaoCanonico({
        tipo,
        contrato,
      }));
      toast.success('Relatório gerado!', 'Relatório gerado com os dados oficiais da competência');
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro ao gerar relatório';
      setErroRelatorio(mensagem);
      toast.error('Erro', mensagem);
    } finally {
      setLoadingIA(false);
    }
  };

  const regenerarRelatorio = () => {
    if (!tipoRelatorio) return;
    if (tipoRelatorio === 'mensal') {
      gerarRelatorioIA();
      return;
    }
    gerarRelatorioInstantaneo(tipoRelatorio);
  };

  const copiarRelatorio = async () => {
    if (!textoRelatorio) return;

    const result = await copyTextToClipboard(textoRelatorio);

    if (result.ok) {
      setCopiado(true);
      toast.success('Copiado!', 'Relatório copiado para a área de transferência');
      setTimeout(() => setCopiado(false), 2000);
      return;
    }

    console.error('Erro ao copiar relatório de coordenação:', result.error);
    toast.error('Erro ao copiar', `Selecione o texto manualmente e pressione ${getManualCopyShortcut()}`);
  };

  const voltarParaSelecao = () => {
    setTipoRelatorio(null);
    setTextoRelatorio('');
    setErroRelatorio(null);
    setCopiado(false);
    setEnviadoWhatsApp(false);
    setErroWhatsApp(null);
  };

  const limparModal = () => {
    voltarParaSelecao();
    setDocumentoCarregado(null);
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
          competencia: `${periodoSelecionado.ano}-${String(periodoSelecionado.mes).padStart(2, '0')}`,
          ...(numeroTeste ? { numero_teste: numeroTeste } : {}),
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
      if (!isOpen) limparModal();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-violet-400" />
            Relatório Coordenação Pedagógica
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {unidadeNome} • {periodoSelecionado.label}
          </DialogDescription>
        </DialogHeader>

        {/* Seleção de tipo de relatório */}
        {!tipoRelatorio && !loadingIA && (
          <div className="space-y-5 py-6 overflow-y-auto pr-1">
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">
                {periodicidade === 'ciclo' ? 'Ciclo da tela' : 'Período do relatório'}
              </Label>

              {periodicidade === 'mensal' && (
                <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'mes_anterior' as const, label: 'Mês anterior' },
                  { id: 'competencia_tela' as const, label: 'Competência da tela' },
                  { id: 'personalizado' as const, label: 'Personalizado' },
                ].map((periodo) => (
                  <button
                    key={periodo.id}
                    onClick={() => selecionarPeriodo(periodo.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      modoPeriodo === periodo.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50'
                    )}
                  >
                    {periodo.label}
                  </button>
                ))}
                </div>
              )}

              {periodicidade === 'mensal' && modoPeriodo === 'personalizado' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data início</Label>
                    <DatePicker
                      date={dataInicio}
                      onDateChange={(date) => {
                        if (!date) return;
                        setDataInicio(date);
                        setDocumentoCarregado(null);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data fim</Label>
                    <DatePicker
                      date={dataFim}
                      onDateChange={(date) => {
                        if (!date) return;
                        setDataFim(date);
                        setDocumentoCarregado(null);
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-1 text-xs">
                <p className="text-cyan-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {periodicidade === 'ciclo' ? 'Ciclo usado' : 'Competência usada'}: {periodoSelecionado.label}
                  <span className="text-slate-500">({periodoSelecionado.intervalo})</span>
                </p>
                {periodicidade === 'mensal' && !periodoSelecionado.mesmoMes && (
                  <p className="text-amber-300">
                    Selecione datas dentro do mesmo mês. A fonte pedagógica atual é mensal.
                  </p>
                )}
                {periodicidade === 'ciclo' && (
                  <p className="text-slate-400">
                    O ciclo reúne os meses já transcorridos e só libera premiação após o fechamento.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => gerarRelatorioIA()}
              disabled={!periodoSelecionado.mesmoMes}
              className={cn(
                'group p-6 rounded-xl border-2 border-slate-700 bg-slate-800/50 transition-all text-left',
                periodoSelecionado.mesmoMes
                  ? 'hover:border-violet-500/50 hover:bg-slate-800'
                  : 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                  <Sparkles className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">
                    {periodicidade === 'ciclo' ? 'Relatório do Ciclo com IA' : 'Relatório Mensal com IA'}
                  </h3>
                  <p className="text-xs text-slate-400">Análise completa da equipe</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Visão geral da equipe, KPIs consolidados, rankings, professores em alerta, 
                sugestões de treinamento e plano de ação gerado por IA.
              </p>
            </button>

            <button
              onClick={() => gerarRelatorioInstantaneo('ranking')}
              disabled={!periodoSelecionado.mesmoMes}
              className={cn(
                'group p-6 rounded-xl border-2 border-slate-700 bg-slate-800/50 transition-all text-left',
                periodoSelecionado.mesmoMes
                  ? 'hover:border-amber-500/50 hover:bg-slate-800'
                  : 'opacity-60 cursor-not-allowed'
              )}
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
                média de alunos por turma, usando a mesma atualização exibida nos demais relatórios.
              </p>
            </button>

            <button
              onClick={() => gerarRelatorioInstantaneo('carteira')}
              disabled={!periodoSelecionado.mesmoMes}
              className={cn(
                'group p-6 rounded-xl border-2 border-slate-700 bg-slate-800/50 transition-all text-left',
                periodoSelecionado.mesmoMes
                  ? 'hover:border-cyan-500/50 hover:bg-slate-800'
                  : 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
                  <BriefcaseBusiness className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Carteira e Carga</h3>
                  <p className="text-xs text-slate-400">Alunos, turmas e concentração</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Mostra maiores carteiras, volume de turmas e professores com média baixa de alunos por turma.
              </p>
            </button>

            <button
              onClick={() => gerarRelatorioInstantaneo('presenca')}
              disabled={!periodoSelecionado.mesmoMes}
              className={cn(
                'group p-6 rounded-xl border-2 border-slate-700 bg-slate-800/50 transition-all text-left',
                periodoSelecionado.mesmoMes
                  ? 'hover:border-emerald-500/50 hover:bg-slate-800'
                  : 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                  <Activity className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Presença e Alertas</h3>
                  <p className="text-xs text-slate-400">Regularidade pedagógica</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Lista professores abaixo das faixas de presença e prioriza acompanhamentos da coordenação.
              </p>
            </button>

            <button
              onClick={() => gerarRelatorioInstantaneo('retencao')}
              disabled={!periodoSelecionado.mesmoMes}
              className={cn(
                'group p-6 rounded-xl border-2 border-slate-700 bg-slate-800/50 transition-all text-left',
                periodoSelecionado.mesmoMes
                  ? 'hover:border-rose-500/50 hover:bg-slate-800'
                  : 'opacity-60 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center group-hover:bg-rose-500/30 transition-colors">
                  <ShieldAlert className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Retenção e Evasões</h3>
                  <p className="text-xs text-slate-400">Riscos por professor</p>
                </div>
              </div>
              <p className="text-sm text-slate-400">
                Consolida evasões, não renovações e os motivos de saída relacionados ao acompanhamento pedagógico.
              </p>
            </button>
            </div>
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
              <p className="text-white font-medium">
                {tipoRelatorio === 'mensal' ? 'Gerando relatório com IA...' : 'Gerando relatório instantâneo...'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {tipoRelatorio === 'mensal'
                  ? 'Analisando dados da equipe pedagógica'
                  : 'Buscando indicadores da competência selecionada'}
              </p>
            </div>
          </div>
        )}

        {erroRelatorio && !loadingIA && !textoRelatorio && (
          <div
            role="alert"
            className="flex-1 flex flex-col items-center justify-center gap-5 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
              <TriangleAlert className="h-6 w-6 text-red-300" />
            </div>
            <div className="max-w-xl space-y-2">
              <p className="font-semibold text-white">Não foi possível gerar o relatório</p>
              <p className="text-sm text-red-100/80">{erroRelatorio}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={voltarParaSelecao}
                className="border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Voltar
              </Button>
              <Button
                onClick={regenerarRelatorio}
                className="bg-violet-600 hover:bg-violet-700"
              >
                Tentar novamente
              </Button>
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
                onClick={voltarParaSelecao}
                className="border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                Voltar
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={regenerarRelatorio}
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  {tipoRelatorio === 'mensal' ? (
                    <Sparkles className="w-4 h-4 mr-2" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
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

                {usuario?.email === 'hugo@lamusic.com.br' && (
                  <input
                    type="text"
                    placeholder="Teste: 5521..."
                    value={numeroTeste}
                    onChange={e => setNumeroTeste(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900/60 border border-amber-500/30 rounded-lg text-xs text-white placeholder-slate-500 w-40"
                  />
                )}
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
