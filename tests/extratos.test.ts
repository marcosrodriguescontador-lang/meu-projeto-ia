import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodificarExtrato, detectarSeparador, lerCsv, lerOfx, valorExtrato } from '../src/shared/financeiro/extratos'

describe('valores de extrato', () => {
  it.each([
    ['1.234,56', 123456],
    ['-1.234,56', -123456],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['(19,90)', -1990],
    ['19,90 D', -1990],
    ['19,90C', 1990],
    ['R$ 2.762,50', 276250]
  ])('%s → %i', (t, v) => expect(valorExtrato(t)).toBe(v))
})

describe('OFX', () => {
  it('lê OFX 1.x SGML (Itaú) com saldo, período e FITID', () => {
    const e = lerOfx(decodificarExtrato(readFileSync(join(__dirname, 'fixtures/itau.ofx'))))
    expect(e.conta).toBe('12345-6')
    expect(e.inicio).toBe('2026-10-01')
    expect(e.saldoFinal).toBe(23_010)
    expect(e.transacoes.map((t) => [t.data, t.valor])).toEqual([
      ['2026-10-13', 276_250],
      ['2026-10-15', -251_250],
      ['2026-10-20', -1_990]
    ])
    expect(e.transacoes[2]!.descricao).toBe('TARIFA PACOTE SERVIÇOS')
    expect(e.transacoes[0]!.chave).toBe('F:202610130001')
  })

  it('lê OFX 2.x XML e gera chaves distintas para lançamentos idênticos sem FITID', () => {
    const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
      <STMTTRN><TRNTYPE>FEE</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>-5.00</TRNAMT><MEMO>TARIFA PIX</MEMO></STMTTRN>
      <STMTTRN><TRNTYPE>FEE</TRNTYPE><DTPOSTED>20261020</DTPOSTED><TRNAMT>-5.00</TRNAMT><MEMO>TARIFA PIX</MEMO></STMTTRN>
      </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
    const e = lerOfx(xml)
    expect(e.transacoes).toHaveLength(2)
    expect(new Set(e.transacoes.map((t) => t.chave)).size).toBe(2)
    expect(lerOfx(xml).transacoes.map((t) => t.chave)).toEqual(e.transacoes.map((t) => t.chave))
  })

  it('decodifica arquivos em Windows-1252 e em UTF-8', () => {
    const texto = 'TARIFA PACOTE SERVIÇOS'
    expect(decodificarExtrato(Buffer.from(texto, 'latin1'))).toBe(texto)
    expect(decodificarExtrato(Buffer.from(texto, 'utf8'))).toBe(texto)
  })

  it('rejeita arquivo que não é OFX', () => {
    expect(() => lerOfx('data;valor')).toThrow('OFX inválido')
  })
})

describe('CSV', () => {
  const csv = `Data;Histórico;Documento;Valor
13/10/2026;PIX RECEBIDO CARLOS;;2.762,50
15/10/2026;"PIX ENVIADO MARIA; REPASSE";123;-2.512,50
20/10/2026;TARIFA;;-19,90
25/10/2026;SALDO DO DIA;;230,10
`
  it('detecta separador e lê com mapeamento, ignorando cabeçalho e saldos', () => {
    expect(detectarSeparador(csv)).toBe(';')
    const e = lerCsv(csv, { separador: ';', linhaInicial: 1, colunaData: 0, colunaDescricao: 1, colunaDocumento: 2, colunaValor: 3, colunaDebito: null, colunaCredito: null, formatoData: 'DD/MM/AAAA' })
    expect(e.transacoes.map((t) => t.valor)).toEqual([276_250, -251_250, -1_990])
    expect(e.transacoes[1]!.descricao).toBe('PIX ENVIADO MARIA; REPASSE')
    expect(e.transacoes[1]!.documento).toBe('123')
    expect(e.ignoradas).toBe(1)
  })

  it('aceita colunas separadas de débito e crédito', () => {
    const t = 'data,descricao,debito,credito\n2026-10-13,PIX,,100.00\n2026-10-14,TED,50.00,\n'
    const e = lerCsv(t, { separador: ',', linhaInicial: 1, colunaData: 0, colunaDescricao: 1, colunaValor: null, colunaDebito: 2, colunaCredito: 3, colunaDocumento: null, formatoData: 'AAAA-MM-DD' })
    expect(e.transacoes.map((x) => x.valor)).toEqual([10_000, -5_000])
  })
})
