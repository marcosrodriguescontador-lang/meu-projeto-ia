import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { centavosParaTexto, formatarMoeda, paraCentavos } from '@shared/dinheiro'
import type { TituloDetalhe } from '@shared/dto-financeiro'
import { decomporPagamento } from '@shared/financeiro/calculos'
import { formatarData, hojeIso } from '@shared/financeiro/datas'
import { DESTINOS_ITEM, FORMAS_PAGAMENTO, ORIGENS_TITULO, SITUACOES_TITULO } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Caixa, Campo, Confirmacao, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { rpc } from '@/lib/rpc'

export function SeloTitulo({ situacao, diasAtraso = 0 }: { situacao: string; diasAtraso?: number }) {
  if (diasAtraso > 0 && ['ABERTO', 'PARCIAL'].includes(situacao)) return <Selo tom="perigo">Vencido há {diasAtraso} d</Selo>
  const tom = ({ ABERTO: 'alerta', PARCIAL: 'alerta', LIQUIDADO: 'destaque', CANCELADO: 'neutro', RENEGOCIADO: 'neutro' } as const)[situacao as 'ABERTO'] ?? 'neutro'
  return <Selo tom={tom}>{SITUACOES_TITULO[situacao as keyof typeof SITUACOES_TITULO] ?? situacao}</Selo>
}

export const rotuloOrigem = (o: string) => ORIGENS_TITULO[o as keyof typeof ORIGENS_TITULO] ?? o

export function useContas() {
  return useQuery({ queryKey: ['contas-financeiras'], queryFn: () => rpc('financeiro.contas.listar', {}) })
}

export function invalidarFinanceiro(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['titulos', 'titulo', 'contas-financeiras', 'repasses', 'saldos-repasse', 'painel', 'inadimplencia', 'contrato', 'contratos', 'previa-cobrancas', 'extrato']) void qc.invalidateQueries({ queryKey: [k] })
}

const DESTINO_ROTULO: Record<string, string> = { ...DESTINOS_ITEM, CAUCAO: 'Caução (terceiros)', PASSIVO: 'Valores de terceiros' }

