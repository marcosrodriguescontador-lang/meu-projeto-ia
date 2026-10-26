import type { RespostaRpc } from '../shared/api'

declare global {
  interface Window {
    statusErp: {
      rpc: (metodo: string, entrada?: unknown) => Promise<RespostaRpc<unknown>>
      plataforma: string
    }
  }
}
export {}
