import { describe, expect, it } from 'vitest'
import { formatarDocumento, validarCnpj, validarCpf } from '../src/shared/documentos'

describe('CPF', () => {
  it('aceita CPFs válidos com e sem máscara', () => {
    expect(validarCpf('529.982.247-25')).toBe(true)
    expect(validarCpf('52998224725')).toBe(true)
  })
  it('rejeita dígito verificador errado, sequências repetidas e tamanho incorreto', () => {
    expect(validarCpf('529.982.247-24')).toBe(false)
    expect(validarCpf('111.111.111-11')).toBe(false)
    expect(validarCpf('5299822472')).toBe(false)
  })
})

describe('CNPJ', () => {
  it('aceita CNPJ numérico válido', () => {
    expect(validarCnpj('11.222.333/0001-81')).toBe(true)
  })
  it('aceita CNPJ alfanumérico (IN RFB 2.229/2024)', () => {
    expect(validarCnpj('12.ABC.345/01DE-35')).toBe(true)
    expect(validarCnpj('12abc34501de35')).toBe(true)
  })
  it('rejeita CNPJ inválido', () => {
    expect(validarCnpj('11.222.333/0001-82')).toBe(false)
    expect(validarCnpj('12.ABC.345/01DE-36')).toBe(false)
    expect(validarCnpj('00.000.000/0000-00')).toBe(false)
  })
  it('formata documentos', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
    expect(formatarDocumento('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })
})
