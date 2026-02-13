import { useState, useMemo } from 'react';
import {
  FileText,
  Copy,
  Check,
  Calendar,
  CalendarDays,
  CalendarRange,
  MessageSquare,
  Download,
  Send,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadsCRM } from '../hooks/useLeadsCRM';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { LeadCRM } from '../types';

interface RelatoriosTabProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

type TipoRelatorio = 'diario' | 'semanal' | 'mensal' | 'funil' | 'tags' | 'mila' | 'metas';

const TIPOS_RELATORIO: { id: TipoRelatorio; label: string; icone: string; descricao: string }[] = [
  { id: 'diario', label: 'Diário', icone: '📋', descricao: 'Resumo do dia — leads, agendamentos, visitas' },
  { id: 'semanal', label: 'Semanal', icone: '📊', descricao: 'Performance da semana — taxas e evolução' },
  { id: 'mensal', label: 'Mensal', icone: '📈', descricao: 'Fechamento do mês — metas e resultados' },
  { id: 'funil', label: 'Funil', icone: '🔽', descricao: 'Conversão por etapa do pipeline' },
  { id: 'tags', label: 'KPIs Tags', icone: '🏷️', descricao: 'Status de tagueamento dos leads' },
  { id: 'mila', label: 'Mila', icone: '🤖', descricao: 'Atendimentos e passagens da SDR Bot' },
  { id: 'metas', label: 'Metas', icone: '🎯', descricao: 'Progresso das metas por unidade' },
];

