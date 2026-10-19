import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/common/errors'
import { config } from '@/config'
import { supabase } from '@/config/database'
import {
  ACTIVATION_SESSION_TTL_MS,
  REQUIRED_PACKAGING_PHOTOS,
  type ActivationSession,
  type ActivationSessionResult,
  type ActivationSessionState,
  type PackagingProofInput,
  type ShippingInput,
  type UploadContext,
} from '@/common/types/order-activation.types'
import { CloudinaryService, extensionOf, type UploadSignature } from '../../upload/services/cloudinary.service'
import { MEDIA_RULES, MIME_BY_FORMAT, UPLOAD_ROOT_FOLDER, formatLabel } from '../../upload/upload.constants'
import { orderActivationRepository } from '../repositories/order-activation.repository'
import { physicalOrderRepository } from '../repositories/physical-order.repository'
import { generateToken, hashToken, isExpired } from '../utils/activation'
import { physicalOrderService } from './physical-order.service'

type Row = Record<string, any>

type PendingContext = {
  orderItemId: string
  orderId: string
  physicalId: string
  artworkTitle: string
  orderCode: string
}

function db(): any {
  return supabase() as any
}

async function loadPendingContext(sellerId: string, orderItemId: string): Promise<PendingContext> {
  const { data, error } = await db()
    .from('seller_sales_view')
    .select('order_item_id, order_id, physical_id, order_code, artwork_title, artwork_format, seller_status')
    .eq('order_item_id', orderItemId)
    .eq('seller_id', sellerId)
    .maybeSingle()
  if (error) throw new Error(`[orderActivation:context] ${error.message}`)
  if (!data) throw new NotFoundError('Order')

  const row = data as Row
  if (row['artwork_format'] !== 'PHYSICAL' || !row['physical_id']) {
    throw new ConflictError('Only physical orders need to be activated')
  }
  if (row['seller_status'] !== 'PENDING') {
    throw new ConflictError('This order is no longer waiting for activation')
  }
  return {
    orderItemId: String(row['order_item_id']),
    orderId: String(row['order_id']),
    physicalId: String(row['physical_id']),
    artworkTitle: String(row['artwork_title']),
    orderCode: String(row['order_code']),
  }
}

async function requireActiveSession(token: string): Promise<ActivationSession> {
  const session = await orderActivationRepository.findByTokenHash(hashToken(token))
  if (!session) throw new NotFoundError('Upload link')
  if (session.status === 'PENDING' && isExpired(session.expires_at)) {
    await orderActivationRepository.markExpired(session.id)
    throw new AppError('This upload link has expired. Generate a new QR code and try again.', 410, 'UPLOAD_LINK_EXPIRED')
  }
  if (session.status !== 'PENDING') {
    throw new AppError('This upload link is no longer valid.', 410, 'UPLOAD_LINK_INVALID')
  }
  return session
}

function assertOwnsPublicId(publicId: string, sellerId: string): void {
  if (!publicId.startsWith(`${UPLOAD_ROOT_FOLDER}/${sellerId}/`) || publicId.includes('..')) {
    throw new ForbiddenError('Invalid upload')
  }
}

