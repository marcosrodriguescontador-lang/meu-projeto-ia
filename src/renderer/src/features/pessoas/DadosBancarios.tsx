import { useQueryClient } from '@tanstack/react-query'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { DadoBancarioDto, DadoBancarioRevelado } from '@shared/dto'
import { dadoBancarioSchema, TIPOS_CONTA, TIPOS_PIX, type DadoBancarioInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Caixa, Campo, Cartao, Confirmacao, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { formatarDocumento } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function DadosBancarios({ pessoaId, itens, titular }: { pessoaId: number; itens: DadoBancarioDto[]; titular: { nome: string; documento: string } }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [editando, setEditando] = useState<{ id: number | null; valores: DadoBancarioInput } | null>(null)
  const [revelado, setRevelado] = useState<Record<number, DadoBancarioRevelado>>({})
  const [remover, setRemover] = useState<DadoBancarioDto | null>(null)
  const atualizar = () => qc.invalidateQueries({ queryKey: ['pessoa', pessoaId] })

  const revelar = async (id: number) => {
    try {
      const r = await rpc('bancarios.revelar', { id })
      setRevelado((x) => ({ ...x, [id]: r }))
      return r
    } catch (e) {
      toast.erro(e)
      return null
    }
  }

  return (
    <Cartao
      titulo="Dados bancários"
      acoes={
        pode('pessoas.dados_bancarios.editar') && (
          <Botao
            tamanho="sm"
            icone={<Plus className="size-3.5" />}
            onClick={() =>
              setEditando({
                id: null,
                valores: { bancoCodigo: '', bancoNome: '', agencia: '', conta: '', digito: '', tipoConta: 'CORRENTE', pixTipo: '', pixChave: '', titularNome: titular.nome, titularDocumento: formatarDocumento(titular.documento), principal: itens.length === 0 }
              })
            }
          >
            Adicionar conta
          </Botao>
        )
      }
      semPadding
    >
      <div className="px-5 pt-4">
        <Aviso>Agência, conta e chave PIX são armazenadas cifradas. Cada visualização completa é registrada na auditoria.</Aviso>
      </div>
      <Tabela colunas={['Banco', 'Agência / Conta', 'Tipo', 'PIX', 'Titular', '']} vazio={itens.length === 0}>
        {itens.map((d) => {
          const r = revelado[d.id]
          return (
            <tr key={d.id}>
              <td>
                <span className="numeros text-texto-2">{d.bancoCodigo}</span> {d.bancoNome} {d.principal && <Selo tom="escuro">Principal</Selo>}
              </td>
              <td className="numeros">{r ? `${r.agencia} / ${r.conta}${r.digito ? `-${r.digito}` : ''}` : `•••• / ${d.contaMascara}`}</td>
              <td>{TIPOS_CONTA[d.tipoConta as keyof typeof TIPOS_CONTA]}</td>
              <td className="text-texto-2">{d.pixTipo ? `${TIPOS_PIX[d.pixTipo as keyof typeof TIPOS_PIX]}${r?.pixChave ? `: ${r.pixChave}` : ''}` : '—'}</td>
              <td>
                <div>{d.titularNome}</div>
                <div className="numeros text-xs text-texto-2">{formatarDocumento(d.titularDocumento)}</div>
              </td>
              <td className="text-right whitespace-nowrap">
                {pode('pessoas.dados_bancarios.ver') && !r && (
                  <Botao tamanho="sm" variante="fantasma" icone={<Eye className="size-3.5" />} onClick={() => revelar(d.id)}>
                    Exibir
                  </Botao>
                )}
                {pode('pessoas.dados_bancarios.editar') && (
                  <>
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      icone={<Pencil className="size-3.5" />}
                      disabled={!pode('pessoas.dados_bancarios.ver')}
                      title={pode('pessoas.dados_bancarios.ver') ? undefined : 'Requer permissão de visualização'}
                      onClick={async () => {
                        const v = r ?? (await revelar(d.id))
                        if (!v) return
                        setEditando({
                          id: d.id,
                          valores: { bancoCodigo: v.bancoCodigo, bancoNome: v.bancoNome, agencia: v.agencia, conta: v.conta, digito: v.digito, tipoConta: v.tipoConta as never, pixTipo: (v.pixTipo ?? '') as never, pixChave: v.pixChave ?? '', titularNome: v.titularNome, titularDocumento: formatarDocumento(v.titularDocumento), principal: v.principal }
                        })
                      }}
                    />
                    <Botao tamanho="sm" variante="fantasma" icone={<Trash2 className="size-3.5" />} onClick={() => setRemover(d)} />
                  </>
                )}
              </td>
            </tr>
          )
        })}
      </Tabela>
      {editando && (
        <FormConta
          inicial={editando.valores}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (v) => {
            if (editando.id) await rpc('bancarios.atualizar', { id: editando.id, dados: v })
            else await rpc('bancarios.adicionar', { pessoaId, dados: v })
            setRevelado({})
            setEditando(null)
            toast.sucesso('Dados bancários salvos.')
            await atualizar()
          }}
        />
      )}
      <Confirmacao
        aberto={!!remover}
        titulo="Remover conta bancária"
        perigo
        textoConfirmar="Remover"
        mensagem={`Remover a conta ${remover?.bancoNome} ${remover?.contaMascara}? O registro é mantido no histórico.`}
        aoFechar={() => setRemover(null)}
        aoConfirmar={async () => {
          await rpc('bancarios.remover', { id: remover!.id })
          toast.sucesso('Conta removida.')
          await atualizar()
        }}
      />
    </Cartao>
  )
}

