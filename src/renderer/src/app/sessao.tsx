import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EstadoSistema, SessaoDto } from '@shared/dto'
import type { Permissao } from '@shared/permissoes'
import { aoErroSessao, rpc } from '@/lib/rpc'

interface ContextoSessao {
  estado: EstadoSistema | null
  sessao: SessaoDto | null
  carregando: boolean
  recarregar: () => Promise<void>
  definirSessao: (s: SessaoDto | null) => void
  sair: () => Promise<void>
  pode: (p: Permissao) => boolean
}

const Ctx = createContext<ContextoSessao>(null as never)
export const useSessao = () => useContext(Ctx)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSistema | null>(null)
  const [sessao, setSessao] = useState<SessaoDto | null>(null)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    const [e, s] = await Promise.all([rpc('sistema.estado'), rpc('auth.sessao').catch(() => null)])
    setEstado(e)
    setSessao(s)
    setCarregando(false)
  }, [])

  useEffect(() => {
    void recarregar()
    return aoErroSessao((codigo) => {
      if (codigo === 'NAO_AUTENTICADO') setSessao(null)
      else setSessao((s) => (s ? { ...s, bloqueada: true } : s))
    })
  }, [recarregar])

  useAtividade(sessao, () => setSessao((x) => (x ? { ...x, bloqueada: true } : x)))

  const sair = useCallback(async () => {
    await rpc('auth.sair')
    setSessao(null)
  }, [])

  const permissoes = new Set(sessao?.permissoes ?? [])
  return <Ctx.Provider value={{ estado, sessao, carregando, recarregar, definirSessao: setSessao, sair, pode: (p) => permissoes.has(p) }}>{children}</Ctx.Provider>
}

/** Informa atividade ao processo principal e bloqueia localmente após o tempo de inatividade. */
function useAtividade(sessao: SessaoDto | null, aoBloquear: () => void) {
  const ultima = useRef(Date.now())
  const enviada = useRef(0)
  const ativa = !!sessao && !sessao.bloqueada
  const minutos = sessao?.inatividadeMinutos ?? 10

  useEffect(() => {
    if (!ativa) return
    ultima.current = Date.now()
    const marcar = () => {
      ultima.current = Date.now()
      if (Date.now() - enviada.current > 30_000) {
        enviada.current = Date.now()
        void rpc('auth.atividade').catch(() => {})
      }
    }
    const eventos = ['mousemove', 'keydown', 'mousedown', 'wheel'] as const
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    const t = setInterval(() => {
      if (Date.now() - ultima.current > minutos * 60_000) {
        void rpc('auth.bloquear').then(aoBloquear).catch(() => {})
      }
    }, 15_000)
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar))
      clearInterval(t)
    }
  }, [ativa, minutos]) // eslint-disable-line react-hooks/exhaustive-deps
}
