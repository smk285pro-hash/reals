'use client'

import { Github, Twitter, Youtube, Mail } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#303030] bg-[#0f0f0f] px-6 py-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div>
            <h3 className="mb-3 text-lg font-bold text-white">
              Real<span className="text-[#f5a623]">S</span>
            </h3>
            <p className="text-sm leading-relaxed text-[#888]">
              Marketplace #1 cho plugin, script và extension dành cho REAPER DAW.
              Chất lượng cao, giá hợp lý.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">Marketplace</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">Tất cả sản phẩm</a></li>
              <li><a href="#" className="hover:text-white">Miễn phí</a></li>
              <li><a href="#" className="hover:text-white">Bán chạy</a></li>
              <li><a href="#" className="hover:text-white">Mới nhất</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">Hỗ trợ</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">Hướng dẫn cài đặt</a></li>
              <li><a href="#" className="hover:text-white">FAQ</a></li>
              <li><a href="#" className="hover:text-white">Liên hệ</a></li>
              <li><a href="#" className="hover:text-white">Chính sách hoàn tiền</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[#f1f1f1]">For Sellers</h4>
            <ul className="space-y-2 text-sm text-[#888]">
              <li><a href="#" className="hover:text-white">Đăng bán sản phẩm</a></li>
              <li><a href="#" className="hover:text-white">Seller Dashboard</a></li>
              <li><a href="#" className="hover:text-white">Hướng dẫn phát triển</a></li>
              <li><a href="#" className="hover:text-white">API Documentation</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#303030] pt-6 md:flex-row">
          <p className="text-xs text-[#666]">
            © 2025 RealS. All rights reserved.
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