function FormConta({ inicial, aoFechar, aoSalvar }: { inicial: DadoBancarioInput; aoFechar: () => void; aoSalvar: (v: DadoBancarioInput) => Promise<void> }) {
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError, watch, setValue } = useForm<DadoBancarioInput>({ resolver: resolverZod(dadoBancarioSchema), defaultValues: inicial })
  const e = formState.errors
  const enviar = handleSubmit(async (v) => {
    setFalha(null)
    try {
      await aoSalvar(v)
    } catch (err) {
      setFalha(aplicarErrosServidor(err, setError))
    }
  })
  return (
    <Dialogo
      aberto
      titulo="Conta bancária"
      aoFechar={aoFechar}
      largura="max-w-2xl"
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
        <Campo rotulo="Código" obrigatorio erro={erroDe(e, 'bancoCodigo')}>{(id) => <Entrada id={id} maxLength={3} placeholder="001" {...register('bancoCodigo')} />}</Campo>
        <Campo rotulo="Banco" obrigatorio className="col-span-3" erro={erroDe(e, 'bancoNome')}>{(id) => <Entrada id={id} {...register('bancoNome')} />}</Campo>
        <Campo rotulo="Tipo de conta" className="col-span-2">{(id) => <Selecao id={id} opcoes={TIPOS_CONTA} {...register('tipoConta')} />}</Campo>
        <Campo rotulo="Agência" obrigatorio className="col-span-2" erro={erroDe(e, 'agencia')}>{(id) => <Entrada id={id} {...register('agencia')} />}</Campo>
        <Campo rotulo="Conta" obrigatorio className="col-span-3" erro={erroDe(e, 'conta')}>{(id) => <Entrada id={id} {...register('conta')} />}</Campo>
        <Campo rotulo="Dígito" erro={erroDe(e, 'digito')}>{(id) => <Entrada id={id} maxLength={2} {...register('digito')} />}</Campo>
        <Campo rotulo="Tipo de chave PIX" className="col-span-2">{(id) => <Selecao id={id} opcoes={TIPOS_PIX} vazio="Sem PIX" {...register('pixTipo')} />}</Campo>
        <Campo rotulo="Chave PIX" className="col-span-4" erro={erroDe(e, 'pixChave')}>{(id) => <Entrada id={id} disabled={!watch('pixTipo')} {...register('pixChave')} />}</Campo>
        <Campo rotulo="Titular" obrigatorio className="col-span-4" erro={erroDe(e, 'titularNome')}>{(id) => <Entrada id={id} {...register('titularNome')} />}</Campo>
        <Campo rotulo="CPF/CNPJ do titular" obrigatorio className="col-span-2" erro={erroDe(e, 'titularDocumento')}>{(id) => <Entrada id={id} {...register('titularDocumento')} />}</Campo>
        <div className="col-span-6">
          <Caixa rotulo="Conta principal para repasses" checked={!!watch('principal')} onChange={(ev) => setValue('principal', ev.target.checked)} />
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