export const orderActivationService = {
  async saveShipping(sellerId: string, orderItemId: string, input: ShippingInput): Promise<void> {
    const context = await loadPendingContext(sellerId, orderItemId)
    await physicalOrderRepository.updateCourierInfo(context.physicalId, {
      courier_name: input.courier_name,
      courier_service_type: input.courier_service_type,
      pickup_address: input.pickup_address,
    })
  },

  async createSession(sellerId: string, orderItemId: string): Promise<ActivationSessionResult> {
    const context = await loadPendingContext(sellerId, orderItemId)

    const physical = await physicalOrderRepository.findById(context.physicalId)
    if (!physical) throw new NotFoundError('Physical order item')
    if (!physical.courier_name || !physical.courier_service_type || !physical.pickup_address) {
      throw new ValidationError('Choose a courier, a service type and a pickup address before continuing', {
        shipping: 'Shipping details are incomplete',
      })
    }

    // Photos from an earlier attempt that stopped before confirmation: skip the
    // upload and finish activation.
    if ((await orderActivationRepository.countPackagingProofs(context.physicalId)) >= REQUIRED_PACKAGING_PHOTOS) {
      await physicalOrderService.artistConfirm({ physicalId: context.physicalId, actorId: sellerId, actorRole: 'ARTIST' })
      return { status: 'COMPLETED' }
    }

    const token = generateToken()
    const session = await orderActivationRepository.createSession({
      physicalId: context.physicalId,
      sellerId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ACTIVATION_SESSION_TTL_MS),
    })

    return {
      status: 'PENDING',
      session_id: session.id,
      upload_url: `${config.app.frontendUrl.replace(/\/$/, '')}/upload-proof/${token}`,
      expires_at: session.expires_at,
    }
  },

  async getSessionState(sellerId: string, orderItemId: string, sessionId: string): Promise<ActivationSessionState> {
    const { data, error } = await db()
      .from('seller_sales_view')
      .select('physical_id')
      .eq('order_item_id', orderItemId)
      .eq('seller_id', sellerId)
      .maybeSingle()
    if (error) throw new Error(`[orderActivation:state] ${error.message}`)
    if (!data?.['physical_id']) throw new NotFoundError('Order')

    const session = await orderActivationRepository.findForSeller(sessionId, String(data['physical_id']), sellerId)
    if (!session) throw new NotFoundError('Upload session')

    const expired = session.status === 'PENDING' && isExpired(session.expires_at)
    if (expired) await orderActivationRepository.markExpired(session.id)

    return {
      session_id: session.id,
      status: expired ? 'EXPIRED' : session.status,
      failure_reason: session.failure_reason,
      expires_at: session.expires_at,
    }
  },

  async getUploadContext(token: string): Promise<UploadContext> {
    const session = await requireActiveSession(token)
    const { data, error } = await db()
      .from('seller_sales_view')
      .select('order_code, artwork_title')
      .eq('physical_id', session.order_item_physical_id)
      .eq('seller_id', session.seller_id)
      .maybeSingle()
    if (error) throw new Error(`[orderActivation:uploadContext] ${error.message}`)
    if (!data) throw new NotFoundError('Order')

    return {
      artwork_title: String(data['artwork_title']),
      order_code: String(data['order_code']),
      required_photos: REQUIRED_PACKAGING_PHOTOS,
      expires_at: session.expires_at,
    }
  },

  async signUpload(token: string, filename: string, fileSizeBytes: number): Promise<UploadSignature> {
    const session = await requireActiveSession(token)
    const rule = MEDIA_RULES.IMAGE

    if (!rule.formats.includes(extensionOf(filename))) {
      throw new ValidationError(`Unsupported image format. Allowed: ${rule.formats.join(', ').toUpperCase()}`, {
        filename: 'Unsupported file format',
      })
    }
    if (fileSizeBytes > rule.maxBytes) {
      throw new AppError(`Image must be ${formatLabel(rule.maxBytes)} or smaller`, 413, 'FILE_TOO_LARGE')
    }
    return CloudinaryService.createUploadSignature(session.seller_id, 'IMAGE', filename)
  },

  async completeUpload(token: string, publicIds: string[]): Promise<{ status: 'COMPLETED' }> {
    const session = await requireActiveSession(token)

    if (publicIds.length !== REQUIRED_PACKAGING_PHOTOS || new Set(publicIds).size !== publicIds.length) {
      throw new ValidationError(`Upload exactly ${REQUIRED_PACKAGING_PHOTOS} different photos`, {
        public_ids: `Exactly ${REQUIRED_PACKAGING_PHOTOS} photos are required`,
      })
    }
    publicIds.forEach((publicId) => assertOwnsPublicId(publicId, session.seller_id))

    if (!(await orderActivationRepository.claimSession(session.id))) {
      throw new AppError('This upload link has already been used.', 409, 'UPLOAD_LINK_USED')
    }

    const rule = MEDIA_RULES.IMAGE
    const destroyAll = async () => {
      await Promise.allSettled(publicIds.map((publicId) => CloudinaryService.destroyAsset(publicId, rule.resourceType)))
    }

    try {
      const resources = await Promise.all(publicIds.map((publicId) => CloudinaryService.getResource(publicId, rule.resourceType)))

      const invalid = resources.find(
        (resource) => resource.bytes > rule.maxBytes || !rule.formats.includes((resource.format ?? '').toLowerCase()),
      )
      if (invalid) {
        await destroyAll()
        throw new ValidationError('One of the photos is too large or in an unsupported format', {
          public_ids: 'Invalid photo',
        })
      }

      const context = await loadPendingContext(session.seller_id, await resolveOrderItemId(session.order_item_physical_id))

      const proofs: PackagingProofInput[] = resources.map((resource, index) => {
        const format = (resource.format ?? 'jpg').toLowerCase()
        return {
          position: index + 1,
          cloudinary_public_id: resource.public_id,
          secure_url: resource.secure_url,
          mime_type: MIME_BY_FORMAT[format] ?? 'image/jpeg',
          file_size_bytes: resource.bytes,
          width: resource.width,
          height: resource.height,
        }
      })

      await orderActivationRepository.insertPackagingProofs({
        physicalId: context.physicalId,
        orderId: context.orderId,
        uploadedBy: session.seller_id,
        proofs,
      })

      await physicalOrderService.artistConfirm({
        physicalId: context.physicalId,
        actorId: session.seller_id,
        actorRole: 'ARTIST',
      })

      await orderActivationRepository.finishSession(session.id, 'COMPLETED')
      return { status: 'COMPLETED' }
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 300) : 'Activation failed'
      await orderActivationRepository.finishSession(session.id, 'FAILED', reason).catch((finishError) => {
        console.error('[orderActivation] could not record session failure:', finishError)
      })
      throw err
    }
  },
}

async function resolveOrderItemId(physicalId: string): Promise<string> {
  const physical = await physicalOrderRepository.findById(physicalId)
  if (!physical) throw new NotFoundError('Physical order item')
  return physical.order_item_id
}
