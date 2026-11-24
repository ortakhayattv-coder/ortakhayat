import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Urun } from '../db'
import { UrunSecici, tarihYaz } from '../components/Ortak'
import { GorselYonetimi } from '../components/Gorseller'
import { tl, miktarYaz } from '../lib/para'

export default function BarkodSorgu() {
  const [urunId, setUrunId] = useState<number | null>(null)
  const [bulunamayan, setBulunamayan] = useState('')
  const nav = useNavigate()
  const urun = useLiveQuery(() => (urunId ? db.urunler.get(urunId) : undefined), [urunId])

  return (
    <div className="sayfa">
      <h1>Barkod Sorgu</h1>
      <div className="kart">
        <UrunSecici
          sec={(u: Urun) => {
            setUrunId(u.id!)
            setBulunamayan('')
          }}
          bulunamadi={(m) => {
            setUrunId(null)
            setBulunamayan(m)
          }}
        />
      </div>
      {bulunamayan && (
        <div className="kart">
          <p>
            <strong>{bulunamayan}</strong> kayıtlı değil.
          </p>
          <button className="btn" onClick={() => nav(`/urun/yeni?barkod=${encodeURIComponent(bulunamayan)}`)}>
            Bu barkodla yeni ürün ekle
          </button>
        </div>
      )}
      {urun && <UrunKarti urun={urun} />}
    </div>
  )
}

function UrunKarti({ urun }: { urun: Urun }) {
  const alanlar = useLiveQuery(async () => {
    const kalemler = await db.cariKalemler.where('urunId').equals(urun.id!).toArray()
    const hareketler = await db.cariHareketler.bulkGet(kalemler.map((k) => k.hareketId))
    const musteriIds = [...new Set(hareketler.filter((h) => h && !h.iptal && h.tur === 'satis').map((h) => h!.musteriId))]
    const musteriler = await db.musteriler.bulkGet(musteriIds)
    const ozet = new Map<number, { ad: string; miktar: number; son: string }>()
    kalemler.forEach((k, i) => {
      const h = hareketler[i]
      if (!h || h.iptal || h.tur !== 'satis') return
      const m = musteriler[musteriIds.indexOf(h.musteriId)]
      const o = ozet.get(h.musteriId) ?? { ad: m?.ad ?? '?', miktar: 0, son: '' }
      o.miktar += k.miktar
      if (h.tarih > o.son) o.son = h.tarih
      ozet.set(h.musteriId, o)
    })
    return [...ozet.entries()].sort((a, b) => b[1].son.localeCompare(a[1].son)).slice(0, 15)
  }, [urun.id])

  return (
    <div className="kart urun-karti">
      <div className="urun-karti-ust">
        <div className="urun-karti-bilgi">
          <h2>{urun.ad}</h2>
          <div className="soluk">
            Barkod: {urun.barkod} {urun.kod && `· Kod: ${urun.kod}`}
          </div>
          <div className="fiyat-buyuk">{tl(urun.satisFiyati)}</div>
          <div className={urun.minStok > 0 && urun.stok <= urun.minStok ? 'kirmizi-yazi' : ''}>
            Stok: <strong>{miktarYaz(urun.stok)}</strong> {urun.birim}
          </div>
          {urun.not && <p className="soluk">{urun.not}</p>}
          <Link className="btn ikincil" to={`/urun/${urun.id}`}>
            Ürünü düzenle
          </Link>
        </div>
      </div>
      <GorselYonetimi urunId={urun.id!} />
      {alanlar && alanlar.length > 0 && (
        <>
          <h3>Veresiyeyle alan müşteriler</h3>
          <table className="tablo">
            <tbody>
              {alanlar.map(([id, o]) => (
                <tr key={id}>
                  <td>
                    <Link to={`/musteri/${id}`}>{o.ad}</Link>
                  </td>
                  <td className="sag">
                    {miktarYaz(o.miktar)} {urun.birim}
                  </td>
                  <td className="sag soluk">{tarihYaz(o.son)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
