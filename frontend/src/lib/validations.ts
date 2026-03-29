import { z } from "zod";

// ─── Login ───────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// ─── Sign Up ─────────────────────────────────────────────────────────────────
export const signupSchema = z
  .object({
    firstName: z
      .string()
      .min(1, "First name is required")
      .min(2, "Must be at least 2 characters"),
    lastName: z
      .string()
      .min(1, "Last name is required")
      .min(2, "Must be at least 2 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Enter a valid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupFormData = z.infer<typeof signupSchema>;

// ─── Contact ─────────────────────────────────────────────────────────────────
export const CONTACT_CATEGORIES = ["Technical", "Account", "Trading", "Other"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  category: z.enum(CONTACT_CATEGORIES),
  subject: z.string().min(1, "Subject is required"),
  message: z
    .string()
    .min(1, "Message is required")
    .min(20, "Message must be at least 20 characters"),
});

export type ContactFormData = z.infer<typeof contactSchema>;
