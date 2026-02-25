import React, { useEffect, useState, useCallback } from 'react';
import { Save, Loader2, Copy, Check, Calendar } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { cn } from '../../../lib/utils';
import { EditableCell } from '../Spreadsheet';
import { toast } from 'sonner';

interface SnapshotData {
  id?: number;
  unidade_id: string;
  data: string;
  // Números gerais (editáveis)
  alunos_ativos: number;
  bolsistas_integral: number;
  bolsistas_parcial: number;
  matriculas_banda: number;
  matriculas_segundo_curso: number;
  trancados: number;
  em_atraso: number;
  // Financeiro
  ticket_medio: number;
  faturamento_realizado: number;
  // Calculados
  alunos_pagantes?: number;
  faturamento_previsto?: number;
}

interface ResumoMes {
  leads: number;
  experimentais_agendadas: number;
  experimentais_realizadas: number;
  matriculas: number;
  evasoes: number;
  renovacoes: number;
  nao_renovacoes: number;
  avisos_previos: number;
}

interface Unidade {
  id: string;
  nome: string;
}

export function SnapshotDiario() {
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [resumoMes, setResumoMes] = useState<ResumoMes>({
    leads: 0,
    experimentais_agendadas: 0,
    experimentais_realizadas: 0,
    matriculas: 0,
    evasoes: 0,
    renovacoes: 0,
    nao_renovacoes: 0,
    avisos_previos: 0,
  });
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDirty, setIsDirty] = useState(false);

  // Carregar unidades
  useEffect(() => {
    const loadUnidades = async () => {
      try {
        const { data } = await supabase.from('unidades').select('id, nome').order('nome');
        if (data) {
          setUnidades(data);
          // Selecionar unidade do usuário ou primeira
          if (usuario?.unidade_id) {
            setSelectedUnidade(usuario.unidade_id);
          } else if (data.length > 0) {
            setSelectedUnidade(data[0].id);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar unidades:', error);
      }
    };

    loadUnidades();
  }, [usuario?.unidade_id]);

  // Carregar snapshot e resumo do mês
  const loadData = useCallback(async () => {
    if (!selectedUnidade) return;

    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // Buscar snapshot do dia
      const { data: snapshotData } = await sb
        .from('relatorios_diarios')
        .select('*')
        .eq('unidade_id', selectedUnidade)
        .eq('data', selectedDate)
        .single();

      if (snapshotData) {
        setSnapshot(snapshotData);
      } else {
        // Criar snapshot vazio com valores padrão
        setSnapshot({
          unidade_id: selectedUnidade,
          data: selectedDate,
          alunos_ativos: 0,
          bolsistas_integral: 0,
          bolsistas_parcial: 0,
          matriculas_banda: 0,
          matriculas_segundo_curso: 0,
          trancados: 0,
          em_atraso: 0,
          ticket_medio: 0,
          faturamento_realizado: 0,
        });
      }

      // Buscar resumo do mês atual
      const mesAtual = selectedDate.slice(0, 7); // YYYY-MM
      const inicioMes = `${mesAtual}-01`;
      const fimMes = `${mesAtual}-31`;

      // Leads do mês
      const { data: leadsData } = await sb
        .from('leads')
        .select('status, quantidade')
        .eq('unidade_id', selectedUnidade)
        .gte('data_contato', inicioMes)
        .lte('data_contato', fimMes);

      // Evasões do mês
      const { data: evasoesData } = await sb
        .from('movimentacoes_admin')
        .select('tipo')
        .in('tipo', ['evasao', 'nao_renovacao', 'aviso_previo'])
        .eq('unidade_id', selectedUnidade)
        .gte('data', inicioMes)
        .lte('data', fimMes);

      // Renovações do mês
      const { data: renovacoesData } = await sb
        .from('renovacoes')
        .select('status')
        .eq('unidade_id', selectedUnidade)
        .gte('data_renovacao', inicioMes)
        .lte('data_renovacao', fimMes);

      // Calcular resumo
      const resumo: ResumoMes = {
        leads: 0,
        experimentais_agendadas: 0,
        experimentais_realizadas: 0,
        matriculas: 0,
        evasoes: 0,
        renovacoes: 0,
        nao_renovacoes: 0,
        avisos_previos: 0,
      };

      if (leadsData) {
        leadsData.forEach((l: any) => {
          if (['novo','agendado'].includes(l.status)) resumo.leads += l.quantidade || 0;
          if (l.status === 'experimental_agendada') resumo.experimentais_agendadas += l.quantidade || 0;
          if (['experimental_realizada','compareceu'].includes(l.status)) resumo.experimentais_realizadas += l.quantidade || 0;
          if (['matriculado','convertido'].includes(l.status)) resumo.matriculas += 1;
        });
      }

      if (evasoesData) {
        evasoesData.forEach((e: any) => {
          if (e.tipo === 'aviso_previo') resumo.avisos_previos += 1;
          else resumo.evasoes += 1;
        });
      }

      if (renovacoesData) {
        renovacoesData.forEach((r: any) => {
          if (r.status === 'renovado') resumo.renovacoes += 1;
          else if (r.status === 'nao_renovou') resumo.nao_renovacoes += 1;
        });
      }

      setResumoMes(resumo);
      setIsDirty(false);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [selectedUnidade, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Atualizar campo do snapshot
  const updateField = (field: keyof SnapshotData, value: number | null) => {
    if (!snapshot) return;

    setSnapshot(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value || 0 };
    });
    setIsDirty(true);
  };

  // Calcular valores derivados
  const calcularPagantes = () => {
    if (!snapshot) return 0;
    return snapshot.alunos_ativos - snapshot.bolsistas_integral - snapshot.bolsistas_parcial - snapshot.matriculas_banda;
  };

  const calcularFaturamentoPrevisto = () => {
    if (!snapshot) return 0;
    return calcularPagantes() * snapshot.ticket_medio;
  };

  // Salvar snapshot
  const saveSnapshot = async () => {
    if (!snapshot) return;

    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const dataToSave = {
        unidade_id: snapshot.unidade_id,
        data: snapshot.data,
        alunos_ativos: snapshot.alunos_ativos,
        bolsistas_integral: snapshot.bolsistas_integral,
        bolsistas_parcial: snapshot.bolsistas_parcial,
        matriculas_banda: snapshot.matriculas_banda,
        matriculas_segundo_curso: snapshot.matriculas_segundo_curso,
        trancados: snapshot.trancados,
        em_atraso: snapshot.em_atraso,
        ticket_medio: snapshot.ticket_medio,
        faturamento_realizado: snapshot.faturamento_realizado,
        alunos_pagantes: calcularPagantes(),
        faturamento_previsto: calcularFaturamentoPrevisto(),
        updated_at: new Date().toISOString(),
      };

      if (snapshot.id) {
        // Update
        const { error } = await sb
          .from('relatorios_diarios')
          .update(dataToSave)
          .eq('id', snapshot.id);

        if (error) throw error;
      } else {
        // Insert
        const { data, error } = await sb
          .from('relatorios_diarios')
          .insert({ ...dataToSave, created_by: usuario?.id })
          .select()
          .single();

        if (error) throw error;
        setSnapshot(prev => prev ? { ...prev, id: data.id } : prev);
      }

      setIsDirty(false);
      toast.success('Snapshot salvo!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar snapshot');
    } finally {
      setSaving(false);
    }
  };

  // Gerar relatório WhatsApp
  const gerarRelatorioWhatsApp = () => {
    if (!snapshot) return '';

    const unidadeNome = unidades.find(u => u.id === selectedUnidade)?.nome || 'Unidade';
    const dataFormatada = new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR');
    const pagantes = calcularPagantes();
    const totalBolsistas = snapshot.bolsistas_integral + snapshot.bolsistas_parcial;

    // Formato Farmers
    const relatorioFarmers = `*UNIDADE:* ${unidadeNome}
Data: ${dataFormatada}

● Alunos Ativos: ${snapshot.alunos_ativos}
● Bolsistas: ${snapshot.bolsistas_integral}+${snapshot.bolsistas_parcial} (Parcial)
● Pagantes: ${pagantes}

● Não pagantes no mês: ${totalBolsistas}
Bolsistas: ${snapshot.bolsistas_integral}
Bolsista Parcial: ${snapshot.bolsistas_parcial}

● Matrículas Ativas: ${snapshot.alunos_ativos}
● Matrículas em Banda: ${snapshot.matriculas_banda}
● Matrículas de segundo curso: ${snapshot.matriculas_segundo_curso}

🔸 *RENOVAÇÕES*
* Renovações realizadas no mês: ${resumoMes.renovacoes}
* Não renovações: ${resumoMes.nao_renovacoes}

🔸 *AVISOS PRÉVIOS*
● Total no mês: ${resumoMes.avisos_previos}

🔸 *EVASÕES* (Saíram esse mês)
● Total de evasões do mês: ${resumoMes.evasoes}`;

    return relatorioFarmers;
  };

  // Copiar para clipboard
  const copiarRelatorio = async () => {
    const relatorio = gerarRelatorioWhatsApp();
    try {
      await navigator.clipboard.writeText(relatorio);
      setCopied(true);
      toast.success('Relatório copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Erro ao copiar:', error);
      toast.error('Erro ao copiar relatório');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Snapshot Diário
          </h1>
          <p className="text-muted-foreground">Fechamento diário de números e métricas</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Seletor de Unidade */}
          {usuario?.perfil === 'admin' && (
            <select
              value={selectedUnidade}
              onChange={(e) => setSelectedUnidade(e.target.value)}
              className="px-3 py-2 bg-background border rounded-lg text-sm"
            >
              {unidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          )}
          {/* Seletor de Data */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 bg-background border rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Números Gerais */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Números Gerais (editável)</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Alunos Ativos</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.alunos_ativos}
                  onChange={(v) => updateField('alunos_ativos', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Bolsistas Integral</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.bolsistas_integral}
                  onChange={(v) => updateField('bolsistas_integral', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Bolsistas Parcial</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.bolsistas_parcial}
                  onChange={(v) => updateField('bolsistas_parcial', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Matrículas em Banda</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.matriculas_banda}
                  onChange={(v) => updateField('matriculas_banda', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Matrículas 2º Curso</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.matriculas_segundo_curso}
                  onChange={(v) => updateField('matriculas_segundo_curso', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Trancados</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.trancados}
                  onChange={(v) => updateField('trancados', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Em Atraso</span>
              <div className="w-24">
                <EditableCell
                  value={snapshot?.em_atraso}
                  onChange={(v) => updateField('em_atraso', v as number)}
                  type="number"
                  className="border rounded text-right"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Calculados */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Calculados (automático)</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
              <span className="text-sm font-medium">Alunos Pagantes</span>
              <span className="text-xl font-bold text-primary">{calcularPagantes()}</span>
            </div>
            <div className="text-xs text-muted-foreground ml-2">
              = Ativos - Bolsistas - Banda
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-sm">Ticket Médio</span>
              <div className="w-32">
                <EditableCell
                  value={snapshot?.ticket_medio}
                  onChange={(v) => updateField('ticket_medio', v as number)}
                  type="number"
                  prefix="R$"
                  className="border rounded text-right"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded mt-4">
              <span className="text-sm font-medium">Faturamento Previsto</span>
              <span className="text-xl font-bold text-green-400">
                R$ {calcularFaturamentoPrevisto().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground ml-2">
              = Pagantes × Ticket Médio
            </div>
          </div>
        </div>
      </div>

      {/* Acumulado do Mês */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Acumulado do Mês (das planilhas)</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{resumoMes.leads}</div>
            <div className="text-sm text-muted-foreground">Leads</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-cyan-400">{resumoMes.experimentais_realizadas}</div>
            <div className="text-sm text-muted-foreground">Experimentais</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{resumoMes.matriculas}</div>
            <div className="text-sm text-muted-foreground">Matrículas</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{resumoMes.evasoes}</div>
            <div className="text-sm text-muted-foreground">Evasões</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-emerald-400">{resumoMes.renovacoes}</div>
            <div className="text-sm text-muted-foreground">Renovações</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-400">{resumoMes.nao_renovacoes}</div>
            <div className="text-sm text-muted-foreground">Não Renovações</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-400">{resumoMes.avisos_previos}</div>
            <div className="text-sm text-muted-foreground">Avisos Prévios</div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-400">{resumoMes.experimentais_agendadas}</div>
            <div className="text-sm text-muted-foreground">Exp. Agendadas</div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={copiarRelatorio}
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado!' : 'Copiar para WhatsApp'}
        </button>
        <button
          onClick={saveSnapshot}
          disabled={saving || !isDirty}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
            isDirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Snapshot
        </button>
      </div>
    </div>
  );
}
