import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { loginSchema, type LoginInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Campo, Entrada } from '@/components/ui'
import { erroDe, resolverZod } from '@/lib/formulario'
import { rpc } from '@/lib/rpc'
import { TelaAcesso } from './TelaAcesso'

export function Login() {
  const { definirSessao } = useSessao()
  const [falha, setFalha] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: resolverZod(loginSchema), defaultValues: { login: '', senha: '' } })
  return (
    <TelaAcesso titulo="Entrar" subtitulo="Use seu usuário e senha do STATUS ERP.">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setFalha(null)
          try {
            definirSessao(await rpc('auth.entrar', v))
          } catch (e) {
            setFalha(e instanceof Error ? e.message : String(e))
          }
        })}
      >
        <Campo rotulo="Usuário" erro={erroDe(formState.errors, 'login')}>
          {(id) => <Entrada id={id} autoFocus autoComplete="username" {...register('login')} />}
        </Campo>
        <Campo rotulo="Senha" erro={erroDe(formState.errors, 'senha')}>
          {(id) => <Entrada id={id} type="password" autoComplete="current-password" {...register('senha')} />}
        </Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
        <Botao type="submit" variante="primario" className="w-full" carregando={formState.isSubmitting}>
          Entrar
        </Botao>
      </form>
    </TelaAcesso>
  )
}
