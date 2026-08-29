import test from 'node:test'
import assert from 'node:assert/strict'
import {
  indiceDoDia, normalizarDia, horarioCurto,
  agruparEnsaiosPorDiaDaSemana, bandasSemHorarioDeEnsaio, projetarEnsaiosNoIntervalo,
} from '../src/components/App/Bandas/ensaiosBandas.mjs'

test('normaliza dia com acento e com sufixo -feira (o banco tem as duas formas)', () => {
  assert.equal(normalizarDia('Terça'), 'terca')
  assert.equal(normalizarDia('Terça-feira'), 'terca')
  assert.equal(normalizarDia('QUINTA-FEIRA'), 'quinta')
  assert.equal(normalizarDia('Sábado'), 'sabado')
})

test('indiceDoDia cobre as duas grafias e devolve null no desconhecido', () => {
  assert.equal(indiceDoDia('Domingo'), 0)
  assert.equal(indiceDoDia('Terça'), 2)
  assert.equal(indiceDoDia('Terça-feira'), 2)
  assert.equal(indiceDoDia('Sábado'), 6)
  // não pode cair em domingo por engano — sem dia é sem dia
  assert.equal(indiceDoDia(''), null)
  assert.equal(indiceDoDia(null), null)
  assert.equal(indiceDoDia('qualquer coisa'), null)
})

test('horarioCurto corta os segundos do time do Postgres', () => {
  assert.equal(horarioCurto('14:00:00'), '14:00')
  assert.equal(horarioCurto('09:30'), '09:30')
  assert.equal(horarioCurto(null), null)
})

test('agrupa por dia e ordena por horario, depois nome', () => {
  const grade = agruparEnsaiosPorDiaDaSemana([
    { banda_id: 1, nome: 'Zebra', dia_semana: 'Terça', horario: '18:00:00' },
    { banda_id: 2, nome: 'Alfa', dia_semana: 'Terça', horario: '18:00:00' },
    { banda_id: 3, nome: 'Beta', dia_semana: 'Terça', horario: '09:00:00' },
    { banda_id: 4, nome: 'Gama', dia_semana: 'Segunda', horario: '10:00:00' },
  ])
  assert.deepEqual(grade.map((d) => d.nome), ['Segunda', 'Terça'])
  assert.deepEqual(grade[1].bandas.map((b) => b.nome), ['Beta', 'Alfa', 'Zebra'])
})

test('banda sem dia ou sem horario fica FORA da grade e aparece no aviso', () => {
  const bandas = [
    { banda_id: 1, nome: 'Com horario', dia_semana: 'Quarta', horario: '15:00:00' },
    { banda_id: 2, nome: 'Sem dia', dia_semana: null, horario: '15:00:00' },
    { banda_id: 3, nome: 'Sem hora', dia_semana: 'Quarta', horario: null },
  ]
  const grade = agruparEnsaiosPorDiaDaSemana(bandas)
  assert.equal(grade.length, 1)
  assert.deepEqual(grade[0].bandas.map((b) => b.nome), ['Com horario'])
  assert.deepEqual(bandasSemHorarioDeEnsaio(bandas).map((b) => b.nome), ['Sem dia', 'Sem hora'])
})

test('projeta toda terca do intervalo, no horario certo e em hora local', () => {
  const bandas = [{ banda_id: 7, nome: 'Prismatic', dia_semana: 'Terça', horario: '14:30:00' }]
  // agosto/2026: as tercas sao 4, 11, 18 e 25
  const ocorrencias = projetarEnsaiosNoIntervalo(bandas, new Date(2026, 7, 1), new Date(2026, 7, 31))
  assert.equal(ocorrencias.length, 4)
  assert.deepEqual(ocorrencias.map((o) => new Date(o.data_inicio).getDate()), [4, 11, 18, 25])
  const primeira = new Date(ocorrencias[0].data_inicio)
  assert.equal(primeira.getHours(), 14)
  assert.equal(primeira.getMinutes(), 30)
})

test('ocorrencia projetada e sintetica: evento_id negativo e flag recorrente', () => {
  const [oc] = projetarEnsaiosNoIntervalo(
    [{ banda_id: 42, nome: 'X', dia_semana: 'Sexta', horario: '10:00:00' }],
    new Date(2026, 7, 7), new Date(2026, 7, 7),
  )
  assert.equal(oc.evento_id, -42)
  assert.equal(oc.banda_id, 42)
  assert.equal(oc.recorrente, true)
  assert.equal(oc.tipo, 'ensaio')
  assert.equal(oc.status, 'agendado')
})

test('intervalo sem o dia da banda nao gera ocorrencia', () => {
  const ocorrencias = projetarEnsaiosNoIntervalo(
    [{ banda_id: 1, nome: 'X', dia_semana: 'Domingo', horario: '10:00:00' }],
    new Date(2026, 7, 3), new Date(2026, 7, 8), // segunda a sabado
  )
  assert.equal(ocorrencias.length, 0)
})

test('banda sem grade nao quebra a projecao', () => {
  assert.deepEqual(projetarEnsaiosNoIntervalo([], new Date(2026, 7, 1), new Date(2026, 7, 31)), [])
  assert.deepEqual(
    projetarEnsaiosNoIntervalo([{ banda_id: 1, nome: 'X', dia_semana: null, horario: null }],
      new Date(2026, 7, 1), new Date(2026, 7, 31)),
    [],
  )
})
