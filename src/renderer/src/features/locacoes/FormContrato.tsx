import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { aplicarPercentual, centavosParaTexto, formatarMoeda, formatarPercentual, paraCentavos, paraPontosBase } from '@shared/dinheiro'
import type { ContratoDetalhe } from '@shared/dto-financeiro'
import { adicionarDias, adicionarMesesData, competenciaDe, formatarData } from '@shared/financeiro/datas'
import { contratoSchema, DESTINOS_ENCARGOS_ATRASO, DESTINOS_ITEM, GARANTIAS, TIPOS_CONTRATO, TIPOS_ENCARGO, type ContratoInput } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Caixa, Campo, Cartao, Confirmacao, Entrada, Selecao, useToast, cx } from '@/components/ui'
import { Documentos } from '@/features/comum/Documentos'
import { CampoMoeda, CampoSufixo } from '@/features/imoveis/comum'
import { BuscaPessoa } from '@/features/pessoas/BuscaPessoa'
import { HistoricoContrato } from './HistoricoContrato'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { rpc } from '@/lib/rpc'
import { AbaFinanceiro, AbaLancamentos, AbaReajustes, AbaRescisao } from './AbasContrato'
import { BuscaImovel } from './BuscaImovel'
import { SeloContrato } from './ListaContratos'

type Aba = 'contrato' | 'financeiro' | 'lancamentos' | 'reajustes' | 'rescisao' | 'documentos' | 'historico'

const VAZIO: ContratoInput = {
  imovelId: 0,
  tipo: 'RESIDENCIAL',
  locatarios: [],
  fiadores: [],
  dataInicio: '',
  dataFim: '',
  aluguel: '',
  diaVencimento: '10',
  indiceId: null,
  periodicidadeReajusteMeses: '12',
  reajusteNegativo: false,
  taxaAdministracao: '10',
  taxaIntermediacao: '100',
  multaAtraso: '10',
  jurosMes: '1',
  destinoEncargos: 'PROPRIETARIO',
  multaRescisoriaAlugueis: '3',
  garantiaTipo: 'FIANCA',
  garantiaValor: '',
  garantiaSeguradora: '',
  garantiaApolice: '',
  garantiaVigenciaFim: '',
  observacoes: '',
  encargos: []
}

const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function paraFormulario(c: ContratoDetalhe): ContratoInput {
  return {
    imovelId: c.imovel.id,
    tipo: c.tipo as 'RESIDENCIAL',
    locatarios: c.partes.filter((p) => p.papel === 'LOCATARIO').map((p) => ({ pessoaId: p.pessoaId, principal: p.principal })),
    fiadores: c.partes.filter((p) => p.papel === 'FIADOR').map((p) => p.pessoaId),
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    aluguel: centavosParaTexto(c.aluguelCentavos),
    diaVencimento: String(c.diaVencimento),
    indiceId: c.indiceId,
    periodicidadeReajusteMeses: String(c.periodicidadeReajusteMeses),
    reajusteNegativo: c.reajusteNegativo,
    taxaAdministracao: pct(c.taxaAdministracaoBp),
    taxaIntermediacao: pct(c.taxaIntermediacaoBp),
    multaAtraso: pct(c.multaAtrasoBp),
    jurosMes: pct(c.jurosMesBp),
    destinoEncargos: c.destinoEncargos,
    multaRescisoriaAlugueis: String(c.multaRescisoriaAlugueis),
    garantiaTipo: c.garantiaTipo as 'FIANCA',
    garantiaValor: centavosParaTexto(c.garantiaValorCentavos),
    garantiaSeguradora: c.garantiaSeguradora ?? '',
    garantiaApolice: c.garantiaApolice ?? '',
    garantiaVigenciaFim: c.garantiaVigenciaFim ?? '',
    observacoes: c.observacoes ?? '',
    encargos: c.encargos.map((e) => ({
      tipo: e.tipo as 'CONDOMINIO',
      descricao: e.descricao,
      valor: centavosParaTexto(e.valorCentavos),
      competenciaInicio: e.competenciaInicio,
      competenciaFim: e.competenciaFim ?? '',
      proporcional: e.proporcional,
      destino: e.destino,
      beneficiarioId: e.beneficiarioId
    }))
  }
}

