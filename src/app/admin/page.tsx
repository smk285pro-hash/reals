'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Users, Package, DollarSign, Clock, CheckCircle, XCircle,
  Search, ArrowLeft, Shield, Eye, EyeOff,
  Star, Trash2, UserCheck, TrendingUp, AlertCircle,
  Flag, BarChart3, Ban, MessageSquare, ExternalLink,
  ChevronDown, AlertTriangle, FileWarning
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores'
import { toast } from 'sonner'

type Tab = 'overview' | 'products' | 'users' | 'reports' | 'analytics'

interface Stats {
  totalUsers: number; totalSellers: number; totalProducts: number
  publishedProducts: number; pendingProducts: number; totalRevenue: number
}

interface AdminUser {
  id: string; name: string | null; email: string; role: string
  isSeller: boolean; avatar: string | null; createdAt: string
  _count: { products: number; reviews: number }
}

interface AdminProduct {
  id: string; title: string; price: number; isFree: boolean
  published: boolean; reviewStatus: string; reviewNote: string | null
  createdAt: string; seller: { name: string | null; email: string }
}

interface ReportItem {
  id: string; type: string; targetId: string; reason: string
  description: string | null; status: string; adminNote: string | null
  createdAt: string; updatedAt: string
  reporter: { id: string; name: string | null; email: string; avatar: string | null }
  target: any
}

