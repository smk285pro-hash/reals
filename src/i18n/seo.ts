import type { Metadata } from 'next'
import { defaultLocale, locales, type Locale } from './config'

export const siteUrl = 'https://reals.media'
export const siteName = 'RealS'
export const openGraphImage = `${siteUrl}/opengraph-image`

export const localeTags: Record<Locale, string> = {
  vi: 'vi_VN',
  en: 'en_US',
  zh: 'zh_CN',
  ja: 'ja_JP',
  ko: 'ko_KR',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  pt: 'pt_BR',
  th: 'th_TH',
  ru: 'ru_RU',
}

interface SeoCopy {
  homeTitle: string
  homeDescription: string
  productsTitle: string
  productsHeading: string
  productsDescription: string
  productsEmpty: string
  home: string
  products: string
  backHome: string
  price: string
  description: string
  verifiedSeller: string
  views: string
  sales: string
  free: string
  user: string
  seller: string
  notFound: string
}

const en: SeoCopy = {
  homeTitle: 'RealS — REAPER Plugins & Scripts Marketplace',
  homeDescription: 'Discover professional plugins, JSFX, ReaScript, extensions and templates built for the REAPER digital audio workstation.',
  productsTitle: 'REAPER Products',
  productsHeading: 'Products for REAPER',
  productsDescription: 'Browse approved plugins, JSFX, ReaScript, extensions and templates for REAPER on RealS.',
  productsEmpty: 'No public products are available yet.',
  home: 'Home', products: 'Products', backHome: 'Back to home', price: 'Price', description: 'Product description',
  verifiedSeller: 'Verified seller', views: 'views', sales: 'downloads/sales', free: 'FREE', user: 'RealS user', seller: 'RealS seller', notFound: 'Product not found',
}

