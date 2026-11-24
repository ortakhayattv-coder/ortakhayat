import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kayitEkle, type Kullanici } from '../db'
import { useOturum } from '../lib/oturum'

export default function Giris() {
  const { girisYap } = useOturum()
  const kullanicilar = useLiveQuery(() => db.kullanicilar.filter((k) => k.aktif).toArray())
  const [secili, setSecili] = useState<Kullanici | null>(null)
  const [pin, setPin] = useState('')
  const [ad, setAd] = useState('')
  const [hata, setHata] = useState('')

  if (!kullanicilar) return null

  if (kullanicilar.length === 0) {
    const kur = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!ad.trim() || pin.length < 4) return setHata('Ad girin ve en az 4 haneli PIN belirleyin.')
      const k: Kullanici = { ad: ad.trim(), pin, rol: 'yonetici', aktif: true }
      k.id = (await db.kullanicilar.add(k)) as number
      await kayitEkle(k.ad, 'İlk kurulum', 'Yönetici hesabı oluşturuldu')
      girisYap(k)
    }
    return (
      <div className="giris">
        <form className="kart giris-kart" onSubmit={kur}>
          <h1>Hoş geldiniz</h1>
          <p className="soluk">İlk kurulum: yönetici hesabını oluşturun. Personel hesaplarını daha sonra Ayarlar'dan eklersiniz.</p>
          <label>
            Adınız
            <input value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
          </label>
          <label>
            PIN (en az 4 rakam)
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" />
          </label>
          {hata && <p className="uyari">{hata}</p>}
          <button className="btn">Kurulumu tamamla</button>
        </form>
      </div>
    )
  }

  const gir = (e: React.FormEvent) => {
    e.preventDefault()
    if (!secili) return
    if (secili.pin !== pin) {
      setHata('PIN hatalı')
      setPin('')
      return
    }
    girisYap(secili)
  }

  return (
    <div className="giris">
      <form className="kart giris-kart" onSubmit={gir}>
        <h1>Ortak Hayat</h1>
        <p className="soluk">Kim giriş yapıyor?</p>
        <div className="kullanici-liste">
          {kullanicilar.map((k) => (
            <button
              type="button"
              key={k.id}
              className={`btn ${secili?.id === k.id ? '' : 'ikincil'}`}
              onClick={() => {
                setSecili(k)
                setHata('')
                setPin('')
              }}
            >
              {k.ad}
            </button>
          ))}
        </div>
        {secili && (
          <>
            <label>
              PIN
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" autoFocus />
            </label>
            {hata && <p className="uyari">{hata}</p>}
            <button className="btn">Giriş</button>
          </>
        )}
      </form>
    </div>
  )
}
