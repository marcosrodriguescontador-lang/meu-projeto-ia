// Preferência de tema (claro/escuro) é conveniência de interface: fica no navegador, não no banco.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const Ctx = createContext<{ escuro: boolean; alternar: () => void }>({ escuro: false, alternar: () => {} })
export const useTema = () => useContext(Ctx)

function inicial(): boolean {
  try {
    const salvo = localStorage.getItem('tema')
    if (salvo) return salvo === 'escuro'
  } catch {
    /* indisponível */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [escuro, setEscuro] = useState(inicial)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro)
    try {
      localStorage.setItem('tema', escuro ? 'escuro' : 'claro')
    } catch {
      /* indisponível */
    }
  }, [escuro])
  return <Ctx.Provider value={{ escuro, alternar: () => setEscuro((e) => !e) }}>{children}</Ctx.Provider>
}
