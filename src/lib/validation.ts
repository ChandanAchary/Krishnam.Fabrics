import { z } from 'zod';

/** Shared password policy: ≥8 chars, at least one letter and one number. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const emailSchema = z.string().min(1, 'Email is required').email('Enter a valid email address');