export function FormContrato() {
  const { id: idParam } = useParams()
  const id = idParam ? Number(idParam) : null
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = useSessao()
  const [aba, setAba] = useState<Aba>('contrato')
  const [falha, setFalha] = useState<string | null>(null)
  const [ativar, setAtivar] = useState(false)
  const [excluir, setExcluir] = useState(false)
  const [nomes, setNomes] = useState<Record<number, string>>({})
  const [imovelTexto, setImovelTexto] = useState('')

  const { data: contrato } = useQuery({ queryKey: ['contrato', id], queryFn: () => rpc('contratos.obter', { id: id! }), enabled: !!id })
  const form = useForm<ContratoInput>({ resolver: resolverZod(contratoSchema), defaultValues: VAZIO })
  const { handleSubmit, formState, reset, setError } = form
  const situacao = contrato?.situacao ?? 'RASCUNHO'
  const editavel = pode('locacoes.gerenciar') && (situacao === 'RASCUNHO' || situacao === 'ATIVO')
  const ativo = situacao === 'ATIVO'

  useEffect(() => {
    if (!contrato) return
    reset(paraFormulario(contrato))
    setNomes(Object.fromEntries([...contrato.partes.map((p) => [p.pessoaId, p.nome]), ...contrato.encargos.filter((e) => e.beneficiarioId).map((e) => [e.beneficiarioId!, e.beneficiarioNome ?? ''])]))
    setImovelTexto(`#${contrato.imovel.codigo} — ${contrato.imovel.endereco}`)
  }, [contrato, reset])

  const salvar = handleSubmit(async (v) => {
    setFalha(null)
    try {
      const r = await rpc('contratos.salvar', { id, dados: v })
      toast.sucesso(id ? 'Contrato atualizado.' : 'Contrato criado como rascunho.')
      void qc.invalidateQueries({ queryKey: ['contratos'] })
      if (id) await qc.invalidateQueries({ queryKey: ['contrato', id] })
      else nav(`/locacoes/${r.id}`, { replace: true })
    } catch (err) {
      setFalha(aplicarErrosServidor(err, setError))
    }
  })

  const abas: [Aba, string][] = [['contrato', 'Contrato']]
  if (id && situacao !== 'RASCUNHO') abas.push(['financeiro', 'Financeiro'], ['lancamentos', 'Lançamentos avulsos'], ['reajustes', 'Reajustes e aditivos'], ['rescisao', ativo ? 'Rescisão' : 'Encerramento'])
  if (id) abas.push(['documentos', 'Documentos'], ['historico', 'Histórico'])

  return (
    <>
      <CabecalhoPagina
        voltar={
          <Link to="/locacoes" className="mb-1 inline-flex items-center gap-1 text-xs text-texto-2 hover:text-texto">
            <ArrowLeft className="size-3" /> Contratos
          </Link>
        }
        titulo={id ? (contrato ? `Contrato nº ${contrato.numero}` : 'Carregando…') : 'Novo contrato de locação'}
        subtitulo={contrato ? `${contrato.imovel.endereco} · ${formatarData(contrato.dataInicio)} a ${formatarData(contrato.dataFim)}` : 'O contrato é criado como rascunho; a ativação marca o imóvel como alugado e libera as cobranças.'}
        acoes={
          <>
            {contrato && <SeloContrato situacao={contrato.situacao} />}
            {situacao === 'RASCUNHO' && id && pode('locacoes.gerenciar') && (
              <>
                <Botao variante="fantasma" icone={<Trash2 className="size-4" />} onClick={() => setExcluir(true)} title="Excluir rascunho" />
                <Botao variante="destaque" icone={<Play className="size-4" />} onClick={() => setAtivar(true)}>
                  Ativar contrato
                </Botao>
              </>
            )}
            {editavel && aba === 'contrato' && (
              <Botao variante="primario" onClick={salvar} carregando={formState.isSubmitting}>
                Salvar
              </Botao>
            )}
          </>
        }
      />
      <Abas abas={abas} ativa={aba} aoMudar={setAba} />
      {falha && (
        <div className="mb-4">
          <Aviso tom="perigo">{falha}</Aviso>
        </div>
      )}
      {aba === 'contrato' && (
        <fieldset disabled={!editavel}>
          {ativo && (
            <div className="mb-4">
              <Aviso>Contrato ativo: imóvel, locatários, datas, aluguel e garantia só mudam por aditivo, reajuste ou rescisão. Taxas, encargos e fiadores podem ser ajustados e valem para as próximas cobranças.</Aviso>
            </div>
          )}
          <DadosContrato form={form} nomes={nomes} setNomes={setNomes} imovelTexto={imovelTexto} setImovelTexto={setImovelTexto} travado={ativo} />
        </fieldset>
      )}
      {aba === 'financeiro' && contrato && <AbaFinanceiro contrato={contrato} />}
      {aba === 'lancamentos' && contrato && <AbaLancamentos contrato={contrato} />}
      {aba === 'reajustes' && contrato && <AbaReajustes contrato={contrato} />}
      {aba === 'rescisao' && contrato && <AbaRescisao contrato={contrato} />}
      {aba === 'documentos' && id && <Documentos entidade="contrato" entidadeId={id} />}
      {aba === 'historico' && id && <HistoricoContrato contratoId={id} />}

      <Confirmacao
        aberto={ativar}
        titulo="Ativar contrato"
        textoConfirmar="Ativar"
        mensagem="Os proprietários atuais do imóvel serão registrados como locadores, a oferta de locação passará a 'Alugado' e, se houver caução, será gerada a cobrança da caução. Após a ativação, as cobranças mensais passam a ser geradas."
        aoFechar={() => setAtivar(false)}
        aoConfirmar={async () => {
          await rpc('contratos.ativar', { id: id! })
          toast.sucesso('Contrato ativado.')
          void qc.invalidateQueries({ queryKey: ['contrato', id] })
          void qc.invalidateQueries({ queryKey: ['contratos'] })
          void qc.invalidateQueries({ queryKey: ['imoveis'] })
        }}
      />
      <Confirmacao
        aberto={excluir}
        titulo="Excluir rascunho"
        perigo
        textoConfirmar="Excluir"
        mensagem="O rascunho será excluído definitivamente (permanece na auditoria)."
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async () => {
          await rpc('contratos.excluirRascunho', { id: id! })
          void qc.invalidateQueries({ queryKey: ['contratos'] })
          nav('/locacoes')
        }}
      />
    </>
  )
}

