import Stripe from 'stripe';

// No apiVersion pinned: the SDK uses the version bundled with the installed package
export const stripe = new Stripe(process.env.STRIPE_KEY!);