/** Detalhe do título com itens, baixas e ações (receber/pagar, estornar, recibo, cancelar). */
export function DialogoTitulo({ id, aoFechar }: { id: number; aoFechar: () => void }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: t } = useQuery({ queryKey: ['titulo', id], queryFn: () => rpc('titulos.obter', { id }) })
  const [baixar, setBaixar] = useState(false)
  const [estornar, setEstornar] = useState<number | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const aberto = t && ['ABERTO', 'PARCIAL'].includes(t.situacao)
  return (
    <Dialogo
      aberto
      largura="max-w-4xl"
      titulo={t ? `${rotuloOrigem(t.origem)} — título #${t.id}` : 'Carregando…'}
      aoFechar={aoFechar}
      rodape={
        t && (
          <>
            {aberto && !t.repasseId && pode('financeiro.estornar') && t.baixas.every((b) => b.estornada) && (
              <Botao variante="fantasma" icone={<XCircle className="size-4" />} onClick={() => setCancelar(true)}>
                Cancelar título
              </Botao>
            )}
            <Botao variante="fantasma" onClick={aoFechar}>
              Fechar
            </Botao>
            {aberto && pode(t.sentido === 'RECEBER' ? 'financeiro.receber' : 'financeiro.pagar') && (
              <Botao variante="primario" onClick={() => setBaixar(true)}>
                {t.sentido === 'RECEBER' ? 'Registrar recebimento' : 'Registrar pagamento'}
              </Botao>
            )}
          </>
        )
      }
    >
      {t && (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-4 gap-4">
            <Info rotulo={t.sentido === 'RECEBER' ? 'Devedor' : 'Favorecido'} valor={t.pessoa} />
            <Info rotulo="Vencimento" valor={`${formatarData(t.vencimento)}${t.vencimento !== t.vencimentoOriginal ? ` (orig. ${formatarData(t.vencimentoOriginal)})` : ''}`} />
            <Info rotulo="Valor / saldo" valor={`${formatarMoeda(t.valorCentavos)} / ${formatarMoeda(t.saldoCentavos)}`} />
            <div>
              <div className="text-xs text-texto-2">Situação</div>
              <SeloTitulo situacao={t.situacao} diasAtraso={t.diasAtraso} />
            </div>
          </div>
          <div className="text-texto-2">
            {t.descricao}
            {t.contratoNumero && ` · contrato nº ${t.contratoNumero}`} · recurso {t.recurso === 'TERCEIROS' ? 'de terceiros' : 'próprio'}
            {t.sentido === 'RECEBER' && t.multaBp > 0 && ` · multa ${t.multaBp / 100}% e juros ${t.jurosMesBp / 100}% a.m. (${t.destinoEncargos === 'PROPRIETARIO' ? 'ao proprietário' : 'à imobiliária'})`}
          </div>
          {t.motivoCancelamento && <Aviso tom="alerta">Cancelado: {t.motivoCancelamento}</Aviso>}
          <div className="rounded-md border border-borda">
            <Tabela colunas={['Item', 'Destino', { t: 'Valor', cls: 'text-right' }, { t: 'Saldo', cls: 'text-right' }]}>
              {t.itens.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.descricao}
                    {i.taxaTipo && <span className="text-xs text-texto-3"> · taxa {i.taxaTipo === 'INTERMEDIACAO' ? 'de intermediação' : 'de administração'} {i.taxaBp / 100}%</span>}
                  </td>
                  <td className="text-xs text-texto-2">
                    {DESTINO_ROTULO[i.destino] ?? i.destino}
                    {i.beneficiario && ` — ${i.beneficiario}`}
                  </td>
                  <td className="numeros text-right">{formatarMoeda(i.valorCentavos)}</td>
                  <td className="numeros text-right">{formatarMoeda(i.saldoCentavos)}</td>
                </tr>
              ))}
            </Tabela>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold tracking-wide text-texto-2 uppercase">Baixas</div>
            {t.baixas.length === 0 ? (
              <div className="text-texto-3">Nenhuma baixa registrada.</div>
            ) : (
              <div className="rounded-md border border-borda">
                <Tabela colunas={['Data', 'Conta / forma', { t: 'Principal', cls: 'text-right' }, { t: 'Encargos', cls: 'text-right' }, { t: 'Desconto', cls: 'text-right' }, { t: 'Total', cls: 'text-right' }, '']}>
                  {t.baixas.map((b) => (
                    <tr key={b.id} className={b.estornada ? 'text-texto-3 line-through' : ''}>
                      <td className="numeros">{formatarData(b.data)}</td>
                      <td>
                        {b.conta} · {FORMAS_PAGAMENTO[b.forma as keyof typeof FORMAS_PAGAMENTO] ?? b.forma}
                        {b.estornada && <div className="text-xs no-underline">Estornada: {b.estornoMotivo}</div>}
                      </td>
                      <td className="numeros text-right">{formatarMoeda(b.principalCentavos)}</td>
                      <td className="numeros text-right">{formatarMoeda(b.multaCentavos + b.jurosCentavos)}</td>
                      <td className="numeros text-right">{formatarMoeda(b.descontoCentavos)}</td>
                      <td className="numeros text-right font-medium">{formatarMoeda(b.totalCentavos)}</td>
                      <td className="text-right whitespace-nowrap">
                        {t.sentido === 'RECEBER' && (
                          <Botao
                            tamanho="sm"
                            variante="fantasma"
                            icone={<FileDown className="size-3.5" />}
                            title="Recibo em PDF"
                            onClick={async () => {
                              try {
                                if (await rpc('titulos.recibo', { baixaId: b.id })) toast.sucesso('Recibo gerado.')
                              } catch (e) {
                                toast.erro(e)
                              }
                            }}
                          />
                        )}
                        {!b.estornada && pode('financeiro.estornar') && <Botao tamanho="sm" variante="fantasma" icone={<RotateCcw className="size-3.5" />} title="Estornar" onClick={() => setEstornar(b.id)} />}
                      </td>
                    </tr>
                  ))}
                </Tabela>
              </div>
            )}
          </div>
        </div>
      )}
      {baixar && t && (t.sentido === 'RECEBER' ? <DialogoRecebimento titulo={t} aoFechar={() => setBaixar(false)} /> : <DialogoPagamento titulo={t} aoFechar={() => setBaixar(false)} />)}
      <Confirmacao
        aberto={estornar !== null}
        titulo="Estornar baixa"
        perigo
        exigirMotivo
        textoConfirmar="Estornar"
        mensagem="Será criado um lançamento inverso: o caixa, os saldos de proprietários/terceiros e as receitas voltam ao estado anterior, e o título volta a ter saldo. A baixa original permanece no histórico."
        aoFechar={() => setEstornar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('titulos.estornar', { baixaId: estornar!, motivo })
          toast.sucesso('Baixa estornada.')
          invalidarFinanceiro(qc)
        }}
      />
      <Confirmacao
        aberto={cancelar}
        titulo="Cancelar título"
        perigo
        exigirMotivo
        textoConfirmar="Cancelar título"
        mensagem="O título deixa de ser cobrado. Lançamentos avulsos incluídos voltam a ficar pendentes e a cobrança da competência poderá ser gerada novamente."
        aoFechar={() => setCancelar(false)}
        aoConfirmar={async (motivo) => {
          await rpc('titulos.cancelar', { id, motivo })
          toast.sucesso('Título cancelado.')
          invalidarFinanceiro(qc)
        }}
      />
    </Dialogo>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-texto-2">{rotulo}</div>
      <div className="numeros font-medium">{valor}</div>
    </div>
  )
}

