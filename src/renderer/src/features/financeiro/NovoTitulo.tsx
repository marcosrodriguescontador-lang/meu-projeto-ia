import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatarMoeda, paraCentavos } from '@shared/dinheiro'
import { ratear } from '@shared/financeiro/calculos'
import { adicionarMesesData, competenciaDe, formatarData, hojeIso } from '@shared/financeiro/datas'
import { FORMAS_PAGAMENTO } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Caixa, Campo, Dialogo, Entrada, Selecao, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { BuscaPessoa } from '@/features/pessoas/BuscaPessoa'
import { rpc } from '@/lib/rpc'
import { invalidarFinanceiro, useContas } from './comum'

/** Pessoa escolhida (com opção de trocar) ou campo de busca. */
export function SeletorPessoa({ valor, aoMudar }: { valor: { id: number; nome: string } | null; aoMudar: (p: { id: number; nome: string } | null) => void }) {
  return valor ? (
    <div className="flex h-9 items-center justify-between rounded-md border border-borda px-3 text-sm">
      {valor.nome}
      <button type="button" className="text-xs underline" onClick={() => aoMudar(null)}>
        trocar
      </button>
    </div>
  ) : (
    <BuscaPessoa aoSelecionar={(p) => aoMudar({ id: p.id, nome: p.nome })} />
  )
}

/** Categoria do plano de contas (receitas ou despesas lançáveis manualmente), com criação rápida. */
export function SeletorCategoria({ natureza, valor, aoMudar, id }: { natureza: 'RECEITA' | 'DESPESA'; valor: string; aoMudar: (v: string) => void; id?: string }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['categorias', natureza], queryFn: () => rpc('categorias.listar', { natureza, manuais: true }) })
  const [nova, setNova] = useState<string | null>(null)
  if (nova !== null)
    return (
      <div className="flex gap-2">
        <Entrada id={id} autoFocus placeholder="Nome da nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
        <Botao
          onClick={async () => {
            try {
              const c = await rpc('categorias.criar', { natureza, nome: nova })
              void qc.invalidateQueries({ queryKey: ['categorias'] })
              aoMudar(String(c.id))
              setNova(null)
            } catch (e) {
              toast.erro(e)
            }
          }}
        >
          Criar
        </Botao>
        <Botao variante="fantasma" onClick={() => setNova(null)}>
          Voltar
        </Botao>
      </div>
    )
  return (
    <div className="flex gap-2">
      <Selecao id={id} opcoes={(data ?? []).map((c) => [String(c.id), `${c.codigo} — ${c.nome}`] as [string, string])} vazio="Selecione a categoria" value={valor} onChange={(e) => aoMudar(e.target.value)} />
      {pode('financeiro.contas') && <Botao title="Nova categoria" icone={<Plus className="size-4" />} onClick={() => setNova('')} />}
    </div>
  )
}

