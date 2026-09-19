import { z } from "zod";

export const smsTypeSchema = z.enum(["otp", "transactional", "marketing"]);

export const sendSmsRequestSchema = z
  .object({
    to: z.string().min(6, "Le numéro de téléphone 'to' est obligatoire et trop court"),
    message: z.string().min(1, "Le message ne peut pas être vide").max(1600, "Le message dépasse la taille maximale autorisée").optional(),
    template: z.string().min(2, "L'identifiant de modèle 'template' est invalide").optional(),
    variables: z.record(z.union([z.string(), z.number()])).optional(),
    type: smsTypeSchema.default("transactional"),
    senderId: z
      .string()
      .max(11, "Le senderId ne doit pas dépasser 11 caractères")
      .regex(/^[a-zA-Z0-9_-]+$/, "Le senderId ne doit contenir que des lettres, chiffres, tirets ou underscores")
      .optional(),
  })
  .refine((data) => Boolean(data.message || data.template), {
    message: "Vous devez fournir soit un texte direct ('message'), soit un modèle ('template')",
    path: ["message"],
  });

export type SendSmsInput = z.infer<typeof sendSmsRequestSchema>;

export const createApplicationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/),
  dailyLimit: z.number().int().positive().default(10000),
  monthlyLimit: z.number().int().positive().default(250000),
});

export const createTemplateSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9_-]+$/),
  content: z.string().min(3).max(1600),
  smsType: smsTypeSchema.default("transactional"),
  senderId: z.string().max(11).optional(),
  variables: z.array(z.string()).default([]),
});

export const updateRoutingRuleSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().positive().optional(),
  costPerSegmentFcfa: z.number().positive().optional(),
});
