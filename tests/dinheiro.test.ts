import { describe, expect, it } from 'vitest'
import { aplicarPercentual, formatarMoeda, paraCentavos, paraPontosBase } from '../src/shared/dinheiro'

describe('dinheiro', () => {
  it('converte texto em centavos sem erro de ponto flutuante', () => {
    expect(paraCentavos('1.234,56')).toBe(123456)
    expect(paraCentavos('R$ 0,10')).toBe(10)
    expect(paraCentavos('1234.5')).toBe(123450)
    expect(paraCentavos('850.000,00')).toBe(85000000)
    expect(paraCentavos(0.1 + 0.2)).toBe(30)
    expect(paraCentavos('12,345')).toBeNull()
    expect(paraCentavos('abc')).toBeNull()
  })
  it('percentuais em pontos-base', () => {
    expect(paraPontosBase('6')).toBe(600)
    expect(paraPontosBase('33,33')).toBe(3333)
    expect(paraPontosBase('6,555')).toBeNull()
  })
  it('aplica percentual com arredondamento half-even', () => {
    expect(aplicarPercentual(85000000, 600)).toBe(5100000)
    expect(aplicarPercentual(5, 5000)).toBe(2) // 2,5 → 2 (par)
    expect(aplicarPercentual(7, 5000)).toBe(4) // 3,5 → 4 (par)
  })
  it('formata moeda brasileira', () => {
    expect(formatarMoeda(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
  })
})
