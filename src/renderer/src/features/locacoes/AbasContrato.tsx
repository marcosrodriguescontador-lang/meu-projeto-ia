import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import type { ContratoDetalhe } from '@shared/dto-financeiro'
import { adicionarMeses, competenciaDe, formatarCompetencia, formatarData, hojeIso } from '@shared/financeiro/datas'
import { DESTINOS_ITEM } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { AreaTexto, Aviso, Botao, Caixa, Campo, Cartao, Confirmacao, Dialogo, Entrada, Indicador, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { BuscaPessoa } from '@/features/pessoas/BuscaPessoa'
import { DialogoTitulo, invalidarFinanceiro, rotuloOrigem, SeloTitulo } from '@/features/financeiro/comum'
import { rpc } from '@/lib/rpc'

export function AbaFinanceiro({ contrato }: { contrato: ContratoDetalhe }) {
  const { data, isLoading } = useQuery({ queryKey: ['titulos', { contratoId: contrato.id }], queryFn: () => rpc('titulos.listar', { contratoId: contrato.id }) })
  const [aberto, setAberto] = useState<number | null>(null)
  const abertos = data?.itens.filter((t) => t.sentido === 'RECEBER' && ['ABERTO', 'PARCIAL'].includes(t.situacao)) ?? []
  const vencidos = abertos.filter((t) => t.diasAtraso > 0)
  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-4">
        <Indicador rotulo="Em aberto" valor={formatarMoeda(abertos.reduce((s, t) => s + t.saldoCentavos, 0))} />
        <Indicador rotulo="Vencido" valor={formatarMoeda(vencidos.reduce((s, t) => s + t.saldoCentavos, 0))} tom={vencidos.length ? 'perigo' : 'neutro'} detalhe={`${vencidos.length} título(s)`} />
        <Indicador rotulo="Última competência gerada" valor={contrato.ultimaCompetenciaGerada ? formatarCompetencia(contrato.ultimaCompetenciaGerada) : '—'} />
        <Indicador rotulo="Aluguel vigente" valor={formatarMoeda(contrato.aluguelCentavos)} />
      </div>
      <Cartao semPadding titulo="Títulos do contrato">
        <Tabela colunas={['Vencimento', 'Descrição', 'Origem', { t: 'Valor', cls: 'text-right' }, { t: 'Saldo', cls: 'text-right' }, 'Situação']} vazio={data?.itens.length === 0} carregando={isLoading}>
          {data?.itens.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => setAberto(t.id)}>
              <td className="numeros">{formatarData(t.vencimento)}</td>
              <td>
                {t.descricao}
                <div className="text-xs text-texto-3">{t.pessoa}</div>
              </td>
              <td className="text-texto-2">{rotuloOrigem(t.origem)}</td>
              <td className="numeros text-right">{formatarMoeda(t.valorCentavos)}</td>
              <td className="numeros text-right font-medium">{formatarMoeda(t.saldoCentavos)}</td>
              <td>
                <SeloTitulo situacao={t.situacao} diasAtraso={t.diasAtraso} />
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {aberto !== null && <DialogoTitulo id={aberto} aoFechar={() => setAberto(null)} />}
    </>
  )
}

