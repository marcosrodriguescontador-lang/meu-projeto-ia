// Leitura de extratos bancários: OFX (1.x SGML e 2.x XML) e CSV com mapeamento de colunas.
import { paraCentavos } from '../dinheiro'
import { validarDataIso } from './datas'

export interface TransacaoExtrato {
  data: string
  valor: number
  descricao: string
  documento: string | null
  /** Chave estável para impedir duplicidade entre importações. */
  chave: string
}

export interface ExtratoLido {
  formato: 'OFX' | 'CSV'
  banco: string | null
  conta: string | null
  saldoFinal: number | null
  dataSaldoFinal: string | null
  inicio: string | null
  fim: string | null
  transacoes: TransacaoExtrato[]
}

/** Valor monetário de extrato: "1.234,56", "-1234.56", "(123,45)", "1,234.56". */
export function valorExtrato(texto: string): number | null {
  let t = texto.trim().replace(/\s|R\$/g, '')
  if (!t) return null
  let negativo = false
  if (/^\(.*\)$/.test(t)) {
    negativo = true
    t = t.slice(1, -1)
  }
  if (t.startsWith('-')) {
    negativo = !negativo
    t = t.slice(1)
  } else if (t.startsWith('+')) t = t.slice(1)
  if (/[dD]$/.test(t)) {
    negativo = true
    t = t.slice(0, -1)
  } else if (/[cC]$/.test(t)) t = t.slice(0, -1)
  // "1,234.56" (padrão americano) → "1234.56"
  if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(t)) t = t.replace(/,/g, '')
  const c = paraCentavos(t)
  return c == null ? null : negativo ? -c : c
}

function chaveHash(data: string, valor: number, descricao: string, documento: string | null, ocorrencia: number): string {
  const base = `${data}|${valor}|${descricao.trim().toUpperCase().replace(/\s+/g, ' ')}|${documento ?? ''}|${ocorrencia}`
  let h = 5381
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) >>> 0
  return `H:${data}:${valor}:${h.toString(36)}:${ocorrencia}`
}

/** Atribui chaves: FITID quando disponível e único; senão hash com contador de ocorrências idênticas no arquivo. */
function atribuirChaves(itens: Omit<TransacaoExtrato, 'chave'>[], fitids: (string | null)[]): TransacaoExtrato[] {
  const contagemFitid = new Map<string, number>()
  fitids.forEach((f) => f && contagemFitid.set(f, (contagemFitid.get(f) ?? 0) + 1))
  const ocorrencias = new Map<string, number>()
  return itens.map((t, i) => {
    const f = fitids[i]
    if (f && contagemFitid.get(f) === 1) return { ...t, chave: `F:${f}` }
    const base = `${t.data}|${t.valor}|${t.descricao}|${t.documento ?? ''}`
    const n = (ocorrencias.get(base) ?? 0) + 1
    ocorrencias.set(base, n)
    return { ...t, chave: chaveHash(t.data, t.valor, t.descricao, t.documento, n) }
  })
}

