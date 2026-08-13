import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Eye, FileCode, Home, ShoppingBag, Star } from 'lucide-react'
import { Thumbnail } from '@/components/product/Thumbnail'
import { ProductPageActions } from '@/components/product/ProductPageActions'
import { absoluteAssetUrl, getPublishedProduct, metaDescription, plainText, productUrl, siteUrl } from '@/lib/product-seo'

interface ProductPageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 300

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params
  const product = await getPublishedProduct(id)

  if (!product) {
    return {
      title: 'Không tìm thấy sản phẩm',
      robots: { index: false, follow: false },
    }
  }

  const canonical = productUrl(product.id)
  const description = metaDescription(
    product.description,
    `${product.title} — ${product.format} dành cho REAPER, cung cấp bởi ${product.seller.name || 'RealS'}.`,
  )
  const image = absoluteAssetUrl(product.thumbnail)

  return {
    title: product.title,
    description,
    keywords: [
      product.title,
      product.format,
      product.categorySlug,
      'REAPER',
      'audio plugin',
      ...product.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    ],
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title: product.title,
      description,
      siteName: 'RealS',
      images: image ? [{ url: image, alt: product.title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: product.title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

function productJsonLd(product: NonNullable<Awaited<ReturnType<typeof getPublishedProduct>>>) {
  const reviews = product.reviews
  const image = absoluteAssetUrl(product.thumbnail)
  const isFree = product.isFree || product.price <= 0

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${productUrl(product.id)}#product`,
    name: product.title,
    description: plainText(product.description),
    url: productUrl(product.id),
    image,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows, macOS, Linux',
    softwareRequirements: 'REAPER digital audio workstation',
    datePublished: product.createdAt.toISOString(),
    dateModified: product.updatedAt.toISOString(),
    author: {
      '@type': product.seller.isSeller ? 'Organization' : 'Person',
      name: product.seller.name || 'RealS seller',
    },
    aggregateRating: reviews.length > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)),
          bestRating: 5,
          worstRating: 1,
          ratingCount: reviews.length,
        }
      : undefined,
    offers: {
      '@type': 'Offer',
      url: productUrl(product.id),
      price: isFree ? 0 : Number(product.price.toFixed(2)),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  }
}

function breadcrumbJsonLd(productTitle: string, id: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'RealS',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: productTitle,
        item: productUrl(id),
      },
    ],
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  const product = await getPublishedProduct(id)
  if (!product) notFound()

  const isFree = product.isFree || product.price <= 0
  const tags = product.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
  const jsonLd = productJsonLd(product)
  const breadcrumbs = breadcrumbJsonLd(product.title, product.id)
  const sellerName = product.seller.name || 'RealS seller'

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-6 text-[#f1f1f1] sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, '\\u003c') }}
      />

      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-white" aria-label="RealS trang chủ">
            Real<span className="-ml-2 text-[#f5a623]">S</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[#303030] bg-[#181818] px-4 py-2 text-sm text-[#ccc] transition-colors hover:bg-[#272727] hover:text-white"
          >
            <Home className="h-4 w-4" />
            Xem tất cả sản phẩm
          </Link>
        </header>

        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-[#888]">
          <ol className="flex flex-wrap items-center gap-2">
            <li><Link href="/" className="hover:text-white">Trang chủ</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-[#ccc]" aria-current="page">{product.title}</li>
          </ol>
        </nav>

        <article className="overflow-hidden rounded-2xl border border-[#303030] bg-[#151515] shadow-2xl">
          <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.8fr)]">
            <section className="flex min-h-[280px] items-center justify-center bg-black sm:min-h-[420px] lg:min-h-[620px]">
              <Thumbnail
                src={product.thumbnail}
                alt={`${product.title} — ${product.format} cho REAPER`}
                className="h-full max-h-[760px] w-full object-contain"
                loading="eager"
              />
            </section>

            <section className="flex flex-col gap-5 p-5 sm:p-7 lg:p-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-[#f5a623]/15 px-3 py-1 text-xs font-semibold text-[#f5a623]">
                  {product.categorySlug}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#3ea6ff]/10 px-3 py-1 text-xs text-[#3ea6ff]">
                  <FileCode className="h-3.5 w-3.5" />
                  {product.format}
                </span>
              </div>

              <div>
                <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">{product.title}</h1>
                <div className="mt-3 flex items-center gap-2 text-sm text-[#aaa]">
                  <span>{sellerName}</span>
                  <BadgeCheck className="h-4 w-4 text-[#3ea6ff]" aria-label="Người bán đã xác minh" />
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-[#303030] py-4 text-sm text-[#aaa]">
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-[#f5a623] text-[#f5a623]" />
                  <strong className="text-white">{product.rating.toFixed(1)}</strong>/5
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  {product.views.toLocaleString('vi-VN')} lượt xem
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-4 w-4" />
                  {product.sales.toLocaleString('vi-VN')} lượt tải/bán
                </span>
              </div>

              <div>
                <p className="text-sm text-[#aaa]">Giá</p>
                <p className={`mt-1 text-3xl font-bold ${isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}`}>
                  {isFree ? 'MIỄN PHÍ' : `$${product.price.toFixed(2)}`}
                </p>
              </div>

              <ProductPageActions
                productId={product.id}
                productTitle={product.title}
                isFree={isFree}
              />

              <div>
                <h2 className="mb-2 text-base font-semibold text-white">Mô tả sản phẩm</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-[#ccc]">{product.description}</p>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Thẻ sản phẩm">
                  {tags.map((tag) => (
                    <span key={tag} className="rounded border border-[#303030] bg-[#1f1f1f] px-2.5 py-1 text-xs text-[#aaa]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        </article>
      </div>
    </main>
  )
}
