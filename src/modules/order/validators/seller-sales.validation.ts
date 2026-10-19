import type { Request } from 'express'
import { param, query, validationResult } from 'express-validator'
import { ValidationError } from '@/common/errors'
import { SELLER_SALES_FORMATS, SELLER_SALES_SORT_FIELDS, SELLER_STATUSES } from '@/common/types/seller-sales.types'
import { SELLER_SALES_MAX_LIMIT } from '../utils/seller-sales-query'

const single = (value: unknown): boolean => typeof value === 'string'

const optionalSingle = (name: string) =>
  query(name).optional().custom(single).withMessage(`${name} must be a single value`)

export const sellerSalesListValidation = [
  optionalSingle('status').isIn([...SELLER_STATUSES]).withMessage('Invalid status filter'),
  optionalSingle('format').isIn([...SELLER_SALES_FORMATS]).withMessage('Invalid format filter'),
  optionalSingle('price_min').isFloat({ min: 0 }).withMessage('price_min must be a non-negative number'),
  optionalSingle('price_max')
    .isFloat({ min: 0 })
    .withMessage('price_max must be a non-negative number')
    .custom((value: string, { req }) => {
      const min = (req.query as Record<string, unknown> | undefined)?.['price_min']
      return typeof min !== 'string' || Number(min) <= Number(value)
    })
    .withMessage('price_max must be greater than or equal to price_min'),
  optionalSingle('date_from')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('date_from must be an ISO 8601 timestamp'),
  optionalSingle('date_to')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('date_to must be an ISO 8601 timestamp')
    .custom((value: string, { req }) => {
      const from = (req.query as Record<string, unknown> | undefined)?.['date_from']
      return typeof from !== 'string' || new Date(from).getTime() <= new Date(value).getTime()
    })
    .withMessage('date_to must not be before date_from'),
  optionalSingle('q').isLength({ max: 100 }).withMessage('q must be at most 100 characters'),
  optionalSingle('page').isInt({ min: 1, max: 100000 }).withMessage('page must be a positive integer'),
  optionalSingle('limit')
    .isInt({ min: 1, max: SELLER_SALES_MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${SELLER_SALES_MAX_LIMIT}`),
  optionalSingle('sort_by').isIn([...SELLER_SALES_SORT_FIELDS]).withMessage('sort_by must be date or value'),
  optionalSingle('sort_order').isIn(['asc', 'desc']).withMessage('sort_order must be asc or desc'),
]

export const sellerSaleDetailValidation = [
  param('orderItemId').isUUID().withMessage('orderItemId must be a valid UUID'),
]

export function assertValidRequest(req: Request): void {
  const errors = validationResult(req)
  if (errors.isEmpty()) return
  const fields = Object.fromEntries(
    errors.array().map((error) => ['path' in error ? error.path : 'field', error.msg]),
  )
  throw new ValidationError('Validation failed', fields)
}
