// Componente: Modelo de Garantia para Professores
import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcularCustoPorTurma, formatarMoeda } from '@/lib/simulador-turma/calculos';

interface ModeloGarantiaProps {
  valorBase: number;
  incremento: number;
  mediaMeta: number;
  ticketMedio: number;
}

export function ModeloGarantia({
  valorBase,
  incremento,
  mediaMeta,
  ticketMedio,
}: ModeloGarantiaProps) {
  const [alunosProfessor, setAlunosProfessor] = useState(20);
  const [mediaAtualProf, setMediaAtualProf] = useState(1.0);

  // Cálculos de transição
  const semanas = 4;
  const horasAtuais = alunosProfessor / mediaAtualProf; // Número de turmas atuais
  const horasMeta = alunosProfessor / mediaMeta; // Número de turmas na meta
  
  // Ganho atual (individual)
  const custoTurmaAtual = calcularCustoPorTurma(mediaAtualProf, valorBase, incremento, semanas);
  const ganhoAtual = horasAtuais * custoTurmaAtual;
  
  // Ganho na meta
  const custoTurmaMeta = calcularCustoPorTurma(mediaMeta, valorBase, incremento, semanas);
  const ganhoMeta = horasMeta * custoTurmaMeta;
  
  // Diferença (garantia necessária)
  const diferencaGarantia = ganhoAtual - ganhoMeta;
  
  // Cenário pessimista: 6 meses de garantia
  const garantia6Meses = diferencaGarantia * 6;
  
  // Cenário otimista: preenche no mês 2
  const receitaNovaPorAluno = ticketMedio;
  const alunosNovos = Math.ceil(alunosProfessor * (mediaMeta - 1) / mediaMeta);
  const receitaNova6Meses = alunosNovos * receitaNovaPorAluno * 5; // 5 meses de receita nova
  const lucroOtimista = receitaNova6Meses - diferencaGarantia; // Só 1 mês de garantia

  return (
    <div className="bg-slate-800/50 border-l-4 border-cyan-500 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-cyan-400" />
        <h3 className="font-semibold text-white">MODELO DE GARANTIA PARA PROFESSORES</h3>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Simule o impacto de garantir a renda do professor durante a transição
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inputs do professor exemplo */}
        <div className="space-y-4">
          <div className="p-4 bg-slate-900/50 rounded-xl">
            <p className="text-slate-500 text-sm mb-2">Professor exemplo:</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 text-xs">Alunos</p>
                <input
                  type="number"
                  value={alunosProfessor}
                  onChange={(e) => setAlunosProfessor(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xl font-bold text-white text-center focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <p className="text-slate-500 text-xs">Média Atual</p>
                <input
                  type="number"
                  value={mediaAtualProf}
                  step="0.1"
                  min="1.0"
                  max="3.0"
                  onChange={(e) => setMediaAtualProf(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xl font-bold text-white text-center focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Cenário de Transição */}
          <div className="bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30 rounded-xl p-4">
            <p className="text-cyan-400 font-medium mb-3">📋 Cenário de Transição</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Ganho atual ({horasAtuais.toFixed(0)}h × R${custoTurmaAtual.toFixed(0)}/4):</span>
                <span className="font-medium text-white">{formatarMoeda(ganhoAtual)}/mês</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ganho meta {mediaMeta.toFixed(1)} ({horasMeta.toFixed(0)} turmas × R${custoTurmaMeta.toFixed(0)}/4):</span>
                <span className="font-medium text-white">{formatarMoeda(ganhoMeta)}/mês</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-cyan-500/30">
                <span className="text-slate-400">Diferença (garantia):</span>
                <span className={cn(
                  'font-medium',
                  diferencaGarantia > 0 ? 'text-rose-400' : 'text-emerald-400'
                )}>
                  {diferencaGarantia > 0 ? '-' : '+'}{formatarMoeda(Math.abs(diferencaGarantia))}/mês
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cenários */}
        <div className="space-y-4">
          {/* Cenário Pessimista */}
          <div className="p-4 bg-slate-900/50 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-medium">Cenário Pessimista</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Garantia 6 meses:</span>
                <span className="text-white">{formatarMoeda(garantia6Meses)}</span>
              </div>
              <div className="flex justify-between text-amber-400">
                <span>Resultado:</span>
                <span>Empate</span>
              </div>
            </div>
          </div>

          {/* Cenário Otimista */}
          <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Cenário Otimista</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Garantia paga:</span>
                <span className="text-white">{formatarMoeda(diferencaGarantia)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Receita nova:</span>
                <span className="text-emerald-400">+{formatarMoeda(receitaNova6Meses)}</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold">
                <span>Lucro 6 meses:</span>
                <span>{formatarMoeda(lucroOtimista)} 🚀</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-6 p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
        <p className="text-cyan-400 text-sm flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          <strong>Risco ZERO no pior cenário</strong> — escola apenas empata. Coordenação filtra junções viáveis.
        </p>
      </div>
    </div>
  );
}
