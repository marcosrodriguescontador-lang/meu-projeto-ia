// Recibo de pagamento e demonstrativo de repasse (HTML → PDF), com a marca da empresa.
import { formatarDocumento } from '@shared/documentos'
import { formatarMoeda } from '@shared/dinheiro'
import type { EmpresaConfig } from '@shared/dto'
import type { ExtratoLinha, RepasseDto, TituloDetalhe } from '@shared/dto-financeiro'
import { valorPorExtenso } from '@shared/extenso'
import { formatarData } from '@shared/financeiro/datas'
import { FORMAS_PAGAMENTO } from '@shared/schemas-locacao'

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

interface Cabecalho {
  empresa: EmpresaConfig | null
  logo: string | null
  emitidoEm: Date
  emitidoPor: string
}

const ESTILO = `
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0a0a0a; font-size: 10.5pt; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0a0a0a; padding-bottom: 8px; margin-bottom: 16px; }
  .logo { height: 44px; }
  .marca b { display: block; letter-spacing: .3em; font-size: 18pt; }
  .marca span { font-size: 7pt; letter-spacing: .2em; text-transform: uppercase; color: #57534e; }
  .emp { text-align: right; font-size: 8.5pt; color: #57534e; line-height: 1.4; }
  h1 { font-size: 14pt; margin: 0 0 4px; }
  .sub { color: #57534e; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e7e5e4; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #57534e; font-weight: 600; }
  td.v, th.v { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; border-top: 2px solid #0a0a0a; border-bottom: none; }
  .caixa { border: 1px solid #d6d3d1; border-radius: 4px; padding: 10px 12px; margin: 10px 0; line-height: 1.6; }
  .assinatura { margin-top: 60px; text-align: center; }
  .assinatura div { border-top: 1px solid #0a0a0a; width: 60%; margin: 0 auto; padding-top: 4px; font-size: 9pt; }
  footer { margin-top: 20px; font-size: 7.5pt; color: #78716c; border-top: 1px solid #e7e5e4; padding-top: 6px; display: flex; justify-content: space-between; }
`

function topo(c: Cabecalho): string {
  const marca = c.logo ? `<img class="logo" src="${c.logo}" alt="Status Negócios Imobiliários">` : `<div class="marca"><b>STATUS</b><span>Negócios Imobiliários</span></div>`
  const e = c.empresa
  return `<header>${marca}<div class="emp">${esc(e?.razaoSocial ?? 'Status Negócios Imobiliários')}${e?.cnpj ? `<br>CNPJ ${esc(formatarDocumento(e.cnpj))}` : ''}<br>CRECI ${esc(e?.creci ?? '038595-J')}${e?.endereco ? `<br>${esc(e.endereco)}` : ''}</div></header>`
}

const rodape = (c: Cabecalho) => `<footer><span>Documento gerado pelo STATUS ERP IMOBILIÁRIO</span><span>Emitido em ${esc(c.emitidoEm.toLocaleString('pt-BR'))} por ${esc(c.emitidoPor)}</span></footer>`

