// Ficha do imóvel (HTML → PDF). Versão comercial (para clientes) ou interna (com proprietários e registro).
import { formatarDocumento } from '@shared/documentos'
import { formatarArea, formatarMoeda, formatarPercentual } from '@shared/dinheiro'
import type { EmpresaConfig, ImovelDetalhe } from '@shared/dto'
import { FINALIDADES_IMOVEL, SITUACOES_OFERTA, TIPOS_IMOVEL, type SituacaoOferta } from '@shared/schemas'

export interface DadosFicha {
  imovel: ImovelDetalhe
  caracteristicas: string[]
  fotos: { capa: string | null; demais: string[] }
  empresa: EmpresaConfig | null
  logo: string | null
  interna: boolean
  emitidoEm: Date
  emitidoPor: string
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const linha = (rotulo: string, valor: string | null | undefined) => (valor ? `<tr><th>${esc(rotulo)}</th><td>${esc(valor)}</td></tr>` : '')

export function gerarFichaHtml(d: DadosFicha): string {
  const i = d.imovel
  const tipo = TIPOS_IMOVEL[i.tipo as keyof typeof TIPOS_IMOVEL] ?? i.tipo
  const finalidade = FINALIDADES_IMOVEL[i.finalidade as keyof typeof FINALIDADES_IMOVEL] ?? i.finalidade
  // Na ficha comercial só aparecem ofertas efetivamente disponíveis ao público.
  const ofertas = i.ofertas.filter((o) => d.interna || ['DISPONIVEL', 'RESERVADO', 'EM_NEGOCIACAO'].includes(o.situacao))
  const marca = d.logo
    ? `<img class="logo" src="${d.logo}" alt="Status Negócios Imobiliários">`
    : `<div class="marca-texto"><b>STATUS</b><span>Negócios Imobiliários</span></div>`
  const blocosOferta = ofertas
    .map(
      (o) => `<div class="oferta">
        <div class="mod">${o.modalidade === 'VENDA' ? 'Venda' : 'Locação'}</div>
        <div class="valor">${esc(formatarMoeda(o.valorCentavos))}${o.modalidade === 'LOCACAO' ? '<small>/mês</small>' : ''}</div>
        ${d.interna ? `<div class="det">${esc(SITUACOES_OFERTA[o.situacao as SituacaoOferta] ?? o.situacao)} · comissão ${esc(formatarPercentual(o.comissaoBp))}</div>` : ''}
      </div>`
    )
    .join('')
  const numeros = [
    i.dormitorios ? `${i.dormitorios} dormitório(s)` : '',
    i.suites ? `${i.suites} suíte(s)` : '',
    i.banheiros ? `${i.banheiros} banheiro(s)` : '',
    i.vagas ? `${i.vagas} vaga(s)` : '',
    i.areaConstruida ? `${formatarArea(i.areaConstruida)} construídos` : '',
    i.areaTerreno ? `${formatarArea(i.areaTerreno)} de terreno` : ''
  ].filter(Boolean)
  const internos = d.interna && i.internos
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha do imóvel ${i.codigo}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #0a0a0a; font-size: 10.5pt; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0a0a0a; padding-bottom: 8px; }
  .logo { height: 46px; }
  .marca-texto b { display: block; letter-spacing: .3em; font-size: 18pt; }
  .marca-texto span { font-size: 7pt; letter-spacing: .2em; text-transform: uppercase; color: #57534e; }
  .emp { text-align: right; font-size: 8.5pt; color: #57534e; line-height: 1.4; }
  h1 { font-size: 15pt; margin: 14px 0 2px; }
  .sub { color: #57534e; margin-bottom: 10px; }
  .capa { width: 100%; height: 300px; object-fit: cover; border-radius: 4px; }
  .galeria { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px; }
  .galeria img { width: 100%; height: 110px; object-fit: cover; border-radius: 3px; }
  .ofertas { display: flex; gap: 10px; margin: 12px 0; }
  .oferta { flex: 1; border: 1px solid #d6d3d1; border-radius: 4px; padding: 8px 12px; }
  .oferta .mod { font-size: 8pt; text-transform: uppercase; letter-spacing: .1em; color: #57534e; }
  .oferta .valor { font-size: 16pt; font-weight: 600; }
  .oferta small { font-size: 9pt; font-weight: 400; color: #57534e; }
  .oferta .det { font-size: 8.5pt; color: #57534e; }
  .numeros { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
  .numeros span { background: #f5f5f4; border-radius: 3px; padding: 3px 8px; font-size: 9pt; }
  h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #e7e5e4; padding-bottom: 3px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; width: 34%; color: #57534e; font-weight: 500; padding: 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  .descricao { white-space: pre-wrap; line-height: 1.5; }
  .carac { columns: 3; font-size: 9pt; }
  .carac div::before { content: '• '; }
  .interna { border: 1px solid #b45309; color: #b45309; font-size: 8pt; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; letter-spacing: .08em; }
  footer { margin-top: 18px; border-top: 1px solid #e7e5e4; padding-top: 6px; font-size: 7.5pt; color: #78716c; display: flex; justify-content: space-between; }
</style></head><body>
<header>${marca}<div class="emp">${esc(d.empresa?.nomeFantasia ?? 'Status Negócios Imobiliários')}<br>CRECI ${esc(d.empresa?.creci ?? '038595-J')}${d.empresa?.telefone ? `<br>${esc(d.empresa.telefone)}` : ''}${d.empresa?.email ? ` · ${esc(d.empresa.email)}` : ''}</div></header>
<h1>${esc(tipo)} — ${esc(i.bairro)}, ${esc(i.cidade)}/${esc(i.uf)} ${d.interna ? '<span class="interna">Uso interno</span>' : ''}</h1>
<div class="sub">Código ${i.codigo} · ${esc(finalidade)}${d.interna ? ` · ${esc(i.logradouro)}, ${esc(i.numero)}${i.complemento ? ` — ${esc(i.complemento)}` : ''} · CEP ${esc(i.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2'))}` : ''}</div>
${d.fotos.capa ? `<img class="capa" src="${d.fotos.capa}">` : ''}
${d.fotos.demais.length ? `<div class="galeria">${d.fotos.demais.map((f) => `<img src="${f}">`).join('')}</div>` : ''}
${blocosOferta ? `<div class="ofertas">${blocosOferta}</div>` : ''}
${numeros.length ? `<div class="numeros">${numeros.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
${i.descricaoComercial ? `<h2>Descrição</h2><div class="descricao">${esc(i.descricaoComercial)}</div>` : ''}
${d.caracteristicas.length ? `<h2>Características</h2><div class="carac">${d.caracteristicas.map((c) => `<div>${esc(c)}</div>`).join('')}</div>` : ''}
<h2>Custos mensais/anuais</h2><table>
${linha('Condomínio (mensal)', i.condominioCentavos != null ? formatarMoeda(i.condominioCentavos) : 'Não informado')}
${linha('IPTU (anual)', i.iptuAnualCentavos != null ? formatarMoeda(i.iptuAnualCentavos) : 'Não informado')}
</table>
${
  internos
    ? `<h2>Dados internos</h2><table>
  ${linha('Matrícula', i.internos!.matricula ? `${i.internos!.matricula} — ${i.internos!.cartorio ?? ''}` : null)}
  ${linha('Inscrição municipal / IPTU', i.internos!.inscricaoMunicipal)}
  ${linha('Corretor responsável', i.corretor?.nome)}
  ${i.internos!.proprietarios.map((p) => linha(p.principal ? 'Proprietário (principal)' : 'Coproprietário', `${p.nome} — ${formatarDocumento(p.documento)} — ${formatarPercentual(p.percentualBp)}`)).join('')}
  ${linha('Observações', i.internos!.observacoesInternas)}
  </table>`
    : i.corretor
      ? `<h2>Atendimento</h2><table>${linha('Corretor', i.corretor.nome)}</table>`
      : ''
}
<footer><span>Valores e disponibilidade sujeitos a alteração sem aviso prévio.</span><span>Emitido em ${esc(d.emitidoEm.toLocaleString('pt-BR'))} por ${esc(d.emitidoPor)}</span></footer>
</body></html>`
}