const copies: Record<Locale, SeoCopy> = {
  en,
  vi: {
    homeTitle: 'RealS — Chợ Plugin & Script cho REAPER',
    homeDescription: 'Khám phá plugin, JSFX, ReaScript, extension và template chuyên nghiệp dành cho phần mềm REAPER.',
    productsTitle: 'Sản phẩm REAPER', productsHeading: 'Sản phẩm dành cho REAPER',
    productsDescription: 'Plugin, JSFX, ReaScript, extension và template đã được duyệt trên RealS.', productsEmpty: 'Chưa có sản phẩm công khai.',
    home: 'Trang chủ', products: 'Sản phẩm', backHome: 'Về trang chủ', price: 'Giá', description: 'Mô tả sản phẩm',
    verifiedSeller: 'Người bán đã xác minh', views: 'lượt xem', sales: 'lượt tải/bán', free: 'MIỄN PHÍ', user: 'Người dùng RealS', seller: 'Người bán RealS', notFound: 'Không tìm thấy sản phẩm',
  },
  zh: { ...en, homeTitle: 'RealS — REAPER 插件与脚本市场', homeDescription: '探索专为 REAPER 制作的专业插件、JSFX、ReaScript、扩展和模板。', productsTitle: 'REAPER 产品', productsHeading: 'REAPER 产品', productsDescription: '在 RealS 浏览经过审核的 REAPER 插件、JSFX、ReaScript、扩展和模板。', productsEmpty: '暂无公开产品。', home: '首页', products: '产品', backHome: '返回首页', price: '价格', description: '产品说明', verifiedSeller: '认证卖家', views: '次浏览', sales: '次下载/销售', free: '免费', user: 'RealS 用户', seller: 'RealS 卖家', notFound: '未找到产品' },
  ja: { ...en, homeTitle: 'RealS — REAPERプラグイン＆スクリプトマーケット', homeDescription: 'REAPER向けのプロ仕様プラグイン、JSFX、ReaScript、拡張機能、テンプレートを探せます。', productsTitle: 'REAPER製品', productsHeading: 'REAPER向け製品', productsDescription: 'RealSで承認済みのREAPERプラグイン、JSFX、ReaScript、拡張機能、テンプレートを閲覧できます。', productsEmpty: '公開製品はまだありません。', home: 'ホーム', products: '製品', backHome: 'ホームへ戻る', price: '価格', description: '製品説明', verifiedSeller: '認証済み販売者', views: '回閲覧', sales: 'ダウンロード/販売', free: '無料', user: 'RealSユーザー', seller: 'RealS販売者', notFound: '製品が見つかりません' },
  ko: { ...en, homeTitle: 'RealS — REAPER 플러그인 및 스크립트 마켓', homeDescription: 'REAPER용 전문 플러그인, JSFX, ReaScript, 확장 프로그램과 템플릿을 만나보세요.', productsTitle: 'REAPER 제품', productsHeading: 'REAPER용 제품', productsDescription: 'RealS에서 승인된 REAPER 플러그인, JSFX, ReaScript, 확장 프로그램과 템플릿을 둘러보세요.', productsEmpty: '아직 공개 제품이 없습니다.', home: '홈', products: '제품', backHome: '홈으로', price: '가격', description: '제품 설명', verifiedSeller: '인증 판매자', views: '조회', sales: '다운로드/판매', free: '무료', user: 'RealS 사용자', seller: 'RealS 판매자', notFound: '제품을 찾을 수 없습니다' },
  es: { ...en, homeTitle: 'RealS — Mercado de plugins y scripts para REAPER', homeDescription: 'Descubre plugins, JSFX, ReaScript, extensiones y plantillas profesionales para REAPER.', productsTitle: 'Productos para REAPER', productsHeading: 'Productos para REAPER', productsDescription: 'Explora plugins, JSFX, ReaScript, extensiones y plantillas aprobados para REAPER en RealS.', productsEmpty: 'Todavía no hay productos públicos.', home: 'Inicio', products: 'Productos', backHome: 'Volver al inicio', price: 'Precio', description: 'Descripción del producto', verifiedSeller: 'Vendedor verificado', views: 'visualizaciones', sales: 'descargas/ventas', free: 'GRATIS', user: 'Usuario de RealS', seller: 'Vendedor de RealS', notFound: 'Producto no encontrado' },
  fr: { ...en, homeTitle: 'RealS — Marketplace de plugins et scripts REAPER', homeDescription: 'Découvrez des plugins, JSFX, ReaScript, extensions et modèles professionnels pour REAPER.', productsTitle: 'Produits REAPER', productsHeading: 'Produits pour REAPER', productsDescription: 'Parcourez les plugins, JSFX, ReaScript, extensions et modèles REAPER approuvés sur RealS.', productsEmpty: 'Aucun produit public pour le moment.', home: 'Accueil', products: 'Produits', backHome: "Retour à l'accueil", price: 'Prix', description: 'Description du produit', verifiedSeller: 'Vendeur vérifié', views: 'vues', sales: 'téléchargements/ventes', free: 'GRATUIT', user: 'Utilisateur RealS', seller: 'Vendeur RealS', notFound: 'Produit introuvable' },
  de: { ...en, homeTitle: 'RealS — Marktplatz für REAPER-Plugins und Scripts', homeDescription: 'Entdecke professionelle Plugins, JSFX, ReaScript, Erweiterungen und Vorlagen für REAPER.', productsTitle: 'REAPER-Produkte', productsHeading: 'Produkte für REAPER', productsDescription: 'Entdecke geprüfte REAPER-Plugins, JSFX, ReaScript, Erweiterungen und Vorlagen auf RealS.', productsEmpty: 'Noch keine öffentlichen Produkte verfügbar.', home: 'Startseite', products: 'Produkte', backHome: 'Zur Startseite', price: 'Preis', description: 'Produktbeschreibung', verifiedSeller: 'Verifizierter Verkäufer', views: 'Aufrufe', sales: 'Downloads/Verkäufe', free: 'KOSTENLOS', user: 'RealS-Nutzer', seller: 'RealS-Verkäufer', notFound: 'Produkt nicht gefunden' },
  pt: { ...en, homeTitle: 'RealS — Marketplace de plugins e scripts para REAPER', homeDescription: 'Descubra plugins, JSFX, ReaScript, extensões e modelos profissionais para REAPER.', productsTitle: 'Produtos REAPER', productsHeading: 'Produtos para REAPER', productsDescription: 'Explore plugins, JSFX, ReaScript, extensões e modelos aprovados para REAPER na RealS.', productsEmpty: 'Ainda não há produtos públicos.', home: 'Início', products: 'Produtos', backHome: 'Voltar ao início', price: 'Preço', description: 'Descrição do produto', verifiedSeller: 'Vendedor verificado', views: 'visualizações', sales: 'downloads/vendas', free: 'GRÁTIS', user: 'Usuário RealS', seller: 'Vendedor RealS', notFound: 'Produto não encontrado' },
  th: { ...en, homeTitle: 'RealS — มาร์เก็ตปลั๊กอินและสคริปต์สำหรับ REAPER', homeDescription: 'ค้นพบปลั๊กอิน JSFX, ReaScript, ส่วนขยาย และเทมเพลตระดับมืออาชีพสำหรับ REAPER', productsTitle: 'ผลิตภัณฑ์ REAPER', productsHeading: 'ผลิตภัณฑ์สำหรับ REAPER', productsDescription: 'เลือกดูปลั๊กอิน JSFX, ReaScript, ส่วนขยาย และเทมเพลต REAPER ที่ผ่านการตรวจสอบบน RealS', productsEmpty: 'ยังไม่มีผลิตภัณฑ์สาธารณะ', home: 'หน้าแรก', products: 'ผลิตภัณฑ์', backHome: 'กลับหน้าแรก', price: 'ราคา', description: 'รายละเอียดผลิตภัณฑ์', verifiedSeller: 'ผู้ขายยืนยันแล้ว', views: 'ครั้งที่ดู', sales: 'ดาวน์โหลด/ขาย', free: 'ฟรี', user: 'ผู้ใช้ RealS', seller: 'ผู้ขาย RealS', notFound: 'ไม่พบผลิตภัณฑ์' },
  ru: { ...en, homeTitle: 'RealS — Маркетплейс плагинов и скриптов для REAPER', homeDescription: 'Профессиональные плагины, JSFX, ReaScript, расширения и шаблоны для REAPER.', productsTitle: 'Продукты REAPER', productsHeading: 'Продукты для REAPER', productsDescription: 'Проверенные плагины, JSFX, ReaScript, расширения и шаблоны REAPER на RealS.', productsEmpty: 'Публичных товаров пока нет.', home: 'Главная', products: 'Товары', backHome: 'На главную', price: 'Цена', description: 'Описание продукта', verifiedSeller: 'Проверенный продавец', views: 'просмотров', sales: 'загрузок/продаж', free: 'БЕСПЛАТНО', user: 'Пользователь RealS', seller: 'Продавец RealS', notFound: 'Товар не найден' },
}

export function seoCopy(locale: Locale): SeoCopy {
  return copies[locale] || copies[defaultLocale]
}

export function localizedUrl(locale: Locale, pathname = '/'): string {
  const normalized = pathname === '/' ? '' : `/${pathname.replace(/^\/+|\/+$/g, '')}`
  return `${siteUrl}/${locale}${normalized}`
}

export function languageAlternates(pathname = '/'): Record<string, string> {
  const languages: Record<string, string> = Object.fromEntries(
    locales.map((locale) => [locale, localizedUrl(locale, pathname)]),
  )
  languages['x-default'] = localizedUrl(defaultLocale, pathname)
  return languages
}

export function localizedAlternates(locale: Locale, pathname = '/'): Metadata['alternates'] {
  return {
    canonical: localizedUrl(locale, pathname),
    languages: languageAlternates(pathname),
  }
}

export function alternateLocaleTags(locale: Locale): string[] {
  return locales.filter((item) => item !== locale).map((item) => localeTags[item])
}
