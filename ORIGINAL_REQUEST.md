# Original User Request

## Initial Request — 2026-08-14T01:59:39Z

Đánh giá toàn diện và tối ưu hóa chuẩn SEO Google (Technical SEO, On-page SEO, Structured Data Schema, SSR & Metadata) cho nền tảng RealS Media (Next.js 16 App Router).

Working directory: c:\Users\smk28\Desktop\reals media\reals
Integrity mode: development

## Requirements

### R1. Technical SEO & Rendering Optimization
- Chuyển đổi hoặc bổ sung SSR/RSC (Server-Side Rendering) cho trang chủ (`src/app/page.tsx`) thay vì 100% Client-side Rendering (`'use client'`), đảm bảo bot Google nhận được HTML đầy đủ gồm thẻ `<h1>`, mô tả và danh sách sản phẩm nổi bật ngay trong lần tải đầu tiên.
- Đảm bảo cơ chế chuyển hướng locale (i18n) trong middleware thân thiện với Googlebot (xử lý redirect 308 hoặc 302 thay vì 307 cho bot, giữ nguyên x-default).

### R2. On-Page SEO & Content Semantics
- Tối ưu thẻ Heading hierarchy (đảm bảo mỗi trang có duy nhất 1 thẻ `<h1>` chứa từ khóa mục tiêu, các section dùng `<h2>`, `<h3>` chuẩn).
- Tối ưu thuộc tính `alt` của hình ảnh đa ngôn ngữ (tránh hardcode tiếng Việt ở các ngôn ngữ khác).
- Cung cấp thẻ meta canonical, keywords, OpenGraph và Twitter Card hoàn chỉnh trên mọi route.

### R3. Structured Data (Schema.org / JSON-LD)
- Cập nhật schema `Organization`, `WebSite`, `Product`, `SoftwareApplication`, `BreadcrumbList`, `CollectionPage` theo đúng chuẩn Google Rich Results Guidelines.
- Sửa lỗi trạng thái `offers.availability` (chuyển từ `PreOrder` sang `InStock` cho sản phẩm số tải ngay), định dạng logo chuẩn (PNG/WebP).

### R4. Indexability & Sitemaps
- Kiểm tra và đảm bảo `sitemap.ts` và `robots.txt` không chặn nhầm tài nguyên CSS/JS/images mà Googlebot cần để render trang.

## Acceptance Criteria

### Technical SEO & SSR
- [ ] Trang chủ trả về HTML server-side có chứa thẻ `<h1>`, heading tags và danh sách sản phẩm mẫu khi curl hoặc tắt JavaScript.
- [ ] Googlebot crawler giả lập nhận được mã HTTP 200 / redirect đúng chuẩn không bị loop.

### Schema Validation
- [ ] Toàn bộ JSON-LD trên trang chủ, `/products` và `/products/[id]` vượt qua kiểm tra cấu trúc của Google Rich Results Test (không có lỗi cú pháp hoặc thiếu trường bắt buộc).

### Meta & Localization
- [ ] Tất cả 11 ngôn ngữ (`vi`, `en`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `th`, `ru`) đều có canonical và hreflang tags tương ứng chính xác.
