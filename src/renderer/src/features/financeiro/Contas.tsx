import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { centavosParaTexto, formatarMoeda } from '@shared/dinheiro'
import type { ContaFinanceiraDto } from '@shared/dto-financeiro'
import { formatarData, hojeIso } from '@shared/financeiro/datas'
import { contaFinanceiraSchema, TIPOS_CONTA_FINANCEIRA, type ContaFinanceiraInput } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Dialogo, Entrada, Indicador, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { CampoMoeda } from '@/features/imoveis/comum'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { rpc } from '@/lib/rpc'

export function Contas() {
  const { pode } = useSessao()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['contas-financeiras', 'todas'], queryFn: () => rpc('financeiro.contas.listar', { incluirInativas: true }) })
  const [editar, setEditar] = useState<ContaFinanceiraDto | 'nova' | null>(null)
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
      <Cartao semPadding>
        <Tabela colunas={['Conta', 'Tipo', 'Banco / agência / conta', 'Titularidade', { t: 'Saldo inicial', cls: 'text-right' }, { t: 'Saldo atual', cls: 'text-right' }, '']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((c) => (
            <tr key={c.id} className={c.ativa ? '' : 'text-texto-3'}>
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
              <td className="text-right">{pode('financeiro.contas') && <Botao tamanho="sm" variante="fantasma" icone={<Pencil className="size-3.5" />} onClick={() => setEditar(c)} />}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
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
