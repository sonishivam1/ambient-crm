import { z } from "zod";

/** Contact rules shared by the server actions and their tests. Pure: no database access. */

export const CONTACT_STATUSES = ["active", "inactive", "all"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Keep the email under 254 characters.")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
  .transform((v) => v || null);

const phone = z
  .string()
  .trim()
  .max(40, "Keep the phone number under 40 characters.")
  .regex(/^[0-9+()\-.\s]*$/, "Phone numbers use digits, spaces, +, -, ( and ).");

const optionalId = z
  .string()
  .max(200)
  .nullish()
  .transform((v) => v || null);

export const contactFields = {
  accountId: z.string().min(1, "Choose an account.").max(200),
  soldToAccountId: optionalId,
  firstName: z.string().trim().min(1, "Add a first name.").max(80, "Keep the first name under 80 characters."),
  lastName: z.string().trim().max(80, "Keep the last name under 80 characters.").default(""),
  jobTitle: z.string().trim().max(120, "Keep the job title under 120 characters.").default(""),
  email: email.default(""),
  phone: phone.default(""),
  /** Role keys; checked against the tenant's roles on the server. Duplicates are dropped. */
  roles: z
    .array(z.string().max(40))
    .max(10, "Choose up to 10 roles.")
    .default([])
    .transform((r) => [...new Set(r)]),
};

export const createContactInput = z.object(contactFields);
export const updateContactInput = z.object({ id: z.string().min(1).max(200), ...contactFields });
export const setContactActiveInput = z.object({ id: z.string().min(1).max(200), active: z.boolean() });

export type ContactInput = z.infer<typeof createContactInput>;

/** Fields whose values are personal data: the audit log records that they changed, never what to. */
export const PERSONAL_FIELDS = ["firstName", "lastName", "jobTitle", "email", "phone"] as const;
