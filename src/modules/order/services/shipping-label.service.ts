import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { ConflictError, NotFoundError } from '../../../common/errors'
import { supabase } from '../../../config/database'
import type { ShippingAddressSnapshot } from '../../../common/types/commerce.types'
import type { SellerSaleDetail } from '../../../common/types/seller-sales.types'
import { sellerSaleDetailRepository } from '../repositories/seller-sale-detail.repository'

const LABEL_SIZE: [number, number] = [298, 420]
const MARGIN = 20
const CONTENT_WIDTH = LABEL_SIZE[0] - MARGIN * 2

export type ShippingLabelData = {
  orderCode: string
  trackingId: string
  courier: string
  serviceType: string | null
  pickupAddress: string
  shipTo: ShippingAddressSnapshot
  artworkTitle: string
  quantity: number
  dimensions: string | null
}

function dimensionsText(detail: SellerSaleDetail): string | null {
  const d = detail.dimensions
  return d ? `${d.length} x ${d.width} x ${d.height} ${d.unit}` : null
}

export async function renderShippingLabel(data: ShippingLabelData): Promise<Buffer> {
  const qr = await QRCode.toBuffer(data.trackingId, { margin: 0, width: 220, errorCorrectionLevel: 'M' })

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: LABEL_SIZE, margin: MARGIN, info: { Title: `Shipping label ${data.orderCode}` } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const rule = (y: number) => doc.moveTo(MARGIN, y).lineTo(LABEL_SIZE[0] - MARGIN, y).lineWidth(0.7).strokeColor('#D9D9D9').stroke()

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#F15B38').text('ARTSONY', MARGIN, MARGIN, { width: CONTENT_WIDTH / 2 })
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`Order ${data.orderCode}`, MARGIN, MARGIN + 6, { width: CONTENT_WIDTH, align: 'right' })
    rule(52)

    doc.font('Helvetica').fontSize(7).fillColor('#888888').text('TRACKING NUMBER', MARGIN, 62)
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(data.trackingId, MARGIN, 74, { width: 170 })
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(
      [data.courier, data.serviceType].filter(Boolean).join(' · '),
      MARGIN,
      100,
      { width: 170 },
    )
    doc.image(qr, LABEL_SIZE[0] - MARGIN - 70, 62, { width: 70, height: 70 })
    rule(142)

    doc.font('Helvetica').fontSize(7).fillColor('#888888').text('FROM', MARGIN, 152)
    doc.font('Helvetica').fontSize(9).fillColor('#111111').text(data.pickupAddress, MARGIN, 163, { width: CONTENT_WIDTH, height: 40 })
    rule(206)

    const to = data.shipTo
    doc.font('Helvetica').fontSize(7).fillColor('#888888').text('SHIP TO', MARGIN, 216)
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(to.full_name, MARGIN, 228, { width: CONTENT_WIDTH })
    doc.font('Helvetica').fontSize(10).fillColor('#111111').text(
      [
        to.address_line_1,
        to.address_line_2,
        `${to.city}, ${to.state} ${to.postal_code}`,
        to.country_code.toUpperCase(),
        to.phone,
      ]
        .filter(Boolean)
        .join('\n'),
      MARGIN,
      246,
      { width: CONTENT_WIDTH, height: 90 },
    )
    rule(346)

    doc.font('Helvetica').fontSize(7).fillColor('#888888').text('ITEM', MARGIN, 356)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(data.artworkTitle, MARGIN, 366, { width: CONTENT_WIDTH, height: 12, ellipsis: true })
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(
      [`Qty ${data.quantity}`, data.dimensions].filter(Boolean).join('   ·   '),
      MARGIN,
      382,
      { width: CONTENT_WIDTH },
    )

    doc.end()
  })
}

export const shippingLabelService = {
  async buildForSeller(sellerId: string, orderItemId: string): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await sellerSaleDetailRepository.get(sellerId, orderItemId)
    if (!detail) throw new NotFoundError('Order')
    if (!detail.label_available || !detail.tracking_id || !detail.courier_name || !detail.pickup_address) {
      throw new ConflictError('The shipping label is available once the order has been activated')
    }

    const { data, error } = await (supabase() as any)
      .from('orders')
      .select('shipping_address')
      .eq('id', detail.order_id)
      .maybeSingle()
    if (error) throw new Error(`[shippingLabel] ${error.message}`)
    if (!data?.['shipping_address']) throw new ConflictError('This order has no delivery address')

    const buffer = await renderShippingLabel({
      orderCode: detail.order_code,
      trackingId: detail.tracking_id,
      courier: detail.courier_name,
      serviceType: detail.courier_service_type,
      pickupAddress: detail.pickup_address,
      shipTo: data['shipping_address'] as ShippingAddressSnapshot,
      artworkTitle: detail.artwork_title,
      quantity: detail.quantity,
      dimensions: dimensionsText(detail),
    })
    return { buffer, filename: `shipping-label-${detail.order_code}.pdf` }
  },
}
