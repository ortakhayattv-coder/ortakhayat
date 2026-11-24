import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ayarOku, ayarYaz, db, kayitEkle, type Kullanici, type Rol } from '../db'
import { yedekIndir, yedekYukle } from '../lib/yedek'
import { tarihYaz, useBildirim, BOS_LISTE } from '../components/Ortak'
import { useKullaniciAdi, useOturum } from '../lib/oturum'
import { BOS_DUKKAN, type Dukkan } from './Belgeler'

export default function Ayarlar() {
  const { yonetici, kullanici: ben } = useOturum()
  const kullanici = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const [dukkan, setDukkan] = useState<Dukkan>(BOS_DUKKAN)
  const [api, setApi] = useState('')
  const [maxIndirim, setMaxIndirim] = useState('10')
  const yedekDosya = useRef<HTMLInputElement>(null)
  const sonYedek = useLiveQuery(() => ayarOku<string | null>('sonYedek', null), [])
  const kullanicilar = useLiveQuery(() => db.kullanicilar.toArray(), []) ?? BOS_LISTE
  const kayitlar = useLiveQuery(() => db.islemKayitlari.orderBy('tarih').reverse().limit(100).toArray(), []) ?? BOS_LISTE
  const depolama = useLiveQuery(async () => {
    const t = await navigator.storage?.estimate?.()
    const kalici = await navigator.storage?.persisted?.()
    return { kullanilan: t?.usage ?? 0, kalici: !!kalici }
  }, [])

  useEffect(() => {
    void (async () => {
      setDukkan({ ...BOS_DUKKAN, ...(await ayarOku<Dukkan>('dukkan', BOS_DUKKAN)) })
      setApi(await ayarOku('apiAnahtari', ''))
      setMaxIndirim(String(await ayarOku('personelMaxIndirimYuzde', 10)))
    })()
  }, [])

  const kaydet = async () => {
    await ayarYaz('dukkan', dukkan)
    await ayarYaz('apiAnahtari', api.trim())
    await ayarYaz('personelMaxIndirimYuzde', Math.max(0, Number(maxIndirim.replace(',', '.')) || 0))
    await kayitEkle(kullanici, 'Ayarlar güncellendi')
    goster('Ayarlar kaydedildi')
  }

  return (
    <div className="sayfa">
      <h1>Ayarlar</h1>

      <section className="kart">
        <h2>Yedekleme</h2>
        <p>
          Tüm veriler (ürünler, görseller, veresiye defteri, irsaliyeler) <strong>bu cihazın tarayıcısında</strong> saklanır. Düzenli yedek alın ve dosyayı
          telefonunuza, e-postanıza veya bir USB belleğe kopyalayın.
        </p>
        <p className="soluk">
          Son yedek: {sonYedek ? tarihYaz(sonYedek, true) : 'hiç alınmadı'}
          {depolama && ` · Kullanılan alan: ${(depolama.kullanilan / 1048576).toFixed(1)} MB · ${depolama.kalici ? 'Kalıcı depolama açık' : 'Kalıcı depolama izni yok'}`}
        </p>
        <div className="butonlar">
          <button
            className="btn"
            onClick={async () => {
              await yedekIndir()
              await kayitEkle(kullanici, 'Yedek alındı')
            }}
          >
            ⬇ Yedek al
          </button>
          {yonetici && (
            <>
              <input
                ref={yedekDosya}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (!confirm('Yedek yüklenirse bu cihazdaki TÜM mevcut veriler silinip yedektekilerle değiştirilecek. Emin misiniz?')) return
                  try {
                    await yedekYukle(f)
                    goster('Yedek yüklendi. Sayfa yenileniyor…')
                    setTimeout(() => location.reload(), 1200)
                  } catch (err) {
                    goster(err instanceof Error ? err.message : String(err), 'hata')
                  }
                }}
              />
              <button className="btn ikincil" onClick={() => yedekDosya.current?.click()}>
                ⬆ Yedekten geri yükle
              </button>
            </>
          )}
        </div>
      </section>

      {yonetici ? (
        <>
          <section className="kart form">
            <h2>Dükkân bilgileri (ekstre ve fişlerde görünür)</h2>
            <div className="izgara-2">
              <label>
                Dükkân adı
                <input value={dukkan.ad} onChange={(e) => setDukkan({ ...dukkan, ad: e.target.value })} />
              </label>
              <label>
                Telefon
                <input value={dukkan.telefon} onChange={(e) => setDukkan({ ...dukkan, telefon: e.target.value })} />
              </label>
            </div>
            <label>
              Adres
              <input value={dukkan.adres} onChange={(e) => setDukkan({ ...dukkan, adres: e.target.value })} />
            </label>
            <label>
              Vergi dairesi / no
              <input value={dukkan.vergi} onChange={(e) => setDukkan({ ...dukkan, vergi: e.target.value })} />
            </label>
            <label>
              Belge alt notu
              <input value={dukkan.altNot} onChange={(e) => setDukkan({ ...dukkan, altNot: e.target.value })} placeholder="Ör. IBAN: TR.. — Ödemelerinizi ay sonuna kadar bekleriz." />
            </label>

            <h2>Kurallar</h2>
            <label>
              Personelin yapabileceği en yüksek indirim (%)
              <input value={maxIndirim} onChange={(e) => setMaxIndirim(e.target.value)} inputMode="decimal" />
            </label>

            <h2>İrsaliye okuma (yapay zekâ)</h2>
            <label>
              Anthropic API anahtarı
              <input value={api} onChange={(e) => setApi(e.target.value)} type="password" placeholder="sk-ant-..." autoComplete="off" />
            </label>
            <p className="soluk kucuk">
              Anahtarı console.anthropic.com adresinden alırsınız. Sadece bu cihazda saklanır ve irsaliye fotoğrafları okunurken kullanılır. Bu cihazı başkalarıyla paylaşıyorsanız
              harcama limiti düşük bir anahtar kullanın.
            </p>
            <button className="btn" onClick={() => void kaydet()}>
              Kaydet
            </button>
          </section>

          <Kullanicilar kullanicilar={kullanicilar} benId={ben?.id} bildir={goster} />

          <section className="kart">
            <h2>İşlem kayıtları (son 100)</h2>
            <div className="kaydirma">
              <table className="tablo">
                <tbody>
                  {kayitlar.map((k) => (
                    <tr key={k.id}>
                      <td className="soluk">{tarihYaz(k.tarih, true)}</td>
                      <td>{k.kullanici}</td>
                      <td>
                        {k.islem} <span className="soluk kucuk">{k.detay}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <PinDegistir />
      )}
      {el}
    </div>
  )
}

function Kullanicilar({ kullanicilar, benId, bildir }: { kullanicilar: Kullanici[]; benId?: number; bildir: (m: string, t?: 'ok' | 'hata') => void }) {
  const kullanici = useKullaniciAdi()
  const [ad, setAd] = useState('')
  const [pin, setPin] = useState('')
  const [rol, setRol] = useState<Rol>('personel')
  return (
    <section className="kart">
      <h2>Kullanıcılar</h2>
      <table className="tablo">
        <tbody>
          {kullanicilar.map((k) => (
            <tr key={k.id} className={k.aktif ? '' : 'iptal'}>
              <td>{k.ad}</td>
              <td>{k.rol === 'yonetici' ? 'Yönetici' : 'Personel'}</td>
              <td className="sag">
                <button
                  className="btn bag kucuk"
                  onClick={async () => {
                    const y = prompt(`${k.ad} için yeni PIN (en az 4 rakam):`)
                    if (!y) return
                    if (!/^\d{4,}$/.test(y)) return bildir('PIN en az 4 rakam olmalı', 'hata')
                    await db.kullanicilar.update(k.id!, { pin: y })
                    await kayitEkle(kullanici, 'PIN değiştirildi', k.ad)
                    bildir('PIN değiştirildi')
                  }}
                >
                  PIN değiştir
                </button>
                {k.id !== benId && (
                  <button
                    className="btn bag kucuk"
                    onClick={async () => {
                      await db.kullanicilar.update(k.id!, { aktif: !k.aktif })
                      await kayitEkle(kullanici, k.aktif ? 'Kullanıcı pasif yapıldı' : 'Kullanıcı aktif yapıldı', k.ad)
                    }}
                  >
                    {k.aktif ? 'Pasif yap' : 'Aktif yap'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="secici-satir"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!ad.trim() || !/^\d{4,}$/.test(pin)) return bildir('Ad girin ve en az 4 rakamlı PIN belirleyin', 'hata')
          await db.kullanicilar.add({ ad: ad.trim(), pin, rol, aktif: true })
          await kayitEkle(kullanici, 'Kullanıcı eklendi', `${ad} (${rol})`)
          setAd('')
          setPin('')
          bildir('Kullanıcı eklendi')
        }}
      >
        <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad" aria-label="Kullanıcı adı" />
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" inputMode="numeric" aria-label="PIN" />
        <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} aria-label="Rol">
          <option value="personel">Personel</option>
          <option value="yonetici">Yönetici</option>
        </select>
        <button className="btn">Ekle</button>
      </form>
      <p className="soluk kucuk">Personel: satış, tahsilat, iade, irsaliye girişi yapar. Yönetici ayrıca iptal, düzeltme, fiyat değişikliği, yüksek indirim ve ayarları yapar.</p>
    </section>
  )
}

function PinDegistir() {
  const { kullanici, girisYap } = useOturum()
  const [pin, setPin] = useState('')
  const { goster, el } = useBildirim()
  if (!kullanici) return null
  return (
    <section className="kart">
      <h2>PIN'imi değiştir</h2>
      <form
        className="secici-satir"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!/^\d{4,}$/.test(pin)) return goster('PIN en az 4 rakam olmalı', 'hata')
          await db.kullanicilar.update(kullanici.id!, { pin })
          girisYap({ ...kullanici, pin })
          setPin('')
          goster('PIN değiştirildi')
        }}
      >
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} type="password" inputMode="numeric" placeholder="Yeni PIN" aria-label="Yeni PIN" />
        <button className="btn">Değiştir</button>
      </form>
      {el}
    </section>
  )
}
