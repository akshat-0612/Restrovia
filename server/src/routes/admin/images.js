import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError, asyncHandler } from '../../lib/errors.js';
import { requireRole } from '../../middleware/auth.js';
import { publicImageUrl } from '../../lib/images.js';

const router = Router();
const canEdit = requireRole('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

/**
 * The browser crops and re-encodes before uploading, so anything arriving much
 * above this is either a mistake or someone bypassing the client. Generous
 * enough for a large WebP, small enough that the table stays cheap.
 */
const MAX_BYTES = 600 * 1024;
const ALLOWED = ['image/webp', 'image/jpeg', 'image/png'];

const uploadSchema = z.object({
  /** A data URL, which is what a canvas hands back after cropping. */
  dataUrl: z.string().startsWith('data:', 'Upload an image file'),
  width: z.number().int().positive().max(4000),
  height: z.number().int().positive().max(4000),
});

router.post('/', canEdit, asyncHandler(async (req, res) => {
  const body = uploadSchema.parse(req.body);

  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(body.dataUrl);
  if (!match) throw ApiError.badRequest('That file could not be read as an image');

  const [, mimeType, base64] = match;
  if (!ALLOWED.includes(mimeType)) {
    throw ApiError.badRequest(`Images must be WebP, JPEG or PNG — got ${mimeType}`);
  }

  const data = Buffer.from(base64, 'base64');
  if (data.length === 0) throw ApiError.badRequest('That image is empty');
  if (data.length > MAX_BYTES) {
    throw ApiError.badRequest(
      `That image is ${Math.round(data.length / 1024)}KB; the limit is ${MAX_BYTES / 1024}KB`
    );
  }

  const image = await prisma.image.create({
    data: {
      restaurantId: req.restaurantId,
      mimeType,
      width: body.width,
      height: body.height,
      sizeBytes: data.length,
      data,
    },
    select: { id: true, width: true, height: true, sizeBytes: true },
  });

  res.status(201).json({ image: { ...image, url: publicImageUrl(req, image.id) } });
}));

router.delete('/:id', canEdit, asyncHandler(async (req, res) => {
  // Scoped by restaurant, so one tenant cannot delete another's artwork.
  const { count } = await prisma.image.deleteMany({
    where: { id: req.params.id, restaurantId: req.restaurantId },
  });
  if (!count) throw ApiError.notFound('Image not found');
  res.json({ ok: true });
}));

export default router;
