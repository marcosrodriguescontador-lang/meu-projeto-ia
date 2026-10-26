import '@fontsource-variable/inter'
import './estilos.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { ProvedorSessao } from './app/sessao'
import { ProvedorTema } from './app/tema'
import { ProvedorToast } from './components/ui'
import { ErroRpc } from './lib/rpc'

const cliente = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ErroRpc) && n < 2, refetchOnWindowFocus: false, staleTime: 5_000 }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorTema>
      <QueryClientProvider client={cliente}>
        <ProvedorToast>
          <ProvedorSessao>
            <App />
          </ProvedorSessao>
        </ProvedorToast>
      </QueryClientProvider>
    </ProvedorTema>
  </StrictMode>
)
