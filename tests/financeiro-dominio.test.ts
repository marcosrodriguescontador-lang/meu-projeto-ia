import { describe, expect, it } from 'vitest'
import { ehDiaUtil, feriadosNacionais, pascoa, proximoDiaUtil } from '../src/shared/financeiro/calendario'
import {
  acumularVariacoes,
  alocarProporcional,
  aplicarReajuste,
  calcularEncargos,
  competenciasDoReajuste,
  decomporPagamento,
  diasOcupados,
  dividirArredondando,
  multaRescisoria,
  percentualDe,
  ratear,
  valorProporcional,
  vencimentoDaCompetencia
} from '../src/shared/financeiro/calculos'
import { adicionarMeses, adicionarMesesData, diferencaDias, ultimoDia } from '../src/shared/financeiro/datas'

describe('arredondamento e rateio', () => {
  it('arredonda half-even', () => {
    expect(dividirArredondando(5, 2)).toBe(2)
    expect(dividirArredondando(7, 2)).toBe(4)
    expect(dividirArredondando(10, 3)).toBe(3)
    expect(dividirArredondando(-7, 2)).toBe(-4)
    expect(percentualDe(333_333, 1000)).toBe(33_333)
  })
  it('rateia sem perder centavos, favorecendo o primeiro em empate', () => {
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(ratear(1000, [3333, 3333, 3334])).toEqual([333, 333, 334])
    expect(ratear(-100, [1, 1, 1])).toEqual([-34, -33, -33])
    expect(ratear(200_000, [5000, 5000])).toEqual([100_000, 100_000])
    for (const t of [1, 7, 99, 12345, 999_999]) expect(ratear(t, [3, 5, 7, 11]).reduce((a, b) => a + b)).toBe(t)
  })
  it('aloca pagamento parcial proporcionalmente, inclusive com itens negativos', () => {
    expect(alocarProporcional(1200, [2000, 500, -100])).toEqual([1000, 250, -50])
    expect(alocarProporcional(1000, [2000, 500])).toEqual([800, 200])
    expect(alocarProporcional(2400, [2000, 500, -100])).toEqual([2000, 500, -100])
    const a = alocarProporcional(101, [333, 333, 334])
    expect(a.reduce((x, y) => x + y)).toBe(101)
    a.forEach((v, i) => expect(v).toBeLessThanOrEqual([333, 333, 334][i]!))
    expect(() => alocarProporcional(3000, [2000, 500])).toThrow('excede')
  })
})

describe('calendário bancário', () => {
  it('calcula a Páscoa e feriados móveis', () => {
    expect(pascoa(2026)).toBe('2026-04-05')
    expect(pascoa(2027)).toBe('2027-03-28')
    const f = feriadosNacionais(2026)
    expect(f.get('2026-02-16')).toMatch(/Carnaval/)
    expect(f.get('2026-04-03')).toBe('Sexta-feira Santa')
    expect(f.get('2026-06-04')).toBe('Corpus Christi')
    expect(f.get('2026-11-20')).toMatch(/Consciência Negra/)
  })
  it('prorroga vencimento em fim de semana e feriado (Q12)', () => {
    expect(proximoDiaUtil('2026-11-14')).toBe('2026-11-16') // sábado → segunda
    expect(proximoDiaUtil('2026-11-15')).toBe('2026-11-16') // domingo/feriado → segunda
    expect(proximoDiaUtil('2026-12-25')).toBe('2026-12-28') // Natal (sexta) → segunda
    expect(proximoDiaUtil('2026-11-10')).toBe('2026-11-10')
    expect(proximoDiaUtil('2026-11-10', new Set(['2026-11-10']))).toBe('2026-11-11') // feriado municipal
    expect(ehDiaUtil('2026-02-17')).toBe(false) // terça de Carnaval
  })
})

describe('datas e competências', () => {
  it('soma meses respeitando fim de mês', () => {
    expect(adicionarMeses('2026-11', 3)).toBe('2027-02')
    expect(adicionarMeses('2026-01', -1)).toBe('2025-12')
    expect(adicionarMesesData('2026-01-31', 1)).toBe('2026-02-28')
    expect(adicionarMesesData('2028-01-31', 1)).toBe('2028-02-29')
    expect(ultimoDia('2028-02')).toBe('2028-02-29')
    expect(diferencaDias('2026-01-01', '2026-12-31')).toBe(364)
  })
})

describe('aluguel por competência (Q11)', () => {
  it('cobra mês cheio quando ocupado o mês todo', () => {
    expect(diasOcupados({ dataInicio: '2026-01-01', dataFimOcupacao: null }, '2026-02')).toEqual({ dias: 28, diasMes: 28 })
    expect(valorProporcional(200_000, 28, 28)).toBe(200_000)
  })
  it('primeiro mês proporcional por dias reais', () => {
    const d = diasOcupados({ dataInicio: '2026-11-11', dataFimOcupacao: null }, '2026-11')
    expect(d).toEqual({ dias: 20, diasMes: 30 })
    expect(valorProporcional(300_000, d.dias, d.diasMes)).toBe(200_000)
  })
  it('último mês proporcional até a entrega das chaves', () => {
    const d = diasOcupados({ dataInicio: '2025-01-01', dataFimOcupacao: '2026-03-10' }, '2026-03')
    expect(d).toEqual({ dias: 10, diasMes: 31 })
    expect(valorProporcional(310_000, d.dias, d.diasMes)).toBe(100_000)
  })
  it('competência fora do contrato não gera dias', () => {
    expect(diasOcupados({ dataInicio: '2026-05-01', dataFimOcupacao: null }, '2026-04').dias).toBe(0)
    expect(diasOcupados({ dataInicio: '2025-01-01', dataFimOcupacao: '2026-03-31' }, '2026-04').dias).toBe(0)
  })
  it('vence no dia fixo do mês seguinte, limitado ao fim do mês', () => {
    expect(vencimentoDaCompetencia('2026-11', 10)).toBe('2026-12-10')
    expect(vencimentoDaCompetencia('2027-01', 31)).toBe('2027-02-28')
    expect(vencimentoDaCompetencia('2026-12', 5)).toBe('2027-01-05')
  })
})

