import { Component, type ReactNode } from 'react'
import { Aviso, Botao } from './ui'

/** Evita tela em branco: exibe a falha da tela e permite voltar sem perder a sessão. */
export class LimiteErro extends Component<{ children: ReactNode; chave?: string }, { erro: Error | null }> {
  override state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  override componentDidUpdate(anterior: { chave?: string }) {
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: null })
  }

  override render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="space-y-3">
        <Aviso tom="perigo" titulo="Esta tela encontrou um erro">
          {this.state.erro.message}. Nenhum dado foi alterado.
        </Aviso>
        <Botao onClick={() => this.setState({ erro: null })}>Tentar novamente</Botao>
      </div>
    )
  }
}