export function RelatoriosTab({ unidadeId, ano, mes }: RelatoriosTabProps) {
  const { leads, loading } = useLeadsCRM({ unidadeId, ano, mes });
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoRelatorio>('diario');
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const enviarWhatsApp = async () => {
    setEnviando(true);
    setErroEnvio(null);

    try {
      const { data, error } = await supabase.functions.invoke('relatorio-admin-whatsapp', {
        body: {
          texto: textoRelatorio,
          tipoRelatorio: tipoSelecionado,
          unidade: unidadeId || 'todos',
          competencia: `${ano}-${String(mes).padStart(2, '0')}`,
        },
      });

      if (error) {
        console.error('[WhatsApp Pré-Atendimento] Erro:', error);
        setErroEnvio('Erro ao enviar mensagem');
        setTimeout(() => setErroEnvio(null), 5000);
        return;
      }

      if (data?.success || data?.partial) {
        setEnviado(true);
        toast.success('Relatório enviado para o grupo!');
        setTimeout(() => setEnviado(false), 3000);
      } else {
        setErroEnvio(data?.error || 'Erro ao enviar');
        toast.error(data?.error || 'Erro ao enviar');
        setTimeout(() => setErroEnvio(null), 5000);
      }
    } catch {
      setErroEnvio('Erro de conexão');
      toast.error('Erro de conexão');
      setTimeout(() => setErroEnvio(null), 5000);
    } finally {
      setEnviando(false);
    }
  };

  // Gerar texto do relatório
  const textoRelatorio = useMemo(() => {
    return gerarRelatorio(tipoSelecionado, leads, ano, mes);
  }, [tipoSelecionado, leads, ano, mes]);

  const copiarRelatorio = async () => {
    try {
      await navigator.clipboard.writeText(textoRelatorio);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = textoRelatorio;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Seletor de tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {TIPOS_RELATORIO.map(tipo => (
          <button
            key={tipo.id}
            onClick={() => setTipoSelecionado(tipo.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center",
              tipoSelecionado === tipo.id
                ? "bg-violet-500/10 border-violet-500/50 text-white"
                : "bg-slate-800/30 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600"
            )}
          >
            <span className="text-lg">{tipo.icone}</span>
            <span className="text-[10px] font-semibold">{tipo.label}</span>
          </button>
        ))}
      </div>

      {/* Preview do Relatório */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Texto */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-400" />
              Relatório {TIPOS_RELATORIO.find(t => t.id === tipoSelecionado)?.label}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-400 h-7 text-xs"
                onClick={copiarRelatorio}
              >
                {copiado ? (
                  <><Check className="w-3 h-3 mr-1 text-emerald-400" /> Copiado!</>
                ) : (
                  <><Copy className="w-3 h-3 mr-1" /> Copiar</>
                )}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
                onClick={enviarWhatsApp}
                disabled={enviando}
              >
                {enviando ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Enviando...</>
                ) : enviado ? (
                  <><Check className="w-3 h-3 mr-1" /> Enviado!</>
                ) : (
                  <><Send className="w-3 h-3 mr-1" /> Enviar WhatsApp</>
                )}
              </Button>
            </div>
          </div>
          {erroEnvio && (
            <div className="mb-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              ⚠️ {erroEnvio}
            </div>
          )}
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 rounded-xl p-4 max-h-[400px] overflow-y-auto border border-slate-700/30 leading-relaxed">
            {textoRelatorio}
          </pre>
        </div>

        {/* Preview WhatsApp */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Preview WhatsApp
            </h3>
          </div>
          <div className="bg-[#0b141a] rounded-2xl p-4 max-h-[400px] overflow-y-auto">
            {/* Balão de mensagem WhatsApp */}
            <div className="flex justify-end mb-2">
              <div className="bg-[#005c4b] rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%]">
                <pre className="text-xs text-white whitespace-pre-wrap font-sans leading-relaxed">
                  {textoRelatorio}
                </pre>
                <div className="text-right mt-1">
                  <span className="text-[9px] text-emerald-300/60">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// GERADOR DE RELATÓRIOS
// =============================================================================

function gerarRelatorio(tipo: TipoRelatorio, leads: LeadCRM[], ano: number, mes: number): string {
  const hoje = new Date();
  const hojeStr = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const mesLabel = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const total = leads.length;
  const agendadas = leads.filter(l => l.experimental_agendada).length;
  const visitaram = leads.filter(l => l.experimental_realizada).length;
  const matriculados = leads.filter(l => l.converteu).length;
  const faltaram = leads.filter(l => l.faltou_experimental).length;
  const taxaShowUp = total > 0 ? ((visitaram / total) * 100).toFixed(1) : '0.0';
  const taxaConversao = total > 0 ? ((matriculados / total) * 100).toFixed(1) : '0.0';

  // Leads de hoje
  const hojeISO = hoje.toISOString().split('T')[0];
  const leadsHoje = leads.filter(l => l.data_contato === hojeISO).length;

  // Tags
  const tagsOK = leads.filter(l =>
    l.canal_origem_id !== null && l.curso_interesse_id !== null &&
    l.faixa_etaria !== null && l.sabia_preco !== null
  ).length;
  const taxaTags = total > 0 ? ((tagsOK / total) * 100).toFixed(0) : '0';

  // Por unidade
  const porUnidade = (uid: string, nome: string) => {
    const u = leads.filter(l => l.unidade_id === uid);
    const uVisitaram = u.filter(l => l.experimental_realizada).length;
    const uMatric = u.filter(l => l.converteu).length;
    const uTaxa = u.length > 0 ? ((uVisitaram / u.length) * 100).toFixed(1) : '0.0';
    return `${nome}: ${u.length} leads | ${uVisitaram} visitas (${uTaxa}%) | ${uMatric} matrículas`;
  };

  switch (tipo) {
    case 'diario':
      return `📋 *RELATÓRIO DIÁRIO — PRÉ-ATENDIMENTO*
📅 ${hojeStr}

📊 *Resumo do Dia:*
• Novos leads hoje: ${leadsHoje}
• Total leads no mês: ${total}
• Agendamentos: ${agendadas}
• Visitas realizadas: ${visitaram}
• Matrículas: ${matriculados}

🎯 *Taxa Show-up:* ${taxaShowUp}% (meta: 30%)
📈 *Taxa Conversão:* ${taxaConversao}%

🏷️ *Tags:* ${taxaTags}% completas (${tagsOK}/${total})

📍 *Por Unidade:*
• ${porUnidade('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'CG')}
• ${porUnidade('95553e96-971b-4590-a6eb-0201d013c14d', 'REC')}
• ${porUnidade('368d47f5-2d88-4475-bc14-ba084a9a348e', 'BAR')}

_Andreza — Pré-Atendimento LA Music_`;

    case 'semanal':
      return `📊 *RELATÓRIO SEMANAL — PRÉ-ATENDIMENTO*
📅 Semana de ${hojeStr}

📈 *Performance:*
• Total leads: ${total}
• Agendamentos: ${agendadas}
• Visitas: ${visitaram}
• Matrículas: ${matriculados}
• Faltaram: ${faltaram}

🎯 *Taxas:*
• Show-up: ${taxaShowUp}% (meta 30%)
• Conversão: ${taxaConversao}%
• Tags completas: ${taxaTags}%

📍 *Por Unidade:*
• ${porUnidade('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'CG')}
• ${porUnidade('95553e96-971b-4590-a6eb-0201d013c14d', 'REC')}
• ${porUnidade('368d47f5-2d88-4475-bc14-ba084a9a348e', 'BAR')}

_Andreza — Pré-Atendimento LA Music_`;

    case 'mensal':
      return `📈 *FECHAMENTO MENSAL — PRÉ-ATENDIMENTO*
📅 ${mesLabel}

🏆 *Resultados:*
• Total leads: ${total}
• Agendamentos: ${agendadas}
• Visitas realizadas: ${visitaram}
• Matrículas: ${matriculados}
• Faltaram: ${faltaram}

🎯 *Metas:*
• Show-up: ${taxaShowUp}% ${Number(taxaShowUp) >= 30 ? '✅' : '❌'} (meta 30%)
• Tags: ${taxaTags}% ${Number(taxaTags) >= 90 ? '✅' : '❌'} (meta 100%)
• Conversão: ${taxaConversao}%

📍 *Por Unidade:*
• ${porUnidade('2ec861f6-023f-4d7b-9927-3960ad8c2a92', 'Campo Grande')}
• ${porUnidade('95553e96-971b-4590-a6eb-0201d013c14d', 'Recreio')}
• ${porUnidade('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Barra')}

_Andreza — Pré-Atendimento LA Music_`;

    case 'funil':
      return `🔽 *FUNIL DE CONVERSÃO*
📅 ${mesLabel}

${total} Leads
  ↓ ${agendadas} Agendadas (${total > 0 ? ((agendadas / total) * 100).toFixed(1) : 0}%)
    ↓ ${visitaram} Visitaram (${agendadas > 0 ? ((visitaram / agendadas) * 100).toFixed(1) : 0}%)
      ↓ ${matriculados} Matriculados (${visitaram > 0 ? ((matriculados / visitaram) * 100).toFixed(1) : 0}%)

❌ Faltaram: ${faltaram}
📊 Taxa geral Lead→Matrícula: ${taxaConversao}%`;

    case 'tags':
      return `🏷️ *STATUS DE TAGUEAMENTO*
📅 ${mesLabel}

📡 Canal de Origem: ${leads.filter(l => l.canal_origem_id !== null).length}/${total}
🎸 Curso de Interesse: ${leads.filter(l => l.curso_interesse_id !== null).length}/${total}
👶 Faixa Etária: ${leads.filter(l => l.faixa_etaria !== null).length}/${total}
💰 Sabe o Preço: ${leads.filter(l => l.sabia_preco !== null).length}/${total}

✅ Completos (4/4): ${tagsOK}/${total} (${taxaTags}%)
⚠️ Pendentes: ${total - tagsOK}`;

    case 'mila': {
      const mila = leads.filter(l => l.qtd_mensagens_mila > 0);
      const passagens = leads.filter(l => l.data_passagem_mila !== null);
      return `🤖 *PAINEL MILA — SDR BOT*
📅 ${mesLabel}

• Leads atendidos: ${mila.length}
• Passagens de bastão: ${passagens.length}
• Mensagens trocadas: ${mila.reduce((a, l) => a + l.qtd_mensagens_mila, 0)}
• Média msgs/lead: ${mila.length > 0 ? (mila.reduce((a, l) => a + l.qtd_mensagens_mila, 0) / mila.length).toFixed(1) : 0}`;
    }

    case 'metas':
      return `🎯 *PROGRESSO DAS METAS*
📅 ${mesLabel}

*Show-up Rate:* ${taxaShowUp}% / 30% ${Number(taxaShowUp) >= 30 ? '✅' : '⏳'}
*Tags Completas:* ${taxaTags}% / 100% ${Number(taxaTags) >= 90 ? '✅' : '⏳'}
*Conversão:* ${taxaConversao}%

📍 *Bônus por Unidade (R$150 cada):*
• CG: ${(() => { const u = leads.filter(l => l.unidade_id === '2ec861f6-023f-4d7b-9927-3960ad8c2a92'); const v = u.filter(l => l.experimental_realizada).length; const t = u.length > 0 ? ((v / u.length) * 100).toFixed(1) : '0.0'; return `${t}% ${Number(t) >= 30 ? '✅' : '❌'}`; })()}
• REC: ${(() => { const u = leads.filter(l => l.unidade_id === '95553e96-971b-4590-a6eb-0201d013c14d'); const v = u.filter(l => l.experimental_realizada).length; const t = u.length > 0 ? ((v / u.length) * 100).toFixed(1) : '0.0'; return `${t}% ${Number(t) >= 30 ? '✅' : '❌'}`; })()}
• BAR: ${(() => { const u = leads.filter(l => l.unidade_id === '368d47f5-2d88-4475-bc14-ba084a9a348e'); const v = u.filter(l => l.experimental_realizada).length; const t = u.length > 0 ? ((v / u.length) * 100).toFixed(1) : '0.0'; return `${t}% ${Number(t) >= 30 ? '✅' : '❌'}`; })()}`;

    default:
      return 'Selecione um tipo de relatório.';
  }
}

export default RelatoriosTab;
