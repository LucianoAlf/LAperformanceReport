// Templates de Cenário - Conservador, Moderado, Arrojado
// Admin define apenas o número de alunos objetivo por unidade
// O resto dos cálculos é feito automaticamente baseado nos dados históricos

import { useEffect, useState } from 'react';
import { Turtle, Scale, Rocket, Zap, Pencil, Check, X, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface TemplatesCenarioProps {
  unidadeId: string | null;
  alunosAtual: number;
  ticketAtual: number;
  churnAtual: number;
  historicoLeadExp: number;
  historicoExpMat: number;
  onAplicarTemplate: (valores: {
    alunosObjetivo: number;
    ticketMedio: number;
    churnProjetado: number;
    taxaLeadExp: number;
    taxaExpMat: number;
    mrrObjetivo: number;
  }) => void;
}

interface TemplateDB {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
  icone: string;
  score_estimado: string;
  ativo: boolean;
  ordem: number;
}

interface TemplateUnidade {
  template_id: string;
  unidade_id: string;
  alunos_objetivo: number;
  ticket_medio: number | null;
  churn_projetado: number | null;
  taxa_lead_exp: number | null;
  taxa_exp_mat: number | null;
  mrr_objetivo: number | null;
}

// Mapeamento de ícones
const iconMap: Record<string, LucideIcon> = {
  turtle: Turtle,
  scale: Scale,
  rocket: Rocket,
};

// Mapeamento de cores
const corMap: Record<string, { text: string; bg: string; badge: string }> = {
  emerald: { text: 'text-emerald-400', bg: 'from-emerald-500/20 to-emerald-600/10', badge: 'bg-emerald-500/20 text-emerald-400' },
  amber: { text: 'text-amber-400', bg: 'from-amber-500/20 to-amber-600/10', badge: 'bg-amber-500/20 text-amber-400' },
  rose: { text: 'text-rose-400', bg: 'from-rose-500/20 to-rose-600/10', badge: 'bg-rose-500/20 text-rose-400' },
  cyan: { text: 'text-cyan-400', bg: 'from-cyan-500/20 to-cyan-600/10', badge: 'bg-cyan-500/20 text-cyan-400' },
  violet: { text: 'text-violet-400', bg: 'from-violet-500/20 to-violet-600/10', badge: 'bg-violet-500/20 text-violet-400' },
};


export function TemplatesCenario({
  unidadeId,
  alunosAtual,
  ticketAtual,
  churnAtual,
  historicoLeadExp,
  historicoExpMat,
  onAplicarTemplate,
}: TemplatesCenarioProps) {
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState<TemplateDB[]>([]);
  const [templateUnidades, setTemplateUnidades] = useState<TemplateUnidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [alunosEdit, setAlunosEdit] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);

  // Carregar templates do banco
  useEffect(() => {
    carregarTemplates();
  }, [unidadeId]);

  async function carregarTemplates() {
    if (!unidadeId) {
      setLoading(false);
      return;
    }
    
    try {
      // Carregar templates base
      const { data: templatesData, error: templatesError } = await supabase
        .from('templates_cenario')
        .select('id, nome, descricao, cor, icone, score_estimado, ativo, ordem')
        .eq('ativo', true)
        .order('ordem');
      
      if (templatesError) throw templatesError;
      
      // Carregar configurações por unidade
      const { data: unidadeData, error: unidadeError } = await supabase
        .from('templates_cenario_unidade')
        .select('template_id, unidade_id, alunos_objetivo')
        .eq('unidade_id', unidadeId);
      
      if (unidadeError) throw unidadeError;
      
      if (templatesData) setTemplates(templatesData);
      if (unidadeData) setTemplateUnidades(unidadeData as TemplateUnidade[]);
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
    } finally {
      setLoading(false);
    }
  }

  // Obter alunos objetivo configurado para um template (ou fallback)
  const getAlunosObjetivo = (templateId: string): number => {
    const config = templateUnidades.find(t => t.template_id === templateId);
    if (config) return config.alunos_objetivo;
    
    // Fallback: multiplicadores padrão
    const defaults: Record<string, number> = {
      conservador: 1.10,
      moderado: 1.20,
      arrojado: 1.35,
    };
    return Math.round(alunosAtual * (defaults[templateId] || 1.15));
  };

  // Churn fixo por tipo de template
  const getChurnPorTemplate = (templateId: string): number => {
    const churns: Record<string, number> = {
      conservador: 5.0,
      moderado: 4.5,
      arrojado: 4.0,
    };
    return churns[templateId] || 4.5;
  };

  // Calcular TODOS os parâmetros automaticamente baseado no alunos objetivo
  // Churn é fixo por template, taxas de conversão são calculadas
  const calcularParametros = (alunosObjetivo: number, templateId: string) => {
    // Crescimento necessário
    const crescimentoNecessario = alunosObjetivo - alunosAtual;
    
    // Ticket médio permanece o mesmo
    const ticketMedio = Math.round(ticketAtual * 10) / 10;
    
    // MRR objetivo
    const mrrObjetivo = Math.round(alunosObjetivo * ticketMedio);
    
    // Churn fixo por template
    const churnProjetado = getChurnPorTemplate(templateId);
    
    // Evasões projetadas com o churn do template
    const evasoesProjetadas = Math.round(alunosAtual * (churnProjetado / 100));
    
    // Matrículas necessárias = crescimento + evasões
    const matriculasNecessarias = crescimentoNecessario + evasoesProjetadas;
    
    // Calcular taxas de conversão NECESSÁRIAS para atingir as matrículas
    // Baseado na quantidade de leads histórica média mensal
    // Fórmula: conversaoTotal = matriculas / leads
    // Precisamos ajustar as taxas para atingir as matrículas necessárias
    
    // Conversão total histórica
    const conversaoHistorica = (historicoLeadExp / 100) * (historicoExpMat / 100);
    
    // Fator de ajuste: quanto precisamos melhorar a conversão
    // Se precisamos de mais matrículas com mesmos leads, precisamos aumentar conversão
    const matriculasHistoricas = alunosAtual > 0 ? Math.round(alunosAtual * 0.15) : 10; // ~15% de renovação
    const fatorAjuste = matriculasNecessarias > 0 && matriculasHistoricas > 0
      ? Math.max(matriculasNecessarias / matriculasHistoricas, 1)
      : 1;
    
    // Distribuir o aumento entre as duas taxas (raiz quadrada para distribuir)
    const ajustePorTaxa = Math.sqrt(fatorAjuste);
    
    // Taxa Lead → Exp: ajustar proporcionalmente
    const taxaLeadExp = Math.min(
      Math.round((historicoLeadExp * ajustePorTaxa) * 10) / 10,
      50 // máximo 50%
    );
    
    // Taxa Exp → Mat: ajustar proporcionalmente
    const taxaExpMat = Math.min(
      Math.round((historicoExpMat * ajustePorTaxa) * 10) / 10,
      85 // máximo 85%
    );
    
    return {
      alunosObjetivo,
      ticketMedio,
      churnProjetado,
      taxaLeadExp,
      taxaExpMat,
      mrrObjetivo,
    };
  };

  const handleAplicar = (template: TemplateDB) => {
    const alunosObjetivo = getAlunosObjetivo(template.id);
    const valores = calcularParametros(alunosObjetivo, template.id);
    onAplicarTemplate(valores);
  };

  const handleEditar = (template: TemplateDB) => {
    setEditando(template.id);
    setAlunosEdit(getAlunosObjetivo(template.id));
  };

  const handleSalvar = async () => {
    if (!editando || !unidadeId) return;
    
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('templates_cenario_unidade')
        .upsert({
          template_id: editando,
          unidade_id: unidadeId,
          alunos_objetivo: alunosEdit,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'template_id,unidade_id',
        });
      
      if (error) throw error;
      
      await carregarTemplates();
      setEditando(null);
    } catch (err) {
      console.error('Erro ao salvar template:', err);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-xl" />
          <div className="h-4 bg-slate-700 rounded w-40" />
        </div>
      </div>
    );
  }

  if (!unidadeId) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/20 rounded-xl">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Templates de Cenário</h3>
            <p className="text-sm text-slate-400">Clique para preencher automaticamente os parâmetros</p>
          </div>
        </div>
        {isAdmin && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Admin: defina o objetivo de alunos para cada template
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((template) => {
          const Icon = iconMap[template.icone] || Scale;
          const cores = corMap[template.cor] || corMap.cyan;
          const alunosObjetivo = getAlunosObjetivo(template.id);
          const parametros = calcularParametros(alunosObjetivo, template.id);
          const isEditing = editando === template.id;
          const crescimentoPct = alunosAtual > 0 ? Math.round(((alunosObjetivo / alunosAtual) - 1) * 100) : 0;

          if (isEditing && isAdmin) {
            // Preview dos cálculos automáticos baseado no alunos editado
            const previewParams = calcularParametros(alunosEdit, template.id);
            const crescimentoPreview = alunosAtual > 0 ? Math.round(((alunosEdit / alunosAtual) - 1) * 100) : 0;
            const churnTemplate = getChurnPorTemplate(template.id);
            const evasoesPreview = Math.round(alunosAtual * (churnTemplate / 100));
            const matriculasPreview = (alunosEdit - alunosAtual) + evasoesPreview;
            const conversaoPreview = (previewParams.taxaLeadExp / 100) * (previewParams.taxaExpMat / 100);
            const leadsPreview = conversaoPreview > 0 ? Math.ceil(matriculasPreview / conversaoPreview) : 0;
            
            return (
              <div
                key={template.id}
                className="rounded-xl border border-violet-500/50 p-4 bg-slate-800 col-span-1 md:col-span-3"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("p-2 rounded-lg bg-slate-700", cores.text)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={cn("font-semibold", cores.text)}>Editando: {template.nome}</h4>
                    <p className="text-xs text-slate-400">Defina o objetivo de alunos - o sistema calcula o resto automaticamente</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Campo editável: apenas alunos objetivo */}
                  <div className="bg-slate-700/50 rounded-xl p-4">
                    <label className="text-sm text-cyan-400 block mb-2 font-medium">
                      Alunos Objetivo para {template.nome}
                    </label>
                    <input
                      type="number"
                      value={alunosEdit}
                      onChange={(e) => setAlunosEdit(Number(e.target.value))}
                      className="w-full bg-slate-800 border-2 border-cyan-500/50 rounded-xl px-4 py-3 text-3xl font-bold text-cyan-400 text-center"
                    />
                    <p className="text-sm text-slate-400 mt-2 text-center">
                      Atual: <span className="text-white font-medium">{alunosAtual}</span> → 
                      Crescimento: <span className={cn("font-bold", crescimentoPreview >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {crescimentoPreview >= 0 ? '+' : ''}{crescimentoPreview}%
                      </span>
                    </p>
                  </div>
                  
                  {/* Preview dos cálculos automáticos */}
                  <div className="bg-slate-700/50 rounded-xl p-4">
                    <p className="text-sm text-slate-400 mb-3 font-medium">Cálculo Automático (baseado no histórico):</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Evasões projetadas:</span>
                        <span className="text-rose-400 font-medium">~{evasoesPreview}/ano</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Matrículas necessárias:</span>
                        <span className="text-emerald-400 font-medium">{matriculasPreview}/ano</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Leads necessários:</span>
                        <span className="text-amber-400 font-medium">~{leadsPreview}/ano</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">MRR Projetado:</span>
                        <span className="text-white font-medium">R$ {previewParams.mrrObjetivo.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-500">
                      Ticket: R$ {ticketAtual.toFixed(0)} • Churn: {churnTemplate}% • 
                      Conversão: {(conversaoPreview * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleSalvar}
                    disabled={salvando}
                    className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setEditando(null)}
                    className="flex-1 bg-slate-600 hover:bg-slate-500 text-white text-sm py-2.5 rounded-lg flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                </div>
              </div>
            );
          }

          return (
            <button
              key={template.id}
              onClick={() => handleAplicar(template)}
              className={cn(
                "relative overflow-hidden rounded-xl border border-slate-700/50 p-4 text-left transition-all duration-200",
                "hover:border-slate-600 hover:shadow-lg hover:shadow-slate-900/50 hover:scale-[1.02]",
                "bg-gradient-to-br",
                cores.bg
              )}
            >
              {/* Botão de editar (apenas admin) */}
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditar(template); }}
                  className="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors z-10"
                  title="Configurar template"
                >
                  <Pencil className="w-3 h-3 text-slate-400" />
                </button>
              )}

              {/* Ícone */}
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("p-2 rounded-lg bg-slate-800/50", cores.text)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={cn("font-semibold", cores.text)}>{template.nome}</h4>
                  <p className="text-xs text-slate-400">{template.descricao}</p>
                </div>
              </div>

              {/* Métricas principais */}
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Crescimento</span>
                  <span className={cn("font-medium", cores.text)}>+{crescimentoPct}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Alunos</span>
                  <span className="text-white font-medium">{alunosObjetivo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">MRR</span>
                  <span className="text-white font-medium">
                    R$ {parametros.mrrObjetivo >= 1000 
                      ? `${(parametros.mrrObjetivo / 1000).toFixed(0)}k` 
                      : parametros.mrrObjetivo.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Score estimado */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                <span className="text-xs text-slate-500">Score estimado</span>
                <span className={cn("text-sm font-bold px-2 py-0.5 rounded", cores.badge)}>
                  {template.score_estimado}
                </span>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-slate-900/90 px-3 py-1.5 rounded-lg text-sm font-medium text-white">
                  Aplicar Template
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