describe('encargos por atraso (Q6)', () => {
  const base = { vencimentoOriginal: '2026-11-10', vencimentoUtil: '2026-11-10', multaBp: 1000, jurosMesBp: 100 }
  it('sem encargos até o vencimento útil, inclusive pagamento antecipado', () => {
    expect(calcularEncargos(250_000, { ...base, dataPagamento: '2026-11-10' })).toEqual({ dias: 0, multa: 0, juros: 0 })
    expect(calcularEncargos(250_000, { ...base, dataPagamento: '2026-11-01' }).multa).toBe(0)
  })
  it('vencimento em domingo prorrogado: pagar na segunda não gera encargos; na terça conta desde domingo', () => {
    const p = { ...base, vencimentoOriginal: '2026-11-15', vencimentoUtil: '2026-11-16' }
    expect(calcularEncargos(100_000, { ...p, dataPagamento: '2026-11-16' }).multa).toBe(0)
    expect(calcularEncargos(100_000, { ...p, dataPagamento: '2026-11-17' })).toEqual({ dias: 2, multa: 10_000, juros: 67 })
  })
  it('multa de 10% e juros de 1% a.m. pro rata die', () => {
    expect(calcularEncargos(200_000, { ...base, dataPagamento: '2026-11-15' })).toEqual({ dias: 5, multa: 20_000, juros: 333 })
    expect(calcularEncargos(200_000, { ...base, dataPagamento: '2026-12-10' })).toEqual({ dias: 30, multa: 20_000, juros: 2000 })
  })
  it('decompõe pagamento integral com encargos', () => {
    expect(decomporPagamento(220_333, 200_000, { ...base, dataPagamento: '2026-11-15' })).toEqual({ principal: 200_000, multa: 20_000, juros: 333, dias: 5 })
  })
  it('decompõe pagamento parcial em atraso, sem perder centavos', () => {
    const r = decomporPagamento(110_000, 200_000, { ...base, dataPagamento: '2026-11-15' })
    expect(r.principal + r.multa + r.juros).toBe(110_000)
    expect(r.principal).toBeLessThan(110_000)
    expect(r.multa).toBe(percentualDe(r.principal, 1000))
    expect(r.juros).toBeGreaterThanOrEqual(0)
  })
  it('recusa valor acima do devido e permite dispensar encargos', () => {
    expect(() => decomporPagamento(300_000, 200_000, { ...base, dataPagamento: '2026-11-15' })).toThrow('excede')
    expect(decomporPagamento(200_000, 200_000, { ...base, dataPagamento: '2026-11-15' }, true)).toEqual({ principal: 200_000, multa: 0, juros: 0, dias: 5 })
    expect(() => decomporPagamento(200_001, 200_000, { ...base, dataPagamento: '2026-11-01' })).toThrow('excede')
  })
})

describe('reajuste (Q13)', () => {
  it('acumula índices de forma composta', () => {
    expect(acumularVariacoes(Array(12).fill(10_000))).toBe(126_825) // 1% a.m. → 12,6825%
    expect(acumularVariacoes([5000, -2000, 3000])).toBe(5_999) // 1,005 × 0,998 × 1,003
  })
  it('aplica reajuste e não reduz com índice negativo, salvo cláusula', () => {
    expect(aplicarReajuste(250_000, 45_000, false)).toEqual({ aplicadoPpm: 45_000, novoValor: 261_250 })
    expect(aplicarReajuste(250_000, -12_000, false)).toEqual({ aplicadoPpm: 0, novoValor: 250_000 })
    expect(aplicarReajuste(250_000, -12_000, true)).toEqual({ aplicadoPpm: -12_000, novoValor: 247_000 })
  })
  it('usa os 12 meses anteriores ao aniversário', () => {
    const c = competenciasDoReajuste('2027-03-15')
    expect(c[0]).toBe('2026-03')
    expect(c.at(-1)).toBe('2027-02')
    expect(c).toHaveLength(12)
  })
})

describe('multa rescisória (Q17)', () => {
  it('proporcional ao período restante', () => {
    const r = multaRescisoria({ aluguel: 200_000, quantidadeAlugueis: 3, dataInicio: '2026-01-01', dataFim: '2028-12-31', dataEntrega: '2027-07-01' })
    expect(r.diasTotais).toBe(1096)
    expect(r.diasRestantes).toBe(549)
    expect(r.valor).toBe(dividirArredondando(600_000 * 549, 1096))
  })
  it('isenta após o término do prazo', () => {
    expect(multaRescisoria({ aluguel: 200_000, quantidadeAlugueis: 3, dataInicio: '2024-01-01', dataFim: '2026-12-31', dataEntrega: '2027-01-10' }).valor).toBe(0)
  })
})