function dataOfx(v: string | null): string | null {
  if (!v) return null
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}`
  return validarDataIso(iso) ? iso : null
}

function campo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1]!.trim() || null : null
}

const decodificarEntidades = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

export function lerOfx(texto: string): ExtratoLido {
  if (!/<OFX>/i.test(texto)) throw new Error('Arquivo OFX inválido (marcador <OFX> não encontrado).')
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]!)
  const itens: Omit<TransacaoExtrato, 'chave'>[] = []
  const fitids: (string | null)[] = []
  for (const b of blocos) {
    const data = dataOfx(campo(b, 'DTPOSTED'))
    const valor = valorExtrato(campo(b, 'TRNAMT') ?? '')
    if (!data || valor == null) continue
    const memo = campo(b, 'MEMO')
    const nome = campo(b, 'NAME')
    const descricao = decodificarEntidades([nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' — ') || campo(b, 'TRNTYPE') || 'Movimento')
    itens.push({ data, valor, descricao: descricao.slice(0, 250), documento: campo(b, 'CHECKNUM') ?? campo(b, 'REFNUM') })
    fitids.push(campo(b, 'FITID'))
  }
  const saldoBloco = texto.split(/<LEDGERBAL>/i)[1]?.split(/<\/LEDGERBAL>/i)[0] ?? ''
  const transacoes = atribuirChaves(itens, fitids)
  const datas = transacoes.map((t) => t.data).sort()
  return {
    formato: 'OFX',
    banco: campo(texto, 'BANKID'),
    conta: campo(texto, 'ACCTID'),
    saldoFinal: saldoBloco ? valorExtrato(campo(saldoBloco, 'BALAMT') ?? '') : null,
    dataSaldoFinal: saldoBloco ? dataOfx(campo(saldoBloco, 'DTASOF')) : null,
    inicio: dataOfx(campo(texto, 'DTSTART')) ?? datas[0] ?? null,
    fim: dataOfx(campo(texto, 'DTEND')) ?? datas.at(-1) ?? null,
    transacoes
  }
}

// ───── CSV ─────

export function dividirCsv(texto: string, separador: string): string[][] {
  const linhas: string[][] = []
  let atual: string[] = []
  let celula = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        celula += '"'
        i++
      } else if (c === '"') aspas = false
      else celula += c
    } else if (c === '"') aspas = true
    else if (c === separador) {
      atual.push(celula)
      celula = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      atual.push(celula)
      if (atual.some((x) => x.trim())) linhas.push(atual.map((x) => x.trim()))
      atual = []
      celula = ''
    } else celula += c
  }
  atual.push(celula)
  if (atual.some((x) => x.trim())) linhas.push(atual.map((x) => x.trim()))
  return linhas
}

export function detectarSeparador(texto: string): string {
  const amostra = texto.split(/\r?\n/).slice(0, 10).join('\n')
  const contagem = [';', ',', '\t', '|'].map((s) => ({ s, n: amostra.split(s).length }))
  return contagem.sort((a, b) => b.n - a.n)[0]!.s
}

export interface MapaCsv {
  separador: string
  linhaInicial: number
  colunaData: number
  colunaDescricao: number
  colunaValor: number | null
  colunaDebito: number | null
  colunaCredito: number | null
  colunaDocumento: number | null
  formatoData: 'DD/MM/AAAA' | 'AAAA-MM-DD' | 'MM/DD/AAAA'
}

function dataCsv(v: string, formato: MapaCsv['formatoData']): string | null {
  const t = v.trim().slice(0, 10)
  let iso: string | null = null
  if (formato === 'AAAA-MM-DD') iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  else {
    const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (m) {
      const ano = m[3]!.length === 2 ? `20${m[3]}` : m[3]
      const [d, mes] = formato === 'DD/MM/AAAA' ? [m[1]!, m[2]!] : [m[2]!, m[1]!]
      iso = `${ano}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }
  return iso && validarDataIso(iso) ? iso : null
}

/** Lê o CSV conforme o mapeamento. Linhas sem data ou valor válidos (cabeçalhos, saldos) são ignoradas e contadas. */
export function lerCsv(texto: string, mapa: MapaCsv): ExtratoLido & { ignoradas: number } {
  const linhas = dividirCsv(texto, mapa.separador).slice(mapa.linhaInicial)
  const itens: Omit<TransacaoExtrato, 'chave'>[] = []
  let ignoradas = 0
  for (const l of linhas) {
    const data = dataCsv(l[mapa.colunaData] ?? '', mapa.formatoData)
    let valor: number | null = null
    if (mapa.colunaValor != null) valor = valorExtrato(l[mapa.colunaValor] ?? '')
    else {
      const deb = mapa.colunaDebito != null ? valorExtrato(l[mapa.colunaDebito] ?? '') : null
      const cred = mapa.colunaCredito != null ? valorExtrato(l[mapa.colunaCredito] ?? '') : null
      if (deb) valor = -Math.abs(deb)
      else if (cred) valor = Math.abs(cred)
    }
    const descricao = (l[mapa.colunaDescricao] ?? '').trim()
    if (!data || valor == null || valor === 0 || /^saldo/i.test(descricao)) {
      ignoradas++
      continue
    }
    itens.push({ data, valor, descricao: descricao.slice(0, 250) || 'Movimento', documento: mapa.colunaDocumento != null ? l[mapa.colunaDocumento] || null : null })
  }
  const transacoes = atribuirChaves(itens, itens.map(() => null))
  const datas = transacoes.map((t) => t.data).sort()
  return { formato: 'CSV', banco: null, conta: null, saldoFinal: null, dataSaldoFinal: null, inicio: datas[0] ?? null, fim: datas.at(-1) ?? null, transacoes, ignoradas }
}

/** Decodifica o arquivo: UTF-8 quando válido; senão Windows-1252/Latin-1 (padrão de muitos bancos). */
export function decodificarExtrato(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
