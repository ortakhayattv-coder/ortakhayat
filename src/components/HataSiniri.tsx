import { Component, type ReactNode } from 'react'

export class HataSiniri extends Component<{ children: ReactNode }, { hata: Error | null }> {
  state = { hata: null as Error | null }
  static getDerivedStateFromError(hata: Error) {
    return { hata }
  }
  render() {
    if (!this.state.hata) return this.props.children
    return (
      <div className="kart" style={{ maxWidth: 600, margin: '40px auto' }}>
        <h2>Bir hata oluştu</h2>
        <p>Verileriniz güvende; sadece bu ekran açılamadı.</p>
        <pre className="soluk kucuk" style={{ whiteSpace: 'pre-wrap' }}>
          {this.state.hata.message}
        </pre>
        <div className="butonlar">
          <button className="btn ikincil" onClick={() => this.setState({ hata: null })}>
            Tekrar dene
          </button>
          <button
            className="btn"
            onClick={() => {
              location.hash = '#/'
              location.reload()
            }}
          >
            Ana sayfaya dön
          </button>
        </div>
      </div>
    )
  }
}
