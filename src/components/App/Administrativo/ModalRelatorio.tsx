import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Copy, Check, RotateCcw, FileText, Calendar, RefreshCw, AlertTriangle, LogOut, Sparkles, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { MovimentacaoAdmin, ResumoMes } from './AdministrativoPage';

// Mapeamento de UUIDs para nomes de unidade
const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

interface ModalRelatorioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumo: ResumoMes | null;
  renovacoes: MovimentacaoAdmin[];
  naoRenovacoes: MovimentacaoAdmin[];
  avisosPrevios: MovimentacaoAdmin[];
  evasoes: MovimentacaoAdmin[];
  competencia: string;
  unidade: string;
}

type TipoRelatorio = 'gerencial_ia' | 'diario' | 'mensal' | 'renovacoes' | 'avisos' | 'evasoes';

const tiposRelatorio: { id: TipoRelatorio; label: string; icon: React.ReactNode; desc: string; destaque?: boolean }[] = [
  { id: 'gerencial_ia', label: 'Relatório Gerencial com IA ✨', icon: <Sparkles className="w-5 h-5" />, desc: 'Análise completa com insights, comparativos e plano de ação', destaque: true },
  { id: 'diario', label: 'Relatório Diário', icon: <Calendar className="w-5 h-5" />, desc: 'Resumo do dia: alunos, renovações, avisos, evasões' },
  { id: 'mensal', label: 'Relatório Mensal', icon: <FileText className="w-5 h-5" />, desc: 'Análise completa: métricas, LTV, churn, ticket médio' },
  { id: 'renovacoes', label: 'Relatório de Renovações', icon: <RefreshCw className="w-5 h-5" />, desc: 'Lista detalhada de renovações com reajustes' },
  { id: 'avisos', label: 'Relatório de Avisos Prévios', icon: <AlertTriangle className="w-5 h-5" />, desc: 'Lista de alunos que vão sair com motivos' },
  { id: 'evasoes', label: 'Relatório de Evasões', icon: <LogOut className="w-5 h-5" />, desc: 'Lista detalhada de evasões com motivos' },
];

