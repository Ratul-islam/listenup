import { z } from 'zod';

export const OTP_LENGTH = 6;

const email = z.string().trim().min(1, 'Enter your email').pipe(z.email('Enter a valid email address'));
const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use 128 characters or fewer');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const signUpSchema = z.object({
  name: z.string().trim().max(100, 'Use 100 characters or fewer'),
  email,
  password: newPassword,
});

export const emailSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type EmailValues = z.infer<typeof emailSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
