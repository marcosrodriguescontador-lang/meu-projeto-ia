// Exportação de relatórios: HTML (para PDF) e planilha Excel (XLSX).
import ExcelJS from 'exceljs'
import type { EmpresaConfig } from '@shared/dto'
import { formatarCompetencia } from '@shared/financeiro/datas'
import { formatarCelula, type ColunaRelatorio, type RelatorioDados } from '@shared/relatorios'

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export function relatorioHtml(r: RelatorioDados, cab: { empresa: EmpresaConfig | null; logo: string | null; emitidoEm: Date; emitidoPor: string }): string {
  const largo = r.colunas.length > 8
  const marca = cab.logo ? `<img src="${cab.logo}" style="height:38px">` : `<div><b style="letter-spacing:.3em;font-size:15pt">STATUS</b><div style="font-size:6.5pt;letter-spacing:.2em;color:#57534e">NEGÓCIOS IMOBILIÁRIOS</div></div>`
  const num = (c: ColunaRelatorio) => ['moeda', 'numero', 'percentual'].includes(c.tipo)
  const cabecalho = r.colunas.map((c) => `<th class="${num(c) ? 'v' : ''}">${esc(c.rotulo)}</th>`).join('')
  const corpo = r.linhas
    .map((l) => {
      const cls = l.destaque === 'total' ? 'total' : l.destaque === 'subtotal' ? 'sub' : ''
      return `<tr class="${cls}">${r.colunas.map((c) => `<td class="${num(c) ? 'v' : ''}${num(c) && Number(l[c.chave]) < 0 ? ' neg' : ''}">${esc(formatarCelula(c, l[c.chave]))}</td>`).join('')}</tr>`
    })
    .join('')
  const totais = r.totais ? `<tr class="total">${r.colunas.map((c) => `<td class="${num(c) ? 'v' : ''}">${esc(r.totais![c.chave] != null ? (typeof r.totais![c.chave] === 'number' ? formatarCelula(c, r.totais![c.chave]) : r.totais![c.chave]) : '')}</td>`).join('')}</tr>` : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(r.titulo)}</title><style>
  @page { size: A4 ${largo ? 'landscape' : 'portrait'}; margin: 12mm; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; font-size: ${largo ? '7.5pt' : '9pt'}; color: #0a0a0a; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0a0a0a; padding-bottom: 6px; margin-bottom: 10px; }
  .emp { text-align: right; font-size: 7.5pt; color: #57534e; }
  h1 { font-size: 12.5pt; margin: 0; } .sub { color: #57534e; margin: 2px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .05em; color: #57534e; border-bottom: 1px solid #a8a29e; padding: 4px; }
  td { padding: 3px 4px; border-bottom: 1px solid #f0efee; }
  .v { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .neg { color: #b91c1c; }
  tr.sub td { font-weight: 600; background: #fafaf9; } tr.total td { font-weight: 700; border-top: 2px solid #0a0a0a; border-bottom: none; }
  .obs { margin-top: 10px; font-size: 7.5pt; color: #57534e; } footer { margin-top: 12px; font-size: 7pt; color: #78716c; display: flex; justify-content: space-between; }
  </style></head><body>
  <header>${marca}<div class="emp">${esc(cab.empresa?.razaoSocial ?? 'Status Negócios Imobiliários')}<br>CRECI ${esc(cab.empresa?.creci ?? '038595-J')}</div></header>
  <h1>${esc(r.titulo)}</h1><div class="sub">${esc(r.subtitulo)}</div>
  <table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo || `<tr><td colspan="${r.colunas.length}">Nenhum registro no período.</td></tr>`}${totais}</tbody></table>
  ${r.observacoes?.length ? `<div class="obs">${r.observacoes.map((o) => `<div>• ${esc(o)}</div>`).join('')}</div>` : ''}
  <footer><span>STATUS ERP IMOBILIÁRIO</span><span>Emitido em ${esc(cab.emitidoEm.toLocaleString('pt-BR'))} por ${esc(cab.emitidoPor)}</span></footer>
  </body></html>`
}

export async function relatorioXlsx(r: RelatorioDados, empresa: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'STATUS ERP IMOBILIÁRIO'
  const ws = wb.addWorksheet(r.titulo.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '), { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.addRow([empresa]).font = { bold: true, size: 12 }
  ws.addRow([r.titulo]).font = { bold: true, size: 14 }
  ws.addRow([r.subtitulo]).font = { color: { argb: 'FF57534E' } }
  const cab = ws.addRow(r.colunas.map((c) => c.rotulo))
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } }))
  const valor = (c: ColunaRelatorio, v: unknown) => {
    if (v == null || v === '') return null
    if (c.tipo === 'moeda') return Number(v) / 100
    if (c.tipo === 'percentual') return Number(v) / 10_000
    if (c.tipo === 'numero') return Number(v)
    if (c.tipo === 'data') return new Date(`${String(v)}T12:00:00Z`)
    if (c.tipo === 'competencia') return formatarCompetencia(String(v))
    return String(v)
  }
  for (const l of r.linhas) {
    const row = ws.addRow(r.colunas.map((c) => valor(c, l[c.chave])))
    if (l.destaque) row.font = { bold: true }
  }
  if (r.totais) {
    const row = ws.addRow(r.colunas.map((c) => (typeof r.totais![c.chave] === 'number' ? valor(c, r.totais![c.chave]) : (r.totais![c.chave] ?? null))))
    row.font = { bold: true }
    row.eachCell((c) => (c.border = { top: { style: 'medium' } }))
  }
  r.colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.width = c.largura ?? (c.tipo === 'moeda' ? 16 : c.tipo === 'data' ? 12 : 14)
    if (c.tipo === 'moeda') col.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
    if (c.tipo === 'percentual') col.numFmt = '0.00%'
    if (c.tipo === 'data') col.numFmt = 'dd/mm/yyyy'
  })
  for (const o of r.observacoes ?? []) ws.addRow([o]).font = { italic: true, color: { argb: 'FF57534E' } }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
