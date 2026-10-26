import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { formatarMoeda } from '@shared/dinheiro'
import { formatarCompetencia } from '@shared/financeiro/datas'
import { useState } from 'react'
import { GraficoColunas, GraficoLinha } from '@/components/Graficos'
import { CabecalhoPagina, Cartao, cx, Indicador, Selecao, Tabela } from '@/components/ui'
import { rpc } from '@/lib/rpc'

const mesCurto = (c: string) => formatarCompetencia(c).replace(/^(\w{3})\w*\/(\d{2})(\d{2})$/, '$1/$3')

/** Fluxo de caixa mensal: realizado (razão) nos meses passados e previsto (títulos em aberto) nos próximos. */
export function FluxoCaixa() {
  const [f, setF] = useState({ titularidade: 'PROPRIO' as 'TODAS' | 'PROPRIO' | 'TERCEIROS', mesesAnteriores: '6', mesesFuturos: '6' })
  const entrada = { titularidade: f.titularidade, mesesAnteriores: Number(f.mesesAnteriores), mesesFuturos: Number(f.mesesFuturos) }
  const { data, isLoading, isFetching } = useQuery({ queryKey: ['fluxo-caixa', entrada], queryFn: () => rpc('relatorios.fluxoCaixa', entrada), placeholderData: keepPreviousData })
  const pontos = data ?? []
  const atual = pontos.findIndex((p) => p.projetado)
  const categorias = pontos.map((p) => mesCurto(p.competencia))
  // Saldo de hoje: fim do mês anterior + o que já foi realizado no mês corrente.
  const corrente = atual >= 0 ? pontos[atual]! : null
  const saldoHoje = corrente ? corrente.saldoFinal - corrente.entradasPrevistas + corrente.saidasPrevistas : pontos.at(-1)?.saldoFinal
  const fim = pontos.at(-1)
  return (
    <>
      <CabecalhoPagina titulo="Fluxo de caixa" subtitulo="Realizado a partir dos movimentos bancários registrados; previsto a partir dos títulos em aberto (vencidos entram no mês atual)." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Selecao aria-label="Contas" className="w-64" opcoes={{ PROPRIO: 'Contas próprias da imobiliária', TERCEIROS: 'Contas de recursos de terceiros', TODAS: 'Todas as contas' }} value={f.titularidade} onChange={(e) => setF({ ...f, titularidade: e.target.value as 'PROPRIO' })} />
        <Selecao aria-label="Meses anteriores" className="w-44" opcoes={{ '3': '3 meses anteriores', '6': '6 meses anteriores', '12': '12 meses anteriores' }} value={f.mesesAnteriores} onChange={(e) => setF({ ...f, mesesAnteriores: e.target.value })} />
        <Selecao aria-label="Meses futuros" className="w-44" opcoes={{ '3': '3 meses à frente', '6': '6 meses à frente', '12': '12 meses à frente' }} value={f.mesesFuturos} onChange={(e) => setF({ ...f, mesesFuturos: e.target.value })} />
      </div>
      <div className={cx('transition-opacity', isFetching && !isLoading && 'opacity-60')}>
        <div className="mb-4 grid grid-cols-3 gap-4">
          <Indicador rotulo="Saldo atual" valor={saldoHoje != null ? formatarMoeda(saldoHoje) : '—'} detalhe="Somente movimentos já realizados" />
          <Indicador rotulo="Saldo projetado" valor={fim ? formatarMoeda(fim.saldoFinal) : '—'} tom={fim && fim.saldoFinal < 0 ? 'perigo' : 'destaque'} detalhe={fim ? `Ao fim de ${formatarCompetencia(fim.competencia)}` : undefined} />
          <Indicador rotulo="Previsto nos próximos meses" valor={formatarMoeda(pontos.filter((p) => p.projetado).reduce((s, p) => s + p.entradasPrevistas - p.saidasPrevistas, 0))} detalhe="Entradas menos saídas previstas" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Cartao titulo="Entradas e saídas por mês">
            <GraficoColunas
              titulo="Entradas e saídas por mês"
              categorias={categorias}
              series={[
                { nome: 'Entradas', cor: 1, valores: pontos.map((p) => p.entradasRealizadas), previstos: pontos.map((p) => p.entradasPrevistas) },
                { nome: 'Saídas', cor: 2, valores: pontos.map((p) => p.saidasRealizadas), previstos: pontos.map((p) => p.saidasPrevistas) }
              ]}
              formatar={formatarMoeda}
            />
          </Cartao>
          <Cartao titulo="Saldo ao fim de cada mês">
            <GraficoLinha titulo="Saldo ao fim de cada mês" nome="Saldo" categorias={categorias} valores={pontos.map((p) => p.saldoFinal)} projetadoDesde={atual >= 0 ? atual : undefined} formatar={formatarMoeda} />
          </Cartao>
        </div>
        <Cartao semPadding className="mt-4">
          <Tabela colunas={['Mês', { t: 'Entradas realizadas', cls: 'text-right' }, { t: 'Saídas realizadas', cls: 'text-right' }, { t: 'Entradas previstas', cls: 'text-right' }, { t: 'Saídas previstas', cls: 'text-right' }, { t: 'Saldo final', cls: 'text-right' }]} carregando={isLoading} vazio={pontos.length === 0}>
            {pontos.map((p) => (
              <tr key={p.competencia} className={p.projetado ? 'text-texto-2' : ''}>
                <td>
                  {formatarCompetencia(p.competencia)} {p.projetado && <span className="text-xs text-texto-3">(previsto)</span>}
                </td>
                <td className="numeros text-right">{formatarMoeda(p.entradasRealizadas)}</td>
                <td className="numeros text-right">{formatarMoeda(p.saidasRealizadas)}</td>
                <td className="numeros text-right">{formatarMoeda(p.entradasPrevistas)}</td>
                <td className="numeros text-right">{formatarMoeda(p.saidasPrevistas)}</td>
                <td className={cx('numeros text-right font-medium', p.saldoFinal < 0 && 'text-perigo')}>{formatarMoeda(p.saldoFinal)}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      </div>
    </>
  )
}
