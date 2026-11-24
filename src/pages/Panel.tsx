import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { tumOzetler, gunFarki, bugunStr } from '../lib/cari'
import { tl } from '../lib/para'
import { Kutu, tarihYaz } from '../components/Ortak'

export default function Panel() {
  const veri = useLiveQuery(async () => {
    const [musteriler, ozetler, urunler, sonYedek] = await Promise.all([
      db.musteriler.toArray(),
      tumOzetler(),
      db.urunler.toArray(),
      db.ayarlar.get('sonYedek'),
    ])
    const satirlar = musteriler.map((m) => ({ m, o: ozetler.get(m.id!) })).filter((x) => x.o)
    const toplam = { alacak: 0, gecen: 0, hafta: 0, buAyTahsilat: 0, buAySatis: 0 }
    for (const { o } of satirlar) {
      if (o!.bakiye > 0) toplam.alacak += o!.bakiye
      toplam.gecen += o!.vadesiGecen
      toplam.hafta += o!.buHaftaVadesiDolan
      toplam.buAyTahsilat += o!.buAyOdenen
      toplam.buAySatis += o!.buAyAlinan
    }
    return {
      toplam,
      enBorclu: satirlar.filter((x) => x.o!.bakiye > 0).sort((a, b) => b.o!.bakiye - a.o!.bakiye).slice(0, 8),
      gecikenler: satirlar.filter((x) => x.o!.vadesiGecen > 0).sort((a, b) => b.o!.enEskiGecikme - a.o!.enEskiGecikme).slice(0, 8),
      azalan: urunler.filter((u) => u.minStok > 0 && u.stok <= u.minStok).slice(0, 10),
      sonYedek: (sonYedek?.deger as string) ?? null,
      bos: musteriler.length === 0 && urunler.length === 0,
    }
  })
  if (!veri) return null
  const yedekGun = veri.sonYedek ? gunFarki(veri.sonYedek.slice(0, 10), bugunStr()) : null

  return (
    <div className="sayfa">
      <h1>Panel</h1>
      {(yedekGun === null || yedekGun >= 7) && !veri.bos && (
        <div className="uyari-bant">
          {yedekGun === null ? 'Henüz hiç yedek alınmadı.' : `Son yedek ${yedekGun} gün önce alındı.`}{' '}
          <Link to="/ayarlar">Şimdi yedek alın</Link> — veriler bu cihazda saklanıyor.
        </div>
      )}
      {veri.bos && (
        <div className="kart">
          <h2>Başlarken</h2>
          <ol>
            <li>
              <Link to="/urunler">Ürünler</Link> sayfasından ürünlerinizi ekleyin veya Excel'den toplu yükleyin.
            </li>
            <li>
              <Link to="/musteriler">Veresiye Defteri</Link>'nden müşterileri ekleyin; kâğıt defterdeki bakiyeleri Excel şablonuyla aktarın.
            </li>
            <li>
              Mal geldiğinde <Link to="/irsaliye">Stok Girişi</Link>'nden irsaliyenin fotoğrafını çekin.
            </li>
          </ol>
        </div>
      )}
      <div className="kutular">
        <Kutu etiket="Toplam alacak" deger={tl(veri.toplam.alacak)} />
        <Kutu etiket="Vadesi geçen" deger={tl(veri.toplam.gecen)} ton={veri.toplam.gecen > 0 ? 'kirmizi' : undefined} />
        <Kutu etiket="7 gün içinde vadesi dolacak" deger={tl(veri.toplam.hafta)} ton="sari" />
        <Kutu etiket="Bu ay tahsilat" deger={tl(veri.toplam.buAyTahsilat)} ton="yesil" alt={`Bu ay veresiye: ${tl(veri.toplam.buAySatis)}`} />
      </div>

      <div className="iki-sutun">
        <section className="kart">
          <h2>Vadesi geçenler</h2>
          {veri.gecikenler.length === 0 ? (
            <p className="soluk">Vadesi geçen borç yok.</p>
          ) : (
            <table className="tablo">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th className="sag">Geciken</th>
                  <th className="sag">Gün</th>
                </tr>
              </thead>
              <tbody>
                {veri.gecikenler.map(({ m, o }) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/musteri/${m.id}`}>{m.ad}</Link>
                    </td>
                    <td className="sag kirmizi-yazi">{tl(o!.vadesiGecen)}</td>
                    <td className="sag">{o!.enEskiGecikme}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="kart">
          <h2>En çok borçlu</h2>
          {veri.enBorclu.length === 0 ? (
            <p className="soluk">Açık borç yok.</p>
          ) : (
            <table className="tablo">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th className="sag">Bakiye</th>
                  <th className="sag">Son ödeme</th>
                </tr>
              </thead>
              <tbody>
                {veri.enBorclu.map(({ m, o }) => (
                  <tr key={m.id}>
                    <td>
                      <Link to={`/musteri/${m.id}`}>{m.ad}</Link>
                    </td>
                    <td className="sag">{tl(o!.bakiye)}</td>
                    <td className="sag soluk">{tarihYaz(o!.sonOdeme)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      {veri.azalan.length > 0 && (
        <section className="kart">
          <h2>Stoğu azalan ürünler</h2>
          <table className="tablo">
            <tbody>
              {veri.azalan.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/urun/${u.id}`}>{u.ad}</Link>
                  </td>
                  <td className="sag kirmizi-yazi">
                    {u.stok} {u.birim}
                  </td>
                  <td className="sag soluk">min {u.minStok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
