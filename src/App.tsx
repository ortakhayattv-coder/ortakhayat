import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useOturum } from './lib/oturum'
import Giris from './pages/Giris'
import Panel from './pages/Panel'
import BarkodSorgu from './pages/BarkodSorgu'
import Urunler from './pages/Urunler'
import UrunDuzenle from './pages/UrunDuzenle'
import Musteriler from './pages/Musteriler'
import MusteriDetay from './pages/MusteriDetay'
import VeresiyeSatis from './pages/VeresiyeSatis'
import Irsaliyeler from './pages/Irsaliyeler'
import IrsaliyeDetay from './pages/IrsaliyeDetay'
import Ayarlar from './pages/Ayarlar'
import { Ekstre, Fis } from './pages/Belgeler'
import { HataSiniri } from './components/HataSiniri'

const MENU = [
  { yol: '/', ad: 'Panel', ikon: '🏠' },
  { yol: '/sorgu', ad: 'Barkod Sorgu', ikon: '🔍' },
  { yol: '/satis', ad: 'Veresiye Satış', ikon: '🧾' },
  { yol: '/musteriler', ad: 'Veresiye Defteri', ikon: '📒' },
  { yol: '/urunler', ad: 'Ürünler', ikon: '📦' },
  { yol: '/irsaliye', ad: 'Stok Girişi', ikon: '🚚' },
  { yol: '/ayarlar', ad: 'Ayarlar', ikon: '⚙️' },
]

export default function App() {
  const { kullanici, cikisYap } = useOturum()
  if (!kullanici) return <Giris />
  return (
    <HashRouter>
      <Routes>
        <Route path="/ekstre/:id" element={<Ekstre />} />
        <Route path="/fis/:id" element={<Fis />} />
        <Route
          path="*"
          element={
            <div className="duzen">
              <nav className="menu">
                <div className="logo">Ortak Hayat</div>
                {MENU.map((m) => (
                  <NavLink key={m.yol} to={m.yol} end={m.yol === '/'} className="menu-oge">
                    <span aria-hidden>{m.ikon}</span>
                    <span className="menu-ad">{m.ad}</span>
                  </NavLink>
                ))}
                <div className="menu-alt">
                  <span className="soluk kucuk">{kullanici.ad}</span>
                  <button className="btn bag" onClick={cikisYap}>
                    Çıkış
                  </button>
                </div>
              </nav>
              <main className="icerik">
                <HataSiniri>
                <Routes>
                  <Route path="/" element={<Panel />} />
                  <Route path="/sorgu" element={<BarkodSorgu />} />
                  <Route path="/satis" element={<VeresiyeSatis />} />
                  <Route path="/satis/:musteriId" element={<VeresiyeSatis />} />
                  <Route path="/musteriler" element={<Musteriler />} />
                  <Route path="/musteri/:id" element={<MusteriDetay />} />
                  <Route path="/urunler" element={<Urunler />} />
                  <Route path="/urun/:id" element={<UrunDuzenle />} />
                  <Route path="/irsaliye" element={<Irsaliyeler />} />
                  <Route path="/irsaliye/:id" element={<IrsaliyeDetay />} />
                  <Route path="/ayarlar" element={<Ayarlar />} />
                </Routes>
                </HataSiniri>
              </main>
            </div>
          }
        />
      </Routes>
    </HashRouter>
  )
}
