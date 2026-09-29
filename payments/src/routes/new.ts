import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import {
  requireAuth,
  validateRequest,
  BadRequestError,
  NotAuthorizedError,
  NotFoundError,
  OrderStatus,
} from '@go-tickets/common';
import { stripe } from '../stripe';
import { Order } from '../models/order';
import { Payment } from '../models/payment';
import { PaymentCreatedPublisher } from '../events/publishers/payment-created-publisher';
import { natsWrapper } from '../nats-wrapper';

const router = express.Router();

// Shared checks: the order must exist, belong to this user, and still be payable.
async function findPayableOrder(orderId: string, userId: string) {
  const order = await Order.findById(orderId);

  if (!order) {
    throw new NotFoundError();
  }
  if (order.userId !== userId) {
    throw new NotAuthorizedError();
  }
  if (order.status === OrderStatus.Cancelled) {
    throw new BadRequestError('Cannot pay for an cancelled order');
  }

  return order;
}

// Step 1: create a PaymentIntent and hand the client its secret.
// The Charges API (a raw card token) is no longer accepted for India-based
// Stripe accounts, so the card is confirmed client-side against this intent.
router.post(
  '/api/payments/create-intent',
  requireAuth,
  [body('orderId').not().isEmpty()],
  validateRequest,
  async (req: Request, res: Response) => {
    const { orderId } = req.body;
    const order = await findPayableOrder(orderId, req.currentUser!.id);

    let intent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(order.price * 100),
        currency: 'usd',
        // Required by Indian export regulations for foreign-currency charges;
        // see https://stripe.com/docs/india-exports
        description: `Ticket order ${order.id}`,
        metadata: { orderId: order.id },
      });
    } catch (err) {
      console.error('STRIPE PAYMENT INTENT CREATE FAILED:', err);
      throw err;
    }

    res.status(201).send({ clientSecret: intent.client_secret });
  }
);

// Step 2: once the client has confirmed the card against the intent,
// verify it actually succeeded before recording the payment.
router.post(
  '/api/payments',
  requireAuth,
  [
    body('orderId').not().isEmpty(),
    body('paymentIntentId').not().isEmpty(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    const { orderId, paymentIntentId } = req.body;
    const order = await findPayableOrder(orderId, req.currentUser!.id);

    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      console.error('STRIPE PAYMENT INTENT RETRIEVE FAILED:', err);
      throw err;
    }

    if (intent.metadata.orderId !== order.id) {
      throw new BadRequestError('Payment intent does not match this order');
    }
    if (intent.status !== 'succeeded') {
      throw new BadRequestError('Payment has not succeeded');
    }

    const existingPayment = await Payment.findOne({ stripeId: intent.id });
    if (existingPayment) {
      // Already recorded (e.g. a retried request) - don't publish twice.
      return res.status(201).send({ id: existingPayment.id });
    }

    const payment = Payment.build({
      orderId,
      stripeId: intent.id,
    });
    await payment.save();
    await new PaymentCreatedPublisher(natsWrapper.client).publish({
      id: payment.id,
      orderId: payment.orderId,
      stripeId: payment.stripeId,
    });

    res.status(201).send({ id: payment.id });
  }
);

export { router as createChargeRouter };
