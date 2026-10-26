import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import { adicionarDias, hojeIso } from '@shared/financeiro/datas'
import { ETAPAS, type Etapa } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Abas, CabecalhoPagina, Cartao, cx, Entrada, Indicador, Selecao, Tabela } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { useCorretores } from './comum'

const pct = (bp: number | null) => (bp == null ? '—' : `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

/** Conversão por etapa calculada do histórico real de cada negócio aberto no período. */
export function IndicadoresCrm() {
  const { pode } = useSessao()
  const { data: corretores } = useCorretores()
  const hoje = hojeIso()
  const [tipo, setTipo] = useState<'VENDA' | 'LOCACAO'>('VENDA')
  const [f, setF] = useState({ de: adicionarDias(hoje, -90), ate: hoje, corretorId: '' })
  const entrada = { tipo, de: f.de, ate: f.ate, corretorId: f.corretorId ? Number(f.corretorId) : undefined }
  const { data: d, isFetching } = useQuery({ queryKey: ['indicadores-funil', entrada], queryFn: () => rpc('negocios.indicadores', entrada), placeholderData: keepPreviousData })
  const maximo = Math.max(1, ...(d?.etapas.map((e) => e.alcancaram) ?? [1]))
  return (
    <>
      <CabecalhoPagina titulo="Indicadores de conversão" subtitulo="Negócios abertos no período, acompanhados pelo histórico de etapas — sem estimativas." />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Abas<'VENDA' | 'LOCACAO'> abas={[['VENDA', 'Vendas'], ['LOCACAO', 'Locações']]} ativa={tipo} aoMudar={setTipo} />
        <div className="mb-4 flex gap-2">
          <Entrada type="date" aria-label="De" className="w-40" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} />
          <Entrada type="date" aria-label="Até" className="w-40" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} />
          {pode('crm.carteira_toda') && <Selecao aria-label="Corretor" className="w-52" opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="Todos os corretores" value={f.corretorId} onChange={(e) => setF({ ...f, corretorId: e.target.value })} />}
        </div>
      </div>
      {d && (
        <div className={cx('space-y-4 transition-opacity', isFetching && 'opacity-60')}>
          <div className="grid grid-cols-5 gap-4">
            <Indicador rotulo="Negócios no período" valor={d.total} detalhe={`${d.emAndamento} em andamento`} />
            <Indicador rotulo="Ganhos" valor={d.ganhos} tom="destaque" detalhe={formatarMoeda(d.valorGanhoCentavos)} />
            <Indicador rotulo="Perdidos" valor={d.perdidos} tom={d.perdidos ? 'perigo' : 'neutro'} />
            <Indicador rotulo="Taxa de ganho" valor={pct(d.taxaGanhoBp)} detalhe="Ganhos ÷ encerrados" />
            <Indicador rotulo="Ciclo médio" valor={d.cicloMedioDias != null ? `${d.cicloMedioDias.toLocaleString('pt-BR')} dias` : '—'} detalhe="Da abertura à conclusão" />
          </div>
          <Cartao titulo="Funil — negócios que alcançaram cada etapa">
            <div className="space-y-2" role="table" aria-label="Funil de conversão">
              {d.etapas.map((e) => (
                <div key={e.etapa} role="row" className="grid grid-cols-[8rem_1fr_9rem_8rem] items-center gap-3 text-sm">
                  <span role="rowheader" className="text-texto-2">
                    {ETAPAS[e.etapa as Etapa]}
                  </span>
                  <span role="cell" className="flex items-center gap-2">
                    <span className="h-5 rounded-r bg-serie-1" style={{ width: `${(e.alcancaram / maximo) * 100}%`, minWidth: e.alcancaram ? 4 : 0 }} />
                    <span className="numeros font-medium">{e.alcancaram}</span>
                  </span>
                  <span role="cell" className="numeros text-xs text-texto-2">
                    {e.conversaoProximaBp != null ? `→ ${pct(e.conversaoProximaBp)} avançam` : ''}
                  </span>
                  <span role="cell" className="numeros text-xs text-texto-3">
                    {e.tempoMedioDias != null ? `${e.tempoMedioDias.toLocaleString('pt-BR')} d na etapa` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Cartao>
          <div className="grid grid-cols-2 gap-4">
            <Cartao titulo="Por origem do contato" semPadding>
              <Tabela colunas={['Origem', { t: 'Leads', cls: 'text-right' }, { t: 'Negócios', cls: 'text-right' }, { t: 'Ganhos', cls: 'text-right' }]} vazio={d.porOrigem.length === 0}>
                {d.porOrigem.map((o) => (
                  <tr key={o.origem}>
                    <td>{o.origem}</td>
                    <td className="numeros text-right">{o.leads}</td>
                    <td className="numeros text-right">{o.negocios}</td>
                    <td className="numeros text-right">{o.ganhos}</td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
            <Cartao titulo="Por corretor" semPadding>
              <Tabela colunas={['Corretor', { t: 'Negócios', cls: 'text-right' }, { t: 'Ganhos', cls: 'text-right' }, { t: 'Valor', cls: 'text-right' }]} vazio={d.porCorretor.length === 0}>
                {d.porCorretor.map((c) => (
                  <tr key={c.corretor}>
                    <td>{c.corretor}</td>
                    <td className="numeros text-right">{c.negocios}</td>
                    <td className="numeros text-right">{c.ganhos}</td>
                    <td className="numeros text-right">{formatarMoeda(c.valorGanhoCentavos)}</td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
            <Cartao titulo="Motivos de perda" semPadding>
              <Tabela colunas={['Motivo', { t: 'Negócios', cls: 'text-right' }]} vazio={d.motivosPerda.length === 0}>
                {d.motivosPerda.map((m) => (
                  <tr key={m.motivo}>
                    <td>{m.motivo}</td>
                    <td className="numeros text-right">{m.quantidade}</td>
                  </tr>
                ))}
              </Tabela>
            </Cartao>
          </div>
        </div>
      )}
    </>
  )
}