export function AbaLancamentos({ contrato }: { contrato: ContratoDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['lancamentos', contrato.id], queryFn: () => rpc('contratos.lancamentos', { id: contrato.id }) })
  const [novo, setNovo] = useState(false)
  const [cancelar, setCancelar] = useState<number | null>(null)
  const [f, setF] = useState({ pagador: 'LOCATARIO' as 'LOCATARIO' | 'PROPRIETARIO', destino: 'IMOBILIARIA' as keyof typeof DESTINOS_ITEM, descricao: '', valor: '', competencia: adicionarMeses(competenciaDe(hojeIso()), 0), beneficiarioId: null as number | null, beneficiario: '', irrf: false })
  const [falha, setFalha] = useState<string | null>(null)
  const ativo = contrato.situacao === 'ATIVO'
  return (
    <Cartao
      semPadding
      titulo="Lançamentos avulsos"
      acoes={
        ativo &&
        pode('locacoes.gerenciar') && (
          <Botao tamanho="sm" variante="primario" icone={<Plus className="size-3.5" />} onClick={() => setNovo(true)}>
            Novo lançamento
          </Botao>
        )
      }
    >
      <div className="px-5 pt-4">
        <Aviso>
          <strong>Cobrança ao locatário</strong>: entra na próxima cobrança mensal (valor negativo = crédito ao locatário, por conta do proprietário). <strong>Débito ao proprietário</strong>: descontado imediatamente do saldo a repassar
          (ex.: manutenção paga pela imobiliária, taxa de contrato).
        </Aviso>
      </div>
      <Tabela colunas={['Competência', 'Descrição', 'Pagador', 'Destino', { t: 'Valor', cls: 'text-right' }, 'Situação', '']} vazio={data?.length === 0} carregando={isLoading}>
        {data?.map((l) => (
          <tr key={l.id}>
            <td>{formatarCompetencia(l.competencia)}</td>
            <td>
              {l.descricao} {l.natureza === 'IRRF' && <Selo>IRRF</Selo>}
            </td>
            <td>{l.pagador === 'LOCATARIO' ? 'Locatário' : 'Proprietário'}</td>
            <td className="text-texto-2">
              {DESTINOS_ITEM[l.destino as keyof typeof DESTINOS_ITEM]}
              {l.beneficiarioNome && ` — ${l.beneficiarioNome}`}
            </td>
            <td className={`numeros text-right ${l.valorCentavos < 0 ? 'text-destaque' : ''}`}>{formatarMoeda(l.valorCentavos)}</td>
            <td>
              <Selo tom={l.situacao === 'CANCELADO' ? 'neutro' : l.situacao === 'PENDENTE' ? 'alerta' : 'destaque'}>{{ PENDENTE: 'Aguardando cobrança', INCLUIDO: 'Na cobrança', LANCADO: 'Debitado', CANCELADO: 'Cancelado' }[l.situacao]}</Selo>
            </td>
            <td>
              {['PENDENTE', 'LANCADO'].includes(l.situacao) && pode('locacoes.gerenciar') && (
                <Botao tamanho="sm" variante="fantasma" onClick={() => setCancelar(l.id)}>
                  Cancelar
                </Botao>
              )}
            </td>
          </tr>
        ))}
      </Tabela>
      <Dialogo
        aberto={novo}
        titulo="Novo lançamento avulso"
        aoFechar={() => setNovo(false)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setNovo(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={async () => {
                setFalha(null)
                try {
                  await rpc('contratos.criarLancamento', { contratoId: contrato.id, competencia: f.competencia, descricao: f.descricao, valor: f.valor, pagador: f.pagador, destino: f.irrf ? 'PROPRIETARIO' : f.destino, beneficiarioId: f.beneficiarioId, natureza: f.irrf ? 'IRRF' : 'OUTRO' })
                  toast.sucesso('Lançamento registrado.')
                  void qc.invalidateQueries({ queryKey: ['lancamentos', contrato.id] })
                  invalidarFinanceiro(qc)
                  setNovo(false)
                  setF((x) => ({ ...x, descricao: '', valor: '' }))
                } catch (e) {
                  setFalha(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Registrar
            </Botao>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Campo rotulo="Quem paga">
            {(i) => (
              <Selecao
                id={i}
                opcoes={{ LOCATARIO: 'Locatário (na próxima cobrança)', PROPRIETARIO: 'Proprietário (débito no repasse)' }}
                value={f.pagador}
                onChange={(e) => setF({ ...f, irrf: false, pagador: e.target.value as 'LOCATARIO', destino: e.target.value === 'PROPRIETARIO' ? 'IMOBILIARIA' : f.destino })}
              />
            )}
          </Campo>
          <Campo rotulo="Valor vai para">
            {(i) => <Selecao id={i} disabled={f.irrf} opcoes={f.pagador === 'PROPRIETARIO' ? { IMOBILIARIA: DESTINOS_ITEM.IMOBILIARIA, TERCEIRO: DESTINOS_ITEM.TERCEIRO } : DESTINOS_ITEM} value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value as 'IMOBILIARIA' })} />}
          </Campo>
          {f.destino === 'TERCEIRO' && (
            <div className="col-span-2">
              <div className="mb-1 text-xs text-texto-2">Beneficiário</div>
              {f.beneficiarioId ? (
                <div className="flex items-center justify-between rounded-md border border-borda px-3 py-2">
                  {f.beneficiario}
                  <button type="button" className="text-xs underline" onClick={() => setF({ ...f, beneficiarioId: null })}>
                    trocar
                  </button>
                </div>
              ) : (
                <BuscaPessoa aoSelecionar={(p) => setF({ ...f, beneficiarioId: p.id, beneficiario: p.nome })} />
              )}
            </div>
          )}
          <Campo rotulo="Descrição" className="col-span-2">{(i) => <Entrada id={i} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />}</Campo>
          <Campo rotulo="Valor" ajuda={f.pagador === 'LOCATARIO' ? 'Use "-" para crédito ao locatário' : undefined}>{(i) => <Entrada id={i} className="numeros text-right" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />}</Campo>
          <Campo rotulo="Competência">{(i) => <Entrada id={i} type="month" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} />}</Campo>
          {f.pagador === 'LOCATARIO' && (
            <div className="col-span-2">
              <Caixa
                rotulo="IRRF retido pelo locatário"
                descricao='Locatário pessoa jurídica que retém o imposto: informe o valor negativo (ex.: "-150,00"). Abate do aluguel do proprietário e entra na base da DIMOB.'
                checked={f.irrf}
                onChange={(e) => setF({ ...f, irrf: e.target.checked, destino: e.target.checked ? 'PROPRIETARIO' : f.destino, descricao: e.target.checked && !f.descricao ? 'IRRF retido na fonte' : f.descricao })}
              />
            </div>
          )}
          {falha && (
            <div className="col-span-2">
              <Aviso tom="perigo">{falha}</Aviso>
            </div>
          )}
        </div>
      </Dialogo>
      <Confirmacao
        aberto={cancelar !== null}
        titulo="Cancelar lançamento"
        perigo
        exigirMotivo
        textoConfirmar="Cancelar lançamento"
        mensagem="Débitos já lançados ao proprietário serão estornados no razão."
        aoFechar={() => setCancelar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('contratos.cancelarLancamento', { id: cancelar!, motivo })
          void qc.invalidateQueries({ queryKey: ['lancamentos', contrato.id] })
          invalidarFinanceiro(qc)
        }}
      />
    </Cartao>
  )
}

