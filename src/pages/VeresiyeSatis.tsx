import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ayarOku, db, type Musteri, type Urun } from '../db'
import { bugunStr, gunEkle, kalemTutari, ozetHesapla, sepetHesapla, veresiyeSatisKaydet, type SepetKalemi } from '../lib/cari'
import { kurusa, miktarYaz, sayiya, tl, tlGirdi, yuzdeTutar } from '../lib/para'
import { Modal, MusteriSecici, UrunGorsel, UrunSecici, useBildirim } from '../components/Ortak'
import { MusteriFormu, bosMusteri } from '../components/MusteriFormu'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

interface Satir extends SepetKalemi {
  stok: number | null
  /** kullanıcının yazdığı indirim metni: "10%" veya "25" */
  indirimMetni: string
}

/** "10%" / "%10" -> yüzde; "25" / "25,50" -> TL */
function indirimCoz(metin: string, tutar: number): number {
  const s = metin.trim()
  if (!s) return 0
  if (s.includes('%')) {
    const y = sayiya(s.replace('%', ''))
    return Number.isNaN(y) ? NaN : yuzdeTutar(tutar, y)
  }
  return kurusa(s)
}

export default function VeresiyeSatis() {
  const params = useParams()
  const nav = useNavigate()
  const { yonetici } = useOturum()
  const kullanici = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const [musteriId, setMusteriId] = useState<number | null>(params.musteriId ? Number(params.musteriId) : null)
  const [satirlar, setSatirlar] = useState<Satir[]>([])
  const [fisIndirimMetni, setFisIndirimMetni] = useState('')
  const [vade, setVade] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [fisAc, setFisAc] = useState(false)
  const [serbest, setSerbest] = useState<string | null>(null)
  const [yeniMusteri, setYeniMusteri] = useState(false)
  const [calisiyor, setCalisiyor] = useState(false)

  const musteri = useLiveQuery(() => (musteriId ? db.musteriler.get(musteriId) : undefined), [musteriId])
  const hareketler = useLiveQuery(() => (musteriId ? db.cariHareketler.where('musteriId').equals(musteriId).toArray() : []), [musteriId])
  const ozet = useMemo(() => (hareketler ? ozetHesapla(hareketler) : null), [hareketler])
  const maxIndirim = useLiveQuery(() => ayarOku('personelMaxIndirimYuzde', 10), []) ?? 10

  useEffect(() => {
    if (musteri) setVade(gunEkle(bugunStr(), musteri.vadeGun || 30))
  }, [musteri])

  const kalemler: SepetKalemi[] = satirlar.map((s) => ({ ...s, indirim: Number.isNaN(s.indirim) ? 0 : s.indirim }))
  const fisAraToplam = kalemler.reduce((t, k) => t + kalemTutari(k), 0)
  const fisIndirimi = indirimCoz(fisIndirimMetni, fisAraToplam)
  const hesap = sepetHesapla(kalemler, Number.isNaN(fisIndirimi) ? 0 : fisIndirimi)
  const indirimYuzde = hesap.araToplam ? (hesap.indirim / hesap.araToplam) * 100 : 0
  const yetkiAsimi = !yonetici && indirimYuzde > maxIndirim + 0.001
  const limitSonrasi = (ozet?.bakiye ?? 0) + hesap.net
  const limitAsimi = !!musteri && musteri.krediLimiti > 0 && limitSonrasi > musteri.krediLimiti

  const urunEkle = (u: Urun) => {
    setSatirlar((l) => {
      const i = l.findIndex((s) => s.urunId === u.id)
      if (i >= 0) return l.map((s, j) => (j === i ? { ...s, miktar: s.miktar + 1 } : s))
      return [
        ...l,
        { urunId: u.id!, urunAd: u.ad, barkod: u.barkod, birim: u.birim, miktar: 1, listeFiyati: u.satisFiyati, birimFiyat: u.satisFiyati, indirim: 0, indirimMetni: '', stok: u.stok },
      ]
    })
  }

  const guncelle = (i: number, p: Partial<Satir>) =>
    setSatirlar((l) =>
      l.map((s, j) => {
        if (j !== i) return s
        const y = { ...s, ...p }
        y.indirim = indirimCoz(y.indirimMetni, Math.round(y.miktar * y.birimFiyat))
        return y
      }),
    )

  const kaydet = async () => {
    if (!musteri) return goster('Önce müşteri seçin', 'hata')
    if (!satirlar.length) return goster('Sepet boş', 'hata')
    if (satirlar.some((s) => !(s.miktar > 0))) return goster('Miktarı sıfır olan satır var', 'hata')
    if (satirlar.some((s) => Number.isNaN(s.indirim)) || Number.isNaN(fisIndirimi)) return goster('İndirim alanı hatalı', 'hata')
    if (yetkiAsimi) return goster(`Personel en fazla %${maxIndirim} indirim yapabilir. Yönetici girişi gerekli.`, 'hata')
    if (!vade) return goster('Vade tarihi girin', 'hata')
    if (limitAsimi && !confirm(`Bu satışla borç ${tl(limitSonrasi)} olacak ve kredi limitini (${tl(musteri.krediLimiti)}) aşacak. Yine de kaydedilsin mi?`)) return
    const eksikStok = satirlar.filter((s) => s.stok != null && s.stok < s.miktar)
    if (eksikStok.length && !confirm(`Stokta yeterli olmayan ürün var:\n${eksikStok.map((s) => `• ${s.urunAd} (stok ${miktarYaz(s.stok!)})`).join('\n')}\nYine de kaydedilsin mi?`)) return
    setCalisiyor(true)
    try {
      const id = await veresiyeSatisKaydet({
        musteriId: musteri.id!,
        kalemler,
        fisIndirimi: Number.isNaN(fisIndirimi) ? 0 : fisIndirimi,
        vade,
        aciklama,
        kullanici,
      })
      if (fisAc) window.open(`#/fis/${id}`, '_blank')
      nav(`/musteri/${musteri.id}`)
    } catch (e) {
      goster(e instanceof Error ? e.message : String(e), 'hata')
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <div className="sayfa">
      <h1>Veresiye Satış</h1>

      <section className="kart">
        <div className="adim">1. Müşteri</div>
        <div className="secici-satir">
          <div className="esnek-1">
            <MusteriSecici sec={(m: Musteri) => setMusteriId(m.id!)} secili={musteri} />
          </div>
          <button className="btn ikincil" onClick={() => setYeniMusteri(true)}>
            + Yeni
          </button>
        </div>
        {musteri && ozet && (
          <div className="musteri-ozet">
            <strong>{musteri.ad}</strong>
            {musteri.telefon && <span>📞 {musteri.telefon}</span>}
            <span>
              Borç: <strong>{tl(ozet.bakiye)}</strong>
            </span>
            {ozet.vadesiGecen > 0 && (
              <span className="kirmizi-yazi">
                Vadesi geçen: {tl(ozet.vadesiGecen)} ({ozet.enEskiGecikme} gün)
              </span>
            )}
            {musteri.krediLimiti > 0 && <span className={limitAsimi ? 'kirmizi-yazi' : 'soluk'}>Limit: {tl(musteri.krediLimiti)}</span>}
            {musteri.not && <span className="not-kutu">{musteri.not}</span>}
          </div>
        )}
        {limitAsimi && <div className="uyari-bant">Bu satışla kredi limiti aşılıyor: borç {tl(limitSonrasi)} olacak.</div>}
      </section>

      <section className="kart">
        <div className="adim">2. Ürünler</div>
        <UrunSecici sec={urunEkle} bulunamadi={(m) => setSerbest(m)} otomatikOdak={!!musteri} />
        {satirlar.length > 0 && (
          <div className="sepet">
            {satirlar.map((s, i) => (
              <div className="sepet-satir" key={i}>
                <UrunGorsel urunId={s.urunId} boyut={52} buyutulebilir />
                <div className="sepet-ad">
                  <div>{s.urunAd}</div>
                  <div className="soluk kucuk">
                    {s.barkod}
                    {s.stok != null && (
                      <span className={s.stok < s.miktar ? 'kirmizi-yazi' : ''}>
                        {' '}
                        · Stok {miktarYaz(s.stok)} {s.birim}
                      </span>
                    )}
                  </div>
                </div>
                <label className="sepet-alan">
                  <span>Miktar ({s.birim})</span>
                  <div className="miktar">
                    <button type="button" className="btn bag" onClick={() => guncelle(i, { miktar: Math.max(0, s.miktar - 1) })} aria-label="Azalt">
                      −
                    </button>
                    <input value={s.miktar} inputMode="decimal" onChange={(e) => guncelle(i, { miktar: sayiya(e.target.value) || 0 })} />
                    <button type="button" className="btn bag" onClick={() => guncelle(i, { miktar: s.miktar + 1 })} aria-label="Arttır">
                      +
                    </button>
                  </div>
                </label>
                <label className="sepet-alan">
                  <span>Birim fiyat</span>
                  <FiyatGirdi deger={s.birimFiyat} degisti={(v) => guncelle(i, { birimFiyat: v })} />
                  {s.birimFiyat !== s.listeFiyati && <span className="soluk kucuk cizili">{tl(s.listeFiyati)}</span>}
                </label>
                <label className="sepet-alan">
                  <span>İndirim (₺ veya %)</span>
                  <input value={s.indirimMetni} placeholder="0" onChange={(e) => guncelle(i, { indirimMetni: e.target.value })} />
                </label>
                <div className="sepet-tutar">{tl(kalemTutari({ ...s, indirim: Number.isNaN(s.indirim) ? 0 : s.indirim }))}</div>
                <button className="btn bag" onClick={() => setSatirlar(satirlar.filter((_, j) => j !== i))} aria-label="Satırı sil">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="kart">
        <div className="adim">3. İndirim, vade ve kayıt</div>
        <div className="izgara-3">
          <label>
            Fiş indirimi (₺ veya %)
            <input value={fisIndirimMetni} onChange={(e) => setFisIndirimMetni(e.target.value)} placeholder="Ör. 50 veya 5%" />
          </label>
          <label>
            Vade tarihi
            <input type="date" value={vade} onChange={(e) => setVade(e.target.value)} />
          </label>
          <label>
            Açıklama
            <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Ör. şantiye adı, teslim alan" />
          </label>
        </div>
        <div className="toplamlar">
          <div>
            Liste toplamı <span>{tl(hesap.araToplam)}</span>
          </div>
          <div>
            Toplam indirim{' '}
            <span className={yetkiAsimi ? 'kirmizi-yazi' : ''}>
              {tl(hesap.indirim)} {hesap.araToplam > 0 && `(%${indirimYuzde.toFixed(1)})`}
            </span>
          </div>
          <div className="genel-toplam">
            Veresiyeye yazılacak <span>{tl(hesap.net)}</span>
          </div>
          {ozet && (
            <div className="soluk">
              Satış sonrası toplam borç <span>{tl(limitSonrasi)}</span>
            </div>
          )}
        </div>
        {yetkiAsimi && <div className="uyari-bant">Personel en fazla %{maxIndirim} indirim yapabilir. Daha fazlası için yönetici giriş yapmalı.</div>}
        <div className="butonlar">
          <label className="onay">
            <input type="checkbox" checked={fisAc} onChange={(e) => setFisAc(e.target.checked)} /> Kaydedince fişi yazdır
          </label>
          <button className="btn buyuk" disabled={calisiyor || !musteri || !satirlar.length} onClick={() => void kaydet()}>
            Veresiyeye yaz
          </button>
        </div>
      </section>

      {serbest !== null && (
        <SerbestKalem
          metin={serbest}
          kapat={() => setSerbest(null)}
          ekle={(ad, fiyat) => {
            setSatirlar((l) => [...l, { urunId: null, urunAd: ad, barkod: '', birim: 'adet', miktar: 1, listeFiyati: fiyat, birimFiyat: fiyat, indirim: 0, indirimMetni: '', stok: null }])
            setSerbest(null)
          }}
          urunAc={() => nav(`/urun/yeni?barkod=${encodeURIComponent(serbest)}`)}
        />
      )}
      {yeniMusteri && <MusteriFormu musteri={bosMusteri()} kapat={() => setYeniMusteri(false)} kaydedildi={(id) => setMusteriId(id)} />}
      {el}
    </div>
  )
}

function FiyatGirdi({ deger, degisti }: { deger: number; degisti: (k: number) => void }) {
  const [m, setM] = useState(tlGirdi(deger))
  useEffect(() => setM(tlGirdi(deger)), [deger])
  return (
    <input
      value={m}
      inputMode="decimal"
      onChange={(e) => setM(e.target.value)}
      onBlur={() => {
        const k = kurusa(m)
        if (Number.isNaN(k)) setM(tlGirdi(deger))
        else degisti(k)
      }}
    />
  )
}

function SerbestKalem({ metin, kapat, ekle, urunAc }: { metin: string; kapat: () => void; ekle: (ad: string, fiyat: number) => void; urunAc: () => void }) {
  const barkodGibi = /^\d{6,}$/.test(metin)
  const [ad, setAd] = useState(barkodGibi ? '' : metin)
  const [fiyat, setFiyat] = useState('')
  return (
    <Modal baslik="Ürün bulunamadı" kapat={kapat}>
      <p>
        <strong>{metin}</strong> kayıtlı bir ürünle eşleşmedi.
      </p>
      {barkodGibi && (
        <button className="btn ikincil" onClick={urunAc}>
          Bu barkodla yeni ürün kaydı aç
        </button>
      )}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          const k = kurusa(fiyat)
          if (ad.trim() && !Number.isNaN(k) && k > 0) ekle(ad.trim(), k)
        }}
      >
        <p className="soluk">Veya stoğa bağlı olmayan serbest bir kalem olarak ekleyin:</p>
        <label>
          Açıklama
          <input value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
        </label>
        <label>
          Birim fiyat (₺)
          <input value={fiyat} onChange={(e) => setFiyat(e.target.value)} inputMode="decimal" />
        </label>
        <button className="btn">Sepete ekle</button>
      </form>
    </Modal>
  )
}