/** Lançamento manual de despesa (contas a pagar) ou receita própria (contas a receber) da imobiliária. */
export function DialogoNovoTitulo({ sentido, aoFechar }: { sentido: 'RECEBER' | 'PAGAR'; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: contas } = useContas()
  const hoje = hojeIso()
  const [pessoa, setPessoa] = useState<{ id: number; nome: string } | null>(null)
  const [f, setF] = useState({ categoriaId: '', descricao: '', valor: '', parcelas: '1', primeiroVencimento: hoje, competencia: competenciaDe(hoje), documento: '', quitado: false, contaFinanceiraId: '', forma: 'PIX', dataQuitacao: hoje })
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    if (!f.contaFinanceiraId && contas?.length) setF((x) => ({ ...x, contaFinanceiraId: String((contas.find((c) => c.titularidade === 'PROPRIO') ?? contas[0])!.id) }))
  }, [contas, f.contaFinanceiraId])
  const n = Number(f.parcelas) || 1
  const total = paraCentavos(f.valor)
  const previa = !f.quitado && n > 1 && total && total > 0 ? ratear(total, Array(n).fill(1)).map((v, i) => ({ v, d: adicionarMesesData(f.primeiroVencimento, i) })) : null
  const conta = contas?.find((c) => String(c.id) === f.contaFinanceiraId)
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  return (
    <Dialogo
      aberto
      largura="max-w-2xl"
      titulo={sentido === 'PAGAR' ? 'Nova despesa da imobiliária' : 'Nova receita própria'}
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
              if (!pessoa) return setFalha(sentido === 'PAGAR' ? 'Informe o favorecido.' : 'Informe o pagador.')
              setEnviando(true)
              try {
                const r = await rpc('titulos.criarManual', {
                  sentido,
                  pessoaId: pessoa.id,
                  categoriaId: Number(f.categoriaId),
                  descricao: f.descricao,
                  valor: f.valor,
                  parcelas: f.quitado ? 1 : n,
                  primeiroVencimento: f.quitado ? f.dataQuitacao : f.primeiroVencimento,
                  competencia: f.competencia,
                  documento: f.documento,
                  quitado: f.quitado,
                  contaFinanceiraId: f.quitado ? Number(f.contaFinanceiraId) : null,
                  forma: f.quitado ? (f.forma as 'PIX') : null,
                  dataQuitacao: f.quitado ? f.dataQuitacao : ''
                })
                toast.sucesso(f.quitado ? 'Lançamento registrado e quitado.' : `${r.titulos.length} título(s) criado(s).`)
                invalidarFinanceiro(qc)
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Registrar
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-6 gap-3 text-sm">
        <div className="col-span-6">
          <div className="mb-1 text-xs font-medium text-texto-2">{sentido === 'PAGAR' ? 'Favorecido' : 'Pagador'}</div>
          <SeletorPessoa valor={pessoa} aoMudar={setPessoa} />
        </div>
        <Campo rotulo="Categoria" className="col-span-6">{(i) => <SeletorCategoria id={i} natureza={sentido === 'PAGAR' ? 'DESPESA' : 'RECEITA'} valor={f.categoriaId} aoMudar={(v) => set({ categoriaId: v })} />}</Campo>
        <Campo rotulo="Descrição" className="col-span-4">{(i) => <Entrada id={i} value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} />}</Campo>
        <Campo rotulo="Documento / NF" className="col-span-2">{(i) => <Entrada id={i} value={f.documento} onChange={(e) => set({ documento: e.target.value })} />}</Campo>
        <Campo rotulo={n > 1 && !f.quitado ? 'Valor total' : 'Valor'} className="col-span-2">{(i) => <CampoMoeda id={i} value={f.valor} onChange={(e) => set({ valor: e.target.value })} />}</Campo>
        <Campo rotulo="Competência" className="col-span-2" ajuda="Mês a que a despesa/receita se refere">{(i) => <Entrada id={i} type="month" value={f.competencia} onChange={(e) => set({ competencia: e.target.value })} />}</Campo>
        <div className="col-span-2 flex items-end pb-2">
          <Caixa rotulo={sentido === 'PAGAR' ? 'Já foi paga' : 'Já foi recebida'} checked={f.quitado} onChange={(e) => set({ quitado: e.target.checked })} />
        </div>
        {f.quitado ? (
          <>
            <Campo rotulo="Data" className="col-span-2">{(i) => <Entrada id={i} type="date" max={hoje} value={f.dataQuitacao} onChange={(e) => set({ dataQuitacao: e.target.value })} />}</Campo>
            <Campo rotulo="Conta" className="col-span-2" ajuda={conta ? `Saldo: ${formatarMoeda(conta.saldoAtualCentavos)}` : undefined}>
              {(i) => <Selecao id={i} opcoes={(contas ?? []).map((c) => [String(c.id), `${c.nome} (${c.titularidade === 'TERCEIROS' ? 'terceiros' : 'próprio'})`] as [string, string])} value={f.contaFinanceiraId} onChange={(e) => set({ contaFinanceiraId: e.target.value })} />}
            </Campo>
            <Campo rotulo="Forma" className="col-span-2">{(i) => <Selecao id={i} opcoes={FORMAS_PAGAMENTO} value={f.forma} onChange={(e) => set({ forma: e.target.value })} />}</Campo>
            {conta?.titularidade === 'TERCEIROS' && (
              <div className="col-span-6">
                <Aviso tom="alerta">Esta é uma conta de recursos de terceiros. Despesas e receitas da imobiliária devem, preferencialmente, transitar pela conta própria.</Aviso>
              </div>
            )}
          </>
        ) : (
          <>
            <Campo rotulo={n > 1 ? '1º vencimento' : 'Vencimento'} className="col-span-3">{(i) => <Entrada id={i} type="date" value={f.primeiroVencimento} onChange={(e) => set({ primeiroVencimento: e.target.value })} />}</Campo>
            <Campo rotulo="Parcelas" className="col-span-3" ajuda="Mensais, no mesmo dia">{(i) => <Entrada id={i} type="number" min={1} max={120} value={f.parcelas} onChange={(e) => set({ parcelas: e.target.value })} />}</Campo>
          </>
        )}
        {previa && (
          <div className="numeros col-span-6 max-h-32 overflow-auto rounded-md bg-superficie-2 p-3 text-xs text-texto-2">
            {previa.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  Parcela {i + 1}/{n} · {formatarData(p.d)}
                </span>
                <span>{formatarMoeda(p.v)}</span>
              </div>
            ))}
          </div>
        )}
        {falha && (
          <div className="col-span-6">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}
