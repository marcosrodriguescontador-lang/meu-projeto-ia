import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { POLITICA_SENHA, trocarSenhaSchema, type TrocarSenhaInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Campo, Entrada, useToast } from '@/components/ui'
import { aplicarErrosServidor, erroDe, resolverZod } from '@/lib/formulario'
import { rpc } from '@/lib/rpc'

export function FormTrocarSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState, setError, reset } = useForm<TrocarSenhaInput>({ resolver: resolverZod(trocarSenhaSchema), defaultValues: { senhaAtual: '', novaSenha: '', confirmacao: '' } })
  const e = formState.errors
  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (v) => {
        setFalha(null)
        try {
          await rpc('auth.trocarSenha', v)
          reset()
          aoConcluir()
        } catch (err) {
          setFalha(aplicarErrosServidor(err, setError))
        }
      })}
    >
      <Campo rotulo="Senha atual" erro={erroDe(e, 'senhaAtual')}>{(id) => <Entrada id={id} type="password" autoComplete="current-password" {...register('senhaAtual')} />}</Campo>
      <Campo rotulo="Nova senha" erro={erroDe(e, 'novaSenha')} ajuda={POLITICA_SENHA}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('novaSenha')} />}</Campo>
      <Campo rotulo="Confirme a nova senha" erro={erroDe(e, 'confirmacao')}>{(id) => <Entrada id={id} type="password" autoComplete="new-password" {...register('confirmacao')} />}</Campo>
      {falha && <Aviso tom="perigo">{falha}</Aviso>}
      <Botao type="submit" variante="primario" carregando={formState.isSubmitting}>
        Alterar senha
      </Botao>
    </form>
  )
}

export function TrocaObrigatoria() {
  const { recarregar, sair } = useSessao()
  const toast = useToast()
  return (
    <div className="flex h-full items-center justify-center bg-fundo p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Defina sua senha</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Por segurança, troque a senha temporária antes de continuar.</p>
        <FormTrocarSenha
          aoConcluir={() => {
            toast.sucesso('Senha alterada.')
            void recarregar()
          }}
        />
        <button type="button" className="mt-4 text-xs text-texto-2 underline" onClick={sair}>
          Sair
        </button>
      </div>
    </div>
  )
}
