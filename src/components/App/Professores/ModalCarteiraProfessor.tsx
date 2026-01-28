import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import {
  X, Users, Baby, School, Wallet, TrendingUp, Clock, Music,
  Download, PieChart, BarChart3, GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

// Interface para carteira do professor
interface CarteiraProfessor {
  id: number;
  nome: string;
  foto_url: string | null;
  total_alunos: number;
  alunos_lamk: number;
  alunos_emla: number;
  mrr_total: number;
  ticket_medio: number;
  tempo_medio_meses: number;
  total_turmas: number;
  media_alunos_turma: number;
  cursos: string[];
  unidades: string[];
}

interface DistribuicaoCurso {
  curso: string;
  quantidade: number;
  percentual: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  professor: CarteiraProfessor | null;
  unidadeAtual: UnidadeId;
}

export function ModalCarteiraProfessor({ open, onClose, professor, unidadeAtual }: Props) {
  const [distribuicaoCursos, setDistribuicaoCursos] = useState<DistribuicaoCurso[]>([]);
  const [alunosCompletos, setAlunosCompletos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && professor) {
      carregarDistribuicao();
    }
  }, [open, professor]);

  const carregarDistribuicao = async () => {
    if (!professor) return;
    setLoading(true);

    try {
      let query = supabase
        .from('alunos')
        .select(`
          id, nome, classificacao, valor_parcela, tempo_permanencia_meses,
          dia_aula, horario_aula, data_fim_contrato, data_matricula, telefone, email,
          cursos(nome), unidades(nome)
        `)
        .eq('professor_atual_id', professor.id)
        .eq('status', 'ativo')
        .order('nome');

      if (unidadeAtual !== 'todos') {
        query = query.eq('unidade_id', unidadeAtual);
      }

      const { data } = await query;

      // Calcular data_fim_contrato para alunos que não têm
      const alunosComContrato = (data || []).map((aluno: any) => {
        let fimContrato = aluno.data_fim_contrato;
        if (!fimContrato && aluno.data_matricula) {
          const dataMatricula = new Date(aluno.data_matricula);
          const fimCalculado = new Date(dataMatricula);
          fimCalculado.setFullYear(fimCalculado.getFullYear() + 1);
          fimContrato = fimCalculado.toISOString().split('T')[0];
        }
        return { ...aluno, data_fim_contrato: fimContrato };
      });

      // Salvar alunos completos para exportação
      setAlunosCompletos(alunosComContrato);

      // Agrupar por curso
      const contagem = new Map<string, number>();
      (data || []).forEach((a: any) => {
        const curso = (a.cursos as any)?.nome || 'Não informado';
        contagem.set(curso, (contagem.get(curso) || 0) + 1);
      });

      const total = data?.length || 0;
      const distribuicao: DistribuicaoCurso[] = Array.from(contagem.entries())
        .map(([curso, quantidade]) => ({
          curso,
          quantidade,
          percentual: total > 0 ? (quantidade / total) * 100 : 0
        }))
        .sort((a, b) => b.quantidade - a.quantidade);

      setDistribuicaoCursos(distribuicao);
    } catch (error) {
      console.error('Erro ao carregar distribuição:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportarLista = () => {
    if (!professor || alunosCompletos.length === 0) return;

    // Criar CSV
    const headers = ['Nome', 'Escola', 'Curso', 'Unidade', 'Dia', 'Horário', 'Parcela', 'Permanência (meses)', 'Telefone', 'Email', 'Fim Contrato'];
    const rows = alunosCompletos.map((aluno: any) => [
      aluno.nome || '',
      aluno.classificacao || '',
      (aluno.cursos as any)?.nome || '',
      (aluno.unidades as any)?.nome || '',
      aluno.dia_aula || '',
      aluno.horario_aula ? aluno.horario_aula.substring(0, 5) : '',
      aluno.valor_parcela ? `R$ ${Number(aluno.valor_parcela).toFixed(2)}` : '',
      aluno.tempo_permanencia_meses || '0',
      aluno.telefone || '',
      aluno.email || '',
      aluno.data_fim_contrato ? new Date(aluno.data_fim_contrato).toLocaleDateString('pt-BR') : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Criar blob e download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `carteira_${professor.nome.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Iniciais do nome
  const getIniciais = (nome: string) => {
    return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  // Cores para gráfico de barras
  const coresGrafico = [
    'bg-violet-500',
    'bg-cyan-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-blue-500',
    'bg-pink-500',
    'bg-indigo-500'
  ];

  // Cor do indicador de média/turma
  const getCorMediaTurma = (media: number) => {
    if (media >= 1.8) return 'text-green-400 bg-green-500/20';
    if (media >= 1.5) return 'text-yellow-400 bg-yellow-500/20';
    return 'text-red-400 bg-red-500/20';
  };

  if (!professor) return null;

  const percentualLamk = professor.total_alunos > 0 
    ? (professor.alunos_lamk / professor.total_alunos) * 100 
    : 0;
  const percentualEmla = professor.total_alunos > 0 
    ? (professor.alunos_emla / professor.total_alunos) * 100 
    : 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {getIniciais(professor.nome)}
            </div>
            
            {/* Info */}
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-white">
                {professor.nome}
              </DialogTitle>
              <p className="text-sm text-slate-400 mt-1">
                {professor.cursos.join(', ')} • {professor.unidades.join(' | ')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Cards de Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Total Alunos */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{professor.total_alunos}</p>
              <p className="text-xs text-slate-400">Alunos Ativos</p>
            </div>

            {/* MRR */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-emerald-400 truncate">
                {professor.mrr_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-400">MRR Total</p>
            </div>

            {/* Ticket Médio */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
              <p className="text-xl font-bold text-cyan-400 truncate">
                {professor.ticket_medio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-400">Ticket Médio</p>
            </div>

            {/* Média/Turma */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getCorMediaTurma(professor.media_alunos_turma)}`}>
                  <GraduationCap className="w-4 h-4" />
                </div>
              </div>
              <p className={`text-xl font-bold ${getCorMediaTurma(professor.media_alunos_turma).split(' ')[0]}`}>
                {professor.media_alunos_turma.toFixed(1)}
              </p>
              <p className="text-xs text-slate-400">Média/Turma</p>
            </div>
          </div>

          {/* Segunda linha de cards */}
          <div className="grid grid-cols-3 gap-3">
            {/* LAMK */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Baby className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">LA Music Kids</span>
              </div>
              <p className="text-xl font-bold text-cyan-400">{professor.alunos_lamk}</p>
              <p className="text-xs text-slate-500">{percentualLamk.toFixed(0)}% da carteira</p>
            </div>

            {/* EMLA */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <School className="w-4 h-4 text-violet-400" />
                <span className="text-xs text-slate-400">LA Music School</span>
              </div>
              <p className="text-xl font-bold text-violet-400">{professor.alunos_emla}</p>
              <p className="text-xs text-slate-500">{percentualEmla.toFixed(0)}% da carteira</p>
            </div>

            {/* Tempo Médio */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">Permanência</span>
              </div>
              <p className="text-xl font-bold text-amber-400">{professor.tempo_medio_meses.toFixed(1)}m</p>
              <p className="text-xs text-slate-500">tempo médio</p>
            </div>
          </div>

          {/* Gráfico LAMK vs EMLA */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h3 className="font-medium text-white">Distribuição LAMK vs EMLA</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-6 rounded-full overflow-hidden bg-slate-700 flex">
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-cyan-400 h-full transition-all duration-500"
                    style={{ width: `${percentualLamk}%` }}
                  />
                  <div 
                    className="bg-gradient-to-r from-violet-500 to-violet-400 h-full transition-all duration-500"
                    style={{ width: `${percentualEmla}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-cyan-500" />
                  LAMK {percentualLamk.toFixed(0)}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-violet-500" />
                  EMLA {percentualEmla.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Distribuição por Curso */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-slate-400" />
              <h3 className="font-medium text-white">Alunos por Curso</h3>
            </div>
            <div className="space-y-3">
              {distribuicaoCursos.map((item, index) => (
                <div key={item.curso} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 min-w-0">
                    <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-300 truncate">{item.curso}</span>
                  </div>
                  <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${coresGrafico[index % coresGrafico.length]} transition-all duration-500`}
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-400 w-16 text-right">
                    {item.quantidade} ({item.percentual.toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Fechar
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={exportarLista}
              disabled={alunosCompletos.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Lista
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
