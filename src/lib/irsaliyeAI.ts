import Anthropic from '@anthropic-ai/sdk'
import { blobBase64, gorselKucult } from './gorsel'

export interface OkunanIrsaliye {
  tedarikci: string
  irsaliyeNo: string
  tarih: string
  kalemler: { ad: string; kod: string; miktar: number; birim: string }[]
  notlar: string
}

const SEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tedarikci', 'irsaliyeNo', 'tarih', 'kalemler', 'notlar'],
  properties: {
    tedarikci: { type: 'string', description: 'Malı gönderen firmanın adı' },
    irsaliyeNo: { type: 'string', description: 'İrsaliye seri/sıra numarası, yoksa boş' },
    tarih: { type: 'string', description: 'YYYY-MM-DD, okunamazsa boş' },
    kalemler: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ad', 'kod', 'miktar', 'birim'],
        properties: {
          ad: { type: 'string', description: 'Ürün adı/açıklaması, irsaliyede yazdığı gibi' },
          kod: { type: 'string', description: 'Ürün kodu veya barkod, yoksa boş' },
          miktar: { type: 'number' },
          birim: { type: 'string', description: 'adet, metre, kutu, paket, top, kg vb.' },
        },
      },
    },
    notlar: { type: 'string', description: 'Okunamayan veya emin olunamayan yerler hakkında kısa not' },
  },
} as const

const TALIMAT = `Bu fotoğraflar bir elektrik malzemeleri dükkânına gelen Türkçe sevk irsaliyesine ait.
İrsaliyedeki her ürün satırını çıkar. Kurallar:
- Ürün adını irsaliyede yazdığı gibi yaz, düzeltme veya tahmin yapma.
- Miktarı sayı olarak ver (Türkçe ondalık virgülü noktaya çevir: "2,5" -> 2.5).
- Birimi küçük harfle yaz (AD/ADET -> adet, MT/M -> metre, KT/KUTU -> kutu, PK -> paket, TOP -> top).
- Ara toplam, KDV, toplam gibi satırlar ürün değildir, alma.
- Okuyamadığın veya emin olmadığın satırları "notlar" alanında belirt.`

export async function irsaliyeOku(fotolar: Blob[], apiAnahtari: string): Promise<OkunanIrsaliye> {
  if (!apiAnahtari) throw new Error('Ayarlar sayfasından yapay zekâ API anahtarını girin.')
  const client = new Anthropic({ apiKey: apiAnahtari, dangerouslyAllowBrowser: true })

  const gorseller = await Promise.all(
    fotolar.map(async (f) => {
      const kucuk = await gorselKucult(f, 2000, 0.9)
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: await blobBase64(kucuk) },
      }
    }),
  )

  const yanit = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SEMA } },
    messages: [{ role: 'user', content: [...gorseller, { type: 'text', text: TALIMAT }] }],
  })

  if (yanit.stop_reason === 'refusal') throw new Error('Yapay zekâ bu görseli işlemedi. Lütfen satırları elle girin.')
  if (yanit.stop_reason === 'max_tokens') throw new Error('İrsaliye çok uzun; sayfaları ayrı ayrı okutun.')
  const metin = yanit.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    return JSON.parse(metin) as OkunanIrsaliye
  } catch {
    throw new Error('Yapay zekâ yanıtı okunamadı, tekrar deneyin.')
  }
}

export function apiHatasiMetni(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'API anahtarı geçersiz. Ayarlar sayfasından kontrol edin.'
  if (e instanceof Anthropic.RateLimitError) return 'Çok fazla istek gönderildi, biraz sonra tekrar deneyin.'
  if (e instanceof Anthropic.APIConnectionError) return 'İnternet bağlantısı kurulamadı.'
  if (e instanceof Anthropic.APIError) return `Yapay zekâ hatası (${e.status}): ${e.message}`
  return e instanceof Error ? e.message : String(e)
}
