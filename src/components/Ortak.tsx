import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { db, type Musteri, type Urun } from '../db'
import { urunAra, urunBul } from '../lib/stok'
import { tl } from '../lib/para'

/** useLiveQuery yüklenirken her render'da yeni dizi oluşmasın diye sabit boş dizi */
export const BOS_LISTE: never[] = []

export function Modal({ baslik, kapat, children, genis }: { baslik: string; kapat: () => void; children: ReactNode; genis?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && kapat()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [kapat])
  return (
    <div className="modal-arka" onMouseDown={(e) => e.target === e.currentTarget && kapat()}>
      <div className={`modal ${genis ? 'genis' : ''}`} role="dialog" aria-modal="true" aria-label={baslik}>
        <div className="modal-baslik">
          <h2>{baslik}</h2>
          <button className="ikon-btn" onClick={kapat} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="modal-govde">{children}</div>
      </div>
    </div>
  )
}

/** Kamera ile barkod okur. Okunan ilk barkodu `okundu` ile verir ve kapanır. */
export function KameraOkuyucu({ okundu, kapat }: { okundu: (kod: string) => void; kapat: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [hata, setHata] = useState('')
  const geriCagir = useRef(okundu)
  useEffect(() => {
    geriCagir.current = okundu
  }, [okundu])
  useEffect(() => {
    const okuyucu = new BrowserMultiFormatReader()
    let kontrol: IScannerControls | undefined
    let bitti = false
    okuyucu
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current!, (sonuc, _err, c) => {
        if (sonuc && !bitti) {
          bitti = true
          c.stop()
          navigator.vibrate?.(80)
          geriCagir.current(sonuc.getText())
        }
      })
      .then((c) => {
        kontrol = c
        if (bitti) c.stop()
      })
      .catch(() => setHata('Kamera açılamadı. Tarayıcıya kamera izni verin veya barkodu elle yazın.'))
    return () => {
      bitti = true
      kontrol?.stop()
    }
  }, [])
  return (
    <Modal baslik="Barkodu kameraya gösterin" kapat={kapat}>
      {hata ? <p className="uyari">{hata}</p> : <video ref={video} className="kamera" muted playsInline />}
      <p className="soluk">Barkodu çerçevenin ortasına getirin, okununca kendiliğinden kapanır.</p>
    </Modal>
  )
}

export function UrunGorsel({ urunId, boyut = 56, buyutulebilir }: { urunId?: number | null; boyut?: number; buyutulebilir?: boolean }) {
  const g = useLiveQuery(
    async () => (urunId ? (await db.urunGorselleri.where('urunId').equals(urunId).sortBy('sira'))[0] : undefined),
    [urunId],
  )
  const url = useMemo(() => (g ? URL.createObjectURL(g.blob) : ''), [g])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  const [buyuk, setBuyuk] = useState(false)
  if (!url)
    return (
      <div className="gorsel-yok" style={{ width: boyut, height: boyut }} aria-label="Görsel yok">
        📦
      </div>
    )
  return (
    <>
      <img
        src={url}
        alt=""
        className="urun-gorsel"
        style={{ width: boyut, height: boyut, cursor: buyutulebilir ? 'zoom-in' : undefined }}
        onClick={buyutulebilir ? () => setBuyuk(true) : undefined}
      />
      {buyuk && (
        <div className="modal-arka" onClick={() => setBuyuk(false)}>
          <img src={url} alt="" className="gorsel-buyuk" />
        </div>
      )}
    </>
  )
}

/**
 * Barkod okuyucu (USB okuyucu klavye gibi yazar + Enter), kamera veya ad/kod yazarak ürün seçer.
 */
