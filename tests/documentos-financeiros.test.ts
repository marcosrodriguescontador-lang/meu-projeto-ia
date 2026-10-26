import { describe, expect, it } from 'vitest'
import { valorPorExtenso } from '../src/shared/extenso'

describe('valor por extenso', () => {
  it.each([
    [100, 'um real'],
    [1, 'um centavo'],
    [250_000, 'dois mil e quinhentos reais'],
    [220_333, 'dois mil, duzentos e três reais e trinta e três centavos'],
    [100_000_000, 'um milhão de reais'],
    [123_456_789, 'um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos'],
    [10_000, 'cem reais'],
    [11_500, 'cento e quinze reais'],
    [100_100, 'mil e um reais'],
    [0, 'zero real']
  ])('%i centavos → %s', (v, txt) => expect(valorPorExtenso(v)).toBe(txt))
})
