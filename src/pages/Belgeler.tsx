import { useMemo, useRef, useState, type RefObject } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ayarOku, db } from '../db'
import { ODEME_ADI, TUR_ADI, bakiyeSeyri, bugunStr, gunEkle, ozetHesapla } from '../lib/cari'
import { miktarYaz, tl } from '../lib/para'
import { tarihYaz, BOS_LISTE } from '../components/Ortak'
import { whatsappDosyaGonder } from '../lib/whatsappDosya'

export interface Dukkan {
  ad: string
  adres: string
  telefon: string
  vergi: string
  altNot: string
}

export const BOS_DUKKAN: Dukkan = { ad: '', adres: '', telefon: '', vergi: '', altNot: '' }

function Baslik({ dukkan, belge }: { dukkan: Dukkan; belge: string }) {
  return (
    <header className="belge-baslik">
      <div>
        <div className="belge-dukkan">{dukkan.ad || 'Dükkân adı (Ayarlar’dan girin)'}</div>
        {dukkan.adres && <div>{dukkan.adres}</div>}
        {dukkan.telefon && <div>Tel: {dukkan.telefon}</div>}
        {dukkan.vergi && <div>{dukkan.vergi}</div>}
      </div>
      <div className="belge-tur">{belge}</div>
    </header>
  )
}

interface WhatsappBilgi {
  belgeRef: RefObject<HTMLDivElement | null>
  dosyaAdi: string
  telefon?: string
  mesaj: string
}

function Araclar({ wp }: { wp?: WhatsappBilgi }) {
  const [hazirlaniyor, setHazirlaniyor] = useState(false)
  const [bilgi, setBilgi] = useState('')

  async function gonder() {
    if (!wp?.belgeRef.current) return
    setHazirlaniyor(true)
    setBilgi('')
    try {
      const sonuc = await whatsappDosyaGonder(wp.belgeRef.current, wp.dosyaAdi, wp.telefon ?? '', wp.mesaj)
      if (sonuc === 'indirildi')
        setBilgi('PDF indirildi. Açılan WhatsApp sohbetine dosyayı sürükleyin veya ataç (📎) ile ekleyin.')
    } catch (e) {
      setBilgi('PDF hazırlanamadı: ' + (e as Error).message)
    } finally {
      setHazirlaniyor(false)
    }
  }

  return (
    <div className="belge-araclar yazdirma">
      <button className="btn" onClick={() => window.print()}>
        🖨 Yazdır / PDF kaydet
      </button>
      {wp && (
        <button className="btn" onClick={gonder} disabled={hazirlaniyor}>
          {hazirlaniyor ? 'PDF hazırlanıyor…' : '💬 WhatsApp’a gönder (PDF)'}
        </button>
      )}
      <span className="soluk kucuk">{bilgi || 'PDF için yazıcı olarak “PDF olarak kaydet”i seçin.'}</span>
    </div>
  )
}

