import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, ChevronRight, Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { centavosParaTexto, formatarMoeda } from '@shared/dinheiro'
import type { ContaFinanceiraDto } from '@shared/dto-financeiro'
import { formatarData, hojeIso } from '@shared/financeiro/datas'
import { contaFinanceiraSchema, TIPOS_CONTA_FINANCEIRA, type ContaFinanceiraInput } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, cx, CabecalhoPagina, Caixa, Campo, Cartao, Dialogo, Entrada, Indicador, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { rpc } from '@/lib/rpc'
import { invalidarFinanceiro } from './comum'

export function Contas() {
  const { pode } = useSessao()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['contas-financeiras', 'todas'], queryFn: () => rpc('financeiro.contas.listar', { incluirInativas: true }) })
  const [editar, setEditar] = useState<ContaFinanceiraDto | 'nova' | null>(null)
  const navegar = useNavigate()
  const [transferir, setTransferir] = useState(false)
  const { data: posicao } = useQuery({ queryKey: ['posicao-terceiros'], queryFn: () => rpc('tesouraria.posicaoTerceiros') })
  const [razao, setRazao] = useState<{ lancamentos: number; desbalanceados: number[]; somaGeral: number } | null>(null)
  const soma = (t: 'PROPRIO' | 'TERCEIROS') => data?.filter((c) => c.ativa && c.titularidade === t).reduce((s, c) => s + c.saldoAtualCentavos, 0) ?? 0
  return (
    <>
      <CabecalhoPagina
        titulo="Contas bancárias e caixa"
        subtitulo="Saldos calculados a partir dos recebimentos e pagamentos registrados."
        acoes={
          <>
            <Botao
              icone={<ShieldCheck className="size-4" />}
              onClick={async () => {
                try {
                  setRazao(await rpc('financeiro.verificarRazao'))
                } catch (e) {
                  toast.erro(e)
                }
              }}
            >
              Verificar razão
            </Botao>
            {pode('financeiro.pagar') && (
              <Botao icone={<ArrowLeftRight className="size-4" />} onClick={() => setTransferir(true)}>
                Transferir entre contas
              </Botao>
            )}
            {pode('financeiro.contas') && (
              <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setEditar('nova')}>
                Nova conta
              </Botao>
            )}
          </>
        }
      />
      {razao && (
        <div className="mb-4">
          {razao.desbalanceados.length === 0 && razao.somaGeral === 0 ? (
            <Aviso tom="sucesso">Razão íntegro: {razao.lancamentos} lançamento(s), todos com débitos iguais aos créditos.</Aviso>
          ) : (
            <Aviso tom="perigo">Inconsistência no razão: lançamentos {razao.desbalanceados.join(', ')}. Acione o suporte técnico.</Aviso>
          )}
        </div>
      )}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Indicador rotulo="Contas de terceiros" valor={formatarMoeda(soma('TERCEIROS'))} detalhe="Aluguéis, cauções e valores a repassar" />
        <Indicador rotulo="Contas próprias" valor={formatarMoeda(soma('PROPRIO'))} detalhe="Recursos da imobiliária" />
        <Indicador rotulo="Total" valor={formatarMoeda(soma('PROPRIO') + soma('TERCEIROS'))} />
      </div>
      {posicao && <PosicaoTerceiros p={posicao} />}
      <Cartao semPadding>
        <Tabela colunas={['Conta', 'Tipo', 'Banco / agência / conta', 'Titularidade', { t: 'Saldo inicial', cls: 'text-right' }, { t: 'Saldo atual', cls: 'text-right' }, '']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((c) => (
            <tr key={c.id} className={cx('cursor-pointer', !c.ativa && 'text-texto-3')} onClick={() => navegar(`/financeiro/contas/${c.id}`)}>
              <td className="font-medium">
                {c.nome} {!c.ativa && <Selo>Inativa</Selo>}
              </td>
              <td>{TIPOS_CONTA_FINANCEIRA[c.tipo as keyof typeof TIPOS_CONTA_FINANCEIRA]}</td>
              <td className="numeros text-texto-2">{[c.bancoCodigo, c.agencia, c.conta].filter(Boolean).join(' / ') || '—'}</td>
              <td>{c.titularidade === 'TERCEIROS' ? <Selo tom="alerta">Terceiros</Selo> : <Selo tom="escuro">Próprio</Selo>}</td>
              <td className="numeros text-right text-texto-2">
                {formatarMoeda(c.saldoInicialCentavos)}
                <div className="text-xs">em {formatarData(c.dataSaldoInicial)}</div>
              </td>
              <td className="numeros text-right font-medium">{formatarMoeda(c.saldoAtualCentavos)}</td>
              <td className="text-right whitespace-nowrap">
                {pode('financeiro.contas') && (
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    title="Editar"
                    icone={<Pencil className="size-3.5" />}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setEditar(c)
                    }}
                  />
                )}
                <ChevronRight className="inline size-4 text-texto-3" />
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {transferir && data && <DialogoTransferencia contas={data.filter((c) => c.ativa)} aoFechar={() => setTransferir(false)} />}
      {editar && <FormConta conta={editar === 'nova' ? null : editar} aoFechar={() => setEditar(null)} />}
    </>
  )
}