export function UrunSecici({
  sec,
  bulunamadi,
  yerTutucu = 'Barkod okutun veya ürün adı / kodu yazın',
  otomatikOdak = true,
}: {
  sec: (u: Urun) => void
  bulunamadi?: (metin: string) => void
  yerTutucu?: string
  otomatikOdak?: boolean
}) {
  const [q, setQ] = useState('')
  const [kamera, setKamera] = useState(false)
  const [aktif, setAktif] = useState(0)
  const [acik, setAcik] = useState(false)
  const girdi = useRef<HTMLInputElement>(null)
  const urunler = useLiveQuery(() => db.urunler.toArray(), []) ?? BOS_LISTE
  const sonuclar = useMemo(() => (q.trim() ? urunAra(urunler, q, 12) : []), [urunler, q])

  const bitir = (u: Urun) => {
    sec(u)
    setQ('')
    setAcik(false)
    setAktif(0)
    girdi.current?.focus()
  }

  // Okutulan metin hemen alınır ve kutu anında temizlenir; böylece art arda hızlı okutmalar kaybolmaz.
  const enter = async (metin: string) => {
    const listedeki = acik ? sonuclar[aktif] : undefined
    setQ('')
    setAcik(false)
    setAktif(0)
    const u = await urunBul(metin)
    if (u) return sec(u)
    if (listedeki) return sec(listedeki)
    bulunamadi?.(metin.trim())
  }

  return (
    <div className="secici">
      <div className="secici-satir">
        <input
          ref={girdi}
          value={q}
          autoFocus={otomatikOdak}
          placeholder={yerTutucu}
          onChange={(e) => {
            setQ(e.target.value)
            setAcik(true)
            setAktif(0)
          }}
          onFocus={() => setAcik(true)}
          onBlur={() => setTimeout(() => setAcik(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (q.trim()) void enter(q)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAktif((a) => Math.min(a + 1, sonuclar.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAktif((a) => Math.max(a - 1, 0))
            }
          }}
          inputMode="search"
          aria-label="Ürün ara"
        />
        <button type="button" className="btn ikincil" onClick={() => setKamera(true)} title="Kamerayla okut">
          📷 Kamera
        </button>
      </div>
      {acik && sonuclar.length > 0 && (
        <ul className="secici-liste" role="listbox">
          {sonuclar.map((u, i) => (
            <li
              key={u.id}
              className={i === aktif ? 'aktif' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                bitir(u)
              }}
            >
              <UrunGorsel urunId={u.id} boyut={36} />
              <div className="esnek-1">
                <div>{u.ad}</div>
                <div className="soluk kucuk">
                  {u.kod && `${u.kod} · `}
                  {u.barkod} · Stok: {u.stok} {u.birim}
                </div>
              </div>
              <strong>{tl(u.satisFiyati)}</strong>
            </li>
          ))}
        </ul>
      )}
      {kamera && (
        <KameraOkuyucu
          kapat={() => setKamera(false)}
          okundu={(kod) => {
            setKamera(false)
            void enter(kod)
          }}
        />
      )}
    </div>
  )
}

const normal = (s: string) => s.toLocaleLowerCase('tr-TR').trim()

export function musteriAra(liste: Musteri[], q: string): Musteri[] {
  const s = normal(q)
  if (!s) return liste
  const rakam = s.replace(/\D/g, '')
  return liste.filter(
    (m) =>
      normal(m.ad).includes(s) ||
      normal(m.yetkili).includes(s) ||
      (rakam.length >= 3 && m.telefon.replace(/\D/g, '').includes(rakam)),
  )
}

export function MusteriSecici({ sec, secili }: { sec: (m: Musteri) => void; secili?: Musteri | null }) {
  const [q, setQ] = useState('')
  const [acik, setAcik] = useState(false)
  const musteriler = useLiveQuery(() => db.musteriler.filter((m) => m.aktif).toArray(), []) ?? BOS_LISTE
  const sonuc = useMemo(() => musteriAra(musteriler, q).slice(0, 10), [musteriler, q])
  return (
    <div className="secici">
      <input
        value={q}
        placeholder={secili ? `Seçili: ${secili.ad} — değiştirmek için yazın` : 'Müşteri adı veya telefon yazın'}
        onChange={(e) => {
          setQ(e.target.value)
          setAcik(true)
        }}
        onFocus={() => setAcik(true)}
        onBlur={() => setTimeout(() => setAcik(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && sonuc[0]) {
            e.preventDefault()
            sec(sonuc[0])
            setQ('')
            setAcik(false)
          }
        }}
        aria-label="Müşteri ara"
        autoFocus={!secili}
      />
      {acik && q && (
        <ul className="secici-liste">
          {sonuc.length === 0 && <li className="soluk">Eşleşen müşteri yok</li>}
          {sonuc.map((m) => (
            <li
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault()
                sec(m)
                setQ('')
                setAcik(false)
              }}
            >
              <div className="esnek-1">
                <div>{m.ad}</div>
                <div className="soluk kucuk">{m.telefon}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Kutu({ etiket, deger, ton, alt }: { etiket: string; deger: ReactNode; ton?: 'kirmizi' | 'yesil' | 'sari'; alt?: ReactNode }) {
  return (
    <div className={`kutu ${ton ?? ''}`}>
      <div className="kutu-etiket">{etiket}</div>
      <div className="kutu-deger">{deger}</div>
      {alt && <div className="kutu-alt">{alt}</div>}
    </div>
  )
}

export function tarihYaz(iso: string | null | undefined, saatli = false): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleString('tr-TR', saatli ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' })
}

export function useBildirim() {
  const [mesaj, setMesaj] = useState<{ metin: string; tur: 'ok' | 'hata' } | null>(null)
  useEffect(() => {
    if (!mesaj) return
    const t = setTimeout(() => setMesaj(null), mesaj.tur === 'hata' ? 6000 : 3000)
    return () => clearTimeout(t)
  }, [mesaj])
  const goster = (metin: string, tur: 'ok' | 'hata' = 'ok') => setMesaj({ metin, tur })
  const el = mesaj ? (
    <div className={`bildirim ${mesaj.tur}`} role="status">
      {mesaj.metin}
    </div>
  ) : null
  return { goster, el }
}
