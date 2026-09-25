const { z } = require("zod");
const { TEMPLATES } = require("../config/templates");
const { FONTS } = require("../config/fonts");

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a valid id");

const email = z
  .string({ error: "must be a string" })
  .trim()
  .toLowerCase()
  .email("must be a valid email")
  .max(254, "is too long");

const password = z
  .string({ error: "must be a string" })
  .min(8, "must be at least 8 characters")
  .max(200, "is too long");

const name = z
  .string({ error: "must be a string" })
  .trim()
  .min(1, "is required")
  .max(80, "is too long");

const registerSchema = z.object({ name, email, password });

const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

const updateProfileSchema = z
  .object({ name: name.optional(), email: email.optional() })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: "Nothing to update",
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

const deleteAccountSchema = z.object({
  password: z.string({ error: "is required" }).min(1, "is required").max(200),
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  token: z
    .string({ error: "must be a string" })
    .regex(/^[a-f0-9]{64}$/, "is invalid"),
  password,
});

const projectSchema = z.object({
  title: z.string({ error: "must be a string" }).trim().min(1, "is required").max(200, "is too long"),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  description: z.string().trim().max(5000, "is too long").optional().default(""),
});

const chooseReferenceSchema = z.object({
  videoId: z.string({ error: "must be a string" }).trim().min(1, "is required").max(64, "is too long"),
});

const captionSchema = z.object({
  text: z.string({ error: "must be a string" }).trim().min(1, "is required").max(120, "is too long"),
  position: z.enum(["top", "middle", "bottom"]).default("bottom"),
  scale: z.coerce.number().min(0.06).max(0.3).default(0.16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour").default("#FFFFFF"),
  strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour").default("#000000"),
});

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be a hex colour");

const templateChoiceSchema = z.object({
  templateId: z.enum(TEMPLATES.map((t) => t.id), { error: "is not one of the templates" }),
});

const headlineLineSchema = z.object({
  text: z.string().trim().max(60, "is too long").default(""),
  rule: hexColour.optional(),
  accent: hexColour.optional(),
  flank: hexColour.optional(),
  gradient: z.array(hexColour).min(2).max(4).optional(),
  font: z.enum(FONTS.map((f) => f.key), { error: "is not one of the fonts" }).optional(),
  scale: z.coerce.number().min(0.04).max(0.42).optional(),
  color: hexColour.optional(),
  strokeColor: hexColour.optional(),
  box: hexColour.optional(),
});

const slotEditSchema = z
  .object({
    text: z.string().trim().max(120, "is too long").optional(),
    font: z.enum(FONTS.map((f) => f.key), { error: "is not one of the fonts" }).optional(),
    color: hexColour.optional(),
    accentColor: hexColour.optional(),
    strokeColor: hexColour.optional(),
    depthColor: hexColour.optional(),
    scale: z.coerce.number().min(0.04).max(0.62).optional(),
    rotate: z.coerce.number().min(-12).max(12).optional(),
    depth: z.coerce.number().int().min(0).max(28).optional(),
    band: z.enum(["top", "middle", "bottom"]).optional(),
    zoom: z.coerce.number().min(0.5).max(3).optional(),
    dx: z.coerce.number().min(-1).max(1).optional(),
    dy: z.coerce.number().min(-1).max(1).optional(),
    anchor: z.enum(["left", "center", "right"]).optional(),
    align: z.enum(["left", "center"]).optional(),
    lines: z.array(headlineLineSchema).max(8, "is too many lines").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const bulkIdsSchema = z.object({
  ids: z.array(objectId).min(1, "No thumbnails selected").max(500),
});

const bulkTagSchema = z.object({
  ids: z.array(objectId).min(1, "No thumbnails selected").max(500),
  tags: z.string().max(500),
});

const bulkCollectionSchema = z.object({
  ids: z.array(objectId).min(1, "No thumbnails selected").max(500),
  collectionId: objectId.nullable().optional(),
});

const updateThumbnailSchema = z.object({
  title: z.string().trim().max(200).optional(),
  tags: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  collectionId: z.union([objectId, z.literal(""), z.null()]).optional(),
});

const performanceSchema = z.object({
  impressions: z.coerce.number().int().min(1),
  clicks: z.coerce.number().int().min(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

const trackEventSchema = z.object({ type: z.enum(["view", "click"]) });

const comparisonSchema = z.object({
  thumbnailA: objectId,
  thumbnailB: objectId,
  winner: z.enum(["A", "B", "tie"]).nullable().optional(),
  notes: z.string().trim().max(2000, "is too long").optional(),
});

const shareExpirySchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
});

const tagRenameSchema = z.object({
  from: z.array(z.string({ error: "must be a string" }).trim().min(1, "cannot be empty").max(50, "is too long")).min(1, "No tags selected").max(50),
  to: z.string({ error: "must be a string" }).trim().min(1, "cannot be empty").max(50, "is too long"),
});

const tagDeleteSchema = z.object({ tag: z.string({ error: "must be a string" }).trim().min(1, "cannot be empty").max(50, "is too long") });

const collectionReorderSchema = z.object({
  ids: z.array(objectId).min(1, "No collections provided").max(200),
});

const collectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

const collectionUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  projectSchema,
  chooseReferenceSchema,
  captionSchema,
  templateChoiceSchema,
  slotEditSchema,
  bulkIdsSchema,
  bulkTagSchema,
  bulkCollectionSchema,
  updateThumbnailSchema,
  performanceSchema,
  trackEventSchema,
  comparisonSchema,
  shareExpirySchema,
  tagRenameSchema,
  tagDeleteSchema,
  collectionReorderSchema,
  collectionSchema,
  collectionUpdateSchema,
};
