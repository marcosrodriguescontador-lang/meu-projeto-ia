import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, ListChecks, Send } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import type { SaldoRepasse } from '@shared/dto-financeiro'
import { adicionarDias, formatarData, hojeIso } from '@shared/financeiro/datas'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Campo, Cartao, Confirmacao, Dialogo, Entrada, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { DialogoTitulo, invalidarFinanceiro } from './comum'

const TIPOS = { PROPRIETARIO: 'Proprietários', TERCEIRO: 'Terceiros (condomínio, prestadores)', CAUCAO: 'Cauções' } as const

export function Repasses() {
  const [aba, setAba] = useState<'saldos' | 'repasses'>('saldos')
  return (
    <>
      <CabecalhoPagina titulo="Repasses" subtitulo="Valores de terceiros administrados: só o que foi efetivamente recebido entra no saldo a repassar." />
      <Abas
        abas={[
          ['saldos', 'Saldos a repassar'],
          ['repasses', 'Repasses gerados']
        ]}
        ativa={aba}
        aoMudar={setAba}
      />
      {aba === 'saldos' ? <Saldos /> : <ListaRepasses />}
    </>
  )
}

function Saldos() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['saldos-repasse'], queryFn: () => rpc('repasses.saldos', {}) })
  const [extrato, setExtrato] = useState<SaldoRepasse | null>(null)
  const [gerar, setGerar] = useState<SaldoRepasse | 'LOTE' | null>(null)
  const [vencimento, setVencimento] = useState(adicionarDias(hojeIso(), 1))
  return (
    <>
      {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((tipo) => {
        const linhas = data?.filter((s) => s.tipo === tipo) ?? []
        return (
          <Cartao
            key={tipo}
            semPadding
            className="mb-4"
            titulo={`${TIPOS[tipo]} — ${formatarMoeda(linhas.reduce((s, l) => s + Math.max(0, l.saldoCentavos), 0))}`}
            acoes={
              tipo === 'PROPRIETARIO' &&
              pode('financeiro.repasses') &&
              linhas.some((l) => l.saldoCentavos > 0) && (
                <Botao tamanho="sm" variante="primario" icone={<ListChecks className="size-3.5" />} onClick={() => setGerar('LOTE')}>
                  Gerar todos os repasses
                </Botao>
              )
            }
          >
            <Tabela colunas={['Pessoa', 'Lançamentos', { t: 'Saldo', cls: 'text-right' }, '']} vazio={!isLoading && linhas.length === 0} carregando={isLoading}>
              {linhas.map((s) => (
                <tr key={`${s.tipo}-${s.pessoaId}`}>
                  <td className="font-medium">{s.pessoa}</td>
                  <td className="numeros text-texto-2">{s.lancamentos}</td>
                  <td className={`numeros text-right font-medium ${s.saldoCentavos < 0 ? 'text-perigo' : ''}`}>
                    {formatarMoeda(s.saldoCentavos)}
                    {s.saldoCentavos < 0 && <div className="text-xs font-normal">saldo devedor (compensado nos próximos créditos)</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setExtrato(s)}>
                      Extrato
                    </Botao>
                    {pode('financeiro.repasses') && s.saldoCentavos > 0 && (
                      <Botao tamanho="sm" icone={<Send className="size-3.5" />} onClick={() => setGerar(s)}>
                        Gerar {tipo === 'PROPRIETARIO' ? 'repasse' : tipo === 'CAUCAO' ? 'devolução' : 'pagamento'}
                      </Botao>
                    )}
                  </td>
                </tr>
              ))}
            </Tabela>
          </Cartao>
        )
      })}
      {extrato && <DialogoExtrato saldo={extrato} aoFechar={() => setExtrato(null)} />}
      <Dialogo
        aberto={gerar !== null}
        titulo={gerar === 'LOTE' ? 'Gerar repasses para todos os proprietários' : 'Gerar repasse'}
        aoFechar={() => setGerar(null)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setGerar(null)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={async () => {
                try {
                  if (gerar === 'LOTE') {
                    const r = await rpc('repasses.gerarLote', { vencimento })
                    toast.sucesso(`${r.gerados.length} repasse(s) gerado(s)${r.ignorados.length ? `; ${r.ignorados.length} com saldo devedor` : ''}.`)
                  } else if (gerar) {
                    const r = await rpc('repasses.gerar', { tipo: gerar.tipo, pessoaId: gerar.pessoaId, vencimento })
                    toast.sucesso(`Repasse nº ${r.id} gerado: ${formatarMoeda(r.valorCentavos)}.`)
                  }
                  invalidarFinanceiro(qc)
                  setGerar(null)
                } catch (e) {
                  toast.erro(e)
                }
              }}
            >
              Gerar
            </Botao>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {gerar && gerar !== 'LOTE' && (
            <div>
              {gerar.pessoa}: <strong className="numeros">{formatarMoeda(gerar.saldoCentavos)}</strong>
            </div>
          )}
          <Campo rotulo="Data prevista de pagamento">{(i) => <Entrada id={i} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />}</Campo>
          <Aviso>O saldo é congelado no repasse (título a pagar). Novos recebimentos entram no próximo repasse.</Aviso>
        </div>
      </Dialogo>
    </>
  )
}

