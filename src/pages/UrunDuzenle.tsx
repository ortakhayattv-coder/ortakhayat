import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kayitEkle, simdi, type Urun } from '../db'
import { BIRIMLER, bosUrun, elleStokDuzelt } from '../lib/stok'
import { kurusa, miktarYaz, sayiya, tlGirdi } from '../lib/para'
import { GorselYonetimi } from '../components/Gorseller'
import { KameraOkuyucu, tarihYaz, useBildirim } from '../components/Ortak'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

const KAYNAK_ADI: Record<string, string> = { irsaliye: 'İrsaliye', satis: 'Satış', iade: 'İade', sayim: 'Sayım', iptal: 'İptal', elle: 'Elle' }

/** Aynı sayfada başka ürüne geçilince formun sıfırlanması için anahtar verilir */
export default function UrunDuzenleSayfasi() {
  const { id } = useParams()
  const [ara] = useSearchParams()
  return <UrunDuzenle key={`${id}?${ara.toString()}`} />
}

function UrunDuzenle() {
  const { id } = useParams()
  const [ara] = useSearchParams()
  const yeni = id === 'yeni'
  const nav = useNavigate()
  const { yonetici } = useOturum()
  const kullanici = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const kayitli = useLiveQuery(() => (yeni ? undefined : db.urunler.get(Number(id))), [id])
  const [f, setF] = useState<Urun | null>(yeni ? bosUrun(ara.get('barkod') ?? '') : null)
  const [fiyat, setFiyat] = useState({ alis: '0,00', satis: '0,00' })
  const [kamera, setKamera] = useState(false)
  const [sayim, setSayim] = useState('')

  useEffect(() => {
    if (kayitli && (!f || f.id !== kayitli.id)) {
      setF(kayitli)
      setFiyat({ alis: tlGirdi(kayitli.alisFiyati), satis: tlGirdi(kayitli.satisFiyati) })
    }
  }, [kayitli, f])

  const hareketler = useLiveQuery(
    () => (yeni ? [] : db.stokHareketleri.where('urunId').equals(Number(id)).reverse().limit(30).toArray()),
    [id],
  )

  if (!f) return <div className="sayfa">Yükleniyor…</div>
  const duzenleyebilir = yeni || yonetici
  const set = <K extends keyof Urun>(k: K, v: Urun[K]) => setF({ ...f, [k]: v })

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault()
    const alis = kurusa(fiyat.alis)
    const satis = kurusa(fiyat.satis)
    if (!f.barkod.trim()) return goster('Barkod zorunlu', 'hata')
    if (!f.ad.trim()) return goster('Ürün adı zorunlu', 'hata')
    if (Number.isNaN(alis) || Number.isNaN(satis)) return goster('Fiyat hatalı', 'hata')
    const ayni = await db.urunler.where('barkod').equals(f.barkod.trim()).first()
    if (ayni && ayni.id !== f.id) return goster(`Bu barkod zaten "${ayni.ad}" ürününde kayıtlı`, 'hata')
    const veri = { ...f, barkod: f.barkod.trim(), ad: f.ad.trim(), kod: f.kod.trim(), alisFiyati: alis, satisFiyati: satis, guncelleme: simdi() }
    if (yeni) {
      const yeniId = (await db.urunler.add({ ...veri, stok: 0 })) as number
      if (f.stok) await elleStokDuzelt(yeniId, f.stok, kullanici, 'Açılış stoğu')
      await kayitEkle(kullanici, 'Ürün eklendi', veri.ad)
      nav(`/urun/${yeniId}`, { replace: true })
      goster('Ürün eklendi. Şimdi görsel ekleyebilirsiniz.')
    } else {
      const { stok: _s, ...stoksuz } = veri
      void _s
      await db.urunler.update(f.id!, stoksuz)
      await kayitEkle(kullanici, 'Ürün güncellendi', veri.ad)
      goster('Kaydedildi')
    }
  }

  return (
    <div className="sayfa">
      <h1>{yeni ? 'Yeni ürün' : f.ad}</h1>
      <div className="iki-sutun">
        <form className="kart form" onSubmit={kaydet}>
          <fieldset disabled={!duzenleyebilir}>
            <label>
              Barkod *
              <div className="secici-satir">
                <input value={f.barkod} onChange={(e) => set('barkod', e.target.value)} required />
                <button type="button" className="btn ikincil" onClick={() => setKamera(true)}>
                  📷
                </button>
              </div>
            </label>
            <label>
              Ürün adı *
              <input value={f.ad} onChange={(e) => set('ad', e.target.value)} required autoFocus={yeni} />
            </label>
            <div className="izgara-2">
              <label>
                Ürün kodu
                <input value={f.kod} onChange={(e) => set('kod', e.target.value)} />
              </label>
              <label>
                Birim
                <input list="birimler" value={f.birim} onChange={(e) => set('birim', e.target.value)} />
                <datalist id="birimler">
                  {BIRIMLER.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </label>
              <label>
                Alış fiyatı (₺)
                <input value={fiyat.alis} inputMode="decimal" onChange={(e) => setFiyat({ ...fiyat, alis: e.target.value })} />
              </label>
              <label>
                Satış fiyatı (₺)
                <input value={fiyat.satis} inputMode="decimal" onChange={(e) => setFiyat({ ...fiyat, satis: e.target.value })} />
              </label>
              {yeni && (
                <label>
                  Açılış stoğu
                  <input inputMode="decimal" value={f.stok || ''} onChange={(e) => set('stok', sayiya(e.target.value) || 0)} />
                </label>
              )}
              <label>
                Minimum stok (uyarı)
                <input inputMode="decimal" value={f.minStok || ''} onChange={(e) => set('minStok', sayiya(e.target.value) || 0)} />
              </label>
            </div>
            <div>
              <div className="etiket">Birim dönüşümleri (irsaliyede farklı birimle gelirse)</div>
              {f.birimCevrimleri.map((c, i) => (
                <div className="secici-satir" key={i}>
                  <span>1</span>
                  <input
                    value={c.birim}
                    placeholder="top"
                    onChange={(e) => set('birimCevrimleri', f.birimCevrimleri.map((x, j) => (j === i ? { ...x, birim: e.target.value } : x)))}
                  />
                  <span>=</span>
                  <input
                    inputMode="decimal"
                    value={c.carpan || ''}
                    onChange={(e) => set('birimCevrimleri', f.birimCevrimleri.map((x, j) => (j === i ? { ...x, carpan: sayiya(e.target.value) || 0 } : x)))}
                  />
                  <span>{f.birim}</span>
                  <button type="button" className="btn bag" onClick={() => set('birimCevrimleri', f.birimCevrimleri.filter((_, j) => j !== i))}>
                    Sil
                  </button>
                </div>
              ))}
              <button type="button" className="btn bag" onClick={() => set('birimCevrimleri', [...f.birimCevrimleri, { birim: '', carpan: 1 }])}>
                + Dönüşüm ekle
              </button>
            </div>
            <label>
              Not
              <textarea value={f.not} onChange={(e) => set('not', e.target.value)} rows={2} />
            </label>
          </fieldset>
          {duzenleyebilir ? <button className="btn">{yeni ? 'Ürünü ekle' : 'Kaydet'}</button> : <p className="soluk">Ürün bilgisini sadece yönetici değiştirebilir.</p>}
        </form>

        {!yeni && f.id != null && (
          <div className="sutun">
            <section className="kart">
              <h2>Görseller</h2>
              <GorselYonetimi urunId={f.id!} />
            </section>
            <section className="kart">
              <h2>Stok: {miktarYaz(kayitli?.stok ?? 0)} {f.birim}</h2>
              {yonetici && (
                <div className="secici-satir">
                  <input value={sayim} onChange={(e) => setSayim(e.target.value)} placeholder="Sayım sonucu" inputMode="decimal" />
                  <button
                    className="btn ikincil"
                    onClick={async () => {
                      const n = sayiya(sayim)
                      if (Number.isNaN(n) || sayim === '') return goster('Geçerli bir sayı girin', 'hata')
                      await elleStokDuzelt(f.id!, n, kullanici, 'Sayım düzeltmesi')
                      setSayim('')
                      goster('Stok düzeltildi')
                    }}
                  >
                    Stoğu düzelt
                  </button>
                </div>
              )}
              <table className="tablo">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kaynak</th>
                    <th className="sag">Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  {hareketler?.map((h) => (
                    <tr key={h.id}>
                      <td>{tarihYaz(h.tarih, true)}</td>
                      <td>
                        {KAYNAK_ADI[h.kaynak]} <span className="soluk kucuk">{h.aciklama}</span>
                      </td>
                      <td className={`sag ${h.miktar < 0 ? 'kirmizi-yazi' : 'yesil-yazi'}`}>
                        {h.miktar > 0 ? '+' : ''}
                        {miktarYaz(h.miktar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </div>
      {kamera && (
        <KameraOkuyucu
          kapat={() => setKamera(false)}
          okundu={(k) => {
            setKamera(false)
            set('barkod', k)
          }}
        />
      )}
      {el}
    </div>
  )
}