export function ModalRelatorio({ 
  open, 
  onOpenChange, 
  resumo, 
  renovacoes, 
  naoRenovacoes,
  avisosPrevios, 
  evasoes, 
  competencia,
  unidade 
}: ModalRelatorioProps) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoRelatorio | null>(null);
  const [textoRelatorio, setTextoRelatorio] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [loadingIA, setLoadingIA] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [enviadoWhatsApp, setEnviadoWhatsApp] = useState(false);
  const [erroWhatsApp, setErroWhatsApp] = useState<string | null>(null);
  const [numeroTeste, setNumeroTeste] = useState('');
  const { usuario } = useAuth();
  
  // Estado para período do relatório
  const [relatorioPeriodo, setRelatorioPeriodo] = useState<'hoje' | 'ontem' | 'semana' | 'mes' | 'personalizado'>('hoje');
  const [relatorioDataInicio, setRelatorioDataInicio] = useState<Date>(new Date());
  const [relatorioDataFim, setRelatorioDataFim] = useState<Date>(new Date());

  const [ano, mes] = competencia.split('-').map(Number);
  const mesNome = new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hoje = new Date().toLocaleDateString('pt-BR');

  async function gerarRelatorioGerencialIA(): Promise<string> {
    setLoadingIA(true);
    setErroIA(null);
    
    try {
      // Converter unidade para UUID se necessário
      let unidadeUUID: string | null = null;
      if (unidade && unidade !== 'todos') {
        // Se já é UUID, usa direto; senão, tenta mapear
        unidadeUUID = unidade.includes('-') ? unidade : null;
      }

      console.log('[ModalRelatorio] Gerando relatório gerencial IA');
      console.log('[ModalRelatorio] unidade recebida:', unidade);
      console.log('[ModalRelatorio] unidadeUUID:', unidadeUUID);
      console.log('[ModalRelatorio] ano:', ano, 'mes:', mes);

      // Buscar dados via função SQL
      const { data: dadosRelatorio, error: errorDados } = await supabase
        .rpc('get_dados_relatorio_gerencial', {
          p_unidade_id: unidadeUUID,
          p_ano: ano,
          p_mes: mes
        });

      if (errorDados) {
        console.error('Erro ao buscar dados:', errorDados);
        throw new Error('Erro ao buscar dados para o relatório');
      }

      console.log('[ModalRelatorio] Dados retornados:', dadosRelatorio);

      // Determinar nome da unidade
      const nomeUnidade = unidadeUUID 
        ? (UUID_NOME_MAP[unidadeUUID] || dadosRelatorio?.periodo?.unidade_nome || 'Unidade')
        : 'Consolidado';
      const isConsolidado = !unidadeUUID;

      console.log('[ModalRelatorio] nomeUnidade:', nomeUnidade);
      console.log('[ModalRelatorio] isConsolidado:', isConsolidado);

      // Chamar Edge Function
      const { data: responseData, error: errorEdge } = await supabase.functions.invoke(
        'gemini-relatorio-gerencial',
        {
          body: {
            dados: dadosRelatorio,
            unidade_nome: nomeUnidade,
            is_consolidado: isConsolidado
          }
        }
      );

      if (errorEdge) {
        console.error('Erro na Edge Function:', errorEdge);
        throw new Error('Erro ao gerar relatório com IA');
      }

      if (responseData?.success && responseData?.relatorio) {
        return responseData.relatorio;
      } else {
        throw new Error(responseData?.error || 'Resposta inválida da IA');
      }
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido';
      setErroIA(mensagem);
      return `❌ Erro ao gerar relatório: ${mensagem}\n\nTente novamente em alguns instantes.`;
    } finally {
      setLoadingIA(false);
    }
  }

  async function gerarRelatorioDiario(): Promise<string> {
    // Usar a data selecionada pelo usuário (não hardcoded como hoje)
    const dataSelecionada = relatorioDataInicio;
    const dia = dataSelecionada.getDate().toString().padStart(2, '0');
    const mesNome = dataSelecionada.toLocaleString('pt-BR', { month: 'long' });
    const ano = dataSelecionada.getFullYear();
    
    // Para range de datas (personalizado com início e fim diferentes)
    const dataInicio = relatorioDataInicio;
    const dataFim = relatorioDataFim;
    const isRange = dataInicio.toDateString() !== dataFim.toDateString();
    
    // Buscar nome da unidade e farmers
    let unidadeNome = 'Unidade';
    let farmersNomes = 'Equipe Administrativa';
    
    if (unidade && unidade !== 'todos') {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, farmers_nomes')
        .eq('id', unidade)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        farmersNomes = unidadeData.farmers_nomes?.join(' e ') || 'Equipe Administrativa';
      }
    } else {
      unidadeNome = 'CONSOLIDADO';
      farmersNomes = 'Todas as Unidades';
    }

    // Função auxiliar para verificar se uma data está no range selecionado
    const dentroDoRange = (dataStr: string) => {
      const data = new Date(dataStr);
      if (isRange) {
        return data >= new Date(dataInicio.toDateString()) && data <= new Date(dataFim.toDateString());
      }
      return data.toDateString() === dataSelecionada.toDateString();
    };

    // Filtrar renovações do período selecionado
    const renovacoesHoje = renovacoes.filter(r => dentroDoRange(r.data));

    // Filtrar avisos prévios do período selecionado
    const avisosPreviosHoje = avisosPrevios.filter(a => dentroDoRange(a.data));

    // Filtrar evasões do período selecionado
    const evasoesHoje = evasoes.filter(e => dentroDoRange(e.data));

    // Calcular KPIs
    const totalBolsistas = (resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0);
    const taxaInadimplencia = resumo?.alunos_ativos 
      ? ((resumo?.alunos_nao_pagantes || 0) / resumo.alunos_ativos * 100)
      : 0;
    const taxaRenovacao = resumo?.renovacoes_previstas
      ? ((resumo?.renovacoes_realizadas || 0) / resumo.renovacoes_previstas * 100)
      : 0;

    // Formatar período para exibição
    const periodoTexto = isRange 
      ? `${dataInicio.toLocaleDateString('pt-BR')} a ${dataFim.toLocaleDateString('pt-BR')}`
      : `${dia}/${mesNome}/${ano}`;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📋 *RELATÓRIO DIÁRIO ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📆 ${periodoTexto}\n`;
    texto += `👥 ${farmersNomes}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `👥 *ALUNOS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ativos: *${resumo?.alunos_ativos || 0}*\n`;
    texto += `• Pagantes: *${resumo?.alunos_pagantes || 0}*\n`;
    texto += `• Não Pagantes: *${resumo?.alunos_nao_pagantes || 0}* (${taxaInadimplencia.toFixed(1)}%)\n`;
    texto += `• Bolsistas Integrais: *${resumo?.bolsistas_integrais || 0}*\n`;
    texto += `• Bolsistas Parciais: *${resumo?.bolsistas_parciais || 0}*\n`;
    texto += `• Trancados: *${resumo?.alunos_trancados || 0}*\n`;
    texto += `• Novos no mês: *${resumo?.alunos_novos || 0}*\n\n`;

    texto += `📚 *MATRÍCULAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Matrículas Ativas: *${resumo?.matriculas_ativas || 0}*\n`;
    texto += `• Matrículas em Banda: *${resumo?.matriculas_banda || 0}*\n`;
    texto += `• Matrículas de 2º Curso: *${resumo?.matriculas_2_curso || 0}*\n`;
    texto += `• Alunos no Coral: *${resumo?.alunos_coral || 0}*\n\n`;

    texto += `🔄 *RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total previsto: *${resumo?.renovacoes_previstas || 0}*\n`;
    texto += `• Realizadas: *${resumo?.renovacoes_realizadas || 0}*\n`;
    texto += `• Pendentes: *${resumo?.renovacoes_pendentes || 0}*\n`;
    texto += `• Não Renovações: *${resumo?.nao_renovacoes || 0}*\n`;
    texto += `• Taxa de Renovação: *${taxaRenovacao.toFixed(1)}%*\n\n`;

    // Renovações do dia
    if (renovacoesHoje.length > 0) {
      texto += `✅ *RENOVAÇÕES DO DIA (${renovacoesHoje.length})*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      renovacoesHoje.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (*+${reajuste.toFixed(1)}%*)\n`;
        texto += `   Agente: ${r.agente_comercial || 'N/A'}\n\n`;
      });
    } else {
      texto += `✅ *RENOVAÇÕES DO DIA: 0*\n\n`;
    }

    // Não Renovações do dia
    const naoRenovacoesHoje = naoRenovacoes.filter(r => dentroDoRange(r.data));
    if (naoRenovacoesHoje.length > 0) {
      texto += `❌ *NÃO RENOVAÇÕES DO DIA (${naoRenovacoesHoje.length})*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      naoRenovacoesHoje.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   De: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (${reajuste.toFixed(1)}%)\n`;
        texto += `   Professor(a): ${r.professor_nome || 'N/A'}\n`;
        texto += `   Motivo: ${r.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `❌ *NÃO RENOVAÇÕES DO DIA: 0*\n\n`;
    }

    // Avisos Prévios
    texto += `⚠️ *AVISOS PRÉVIOS PARA SAIR EM ${new Date(ano, dataSelecionada.getMonth() + 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (avisosPrevios.length === 0) {
      texto += `Nenhum aviso prévio registrado 🎉\n\n`;
    } else {
      avisosPrevios.forEach((a, i) => {
        texto += `${i + 1}) Nome: *${a.aluno_nome}*\n`;
        texto += `   Motivo: ${a.motivo || 'Não informado'}\n`;
        texto += `   Parcela: R$ ${(a.valor_parcela_novo || 0).toFixed(2)}\n`;
        texto += `   Professor(a): ${a.professor_nome || 'N/A'}\n\n`;
      });
      texto += `● Total no mês: *${avisosPrevios.length}*\n\n`;
    }

    // Evasões
    texto += `🚪 *EVASÕES (Saíram esse mês)*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total de evasões: *${evasoes.length}*\n`;
    texto += `• Interrompido: *${evasoes.filter(e => e.tipo_evasao === 'interrompido').length}*\n`;
    texto += `• Interrompido 2º Curso: *${evasoes.filter(e => e.tipo_evasao === 'interrompido_2_curso').length}*\n`;
    texto += `• Interrompido Bolsista: *${evasoes.filter(e => e.tipo_evasao === 'interrompido_bolsista').length}*\n`;
    texto += `• Interrompido Banda: *${evasoes.filter(e => e.tipo_evasao === 'interrompido_banda').length}*\n`;
    texto += `• Não Renovou: *${evasoes.filter(e => e.tipo_evasao === 'nao_renovou').length}*\n`;
    texto += `• Transferência: *${evasoes.filter(e => e.tipo_evasao === 'transferencia').length}*\n\n`;

    if (evasoesHoje.length > 0) {
      texto += `Evasões do dia: *${evasoesHoje.length}*\n\n`;
      evasoesHoje.forEach((e, i) => {
        texto += `${i + 1}) *${e.aluno_nome}*\n`;
        texto += `   Tipo: ${e.tipo_evasao || 'N/A'}\n`;
        texto += `   Motivo: ${e.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `Evasões do dia: *0*\n\n`;
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const agora = new Date();
    texto += `📅 Gerado em: ${agora.getDate().toString().padStart(2, '0')}/${(agora.getMonth() + 1).toString().padStart(2, '0')}/${agora.getFullYear()} às ${agora.getHours()}:${agora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  }

  async function gerarRelatorioMensal(): Promise<string> {
    const mesNomeUpper = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    // Buscar nome da unidade e farmers do banco
    let unidadeNome = 'CONSOLIDADO';
    let farmersNomes = 'Todas as Unidades';
    
    if (unidade && unidade !== 'todos') {
      const { data: unidadeData } = await supabase
        .from('unidades')
        .select('nome, farmers_nomes')
        .eq('id', unidade)
        .single();
      
      if (unidadeData) {
        unidadeNome = unidadeData.nome;
        farmersNomes = unidadeData.farmers_nomes?.join(' e ') || 'Equipe Administrativa';
      }
    }

    // Buscar metas do banco
    let metasQuery = supabase
      .from('metas_kpi')
      .select('tipo, valor')
      .eq('ano', ano)
      .eq('mes', mes);
    
    if (unidade && unidade !== 'todos') {
      metasQuery = metasQuery.eq('unidade_id', unidade);
    }
    
    const { data: metasData } = await metasQuery;
    
    // Mapear metas
    const metas: Record<string, number> = {};
    metasData?.forEach(m => {
      metas[m.tipo] = Number(m.valor);
    });
    
    // Calcular KPIs
    const reajusteMedio = renovacoes.length > 0
      ? renovacoes.reduce((acc, r) => {
          if (r.valor_parcela_anterior && r.valor_parcela_novo) {
            return acc + ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100;
          }
          return acc;
        }, 0) / renovacoes.length
      : 0;

    const totalBolsistas = (resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0);
    const taxaInadimplencia = resumo?.alunos_ativos 
      ? ((resumo?.alunos_nao_pagantes || 0) / resumo.alunos_ativos * 100)
      : 0;
    const taxaRenovacao = resumo?.renovacoes_previstas && resumo.renovacoes_previstas > 0
      ? ((resumo?.renovacoes_realizadas || 0) / resumo.renovacoes_previstas * 100)
      : 0;
    const ticketMedio = resumo?.ticket_medio || 0;
    const ltv = (resumo?.ltv_meses || 0) * ticketMedio;
    const mrrAtual = (resumo?.alunos_pagantes || 0) * ticketMedio;
    const mrrPerdido = evasoes.reduce((acc, e) => acc + (e.valor_parcela_novo || 0), 0);

    // Função para gerar barra de progresso WhatsApp
    const gerarBarra = (atual: number, meta: number, inverso: boolean = false): string => {
      if (meta === 0) return '░░░░░░░░░░ 0%';
      const percentual = Math.min((atual / meta) * 100, 100);
      const blocos = Math.round(percentual / 10);
      const barra = '▓'.repeat(blocos) + '░'.repeat(10 - blocos);
      const status = inverso 
        ? (atual <= meta ? '✅' : '❌')
        : (atual >= meta ? '✅' : '⚠️');
      return `${barra} ${percentual.toFixed(0)}% ${status}`;
    };

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome.toUpperCase()}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `👥 Por ${farmersNomes}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // SEÇÃO 1: ALUNOS
    texto += `👥 *ALUNOS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ativos: *${resumo?.alunos_ativos || 0}*\n`;
    texto += `• Pagantes: *${resumo?.alunos_pagantes || 0}*\n`;
    texto += `• Não Pagantes: *${resumo?.alunos_nao_pagantes || 0}*\n`;
    texto += `• Bolsistas: *${totalBolsistas}*\n`;
    texto += `• Trancados: *${resumo?.alunos_trancados || 0}*\n`;
    texto += `• Novos no mês: *${resumo?.alunos_novos || 0}*\n\n`;

    // SEÇÃO 2: MATRÍCULAS
    texto += `📚 *MATRÍCULAS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Matrículas Ativas: *${resumo?.matriculas_ativas || 0}*\n`;
    texto += `• Matrículas em Banda: *${resumo?.matriculas_banda || 0}*\n`;
    texto += `• Matrículas de 2º Curso: *${resumo?.matriculas_2_curso || 0}*\n\n`;

    // SEÇÃO 3: KPIs FINANCEIROS
    texto += `💰 *KPIs FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ticket Médio: *R$ ${ticketMedio.toFixed(2)}*\n`;
    texto += `• Faturamento Previsto: *R$ ${mrrAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• MRR Atual: *R$ ${mrrAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• LTV (Tempo × Ticket): *R$ ${ltv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• Tempo Permanência: *${(resumo?.ltv_meses || 0).toFixed(1)} meses*\n\n`;

    // SEÇÃO 4: KPIs DE RETENÇÃO
    texto += `📈 *KPIs DE RETENÇÃO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Churn Rate: *${(resumo?.churn_rate || 0).toFixed(1)}%*\n`;
    texto += `• Taxa de Renovação: *${taxaRenovacao.toFixed(1)}%*\n`;
    texto += `• Reajuste Médio: *${reajusteMedio.toFixed(1)}%*\n`;
    texto += `• Inadimplência: *${taxaInadimplencia.toFixed(1)}%*\n`;
    texto += `• MRR Perdido: *R$ ${mrrPerdido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `• Total Evasões: *${evasoes.length}*\n`;
    texto += `• Não Renovações: *${naoRenovacoes.length}*\n\n`;

    // SEÇÃO 5: BARRAS DE METAS (Fideliza+ LA)
    texto += `🎯 *METAS FIDELIZA+ LA*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Churn (meta: abaixo de 3% para estrela, máximo 4%)
    const metaChurn = metas['churn_rate'] || 4;
    texto += `⭐ *Churn Premiado* (meta: <3%)\n`;
    texto += `   ${gerarBarra(100 - (resumo?.churn_rate || 0), 100 - 3, false)}\n`;
    texto += `   Atual: *${(resumo?.churn_rate || 0).toFixed(1)}%* | Meta: *<3%*\n\n`;
    
    // Inadimplência (meta: 0%)
    texto += `⭐ *Inadimplência Zero* (meta: 0%)\n`;
    texto += `   ${gerarBarra(100 - taxaInadimplencia, 100, false)}\n`;
    texto += `   Atual: *${taxaInadimplencia.toFixed(1)}%* | Meta: *0%*\n\n`;
    
    // Renovação (meta: 100%)
    const metaRenovacao = metas['taxa_renovacao'] || 90;
    texto += `⭐ *Max Renovação* (meta: 100%)\n`;
    texto += `   ${gerarBarra(taxaRenovacao, 100, false)}\n`;
    texto += `   Atual: *${taxaRenovacao.toFixed(1)}%* | Meta: *100%*\n\n`;
    
    // Reajuste (meta: >8.5%)
    const metaReajuste = metas['reajuste_medio'] || 9;
    texto += `⭐ *Reajuste Campeão* (meta: >8.5%)\n`;
    texto += `   ${gerarBarra(reajusteMedio, 8.5, false)}\n`;
    texto += `   Atual: *${reajusteMedio.toFixed(1)}%* | Meta: *>8.5%*\n\n`;

    // SEÇÃO 6: RENOVAÇÕES
    texto += `🔄 *RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total previsto: *${resumo?.renovacoes_previstas || 0}*\n`;
    texto += `• Realizadas: *${renovacoes.length}*\n`;
    texto += `• Porcentagem: *${taxaRenovacao.toFixed(0)}%*\n\n`;
    
    if (renovacoes.length > 0) {
      renovacoes.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}) Nome: *${r.aluno_nome}*\n`;
        texto += `   Parcela: R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (${reajuste.toFixed(2)}%)\n`;
        texto += `   Forma de PG: ${r.forma_pagamento_nome || 'N/A'}\n`;
        texto += `   Agente: ${r.agente_comercial || 'N/A'}\n\n`;
      });
    }

    // SEÇÃO 7: NÃO RENOVAÇÕES
    texto += `❌ *NÃO RENOVAÇÕES DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total: *${naoRenovacoes.length}*\n`;
    if (resumo?.renovacoes_previstas && resumo.renovacoes_previstas > 0) {
      const pctNaoRenov = (naoRenovacoes.length / resumo.renovacoes_previstas) * 100;
      texto += `• Porcentagem: *${pctNaoRenov.toFixed(0)}%*\n\n`;
    } else {
      texto += `\n`;
    }
    
    if (naoRenovacoes.length > 0) {
      naoRenovacoes.forEach((n, i) => {
        const reajuste = n.valor_parcela_anterior && n.valor_parcela_novo
          ? ((n.valor_parcela_novo - n.valor_parcela_anterior) / n.valor_parcela_anterior) * 100
          : 0;
        const reajusteLabel = reajuste === 0 ? '(Retenção)' : `(${reajuste.toFixed(2)}%)`;
        texto += `${i + 1}) Nome: *${n.aluno_nome}*\n`;
        texto += `   Parcela: R$ ${(n.valor_parcela_anterior || 0).toFixed(2)} para R$ ${(n.valor_parcela_novo || 0).toFixed(2)} ${reajusteLabel}\n`;
        texto += `   Professor: ${n.professor_nome || 'N/A'}\n`;
        texto += `   Motivo: ${n.motivo || 'Não informado'}\n\n`;
      });
    } else {
      texto += `Nenhuma não renovação registrada 🎉\n\n`;
    }

    // SEÇÃO 8: AVISOS PRÉVIOS
    const proximoMes = new Date(ano, mes).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    texto += `⚠️ *AVISOS PRÉVIOS para sair em ${proximoMes}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Total no mês: *${avisosPrevios.length}*\n\n`;
    
    if (avisosPrevios.length > 0) {
      avisosPrevios.forEach((a, i) => {
        texto += `${i + 1}) Nome: *${a.aluno_nome}*\n`;
        texto += `   Motivo: ${a.motivo || 'Não informado'}\n`;
        texto += `   Prof: ${a.professor_nome || 'N/A'}\n\n`;
      });
    } else {
      texto += `Nenhum aviso prévio registrado 🎉\n\n`;
    }

    // SEÇÃO 9: EVASÕES
    texto += `🚪 *EVASÕES (Saíram no mês)*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    const interrompidos = evasoes.filter(e => e.tipo_evasao === 'interrompido').length;
    const interrompidos2Curso = evasoes.filter(e => e.tipo_evasao === 'interrompido_2_curso').length;
    const interrompidosBolsista = evasoes.filter(e => e.tipo_evasao === 'interrompido_bolsista').length;
    const interrompidosBanda = evasoes.filter(e => e.tipo_evasao === 'interrompido_banda').length;
    const naoRenovou = evasoes.filter(e => e.tipo_evasao === 'nao_renovou').length;
    
    texto += `• Total no mês: *${evasoes.length}*\n`;
    texto += `• Não renovou: *${naoRenovou}*\n`;
    texto += `• Interrompido: *${interrompidos}*\n`;
    if (interrompidos2Curso > 0) texto += `• Interrompido 2º Curso: *${interrompidos2Curso}*\n`;
    if (interrompidosBolsista > 0) texto += `• Interrompido Bolsista: *${interrompidosBolsista}*\n`;
    if (interrompidosBanda > 0) texto += `• Interrompido Banda: *${interrompidosBanda}*\n`;
    texto += `\n`;
    
    if (evasoes.length > 0) {
      evasoes.forEach((e, i) => {
        texto += `${i + 1}) Nome: *${e.aluno_nome}*\n`;
        texto += `   Motivo: ${e.motivo || 'Não informado'}\n`;
        texto += `   Prof: ${e.professor_nome || 'N/A'}\n\n`;
      });
    } else {
      texto += `Nenhuma evasão registrada 🎉\n\n`;
    }

    const dataHora = new Date();
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📅 Gerado em: ${dataHora.toLocaleDateString('pt-BR')} às ${dataHora.getHours()}:${dataHora.getMinutes().toString().padStart(2, '0')}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━`;

    return texto;
  }

  function gerarRelatorioRenovacoes(): string {
    const mesNomeUpper = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    const reajusteMedio = renovacoes.length > 0
      ? renovacoes.reduce((acc, r) => {
          if (r.valor_parcela_anterior && r.valor_parcela_novo) {
            return acc + ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100;
          }
          return acc;
        }, 0) / renovacoes.length
      : 0;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `✅ *RELATÓRIO DE RENOVAÇÕES*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${renovacoes.length} renovações*\n`;
    texto += `Reajuste médio: *+${reajusteMedio.toFixed(1)}%*\n\n`;

    if (renovacoes.length === 0) {
      texto += `Nenhuma renovação registrada neste período.\n\n`;
    } else {
      texto += `📋 *LISTA DE RENOVAÇÕES*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      renovacoes.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        const dataFormatada = new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. *${r.aluno_nome}*\n`;
        texto += `   📅 ${dataFormatada}\n`;
        texto += `   💰 R$ ${(r.valor_parcela_anterior || 0).toFixed(2)} → R$ ${(r.valor_parcela_novo || 0).toFixed(2)} (*+${reajuste.toFixed(0)}%*)\n`;
        texto += `   💳 ${r.forma_pagamento_nome || 'N/A'} | 👤 ${r.agente_comercial || 'N/A'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  function gerarRelatorioAvisos(): string {
    const mesNomeUpper = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const perdaPotencial = avisosPrevios.reduce((acc, a) => acc + (a.valor_parcela_novo || 0), 0);

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `⚠️ *RELATÓRIO DE AVISOS PRÉVIOS*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${avisosPrevios.length} avisos prévios*\n`;
    texto += `Perda potencial: *R$ ${perdaPotencial.toFixed(2)}/mês*\n\n`;

    if (avisosPrevios.length === 0) {
      texto += `Nenhum aviso prévio registrado neste período. 🎉\n\n`;
    } else {
      texto += `📋 *LISTA DE AVISOS*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      avisosPrevios.forEach((a, i) => {
        const dataAviso = new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const mesSaida = a.mes_saida ? new Date(a.mes_saida).toLocaleDateString('pt-BR', { month: 'long' }) : 'N/A';
        texto += `${i + 1}. *${a.aluno_nome}*\n`;
        texto += `   📅 Aviso: ${dataAviso} | 📆 Sai em: ${mesSaida}\n`;
        texto += `   💰 R$ ${(a.valor_parcela_novo || 0).toFixed(2)} | 🎸 ${a.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${a.motivo || 'Sem motivo informado'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  function gerarRelatorioEvasoes(): string {
    const mesNomeUpper = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    const porTipo = evasoes.reduce((acc, e) => {
      const tipo = e.tipo_evasao || 'outros';
      acc[tipo] = (acc[tipo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mrrPerdido = evasoes.reduce((acc, e) => acc + (e.valor_parcela_evasao || 0), 0);

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `🚪 *RELATÓRIO DE EVASÕES*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📊 *RESUMO*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Total: *${evasoes.length} evasões*\n`;
    if (mrrPerdido > 0) {
      texto += `MRR Perdido: *R$ ${mrrPerdido.toFixed(2)}/mês*\n`;
    }
    texto += `\n`;

    if (Object.keys(porTipo).length > 0) {
      texto += `📈 *POR TIPO*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      Object.entries(porTipo).forEach(([tipo, count]) => {
        const label = tipo === 'interrompido' ? '⏸️ Interrompido' : 
          tipo === 'nao_renovou' ? '❌ Não Renovou' : 
          tipo === 'interrompido_2_curso' ? '⏸️ Interrompido 2º Curso' :
          tipo === 'interrompido_bolsista' ? '⏸️ Interrompido Bolsista' :
          tipo === 'interrompido_banda' ? '⏸️ Interrompido Banda' : tipo;
        texto += `• ${label}: *${count}*\n`;
      });
      texto += `\n`;
    }

    if (evasoes.length === 0) {
      texto += `Nenhuma evasão registrada neste período. 🎉\n\n`;
    } else {
      texto += `📋 *LISTA DE EVASÕES*\n`;
      texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      evasoes.forEach((e, i) => {
        const tipoLabel = e.tipo_evasao === 'interrompido' ? '⏸️ Interrompido' : 
          e.tipo_evasao === 'nao_renovou' ? '❌ Não Renovou' : 
          e.tipo_evasao === 'interrompido_2_curso' ? '⏸️ 2º Curso' :
          e.tipo_evasao === 'interrompido_bolsista' ? '⏸️ Bolsista' :
          e.tipo_evasao === 'interrompido_banda' ? '⏸️ Banda' : e.tipo_evasao || 'N/A';
        const dataFormatada = new Date(e.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        texto += `${i + 1}. *${e.aluno_nome}*\n`;
        texto += `   📅 ${dataFormatada} | ${tipoLabel}\n`;
        if (e.valor_parcela_evasao) {
          texto += `   💰 R$ ${e.valor_parcela_evasao.toFixed(2)}`;
          if (e.tempo_permanencia_meses) {
            texto += ` | ⏱️ ${e.tempo_permanencia_meses} meses`;
          }
          texto += `\n`;
        }
        texto += `   🎸 ${e.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${e.motivo || 'Sem motivo informado'}\n\n`;
      });
    }

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  async function handleSelecionarTipo(tipo: TipoRelatorio) {
    setTipoSelecionado(tipo);
    
    // Se for relatório gerencial IA, gera automaticamente
    if (tipo === 'gerencial_ia') {
      setTextoRelatorio('Gerando relatório com IA... ⏳');
      const texto = await gerarRelatorioGerencialIA();
      setTextoRelatorio(texto);
      return;
    }
    
    let texto = '';
    switch (tipo) {
      case 'diario':
        texto = await gerarRelatorioDiario();
        break;
      case 'mensal':
        texto = await gerarRelatorioMensal();
        break;
      case 'renovacoes':
        texto = gerarRelatorioRenovacoes();
        break;
      case 'avisos':
        texto = gerarRelatorioAvisos();
        break;
      case 'evasoes':
        texto = gerarRelatorioEvasoes();
        break;
    }
    setTextoRelatorio(texto);
  }

  async function copiarRelatorio() {
    if (!textoRelatorio) return;
    
    try {
      // Tentar usar a API moderna primeiro
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textoRelatorio);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
        return;
      }
      
      // Fallback para método legado
      const textarea = document.createElement('textarea');
      textarea.value = textoRelatorio;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      } else {
        throw new Error('execCommand retornou false');
      }
    } catch (err) {
      console.error('Erro ao copiar:', err);
      // Tentar abrir em nova janela como último recurso
      const blob = new Blob([textoRelatorio], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      URL.revokeObjectURL(url);
    }
  }

  function voltar() {
    setTipoSelecionado(null);
    setTextoRelatorio('');
    setEnviadoWhatsApp(false);
    setErroWhatsApp(null);
  }

  async function enviarWhatsAppGrupo() {
    if (!textoRelatorio || enviandoWhatsApp) return;
    
    setEnviandoWhatsApp(true);
    setErroWhatsApp(null);
    setEnviadoWhatsApp(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: textoRelatorio,
          tipoRelatorio: tipoSelecionado,
          unidade: unidade,
          competencia: competencia,
          ...(numeroTeste ? { numero_teste: numeroTeste } : {}),
        },
      });
      
      if (error) {
        console.error('[WhatsApp] Erro ao enviar:', error);
        setErroWhatsApp('Erro ao enviar mensagem');
        return;
      }
      
      if (data?.success || data?.partial) {
        console.log('[WhatsApp] ✅ Mensagem enviada!', data.resultados);
        setEnviadoWhatsApp(true);
        setTimeout(() => setEnviadoWhatsApp(false), 3000);
      } else {
        setErroWhatsApp(data?.error || 'Erro desconhecido');
      }
    } catch (err) {
      console.error('[WhatsApp] Erro inesperado:', err);
      setErroWhatsApp('Erro de conexão');
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="w-5 h-5 text-cyan-400" />
            {tipoSelecionado ? tiposRelatorio.find(t => t.id === tipoSelecionado)?.label : 'Gerar Relatório'}
          </DialogTitle>
        </DialogHeader>

        {!tipoSelecionado ? (
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
            {/* Seleção de Período */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">Período do Relatório</Label>
              
              {/* Botões de atalho - Simplificado: Ontem e Personalizado */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'ontem', label: 'Ontem' },
                  { id: 'personalizado', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRelatorioPeriodo(p.id as typeof relatorioPeriodo);
                      const hojeDate = new Date();
                      if (p.id === 'ontem') {
                        const ontem = new Date(hojeDate);
                        ontem.setDate(ontem.getDate() - 1);
                        setRelatorioDataInicio(ontem);
                        setRelatorioDataFim(ontem);
                      }
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      relatorioPeriodo === p.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600/50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              
              {/* Seletor de datas personalizado */}
              {relatorioPeriodo === 'personalizado' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Início</Label>
                    <DatePicker
                      date={relatorioDataInicio}
                      onDateChange={(date) => date && setRelatorioDataInicio(date)}
                    />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs mb-1 block">Data Fim</Label>
                    <DatePicker
                      date={relatorioDataFim}
                      onDateChange={(date) => date && setRelatorioDataFim(date)}
                    />
                  </div>
                </div>
              )}
              
              {/* Exibir período selecionado */}
              <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {relatorioDataInicio.toLocaleDateString('pt-BR')} 
                {relatorioDataInicio.toDateString() !== relatorioDataFim.toDateString() && (
                  <> até {relatorioDataFim.toLocaleDateString('pt-BR')}</>
                )}
              </p>
            </div>

            <p className="text-slate-400 text-sm">Escolha o tipo de relatório:</p>
            {tiposRelatorio.map((tipo) => (
              <button
                key={tipo.id}
                onClick={() => handleSelecionarTipo(tipo.id)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                  tipo.destaque 
                    ? "bg-gradient-to-r from-violet-600/20 to-cyan-600/20 hover:from-violet-600/30 hover:to-cyan-600/30 border border-violet-500/50 hover:border-violet-400"
                    : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-slate-600"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  tipo.destaque ? "bg-gradient-to-br from-violet-500 to-cyan-500 text-white" : "bg-slate-700/50 text-cyan-400"
                )}>
                  {tipo.icon}
                </div>
                <div className="flex-1">
                  <h3 className={cn("font-medium", tipo.destaque ? "text-violet-300" : "text-white")}>{tipo.label}</h3>
                  <p className="text-xs text-slate-400">{tipo.desc}</p>
                </div>
                <span className={tipo.destaque ? "text-violet-400" : "text-slate-500"}>→</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="sm" onClick={voltar} className="text-slate-400 hover:text-white">
                ← Voltar
              </Button>
              <div className="flex items-center gap-2">
                {tipoSelecionado === 'gerencial_ia' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelecionarTipo('gerencial_ia')}
                    disabled={loadingIA}
                    className="text-violet-400 hover:text-violet-300"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    Regenerar
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelecionarTipo(tipoSelecionado)}
                  disabled={loadingIA}
                  className="text-slate-400 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Resetar
                </Button>
                <Button
                  onClick={copiarRelatorio}
                  disabled={loadingIA || !textoRelatorio}
                  className={cn(
                    'transition-all',
                    copiado ? 'bg-emerald-500' : 'bg-cyan-500 hover:bg-cyan-600'
                  )}
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
                    placeholder="Teste: 5521999999999"
                    value={numeroTeste}
                    onChange={e => setNumeroTeste(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900/60 border border-amber-500/30 rounded-lg text-xs text-white placeholder-slate-500 w-40"
                  />
                )}
                <Button
                  onClick={enviarWhatsAppGrupo}
                  disabled={loadingIA || enviandoWhatsApp || !textoRelatorio}
                  className={cn(
                    'transition-all',
                    enviadoWhatsApp 
                      ? 'bg-emerald-500' 
                      : erroWhatsApp 
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-600 hover:bg-green-700'
                  )}
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
                  ) : erroWhatsApp ? (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Tentar novamente
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

            {erroWhatsApp && (
              <p className="text-xs text-red-400 mb-2">❌ {erroWhatsApp}</p>
            )}
            
            {loadingIA ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-800/50 rounded-xl border border-slate-700">
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin mb-4" />
                <p className="text-violet-300 font-medium">Gerando relatório com IA...</p>
                <p className="text-slate-500 text-sm mt-1">Isso pode levar alguns segundos</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-2">
                  💡 Você pode editar o texto antes de copiar
                </p>
                <Textarea
                  value={textoRelatorio}
                  onChange={(e) => setTextoRelatorio(e.target.value)}
                  className="flex-1 bg-slate-800 border-slate-700 font-mono text-sm min-h-[300px] resize-none"
                />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
