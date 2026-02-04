'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  MessageSquare,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Heart,
  Video,
  FileText,
  Bell,
  Loader2,
  ChevronDown,
  ChevronUp,
  Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { supabase } from '@/lib/supabase';
import { sendWhatsAppMessage, formatPhoneNumber } from '@/services/whatsapp';
import { useColaboradorAtual } from './hooks';

interface RecadosTabProps {
  unidadeId: string;
}

interface Professor {
  id: number;
  nome: string;
  telefone_whatsapp: string | null;
  total_alunos: number;
  alunos: Aluno[];
}

interface Aluno {
  id: number;
  nome: string;
  health_score: 'verde' | 'amarelo' | 'vermelho' | null;
}

interface Template {
  id: string;
  nome: string;
  mensagem: string;
  variaveis: string[];
}

interface Campanha {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  total_destinatarios: number;
  enviados: number;
  erros: number;
  created_at: string;
}

const TIPOS_RECADO = [
  { value: 'health_score', label: 'Avaliação Health Score', icon: Heart, color: 'text-pink-400' },
  { value: 'video', label: 'Lembrete de Vídeos', icon: Video, color: 'text-blue-400' },
  { value: 'relatorio', label: 'Relatório Mensal', icon: FileText, color: 'text-amber-400' },
  { value: 'aviso', label: 'Aviso Geral', icon: Bell, color: 'text-violet-400' },
];