interface AnalyticsData {
  range: string
  usersByRole: { role: string; _count: number }[]
  newUsers: number
  productsByStatus: { reviewStatus: string; _count: number }[]
  productsByCategory: { categorySlug: string; _count: number }[]
  topSellers: any[]
  topProducts: any[]
  reportsByStatus: { status: string; _count: number }[]
  reportsByType: { type: string; _count: number }[]
  revenueByFormat: { format: string; _sum: { price: number | null; sales: number | null }; _count: number }[]
  recentActivity: any[]
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-[#888]">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  )
}

const tabLabels: Record<Tab, string> = {
  overview: 'Tổng quan',
  products: 'Sản phẩm',
  users: 'User',
  reports: 'Báo cáo',
  analytics: 'Analytics',
}

export default function AdminDashboard() {
  const { setActiveCategory } = useAppStore()
  const { status: authStatus, data: session } = useSession()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [reports, setReports] = useState<ReportItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [productFilter, setProductFilter] = useState('ALL')
  const [reportFilter, setReportFilter] = useState('PENDING')
  const [analyticsRange, setAnalyticsRange] = useState('30d')

  const userRole = (session?.user as any)?.role

  // Fetch data
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats')
      if (res.ok) setStats(await res.json())
    } catch {}
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?search=${searchQ}&limit=50`)
      if (res.ok) { const data = await res.json(); setUsers(data.users || []) }
    } catch {} finally { setLoading(false) }
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/products?status=${productFilter}&search=${searchQ}&limit=50`)
      if (res.ok) { const data = await res.json(); setProducts(data.products || []) }
    } catch {} finally { setLoading(false) }
  }

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/reports?status=${reportFilter}&limit=50`)
      if (res.ok) { const data = await res.json(); setReports(data.reports || []) }
    } catch {} finally { setLoading(false) }
  }

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics?range=${analyticsRange}`)
      if (res.ok) setAnalytics(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { if (userRole === 'ADMIN') fetchStats() }, [userRole])
  useEffect(() => { if (tab === 'users' && userRole === 'ADMIN') fetchUsers() }, [tab, userRole])
  useEffect(() => { if (tab === 'products' && userRole === 'ADMIN') fetchProducts() }, [tab, productFilter, userRole])
  useEffect(() => { if (tab === 'reports' && userRole === 'ADMIN') fetchReports() }, [tab, reportFilter, userRole])
  useEffect(() => { if (tab === 'analytics' && userRole === 'ADMIN') fetchAnalytics() }, [tab, analyticsRange, userRole])

  // Auth guard
  if (authStatus === 'loading') {
    return <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]"><Skeleton className="h-20 w-40" /></div>
  }
  if (authStatus === 'unauthenticated' || userRole !== 'ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f]">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#303030] bg-[#181818] p-12">
          <Shield className="h-16 w-16 text-red-500" />
          <h2 className="text-xl font-bold text-white">403 - Access Denied</h2>
          <p className="text-sm text-[#888]">Bạn không có quyền truy cập trang này</p>
          <Button className="bg-[#f5a623] text-black hover:bg-[#e09515]" onClick={() => setActiveCategory('all')}>
            Về trang chủ
          </Button>
        </div>
      </div>
    )
  }

  // Actions
  const updateRole = async (id: string, role: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      })
      if (res.ok) { toast.success(`Đã cập nhật role thành ${role}`); fetchUsers() }
      else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const deleteUser = async (id: string) => {
    if (!confirm('Xóa user này? Hành động không thể hoàn tác.')) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) { toast.success('Đã xóa user'); fetchUsers() }
      else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const reviewProduct = async (id: string, reviewStatus: string, reviewNote?: string) => {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reviewStatus, reviewNote }),
      })
      if (res.ok) { toast.success(reviewStatus === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'); fetchProducts(); fetchStats() }
      else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('Xóa sản phẩm này?')) return
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) { toast.success('Đã xóa'); fetchProducts(); fetchStats() }
      else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const togglePublish = async (id: string, published: boolean) => {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, published }),
      })
      if (res.ok) { toast.success(published ? 'Đã ẩn' : 'Đã đăng'); fetchProducts() }
      else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const handleReport = async (id: string, status: string, adminNote?: string, actionType?: string) => {
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, adminNote, actionType }),
      })
      if (res.ok) {
        toast.success(status === 'ACTIONED' ? 'Đã xử lý' : status === 'DISMISSED' ? 'Đã bỏ qua' : 'Đã đánh dấu')
        fetchReports(); fetchStats()
      } else { const e = await res.json(); toast.error(e.error || 'Lỗi') }
    } catch { toast.error('Lỗi kết nối') }
  }

  const roleColor: Record<string, string> = {
    ADMIN: 'bg-red-500/20 text-red-400',
    SELLER: 'bg-[#f5a623]/20 text-[#f5a623]',
    USER: 'bg-[#3ea6ff]/20 text-[#3ea6ff]',
  }

  const reviewColor: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    APPROVED: 'bg-[#3fb950]/20 text-[#3fb950]',
    REJECTED: 'bg-red-500/20 text-red-400',
  }

  const reportStatusColor: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    REVIEWED: 'bg-[#3ea6ff]/20 text-[#3ea6ff]',
    DISMISSED: 'bg-[#888]/20 text-[#888]',
    ACTIONED: 'bg-[#3fb950]/20 text-[#3fb950]',
  }

  const reasonLabel: Record<string, string> = {
    SPAM: 'Spam',
    INAPPROPRIATE: 'Không phù hợp',
    COPYRIGHT: 'Vi phạm bản quyền',
    OTHER: 'Khác',
  }

  const typeLabel: Record<string, string> = {
    PRODUCT: 'Sản phẩm',
    USER: 'User',
    REVIEW: 'Review',
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#f1f1f1]">
      {/* Header */}
      <div className="border-b border-[#303030] bg-[#0f0f0f] px-4 py-4 md:px-6">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="text-[#aaa] hover:bg-[#272727]" onClick={() => setActiveCategory('all')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-red-500" />
                <div>
                  <h1 className="text-lg font-bold text-white">Admin Dashboard</h1>
                  <p className="text-xs text-[#888]">Quản trị hệ thống RealS</p>
                </div>
              </div>
            </div>
            <div className="flex gap-1 rounded-lg bg-[#1f1f1f] p-1 overflow-x-auto">
              {(['overview', 'products', 'users', 'reports', 'analytics'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    tab === t ? 'bg-[#f5a623] text-black' : 'text-[#aaa] hover:text-white'
                  }`}
                  onClick={() => setTab(t)}
                >
                  {tabLabels[t]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
        {/* Overview Tab */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard icon={Users} label="Tổng User" value={stats.totalUsers} color="bg-[#3ea6ff]/20 text-[#3ea6ff]" />
              <StatCard icon={UserCheck} label="Seller" value={stats.totalSellers} color="bg-[#f5a623]/20 text-[#f5a623]" />
              <StatCard icon={Package} label="Sản phẩm" value={stats.totalProducts} color="bg-[#a855f7]/20 text-[#a855f7]" />
              <StatCard icon={CheckCircle} label="Đã đăng" value={stats.publishedProducts} color="bg-[#3fb950]/20 text-[#3fb950]" />
              <StatCard icon={Clock} label="Chờ duyệt" value={stats.pendingProducts} color="bg-yellow-500/20 text-yellow-400" />
              <StatCard icon={DollarSign} label="Tổng giá trị" value={`$${stats.totalRevenue.toFixed(2)}`} color="bg-[#3fb950]/20 text-[#3fb950]" />
            </div>
            {stats.pendingProducts > 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
                <span className="text-sm text-yellow-200">Có <strong>{stats.pendingProducts}</strong> sản phẩm đang chờ duyệt</span>
                <Button size="sm" className="ml-auto bg-yellow-500 text-black hover:bg-yellow-600" onClick={() => { setProductFilter('PENDING'); setTab('products') }}>
                  Xem ngay
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Products Tab */}
        {tab === 'products' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-[#1f1f1f] px-3 py-2">
                <Search className="h-4 w-4 text-[#888]" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Tìm sản phẩm..." className="bg-transparent text-sm text-white outline-none placeholder:text-[#666]" />
              </div>
              <div className="flex gap-1 rounded-lg bg-[#1f1f1f] p-1">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(f => (
                  <button key={f} className={`rounded-md px-3 py-1 text-xs font-medium ${productFilter === f ? 'bg-[#f5a623] text-black' : 'text-[#aaa] hover:text-white'}`} onClick={() => setProductFilter(f)}>
                    {f === 'ALL' ? 'Tất cả' : f === 'PENDING' ? 'Chờ duyệt' : f === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-16 w-full rounded-lg bg-[#1f1f1f]" />)}</div>
            ) : products.length === 0 ? (
              <div className="py-20 text-center text-[#888]">Không có sản phẩm</div>
            ) : (
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-[#f1f1f1]">{p.title}</h3>
                        <Badge className={reviewColor[p.reviewStatus] || ''}>{p.reviewStatus}</Badge>
                        {p.featured && <Star className="h-3.5 w-3.5 fill-[#f5a623] text-[#f5a623]" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#aaa]">
                        <span>{p.seller.name || p.seller.email}</span>
                        <span>•</span>
                        <span className={p.isFree ? 'text-[#3fb950]' : 'text-[#f5a623]'}>{p.isFree ? 'FREE' : `$${p.price}`}</span>
                        <span>•</span>
                        <span>{new Date(p.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                      {p.reviewNote && <p className="text-xs text-red-400">Lý do: {p.reviewNote}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {p.reviewStatus === 'PENDING' && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-[#3fb950] hover:bg-[#3fb950]/10" onClick={() => reviewProduct(p.id, 'APPROVED')} title="Duyệt">
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-400/10" onClick={() => reviewProduct(p.id, 'REJECTED', 'Không đạt yêu cầu')} title="Từ chối">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className={`h-8 w-8 ${p.published ? 'text-[#3fb950]' : 'text-[#888]'} hover:bg-[#272727]`} onClick={() => togglePublish(p.id, p.published)} title={p.published ? 'Ẩn' : 'Đăng'}>
                        {p.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-400/10" onClick={() => deleteProduct(p.id)} title="Xóa">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-[#1f1f1f] px-3 py-2">
              <Search className="h-4 w-4 text-[#888]" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsers()} placeholder="Tìm user..." className="bg-transparent text-sm text-white outline-none placeholder:text-[#666]" />
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-16 w-full rounded-lg bg-[#1f1f1f]" />)}</div>
            ) : users.length === 0 ? (
              <div className="py-20 text-center text-[#888]">Không có user</div>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#303030] text-sm font-bold text-white">
                      {(u.name || u.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-[#f1f1f1]">{u.name || 'Chưa đặt tên'}</h3>
                        <Badge className={roleColor[u.role] || ''}>{u.role}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#aaa]">
                        <span>{u.email}</span>
                        <span>•</span>
                        <span>{u._count.products} sản phẩm</span>
                        <span>•</span>
                        <span>{u._count.reviews} review</span>
                        <span>•</span>
                        <span>{new Date(u.createdAt).toLocaleDateString('vi-VN')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <select
                        value={u.role}
                        onChange={e => updateRole(u.id, e.target.value)}
                        className="rounded-lg border border-[#303030] bg-[#0f0f0f] px-2 py-1 text-xs text-white outline-none"
                      >
                        <option value="USER">USER</option>
                        <option value="SELLER">SELLER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-400/10" onClick={() => deleteUser(u.id)} title="Xóa">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {tab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-lg bg-[#1f1f1f] p-1">
                {['PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED', 'ALL'].map(f => (
                  <button key={f} className={`rounded-md px-3 py-1 text-xs font-medium ${reportFilter === f ? 'bg-[#f5a623] text-black' : 'text-[#aaa] hover:text-white'}`} onClick={() => setReportFilter(f)}>
                    {f === 'PENDING' ? 'Chờ xử lý' : f === 'REVIEWED' ? 'Đang xem' : f === 'ACTIONED' ? 'Đã xử lý' : f === 'DISMISSED' ? 'Bỏ qua' : 'Tất cả'}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({length:5}).map((_,i) => <Skeleton key={i} className="h-20 w-full rounded-lg bg-[#1f1f1f]" />)}</div>
            ) : reports.length === 0 ? (
              <div className="py-20 text-center text-[#888]">
                <Flag className="mx-auto mb-3 h-12 w-12 text-[#303030]" />
                <p>Không có báo cáo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map(r => (
                  <div key={r.id} className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${r.type === 'PRODUCT' ? 'bg-[#a855f7]/20 text-[#a855f7]' : r.type === 'USER' ? 'bg-[#3ea6ff]/20 text-[#3ea6ff]' : 'bg-[#f5a623]/20 text-[#f5a623]'}`}>
                        {r.type === 'PRODUCT' ? <Package className="h-4 w-4" /> : r.type === 'USER' ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs border-[#303030]">{typeLabel[r.type] || r.type}</Badge>
                          <Badge className={reportStatusColor[r.status] || ''}>{r.status}</Badge>
                          <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">{reasonLabel[r.reason] || r.reason}</Badge>
                          <span className="text-xs text-[#666]">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                        {/* Target info */}
                        {r.target && (
                          <div className="rounded-lg bg-[#0f0f0f] p-2 text-xs">
                            {r.type === 'PRODUCT' && (
                              <span className="text-[#f1f1f1]">📦 {r.target.title} — by {r.target.seller?.name || 'Unknown'}</span>
                            )}
                            {r.type === 'USER' && (
                              <span className="text-[#f1f1f1]">👤 {r.target.name || r.target.email}</span>
                            )}
                            {r.type === 'REVIEW' && (
                              <span className="text-[#f1f1f1]">💬 Rating: {r.target.rating}/5 — "{r.target.comment?.slice(0, 80)}"</span>
                            )}
                          </div>
                        )}
                        {r.description && (
                          <p className="text-xs text-[#aaa]">Mô tả: {r.description}</p>
                        )}
                        <div className="text-xs text-[#666]">
                          Báo cáo bởi: {r.reporter.name || r.reporter.email}
                        </div>
                        {r.adminNote && (
                          <div className="rounded-lg bg-[#3ea6ff]/5 border border-[#3ea6ff]/20 p-2 text-xs text-[#3ea6ff]">
                            📝 Admin: {r.adminNote}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      {r.status === 'PENDING' && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-[#3ea6ff] hover:bg-[#3ea6ff]/10" onClick={() => handleReport(r.id, 'REVIEWED')}>
                            Đang xem
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[#3fb950] hover:bg-[#3fb950]/10" onClick={() => {
                            const action = r.type === 'PRODUCT' ? 'UNPUBLISH' : r.type === 'USER' ? 'BAN' : 'DELETE'
                            if (confirm(`Xử lý báo cáo này? Hành động: ${action}`)) handleReport(r.id, 'ACTIONED', undefined, action)
                          }}>
                            Xử lý
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[#888] hover:bg-[#272727]" onClick={() => handleReport(r.id, 'DISMISSED', 'Báo cáo không chính xác')}>
                            Bỏ qua
                          </Button>
                        </div>
                      )}
                      {r.status === 'REVIEWED' && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-[#3fb950] hover:bg-[#3fb950]/10" onClick={() => {
                            const action = r.type === 'PRODUCT' ? 'UNPUBLISH' : r.type === 'USER' ? 'BAN' : 'DELETE'
                            if (confirm(`Xử lý báo cáo? Hành động: ${action}`)) handleReport(r.id, 'ACTIONED', undefined, action)
                          }}>
                            Xử lý
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[#888] hover:bg-[#272727]" onClick={() => handleReport(r.id, 'DISMISSED')}>
                            Bỏ qua
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {tab === 'analytics' && (
          <div className="space-y-6">
            {/* Range selector */}
            <div className="flex gap-1 rounded-lg bg-[#1f1f1f] p-1 w-fit">
              {(['7d', '30d', '90d', 'all'] as const).map(r => (
                <button key={r} className={`rounded-md px-3 py-1.5 text-xs font-medium ${analyticsRange === r ? 'bg-[#f5a623] text-black' : 'text-[#aaa] hover:text-white'}`} onClick={() => setAnalyticsRange(r)}>
                  {r === '7d' ? '7 ngày' : r === '30d' ? '30 ngày' : r === '90d' ? '90 ngày' : 'Tất cả'}
                </button>
              ))}
            </div>

            {loading || !analytics ? (
              <div className="space-y-4">
                {Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-40 w-full rounded-xl bg-[#1f1f1f]" />)}
              </div>
            ) : (
              <>
                {/* Summary Row */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard icon={Users} label="User mới" value={analytics.newUsers} color="bg-[#3ea6ff]/20 text-[#3ea6ff]" />
                  <StatCard icon={Flag} label="Báo cáo chờ" value={analytics.reportsByStatus.find(r => r.status === 'PENDING')?._count || 0} color="bg-yellow-500/20 text-yellow-400" />
                  <StatCard icon={Package} label="Tổng sản phẩm" value={analytics.productsByStatus.reduce((s, p) => s + p._count, 0)} color="bg-[#a855f7]/20 text-[#a855f7]" />
                  <StatCard icon={TrendingUp} label="Top format" value={analytics.revenueByFormat.sort((a, b) => (b._sum.sales || 0) - (a._sum.sales || 0))[0]?.format || '-'} color="bg-[#3fb950]/20 text-[#3fb950]" />
                </div>

                {/* Two Column Charts */}
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Users by Role */}
                  <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">User theo Role</h3>
                    <div className="space-y-2">
                      {analytics.usersByRole.map(u => {
                        const max = Math.max(...analytics.usersByRole.map(x => x._count))
                        const pct = max ? (u._count / max) * 100 : 0
                        const colors: Record<string, string> = { ADMIN: '#ef4444', SELLER: '#f5a623', USER: '#3ea6ff' }
                        return (
                          <div key={u.role} className="flex items-center gap-3">
                            <span className="w-16 text-xs text-[#aaa]">{u.role}</span>
                            <div className="flex-1">
                              <div className="h-6 rounded bg-[#272727]">
                                <div className="h-6 rounded" style={{ width: `${pct}%`, backgroundColor: colors[u.role] || '#888', minWidth: '2px' }} />
                              </div>
                            </div>
                            <span className="w-10 text-right text-xs font-bold text-white">{u._count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Products by Category */}
                  <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">Sản phẩm theo Category</h3>
                    <div className="space-y-2">
                      {analytics.productsByCategory.slice(0, 8).map(c => {
                        const max = Math.max(...analytics.productsByCategory.map(x => x._count))
                        const pct = max ? (c._count / max) * 100 : 0
                        return (
                          <div key={c.categorySlug} className="flex items-center gap-3">
                            <span className="w-20 truncate text-xs text-[#aaa]">{c.categorySlug}</span>
                            <div className="flex-1">
                              <div className="h-6 rounded bg-[#272727]">
                                <div className="h-6 rounded bg-[#a855f7]" style={{ width: `${pct}%`, minWidth: '2px' }} />
                              </div>
                            </div>
                            <span className="w-10 text-right text-xs font-bold text-white">{c._count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Revenue by Format */}
                <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Doanh thu theo Format</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {analytics.revenueByFormat.map(f => (
                      <div key={f.format} className="rounded-lg bg-[#0f0f0f] p-3">
                        <p className="text-xs text-[#888]">{f.format}</p>
                        <p className="text-lg font-bold text-white">{f._count} sản phẩm</p>
                        <p className="text-sm text-[#3fb950]">${((f._sum.price || 0) * (f._sum.sales || 0)).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Two Column: Top Sellers + Top Products */}
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Top Sellers */}
                  <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">Top Seller</h3>
                    <div className="space-y-2">
                      {analytics.topSellers.map((s, i) => (
                        <div key={s.id} className="flex items-center gap-3 rounded-lg bg-[#0f0f0f] p-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f5a623] text-xs font-bold text-black">{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#f1f1f1]">{s.name || s.email}</p>
                            <p className="text-xs text-[#888]">{s.productCount} sản phẩm • {s.totalSales} sales</p>
                          </div>
                        </div>
                      ))}
                      {analytics.topSellers.length === 0 && <p className="py-4 text-center text-xs text-[#888]">Chưa có seller</p>}
                    </div>
                  </div>

                  {/* Top Products */}
                  <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                    <h3 className="mb-3 text-sm font-semibold text-white">Top sản phẩm (Sales)</h3>
                    <div className="space-y-2">
                      {analytics.topProducts.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-lg bg-[#0f0f0f] p-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#a855f7] text-xs font-bold text-white">{i + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-[#f1f1f1]">{p.title}</p>
                            <p className="text-xs text-[#888]">{p.sales} sales • {p.views} views • ⭐{p.rating}</p>
                          </div>
                          <span className="text-xs font-bold text-[#3fb950]">${p.price}</span>
                        </div>
                      ))}
                      {analytics.topProducts.length === 0 && <p className="py-4 text-center text-xs text-[#888]">Chưa có sản phẩm</p>}
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="rounded-xl border border-[#303030] bg-[#1a1a1a] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">Hoạt động gần đây</h3>
                  <div className="space-y-2">
                    {analytics.recentActivity.map((a: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-[#0f0f0f] p-2 text-xs">
                        {a.type === 'USER_REGISTER' && <><Users className="h-3.5 w-3.5 text-[#3ea6ff]" /><span className="text-[#f1f1f1]">👤 {a.name || a.email} đăng ký</span></>}
                        {a.type === 'PRODUCT_CREATED' && <><Package className="h-3.5 w-3.5 text-[#a855f7]" /><span className="text-[#f1f1f1]">📦 {a.title} by {a.seller?.name || 'Unknown'}</span></>}
                        {a.type === 'REPORT_SUBMITTED' && <><Flag className="h-3.5 w-3.5 text-yellow-400" /><span className="text-[#f1f1f1]">🚩 Báo cáo {a.reason} bởi {a.reporterName || 'Unknown'}</span></>}
                        <span className="ml-auto text-[#666]">{new Date(a.createdAt).toLocaleString('vi-VN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
