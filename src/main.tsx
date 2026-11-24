import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OturumSaglayici } from './lib/oturum'
import { HataSiniri } from './components/HataSiniri'

// Tarayıcıdan verilerin kendiliğinden silinmemesini iste
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OturumSaglayici>
      <HataSiniri>
        <App />
      </HataSiniri>
    </OturumSaglayici>
  </StrictMode>,
)
