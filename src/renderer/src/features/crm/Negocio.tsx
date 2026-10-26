import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, FileSignature, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { centavosParaTexto, formatarMoeda, paraCentavos } from '@shared/dinheiro'
import type { NegocioDetalhe, PropostaDto } from '@shared/dto-crm'
import { formatarData, hojeIso } from '@shared/financeiro/datas'
import { ETAPAS, SEQUENCIA_ETAPAS, SITUACOES_PROPOSTA, SITUACOES_VENDA, TIPOS_PARCELA_VENDA, type Etapa } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Abas, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, cx, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { SeletorPessoa } from '@/features/pessoas/BuscaPessoa'
import { rpc } from '@/lib/rpc'
import { EditorRateio, PainelComissao, rateioParaEnvio, useRateioPadrao, type LinhaRateio } from './comissao'
import { invalidarCrm, ListaAtividades, ListaVisitas, quando, SeloEtapa, useCorretores } from './comum'
import { DialogoPerda } from './Funil'

type Aba = 'propostas' | 'visitas' | 'atividades' | 'venda' | 'comissao' | 'historico'
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function PaginaNegocio() {
  const id = Number(useParams().id)
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: n } = useQuery({ queryKey: ['negocio', id], queryFn: () => rpc('negocios.obter', { id }) })
  const [aba, setAba] = useState<Aba>('propostas')
  const [perda, setPerda] = useState(false)
  const [editar, setEditar] = useState(false)
  const [concluir, setConcluir] = useState(false)
  if (!n) return null
  const encerrado = n.etapa === 'CONCLUIDO' || n.etapa === 'PERDIDO'
  const mover = async (etapa: Etapa) => {
    try {
      await rpc('negocios.mover', { negocioId: id, etapa })
      invalidarCrm(qc)
    } catch (e) {
      toast.erro(e)
    }
  }
  const atual = SEQUENCIA_ETAPAS.indexOf(n.etapa as Etapa)
  return (
    <>
      <CabecalhoPagina
        titulo={n.titulo}
        subtitulo={`${n.tipo === 'VENDA' ? 'Venda' : 'Locação'} · cliente: ${n.cliente}${n.corretor ? ` · corretor: ${n.corretor}` : ''}`}
        voltar={
          <Link to="/crm/funil" className="inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3.5" /> Funil de negócios
          </Link>
        }
        acoes={
          pode('crm.gerenciar') && (
            <>
              {!encerrado && (
                <Botao variante="fantasma" onClick={() => setPerda(true)}>
                  Marcar como perdido
                </Botao>
              )}
              {n.etapa === 'PERDIDO' && !n.venda && <Botao onClick={() => mover('ATENDIMENTO')}>Reabrir</Botao>}
              {!encerrado && <Botao onClick={() => setEditar(true)}>Editar</Botao>}
              {n.tipo === 'LOCACAO' && !encerrado && (
                <Botao variante="primario" icone={<FileSignature className="size-4" />} onClick={() => setConcluir(true)}>
                  Concluir com contrato
                </Botao>
              )}
            </>
          )
        }
      />
      {/* Etapas: clique para mover (as etapas finais seguem a venda ou o contrato). */}
      <ol className="mb-4 flex gap-1" aria-label="Etapas do negócio">
        {SEQUENCIA_ETAPAS.map((e, i) => {
          const feito = n.etapa !== 'PERDIDO' && i <= atual
          const clicavel = pode('crm.gerenciar') && !encerrado && e !== n.etapa && e !== 'CONCLUIDO' && !(e === 'CONTRATO' && n.tipo === 'VENDA') && !n.venda
          return (
            <li key={e} className="flex-1">
              <button
                type="button"
                disabled={!clicavel}
                onClick={() => mover(e)}
                aria-current={e === n.etapa ? 'step' : undefined}
                className={cx('w-full rounded px-2 py-1.5 text-xs font-medium transition-shadow disabled:cursor-default', feito ? 'bg-marca text-marca-texto' : 'bg-superficie-2 text-texto-2', clicavel && 'hover:ring-1 hover:ring-texto-3', e === n.etapa && 'ring-2 ring-destaque')}
              >
                {ETAPAS[e]}
              </button>
            </li>
          )
        })}
      </ol>
      {n.etapa === 'PERDIDO' && (
        <div className="mb-4">
          <Aviso tom="perigo">Negócio perdido: {n.motivoPerda}</Aviso>
        </div>
      )}
      <div className="mb-4 grid grid-cols-4 gap-4">
        <Info rotulo="Cliente" valor={n.clienteNome ?? `${n.leadNome ?? '—'} (lead, sem cadastro)`} link={n.clienteId ? `/pessoas/${n.clienteId}` : n.leadId ? `/crm/leads/${n.leadId}` : undefined} />
        <Info rotulo="Imóvel" valor={n.imovel ?? 'Não definido'} link={n.imovelId ? `/imoveis/${n.imovelId}` : undefined} />
        <Info rotulo={n.tipo === 'VENDA' ? 'Valor ofertado' : 'Aluguel ofertado'} valor={n.ofertaValorCentavos != null ? formatarMoeda(n.ofertaValorCentavos) : '—'} />
        <Info rotulo="Valor estimado" valor={n.valorEstimadoCentavos != null ? formatarMoeda(n.valorEstimadoCentavos) : '—'} />
      </div>
      {n.contratoNumero && (
        <div className="mb-4">
          <Aviso tom="sucesso">
            Concluído com o{' '}
            <Link className="underline" to={`/locacoes/${n.contratoId}`}>
              contrato de locação nº {n.contratoNumero}
            </Link>
            .
          </Aviso>
        </div>
      )}
      <Abas<Aba>
        abas={[
          ['propostas', 'Propostas', n.propostas.length],
          ['visitas', 'Visitas', n.visitas.length],
          ['atividades', 'Atividades', n.atividades.filter((a) => !a.concluidaEm && !a.canceladaEm).length],
          ...(n.tipo === 'VENDA' ? ([['venda', 'Venda']] as [Aba, string][]) : []),
          ...(pode('comissoes.ver') ? ([['comissao', 'Comissão']] as [Aba, string][]) : []),
          ['historico', 'Histórico']
        ]}
        ativa={aba}
        aoMudar={setAba}
      />
      {aba === 'propostas' && <Propostas n={n} />}
      {aba === 'visitas' && <ListaVisitas itens={n.visitas} negocioId={id} imovel={n.imovelId ? { id: n.imovelId, rotulo: n.imovel ?? '' } : null} modalidade={n.tipo} />}
      {aba === 'atividades' && <ListaAtividades itens={n.atividades} negocioId={id} />}
      {aba === 'venda' && <AbaVenda n={n} />}
      {aba === 'comissao' && <AbaComissao n={n} />}
      {aba === 'historico' && (
        <Cartao semPadding>
          <Tabela colunas={['Quando', 'Etapa', 'Por', 'Observação']}>
            {n.historico.map((h, i) => (
              <tr key={i}>
                <td className="numeros whitespace-nowrap">{new Date(h.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>
                  {h.de ? `${ETAPAS[h.de as Etapa]} → ` : ''}
                  <strong>{ETAPAS[h.para as Etapa]}</strong>
                </td>
                <td className="text-texto-2">{h.usuario ?? 'Sistema'}</td>
                <td className="text-texto-2">{h.observacao}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}
      {perda && <DialogoPerda negocio={n} aoFechar={() => setPerda(false)} />}
      {editar && <EditarNegocio n={n} aoFechar={() => setEditar(false)} />}
      {concluir && <ConcluirLocacao n={n} aoFechar={() => setConcluir(false)} />}
    </>
  )
}

function Info({ rotulo, valor, link }: { rotulo: string; valor: string; link?: string }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-3">
      <div className="text-xs text-texto-2">{rotulo}</div>
      {link ? (
        <Link to={link} className="font-medium hover:underline">
          {valor}
        </Link>
      ) : (
        <div className="numeros font-medium">{valor}</div>
      )}
    </div>
  )
}

function EditarNegocio({ n, aoFechar }: { n: NegocioDetalhe; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = useSessao()
  const { data: corretores } = useCorretores()
  const [titulo, setTitulo] = useState(n.titulo)
  const [cliente, setCliente] = useState(n.clienteId ? { id: n.clienteId, nome: n.clienteNome ?? '' } : null)
  const [valor, setValor] = useState(n.valorEstimadoCentavos != null ? centavosParaTexto(n.valorEstimadoCentavos) : '')
  const [corretor, setCorretor] = useState(n.corretorId ? String(n.corretorId) : '')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo="Editar negócio"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={async () => {
              try {
                await rpc('negocios.atualizar', { id: n.id, dados: { titulo, leadId: n.leadId, clienteId: cliente?.id ?? null, imovelId: n.imovelId, corretorId: corretor ? Number(corretor) : null, valorEstimado: valor } })
                toast.sucesso('Negócio atualizado.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(erroTexto(e))
              }
            }}
          >
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Campo rotulo="Título">{(i) => <Entrada id={i} value={titulo} onChange={(e) => setTitulo(e.target.value)} />}</Campo>
        <div>
          <div className="mb-1 text-xs font-medium text-texto-2">Cliente no cadastro de pessoas</div>
          <SeletorPessoa valor={cliente} aoMudar={setCliente} />
          {!cliente && n.leadNome && <div className="mt-1 text-xs text-texto-3">Necessário para registrar propostas. Se “{n.leadNome}” ainda não tem cadastro, crie-o em Pessoas.</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor estimado">{(i) => <CampoMoeda id={i} value={valor} onChange={(e) => setValor(e.target.value)} />}</Campo>
          {pode('crm.carteira_toda') && <Campo rotulo="Corretor">{(i) => <Selecao id={i} opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="—" value={corretor} onChange={(e) => setCorretor(e.target.value)} />}</Campo>}
        </div>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

function ConcluirLocacao({ n, aoFechar }: { n: NegocioDetalhe; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: contratos } = useQuery({ queryKey: ['contratos', 'ativos', n.imovelId], queryFn: () => rpc('contratos.listar', { situacao: 'ATIVO', imovelId: n.imovelId ?? undefined }) })
  const [contrato, setContrato] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  return (
    <Dialogo
      aberto
      titulo="Concluir locação"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            disabled={!contrato}
            onClick={async () => {
              try {
                await rpc('negocios.concluirLocacao', { negocioId: n.id, contratoId: Number(contrato) })
                toast.sucesso('Negócio concluído.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(erroTexto(e))
              }
            }}
          >
            Concluir
          </Botao>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <Campo rotulo="Contrato de locação ativo">
          {(i) => <Selecao id={i} opcoes={(contratos ?? []).map((c) => [String(c.id), `Nº ${c.numero} — cód. ${c.imovelCodigo} · ${c.locatario}`] as [string, string])} vazio="Selecione" value={contrato} onChange={(e) => setContrato(e.target.value)} />}
        </Campo>
        {contratos?.length === 0 && <Aviso tom="alerta">Nenhum contrato ativo{n.imovelId ? ' para este imóvel' : ''}. Cadastre e ative o contrato em Locações.</Aviso>}
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

// ───────────── Propostas ─────────────

function Propostas({ n }: { n: NegocioDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [nova, setNova] = useState<{ anterior: PropostaDto | null } | null>(null)
  const [recusar, setRecusar] = useState<PropostaDto | null>(null)
  const aberto = n.etapa !== 'CONCLUIDO' && n.etapa !== 'PERDIDO' && !n.venda
  const emAnalise = n.propostas.find((p) => p.situacao === 'EM_ANALISE')
  const aceitar = async (p: PropostaDto) => {
    try {
      await rpc('propostas.responder', { propostaId: p.id, situacao: 'ACEITA' })
      toast.sucesso('Proposta aceita.')
      invalidarCrm(qc)
    } catch (e) {
      toast.erro(e)
    }
  }
  return (
    <div className="space-y-3">
      {aberto && pode('vendas.propostas') && !emAnalise && (
        <div className="flex justify-end">
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNova({ anterior: null })}>
            Registrar proposta
          </Botao>
        </div>
      )}
      {n.propostas.length === 0 && <div className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-texto-3">Nenhuma proposta registrada.</div>}
      {n.propostas.map((p) => (
        <Cartao
          key={p.id}
          titulo={
            <span className="flex items-center gap-2">
              Versão {p.versao} — {p.autor === 'CLIENTE' ? 'proposta do cliente' : 'contraproposta do proprietário'}
              <Selo tom={p.situacao === 'ACEITA' ? 'destaque' : p.situacao === 'EM_ANALISE' ? 'alerta' : 'neutro'}>{SITUACOES_PROPOSTA[p.situacao as keyof typeof SITUACOES_PROPOSTA]}</Selo>
            </span>
          }
          acoes={
            p.situacao === 'EM_ANALISE' &&
            aberto &&
            pode('vendas.propostas') && (
              <div className="flex gap-2">
                <Botao tamanho="sm" variante="fantasma" onClick={() => setRecusar(p)}>
                  Recusar
                </Botao>
                <Botao tamanho="sm" onClick={() => setNova({ anterior: p })}>
                  Contraproposta
                </Botao>
                <Botao tamanho="sm" variante="destaque" icone={<Check className="size-3.5" />} onClick={() => aceitar(p)}>
                  Aceitar
                </Botao>
              </div>
            )
          }
        >
          <div className="numeros grid grid-cols-5 gap-4 text-sm">
            <Valor rotulo={n.tipo === 'VENDA' ? 'Valor' : 'Aluguel'} v={p.valorCentavos} forte />
            {n.tipo === 'VENDA' && (
              <>
                <Valor rotulo="Sinal" v={p.sinalCentavos} />
                <Valor rotulo={`Financiamento${p.financiamentoBanco ? ` (${p.financiamentoBanco})` : ''}`} v={p.financiamentoCentavos} />
                <Valor rotulo={`Parcelas (${p.parcelas.length})`} v={p.parcelas.reduce((s, x) => s + x.valorCentavos, 0)} />
                <Valor rotulo="Na escritura" v={p.saldoCentavos} />
              </>
            )}
          </div>
          {p.condicoes && <p className="mt-2 text-sm text-texto-2">Condições: {p.condicoes}</p>}
          <p className="mt-2 text-xs text-texto-3">
            Registrada em {new Date(p.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por {p.criadoPor ?? '—'}
            {p.validade && ` · válida até ${formatarData(p.validade)}`}
            {p.motivo && ` · ${p.motivo}`}
          </p>
        </Cartao>
      ))}
      {nova && <DialogoProposta n={n} anterior={nova.anterior} aoFechar={() => setNova(null)} />}
      <Confirmacao
        aberto={recusar !== null}
        titulo="Recusar proposta"
        exigirMotivo
        textoConfirmar="Recusar"
        mensagem="A proposta fica registrada como recusada. Para negociar valores, prefira registrar uma contraproposta."
        aoFechar={() => setRecusar(null)}
        aoConfirmar={async (motivo) => {
          await rpc('propostas.responder', { propostaId: recusar!.id, situacao: 'RECUSADA', motivo })
          toast.sucesso('Proposta recusada.')
          invalidarCrm(qc)
        }}
      />
    </div>
  )
}

function Valor({ rotulo, v, forte }: { rotulo: string; v: number; forte?: boolean }) {
  return (
    <div>
      <div className="text-xs text-texto-2">{rotulo}</div>
      <div className={forte ? 'font-semibold' : ''}>{formatarMoeda(v)}</div>
    </div>
  )
}

interface ParcelaForm {
  descricao: string
  valor: string
  vencimento: string
}

function DialogoProposta({ n, anterior, aoFechar }: { n: NegocioDetalhe; anterior: PropostaDto | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const txt = (c: number | null | undefined) => (c ? centavosParaTexto(c) : '')
  const [f, setF] = useState({
    autor: anterior ? (anterior.autor === 'CLIENTE' ? 'PROPRIETARIO' : 'CLIENTE') : 'CLIENTE',
    valor: txt(anterior?.valorCentavos ?? n.ofertaValorCentavos),
    sinal: txt(anterior?.sinalCentavos),
    financiamentoBanco: anterior?.financiamentoBanco ?? '',
    financiamento: txt(anterior?.financiamentoCentavos),
    condicoes: '',
    validade: ''
  })
  const [parcelas, setParcelas] = useState<ParcelaForm[]>(anterior?.parcelas.map((p) => ({ descricao: p.descricao, valor: centavosParaTexto(p.valorCentavos), vencimento: p.vencimento })) ?? [])
  const [falha, setFalha] = useState<string | null>(null)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const venda = n.tipo === 'VENDA'
  const saldo = (paraCentavos(f.valor) ?? 0) - (paraCentavos(f.sinal) ?? 0) - (paraCentavos(f.financiamento) ?? 0) - parcelas.reduce((s, p) => s + (paraCentavos(p.valor) ?? 0), 0)
  return (
    <Dialogo
      aberto
      largura="max-w-2xl"
      titulo={anterior ? `Contraproposta à versão ${anterior.versao}` : 'Nova proposta'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            onClick={async () => {
              setFalha(null)
              try {
                await rpc('propostas.registrar', { negocioId: n.id, anteriorId: anterior?.id ?? null, autor: f.autor as 'CLIENTE', valor: f.valor, sinal: f.sinal, financiamentoBanco: f.financiamentoBanco, financiamento: f.financiamento, parcelas, condicoes: f.condicoes, validade: f.validade })
                toast.sucesso(anterior ? 'Contraproposta registrada.' : 'Proposta registrada.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(erroTexto(e))
              }
            }}
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-6 gap-3 text-sm">
        <Campo rotulo="Quem propõe" className="col-span-3">{(i) => <Selecao id={i} disabled={!!anterior} opcoes={{ CLIENTE: n.tipo === 'VENDA' ? 'Cliente (comprador)' : 'Cliente (futuro locatário)', PROPRIETARIO: 'Proprietário' }} value={f.autor} onChange={(e) => set({ autor: e.target.value })} />}</Campo>
        <Campo rotulo={venda ? 'Valor total' : 'Aluguel proposto'} className="col-span-3">{(i) => <CampoMoeda id={i} value={f.valor} onChange={(e) => set({ valor: e.target.value })} />}</Campo>
        {venda && (
          <>
            <Campo rotulo="Sinal" className="col-span-2">{(i) => <CampoMoeda id={i} value={f.sinal} onChange={(e) => set({ sinal: e.target.value })} />}</Campo>
            <Campo rotulo="Financiamento" className="col-span-2">{(i) => <CampoMoeda id={i} value={f.financiamento} onChange={(e) => set({ financiamento: e.target.value })} />}</Campo>
            <Campo rotulo="Banco" className="col-span-2">{(i) => <Entrada id={i} value={f.financiamentoBanco} onChange={(e) => set({ financiamentoBanco: e.target.value })} />}</Campo>
            <div className="col-span-6">
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-texto-2">
                Parcelas diretas
                <Botao tamanho="sm" variante="fantasma" icone={<Plus className="size-3.5" />} onClick={() => setParcelas([...parcelas, { descricao: `Parcela ${parcelas.length + 1}`, valor: '', vencimento: hojeIso() }])}>
                  Adicionar
                </Botao>
              </div>
              {parcelas.map((p, k) => (
                <div key={k} className="mb-2 grid grid-cols-[1fr_9rem_10rem_2rem] gap-2">
                  <Entrada aria-label="Descrição da parcela" value={p.descricao} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === k ? { ...x, descricao: e.target.value } : x)))} />
                  <CampoMoeda aria-label="Valor da parcela" value={p.valor} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === k ? { ...x, valor: e.target.value } : x)))} />
                  <Entrada aria-label="Vencimento" type="date" value={p.vencimento} onChange={(e) => setParcelas(parcelas.map((x, j) => (j === k ? { ...x, vencimento: e.target.value } : x)))} />
                  <Botao tamanho="sm" variante="fantasma" title="Remover" icone={<Trash2 className="size-3.5" />} onClick={() => setParcelas(parcelas.filter((_, j) => j !== k))} />
                </div>
              ))}
            </div>
            <div className={cx('numeros col-span-6 rounded-md bg-superficie-2 px-3 py-2', saldo < 0 && 'text-perigo')}>Saldo a pagar na escritura: {formatarMoeda(saldo)}</div>
          </>
        )}
        <Campo rotulo="Condições" className="col-span-4">{(i) => <Entrada id={i} placeholder="Ex.: sujeito à aprovação do crédito" value={f.condicoes} onChange={(e) => set({ condicoes: e.target.value })} />}</Campo>
        <Campo rotulo="Válida até" className="col-span-2">{(i) => <Entrada id={i} type="date" value={f.validade} onChange={(e) => set({ validade: e.target.value })} />}</Campo>
        <p className="col-span-6 text-xs text-texto-3">Propostas registradas não podem ser alteradas: mudanças são feitas por contraproposta, preservando o histórico da negociação.</p>
        {falha && (
          <div className="col-span-6">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}

// ───────────── Venda ─────────────

function AbaVenda({ n }: { n: NegocioDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [registrar, setRegistrar] = useState(false)
  const [situacao, setSituacao] = useState<'AGUARDANDO_FINANCIAMENTO' | 'ESCRITURADA' | 'CONCLUIDA' | 'DISTRATADA' | null>(null)
  const [dataSit, setDataSit] = useState(hojeIso())
  const [motivo, setMotivo] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const v = n.venda
  if (!v)
    return (
      <div className="rounded-lg border border-dashed border-borda p-6 text-center text-sm">
        <p className="mb-3 text-texto-2">Nenhuma venda registrada. Registrar a venda não gera recebimento: cria a comissão a receber e o controle de sinal e parcelas.</p>
        {pode('vendas.registrar') && n.etapa !== 'CONCLUIDO' && n.etapa !== 'PERDIDO' && (
          <Botao variante="primario" onClick={() => setRegistrar(true)} disabled={!n.imovelId || !n.clienteId}>
            Registrar venda
          </Botao>
        )}
        {(!n.imovelId || !n.clienteId) && <p className="mt-2 text-xs text-texto-3">Defina o imóvel e o cliente do negócio antes.</p>}
        {registrar && <DialogoVenda n={n} aoFechar={() => setRegistrar(false)} />}
      </div>
    )
  const proximas: Record<string, ('AGUARDANDO_FINANCIAMENTO' | 'ESCRITURADA' | 'CONCLUIDA' | 'DISTRATADA')[]> = {
    CONTRATADA: ['AGUARDANDO_FINANCIAMENTO', 'ESCRITURADA', 'CONCLUIDA', 'DISTRATADA'],
    AGUARDANDO_FINANCIAMENTO: ['ESCRITURADA', 'CONCLUIDA', 'DISTRATADA'],
    ESCRITURADA: ['CONCLUIDA']
  }
  return (
    <div className="space-y-4">
      <Cartao
        titulo={
          <span className="flex items-center gap-2">
            Venda nº {v.id} <Selo tom={v.situacao === 'DISTRATADA' ? 'perigo' : v.situacao === 'CONCLUIDA' || v.situacao === 'ESCRITURADA' ? 'destaque' : 'alerta'}>{SITUACOES_VENDA[v.situacao as keyof typeof SITUACOES_VENDA]}</Selo>
          </span>
        }
        acoes={
          pode('vendas.registrar') && (
            <div className="flex gap-2">
              {(proximas[v.situacao] ?? []).map((s) => (
                <Botao key={s} tamanho="sm" variante={s === 'DISTRATADA' ? 'fantasma' : 'secundario'} onClick={() => (setSituacao(s), setFalha(null), setMotivo(''))}>
                  {s === 'DISTRATADA' ? 'Registrar distrato' : SITUACOES_VENDA[s]}
                </Botao>
              ))}
            </div>
          )
        }
      >
        <div className="numeros grid grid-cols-4 gap-4 text-sm">
          <Valor rotulo="Valor da venda" v={v.valorCentavos} forte />
          <div>
            <div className="text-xs text-texto-2">Contrato</div>
            {formatarData(v.dataContrato)}
          </div>
          <div>
            <div className="text-xs text-texto-2">Escritura</div>
            {v.dataEscritura ? formatarData(v.dataEscritura) : '—'}
          </div>
          <Valor rotulo={`Financiamento${v.financiamentoBanco ? ` (${v.financiamentoBanco})` : ''}`} v={v.financiamentoCentavos} />
        </div>
        <div className="mt-3 text-sm">
          {v.partes.map((p) => (
            <div key={`${p.papel}-${p.pessoaId}`}>
              <span className="text-texto-2">{p.papel === 'COMPRADOR' ? 'Comprador' : 'Vendedor'}:</span> {p.nome} ({(p.percentualBp / 100).toLocaleString('pt-BR')}%)
            </div>
          ))}
        </div>
        {v.distratoMotivo && (
          <div className="mt-3">
            <Aviso tom="perigo">Distrato: {v.distratoMotivo}</Aviso>
          </div>
        )}
      </Cartao>
      <Cartao titulo="Sinal, parcelas e financiamento" semPadding>
        <Tabela colunas={['Vencimento', 'Descrição', 'Forma', { t: 'Valor', cls: 'text-right' }, 'Situação', '']}>
          {v.parcelas.map((p) => (
            <tr key={p.id}>
              <td className="numeros">{formatarData(p.vencimento)}</td>
              <td>
                {p.descricao} <span className="text-xs text-texto-3">({TIPOS_PARCELA_VENDA[p.tipo as keyof typeof TIPOS_PARCELA_VENDA]})</span>
              </td>
              <td className="text-texto-2">{p.viaImobiliaria ? 'Pela imobiliária (recurso de terceiros)' : 'Direto entre as partes'}</td>
              <td className="numeros text-right">{formatarMoeda(p.valorCentavos)}</td>
              <td>
                <Selo tom={p.situacao === 'PAGA' ? 'destaque' : p.situacao === 'CANCELADA' ? 'neutro' : 'alerta'}>
                  {{ PAGA: 'Paga', PARCIAL: 'Parcial', CANCELADA: 'Cancelada', PREVISTA: 'Prevista' }[p.situacao] ?? p.situacao}
                </Selo>
                {p.pagaEm && <span className="ml-1 text-xs text-texto-3">em {formatarData(p.pagaEm)}</span>}
              </td>
              <td className="text-right">
                {p.viaImobiliaria && p.tituloId && (
                  <Link className="text-xs underline" to="/financeiro/receber">
                    Ver em contas a receber
                  </Link>
                )}
                {!p.viaImobiliaria && p.situacao === 'PREVISTA' && pode('vendas.registrar') && (
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    onClick={async () => {
                      try {
                        await rpc('vendas.parcelaPaga', { parcelaId: p.id, data: hojeIso() })
                        invalidarCrm(qc)
                      } catch (e) {
                        toast.erro(e)
                      }
                    }}
                  >
                    Informar pagamento
                  </Botao>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {situacao && (
        <Dialogo
          aberto
          titulo={situacao === 'DISTRATADA' ? 'Distrato da venda' : `Venda ${SITUACOES_VENDA[situacao].toLowerCase()}`}
          aoFechar={() => setSituacao(null)}
          rodape={
            <>
              <Botao variante="fantasma" onClick={() => setSituacao(null)}>
                Cancelar
              </Botao>
              <Botao
                variante={situacao === 'DISTRATADA' ? 'perigo' : 'primario'}
                onClick={async () => {
                  try {
                    const r = await rpc('vendas.situacao', { vendaId: v.id, situacao, data: dataSit, motivo })
                    toast.sucesso('Venda atualizada.')
                    for (const a of r.avisos) toast.info(a)
                    invalidarCrm(qc)
                    setSituacao(null)
                  } catch (e) {
                    setFalha(erroTexto(e))
                  }
                }}
              >
                Confirmar
              </Botao>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <Campo rotulo="Data">{(i) => <Entrada id={i} type="date" max={hojeIso()} value={dataSit} onChange={(e) => setDataSit(e.target.value)} />}</Campo>
            {situacao === 'DISTRATADA' && (
              <>
                <Campo rotulo="Motivo do distrato">{(i) => <Entrada id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
                <Aviso tom="alerta">Valores pela imobiliária ainda não recebidos são cancelados e o imóvel volta a ficar disponível para venda. A comissão é mantida para decisão.</Aviso>
              </>
            )}
            {(situacao === 'ESCRITURADA' || situacao === 'CONCLUIDA') && <Aviso>O negócio será encerrado como ganho no funil.</Aviso>}
            {falha && <Aviso tom="perigo">{falha}</Aviso>}
          </div>
        </Dialogo>
      )}
    </div>
  )
}

interface ParcelaVendaForm extends ParcelaForm {
  tipo: 'SINAL' | 'PARCELA' | 'FINANCIAMENTO' | 'ESCRITURA'
  viaImobiliaria: boolean
}

function DialogoVenda({ n, aoFechar }: { n: NegocioDetalhe; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: imovel } = useQuery({ queryKey: ['imovel', n.imovelId], queryFn: () => rpc('imoveis.obter', { id: n.imovelId! }) })
  const aceita = n.propostas.find((p) => p.situacao === 'ACEITA')
  const hoje = hojeIso()
  const rateioPadrao = useRateioPadrao(n.captadorId, n.corretorId)
  const [rateio, setRateio] = useState<LinhaRateio[] | null>(null)
  const linhasRateio = rateio ?? rateioPadrao ?? []
  const [f, setF] = useState({
    dataContrato: hoje,
    valor: centavosParaTexto(aceita?.valorCentavos ?? n.valorEstimadoCentavos ?? n.ofertaValorCentavos ?? 0),
    financiamentoBanco: aceita?.financiamentoBanco ?? '',
    comissao: n.ofertaComissaoBp != null ? (n.ofertaComissaoBp / 100).toLocaleString('pt-BR') : '6',
    pagador: '',
    vencimento: hoje,
    descontarDoSinal: false,
    observacoes: ''
  })
  const [parcelas, setParcelas] = useState<ParcelaVendaForm[]>(() => {
    if (!aceita) return [{ tipo: 'ESCRITURA', descricao: 'Pagamento na escritura', valor: centavosParaTexto(n.valorEstimadoCentavos ?? n.ofertaValorCentavos ?? 0), vencimento: hoje, viaImobiliaria: false }]
    const l: ParcelaVendaForm[] = []
    if (aceita.sinalCentavos) l.push({ tipo: 'SINAL', descricao: 'Sinal', valor: centavosParaTexto(aceita.sinalCentavos), vencimento: hoje, viaImobiliaria: false })
    for (const p of aceita.parcelas) l.push({ tipo: 'PARCELA', descricao: p.descricao, valor: centavosParaTexto(p.valorCentavos), vencimento: p.vencimento, viaImobiliaria: false })
    if (aceita.financiamentoCentavos) l.push({ tipo: 'FINANCIAMENTO', descricao: `Financiamento${aceita.financiamentoBanco ? ` ${aceita.financiamentoBanco}` : ''}`, valor: centavosParaTexto(aceita.financiamentoCentavos), vencimento: hoje, viaImobiliaria: false })
    if (aceita.saldoCentavos > 0) l.push({ tipo: 'ESCRITURA', descricao: 'Pagamento na escritura', valor: centavosParaTexto(aceita.saldoCentavos), vencimento: hoje, viaImobiliaria: false })
    return l
  })
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const donos = imovel?.internos?.proprietarios ?? []
  const valorC = paraCentavos(f.valor) ?? 0
  const comissaoC = Math.round((valorC * (Number(f.comissao.replace(',', '.')) || 0)) / 100)
  const somaParcelas = parcelas.reduce((s, p) => s + (paraCentavos(p.valor) ?? 0), 0)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  const setP = (k: number, p: Partial<ParcelaVendaForm>) => setParcelas(parcelas.map((x, j) => (j === k ? { ...x, ...p } : x)))
  return (
    <Dialogo
      aberto
      largura="max-w-4xl"
      titulo="Registrar venda"
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
              setEnviando(true)
              try {
                await rpc('vendas.registrar', {
                  negocioId: n.id,
                  propostaId: aceita?.id ?? null,
                  dataContrato: f.dataContrato,
                  valor: f.valor,
                  compradores: [{ pessoaId: n.clienteId!, percentual: '100' }],
                  vendedores: donos.map((d) => ({ pessoaId: d.pessoaId, percentual: (d.percentualBp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) })),
                  parcelas,
                  financiamentoBanco: f.financiamentoBanco,
                  comissaoPercentual: f.comissao,
                  comissaoPagadorId: f.pagador ? Number(f.pagador) : (donos[0]?.pessoaId ?? null),
                  comissaoVencimento: f.vencimento,
                  comissaoDescontadaDoSinal: f.descontarDoSinal,
                  rateio: rateioParaEnvio(linhasRateio),
                  observacoes: f.observacoes
                })
                toast.sucesso('Venda registrada. Nenhum valor foi lançado como recebido.')
                invalidarCrm(qc)
                aoFechar()
              } catch (e) {
                setFalha(erroTexto(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Registrar venda
          </Botao>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-4 gap-3">
          <Campo rotulo="Data do contrato">{(i) => <Entrada id={i} type="date" max={hoje} value={f.dataContrato} onChange={(e) => set({ dataContrato: e.target.value })} />}</Campo>
          <Campo rotulo="Valor da venda">{(i) => <CampoMoeda id={i} value={f.valor} onChange={(e) => set({ valor: e.target.value })} />}</Campo>
          <Campo rotulo="Banco do financiamento">{(i) => <Entrada id={i} value={f.financiamentoBanco} onChange={(e) => set({ financiamentoBanco: e.target.value })} />}</Campo>
          <div className="text-xs text-texto-2">
            Comprador: <strong className="text-texto">{n.clienteNome}</strong>
            <br />
            Vendedor(es): <strong className="text-texto">{donos.map((d) => d.nome).join(', ') || '—'}</strong>
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold tracking-wide text-texto-3 uppercase">
            Forma de pagamento
            <Botao tamanho="sm" variante="fantasma" icone={<Plus className="size-3.5" />} onClick={() => setParcelas([...parcelas, { tipo: 'PARCELA', descricao: `Parcela ${parcelas.length + 1}`, valor: '', vencimento: hoje, viaImobiliaria: false }])}>
              Adicionar
            </Botao>
          </div>
          {parcelas.map((p, k) => (
            <div key={k} className="mb-2 grid grid-cols-[9rem_1fr_9rem_9.5rem_12rem_2rem] items-center gap-2">
              <Selecao aria-label="Tipo" opcoes={TIPOS_PARCELA_VENDA} value={p.tipo} onChange={(e) => setP(k, { tipo: e.target.value as 'SINAL' })} />
              <Entrada aria-label="Descrição" value={p.descricao} onChange={(e) => setP(k, { descricao: e.target.value })} />
              <CampoMoeda aria-label="Valor" value={p.valor} onChange={(e) => setP(k, { valor: e.target.value })} />
              <Entrada aria-label="Vencimento" type="date" value={p.vencimento} onChange={(e) => setP(k, { vencimento: e.target.value })} />
              <Caixa rotulo="Pela imobiliária" checked={p.viaImobiliaria} onChange={(e) => setP(k, { viaImobiliaria: e.target.checked })} />
              <Botao tamanho="sm" variante="fantasma" title="Remover" icone={<Trash2 className="size-3.5" />} onClick={() => setParcelas(parcelas.filter((_, j) => j !== k))} />
            </div>
          ))}
          <div className={cx('numeros text-xs', somaParcelas === valorC ? 'text-texto-3' : 'font-medium text-perigo')}>
            Soma: {formatarMoeda(somaParcelas)} de {formatarMoeda(valorC)}
          </div>
          <p className="mt-1 text-xs text-texto-3">“Pela imobiliária”: o valor entra na conta de terceiros e é repassado ao vendedor. Pagamentos diretos são apenas registrados.</p>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wide text-texto-3 uppercase">Comissão de intermediação</div>
          <div className="grid grid-cols-4 items-end gap-3">
            <Campo rotulo="Comissão (%)" ajuda={`= ${formatarMoeda(comissaoC)}`}>{(i) => <Entrada id={i} className="numeros text-right" value={f.comissao} onChange={(e) => set({ comissao: e.target.value })} />}</Campo>
            {!f.descontarDoSinal && (
              <>
                <Campo rotulo="Quem paga">{(i) => <Selecao id={i} opcoes={[...donos.map((d) => [String(d.pessoaId), `${d.nome} (vendedor)`] as [string, string]), ...(n.clienteId ? [[String(n.clienteId), `${n.clienteNome} (comprador)`] as [string, string]] : [])]} value={f.pagador || String(donos[0]?.pessoaId ?? '')} onChange={(e) => set({ pagador: e.target.value })} />}</Campo>
                <Campo rotulo="Vencimento">{(i) => <Entrada id={i} type="date" value={f.vencimento} onChange={(e) => set({ vencimento: e.target.value })} />}</Campo>
              </>
            )}
            <Caixa rotulo="Reter a comissão do sinal" descricao="Sinal pago pela imobiliária" checked={f.descontarDoSinal} onChange={(e) => set({ descontarDoSinal: e.target.checked })} className="pb-1" />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs text-texto-2">Rateio</div>
            <EditorRateio linhas={linhasRateio} aoMudar={setRateio} valorCentavos={comissaoC} />
          </div>
        </div>
        <Aviso>Registrar a venda não lança nenhum recebimento: são criados apenas os títulos a receber (comissão e valores pela imobiliária). Os corretores só passam a ter valores a receber depois que a imobiliária receber a comissão.</Aviso>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}

// ───────────── Comissão ─────────────

function AbaComissao({ n }: { n: NegocioDetalhe }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const padrao = useRateioPadrao(n.captadorId, n.corretorId)
  const [rateio, setRateio] = useState<LinhaRateio[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  if (n.comissao) return <Cartao>{<PainelComissao comissao={n.comissao} />}</Cartao>
  if (n.tipo === 'VENDA') return <div className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-texto-3">A comissão é definida ao registrar a venda.</div>
  if (n.etapa !== 'CONCLUIDO') return <div className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-texto-3">Conclua a locação com o contrato para registrar o rateio da intermediação.</div>
  const linhas = rateio ?? padrao ?? []
  return (
    <Cartao titulo="Comissão da intermediação da locação">
      <p className="mb-3 text-sm text-texto-2">A taxa de intermediação cobrada no 1º aluguel é a comissão. Defina como ela será rateada; a parte dos corretores é liberada conforme o aluguel for recebido.</p>
      <EditorRateio linhas={linhas} aoMudar={setRateio} />
      {falha && (
        <div className="mt-3">
          <Aviso tom="perigo">{falha}</Aviso>
        </div>
      )}
      {pode('comissoes.gerenciar') && (
        <div className="mt-3 flex justify-end">
          <Botao
            variante="primario"
            onClick={async () => {
              try {
                await rpc('comissoes.locacao', { negocioId: n.id, rateio: rateioParaEnvio(linhas) })
                toast.sucesso('Comissão registrada.')
                invalidarCrm(qc)
              } catch (e) {
                setFalha(erroTexto(e))
              }
            }}
          >
            Registrar comissão
          </Botao>
        </div>
      )}
    </Cartao>
  )
}
