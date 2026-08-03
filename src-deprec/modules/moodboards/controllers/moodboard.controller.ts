import type { Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { ValidationError, UnauthorizedError } from '@/common/errors'
import * as moodboardService from '../services/moodboard.service'

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Validation chains ─────────────────────────────────────────────────────────

export const createMoodboardValidation = [
  body('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
]

export const updateMoodboardValidation = [
  param('id').isUUID().withMessage('Invalid moodboard ID'),
  body('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
]

export const artworkJunctionValidation = [
  param('id').isUUID().withMessage('Invalid moodboard ID'),
  body('artwork_id').isUUID().withMessage('Invalid artwork ID'),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleCreateMoodboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { title } = req.body
    // Type assertion to guarantee sub is a string
    const userId = req.auth.sub as string
    const moodboard = await moodboardService.createMoodboard(userId, title)

    res.status(201).json({ success: true, data: moodboard })
  } catch (err) {
    next(err)
  }
}

export async function handleListMoodboards(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const userId = req.auth.sub as string
    const moodboards = await moodboardService.listMoodboards(userId)

    res.json({ success: true, data: moodboards })
  } catch (err) {
    next(err)
  }
}

export async function handleUpdateMoodboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    // Explicitly cast req.params to guarantee id is a string
    const { id } = req.params as { id: string }
    const { title } = req.body
    const userId = req.auth.sub as string
    const moodboard = await moodboardService.updateMoodboard(id, userId, title)

    res.json({ success: true, data: moodboard })
  } catch (err) {
    next(err)
  }
}

export async function handleDeleteMoodboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const userId = req.auth.sub as string
    await moodboardService.deleteMoodboard(id, userId)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function handleAddArtwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const { artwork_id } = req.body
    const userId = req.auth.sub as string

    await moodboardService.addArtworkToMoodboard(id, userId, artwork_id)

    res.status(201).json({ success: true, message: 'Artwork added to moodboard' })
  } catch (err) {
    next(err)
  }
}

export async function handleRemoveArtwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const { id, artworkId } = req.params as { id: string; artworkId: string }
    const userId = req.auth.sub as string

    await moodboardService.removeArtworkFromMoodboard(id, userId, artworkId)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function handleGetMoodboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const moodboard = await moodboardService.getMoodboard(id)

    res.json({ success: true, data: moodboard })
  } catch (err) {
    next(err)
  }
}