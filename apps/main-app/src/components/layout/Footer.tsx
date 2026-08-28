'use client'

import { Github, Twitter, Youtube, Mail } from 'lucide-react'
import { useI18n } from '@/components/providers/I18nProvider'
import { useAppStore } from '@/stores'
import Link from 'next/link'

export function Footer() {
  const { t } = useI18n()
  const { setSellerApplyModalOpen } = useAppStore()
  return (
    <footer className="mt-auto border-t border-[#303030] bg-[#0f0f0f] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div>
            <h3 className="mb-3 text-lg font-bold text-white">
              Real<span className="text-[#f5a623]">S</span>
            </h3>
            <p className="text-sm leading-relaxed text-[#888]">
              {t('marketplaceAbout')}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">{t('marketplace')}</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><Link href="/products" className="hover:text-white">{t('allProducts')}</Link></li>
              <li><Link href="/products" className="hover:text-white">{t('free')}</Link></li>
              <li><Link href="/products" className="hover:text-white">{t('bestSelling')}</Link></li>
              <li><Link href="/products" className="hover:text-white">{t('latest')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">{t('support')}</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">{t('installGuide')}</a></li>
              <li><a href="#" className="hover:text-white">FAQ</a></li>
              <li><a href="#" className="hover:text-white">{t('contact')}</a></li>
              <li><a href="#" className="hover:text-white">{t('refundPolicy')}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">{t('forSellers')}</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><button type="button" onClick={() => setSellerApplyModalOpen(true)} className="hover:text-white">{t('sellProduct')}</button></li>
              <li><a href="#" className="hover:text-white">{t('sellerDashboard')}</a></li>
              <li><a href="#" className="hover:text-white">{t('developerGuide')}</a></li>
              <li><a href="#" className="hover:text-white">{t('apiDocs')}</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#303030] pt-6 md:flex-row">
          <p className="text-xs text-[#666]">
            © 2025 RealS. {t('rights')}
          </p>
          <div className="flex gap-4">
            <a href="#" className="text-[#888] hover:text-white">
              <Github className="h-4 w-4" />
            </a>
            <a href="#" className="text-[#888] hover:text-white">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="#" className="text-[#888] hover:text-white">
              <Youtube className="h-4 w-4" />
            </a>
            <a href="#" className="text-[#888] hover:text-white">
              <Mail className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