export function RecadosTab({ unidadeId }: RecadosTabProps) {
  const { colaborador } = useColaboradorAtual();
  const [professores, setProfessores] = useState<Professor[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });

  // Form state
  const [tipoRecado, setTipoRecado] = useState<string>('health_score');
  const [templateSelecionado, setTemplateSelecionado] = useState<string>('');
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [dataLimite, setDataLimite] = useState<Date | undefined>();
  const [professoresSelecionados, setProfessoresSelecionados] = useState<number[]>([]);

  useEffect(() => {
    if (unidadeId) {
      fetchData();
    }
  }, [unidadeId]);

  useEffect(() => {
    // Atualizar mensagem quando template for selecionado
    const template = templates.find(t => t.id === templateSelecionado);
    if (template) {
      setMensagem(template.mensagem);
      setTitulo(template.nome);
    }
  }, [templateSelecionado, templates]);

  async function fetchData() {
    setLoading(true);
    try {
      // Buscar professores com alunos da unidade
      const { data: profs } = await supabase
        .from('professores')
        .select(`
          id,
          nome,
          telefone_whatsapp,
          alunos!alunos_professor_atual_id_fkey(id, nome, health_score)
        `)
        .eq('ativo', true)
        .not('telefone_whatsapp', 'is', null);

      // Filtrar professores que têm alunos na unidade
      let alunosQuery = supabase
        .from('alunos')
        .select('professor_atual_id')
        .eq('status', 'ativo');
      
      // Só filtra por unidade se não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        alunosQuery = alunosQuery.eq('unidade_id', unidadeId);
      }
      
      const { data: alunosUnidade } = await alunosQuery;

      const professorIds = [...new Set(alunosUnidade?.map(a => a.professor_atual_id).filter(Boolean))];
      
      const professoresFiltrados = profs?.filter(p => professorIds.includes(p.id)).map(p => ({
        ...p,
        total_alunos: p.alunos?.length || 0,
        alunos: p.alunos || []
      })) || [];

      setProfessores(professoresFiltrados);

      // Buscar templates de recados
      const { data: tmpl } = await supabase
        .from('farmer_templates')
        .select('id, nome, mensagem, variaveis')
        .eq('categoria', 'recado_professor')
        .eq('ativo', true)
        .order('ordem');

      setTemplates(tmpl || []);

      // Buscar campanhas recentes
      let campQuery = supabase
        .from('farmer_recados_campanhas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (unidadeId && unidadeId !== 'todos') {
        campQuery = campQuery.eq('unidade_id', unidadeId);
      }
      
      const { data: camp } = await campQuery;

      setCampanhas(camp || []);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  function gerarMensagemPersonalizada(professor: Professor): string {
    let msg = mensagem;
    
    // Substituir variáveis
    msg = msg.replace('{nome_professor}', professor.nome.split(' ')[0]);
    
    if (dataLimite) {
      msg = msg.replace('{data_limite}', dataLimite.toLocaleDateString('pt-BR'));
    }
    
    // Gerar lista de alunos
    const listaAlunos = professor.alunos
      .map((a, i) => `${i + 1} - ${a.nome}`)
      .join('\n');
    msg = msg.replace('{lista_alunos}', listaAlunos || 'Nenhum aluno cadastrado');
    
    return msg;
  }

  async function enviarRecados() {
    if (!colaborador || professoresSelecionados.length === 0) return;

    setEnviando(true);
    setProgresso({ atual: 0, total: professoresSelecionados.length });

    try {
      // Usar unidade do colaborador quando for "todos" (consolidado)
      const unidadeParaCampanha = unidadeId === 'todos' ? colaborador.unidade_id : unidadeId;
      
      // Criar campanha
      const { data: campanha, error: campanhaError } = await supabase
        .from('farmer_recados_campanhas')
        .insert({
          unidade_id: unidadeParaCampanha,
          colaborador_id: colaborador.id,
          titulo,
          tipo: tipoRecado,
          template_id: templateSelecionado || null,
          mensagem_base: mensagem,
          data_limite: dataLimite?.toISOString().split('T')[0],
          status: 'enviando',
          total_destinatarios: professoresSelecionados.length,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (campanhaError) throw campanhaError;

      let enviados = 0;
      let erros = 0;

      // Enviar para cada professor com delay de 10 segundos
      for (let i = 0; i < professoresSelecionados.length; i++) {
        const profId = professoresSelecionados[i];
        const professor = professores.find(p => p.id === profId);
        
        if (!professor || !professor.telefone_whatsapp) {
          erros++;
          continue;
        }

        const mensagemPersonalizada = gerarMensagemPersonalizada(professor);
        const numeroFormatado = formatPhoneNumber(professor.telefone_whatsapp);

        // Registrar destinatário
        await supabase.from('farmer_recados_destinatarios').insert({
          campanha_id: campanha.id,
          professor_id: professor.id,
          whatsapp: numeroFormatado,
          mensagem_personalizada: mensagemPersonalizada,
          status: 'pendente'
        });

        // Enviar mensagem
        const resultado = await sendWhatsAppMessage({
          to: numeroFormatado,
          text: mensagemPersonalizada
        });

        // Atualizar status do destinatário
        await supabase
          .from('farmer_recados_destinatarios')
          .update({
            status: resultado.success ? 'enviado' : 'erro',
            enviado_at: resultado.success ? new Date().toISOString() : null,
            erro_mensagem: resultado.error || null
          })
          .eq('campanha_id', campanha.id)
          .eq('professor_id', professor.id);

        if (resultado.success) {
          enviados++;
        } else {
          erros++;
        }

        setProgresso({ atual: i + 1, total: professoresSelecionados.length });

        // Delay de 10 segundos entre mensagens (exceto na última)
        if (i < professoresSelecionados.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }

      // Atualizar campanha como concluída
      await supabase
        .from('farmer_recados_campanhas')
        .update({
          status: 'concluida',
          enviados,
          erros,
          completed_at: new Date().toISOString()
        })
        .eq('id', campanha.id);

      // Recarregar dados
      await fetchData();
      setShowModal(false);
      resetForm();

    } catch (error) {
      console.error('Erro ao enviar recados:', error);
    } finally {
      setEnviando(false);
    }
  }

  function resetForm() {
    setTipoRecado('health_score');
    setTemplateSelecionado('');
    setTitulo('');
    setMensagem('');
    setDataLimite(undefined);
    setProfessoresSelecionados([]);
  }

  function toggleProfessor(profId: number) {
    setProfessoresSelecionados(prev =>
      prev.includes(profId)
        ? prev.filter(id => id !== profId)
        : [...prev, profId]
    );
  }

  function selecionarTodos() {
    if (professoresSelecionados.length === professores.length) {
      setProfessoresSelecionados([]);
    } else {
      setProfessoresSelecionados(professores.map(p => p.id));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-violet-400" />
            Recados para Professores
          </h3>
          <p className="text-sm text-slate-400">
            Envie mensagens em massa via WhatsApp para os professores
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
        >
          <Send className="w-4 h-4 mr-2" />
          Novo Disparo
        </Button>
      </div>

      {/* Tipos de Recado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TIPOS_RECADO.map(tipo => {
          const Icon = tipo.icon;
          const count = campanhas.filter(c => c.tipo === tipo.value).length;
          return (
            <div
              key={tipo.value}
              className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"
            >
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-slate-700/50", tipo.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{tipo.label}</p>
                  <p className="text-xs text-slate-400">{count} envios</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Professores Disponíveis */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          Professores com WhatsApp ({professores.length})
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {professores.slice(0, 8).map(prof => (
            <div
              key={prof.id}
              className="flex items-center gap-2 p-2 bg-slate-700/30 rounded-lg"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                {prof.nome.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{prof.nome.split(' ')[0]}</p>
                <p className="text-xs text-slate-400">{prof.total_alunos} alunos</p>
              </div>
              <Phone className="w-3 h-3 text-emerald-400" />
            </div>
          ))}
          {professores.length > 8 && (
            <div className="flex items-center justify-center p-2 bg-slate-700/30 rounded-lg">
              <p className="text-sm text-slate-400">+{professores.length - 8} mais</p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico de Campanhas */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          Últimos Disparos
        </h4>
        {campanhas.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Nenhum disparo realizado ainda
          </p>
        ) : (
          <div className="space-y-2">
            {campanhas.map(camp => {
              const tipoInfo = TIPOS_RECADO.find(t => t.value === camp.tipo);
              const Icon = tipoInfo?.icon || Bell;
              return (
                <div
                  key={camp.id}
                  className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("w-4 h-4", tipoInfo?.color || 'text-slate-400')} />
                    <div>
                      <p className="text-sm text-white">{camp.titulo}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(camp.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400">
                      {camp.enviados}/{camp.total_destinatarios}
                    </span>
                    {camp.status === 'concluida' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : camp.status === 'enviando' ? (
                      <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Novo Disparo */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-violet-400" />
              Novo Disparo de Recados
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Tipo de Recado */}
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Tipo de Recado</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_RECADO.map(tipo => {
                  const Icon = tipo.icon;
                  return (
                    <button
                      key={tipo.value}
                      onClick={() => {
                        setTipoRecado(tipo.value);
                        // Selecionar template correspondente
                        const tmpl = templates.find(t => 
                          t.nome.toLowerCase().includes(tipo.value.replace('_', ' '))
                        );
                        if (tmpl) setTemplateSelecionado(tmpl.id);
                      }}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border transition-all",
                        tipoRecado === tipo.value
                          ? "bg-violet-500/20 border-violet-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", tipo.color)} />
                      <span className="text-sm">{tipo.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Template */}
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Template</label>
              <Select value={templateSelecionado} onValueChange={setTemplateSelecionado}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {templates.map(tmpl => (
                    <SelectItem key={tmpl.id} value={tmpl.id} className="text-white">
                      {tmpl.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Título */}
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Título da Campanha</label>
              <Input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Avaliação Health Score - Fevereiro"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {/* Data Limite */}
            <div>
              <label className="text-sm text-slate-300 mb-2 block">Data Limite (opcional)</label>
              <DatePicker
                date={dataLimite}
                onDateChange={setDataLimite}
                placeholder="Selecione a data limite"
              />
            </div>

            {/* Mensagem */}
            <div>
              <label className="text-sm text-slate-300 mb-2 block">
                Mensagem
                <span className="text-xs text-slate-500 ml-2">
                  Variáveis: {'{nome_professor}'}, {'{data_limite}'}, {'{lista_alunos}'}
                </span>
              </label>
              <Textarea
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                placeholder="Digite a mensagem..."
                className="bg-slate-800 border-slate-700 text-white min-h-[200px]"
              />
            </div>

            {/* Seleção de Professores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-300">
                  Professores ({professoresSelecionados.length}/{professores.length})
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selecionarTodos}
                  className="text-violet-400 hover:text-violet-300"
                >
                  {professoresSelecionados.length === professores.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto bg-slate-800 rounded-lg border border-slate-700 p-2 space-y-1">
                {professores.map(prof => (
                  <label
                    key={prof.id}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      professoresSelecionados.includes(prof.id)
                        ? "bg-violet-500/20"
                        : "hover:bg-slate-700/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={professoresSelecionados.includes(prof.id)}
                      onChange={() => toggleProfessor(prof.id)}
                      className="rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-white">{prof.nome}</p>
                      <p className="text-xs text-slate-400">
                        {prof.telefone_whatsapp} • {prof.total_alunos} alunos
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Progresso de Envio */}
            {enviando && (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white">Enviando mensagens...</span>
                  <span className="text-sm text-violet-400">
                    {progresso.atual}/{progresso.total}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-purple-500 h-2 rounded-full transition-all"
                    style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Aguarde... Delay de 10s entre mensagens para evitar bloqueio
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowModal(false)}
              disabled={enviando}
              className="text-slate-400"
            >
              Cancelar
            </Button>
            <Button
              onClick={enviarRecados}
              disabled={enviando || professoresSelecionados.length === 0 || !mensagem.trim()}
              className="bg-gradient-to-r from-violet-500 to-purple-500"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar para {professoresSelecionados.length} professor(es)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RecadosTab;
