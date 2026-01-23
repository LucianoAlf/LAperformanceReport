import { useMemo } from 'react';
import { AlertTriangle, BarChart3, Music, Calendar, Clock } from 'lucide-react';
import type { Aluno, Turma } from './AlunosPage';

interface DistribuicaoAlunosProps {
  alunos: Aluno[];
  turmas: Turma[];
  professores: {id: number, nome: string}[];
  cursos: {id: number, nome: string}[];
}

export function DistribuicaoAlunos({ alunos, turmas, professores, cursos }: DistribuicaoAlunosProps) {
  // Estatísticas por professor
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
    
    return Object.values(stats)
      .filter(s => s.totalTurmas > 0)
      .sort((a, b) => b.totalAlunos - a.totalAlunos);
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

  const maxAlunosProfessor = Math.max(...estatsPorProfessor.map(p => p.totalAlunos), 1);
  const maxAlunosCurso = Math.max(...estatsPorCurso.map(c => c.totalAlunos), 1);
  const maxAlunosDia = Math.max(...estatsPorDia.map(d => d.totalAlunos), 1);

  return (
    <div className="p-6 space-y-8">
      {/* Distribuição por Professor */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            Distribuição por Professor
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Carga de trabalho de cada professor (turmas e alunos totais).
            Use para <span className="text-purple-400 font-medium">equilibrar a distribuição</span> e identificar sobrecarga ou ociosidade.
          </p>
        </div>
        <div className="grid gap-3">
          {estatsPorProfessor.slice(0, 10).map(prof => (
            <div key={prof.nome} className="bg-slate-700/30 rounded-lg p-4">
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
    </div>
  );
}
