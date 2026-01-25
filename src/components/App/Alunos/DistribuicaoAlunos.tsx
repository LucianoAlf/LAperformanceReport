import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Music, Calendar, Clock, Flame, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Aluno, Turma } from './AlunosPage';

interface DistribuicaoAlunosProps {
  alunos: Aluno[];
  turmas: Turma[];
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string}[];
}

export function DistribuicaoAlunos({ alunos, turmas, professores, cursos }: DistribuicaoAlunosProps) {
  const [mostrarTodosProfessores, setMostrarTodosProfessores] = useState(false);
  
  // Estatísticas por professor - TODOS os professores ativos
  const estatsPorProfessor = useMemo(() => {
    const stats: Record<number, { nome: string, totalAlunos: number, totalTurmas: number, mediaAlunos: number }> = {};
    
    professores.forEach(p => {
      const turmasProf = turmas.filter(t => t.professor_id === p.id);
      const totalAlunos = turmasProf.reduce((sum, t) => sum + t.total_alunos, 0);
      stats[p.id] = {
        nome: p.nome,
        totalAlunos,
        totalTurmas: turmasProf.length,
        mediaAlunos: turmasProf.length > 0 ? totalAlunos / turmasProf.length : 0
      };
    });
    
    // Ordenar por total de alunos (professores com turmas primeiro, depois sem turmas)
    return Object.values(stats)
      .sort((a, b) => b.totalAlunos - a.totalAlunos || a.nome.localeCompare(b.nome));
  }, [turmas, professores]);

  // Estatísticas por curso
  const estatsPorCurso = useMemo(() => {
    const stats: Record<string, { nome: string, totalAlunos: number, totalTurmas: number }> = {};
    
    turmas.forEach(t => {
      const cursoNome = t.curso_nome || 'Sem curso';
      if (!stats[cursoNome]) {
        stats[cursoNome] = { nome: cursoNome, totalAlunos: 0, totalTurmas: 0 };
      }
      stats[cursoNome].totalAlunos += t.total_alunos;
      stats[cursoNome].totalTurmas += 1;
    });
    
    return Object.values(stats).sort((a, b) => b.totalAlunos - a.totalAlunos);
  }, [turmas]);

  // Estatísticas por dia
  const estatsPorDia = useMemo(() => {
    const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return dias.map(dia => {
      const turmasDia = turmas.filter(t => t.dia_semana === dia);
      return {
        dia,
        totalTurmas: turmasDia.length,
        totalAlunos: turmasDia.reduce((sum, t) => sum + t.total_alunos, 0),
        turmasSozinhas: turmasDia.filter(t => t.total_alunos === 1).length
      };
    });
  }, [turmas]);

  // Estatísticas por horário
  const estatsPorHorario = useMemo(() => {
    const horarios: Record<string, { horario: string, totalTurmas: number, totalAlunos: number }> = {};
    
    turmas.forEach(t => {
      const h = t.horario_inicio?.substring(0, 5) || '00:00';
      if (!horarios[h]) {
        horarios[h] = { horario: h, totalTurmas: 0, totalAlunos: 0 };
      }
      horarios[h].totalTurmas += 1;
      horarios[h].totalAlunos += t.total_alunos;
    });
    
    return Object.values(horarios).sort((a, b) => a.horario.localeCompare(b.horario));
  }, [turmas]);

  // Mapa de calor: Dia x Horário
  const mapaCalor = useMemo(() => {
    const dias = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    // Horários: Seg-Sex 08:00-21:00, Sáb 08:00-16:00
    const horariosSegSex = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    const horariosSab = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
    
    const mapa: Record<string, Record<string, { alunos: number, turmas: number }>> = {};
    let maxAlunos = 0;
    
    dias.forEach(dia => {
      mapa[dia] = {};
      const horariosDia = dia === 'Sábado' ? horariosSab : horariosSegSex;
      horariosDia.forEach(h => {
        mapa[dia][h] = { alunos: 0, turmas: 0 };
      });
    });
    
    turmas.forEach(t => {
      const dia = t.dia_semana;
      const horarioCompleto = t.horario_inicio;
      
      if (!dia || !horarioCompleto) return;
      
      // Extrair hora do horário (pode vir como "16:00" ou "16:00:00")
      const h = horarioCompleto.substring(0, 5);
      
      // Debug: logar turmas de 16h que não estão sendo contadas
      if (h === '16:00' && (!mapa[dia] || mapa[dia][h] === undefined)) {
        console.log('⚠️ Turma 16h não mapeada:', { dia, horario: h, alunos: t.total_alunos, mapa_dia_existe: !!mapa[dia], horario_existe: mapa[dia] ? mapa[dia][h] !== undefined : false });
      }
      
      // Verificar se o dia existe no mapa e se o horário está disponível para aquele dia
      if (mapa[dia] && mapa[dia][h] !== undefined) {
        mapa[dia][h].alunos += t.total_alunos;
        mapa[dia][h].turmas += 1;
        if (mapa[dia][h].alunos > maxAlunos) {
          maxAlunos = mapa[dia][h].alunos;
        }
      }
    });
    
    return { mapa, maxAlunos, dias, horariosSegSex, horariosSab };
  }, [turmas]);

  // Insights do mapa de calor
  const insightsCalor = useMemo(() => {
    const { mapa, dias, horariosSegSex } = mapaCalor;
    const insights: string[] = [];
    
    // Encontrar horário de pico geral
    let maxTotal = 0;
    let horarioPico = '';
    let diaPico = '';
    
    dias.forEach(dia => {
      const horarios = dia === 'Sábado' ? mapaCalor.horariosSab : horariosSegSex;
      horarios.forEach(h => {
        if (mapa[dia][h].alunos > maxTotal) {
          maxTotal = mapa[dia][h].alunos;
          horarioPico = h;
          diaPico = dia;
        }
      });
    });
    
    if (horarioPico) {
      insights.push(`Horário de pico: ${diaPico} às ${horarioPico} com ${maxTotal} alunos`);
    }
    
    // Horários com baixa ocupação (manhã)
    let totalManha = 0;
    let totalTarde = 0;
    dias.forEach(dia => {
      const horarios = dia === 'Sábado' ? mapaCalor.horariosSab : horariosSegSex;
      horarios.forEach(h => {
        const hora = parseInt(h.split(':')[0]);
        if (hora < 12) {
          totalManha += mapa[dia][h].alunos;
        } else {
          totalTarde += mapa[dia][h].alunos;
        }
      });
    });
    
    const percentManha = Math.round((totalManha / (totalManha + totalTarde)) * 100) || 0;
    if (percentManha < 30) {
      insights.push(`Manhãs subutilizadas: apenas ${percentManha}% dos alunos estudam antes das 12h`);
    }
    
    // Sábado vs dias úteis
    let totalSab = 0;
    let totalSemana = 0;
    dias.forEach(dia => {
      const horarios = dia === 'Sábado' ? mapaCalor.horariosSab : horariosSegSex;
      horarios.forEach(h => {
        if (dia === 'Sábado') {
          totalSab += mapa[dia][h].alunos;
        } else {
          totalSemana += mapa[dia][h].alunos;
        }
      });
    });
    
    const mediaSemana = totalSemana / 5;
    if (totalSab > mediaSemana * 1.2) {
      insights.push(`Sábado é o dia mais procurado: ${totalSab} alunos (${Math.round((totalSab / mediaSemana - 1) * 100)}% acima da média)`);
    }
    
    return insights;
  }, [mapaCalor]);

  // Função para obter cor do mapa de calor
  const getCorCalor = (alunos: number, max: number) => {
    if (alunos === 0) return 'bg-slate-800/50';
    const intensidade = alunos / max;
    if (intensidade < 0.25) return 'bg-blue-900/60 text-blue-300';
    if (intensidade < 0.5) return 'bg-cyan-800/60 text-cyan-300';
    if (intensidade < 0.75) return 'bg-amber-700/60 text-amber-300';
    return 'bg-orange-600/70 text-orange-100';
  };

  const maxAlunosProfessor = Math.max(...estatsPorProfessor.map(p => p.totalAlunos), 1);
  const maxAlunosCurso = Math.max(...estatsPorCurso.map(c => c.totalAlunos), 1);
  const maxAlunosDia = Math.max(...estatsPorDia.map(d => d.totalAlunos), 1);

  return (
    <div className="p-6 space-y-8">
      {/* Distribuição por Professor */}
      <section>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Distribuição por Professor
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Carga de trabalho de cada professor (turmas e alunos totais).
              Use para <span className="text-purple-400 font-medium">equilibrar a distribuição</span> e identificar sobrecarga ou ociosidade.
            </p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">
            {estatsPorProfessor.length} professores
          </span>
        </div>
        <div className="grid gap-3">
          {(mostrarTodosProfessores ? estatsPorProfessor : estatsPorProfessor.slice(0, 15)).map(prof => (
            <div key={prof.nome} className={cn(
              "bg-slate-700/30 rounded-lg p-4",
              prof.totalTurmas === 0 && "opacity-50"
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">{prof.nome}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">{prof.totalTurmas} turmas</span>
                  <span className="text-purple-400 font-medium">{prof.totalAlunos} alunos</span>
                  <span className="text-slate-500">
                    (média: {prof.mediaAlunos.toFixed(1)})
                  </span>
                </div>
              </div>
              <div className="w-full bg-slate-600 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{ width: `${(prof.totalAlunos / maxAlunosProfessor) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {estatsPorProfessor.length > 15 && (
          <button
            onClick={() => setMostrarTodosProfessores(!mostrarTodosProfessores)}
            className="mt-4 w-full py-2 text-sm text-purple-400 hover:text-purple-300 flex items-center justify-center gap-2 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            {mostrarTodosProfessores ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Mostrar menos
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Mostrar todos ({estatsPorProfessor.length} professores)
              </>
            )}
          </button>
        )}
      </section>

      {/* Distribuição por Curso */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Music className="w-5 h-5 text-cyan-400" />
            Distribuição por Curso
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Popularidade de cada curso (total de alunos e turmas).
            Use para <span className="text-cyan-400 font-medium">planejar investimentos</span> em instrumentos, materiais e contratação de especialistas.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {estatsPorCurso.map(curso => (
            <div key={curso.nome} className="bg-slate-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">{curso.nome}</span>
                <span className="text-purple-400 font-bold">{curso.totalAlunos}</span>
              </div>
              <div className="w-full bg-slate-600 rounded-full h-2 mb-2">
                <div
                  className="bg-cyan-500 h-2 rounded-full transition-all"
                  style={{ width: `${(curso.totalAlunos / maxAlunosCurso) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">{curso.totalTurmas} turmas</p>
            </div>
          ))}
        </div>
      </section>

      {/* Distribuição por Dia */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Distribuição por Dia da Semana
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Total de alunos por dia somando <span className="text-emerald-400 font-medium">todos os horários</span>.
            Use para identificar dias com maior demanda e equilibrar a grade semanal.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {estatsPorDia.map(dia => (
            <div key={dia.dia} className="bg-slate-700/30 rounded-lg p-4 text-center">
              <h4 className="font-medium text-white mb-2">{dia.dia}</h4>
              <p className="text-3xl font-bold text-purple-400">{dia.totalAlunos}</p>
              <p className="text-xs text-slate-500 mt-1">{dia.totalTurmas} turmas</p>
              {dia.turmasSozinhas > 0 && (
                <p className="text-xs text-red-400 mt-1 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {dia.turmasSozinhas} sozinhos
                </p>
              )}
              <div className="w-full bg-slate-600 rounded-full h-2 mt-3">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${(dia.totalAlunos / maxAlunosDia) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Distribuição por Horário */}
      <section>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-400" />
              Distribuição por Horário
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Total de alunos por horário somando <span className="text-purple-400 font-medium">todos os dias da semana</span>.
              Use para identificar horários de pico e planejar infraestrutura (salas, professores).
            </p>
          </div>
        </div>
        <div className="bg-slate-700/30 rounded-lg p-4">
          <div className="flex items-end gap-2 h-40 mb-8">
            {estatsPorHorario.map(h => {
              const maxAlunos = Math.max(...estatsPorHorario.map(x => x.totalAlunos), 1);
              const altura = (h.totalAlunos / maxAlunos) * 100;
              
              return (
                <div key={h.horario} className="flex-1 flex flex-col items-center">
                  <span className="text-xs font-semibold text-purple-300 mb-1">{h.totalAlunos}</span>
                  <div
                    className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-400"
                    style={{ height: `${altura}%`, minHeight: h.totalAlunos > 0 ? '8px' : '0' }}
                    title={`${h.horario} - ${h.totalAlunos} alunos em ${h.totalTurmas} turma(s)`}
                  />
                  <span className="text-[10px] font-medium text-white bg-slate-800/80 px-1.5 py-0.5 rounded mt-2 whitespace-nowrap">
                    {h.horario}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mapa de Calor - Ocupação por Dia e Horário */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            Mapa de Calor - Ocupação por Dia e Horário
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Cada <span className="text-white font-medium">número representa a quantidade de alunos</span> que têm aula naquele dia e horário específico.
            Cores mais <span className="text-orange-400 font-medium">quentes (laranja/vermelho)</span> indicam horários de pico com maior demanda.
            Use para identificar os melhores horários para novas matrículas e equilibrar a ocupação.
          </p>
        </div>
        
        <div className="bg-slate-800/50 rounded-xl p-4 overflow-x-auto">
          {/* Cabeçalho com horários */}
          <div className="flex">
            <div className="w-20 flex-shrink-0" /> {/* Espaço para labels dos dias */}
            <div className="flex-1 flex gap-1">
              {mapaCalor.horariosSegSex.map(h => (
                <div key={h} className="flex-1 min-w-[40px] text-center">
                  <span className="text-[10px] font-medium text-slate-400">{h.substring(0, 2)}h</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Linhas do mapa (dias) */}
          <div className="mt-2 space-y-1">
            {mapaCalor.dias.map(dia => {
              const horariosDia = dia === 'Sábado' ? mapaCalor.horariosSab : mapaCalor.horariosSegSex;
              
              return (
                <div key={dia} className="flex items-center">
                  <div className="w-20 flex-shrink-0 pr-2">
                    <span className="text-xs font-medium text-slate-300">{dia.substring(0, 3)}</span>
                  </div>
                  <div className="flex-1 flex gap-1">
                    {mapaCalor.horariosSegSex.map(h => {
                      const dados = mapaCalor.mapa[dia][h];
                      const disponivel = horariosDia.includes(h);
                      
                      if (!disponivel) {
                        return (
                          <div 
                            key={h} 
                            className="flex-1 min-w-[40px] h-10 rounded bg-slate-900/50"
                            title="Horário não disponível"
                          />
                        );
                      }
                      
                      return (
                        <Tooltip
                          key={h}
                          content={`${dia} ${h}: ${dados?.alunos || 0} alunos em ${dados?.turmas || 0} turma(s)`}
                          side="top"
                        >
                          <div 
                            className={cn(
                              "flex-1 min-w-[40px] h-10 rounded flex items-center justify-center cursor-pointer transition-all hover:scale-105 hover:z-10",
                              getCorCalor(dados?.alunos || 0, mapaCalor.maxAlunos)
                            )}
                          >
                            <span className="text-xs font-bold">
                              {dados?.alunos || 0}
                            </span>
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Legenda */}
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <span className="text-xs font-medium text-slate-300">Intensidade de ocupação:</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-slate-800/50" />
                  <span className="text-[10px] text-slate-400">Vazio (0)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-900/60" />
                  <span className="text-[10px] text-slate-400">Baixo (1-25%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-cyan-800/60" />
                  <span className="text-[10px] text-slate-400">Médio (25-50%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-700/60" />
                  <span className="text-[10px] text-slate-400">Alto (50-75%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-orange-600/70" />
                  <span className="text-[10px] text-slate-400">Pico (75-100%)</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 italic">
              💡 Passe o mouse sobre cada célula para ver detalhes: quantidade exata de alunos e turmas naquele horário
            </p>
          </div>
        </div>
        
        {/* Insights */}
        {insightsCalor.length > 0 && (
          <div className="mt-4 bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-xl p-4 border border-amber-700/30">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-300 mb-2">Insights</h4>
                <ul className="space-y-1">
                  {insightsCalor.map((insight, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-amber-400">•</span>
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