export function AbaReajustes({ contrato }: { contrato: ContratoDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: reajustes } = useQuery({ queryKey: ['reajustes-contrato', contrato.id], queryFn: () => rpc('contratos.reajustes', { id: contrato.id }) })
  const { data: aditivos } = useQuery({ queryKey: ['aditivos', contrato.id], queryFn: () => rpc('contratos.aditivos', { id: contrato.id }) })
  const [novo, setNovo] = useState(false)
  const [a, setA] = useState({ tipo: 'RENOVACAO' as 'RENOVACAO' | 'ALTERACAO_VALOR' | 'OUTRO', data: hojeIso(), descricao: '', dataFimNova: '', valorNovo: '', competenciaVigencia: '' })
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <div className="grid grid-cols-2 gap-6">
      <Cartao titulo="Valores vigentes do aluguel" semPadding>
        <Tabela colunas={['A partir de', 'Origem', { t: 'Valor', cls: 'text-right' }]}>
          {contrato.vigencias.map((v) => (
            <tr key={v.competencia}>
              <td>{formatarCompetencia(v.competencia)}</td>
              <td className="text-texto-2">{{ CONTRATO: 'Contrato', REAJUSTE: 'Reajuste', ADITIVO: 'Aditivo' }[v.origem]}</td>
              <td className="numeros text-right">{formatarMoeda(v.valorCentavos)}</td>
            </tr>
          ))}
        </Tabela>
        <div className="border-t border-borda px-5 py-3 text-sm text-texto-2">
          Índice: {contrato.indiceSigla ?? 'sem reajuste'} · próximo reajuste: {contrato.proximoReajuste ? formatarData(contrato.proximoReajuste) : '—'}
        </div>
      </Cartao>
      <Cartao titulo="Reajustes aplicados" semPadding>
        <Tabela colunas={['Data base', 'Percentual', { t: 'De → para', cls: 'text-right' }, 'Situação']} vazio={reajustes?.length === 0}>
          {reajustes?.map((r) => (
            <tr key={r.id}>
              <td>{formatarData(r.dataBase)}</td>
              <td className="numeros">{(r.aplicadoPpm / 10_000).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%</td>
              <td className="numeros text-right">
                {formatarMoeda(r.valorAnteriorCentavos)} → {formatarMoeda(r.valorNovoCentavos)}
              </td>
              <td>{r.situacao === 'APLICADO' ? <Selo tom="destaque">Aplicado</Selo> : <Selo title={r.motivo ?? ''}>Dispensado</Selo>}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Cartao
        titulo="Aditivos"
        className="col-span-2"
        semPadding
        acoes={
          contrato.situacao === 'ATIVO' &&
          pode('locacoes.reajustar') && (
            <Botao tamanho="sm" icone={<Plus className="size-3.5" />} onClick={() => setNovo(true)}>
              Registrar aditivo
            </Botao>
          )
        }
      >
        <Tabela colunas={['Data', 'Tipo', 'Descrição', 'Novo término', { t: 'Novo valor', cls: 'text-right' }]} vazio={aditivos?.length === 0}>
          {aditivos?.map((x) => (
            <tr key={x.id}>
              <td>{formatarData(x.data)}</td>
              <td>{{ RENOVACAO: 'Renovação', ALTERACAO_VALOR: 'Alteração de valor', OUTRO: 'Outro' }[x.tipo] ?? x.tipo}</td>
              <td>{x.descricao}</td>
              <td>{x.dataFimNova ? formatarData(x.dataFimNova) : '—'}</td>
              <td className="numeros text-right">{x.valorNovoCentavos ? formatarMoeda(x.valorNovoCentavos) : '—'}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Dialogo
        aberto={novo}
        titulo="Registrar aditivo"
        aoFechar={() => setNovo(false)}
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setNovo(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              onClick={async () => {
                setFalha(null)
                try {
                  await rpc('contratos.registrarAditivo', { contratoId: contrato.id, ...a })
                  toast.sucesso('Aditivo registrado.')
                  void qc.invalidateQueries({ queryKey: ['aditivos', contrato.id] })
                  void qc.invalidateQueries({ queryKey: ['contrato', contrato.id] })
                  setNovo(false)
                } catch (e) {
                  setFalha(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Registrar
            </Botao>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Campo rotulo="Tipo">{(i) => <Selecao id={i} opcoes={{ RENOVACAO: 'Renovação de prazo', ALTERACAO_VALOR: 'Alteração de valor', OUTRO: 'Outro' }} value={a.tipo} onChange={(e) => setA({ ...a, tipo: e.target.value as 'OUTRO' })} />}</Campo>
          <Campo rotulo="Data">{(i) => <Entrada id={i} type="date" value={a.data} onChange={(e) => setA({ ...a, data: e.target.value })} />}</Campo>
          <Campo rotulo="Descrição" className="col-span-2">{(i) => <AreaTexto id={i} value={a.descricao} onChange={(e) => setA({ ...a, descricao: e.target.value })} />}</Campo>
          <Campo rotulo="Novo término">{(i) => <Entrada id={i} type="date" value={a.dataFimNova} onChange={(e) => setA({ ...a, dataFimNova: e.target.value })} />}</Campo>
          <div />
          <Campo rotulo="Novo aluguel">{(i) => <CampoMoeda id={i} value={a.valorNovo} onChange={(e) => setA({ ...a, valorNovo: e.target.value })} />}</Campo>
          <Campo rotulo="Vale a partir da competência">{(i) => <Entrada id={i} type="month" value={a.competenciaVigencia} onChange={(e) => setA({ ...a, competenciaVigencia: e.target.value })} />}</Campo>
          {falha && (
            <div className="col-span-2">
              <Aviso tom="perigo">{falha}</Aviso>
            </div>
          )}
        </div>
      </Dialogo>
    </div>
  )
}

export function AbaRescisao({ contrato }: { contrato: ContratoDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [data, setData] = useState(hojeIso())
  const [iniciativa, setIniciativa] = useState<'LOCATARIO' | 'LOCADOR' | 'MUTUO'>('LOCATARIO')
  const [motivo, setMotivo] = useState('')
  const [cobrar, setCobrar] = useState(true)
  const [dispensa, setDispensa] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const { data: sim, error } = useQuery({ queryKey: ['simular-rescisao', contrato.id, data], queryFn: () => rpc('contratos.simularRescisao', { id: contrato.id, data }), enabled: contrato.situacao === 'ATIVO' && /^\d{4}-\d{2}-\d{2}$/.test(data) })
  if (contrato.situacao !== 'ATIVO') return <Aviso>Contrato {contrato.situacao.toLowerCase()} em {formatarData(contrato.encerradoEm)}.</Aviso>
  return (
    <div className="grid grid-cols-2 gap-6">
      <Cartao titulo="Dados da rescisão">
        <div className="space-y-3 text-sm">
          <Campo rotulo="Data de entrega das chaves">{(i) => <Entrada id={i} type="date" max={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} />}</Campo>
          <Campo rotulo="Iniciativa">{(i) => <Selecao id={i} opcoes={{ LOCATARIO: 'Locatário', LOCADOR: 'Locador', MUTUO: 'Mútuo acordo' }} value={iniciativa} onChange={(e) => setIniciativa(e.target.value as 'MUTUO')} />}</Campo>
          <Campo rotulo="Motivo" obrigatorio>{(i) => <AreaTexto id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
          <Caixa rotulo="Cobrar multa rescisória" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} />
          {!cobrar && <Campo rotulo="Motivo da dispensa" obrigatorio>{(i) => <Entrada id={i} value={dispensa} onChange={(e) => setDispensa(e.target.value)} />}</Campo>}
          {pode('locacoes.rescindir') && (
            <Botao variante="perigo" disabled={!motivo.trim() || (!cobrar && !dispensa.trim())} onClick={() => setConfirmar(true)}>
              Registrar rescisão
            </Botao>
          )}
        </div>
      </Cartao>
      <Cartao titulo="Memória de cálculo">
        {error && <Aviso tom="perigo">{(error as Error).message}</Aviso>}
        {sim && (
          <div className="numeros space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-texto-2">Aluguel proporcional de {formatarCompetencia(sim.competenciaFinal)}</span>
              <span>{formatarMoeda(sim.aluguelProporcionalCentavos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-texto-2">Multa rescisória {cobrar ? '' : '(dispensada)'}</span>
              <span className={cobrar ? '' : 'line-through'}>{formatarMoeda(sim.multaCalculadaCentavos)}</span>
            </div>
            <div className="text-xs text-texto-3">{sim.memoria}</div>
            <div className="flex justify-between">
              <span className="text-texto-2">Caução a devolver</span>
              <span>{formatarMoeda(sim.saldoCaucaoCentavos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-texto-2">Títulos em aberto (permanecem cobráveis)</span>
              <span>{sim.titulosEmAberto}</span>
            </div>
          </div>
        )}
      </Cartao>
      <Confirmacao
        aberto={confirmar}
        titulo="Confirmar rescisão"
        perigo
        palavraChave="RESCINDIR"
        textoConfirmar="Rescindir contrato"
        mensagem="Serão gerados: cobrança proporcional do último mês, título da rescisão (multa e lançamentos pendentes) e a devolução da caução. O imóvel volta a ficar disponível para locação."
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={async () => {
          await rpc('contratos.rescindir', { contratoId: contrato.id, dataEntregaChaves: data, iniciativa, motivo, cobrarMulta: cobrar, dispensaMotivo: dispensa })
          toast.sucesso('Rescisão registrada.')
          void qc.invalidateQueries({ queryKey: ['contrato', contrato.id] })
          invalidarFinanceiro(qc)
        }}
      />
    </div>
  )
}
