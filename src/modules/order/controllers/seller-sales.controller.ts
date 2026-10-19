import type { NextFunction, Request, Response } from 'express'
import { UnauthorizedError } from '../../../common/errors'
import { sellerSalesService } from '../services/seller-sales.service'
import { assertValidRequest } from '../validators/seller-sales.validation'
import { parseSellerSalesFilters } from '../utils/seller-sales-query'

// GET /api/orders/sales/lines
export async function handleListSellerSales(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    if (!req.auth) throw new UnauthorizedError()

    const filters = parseSellerSalesFilters(req.query as Record<string, unknown>)
    const result = await sellerSalesService.list(req.auth.sub, filters)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/sales/lines/counts
export async function handleSellerSalesCounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const counts = await sellerSalesService.counts(req.auth.sub)
    res.json({ success: true, data: counts })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/sales/lines/:orderItemId
export async function handleGetSellerSale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    if (!req.auth) throw new UnauthorizedError()
    const detail = await sellerSalesService.detail(req.auth.sub, String(req.params['orderItemId']))
    res.json({ success: true, data: detail })
  } catch (err) {
    next(err)
  }
}