export function gerarReciboHtml(d: Cabecalho & { titulo: TituloDetalhe; baixaId: number; pagadorDocumento: string; imovel: string | null; cidade: string }): string {
  const b = d.titulo.baixas.find((x) => x.id === d.baixaId)
  if (!b) throw new Error('Baixa não encontrada')
  const linhas = d.titulo.itens.map((i) => `<tr><td>${esc(i.descricao)}</td><td class="v">${esc(formatarMoeda(i.valorCentavos))}</td></tr>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${b.id}</title><style>${ESTILO}</style></head><body>
${topo(d)}
<h1>RECIBO Nº ${String(b.id).padStart(6, '0')}${b.estornada ? ' — ESTORNADO' : ''}</h1>
<div class="sub">${esc(d.titulo.descricao)}</div>
<div class="caixa">Recebemos de <b>${esc(d.titulo.pessoa)}</b> (${esc(formatarDocumento(d.pagadorDocumento))}) a importância de
<b>${esc(formatarMoeda(b.totalCentavos))}</b> (${esc(valorPorExtenso(b.totalCentavos))}), referente a ${esc(d.titulo.descricao.toLowerCase())}${d.imovel ? `, imóvel situado em ${esc(d.imovel)}` : ''}.</div>
<table><thead><tr><th>Composição do título</th><th class="v">Valor</th></tr></thead><tbody>${linhas}
<tr><td>Vencimento</td><td class="v">${esc(formatarData(d.titulo.vencimento))}</td></tr></tbody></table>
<table><thead><tr><th>Este pagamento</th><th class="v">Valor</th></tr></thead><tbody>
<tr><td>Principal</td><td class="v">${esc(formatarMoeda(b.principalCentavos))}</td></tr>
${b.descontoCentavos ? `<tr><td>Desconto concedido</td><td class="v">${esc(formatarMoeda(b.descontoCentavos))}</td></tr>` : ''}
${b.multaCentavos ? `<tr><td>Multa por atraso</td><td class="v">${esc(formatarMoeda(b.multaCentavos))}</td></tr>` : ''}
${b.jurosCentavos ? `<tr><td>Juros de mora</td><td class="v">${esc(formatarMoeda(b.jurosCentavos))}</td></tr>` : ''}
<tr class="total"><td>Total recebido em ${esc(formatarData(b.data))} (${esc(FORMAS_PAGAMENTO[b.forma as keyof typeof FORMAS_PAGAMENTO] ?? b.forma)})</td><td class="v">${esc(formatarMoeda(b.totalCentavos))}</td></tr>
</tbody></table>
${d.titulo.saldoCentavos > 0 ? `<p>Saldo remanescente deste título: <b>${esc(formatarMoeda(d.titulo.saldoCentavos))}</b>.</p>` : '<p>Título quitado.</p>'}
<p>${esc(d.cidade)}, ${esc(formatarData(b.data))}.</p>
<div class="assinatura"><div>${esc(d.empresa?.razaoSocial ?? 'Status Negócios Imobiliários')}</div></div>
${rodape(d)}
</body></html>`
}

export function gerarDemonstrativoHtml(d: Cabecalho & { repasse: RepasseDto; linhas: ExtratoLinha[]; documento: string }): string {
  const r = d.repasse
  const titulo = { PROPRIETARIO: 'Demonstrativo de repasse', TERCEIRO: 'Demonstrativo de pagamento', CAUCAO: 'Demonstrativo de devolução de caução' }[r.tipo]
  const creditos = d.linhas.reduce((s, l) => s + l.creditoCentavos, 0)
  const debitos = d.linhas.reduce((s, l) => s + l.debitoCentavos, 0)
  const corpo = d.linhas
    .map(
      (l) =>
        `<tr><td>${esc(formatarData(l.data))}</td><td>${esc(l.historico)}${l.imovel ? `<br><small>${esc(l.imovel)}</small>` : ''}</td><td class="v">${l.creditoCentavos ? esc(formatarMoeda(l.creditoCentavos)) : ''}</td><td class="v">${l.debitoCentavos ? esc(formatarMoeda(l.debitoCentavos)) : ''}</td></tr>`
    )
    .join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo} ${r.id}</title><style>${ESTILO}</style></head><body>
${topo(d)}
<h1>${esc(titulo)} nº ${r.id}</h1>
<div class="sub">${esc(r.pessoa)} — ${esc(formatarDocumento(d.documento))} · gerado em ${esc(formatarData(r.data))} · situação: ${esc(r.situacao === 'PAGO' ? 'pago' : r.situacao === 'CANCELADO' ? 'cancelado' : 'a pagar')}</div>
<table><thead><tr><th>Data</th><th>Histórico</th><th class="v">Créditos</th><th class="v">Débitos</th></tr></thead><tbody>${corpo}
<tr class="total"><td></td><td>Totais</td><td class="v">${esc(formatarMoeda(creditos))}</td><td class="v">${esc(formatarMoeda(debitos))}</td></tr></tbody></table>
<div class="caixa">Valor líquido ${r.tipo === 'PROPRIETARIO' ? 'a repassar' : 'a pagar'}: <b>${esc(formatarMoeda(r.valorCentavos))}</b> (${esc(valorPorExtenso(r.valorCentavos))}).</div>
${rodape(d)}
</body></html>`
}
