import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  cached = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any });
  return cached;
}

export function isStripeConfigured(): boolean {
  return !!import.meta.env.STRIPE_SECRET_KEY;
}

export function getWebhookSecret(): string {
  const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export function getSiteUrl(): string {
  return import.meta.env.SITE_URL || import.meta.env.URL || 'https://gtownjerseys.com';
}
