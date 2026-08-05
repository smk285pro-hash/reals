'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Users, Package, DollarSign, Clock, CheckCircle, XCircle,
  Search, ChevronDown, ArrowLeft, Shield, Eye, EyeOff,
  Star, Trash2, UserCheck, UserX, TrendingUp, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores'
import { toast } from 'sonner'

type Tab = 'overview' | 'products' | 'users'

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

export default function AdminDashboard() {
  const { setActiveCategory } = useAppStore()
  const { status: authStatus, data: session } = useSession()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [productFilter, setProductFilter] = useState('ALL')

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
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch {} finally { setLoading(false) }
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/products?status=${productFilter}&search=${searchQ}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { if (userRole === 'ADMIN') fetchStats() }, [userRole])
  useEffect(() => { if (tab === 'users' && userRole === 'ADMIN') fetchUsers() }, [tab, userRole])
  useEffect(() => { if (tab === 'products' && userRole === 'ADMIN') fetchProducts() }, [tab, productFilter, userRole])

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
                  <p className="text-xs text-[#888]">Quản trị hệ thống ReaTube</p>
                </div>
              </div>
            </div>
            <div className="flex gap-1 rounded-lg bg-[#1f1f1f] p-1">
              {(['overview', 'products', 'users'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                    tab === t ? 'bg-[#f5a623] text-black' : 'text-[#aaa] hover:text-white'
                  }`}
                  onClick={() => setTab(t)}
                >
                  {t === 'overview' ? 'Tổng quan' : t === 'products' ? 'Sản phẩm' : 'User'}
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
      </div>
    </div>
  )
}
