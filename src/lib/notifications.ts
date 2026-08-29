// Shared notification helper — call from any API route to create a notification
import { db } from '@/lib/db'

export type NotificationType =
  | 'SELLER_APPROVED'
  | 'SELLER_REJECTED'
  | 'PRODUCT_APPROVED'
  | 'PRODUCT_REJECTED'
  | 'NEW_SALE'
  | 'NEW_REVIEW'
  | 'SYSTEM'

interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
}

export async function createNotification({ userId, type, title, message, link }: CreateNotificationParams) {
  return db.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      link,
    },
  })
}

// Convenience helpers for common notification types

export async function notifySellerApproved(userId: string, displayName: string) {
  return createNotification({
    userId,
    type: 'SELLER_APPROVED',
    title: 'Seller đã được duyệt! 🎉',
    message: `Đơn đăng ký seller "${displayName}" của bạn đã được duyệt. Bạn có thể bắt đầu đăng sản phẩm ngay.`,
    link: '/?category=seller',
  })
}

export async function notifySellerRejected(userId: string, displayName: string, reason?: string) {
  return createNotification({
    userId,
    type: 'SELLER_REJECTED',
    title: 'Seller bị từ chối',
    message: reason
      ? `Đơn đăng ký seller "${displayName}" bị từ chối. Lý do: ${reason}`
      : `Đơn đăng ký seller "${displayName}" bị từ chối. Bạn có thể gửi lại đơn.`,
    link: undefined, // Will open SellerApplyModal
  })
}

export async function notifyProductApproved(userId: string, productTitle: string) {
  return createNotification({
    userId,
    type: 'PRODUCT_APPROVED',
    title: 'Sản phẩm đã được duyệt ✅',
    message: `Sản phẩm "${productTitle}" của bạn đã được duyệt và đang hiển thị trên marketplace.`,
  })
}

export async function notifyProductRejected(userId: string, productTitle: string, reason?: string) {
  return createNotification({
    userId,
    type: 'PRODUCT_REJECTED',
    title: 'Sản phẩm bị từ chối',
    message: reason
      ? `Sản phẩm "${productTitle}" bị từ chối. Lý do: ${reason}`
      : `Sản phẩm "${productTitle}" bị từ chối. Vui lòng chỉnh sửa và gửi lại.`,
  })
}

export async function notifyNewSale(sellerId: string, productTitle: string, buyerEmail: string) {
  return createNotification({
    userId: sellerId,
    type: 'NEW_SALE',
    title: 'Có lượt mua mới! 💰',
    message: `${buyerEmail} vừa mua sản phẩm "${productTitle}" của bạn.`,
  })
}

export async function notifyNewReview(sellerId: string, productTitle: string, rating: number) {
  return createNotification({
    userId: sellerId,
    type: 'NEW_REVIEW',
    title: 'Review mới ⭐',
    message: `Sản phẩm "${productTitle}" vừa nhận review ${rating}/5 sao.`,
  })
}