function DadosContrato({
  form,
  nomes,
  setNomes,
  imovelTexto,
  setImovelTexto,
  travado
}: {
  form: UseFormReturn<ContratoInput>
  nomes: Record<number, string>
  setNomes: (f: (x: Record<number, string>) => Record<number, string>) => void
  imovelTexto: string
  setImovelTexto: (s: string) => void
  travado: boolean
}) {
  const { register, formState, watch, setValue, control } = form
  const e = formState.errors
  const { data: indices } = useQuery({ queryKey: ['indices'], queryFn: () => rpc('indices.listar') })
  const locatarios = useFieldArray({ control, name: 'locatarios' })
  const encargos = useFieldArray({ control, name: 'encargos' })
  const fiadores = watch('fiadores') ?? []
  const garantia = watch('garantiaTipo')
  const aluguel = paraCentavos(watch('aluguel') as string)
  const taxa = paraPontosBase(watch('taxaAdministracao') as string)
  const [prazo, setPrazo] = useState('30')
  const nomear = (id: number, nome: string) => setNomes((x) => ({ ...x, [id]: nome }))

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <Cartao titulo="Partes">
          <div className="space-y-4">
            <Campo rotulo="Imóvel" obrigatorio erro={erroDe(e, 'imovelId')}>
              {() =>
                watch('imovelId') ? (
                  <div className="flex items-center justify-between rounded-md border border-borda px-3 py-2 text-sm">
                    <span>{imovelTexto}</span>
                    {!travado && (
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setValue('imovelId', 0)}>
                        Trocar
                      </Botao>
                    )}
                  </div>
                ) : (
                  <BuscaImovel
                    aoSelecionar={(i) => {
                      setValue('imovelId', i.id)
                      setImovelTexto(`#${i.codigo} — ${i.endereco} · ${i.bairro}, ${i.cidade}`)
                      if (!watch('aluguel') && i.locacao) setValue('aluguel', centavosParaTexto(i.locacao.valorCentavos))
                    }}
                  />
                )
              }
            </Campo>
            <div>
              <div className="mb-1 text-xs font-medium text-texto-2">
                Locatário(s) <span className="text-perigo">*</span>
              </div>
              {locatarios.fields.map((f, i) => (
                <div key={f.id} className="mb-1 flex items-center gap-3 rounded-md border border-borda px-3 py-1.5 text-sm">
                  <span className="flex-1">{nomes[f.pessoaId] ?? `Pessoa #${f.pessoaId}`}</span>
                  <label className="flex items-center gap-1 text-xs text-texto-2">
                    <input type="radio" className="accent-[var(--destaque)]" checked={!!watch(`locatarios.${i}.principal`)} onChange={() => locatarios.fields.forEach((_, j) => setValue(`locatarios.${j}.principal`, i === j))} />
                    Principal (recebe as cobranças)
                  </label>
                  {!travado && (
                    <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => locatarios.remove(i)}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {erroDe(e, 'locatarios') && <div className="text-xs text-perigo">{erroDe(e, 'locatarios')}</div>}
              {!travado && (
                <BuscaPessoa
                  ignorar={locatarios.fields.map((f) => f.pessoaId)}
                  aoSelecionar={(p) => {
                    nomear(p.id, p.nome)
                    locatarios.append({ pessoaId: p.id, principal: locatarios.fields.length === 0 })
                  }}
                />
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-texto-2">Fiador(es)</div>
              {fiadores.map((f) => (
                <div key={f} className="mb-1 flex items-center justify-between rounded-md border border-borda px-3 py-1.5 text-sm">
                  {nomes[f] ?? `Pessoa #${f}`}
                  <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => setValue('fiadores', fiadores.filter((x) => x !== f))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {erroDe(e, 'fiadores') && <div className="text-xs text-perigo">{erroDe(e, 'fiadores')}</div>}
              <BuscaPessoa
                ignorar={[...fiadores, ...locatarios.fields.map((f) => f.pessoaId)]}
                aoSelecionar={(p) => {
                  nomear(p.id, p.nome)
                  setValue('fiadores', [...fiadores, p.id])
                }}
              />
            </div>
          </div>
        </Cartao>

        <Cartao
          titulo="Encargos cobrados com o aluguel"
          acoes={
            <Botao
              tamanho="sm"
              icone={<Plus className="size-3.5" />}
              onClick={() =>
                encargos.append({ tipo: 'CONDOMINIO', descricao: 'Condomínio', valor: '', competenciaInicio: watch('dataInicio') ? competenciaDe(watch('dataInicio')) : '', competenciaFim: '', proporcional: true, destino: 'TERCEIRO', beneficiarioId: null })
              }
            >
              Adicionar encargo
            </Botao>
          }
        >
          {encargos.fields.length === 0 && <div className="text-sm text-texto-3">Nenhum encargo. Condomínio e IPTU podem ser cobrados junto com o aluguel e pagos pela imobiliária ao beneficiário.</div>}
          <div className="space-y-3">
            {encargos.fields.map((f, i) => {
              const destino = watch(`encargos.${i}.destino`)
              const benef = watch(`encargos.${i}.beneficiarioId`)
              return (
                <div key={f.id} className="grid grid-cols-12 items-start gap-2 rounded-md border border-borda p-3">
                  <Selecao className="col-span-2" aria-label="Tipo" opcoes={TIPOS_ENCARGO} {...register(`encargos.${i}.tipo`)} />
                  <Entrada className="col-span-3" placeholder="Descrição" {...register(`encargos.${i}.descricao`)} />
                  <div className="col-span-2">
                    <CampoMoeda aria-label="Valor mensal" invalido={!!erroDe(e, `encargos.${i}.valor`)} {...register(`encargos.${i}.valor`)} />
                  </div>
                  <Entrada className="col-span-2" type="month" title="Início" {...register(`encargos.${i}.competenciaInicio`)} />
                  <Entrada className="col-span-2" type="month" title="Fim (opcional)" {...register(`encargos.${i}.competenciaFim`)} />
                  <button type="button" className="col-span-1 pt-2 text-texto-3 hover:text-perigo" onClick={() => encargos.remove(i)}>
                    <Trash2 className="mx-auto size-4" />
                  </button>
                  <Selecao className="col-span-4" aria-label="Destino" opcoes={DESTINOS_ITEM} {...register(`encargos.${i}.destino`)} />
                  <div className="col-span-5">
                    {destino === 'TERCEIRO' &&
                      (benef ? (
                        <div className="flex h-9 items-center justify-between rounded-md border border-borda px-3 text-sm">
                          {nomes[benef] ?? `#${benef}`}
                          <button type="button" className="text-xs text-texto-2 underline" onClick={() => setValue(`encargos.${i}.beneficiarioId`, null)}>
                            trocar
                          </button>
                        </div>
                      ) : (
                        <BuscaPessoa
                          aoSelecionar={(p) => {
                            nomear(p.id, p.nome)
                            setValue(`encargos.${i}.beneficiarioId`, p.id)
                          }}
                        />
                      ))}
                    {erroDe(e, `encargos.${i}.beneficiarioId`) && <div className="text-xs text-perigo">{erroDe(e, `encargos.${i}.beneficiarioId`)}</div>}
                  </div>
                  <Caixa className="col-span-3 pt-2" rotulo={<span className="text-xs">Proporcional no 1º/último mês</span>} checked={!!watch(`encargos.${i}.proporcional`)} onChange={(ev) => setValue(`encargos.${i}.proporcional`, ev.target.checked)} />
                </div>
              )
            })}
          </div>
        </Cartao>

        <Cartao titulo="Observações">
          <AreaTexto rows={3} {...register('observacoes')} />
        </Cartao>
      </div>

      <div className="space-y-6">
        <Cartao titulo="Prazo e valores">
          <fieldset disabled={travado} className="grid grid-cols-2 gap-3">
            <Campo rotulo="Tipo" className="col-span-2">{(i) => <Selecao id={i} opcoes={TIPOS_CONTRATO} {...register('tipo')} />}</Campo>
            <Campo rotulo="Início" obrigatorio erro={erroDe(e, 'dataInicio')}>
              {(i) => <Entrada id={i} type="date" {...register('dataInicio', { onChange: (ev) => ev.target.value && prazo && setValue('dataFim', adicionarDias(adicionarMesesData(ev.target.value, Number(prazo)), -1)) })} />}
            </Campo>
            <Campo rotulo="Prazo (meses)">
              {(i) => (
                <Entrada
                  id={i}
                  type="number"
                  min={1}
                  value={prazo}
                  onChange={(ev) => {
                    setPrazo(ev.target.value)
                    if (watch('dataInicio') && Number(ev.target.value)) setValue('dataFim', adicionarDias(adicionarMesesData(watch('dataInicio'), Number(ev.target.value)), -1))
                  }}
                />
              )}
            </Campo>
            <Campo rotulo="Término" obrigatorio className="col-span-2" erro={erroDe(e, 'dataFim')}>{(i) => <Entrada id={i} type="date" {...register('dataFim')} />}</Campo>
            <Campo rotulo="Aluguel mensal" obrigatorio erro={erroDe(e, 'aluguel')}>{(i) => <CampoMoeda id={i} {...register('aluguel')} />}</Campo>
          </fieldset>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Campo rotulo="Dia do vencimento" erro={erroDe(e, 'diaVencimento')} ajuda="Do mês seguinte ao de uso">{(i) => <Entrada id={i} type="number" min={1} max={31} {...register('diaVencimento')} />}</Campo>
            <Campo rotulo="Índice de reajuste">
              {(i) => (
                <Selecao
                  id={i}
                  opcoes={(indices ?? []).map((x) => [String(x.id), x.sigla] as [string, string])}
                  vazio="Sem reajuste"
                  value={watch('indiceId') ? String(watch('indiceId')) : ''}
                  onChange={(ev) => setValue('indiceId', ev.target.value ? Number(ev.target.value) : null)}
                />
              )}
            </Campo>
            <Campo rotulo="Periodicidade (meses)">{(i) => <Entrada id={i} type="number" min={1} {...register('periodicidadeReajusteMeses')} />}</Campo>
            <Caixa className="pt-6" rotulo={<span className="text-xs">Aplicar índice negativo</span>} checked={!!watch('reajusteNegativo')} onChange={(ev) => setValue('reajusteNegativo', ev.target.checked)} />
          </div>
        </Cartao>

        <Cartao titulo="Taxas e encargos por atraso">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Taxa de administração" erro={erroDe(e, 'taxaAdministracao')}>{(i) => <CampoSufixo id={i} sufixo="%" {...register('taxaAdministracao')} />}</Campo>
            <Campo rotulo="Intermediação (1º aluguel)" erro={erroDe(e, 'taxaIntermediacao')} ajuda="Em vez da taxa no 1º mês">
              {(i) => <CampoSufixo id={i} sufixo="%" disabled={travado} {...register('taxaIntermediacao')} />}
            </Campo>
            <Campo rotulo="Multa por atraso" erro={erroDe(e, 'multaAtraso')}>{(i) => <CampoSufixo id={i} sufixo="%" {...register('multaAtraso')} />}</Campo>
            <Campo rotulo="Juros ao mês" erro={erroDe(e, 'jurosMes')} ajuda="Pro rata die">{(i) => <CampoSufixo id={i} sufixo="%" {...register('jurosMes')} />}</Campo>
            <Campo rotulo="Multa e juros vão para" className="col-span-2">{(i) => <Selecao id={i} opcoes={DESTINOS_ENCARGOS_ATRASO} {...register('destinoEncargos')} />}</Campo>
            <Campo rotulo="Multa rescisória (aluguéis)" className="col-span-2" ajuda="Proporcional ao prazo restante (art. 4º)">{(i) => <Entrada id={i} type="number" min={0} max={12} {...register('multaRescisoriaAlugueis')} />}</Campo>
          </div>
          {aluguel && taxa != null && (
            <div className="numeros mt-3 text-xs text-texto-2">
              Taxa mensal estimada: <strong className="text-texto">{formatarMoeda(aplicarPercentual(aluguel, taxa))}</strong> ({formatarPercentual(taxa)} do aluguel efetivamente recebido)
            </div>
          )}
        </Cartao>

        <Cartao titulo="Garantia locatícia">
          <fieldset disabled={travado} className="space-y-3">
            <Campo rotulo="Modalidade">{(i) => <Selecao id={i} opcoes={GARANTIAS} {...register('garantiaTipo')} />}</Campo>
            {garantia === 'CAUCAO' && <Campo rotulo="Valor da caução" obrigatorio erro={erroDe(e, 'garantiaValor')} ajuda="Até 3 aluguéis. Recurso de terceiros, devolvido na rescisão.">{(i) => <CampoMoeda id={i} {...register('garantiaValor')} />}</Campo>}
          </fieldset>
          {['SEGURO_FIANCA', 'TITULO_CAPITALIZACAO'].includes(garantia) && (
            <div className={cx('mt-3 grid grid-cols-2 gap-3')}>
              <Campo rotulo={garantia === 'SEGURO_FIANCA' ? 'Seguradora' : 'Instituição'} className="col-span-2">{(i) => <Entrada id={i} {...register('garantiaSeguradora')} />}</Campo>
              <Campo rotulo="Apólice / título">{(i) => <Entrada id={i} {...register('garantiaApolice')} />}</Campo>
              <Campo rotulo="Vigência até">{(i) => <Entrada id={i} type="date" {...register('garantiaVigenciaFim')} />}</Campo>
            </div>
          )}
        </Cartao>
      </div>
    </div>
  )
}
