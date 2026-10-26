import { Lock } from 'lucide-react'
import { useState } from 'react'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Entrada } from '@/components/ui'
import { Marca } from '@/components/Marca'
import { ErroRpc, rpc } from '@/lib/rpc'

/** Sobreposição de bloqueio por inatividade: oculta todo o conteúdo até a senha ser confirmada. */
export function Bloqueio() {
  const { sessao, definirSessao, sair } = useSessao()
  const [senha, setSenha] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <form
        className="w-80 text-center text-white"
        onSubmit={async (e) => {
          e.preventDefault()
          setCarregando(true)
          setFalha(null)
          try {
            definirSessao(await rpc('auth.desbloquear', { senha }))
          } catch (err) {
            if (err instanceof ErroRpc && err.codigo === 'NAO_AUTENTICADO') definirSessao(null)
            setFalha(err instanceof Error ? err.message : String(err))
          } finally {
            setSenha('')
            setCarregando(false)
          }
        }}
      >
        <Marca fundo="escuro" className="mx-auto mb-10 h-16" />
        <Lock className="mx-auto mb-3 size-6 text-white/60" />
        <div className="text-sm text-white/70">Sessão bloqueada</div>
        <div className="mb-5 font-medium">{sessao?.usuario.nome}</div>
        <Entrada type="password" autoFocus placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="border-white/20 bg-white/5 text-white" />
        {falha && (
          <div className="mt-3 text-left">
            <Aviso tom="perigo">{falha}</Aviso>
          </div>
        )}
        <Botao type="submit" variante="secundario" className="mt-3 w-full" carregando={carregando}>
          Desbloquear
        </Botao>
        <button type="button" className="mt-4 text-xs text-white/50 underline" onClick={sair}>
          Entrar com outro usuário
        </button>
      </form>
    </div>
  )
}
