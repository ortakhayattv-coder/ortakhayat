import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Kullanici } from '../db'

interface OturumDegeri {
  kullanici: Kullanici | null
  girisYap: (k: Kullanici) => void
  cikisYap: () => void
  yonetici: boolean
}

const Ctx = createContext<OturumDegeri | null>(null)
const ANAHTAR = 'oturum.kullanici'

function oku(): Kullanici | null {
  try {
    const s = sessionStorage.getItem(ANAHTAR)
    return s ? (JSON.parse(s) as Kullanici) : null
  } catch {
    return null
  }
}

export function OturumSaglayici({ children }: { children: ReactNode }) {
  const [kullanici, setKullanici] = useState<Kullanici | null>(oku)
  const girisYap = (k: Kullanici) => {
    const { pin: _pin, ...pinsiz } = k
    void _pin
    const oturumdaki = { ...pinsiz, pin: '' }
    setKullanici(oturumdaki)
    try {
      sessionStorage.setItem(ANAHTAR, JSON.stringify(oturumdaki))
    } catch {
      /* yok say */
    }
  }
  const cikisYap = () => {
    setKullanici(null)
    try {
      sessionStorage.removeItem(ANAHTAR)
    } catch {
      /* yok say */
    }
  }
  return (
    <Ctx.Provider value={{ kullanici, girisYap, cikisYap, yonetici: kullanici?.rol === 'yonetici' }}>
      {children}
    </Ctx.Provider>
  )
}

export function useOturum() {
  const v = useContext(Ctx)
  if (!v) throw new Error('OturumSaglayici eksik')
  return v
}

/** Giriş yapmış kullanıcının adı (kayıtlara yazılır) */
export function useKullaniciAdi() {
  return useOturum().kullanici?.ad ?? '?'
}
