import { useEffect } from 'react';
import { MessageCircle, Phone, X } from 'lucide-react';

import { formatCurrency } from '@/lib/utils';
import type { AlunoLista } from '@/hooks/useAlunosLista';

import { linkWhatsApp, quandoTemAula, seloDoAluno } from './seloAluno';

/**
 * O "resto mora na ficha" do arquétipo 1, numa folha.
 *
 * A ficha completa é o arquétipo 3 (cabeçalho fixo + abas + ação na base) e é
 * outra tela. Até ela existir, o que saiu da linha precisa estar a UM toque —
 * senão portar Alunos tira informação que a equipe tem hoje no desktop, que é
 * o oposto do combinado ("degradar, nunca bloquear").
 */

interface DetalheAlunoSheetProps {
  aluno: AlunoLista | null;
  onFechar: () => void;
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="truncate text-[13px] text-slate-200">{valor}</dd>
    </div>
  );
}

export function DetalheAlunoSheet({ aluno, onFechar }: DetalheAlunoSheetProps) {
  useEffect(() => {
    if (!aluno) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aluno, onFechar]);

  if (!aluno) return null;

  const selo = seloDoAluno(aluno);
  // O telefone do responsável é o caminho de contato de 392 alunos ativos que
  // não têm número próprio em campo nenhum — por isso ele entra na cascata.
  const contato = aluno.whatsapp || aluno.telefone || aluno.responsavel_telefone;
  const zap = linkWhatsApp(contato);
  const deResponsavel = !aluno.whatsapp && !aluno.telefone && !!aluno.responsavel_telefone;

  return (
    <>
      <button
        type="button"
        aria-label="Fechar detalhes do aluno"
        onClick={onFechar}
        className="fixed inset-0 z-40 bg-slate-950/70"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${aluno.nome}`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-4 pt-2"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-grotesk truncate text-base font-bold text-slate-50">{aluno.nome}</h2>
            <p className="truncate text-[12px] text-slate-400">
              {[aluno.curso_nome, aluno.professor_nome].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-1 flex h-9 w-9 flex-none items-center justify-center rounded-lg text-slate-400 active:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {selo && (
          <span className={`mb-3 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${selo.classe}`}>
            {selo.texto}
          </span>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-800 pt-3">
          <Campo rotulo="Aula" valor={quandoTemAula(aluno.dia_aula, aluno.horario_aula) || null} />
          <Campo rotulo="Unidade" valor={aluno.unidade_codigo} />
          <Campo rotulo="Matrícula" valor={aluno.tipo_matricula_nome} />
          <Campo
            rotulo="Parcela"
            valor={aluno.valor_parcela != null ? formatCurrency(aluno.valor_parcela, 2) : null}
          />
          <Campo
            rotulo="Vencimento"
            valor={aluno.dia_vencimento != null ? `dia ${aluno.dia_vencimento}` : null}
          />
          <Campo
            rotulo="Tempo de casa"
            valor={aluno.tempo_permanencia_meses != null ? `${aluno.tempo_permanencia_meses} meses` : null}
          />
          <Campo rotulo="Entrou em" valor={aluno.data_matricula} />
          <Campo rotulo="Saiu em" valor={aluno.data_saida} />
          <Campo rotulo="Anamnese" valor={aluno.anamnese_preenchida ? 'Preenchida' : 'Não preenchida'} />
        </dl>

        {contato && (
          <div className="mt-4 flex gap-2 border-t border-slate-800 pt-3">
            {zap && (
              <a
                href={zap}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600/90 text-sm font-semibold text-white active:bg-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            )}
            <a
              href={`tel:${String(contato).replace(/\D/g, '')}`}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 active:bg-slate-800"
            >
              <Phone className="h-4 w-4" />
              Ligar
            </a>
          </div>
        )}

        {/* Dizer DE QUEM é o número evita a ligação que começa errada: em 392
            alunos ativos o único contato conhecido é o do responsável. */}
        {deResponsavel && (
          <p className="mt-2 text-[11px] text-slate-500">Contato do responsável.</p>
        )}
      </div>
    </>
  );
}

export default DetalheAlunoSheet;