function DialogoExtrato({ saldo, aoFechar }: { saldo: SaldoRepasse; aoFechar: () => void }) {
  const { data } = useQuery({ queryKey: ['extrato', saldo.tipo, saldo.pessoaId], queryFn: () => rpc('repasses.extrato', { tipo: saldo.tipo, pessoaId: saldo.pessoaId }) })
  return (
    <Dialogo aberto largura="max-w-4xl" titulo={`Extrato pendente — ${saldo.pessoa}`} aoFechar={aoFechar}>
      <Tabela colunas={['Data', 'Histórico', 'Contrato', { t: 'Crédito', cls: 'text-right' }, { t: 'Débito', cls: 'text-right' }]}>
        {data?.map((l) => (
          <tr key={l.partidaId}>
            <td className="numeros">{formatarData(l.data)}</td>
            <td>
              {l.historico}
              {l.imovel && <div className="text-xs text-texto-3">{l.imovel}</div>}
            </td>
            <td className="numeros text-texto-2">{l.contratoNumero ? `nº ${l.contratoNumero}` : '—'}</td>
            <td className="numeros text-right">{l.creditoCentavos ? formatarMoeda(l.creditoCentavos) : ''}</td>
            <td className="numeros text-right text-perigo">{l.debitoCentavos ? formatarMoeda(l.debitoCentavos) : ''}</td>
          </tr>
        ))}
      </Tabela>
      <div className="numeros mt-3 text-right text-sm">
        Saldo: <strong>{formatarMoeda(saldo.saldoCentavos)}</strong>
      </div>
    </Dialogo>
  )
}

function ListaRepasses() {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [situacao, setSituacao] = useState('ABERTO')
  const { data, isLoading } = useQuery({ queryKey: ['repasses', situacao], queryFn: () => rpc('repasses.listar', { situacao: situacao || undefined }) })
  const [titulo, setTitulo] = useState<number | null>(null)
  const [cancelar, setCancelar] = useState<number | null>(null)
  return (
    <Cartao
      semPadding
      titulo="Repasses"
      acoes={
        <div className="flex gap-1">
          {[
            ['ABERTO', 'A pagar'],
            ['PAGO', 'Pagos'],
            ['CANCELADO', 'Cancelados'],
            ['', 'Todos']
          ].map(([v, r]) => (
            <Botao key={v} tamanho="sm" variante={situacao === v ? 'primario' : 'fantasma'} onClick={() => setSituacao(v!)}>
              {r}
            </Botao>
          ))}
        </div>
      }
    >
      <Tabela colunas={['Nº', 'Tipo', 'Favorecido', 'Gerado em', { t: 'Valor', cls: 'text-right' }, { t: 'A pagar', cls: 'text-right' }, 'Situação', '']} vazio={data?.length === 0} carregando={isLoading}>
        {data?.map((r) => (
          <tr key={r.id}>
            <td className="numeros">{r.id}</td>
            <td className="text-texto-2">{r.tipo === 'PROPRIETARIO' ? 'Repasse' : r.tipo === 'CAUCAO' ? 'Devolução de caução' : 'Pagamento a terceiro'}</td>
            <td className="font-medium">{r.pessoa}</td>
            <td className="numeros">{formatarData(r.data)}</td>
            <td className="numeros text-right">{formatarMoeda(r.valorCentavos)}</td>
            <td className="numeros text-right">{formatarMoeda(r.saldoTituloCentavos)}</td>
            <td>{r.situacao === 'PAGO' ? <Selo tom="destaque">Pago</Selo> : r.situacao === 'CANCELADO' ? <Selo>Cancelado</Selo> : <Selo tom="alerta">A pagar</Selo>}</td>
            <td className="text-right whitespace-nowrap">
              <Botao
                tamanho="sm"
                variante="fantasma"
                icone={<FileDown className="size-3.5" />}
                title="Demonstrativo em PDF"
                onClick={async () => {
                  try {
                    if (await rpc('repasses.demonstrativoPdf', { id: r.id })) toast.sucesso('Demonstrativo gerado.')
                  } catch (e) {
                    toast.erro(e)
                  }
                }}
              />
              {r.tituloId && r.situacao !== 'CANCELADO' && (
                <Botao tamanho="sm" variante={r.situacao === 'ABERTO' ? 'secundario' : 'fantasma'} onClick={() => setTitulo(r.tituloId)}>
                  {r.situacao === 'ABERTO' ? 'Pagar' : 'Ver'}
                </Botao>
              )}
              {r.situacao === 'ABERTO' && pode('financeiro.repasses') && (
                <Botao tamanho="sm" variante="fantasma" onClick={() => setCancelar(r.id)}>
                  Cancelar
                </Botao>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
      {titulo !== null && <DialogoTitulo id={titulo} aoFechar={() => setTitulo(null)} />}
      <Confirmacao
        aberto={cancelar !== null}
        titulo="Cancelar repasse"
        perigo
        exigirMotivo
        textoConfirmar="Cancelar repasse"
        mensagem="Os valores voltam ao saldo a repassar do favorecido."
        aoFechar={() => setCancelar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('repasses.cancelar', { id: cancelar!, motivo })
          invalidarFinanceiro(qc)
        }}
      />
    </Cartao>
  )
}