function FormConta({ conta, aoFechar }: { conta: ContaFinanceiraDto | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, watch, setValue, setError } = useForm<ContaFinanceiraInput>({
    resolver: resolverZod(contaFinanceiraSchema),
    defaultValues: conta
      ? { ...conta, saldoInicial: centavosParaTexto(conta.saldoInicialCentavos), bancoCodigo: conta.bancoCodigo ?? '', agencia: conta.agencia ?? '', conta: conta.conta ?? '', tipo: conta.tipo as 'CORRENTE' }
      : { nome: '', tipo: 'CORRENTE', bancoCodigo: '', agencia: '', conta: '', titularidade: 'TERCEIROS', saldoInicial: '0,00', dataSaldoInicial: hojeIso(), ativa: true }
  })
  const e = formState.errors
  const enviar = handleSubmit(async (v) => {
    try {
      await rpc('financeiro.contas.salvar', { id: conta?.id ?? null, dados: v })
      toast.sucesso('Conta salva.')
      void qc.invalidateQueries({ queryKey: ['contas-financeiras'] })
      aoFechar()
    } catch (err) {
      setFalha(aplicarErrosServidor(err, setError))
    }
  })
  return (
    <Dialogo
      aberto
      titulo={conta ? 'Editar conta' : 'Nova conta'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={enviar} carregando={formState.isSubmitting}>
            Salvar
          </Botao>
        </>
      }
    >
      <form className="grid grid-cols-6 gap-3" onSubmit={enviar}>
        <Campo rotulo="Nome" obrigatorio className="col-span-4" erro={erroDe(e, 'nome')}>{(i) => <Entrada id={i} placeholder="Ex.: Itaú — conta de terceiros" {...register('nome')} />}</Campo>
        <Campo rotulo="Tipo" className="col-span-2">{(i) => <Selecao id={i} opcoes={TIPOS_CONTA_FINANCEIRA} {...register('tipo')} />}</Campo>
        <Campo rotulo="Banco" className="col-span-2">{(i) => <Entrada id={i} placeholder="341" {...register('bancoCodigo')} />}</Campo>
        <Campo rotulo="Agência" className="col-span-2">{(i) => <Entrada id={i} {...register('agencia')} />}</Campo>
        <Campo rotulo="Conta" className="col-span-2">{(i) => <Entrada id={i} {...register('conta')} />}</Campo>
        <Campo rotulo="Titularidade dos recursos" className="col-span-6">
          {(i) => <Selecao id={i} opcoes={{ TERCEIROS: 'Recursos de terceiros (aluguéis, cauções, repasses)', PROPRIO: 'Recursos próprios da imobiliária' }} {...register('titularidade')} />}
        </Campo>
        <Campo rotulo="Saldo inicial" className="col-span-3" erro={erroDe(e, 'saldoInicial')}>{(i) => <CampoMoeda id={i} {...register('saldoInicial')} />}</Campo>
        <Campo rotulo="Data do saldo inicial" className="col-span-3" erro={erroDe(e, 'dataSaldoInicial')}>{(i) => <Entrada id={i} type="date" {...register('dataSaldoInicial')} />}</Campo>
        <div className="col-span-6">
          <Caixa rotulo="Conta ativa" checked={!!watch('ativa')} onChange={(ev) => setValue('ativa', ev.target.checked)} />
        </div>
        {falha && (
          <div className="col-span-6">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </form>
    </Dialogo>
  )
}

/** Confronto entre o dinheiro nas contas de terceiros e o que a imobiliária deve a proprietários, terceiros e cauções. */
function PosicaoTerceiros({ p }: { p: import('@shared/dto-financeiro').PosicaoTerceiros }) {
  const sobra = p.recursosPropriosEmContasDeTerceiros
  return (
    <Cartao titulo="Separação de recursos" className="mb-4">
      <div className="numeros grid grid-cols-5 gap-4 text-sm">
        <Linha rotulo="Saldo das contas de terceiros" valor={p.saldoContasTerceiros} />
        <Linha rotulo="A repassar a proprietários" valor={p.passivoProprietarios} />
        <Linha rotulo="A pagar a terceiros" valor={p.passivoTerceiros} />
        <Linha rotulo="Cauções em custódia" valor={p.passivoCaucoes} />
        <Linha rotulo="Total devido a terceiros" valor={p.totalPassivo} forte />
      </div>
      <div className="mt-3">
        {sobra === 0 ? (
          <Aviso tom="sucesso">As contas de terceiros guardam exatamente o que é devido a terceiros.</Aviso>
        ) : sobra > 0 ? (
          <Aviso tom="info">
            {formatarMoeda(sobra)} nas contas de terceiros pertencem à imobiliária (taxas e receitas já apuradas) e podem ser transferidos para a conta própria.
          </Aviso>
        ) : (
          <Aviso tom="perigo">
            Faltam {formatarMoeda(-sobra)} nas contas de terceiros para cobrir o que é devido a proprietários, terceiros e cauções. Verifique pagamentos de despesas próprias feitos com recursos de terceiros.
          </Aviso>
        )}
      </div>
    </Cartao>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div>
      <div className="text-xs text-texto-2">{rotulo}</div>
      <div className={forte ? 'font-semibold' : 'font-medium'}>{formatarMoeda(valor)}</div>
    </div>
  )
}

function DialogoTransferencia({ contas, aoFechar }: { contas: ContaFinanceiraDto[]; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const terceiros = contas.find((c) => c.titularidade === 'TERCEIROS')
  const propria = contas.find((c) => c.titularidade === 'PROPRIO')
  const [f, setF] = useState({ origemId: String(terceiros?.id ?? contas[0]?.id ?? ''), destinoId: String(propria?.id ?? contas[1]?.id ?? ''), valor: '', data: hojeIso(), descricao: '' })
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const origem = contas.find((c) => String(c.id) === f.origemId)
  const destino = contas.find((c) => String(c.id) === f.destinoId)
  const opcoes = contas.map((c) => [String(c.id), `${c.nome} (${c.titularidade === 'TERCEIROS' ? 'terceiros' : 'próprio'})`] as [string, string])
  return (
    <Dialogo
      aberto
      titulo="Transferência entre contas"
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
                await rpc('tesouraria.transferir', { origemId: Number(f.origemId), destinoId: Number(f.destinoId), valor: f.valor, data: f.data, descricao: f.descricao })
                toast.sucesso('Transferência registrada.')
                invalidarFinanceiro(qc)
                void qc.invalidateQueries({ queryKey: ['posicao-terceiros'] })
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setEnviando(false)
              }
            }}
          >
            Transferir
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Campo rotulo="De" ajuda={origem ? `Saldo: ${formatarMoeda(origem.saldoAtualCentavos)}` : undefined}>{(i) => <Selecao id={i} opcoes={opcoes} value={f.origemId} onChange={(e) => setF({ ...f, origemId: e.target.value })} />}</Campo>
        <Campo rotulo="Para">{(i) => <Selecao id={i} opcoes={opcoes} value={f.destinoId} onChange={(e) => setF({ ...f, destinoId: e.target.value })} />}</Campo>
        <Campo rotulo="Valor">{(i) => <CampoMoeda id={i} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />}</Campo>
        <Campo rotulo="Data">{(i) => <Entrada id={i} type="date" max={hojeIso()} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />}</Campo>
        <Campo rotulo="Descrição" className="col-span-2">{(i) => <Entrada id={i} placeholder="Ex.: Taxas de administração de outubro" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />}</Campo>
        {origem?.titularidade === 'TERCEIROS' && destino?.titularidade === 'PROPRIO' && (
          <div className="col-span-2">
            <Aviso>Só é permitido levar para a conta própria o valor que já pertence à imobiliária (taxas e receitas apuradas). O sistema bloqueia valores que pertencem a proprietários ou terceiros.</Aviso>
          </div>
        )}
        {falha && (
          <div className="col-span-2">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
      </div>
    </Dialogo>
  )
}