export function DialogoRecebimento({ titulo: t, aoFechar }: { titulo: TituloDetalhe; aoFechar: () => void }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: contas } = useContas()
  const [data, setData] = useState(hojeIso())
  const [valor, setValor] = useState('')
  const [desconto, setDesconto] = useState('')
  const [dispensar, setDispensar] = useState(false)
  const [conta, setConta] = useState('')
  const [forma, setForma] = useState('PIX')
  const [obs, setObs] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const { data: previa } = useQuery({ queryKey: ['previa-recebimento', t.id, data], queryFn: () => rpc('titulos.previaRecebimento', { id: t.id, data }), enabled: /^\d{4}-\d{2}-\d{2}$/.test(data) })
  const descontoC = paraCentavos(desconto) ?? 0
  const devido = previa ? (dispensar ? previa.saldoCentavos - descontoC : previa.totalDevidoCentavos - descontoC) : 0
  useEffect(() => {
    if (previa) setValor(centavosParaTexto(Math.max(0, dispensar ? previa.saldoCentavos - descontoC : previa.totalDevidoCentavos - descontoC)))
  }, [previa, dispensar, descontoC])
  useEffect(() => {
    if (!conta && contas?.length) setConta(String((contas.find((c) => c.titularidade === 'TERCEIROS') ?? contas[0])!.id))
  }, [contas, conta])
  const decomposicao = useMemo(() => {
    const v = paraCentavos(valor)
    if (!previa || !v) return null
    try {
      return decomporPagamento(v, previa.saldoCentavos - descontoC, { vencimentoOriginal: t.vencimentoOriginal, vencimentoUtil: t.vencimento, dataPagamento: data, multaBp: t.multaBp, jurosMesBp: t.jurosMesBp }, dispensar)
    } catch (e) {
      return e instanceof Error ? e.message : 'Valor inválido'
    }
  }, [valor, previa, descontoC, dispensar, data, t])
  const contaSel = contas?.find((c) => String(c.id) === conta)
  return (
    <Dialogo
      aberto
      titulo="Registrar recebimento"
      aoFechar={aoFechar}
      largura="max-w-xl"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={enviando}
            disabled={typeof decomposicao !== 'object' || !decomposicao || !conta}
            onClick={async () => {
              setEnviando(true)
              setFalha(null)
              try {
                const r = await rpc('titulos.receber', { tituloId: t.id, data, valorRecebido: valor, desconto, dispensarEncargos: dispensar, contaFinanceiraId: Number(conta), forma: forma as 'PIX', observacao: obs })
                toast.sucesso(`Recebimento de ${formatarMoeda(r.total)} registrado.`)
                invalidarFinanceiro(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Confirmar recebimento
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data do recebimento">{(i) => <Entrada id={i} type="date" max={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} />}</Campo>
          <Campo rotulo="Valor recebido">{(i) => <CampoMoeda id={i} value={valor} onChange={(e) => setValor(e.target.value)} />}</Campo>
          <Campo rotulo="Conta de destino">
            {(i) => <Selecao id={i} opcoes={(contas ?? []).map((c) => [String(c.id), `${c.nome} (${c.titularidade === 'TERCEIROS' ? 'terceiros' : 'próprio'})`] as [string, string])} vazio="Selecione" value={conta} onChange={(e) => setConta(e.target.value)} />}
          </Campo>
          <Campo rotulo="Forma">{(i) => <Selecao id={i} opcoes={FORMAS_PAGAMENTO} value={forma} onChange={(e) => setForma(e.target.value)} />}</Campo>
        </div>
        {contaSel?.titularidade === 'PROPRIO' && <Aviso tom="alerta">Aluguéis são recursos de terceiros. Prefira uma conta de titularidade "terceiros" para manter a separação bancária.</Aviso>}
        {pode('financeiro.dispensar_encargos') && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Campo rotulo="Desconto no principal" ajuda="Reduz o valor repassado ao proprietário.">{(i) => <CampoMoeda id={i} value={desconto} onChange={(e) => setDesconto(e.target.value)} />}</Campo>
            <Caixa rotulo="Dispensar multa e juros" checked={dispensar} onChange={(e) => setDispensar(e.target.checked)} className="pb-6" />
          </div>
        )}
        {previa && (
          <div className="numeros grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-superficie-2 p-3">
            <span className="text-texto-2">Saldo do título</span>
            <span className="text-right">{formatarMoeda(previa.saldoCentavos)}</span>
            <span className="text-texto-2">Atraso</span>
            <span className="text-right">{previa.diasAtraso ? `${previa.diasAtraso} dia(s)` : 'em dia'}</span>
            <span className="text-texto-2">Multa / juros {dispensar && '(dispensados)'}</span>
            <span className="text-right">
              {formatarMoeda(previa.multaCentavos)} / {formatarMoeda(previa.jurosCentavos)}
            </span>
            <span className="font-medium">Total devido</span>
            <span className="text-right font-medium">{formatarMoeda(devido)}</span>
            {decomposicao && typeof decomposicao === 'object' && paraCentavos(valor)! < devido && (
              <span className="col-span-2 mt-1 text-xs text-alerta">
                Recebimento parcial: principal {formatarMoeda(decomposicao.principal)}, multa {formatarMoeda(decomposicao.multa)}, juros {formatarMoeda(decomposicao.juros)}. O saldo restante continua em aberto.
              </span>
            )}
          </div>
        )}
        {typeof decomposicao === 'string' && <Aviso tom="perigo">{decomposicao}</Aviso>}
        <Campo rotulo="Observação">{(i) => <Entrada id={i} value={obs} onChange={(e) => setObs(e.target.value)} />}</Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

export function DialogoPagamento({ titulo: t, aoFechar }: { titulo: TituloDetalhe; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: contas } = useContas()
  const [data, setData] = useState(hojeIso())
  const [valor, setValor] = useState(centavosParaTexto(t.saldoCentavos))
  const [conta, setConta] = useState('')
  const [forma, setForma] = useState('TRANSFERENCIA')
  const [obs, setObs] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    if (!conta && contas?.length) setConta(String((contas.find((c) => c.titularidade === 'TERCEIROS') ?? contas[0])!.id))
  }, [contas, conta])
  const contaSel = contas?.find((c) => String(c.id) === conta)
  return (
    <Dialogo
      aberto
      titulo="Registrar pagamento"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={enviando}
            onClick={async () => {
              setEnviando(true)
              setFalha(null)
              try {
                await rpc('titulos.pagar', { tituloId: t.id, data, valor, contaFinanceiraId: Number(conta), forma: forma as 'PIX', observacao: obs })
                toast.sucesso('Pagamento registrado.')
                invalidarFinanceiro(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Confirmar pagamento
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="text-texto-2">
          {t.descricao} — favorecido: <strong className="text-texto">{t.pessoa}</strong>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data do pagamento">{(i) => <Entrada id={i} type="date" max={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} />}</Campo>
          <Campo rotulo="Valor" ajuda={`Saldo: ${formatarMoeda(t.saldoCentavos)}`}>{(i) => <CampoMoeda id={i} value={valor} onChange={(e) => setValor(e.target.value)} />}</Campo>
          <Campo rotulo="Conta de saída" ajuda={contaSel ? `Saldo disponível: ${formatarMoeda(contaSel.saldoAtualCentavos)}` : undefined}>
            {(i) => <Selecao id={i} opcoes={(contas ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="Selecione" value={conta} onChange={(e) => setConta(e.target.value)} />}
          </Campo>
          <Campo rotulo="Forma">{(i) => <Selecao id={i} opcoes={FORMAS_PAGAMENTO} value={forma} onChange={(e) => setForma(e.target.value)} />}</Campo>
        </div>
        <Campo rotulo="Observação">{(i) => <Entrada id={i} value={obs} onChange={(e) => setObs(e.target.value)} />}</Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}
