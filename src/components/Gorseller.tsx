import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BOS_LISTE } from '../components/Ortak'
import { db, kayitEkle, simdi, type UrunGorseli } from '../db'
import { gorselKucult } from '../lib/gorsel'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

function Kucuk({ g, sil, oneAl, ilk }: { g: UrunGorseli; sil?: () => void; oneAl?: () => void; ilk: boolean }) {
  const url = useMemo(() => URL.createObjectURL(g.blob), [g.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <figure className="gorsel-kucuk">
      <img src={url} alt="" />
      {(sil || oneAl) && (
        <figcaption>
          {!ilk && oneAl && (
            <button type="button" className="btn bag kucuk" onClick={oneAl}>
              Ana görsel yap
            </button>
          )}
          {sil && (
            <button type="button" className="btn bag kucuk kirmizi-yazi" onClick={sil}>
              Sil
            </button>
          )}
        </figcaption>
      )}
    </figure>
  )
}

/** Ürün görsellerini gösterir; yönetici ekler/siler. Personel sadece ürünün hiç görseli yoksa ekleyebilir. */
export function GorselYonetimi({ urunId }: { urunId: number }) {
  const { yonetici } = useOturum()
  const kullanici = useKullaniciAdi()
  const dosya = useRef<HTMLInputElement>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const gorseller = useLiveQuery(() => db.urunGorselleri.where('urunId').equals(urunId).sortBy('sira'), [urunId]) ?? BOS_LISTE
  const ekleyebilir = yonetici || gorseller.length === 0

  const ekle = async (dosyalar: FileList | null) => {
    if (!dosyalar?.length) return
    setYukleniyor(true)
    try {
      let sira = gorseller.length ? Math.max(...gorseller.map((g) => g.sira)) + 1 : 0
      for (const f of Array.from(dosyalar)) {
        const blob = await gorselKucult(f, 900)
        await db.urunGorselleri.add({ urunId, blob, sira: sira++, ekleyen: kullanici, tarih: simdi() })
      }
      await kayitEkle(kullanici, 'Görsel eklendi', `ürün#${urunId}`)
    } finally {
      setYukleniyor(false)
      if (dosya.current) dosya.current.value = ''
    }
  }

  return (
    <div>
      <div className="gorsel-izgara">
        {gorseller.map((g, i) => (
          <Kucuk
            key={g.id}
            g={g}
            ilk={i === 0}
            sil={
              yonetici
                ? async () => {
                    if (!confirm('Bu görsel silinsin mi?')) return
                    await db.urunGorselleri.delete(g.id!)
                    await kayitEkle(kullanici, 'Görsel silindi', `ürün#${urunId}`)
                  }
                : undefined
            }
            oneAl={
              yonetici
                ? async () => {
                    const enKucuk = Math.min(...gorseller.map((x) => x.sira))
                    await db.urunGorselleri.update(g.id!, { sira: enKucuk - 1 })
                  }
                : undefined
            }
          />
        ))}
        {gorseller.length === 0 && <div className="soluk">Bu ürünün görseli yok.</div>}
      </div>
      {ekleyebilir && (
        <>
          <input ref={dosya} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void ekle(e.target.files)} />
          <button type="button" className="btn ikincil" disabled={yukleniyor} onClick={() => dosya.current?.click()}>
            {yukleniyor ? 'Yükleniyor…' : '📷 Fotoğraf çek / görsel ekle'}
          </button>
        </>
      )}
    </div>
  )
}
