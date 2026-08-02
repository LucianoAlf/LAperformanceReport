import { cn } from '@/lib/utils';
import type { AlunoAgenda, AulaAgenda } from '@/hooks/useAgendaDia';

function corRisco(v: number): string {
  if (v >= 60) return 'text-rose-400';
  if (v >= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

// Nota vem de `pesquisas_whatsapp` (escala 1-5), mas o dado pode chegar fora
// da faixa (registro manual/legado) — clampar antes de repetir string evita
// RangeError em `String.prototype.repeat` com valor negativo.
function notaClampada(nota: number): number {
  return Math.min(5, Math.max(0, Math.round(nota)));
}

export function AgendaDrawer({
  aula,
  mostrarUnidade = false,
}: {
  aula: AulaAgenda | null;
  // Na agenda consolidada o painel tambem precisa dizer de qual escola e a
  // aula: o rotulo do trilho pode ter ficado fora da viewport apos rolagem
  // horizontal. Com unidade selecionada, repetir seria ruido.
  mostrarUnidade?: boolean;
}) {
  if (!aula) {
    return (
      <aside className="w-[296px] shrink-0 border-l border-slate-700 bg-slate-800/50 p-4 text-sm text-slate-400">
        Selecione uma aula na timeline para ver os detalhes.
      </aside>
    );
  }

  // A ordem de `alunos` vem de jsonb_agg(distinct ...), que e arbitraria —
  // com 2+ alunos, alunos[0] e um aluno QUALQUER da turma. Tratar esse como
  // "o" aluno poria o nome dele no titulo e so os dados dele no bloco
  // individual, contradizendo a lista da turma logo abaixo. Por isso o
  // enriquecimento individual so aparece quando a aula tem exatamente 1 aluno.
  const aluno: AlunoAgenda | null = aula.alunos.length === 1 ? aula.alunos[0] : null;

  return (
    <aside className="flex w-[296px] shrink-0 flex-col gap-3.5 border-l border-slate-700 bg-slate-800/50 p-4">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          {aula.hora_inicio}–{aula.hora_fim} · {aula.duracao_minutos} min
        </p>
        <h2 className="text-[17px] font-semibold leading-tight">
          {aluno ? aluno.nome : aula.turma_nome || aula.curso_nome || 'Aula'}
        </h2>
        <p className="text-xs text-slate-400">
          {[aula.curso_nome, aula.sala_nome, aula.professor_nome].filter(Boolean).join(' · ')}
        </p>
        {mostrarUnidade && aula.unidade_nome && (
          <p className="text-xs font-semibold text-cyan-400">{aula.unidade_nome}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {aula.categoria === 'experimental' && <Etiqueta tom="violeta">Experimental</Etiqueta>}
        {aula.cancelada && <Etiqueta tom="rosa">Cancelada</Etiqueta>}
        {aula.reagendada && <Etiqueta tom="ambar">Reagendada</Etiqueta>}
        {aula.justificada && <Etiqueta tom="neutro">Justificada</Etiqueta>}
        {aula.turma_nome && <Etiqueta tom="neutro">{aula.turma_nome}</Etiqueta>}
        {aula.nr_da_aula && <Etiqueta tom="neutro">Aula {aula.nr_da_aula}</Etiqueta>}
        {aula.alunos.length === 0 && !aula.cancelada && (
          <Etiqueta tom="neutro">Sem aluno vinculado</Etiqueta>
        )}
      </div>

      {aula.reagendada && aula.hora_original && (
        <p className="text-xs text-slate-400">Agendamento original: {aula.hora_original}</p>
      )}

      {aluno && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
            {aluno.idade !== null && <Linha rotulo="Idade" valor={`${aluno.idade} anos`} />}
            {aluno.responsavel_nome && <Linha rotulo="Responsável" valor={aluno.responsavel_nome} />}
            {aluno.responsavel_telefone && <Linha rotulo="Contato" valor={aluno.responsavel_telefone} />}
            {aluno.status_presenca && <Linha rotulo="Presença" valor={aluno.status_presenca} />}
          </dl>

          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Só no LA Report
          </p>
          <div className="flex flex-col gap-1.5 text-[12.5px]">
            {aluno.risco_pct !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Risco de evasão</span>
                <span className={cn('font-semibold tabular-nums', corRisco(aluno.risco_pct))}>
                  {aluno.risco_pct}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Financeiro</span>
              <span className={aluno.inadimplente ? 'text-rose-400' : 'text-emerald-400'}>
                {aluno.inadimplente ? 'Inadimplente' : 'Em dia'}
              </span>
            </div>
            {aluno.nota_pesquisa !== null && (
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Pesquisa 1ª aula</span>
                <span className={aluno.nota_pesquisa <= 2 ? 'text-rose-400' : 'text-emerald-400'}>
                  {'★'.repeat(notaClampada(aluno.nota_pesquisa))}
                  {'☆'.repeat(5 - notaClampada(aluno.nota_pesquisa))}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {aula.alunos.length > 1 && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            Turma · {aula.alunos.length} alunos
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {aula.alunos.map((a, indice) => (
              <li
                key={a.aluno_id ?? `${a.nome}-${indice}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate text-slate-300">{a.nome}</span>
                {a.risco_pct !== null && (
                  <span className={cn('shrink-0 font-semibold tabular-nums', corRisco(a.risco_pct))}>
                    {a.risco_pct}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {aula.anotacoes && (
        <>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Anotações</p>
          <p className="text-[12.5px] text-slate-300">{aula.anotacoes}</p>
        </>
      )}
    </aside>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className="text-slate-400">{rotulo}</dt>
      <dd className="m-0 truncate text-right">{valor}</dd>
    </>
  );
}

function Etiqueta({ tom, children }: { tom: 'violeta' | 'rosa' | 'ambar' | 'neutro'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-[10.5px] font-semibold',
        tom === 'violeta' && 'border-violet-400 bg-violet-500/15 text-violet-300',
        tom === 'rosa' && 'border-rose-400 bg-rose-500/15 text-rose-300',
        tom === 'ambar' && 'border-amber-400 bg-amber-500/15 text-amber-300',
        tom === 'neutro' && 'border-slate-600 bg-slate-900 text-slate-300',
      )}
    >
      {children}
    </span>
  );
}