export function Ekstre() {
  const id = Number(useParams().id)
  const [bas, setBas] = useState('')
  const [son, setSon] = useState(bugunStr())
  const belgeRef = useRef<HTMLDivElement>(null)
  const veri = useLiveQuery(async () => {
    const [musteri, hareketler, dukkan] = await Promise.all([
      db.musteriler.get(id),
      db.cariHareketler.where('musteriId').equals(id).toArray(),
      ayarOku<Dukkan>('dukkan', BOS_DUKKAN),
    ])
    const kalemler = await db.cariKalemler.where('hareketId').anyOf(hareketler.map((h) => h.id!)).toArray()
    return { musteri, hareketler, dukkan, kalemler }
  }, [id])

  const hesap = useMemo(() => {
    if (!veri) return null
    const seyir = bakiyeSeyri(veri.hareketler.filter((h) => !h.iptal))
    const icinde = seyir.filter(({ hareket: h }) => {
      const t = bugunStr(new Date(h.tarih))
      return (!bas || t >= bas) && t <= son
    })
    const oncesi = bas ? seyir.filter(({ hareket: h }) => bugunStr(new Date(h.tarih)) < bas) : []
    const devreden = oncesi.length ? oncesi[oncesi.length - 1].bakiye : 0
    return { icinde, devreden, ozet: ozetHesapla(veri.hareketler) }
  }, [veri, bas, son])

  if (!veri || !hesap) return null
  if (!veri.musteri) return <p>Müşteri bulunamadı</p>
  const { musteri, dukkan } = veri
  const kalemGrup = new Map<number, typeof veri.kalemler>()
  for (const k of veri.kalemler) kalemGrup.set(k.hareketId, [...(kalemGrup.get(k.hareketId) ?? BOS_LISTE), k])
  const borc = hesap.icinde.reduce((t, x) => t + Math.max(0, x.hareket.borcEtkisi), 0)
  const alacak = hesap.icinde.reduce((t, x) => t + Math.max(0, -x.hareket.borcEtkisi), 0)

  const sonBakiye = hesap.icinde.length ? hesap.icinde[hesap.icinde.length - 1].bakiye : hesap.devreden

  return (
    <div className="belge" ref={belgeRef}>
      <Araclar
        wp={{
          belgeRef,
          dosyaAdi: `Ekstre-${musteri.ad}-${son}`,
          telefon: musteri.telefon,
          mesaj: `Sayın ${musteri.ad}, ${dukkan.ad || 'dükkânımız'} hesap ekstreniz ektedir. Güncel bakiye: ${tl(hesap.ozet.bakiye)}`,
        }}
      />
      <div className="belge-araclar yazdirma">
        <label>
          Başlangıç <input type="date" value={bas} onChange={(e) => setBas(e.target.value)} />
        </label>
        <label>
          Bitiş <input type="date" value={son} onChange={(e) => setSon(e.target.value)} />
        </label>
        <button className="btn bag" onClick={() => setBas(gunEkle(bugunStr(), -30))}>
          Son 30 gün
        </button>
        <button className="btn bag" onClick={() => setBas('')}>
          Tümü
        </button>
      </div>
      <Baslik dukkan={dukkan} belge="HESAP EKSTRESİ" />
      <section className="belge-musteri">
        <div>
          <strong>{musteri.ad}</strong>
          {musteri.telefon && <div>Tel: {musteri.telefon}</div>}
          {musteri.adres && <div>{musteri.adres}</div>}
        </div>
        <div className="sag">
          <div>Tarih: {tarihYaz(new Date().toISOString())}</div>
          <div>
            Dönem: {bas ? tarihYaz(bas) : 'Başlangıç'} – {tarihYaz(son)}
          </div>
        </div>
      </section>
      <table className="belge-tablo">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Belge</th>
            <th>Açıklama</th>
            <th className="sag">Borç</th>
            <th className="sag">Ödeme</th>
            <th className="sag">Bakiye</th>
          </tr>
        </thead>
        <tbody>
          {bas && (
            <tr>
              <td colSpan={5}>Önceki dönemden devreden</td>
              <td className="sag">{tl(hesap.devreden)}</td>
            </tr>
          )}
          {hesap.icinde.map(({ hareket: h, bakiye }) => (
            <tr key={h.id}>
              <td>{tarihYaz(h.tarih)}</td>
              <td>{h.belgeNo}</td>
              <td>
                {TUR_ADI[h.tur]}
                {h.odemeSekli && ` (${ODEME_ADI[h.odemeSekli]})`}
                {h.aciklama && ` — ${h.aciklama}`}
                {(kalemGrup.get(h.id!) ?? BOS_LISTE).map((k) => (
                  <div key={k.id} className="belge-kalem">
                    {miktarYaz(k.miktar)} {k.birim} × {k.urunAd} @ {tl(k.birimFiyat)}
                    {k.indirim ? ` (−${tl(k.indirim)})` : ''} = {tl(k.tutar)}
                  </div>
                ))}
                {h.indirim > 0 && h.tur === 'satis' && <div className="belge-kalem">Toplam indirim: {tl(h.indirim)}</div>}
                {h.vade && h.borcEtkisi > 0 && <div className="belge-kalem">Vade: {tarihYaz(h.vade)}</div>}
              </td>
              <td className="sag">{h.borcEtkisi > 0 ? tl(h.borcEtkisi) : ''}</td>
              <td className="sag">{h.borcEtkisi < 0 ? tl(-h.borcEtkisi) : ''}</td>
              <td className="sag">{tl(bakiye)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Dönem toplamı</td>
            <td className="sag">{tl(borc)}</td>
            <td className="sag">{tl(alacak)}</td>
            <td className="sag">
              <strong>{tl(sonBakiye)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
      <section className="belge-ozet">
        <div>
          Güncel bakiye: <strong>{tl(hesap.ozet.bakiye)}</strong>
        </div>
        {hesap.ozet.vadesiGecen > 0 && (
          <div>
            Vadesi geçen: <strong>{tl(hesap.ozet.vadesiGecen)}</strong>
          </div>
        )}
        {hesap.ozet.toplamIndirim > 0 && <div>Bugüne kadar yapılan toplam indirim: {tl(hesap.ozet.toplamIndirim)}</div>}
      </section>
      <footer className="belge-imza">
        <div>Teslim eden</div>
        <div>Müşteri imza</div>
      </footer>
      {dukkan.altNot && <p className="belge-not">{dukkan.altNot}</p>}
    </div>
  )
}

export function Fis() {
  const id = Number(useParams().id)
  const belgeRef = useRef<HTMLDivElement>(null)
  const veri = useLiveQuery(async () => {
    const h = await db.cariHareketler.get(id)
    if (!h) return { h: undefined }
    const [musteri, kalemler, dukkan, hepsi] = await Promise.all([
      db.musteriler.get(h.musteriId),
      db.cariKalemler.where('hareketId').equals(id).toArray(),
      ayarOku<Dukkan>('dukkan', BOS_DUKKAN),
      db.cariHareketler.where('musteriId').equals(h.musteriId).toArray(),
    ])
    const seyir = bakiyeSeyri(hepsi)
    const sonrasi = seyir.find((x) => x.hareket.id === id)?.bakiye ?? 0
    return { h, musteri, kalemler, dukkan, sonrasi }
  }, [id])
  if (!veri) return null
  if (!veri.h) return <p>Belge bulunamadı</p>
  const { h, musteri, kalemler, dukkan, sonrasi } = veri
  const tahsilat = h.tur === 'tahsilat'

  return (
    <div className="belge fis" ref={belgeRef}>
      <Araclar
        wp={{
          belgeRef,
          dosyaAdi: `${tahsilat ? 'Makbuz' : 'Fis'}-${h.belgeNo}`,
          telefon: musteri?.telefon,
          mesaj: `Sayın ${musteri?.ad ?? ''}, ${h.belgeNo} numaralı ${tahsilat ? 'tahsilat makbuzunuz' : 'satış fişiniz'} ektedir. Güncel bakiye: ${tl(sonrasi)}`,
        }}
      />
      <Baslik dukkan={dukkan!} belge={tahsilat ? 'TAHSİLAT MAKBUZU' : 'VERESİYE SATIŞ FİŞİ'} />
      {h.iptal && <div className="belge-iptal">İPTAL EDİLMİŞTİR — {h.iptalNedeni}</div>}
      <section className="belge-musteri">
        <div>
          <strong>{musteri?.ad}</strong>
          {musteri?.telefon && <div>Tel: {musteri.telefon}</div>}
        </div>
        <div className="sag">
          <div>No: {h.belgeNo}</div>
          <div>{tarihYaz(h.tarih, true)}</div>
          <div>Düzenleyen: {h.kullanici}</div>
        </div>
      </section>
      {tahsilat ? (
        <section className="belge-makbuz">
          <p>
            Sayın <strong>{musteri?.ad}</strong>’dan <strong>{tl(-h.borcEtkisi)}</strong> {h.odemeSekli ? ODEME_ADI[h.odemeSekli].toLocaleLowerCase('tr-TR') : ''} olarak tahsil
            edilmiştir.
          </p>
          {h.aciklama && <p>Açıklama: {h.aciklama}</p>}
        </section>
      ) : (
        <table className="belge-tablo">
          <thead>
            <tr>
              <th>Ürün</th>
              <th className="sag">Miktar</th>
              <th className="sag">Fiyat</th>
              <th className="sag">İndirim</th>
              <th className="sag">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {kalemler!.map((k) => (
              <tr key={k.id}>
                <td>{k.urunAd}</td>
                <td className="sag">
                  {miktarYaz(k.miktar)} {k.birim}
                </td>
                <td className="sag">{tl(k.birimFiyat)}</td>
                <td className="sag">{k.indirim ? tl(k.indirim) : ''}</td>
                <td className="sag">{tl(k.tutar)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Liste toplamı</td>
              <td className="sag">{tl(h.araToplam)}</td>
            </tr>
            <tr>
              <td colSpan={4}>Toplam indirim</td>
              <td className="sag">{tl(h.indirim)}</td>
            </tr>
            <tr>
              <td colSpan={4}>
                <strong>Veresiyeye yazılan</strong>
              </td>
              <td className="sag">
                <strong>{tl(h.borcEtkisi)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      <section className="belge-ozet">
        {!tahsilat && h.vade && <div>Vade: {tarihYaz(h.vade)}</div>}
        <div>
          Bu işlemden sonra bakiye: <strong>{tl(sonrasi)}</strong>
        </div>
      </section>
      <footer className="belge-imza">
        <div>{tahsilat ? 'Tahsil eden' : 'Teslim eden'}</div>
        <div>{tahsilat ? 'Ödeyen' : 'Teslim alan'}</div>
      </footer>
      {dukkan!.altNot && <p className="belge-not">{dukkan!.altNot}</p>}
    </div>
  )
}
