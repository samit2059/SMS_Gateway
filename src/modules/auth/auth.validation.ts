import { z } from "zod";

const passwordSchema = z
  .string()
  .min(5, "password must be atleast 5 character")
  .max(40)
  .regex(/[A-Z]/, "Must include at least one uppercase letter")
  .regex(/[0-9]/, "Must include at least one number");


export const registerSchema = z.object({
    name: z.string().trim().min(1, "name is required").max(100),
    email: z.email(),
    password: passwordSchema,
})


export const loginSchema = z.object({
    email: z.email(),
    password: passwordSchema,
})
