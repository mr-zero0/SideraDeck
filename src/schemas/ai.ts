import { z } from 'zod'

const TierSchema = z.object({
  id: z.string().regex(/^[a-z]+$/),
  label: z.string().min(1),
  ages: z.string().min(1),
  readingGrade: z.object({ min: z.number().nonnegative(), max: z.number().positive() }),
  maxWordsPerSentence: z.number().int().positive(),
  allowEquations: z.boolean(),
  /** Providers never used for this tier (e.g. data-use policies unsuitable for children). */
  excludedProviders: z.array(z.string()),
  style: z.string().min(1),
})

export const AiConfigSchema = z
  .object({
    version: z.literal(1),
    defaultTierId: z.string(),
    limits: z.object({
      maxQuestionChars: z.number().int().positive(),
      maxAnswerSentences: z.number().int().positive(),
      maxOutputTokens: z.number().int().positive(),
      temperature: z.number().min(0).max(2),
    }),
    tiers: z.array(TierSchema).min(1),
    bannedPhrases: z.array(z.string().min(1)),
    promptTemplates: z.object({ system: z.string().min(1), context: z.string().min(1) }),
  })
  .refine((c) => c.tiers.some((t) => t.id === c.defaultTierId), {
    message: 'defaultTierId must match a tier id',
    path: ['defaultTierId'],
  })

export type AiConfig = z.infer<typeof AiConfigSchema>
export type AgeTier = AiConfig['tiers'][number]
