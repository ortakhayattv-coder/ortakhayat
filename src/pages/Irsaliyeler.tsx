import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ayarOku, db, simdi, type IrsaliyeKalemi } from '../db'
import { gorselKucult } from '../lib/gorsel'
import { birimCarpani, eslesmeAnahtari, urunAra, urunBul } from '../lib/stok'
import { bugunStr } from '../lib/cari'
import { tarihYaz, useBildirim, BOS_LISTE } from '../components/Ortak'
import { useKullaniciAdi } from '../lib/oturum'

export default function Irsaliyeler() {
  const nav = useNavigate()
  const kullanici = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const dosya = useRef<HTMLInputElement>(null)
  const [fotolar, setFotolar] = useState<Blob[]>([])
  const [durum, setDurum] = useState('')
  const irsaliyeler = useLiveQuery(() => db.irsaliyeler.orderBy(':id').reverse().limit(50).toArray(), []) ?? BOS_LISTE
  const apiVar = useLiveQuery(async () => !!(await ayarOku('apiAnahtari', '')), [])

  const fotoEkle = async (l: FileList | null) => {
    if (!l) return
    const yeni = await Promise.all(Array.from(l).map((f) => gorselKucult(f, 2400, 0.9)))
    setFotolar((f) => [...f, ...yeni])
    if (dosya.current) dosya.current.value = ''
  }

  const olustur = async (yapayZeka: boolean) => {
    try {
      let okunan = null
      if (yapayZeka) {
        setDurum('İrsaliye okunuyor… (10–40 saniye sürebilir)')
        const { irsaliyeOku } = await import('../lib/irsaliyeAI')
        okunan = await irsaliyeOku(fotolar, await ayarOku('apiAnahtari', ''))
      }
      setDurum('Ürünler eşleştiriliyor…')
      const urunler = await db.urunler.toArray()
      const irsId = (await db.irsaliyeler.add({
        tedarikci: okunan?.tedarikci ?? '',
        irsaliyeNo: okunan?.irsaliyeNo ?? '',
        tarih: okunan?.tarih || bugunStr(),
        fotolar,
        durum: 'taslak',
        kullanici,
        olusturma: simdi(),
        onayTarihi: '',
        not: okunan?.notlar ?? '',
      })) as number
      for (const k of okunan?.kalemler ?? []) {
        let urunId: number | null = null
        const esl = okunan!.tedarikci ? await db.eslesmeler.where('anahtar').equals(eslesmeAnahtari(okunan!.tedarikci, k.ad)).first() : undefined
        if (esl) urunId = esl.urunId
        if (!urunId && k.kod) urunId = (await urunBul(k.kod))?.id ?? null
        if (!urunId) {
          const aday = urunAra(urunler, k.ad, 2)
          // Sadece tek ve güçlü aday varsa otomatik seç; kullanıcı yine kontrol eder
          if (aday.length === 1) urunId = aday[0].id!
        }
        const u = urunId ? urunler.find((x) => x.id === urunId) : undefined
        const stokMiktari = u ? k.miktar * birimCarpani(u, k.birim) : k.miktar
        await db.irsaliyeKalemleri.add({
          irsaliyeId: irsId,
          okunanAd: k.ad,
          okunanKod: k.kod,
          urunId,
          miktar: k.miktar,
          birim: k.birim,
          stokMiktari,
          okutulan: 0,
        } satisfies IrsaliyeKalemi)
      }
      setFotolar([])
      nav(`/irsaliye/${irsId}`)
    } catch (e) {
      const { apiHatasiMetni } = await import('../lib/irsaliyeAI')
      goster(apiHatasiMetni(e), 'hata')
    } finally {
      setDurum('')
    }
  }

  return (
    <div className="sayfa">
      <h1>Stok Girişi (İrsaliye)</h1>
      <section className="kart">
        <h2>Yeni irsaliye</h2>
        <p className="soluk">İrsaliyenin fotoğrafını çekin. Birden fazla sayfa varsa hepsini ekleyin. Hiçbir şey onay vermeden stoğa girmez.</p>
        <input ref={dosya} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void fotoEkle(e.target.files)} />
        <div className="foto-izgara">
          {fotolar.map((f, i) => (
            <FotoKucuk key={i} blob={f} sil={() => setFotolar(fotolar.filter((_, j) => j !== i))} />
          ))}
          <button className="foto-ekle" onClick={() => dosya.current?.click()}>
            📷
            <br />
            {fotolar.length ? 'Sayfa ekle' : 'Fotoğraf çek'}
          </button>
        </div>
        {durum ? (
          <p className="bekle">{durum}</p>
        ) : (
          <div className="butonlar">
            <button className="btn" disabled={!fotolar.length || !apiVar} onClick={() => void olustur(true)}>
              🤖 Yapay zekâ ile oku
            </button>
            <button className="btn ikincil" onClick={() => void olustur(false)}>
              {fotolar.length ? 'Okutmadan elle gir' : 'Fotoğrafsız elle gir'}
            </button>
          </div>
        )}
        {apiVar === false && (
          <p className="soluk kucuk">
            Otomatik okuma için <Link to="/ayarlar">Ayarlar</Link>'dan yapay zekâ API anahtarını girin. Anahtar olmadan da satırları elle veya barkod okutarak girebilirsiniz.
          </p>
        )}
      </section>
      <section className="kart">
        <h2>Son irsaliyeler</h2>
        <table className="tablo">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tedarikçi</th>
              <th>No</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {irsaliyeler.map((i) => (
              <tr key={i.id} className="tiklanir" onClick={() => nav(`/irsaliye/${i.id}`)}>
                <td>{tarihYaz(i.tarih)}</td>
                <td>{i.tedarikci || <span className="soluk">—</span>}</td>
                <td>{i.irsaliyeNo}</td>
                <td>{i.durum === 'onaylandi' ? <span className="rozet yesil">Stoğa işlendi</span> : <span className="rozet sari">Taslak</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {el}
    </div>
  )
}

export function FotoKucuk({ blob, sil }: { blob: Blob; sil?: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob))
  return (
    <figure className="foto-kucuk">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="İrsaliye sayfası" />
      </a>
      {sil && (
        <button className="ikon-btn" onClick={sil} aria-label="Fotoğrafı kaldır">
          ✕
        </button>
      )}
    </figure>
  )
}
