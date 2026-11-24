import { useState } from 'react'
import { db, kayitEkle, simdi, type Musteri, type MusteriTipi } from '../db'
import { kurusa, tlGirdi } from '../lib/para'
import { useKullaniciAdi } from '../lib/oturum'
import { Modal } from './Ortak'

export const TIP_ADI: Record<MusteriTipi, string> = { bireysel: 'Bireysel', usta: 'Usta', muteahhit: 'Müteahhit', firma: 'Firma' }

export function bosMusteri(): Musteri {
  return { ad: '', telefon: '', adres: '', tip: 'bireysel', krediLimiti: 0, vadeGun: 30, yetkili: '', not: '', aktif: true, olusturma: simdi() }
}

export function MusteriFormu({ musteri, kapat, kaydedildi }: { musteri: Musteri; kapat: () => void; kaydedildi?: (id: number) => void }) {
  const kullanici = useKullaniciAdi()
  const [f, setF] = useState(musteri)
  const [limit, setLimit] = useState(tlGirdi(musteri.krediLimiti))
  const [hata, setHata] = useState('')
  const set = <K extends keyof Musteri>(k: K, v: Musteri[K]) => setF({ ...f, [k]: v })

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.ad.trim()) return setHata('Ad zorunlu')
    const krediLimiti = kurusa(limit)
    if (Number.isNaN(krediLimiti)) return setHata('Kredi limiti hatalı')
    const veri = { ...f, ad: f.ad.trim(), telefon: f.telefon.trim(), krediLimiti }
    if (!f.id) {
      const ayni = await db.musteriler.filter((m) => m.ad.toLocaleLowerCase('tr-TR') === veri.ad.toLocaleLowerCase('tr-TR')).first()
      if (ayni && !confirm(`"${ayni.ad}" adında bir müşteri zaten var. Yine de yeni müşteri eklensin mi?`)) return
    }
    let id = f.id
    if (id) await db.musteriler.put(veri)
    else id = (await db.musteriler.add(veri)) as number
    await kayitEkle(kullanici, f.id ? 'Müşteri güncellendi' : 'Müşteri eklendi', veri.ad)
    kaydedildi?.(id)
    kapat()
  }

  return (
    <Modal baslik={f.id ? 'Müşteriyi düzenle' : 'Yeni müşteri'} kapat={kapat}>
      <form className="form" onSubmit={kaydet}>
        <label>
          Ad soyad / firma adı *
          <input value={f.ad} onChange={(e) => set('ad', e.target.value)} autoFocus />
        </label>
        <div className="izgara-2">
          <label>
            Telefon
            <input value={f.telefon} onChange={(e) => set('telefon', e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" />
          </label>
          <label>
            Müşteri tipi
            <select value={f.tip} onChange={(e) => set('tip', e.target.value as MusteriTipi)}>
              {Object.entries(TIP_ADI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kredi limiti (₺, 0 = limitsiz)
            <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            Varsayılan vade (gün)
            <input value={f.vadeGun} onChange={(e) => set('vadeGun', Number(e.target.value.replace(/\D/g, '')) || 0)} inputMode="numeric" />
          </label>
        </div>
        <label>
          Adres
          <textarea value={f.adres} onChange={(e) => set('adres', e.target.value)} rows={2} />
        </label>
        <label>
          Yetkili / kefil
          <input value={f.yetkili} onChange={(e) => set('yetkili', e.target.value)} />
        </label>
        <label>
          Not
          <textarea value={f.not} onChange={(e) => set('not', e.target.value)} rows={2} placeholder="Ör. ay başında öder, şantiye adı" />
        </label>
        {f.id && (
          <label className="onay">
            <input type="checkbox" checked={!f.aktif} onChange={(e) => set('aktif', !e.target.checked)} /> Pasif (listede gizle; geçmiş kayıtlar silinmez)
          </label>
        )}
        {hata && <p className="uyari">{hata}</p>}
        <button className="btn">Kaydet</button>
      </form>
    </Modal>
  )
}
