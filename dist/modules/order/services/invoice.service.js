"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptService = exports.invoiceService = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const stream_1 = require("stream");
const cloudinary_1 = require("cloudinary");
const physical_order_repository_1 = require("../repositories/physical-order.repository");
const commerce_types_1 = require("../../../common/types/commerce.types");
// Cloudinary is configured globally in src/modules/upload/services/cloudinary.service.ts
// which runs at import time. We re-use the same v2 instance here.
async function uploadPdfToCloudinary(buffer, publicId) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            public_id: publicId,
            resource_type: 'raw',
            folder: 'artsony/invoices',
            format: 'pdf',
            type: 'authenticated',
        }, (err, result) => {
            if (err || !result)
                return reject(err ?? new Error('Cloudinary upload failed'));
            resolve({ public_id: result.public_id, secure_url: result.secure_url });
        });
        const readable = new stream_1.Readable();
        readable.push(buffer);
        readable.push(null);
        readable.pipe(uploadStream);
    });
}
function buildPdfBuffer(data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // ── Header ────────────────────────────────────────────────────────────────
        doc.fontSize(22).fillColor('#F25B38').text('ARTSONY', 50, 50);
        doc.fontSize(9).fillColor('#788191').text('Tax Invoice / Receipt', 50, 76);
        doc.moveTo(50, 95).lineTo(545, 95).strokeColor('#E6E8EB').lineWidth(1).stroke();
        // ── Invoice meta ──────────────────────────────────────────────────────────
        doc.fontSize(10).fillColor('#25282D');
        doc.text(`Invoice #${data.order_number}-V${data.invoice_version}`, 50, 110);
        doc.text(`Order ID: ${data.order_id}`, 50, 124);
        doc.text(`Issue Date: ${data.purchase_date.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        })}`, 50, 138);
        // ── Parties ───────────────────────────────────────────────────────────────
        const partyY = 170;
        doc.fontSize(8).fillColor('#788191')
            .text('SOLD BY', 50, partyY)
            .text('SOLD TO', 300, partyY);
        doc.fontSize(10).fillColor('#25282D')
            .text(data.seller.username, 50, partyY + 14)
            .text(`Artist ID: ${data.seller.id}`, 50, partyY + 26)
            .text(data.buyer.username, 300, partyY + 14)
            .text(`Buyer ID: ${data.buyer.id}`, 300, partyY + 26);
        // ── Table header ──────────────────────────────────────────────────────────
        const tableTop = 240;
        doc.moveTo(50, tableTop).lineTo(545, tableTop).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        doc.fontSize(8).fillColor('#788191')
            .text('ITEM', 50, tableTop + 6)
            .text('COURIER', 310, tableTop + 6)
            .text('SHIPPING', 420, tableTop + 6)
            .text('PRICE', 490, tableTop + 6);
        doc.moveTo(50, tableTop + 20).lineTo(545, tableTop + 20).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        // ── Items ─────────────────────────────────────────────────────────────────
        let rowY = tableTop + 28;
        let subtotal = 0;
        let totalShip = 0;
        for (const item of data.items) {
            const courierLabel = item.courier_name
                ? `${item.courier_name}${item.service_type ? ` (${item.service_type})` : ''}`
                : '—';
            doc.fontSize(9).fillColor('#25282D')
                .text(item.title, 50, rowY, { width: 250, lineBreak: false })
                .text(courierLabel, 310, rowY, { width: 105, lineBreak: false })
                .text(`${data.currency} ${item.shipping_cost.toFixed(2)}`, 420, rowY, { width: 65, lineBreak: false })
                .text(`${data.currency} ${item.unit_price.toFixed(2)}`, 490, rowY, { width: 55, align: 'right', lineBreak: false });
            rowY += 18;
            subtotal += item.unit_price;
            totalShip += item.shipping_cost;
        }
        // ── Totals ────────────────────────────────────────────────────────────────
        const platformFee = subtotal * commerce_types_1.PLATFORM_SERVICE_FEE_RATE;
        const grandTotal = subtotal + totalShip;
        const refundAmt = data.refund_amount ?? 0;
        const net = grandTotal - refundAmt;
        doc.moveTo(50, rowY + 6).lineTo(545, rowY + 6).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        const totY = rowY + 18;
        const labelX = 370;
        const valueX = 490;
        const lineH = 16;
        doc.fontSize(9).fillColor('#25282D');
        doc.text('Subtotal (items):', labelX, totY);
        doc.text(`${data.currency} ${subtotal.toFixed(2)}`, valueX, totY, { align: 'right' });
        doc.text('Shipping total:', labelX, totY + lineH);
        doc.text(`${data.currency} ${totalShip.toFixed(2)}`, valueX, totY + lineH, { align: 'right' });
        doc.fillColor('#788191');
        doc.text(`Platform fee (${(commerce_types_1.PLATFORM_SERVICE_FEE_RATE * 100).toFixed(0)}%):`, labelX, totY + lineH * 2);
        doc.text(`${data.currency} ${platformFee.toFixed(2)}`, valueX, totY + lineH * 2, { align: 'right' });
        if (refundAmt > 0) {
            doc.fillColor('#E31B0C');
            doc.text('Refund applied:', labelX, totY + lineH * 3);
            doc.text(`- ${data.currency} ${refundAmt.toFixed(2)}`, valueX, totY + lineH * 3, { align: 'right' });
        }
        doc.moveTo(370, totY + lineH * 4).lineTo(545, totY + lineH * 4).strokeColor('#25282D').lineWidth(0.8).stroke();
        doc.fontSize(10).fillColor('#25282D').font('Helvetica-Bold');
        doc.text('Total Paid:', labelX, totY + lineH * 4 + 4);
        doc.text(`${data.currency} ${net.toFixed(2)}`, valueX, totY + lineH * 4 + 4, { align: 'right' });
        doc.font('Helvetica');
        if (data.refund_status !== 'NONE') {
            doc.fontSize(8).fillColor('#788191').text(`Note: Refund status — ${data.refund_status}. Shipping charges are non-refundable.`, 50, totY + lineH * 6, { width: 495 });
        }
        // ── Footer ────────────────────────────────────────────────────────────────
        const footerY = doc.page.height - 70;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        doc.fontSize(7.5).fillColor('#A5ABB6')
            .text('Artsony — Where art finds its people. System-generated invoice.', 50, footerY + 10, { align: 'center', width: 495 })
            .text(`Generated: ${new Date().toISOString()}`, 50, footerY + 22, { align: 'center', width: 495 });
        doc.end();
    });
}
// ── Public service ────────────────────────────────────────────────────────────
exports.invoiceService = {
    async generate(input) {
        const latest = await physical_order_repository_1.physicalOrderRepository.getLatestInvoice(input.order_id);
        const nextVersion = (latest?.version ?? 0) + 1;
        const buffer = await buildPdfBuffer({ ...input, invoice_version: nextVersion });
        const publicId = `invoice_${input.order_id}_v${nextVersion}`;
        const uploaded = await uploadPdfToCloudinary(buffer, publicId);
        return physical_order_repository_1.physicalOrderRepository.upsertInvoice({
            order_id: input.order_id,
            pdf_cloudinary_public_id: uploaded.public_id,
            pdf_url: uploaded.secure_url,
            generated_by: input.generated_by,
            trigger: input.trigger,
        });
    },
    async getLatest(orderId) {
        return physical_order_repository_1.physicalOrderRepository.getLatestInvoice(orderId);
    },
};
function buildReceiptPdfBuffer(data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // ── Header ────────────────────────────────────────────────────────────────
        doc.fontSize(22).fillColor('#F25B38').text('ARTSONY', 50, 50);
        doc.fontSize(9).fillColor('#788191').text('Payment Receipt', 50, 76);
        doc.moveTo(50, 95).lineTo(545, 95).strokeColor('#E6E8EB').lineWidth(1).stroke();
        // ── Meta ──────────────────────────────────────────────────────────────────
        doc.fontSize(10).fillColor('#25282D');
        doc.text(`Receipt for Order #${data.order_number}`, 50, 110);
        doc.text(`Order ID: ${data.order_id}`, 50, 124);
        doc.text(`Payment Date: ${data.payment_date.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'long', year: 'numeric',
        })}`, 50, 138);
        // ── Payer ─────────────────────────────────────────────────────────────────
        doc.fontSize(8).fillColor('#788191').text('PAID BY', 50, 170);
        doc.fontSize(10).fillColor('#25282D')
            .text(data.buyer.username, 50, 184)
            .text(`Buyer ID: ${data.buyer.id}`, 50, 196);
        // ── Payment details box ──────────────────────────────────────────────────
        const boxTop = 230;
        doc.moveTo(50, boxTop).lineTo(545, boxTop).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        doc.fontSize(9).fillColor('#788191');
        doc.text('Payment Method:', 50, boxTop + 16);
        doc.fillColor('#25282D').text(data.payment_method, 220, boxTop + 16);
        doc.fillColor('#788191');
        doc.text('Transaction Reference:', 50, boxTop + 36);
        doc.fillColor('#25282D').text(data.transaction_reference ?? 'N/A', 220, boxTop + 36, { width: 320 });
        doc.fillColor('#788191');
        doc.text('Amount Paid:', 50, boxTop + 56);
        doc.fontSize(12).fillColor('#25282D').font('Helvetica-Bold')
            .text(`${data.currency} ${data.amount_paid.toFixed(2)}`, 220, boxTop + 54);
        doc.font('Helvetica');
        doc.moveTo(50, boxTop + 90).lineTo(545, boxTop + 90).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        doc.fontSize(8).fillColor('#788191').text('This receipt confirms payment was received for the above order. ' +
            'For an itemized breakdown of goods, prices, and shipping, refer to the order invoice.', 50, boxTop + 102, { width: 495 });
        // ── Footer ────────────────────────────────────────────────────────────────
        const footerY = doc.page.height - 70;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#E6E8EB').lineWidth(0.5).stroke();
        doc.fontSize(7.5).fillColor('#A5ABB6')
            .text('Artsony — Where art finds its people. System-generated receipt.', 50, footerY + 10, { align: 'center', width: 495 })
            .text(`Generated: ${new Date().toISOString()}`, 50, footerY + 22, { align: 'center', width: 495 });
        doc.end();
    });
}
exports.receiptService = {
    /**
     * Generates and persists the single, immutable payment receipt for an
     * order. Idempotent — if a receipt already exists, the existing one is
     * returned and no new PDF is generated (createReceipt enforces this at
     * the repository layer via the order_id unique constraint).
     */
    async generate(input) {
        const existing = await physical_order_repository_1.physicalOrderRepository.getReceipt(input.order_id);
        if (existing)
            return existing;
        const buffer = await buildReceiptPdfBuffer(input);
        const publicId = `receipt_${input.order_id}`;
        const uploaded = await uploadPdfToCloudinary(buffer, publicId);
        return physical_order_repository_1.physicalOrderRepository.createReceipt({
            order_id: input.order_id,
            pdf_cloudinary_public_id: uploaded.public_id,
            pdf_url: uploaded.secure_url,
            amount_paid: input.amount_paid,
            currency: input.currency,
            payment_method: input.payment_method,
            transaction_reference: input.transaction_reference,
            generated_by: input.generated_by,
        });
    },
    async getLatest(orderId) {
        return physical_order_repository_1.physicalOrderRepository.getReceipt(orderId);
    },
};
//# sourceMappingURL=invoice.service.js.map