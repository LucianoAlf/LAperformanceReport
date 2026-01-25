import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Copy, Check, RotateCcw, FileText, Calendar, RefreshCw, AlertTriangle, LogOut, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/lib/supabase';
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

  function gerarRelatorioDiario(): string {
    const dia = new Date().getDate().toString().padStart(2, '0');
    const mesNome = new Date().toLocaleString('pt-BR', { month: 'long' });
    const ano = new Date().getFullYear();
    const unidadeNome = unidade === 'todos' ? 'CONSOLIDADO' : unidade.toUpperCase();

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📋 *RELATÓRIO DIÁRIO ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome}*\n`;
    texto += `📆 ${dia}/${mesNome}/${ano}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `👥 *ALUNOS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Ativos: *${resumo?.alunos_ativos || 0}*\n`;
    texto += `• Pagantes: *${resumo?.alunos_pagantes || 0}*\n`;
    texto += `• Não Pagantes: *${resumo?.alunos_nao_pagantes || 0}*\n`;
    texto += `• Bolsistas: *${(resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0)}*\n`;
    texto += `• Trancados: *${resumo?.alunos_trancados || 0}*\n`;
    texto += `• Novos no mês: *${resumo?.alunos_novos || 0}*\n\n`;

    texto += `🔄 *RENOVAÇÕES*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Realizadas: *${resumo?.renovacoes_realizadas || 0}*\n`;
    texto += `• Pendentes: *${resumo?.renovacoes_pendentes || 0}*\n`;
    texto += `• Não Renovações: *${naoRenovacoes.length}*\n\n`;

    texto += `⚠️ *AVISOS PRÉVIOS (${avisosPrevios.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (avisosPrevios.length === 0) {
      texto += `Nenhum aviso prévio registrado hoje 🎉\n\n`;
    } else {
      avisosPrevios.forEach((a, i) => {
        texto += `${i + 1}. *${a.aluno_nome}*\n`;
        texto += `   💰 R$ ${(a.valor_parcela_novo || 0).toFixed(2)} | 🎸 ${a.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${a.motivo || 'Sem motivo'}\n\n`;
      });
    }

    texto += `🚪 *EVASÕES (${evasoes.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `• Interrompido: *${evasoes.filter(e => e.tipo_evasao === 'interrompido').length}*\n`;
    texto += `• Não Renovou: *${evasoes.filter(e => e.tipo_evasao === 'nao_renovou').length}*\n\n`;

    texto += `━━━━━━━━━━━━━━━━━━━━━━`;
    return texto;
  }

  function gerarRelatorioMensal(): string {
    const mesNomeUpper = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const unidadeNome = unidade === 'todos' ? 'CONSOLIDADO' : unidade.toUpperCase();
    
    const reajusteMedio = renovacoes.length > 0
      ? renovacoes.reduce((acc, r) => {
          if (r.valor_parcela_anterior && r.valor_parcela_novo) {
            return acc + ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100;
          }
          return acc;
        }, 0) / renovacoes.length
      : 0;

    let texto = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📊 *RELATÓRIO MENSAL ADMINISTRATIVO*\n`;
    texto += `🏢 *${unidadeNome}*\n`;
    texto += `📅 *${mesNomeUpper}/${ano}*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    texto += `📈 *RESUMO GERAL DO MÊS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `👥 Alunos Ativos: *${resumo?.alunos_ativos || 0}*\n`;
    texto += `💵 Pagantes: *${resumo?.alunos_pagantes || 0}*\n`;
    texto += `🎓 Bolsistas: *${(resumo?.bolsistas_integrais || 0) + (resumo?.bolsistas_parciais || 0)}*\n`;
    texto += `⏸️ Trancados: *${resumo?.alunos_trancados || 0}*\n`;
    texto += `✨ Novos: *${resumo?.alunos_novos || 0}*\n\n`;

    texto += `💰 *INDICADORES FINANCEIROS*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `Ticket Médio: *R$ ${(resumo?.ticket_medio || 0).toFixed(2)}*\n`;
    texto += `Faturamento: *R$ ${(resumo?.faturamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*\n`;
    texto += `LTV: *${resumo?.ltv_meses || 0} meses*\n`;
    texto += `Churn Rate: *${(resumo?.churn_rate || 0).toFixed(1)}%*\n\n`;

    texto += `🔄 *RENOVAÇÕES (${renovacoes.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (renovacoes.length === 0) {
      texto += `Nenhuma renovação registrada\n\n`;
    } else {
      renovacoes.forEach((r, i) => {
        const reajuste = r.valor_parcela_anterior && r.valor_parcela_novo
          ? ((r.valor_parcela_novo - r.valor_parcela_anterior) / r.valor_parcela_anterior) * 100
          : 0;
        texto += `${i + 1}. *${r.aluno_nome}*\n`;
        texto += `   💰 R$ ${(r.valor_parcela_anterior || 0).toFixed(0)} → R$ ${(r.valor_parcela_novo || 0).toFixed(0)} (*+${reajuste.toFixed(0)}%*)\n`;
        texto += `   💳 ${r.forma_pagamento_nome || 'N/A'} | 👤 ${r.agente_comercial || 'N/A'}\n\n`;
      });
      texto += `📊 Reajuste médio: *+${reajusteMedio.toFixed(1)}%*\n\n`;
    }

    texto += `❌ *NÃO RENOVAÇÕES (${naoRenovacoes.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (naoRenovacoes.length === 0) {
      texto += `Nenhuma não renovação registrada 🎉\n\n`;
    } else {
      naoRenovacoes.forEach((n, i) => {
        texto += `${i + 1}. *${n.aluno_nome}*\n`;
        texto += `   🎸 ${n.professor_nome || 'N/A'} | 👤 ${n.agente_comercial || 'N/A'}\n`;
        texto += `   📝 ${n.motivo || 'Sem motivo'}\n\n`;
      });
    }

    texto += `⚠️ *AVISOS PRÉVIOS (${avisosPrevios.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (avisosPrevios.length === 0) {
      texto += `Nenhum aviso prévio registrado 🎉\n\n`;
    } else {
      avisosPrevios.forEach((a, i) => {
        texto += `${i + 1}. *${a.aluno_nome}*\n`;
        texto += `   📆 Sai em: ${a.mes_saida ? new Date(a.mes_saida).toLocaleDateString('pt-BR', { month: 'long' }) : 'N/A'}\n`;
        texto += `   🎸 ${a.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${a.motivo || 'Sem motivo'}\n\n`;
      });
    }

    texto += `🚪 *EVASÕES (${evasoes.length})*\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (evasoes.length === 0) {
      texto += `Nenhuma evasão registrada 🎉\n\n`;
    } else {
      const interrompidos = evasoes.filter(e => e.tipo_evasao === 'interrompido').length;
      const naoRenovou = evasoes.filter(e => e.tipo_evasao === 'nao_renovou').length;
      texto += `• Interrompido: *${interrompidos}*\n`;
      texto += `• Não Renovou: *${naoRenovou}*\n\n`;
      
      evasoes.forEach((e, i) => {
        const tipoLabel = e.tipo_evasao === 'interrompido' ? '⏸️ Interrompido' : '❌ Não Renovou';
        texto += `${i + 1}. *${e.aluno_nome}*\n`;
        texto += `   ${tipoLabel} | 🎸 ${e.professor_nome || 'N/A'}\n`;
        texto += `   📝 ${e.motivo || 'Sem motivo'}\n\n`;
      });
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
        const dataFormatada = new Date(r.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
        const dataAviso = new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
        const dataFormatada = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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

  async function selecionarTipo(tipo: TipoRelatorio) {
    setTipoSelecionado(tipo);
    setErroIA(null);
    
    if (tipo === 'gerencial_ia') {
      setTextoRelatorio('');
      const texto = await gerarRelatorioGerencialIA();
      setTextoRelatorio(texto);
      return;
    }
    
    let texto = '';
    switch (tipo) {
      case 'diario':
        texto = gerarRelatorioDiario();
        break;
      case 'mensal':
        texto = gerarRelatorioMensal();
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

  function copiarRelatorio() {
    navigator.clipboard.writeText(textoRelatorio);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function voltar() {
    setTipoSelecionado(null);
    setTextoRelatorio('');
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
          <div className="space-y-4">
            {/* Seleção de Período */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <Label className="text-slate-300 text-sm font-medium mb-3 block">Período do Relatório</Label>
              
              {/* Botões de atalho */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { id: 'hoje', label: 'Hoje' },
                  { id: 'ontem', label: 'Ontem' },
                  { id: 'semana', label: 'Esta Semana' },
                  { id: 'mes', label: 'Este Mês' },
                  { id: 'personalizado', label: 'Personalizado' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setRelatorioPeriodo(p.id as typeof relatorioPeriodo);
                      const hojeDate = new Date();
                      if (p.id === 'hoje') {
                        setRelatorioDataInicio(hojeDate);
                        setRelatorioDataFim(hojeDate);
                      } else if (p.id === 'ontem') {
                        const ontem = new Date(hojeDate);
                        ontem.setDate(ontem.getDate() - 1);
                        setRelatorioDataInicio(ontem);
                        setRelatorioDataFim(ontem);
                      } else if (p.id === 'semana') {
                        const inicioSemana = new Date(hojeDate);
                        inicioSemana.setDate(hojeDate.getDate() - hojeDate.getDay());
                        setRelatorioDataInicio(inicioSemana);
                        setRelatorioDataFim(hojeDate);
                      } else if (p.id === 'mes') {
                        const inicioMes = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1);
                        setRelatorioDataInicio(inicioMes);
                        setRelatorioDataFim(hojeDate);
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
                onClick={() => selecionarTipo(tipo.id)}
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
                    onClick={() => selecionarTipo('gerencial_ia')}
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
                  onClick={() => selecionarTipo(tipoSelecionado)}
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
              </div>
            </div>
            
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
