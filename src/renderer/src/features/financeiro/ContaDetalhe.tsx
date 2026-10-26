import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CheckCheck, FileUp, Link2, Plus, RotateCcw, Undo2, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatarMoeda } from '@shared/dinheiro'
import type { LinhaExtratoDto, MovimentoPendente } from '@shared/dto-financeiro'
import { diferencaDias, formatarData } from '@shared/financeiro/datas'
import type { MapaCsv } from '@shared/financeiro/extratos'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Campo, Cartao, Confirmacao, cx, Dialogo, Entrada, Indicador, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { invalidarFinanceiro } from './comum'
import { SeletorCategoria, SeletorPessoa } from './NovoTitulo'

type Aba = 'conciliacao' | 'movimentos' | 'transferencias' | 'importacoes'

const valorCor = (v: number) => (v < 0 ? 'text-perigo' : '')

/** Página da conta: movimentos, importação de extrato e conciliação bancária. */
export function ContaDetalhe() {
  const id = Number(useParams().id)
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [aba, setAba] = useState<Aba>('conciliacao')
  const [importar, setImportar] = useState<{ token: string; nome: string; formato: 'OFX' | 'CSV'; previa: { separador: string; linhas: string[][] } | null } | null>(null)
  const { data: contas } = useQuery({ queryKey: ['contas-financeiras', 'todas'], queryFn: () => rpc('financeiro.contas.listar', { incluirInativas: true }) })
  const conta = contas?.find((c) => c.id === id)
  const { data: resumo } = useQuery({ queryKey: ['conciliacao', id, 'resumo'], queryFn: () => rpc('extratos.resumo', { contaId: id }) })
  const atualizar = () => {
    invalidarFinanceiro(qc)
    void qc.invalidateQueries({ queryKey: ['conciliacao', id] })
    void qc.invalidateQueries({ queryKey: ['movimentos', id] })
    void qc.invalidateQueries({ queryKey: ['posicao-terceiros'] })
  }
  const enviarImportacao = async (token: string, mapaCsv: MapaCsv | null) => {
    const r = await rpc('extratos.importar', { contaId: id, token, mapaCsv })
    toast.sucesso(`${r.novas} transação(ões) nova(s)${r.duplicadas ? `, ${r.duplicadas} já importada(s) ignorada(s)` : ''}; ${r.conciliadasAutomaticamente} conciliada(s) automaticamente.`)
    atualizar()
    setAba('conciliacao')
  }
  return (
    <>
      <CabecalhoPagina
        titulo={conta?.nome ?? 'Conta'}
        subtitulo={conta ? `${conta.titularidade === 'TERCEIROS' ? 'Recursos de terceiros' : 'Recursos próprios'}${conta.bancoCodigo ? ` · banco ${conta.bancoCodigo} · ag. ${conta.agencia ?? '—'} · conta ${conta.conta ?? '—'}` : ''}` : undefined}
        voltar={
          <Link to="/financeiro/contas" className="inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3.5" /> Contas bancárias
          </Link>
        }
        acoes={
          pode('financeiro.receber') && (
            <Botao
              variante="primario"
              icone={<FileUp className="size-4" />}
              onClick={async () => {
                try {
                  const arq = await rpc('extratos.escolherArquivo')
                  if (!arq) return
                  if (arq.formato === 'OFX') await enviarImportacao(arq.token, null)
                  else setImportar(arq)
                } catch (e) {
                  toast.erro(e)
                }
              }}
            >
              Importar extrato (OFX/CSV)
            </Botao>
          )
        }
      />
      {resumo && (
        <div className="mb-4 grid grid-cols-4 gap-4">
          <Indicador rotulo="Saldo no sistema" valor={formatarMoeda(resumo.saldoSistemaCentavos)} detalhe="Todos os movimentos registrados" />
          <Indicador
            rotulo="Saldo no extrato do banco"
            valor={resumo.ultimoExtrato?.saldoCentavos != null ? formatarMoeda(resumo.ultimoExtrato.saldoCentavos) : '—'}
            detalhe={resumo.ultimoExtrato?.data ? `Em ${formatarData(resumo.ultimoExtrato.data)} (${resumo.ultimoExtrato.arquivo})` : 'Importe um extrato com saldo'}
          />
          <Indicador
            rotulo="Diferença na data do extrato"
            valor={resumo.diferencaCentavos != null ? formatarMoeda(resumo.diferencaCentavos) : '—'}
            tom={resumo.diferencaCentavos == null ? 'neutro' : resumo.diferencaCentavos === 0 ? 'destaque' : 'perigo'}
            detalhe={resumo.saldoSistemaNaDataCentavos != null ? `Sistema na data: ${formatarMoeda(resumo.saldoSistemaNaDataCentavos)}` : undefined}
          />
          <Indicador rotulo="Pendências" valor={`${resumo.linhasPendentes} / ${resumo.movimentosPendentes}`} tom={resumo.linhasPendentes || resumo.movimentosPendentes ? 'alerta' : 'destaque'} detalhe="Linhas do extrato / movimentos do sistema sem par" />
        </div>
      )}
      <Abas<Aba>
        abas={[
          ['conciliacao', 'Conciliação', resumo?.linhasPendentes],
          ['movimentos', 'Movimentos do sistema'],
          ['transferencias', 'Transferências'],
          ['importacoes', 'Importações', resumo?.importacoes.length]
        ]}
        ativa={aba}
        aoMudar={setAba}
      />
      <div className="mt-4">
        {aba === 'conciliacao' && <Conciliacao contaId={id} aoAlterar={atualizar} />}
        {aba === 'movimentos' && <Movimentos contaId={id} />}
        {aba === 'transferencias' && <Transferencias contaId={id} aoAlterar={atualizar} />}
        {aba === 'importacoes' && (
          <Cartao semPadding>
            <Tabela colunas={['Arquivo', 'Formato', 'Período', { t: 'Transações', cls: 'text-right' }, { t: 'Novas', cls: 'text-right' }, 'Importado em']} vazio={resumo?.importacoes.length === 0}>
              {resumo?.importacoes.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium">{i.arquivo}</td>
                  <td>{i.formato}</td>
                  <td className="numeros">{i.periodo.split(' a ').map((d) => (d === '?' ? '?' : formatarData(d))).join(' a ')}</td>
                  <td className="numeros text-right">{i.lidas}</td>
                  <td className="numeros text-right">{i.novas}</td>
                  <td className="numeros text-texto-2">{new Date(i.importadoEm).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </Tabela>
          </Cartao>
        )}
      </div>
      {importar && <MapeamentoCsv arquivo={importar} aoFechar={() => setImportar(null)} aoConfirmar={(mapa) => enviarImportacao(importar.token, mapa)} />}
    </>
  )
}

function Conciliacao({ contaId, aoAlterar }: { contaId: number; aoAlterar: () => void }) {
  const { pode } = useSessao()
  const toast = useToast()
  const [filtro, setFiltro] = useState<'PENDENTE' | 'CONCILIADA' | 'IGNORADA' | ''>('PENDENTE')
  const { data: linhas, isLoading } = useQuery({ queryKey: ['conciliacao', contaId, 'linhas', filtro], queryFn: () => rpc('extratos.linhas', { contaId, situacao: filtro || undefined }) })
  const { data: pendentes } = useQuery({ queryKey: ['conciliacao', contaId, 'pendentes'], queryFn: () => rpc('conciliacao.pendentes', { contaId }) })
  const { data: sugestoes } = useQuery({ queryKey: ['conciliacao', contaId, 'sugestoes'], queryFn: () => rpc('conciliacao.sugestoes', { contaId }) })
  const [escolher, setEscolher] = useState<LinhaExtratoDto | null>(null)
  const [lancar, setLancar] = useState<LinhaExtratoDto | null>(null)
  const [ignorar, setIgnorar] = useState<number | null>(null)
  const porPartida = useMemo(() => new Map((pendentes ?? []).map((m) => [m.partidaId, m])), [pendentes])
  const sugestaoDe = (linhaId: number) => {
    const s = sugestoes?.find((x) => x.linhaId === linhaId)
    return s ? { ...s, mov: porPartida.get(s.partidaId) } : null
  }
  const acao = async (f: () => Promise<unknown>, msg: string) => {
    try {
      await f()
      toast.sucesso(msg)
      aoAlterar()
    } catch (e) {
      toast.erro(e)
    }
  }
  const podeConciliar = pode('financeiro.receber')
  return (
    <div className="space-y-4">
      <Cartao
        semPadding
        titulo="Linhas do extrato bancário"
        acoes={
          <div className="flex items-center gap-2">
            <Selecao aria-label="Situação" opcoes={{ PENDENTE: 'Pendentes', CONCILIADA: 'Conciliadas', IGNORADA: 'Ignoradas' }} vazio="Todas" value={filtro} onChange={(e) => setFiltro(e.target.value as 'PENDENTE')} className="h-8 w-40" />
            {podeConciliar && (
              <Botao tamanho="sm" icone={<Wand2 className="size-3.5" />} onClick={() => acao(async () => toast.sucesso(`${await rpc('conciliacao.automatica', { contaId })} linha(s) conciliada(s).`), 'Conciliação automática concluída.')}>
                Conciliar automaticamente
              </Botao>
            )}
          </div>
        }
      >
        <Tabela colunas={['Data', 'Descrição no banco', { t: 'Valor', cls: 'text-right' }, 'Situação / par no sistema', '']} vazio={linhas?.length === 0} carregando={isLoading}>
          {linhas?.map((l) => {
            const s = l.situacao === 'PENDENTE' ? sugestaoDe(l.id) : null
            return (
              <tr key={l.id}>
                <td className="numeros whitespace-nowrap">{formatarData(l.data)}</td>
                <td>
                  {l.descricao}
                  {l.documento && <div className="text-xs text-texto-3">Doc. {l.documento}</div>}
                </td>
                <td className={cx('numeros text-right font-medium', valorCor(l.valorCentavos))}>{formatarMoeda(l.valorCentavos)}</td>
                <td className="text-sm">
                  {l.situacao === 'CONCILIADA' && (
                    <>
                      <Selo tom="destaque">{l.automatica ? 'Conciliada (automática)' : 'Conciliada'}</Selo>
                      <div className="text-xs text-texto-2">{l.historicoSistema}</div>
                    </>
                  )}
                  {l.situacao === 'IGNORADA' && (
                    <>
                      <Selo>Ignorada</Selo>
                      <div className="text-xs text-texto-2">{l.motivoIgnorar}</div>
                    </>
                  )}
                  {l.situacao === 'PENDENTE' &&
                    (s?.mov ? (
                      <div className="text-xs">
                        <span className="text-texto-3">Sugestão: </span>
                        {formatarData(s.mov.data)} · {s.mov.historico}
                        {s.diasDiferenca > 0 && <span className="text-texto-3"> ({s.diasDiferenca} dia(s) de diferença)</span>}
                      </div>
                    ) : (
                      <Selo tom="alerta">Sem par no sistema</Selo>
                    ))}
                </td>
                <td className="text-right whitespace-nowrap">
                  {podeConciliar && l.situacao === 'PENDENTE' && (
                    <>
                      {s?.mov && (
                        <Botao tamanho="sm" variante="destaque" icone={<CheckCheck className="size-3.5" />} onClick={() => acao(() => rpc('conciliacao.conciliar', { contaId, linhaId: l.id, partidaId: s.partidaId }), 'Linha conciliada.')}>
                          Aceitar
                        </Botao>
                      )}
                      <Botao tamanho="sm" variante="fantasma" title="Escolher o movimento do sistema" icone={<Link2 className="size-3.5" />} onClick={() => setEscolher(l)} />
                      <Botao tamanho="sm" variante="fantasma" title="Lançar no sistema (tarifa, rendimento…)" icone={<Plus className="size-3.5" />} onClick={() => setLancar(l)} />
                      <Botao tamanho="sm" variante="fantasma" title="Ignorar linha" icone={<Ban className="size-3.5" />} onClick={() => setIgnorar(l.id)} />
                    </>
                  )}
                  {podeConciliar && l.situacao !== 'PENDENTE' && (
                    <Botao tamanho="sm" variante="fantasma" title="Desfazer" icone={<Undo2 className="size-3.5" />} onClick={() => acao(() => rpc('conciliacao.desfazer', { linhaId: l.id }), 'Linha voltou a ficar pendente.')} />
                  )}
                </td>
              </tr>
            )
          })}
        </Tabela>
      </Cartao>
      <Cartao semPadding titulo="Movimentos do sistema ainda não encontrados no extrato">
        <Tabela colunas={['Data', 'Histórico', { t: 'Valor', cls: 'text-right' }]} vazio={pendentes?.length === 0}>
          {pendentes?.map((m) => (
            <tr key={m.partidaId}>
              <td className="numeros whitespace-nowrap">{formatarData(m.data)}</td>
              <td>{m.historico}</td>
              <td className={cx('numeros text-right', valorCor(m.valorCentavos))}>{formatarMoeda(m.valorCentavos)}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {escolher && <EscolherMovimento linha={escolher} movimentos={pendentes ?? []} aoFechar={() => setEscolher(null)} aoEscolher={(m) => acao(() => rpc('conciliacao.conciliar', { contaId, linhaId: escolher.id, partidaId: m.partidaId }), 'Linha conciliada.').then(() => setEscolher(null))} />}
      {lancar && <LancarDaLinha linha={lancar} aoFechar={() => setLancar(null)} aoConcluir={aoAlterar} />}
      <Confirmacao
        aberto={ignorar !== null}
        titulo="Ignorar linha do extrato"
        exigirMotivo
        textoConfirmar="Ignorar"
        mensagem="A linha deixa de contar como pendência. Use apenas para movimentos que não devem ser lançados (ex.: tarifa estornada pelo banco no mesmo período). A decisão fica registrada na auditoria e pode ser desfeita."
        aoFechar={() => setIgnorar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('conciliacao.ignorar', { linhaId: ignorar!, motivo })
          toast.sucesso('Linha ignorada.')
          aoAlterar()
        }}
      />
    </div>
  )
}

function EscolherMovimento({ linha, movimentos, aoFechar, aoEscolher }: { linha: LinhaExtratoDto; movimentos: MovimentoPendente[]; aoFechar: () => void; aoEscolher: (m: MovimentoPendente) => void }) {
  const candidatos = movimentos.filter((m) => m.valorCentavos === linha.valorCentavos)
  return (
    <Dialogo aberto largura="max-w-2xl" titulo="Conciliar com movimento do sistema" aoFechar={aoFechar}>
      <div className="space-y-3 text-sm">
        <div className="rounded-md bg-superficie-2 p-3">
          <span className="numeros">{formatarData(linha.data)}</span> · {linha.descricao} · <strong className="numeros">{formatarMoeda(linha.valorCentavos)}</strong>
        </div>
        {candidatos.length === 0 ? (
          <Aviso tom="alerta">Nenhum movimento pendente do sistema tem exatamente este valor. Se o banco cobrou ou creditou algo que não está no sistema, use “Lançar no sistema”.</Aviso>
        ) : (
          <div className="rounded-md border border-borda">
            <Tabela colunas={['Data', 'Histórico', { t: 'Valor', cls: 'text-right' }, '']}>
              {candidatos.map((m) => (
                <tr key={m.partidaId}>
                  <td className="numeros whitespace-nowrap">
                    {formatarData(m.data)} <span className="text-xs text-texto-3">({Math.abs(diferencaDias(linha.data, m.data))} d)</span>
                  </td>
                  <td>{m.historico}</td>
                  <td className="numeros text-right">{formatarMoeda(m.valorCentavos)}</td>
                  <td className="text-right">
                    <Botao tamanho="sm" variante="primario" onClick={() => aoEscolher(m)}>
                      Conciliar
                    </Botao>
                  </td>
                </tr>
              ))}
            </Tabela>
          </div>
        )}
        <p className="text-xs text-texto-3">Só são exibidos movimentos com o mesmo valor: a conciliação nunca altera valores já registrados.</p>
      </div>
    </Dialogo>
  )
}

function LancarDaLinha({ linha, aoFechar, aoConcluir }: { linha: LinhaExtratoDto; aoFechar: () => void; aoConcluir: () => void }) {
  const toast = useToast()
  const natureza = linha.valorCentavos < 0 ? 'DESPESA' : 'RECEITA'
  const [categoria, setCategoria] = useState('')
  const [pessoa, setPessoa] = useState<{ id: number; nome: string } | null>(null)
  const [descricao, setDescricao] = useState(linha.descricao)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  return (
    <Dialogo
      aberto
      titulo={natureza === 'DESPESA' ? 'Lançar despesa a partir do extrato' : 'Lançar receita a partir do extrato'}
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
              setFalha(null)
              if (!pessoa) return setFalha('Informe o favorecido/pagador (ex.: o próprio banco).')
              setEnviando(true)
              try {
                await rpc('conciliacao.lancar', { linhaId: linha.id, categoriaId: Number(categoria), pessoaId: pessoa.id, descricao })
                toast.sucesso('Lançado e conciliado.')
                aoConcluir()
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Lançar e conciliar
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="numeros rounded-md bg-superficie-2 p-3">
          {formatarData(linha.data)} · <strong>{formatarMoeda(linha.valorCentavos)}</strong>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-texto-2">{natureza === 'DESPESA' ? 'Favorecido' : 'Pagador'}</div>
          <SeletorPessoa valor={pessoa} aoMudar={setPessoa} />
        </div>
        <Campo rotulo="Categoria">{(i) => <SeletorCategoria id={i} natureza={natureza} valor={categoria} aoMudar={setCategoria} />}</Campo>
        <Campo rotulo="Descrição">{(i) => <Entrada id={i} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}</Campo>
        <Aviso>Será criado um título {natureza === 'DESPESA' ? 'a pagar' : 'a receber'} da imobiliária, já quitado nesta conta na data do extrato, e a linha ficará conciliada.</Aviso>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

function Movimentos({ contaId }: { contaId: number }) {
  const [periodo, setPeriodo] = useState({ de: '', ate: '' })
  const entrada = { contaId, de: periodo.de || undefined, ate: periodo.ate || undefined }
  const { data, isLoading } = useQuery({ queryKey: ['movimentos', contaId, entrada], queryFn: () => rpc('tesouraria.movimentos', entrada) })
  return (
    <Cartao
      semPadding
      titulo="Movimentos registrados"
      acoes={
        <div className="flex gap-2">
          <Entrada type="date" title="De" className="h-8 w-40" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
          <Entrada type="date" title="Até" className="h-8 w-40" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
        </div>
      }
    >
      {data && (
        <div className="numeros border-b border-borda px-4 py-2 text-sm text-texto-2">
          Saldo anterior: <strong className="text-texto">{formatarMoeda(data.saldoAnterior)}</strong>
        </div>
      )}
      <Tabela colunas={['Data', 'Histórico', { t: 'Valor', cls: 'text-right' }, { t: 'Saldo', cls: 'text-right' }, 'Extrato']} vazio={data?.movimentos.length === 0} carregando={isLoading}>
        {data?.movimentos.map((m) => (
          <tr key={m.partidaId} className={m.estornado ? 'text-texto-3' : ''}>
            <td className="numeros whitespace-nowrap">{formatarData(m.data)}</td>
            <td>
              {m.historico} {m.estornado && <Selo>Estornado</Selo>}
            </td>
            <td className={cx('numeros text-right', valorCor(m.valorCentavos))}>{formatarMoeda(m.valorCentavos)}</td>
            <td className="numeros text-right font-medium">{formatarMoeda(m.saldoCentavos)}</td>
            <td>{m.conciliado ? <Selo tom="destaque">Conciliado</Selo> : <span className="text-xs text-texto-3">—</span>}</td>
          </tr>
        ))}
      </Tabela>
    </Cartao>
  )
}

function Transferencias({ contaId, aoAlterar }: { contaId: number; aoAlterar: () => void }) {
  const { pode } = useSessao()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['conciliacao', contaId, 'transferencias'], queryFn: () => rpc('tesouraria.transferencias') })
  const [estornar, setEstornar] = useState<number | null>(null)
  const daConta = data?.filter((t) => t.origemId === contaId || t.destinoId === contaId)
  return (
    <Cartao semPadding>
      <Tabela colunas={['Data', 'De', 'Para', 'Descrição', { t: 'Valor', cls: 'text-right' }, '']} vazio={daConta?.length === 0} carregando={isLoading}>
        {daConta?.map((t) => (
          <tr key={t.id} className={t.estornada ? 'text-texto-3 line-through' : ''}>
            <td className="numeros">{formatarData(t.data)}</td>
            <td>{t.origem}</td>
            <td>{t.destino}</td>
            <td>{t.descricao}</td>
            <td className="numeros text-right">{formatarMoeda(t.valorCentavos)}</td>
            <td className="text-right">{!t.estornada && pode('financeiro.estornar') && <Botao tamanho="sm" variante="fantasma" title="Estornar" icone={<RotateCcw className="size-3.5" />} onClick={() => setEstornar(t.id)} />}</td>
          </tr>
        ))}
      </Tabela>
      <Confirmacao
        aberto={estornar !== null}
        titulo="Estornar transferência"
        perigo
        exigirMotivo
        textoConfirmar="Estornar"
        mensagem="Será criado um lançamento inverso devolvendo o valor à conta de origem. A transferência original permanece no histórico."
        aoFechar={() => setEstornar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('tesouraria.estornarTransferencia', { id: estornar!, motivo })
          toast.sucesso('Transferência estornada.')
          aoAlterar()
        }}
      />
    </Cartao>
  )
}

/** Mapeamento das colunas de um CSV de extrato (cada banco exporta em um layout). */
function MapeamentoCsv({ arquivo, aoFechar, aoConfirmar }: { arquivo: { nome: string; previa: { separador: string; linhas: string[][] } | null }; aoFechar: () => void; aoConfirmar: (m: MapaCsv) => Promise<void> }) {
  const linhas = arquivo.previa?.linhas ?? []
  const colunas = Math.max(0, ...linhas.map((l) => l.length))
  const opcoes = Array.from({ length: colunas }, (_, i) => [String(i), `Coluna ${i + 1}${linhas[0]?.[i] ? ` — ${linhas[0][i]!.slice(0, 24)}` : ''}`] as [string, string])
  const [m, setM] = useState({ linhaInicial: '1', colunaData: '0', colunaDescricao: '1', modo: 'unico' as 'unico' | 'separado', colunaValor: '2', colunaDebito: '2', colunaCredito: '3', colunaDocumento: '', formatoData: 'DD/MM/AAAA' as MapaCsv['formatoData'] })
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const set = (p: Partial<typeof m>) => setM((x) => ({ ...x, ...p }))
  return (
    <Dialogo
      aberto
      largura="max-w-4xl"
      titulo={`Importar CSV — ${arquivo.nome}`}
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
                await aoConfirmar({
                  separador: arquivo.previa?.separador ?? ';',
                  linhaInicial: Math.max(0, Number(m.linhaInicial) - 1),
                  colunaData: Number(m.colunaData),
                  colunaDescricao: Number(m.colunaDescricao),
                  colunaValor: m.modo === 'unico' ? Number(m.colunaValor) : null,
                  colunaDebito: m.modo === 'separado' ? Number(m.colunaDebito) : null,
                  colunaCredito: m.modo === 'separado' ? Number(m.colunaCredito) : null,
                  colunaDocumento: m.colunaDocumento === '' ? null : Number(m.colunaDocumento),
                  formatoData: m.formatoData
                })
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Importar
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="max-h-56 overflow-auto rounded-md border border-borda">
          <table className="w-full text-xs">
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className={cx('border-b border-borda', i < Number(m.linhaInicial) - 1 && 'text-texto-3')}>
                  <td className="numeros bg-superficie-2 px-2 py-1 text-texto-3">{i + 1}</td>
                  {Array.from({ length: colunas }, (_, k) => (
                    <td key={k} className="px-2 py-1 whitespace-nowrap">
                      {l[k] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Campo rotulo="Primeira linha de dados">{(i) => <Entrada id={i} type="number" min={1} value={m.linhaInicial} onChange={(e) => set({ linhaInicial: e.target.value })} />}</Campo>
          <Campo rotulo="Data">{(i) => <Selecao id={i} opcoes={opcoes} value={m.colunaData} onChange={(e) => set({ colunaData: e.target.value })} />}</Campo>
          <Campo rotulo="Formato da data">{(i) => <Selecao id={i} opcoes={{ 'DD/MM/AAAA': 'DD/MM/AAAA', 'AAAA-MM-DD': 'AAAA-MM-DD', 'MM/DD/AAAA': 'MM/DD/AAAA' }} value={m.formatoData} onChange={(e) => set({ formatoData: e.target.value as 'DD/MM/AAAA' })} />}</Campo>
          <Campo rotulo="Descrição">{(i) => <Selecao id={i} opcoes={opcoes} value={m.colunaDescricao} onChange={(e) => set({ colunaDescricao: e.target.value })} />}</Campo>
          <Campo rotulo="Valores">{(i) => <Selecao id={i} opcoes={{ unico: 'Uma coluna (negativo = saída)', separado: 'Colunas de débito e crédito' }} value={m.modo} onChange={(e) => set({ modo: e.target.value as 'unico' })} />}</Campo>
          {m.modo === 'unico' ? (
            <Campo rotulo="Valor">{(i) => <Selecao id={i} opcoes={opcoes} value={m.colunaValor} onChange={(e) => set({ colunaValor: e.target.value })} />}</Campo>
          ) : (
            <>
              <Campo rotulo="Débito (saída)">{(i) => <Selecao id={i} opcoes={opcoes} value={m.colunaDebito} onChange={(e) => set({ colunaDebito: e.target.value })} />}</Campo>
              <Campo rotulo="Crédito (entrada)">{(i) => <Selecao id={i} opcoes={opcoes} value={m.colunaCredito} onChange={(e) => set({ colunaCredito: e.target.value })} />}</Campo>
            </>
          )}
          <Campo rotulo="Documento (opcional)">{(i) => <Selecao id={i} opcoes={opcoes} vazio="—" value={m.colunaDocumento} onChange={(e) => set({ colunaDocumento: e.target.value })} />}</Campo>
        </div>
        <Aviso>Linhas de cabeçalho, de saldo e em branco são ignoradas. Transações já importadas anteriormente não são duplicadas.</Aviso>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}
