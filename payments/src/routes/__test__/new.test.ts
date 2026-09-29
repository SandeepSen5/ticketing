import mongoose from 'mongoose';
import request from 'supertest';
import { OrderStatus } from '@go-tickets/common';
import { app } from '../../app';
import { Order } from '../../models/order';
import { stripe } from '../../stripe';
import { Payment } from '../../models/payment';

// Never call the real Stripe API from tests
jest.mock('../../stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  },
}));

const buildOrder = async (overrides: Partial<{ userId: string; price: number; status: OrderStatus }> = {}) => {
  const order = Order.build({
    id: new mongoose.Types.ObjectId().toHexString(),
    userId: overrides.userId ?? new mongoose.Types.ObjectId().toHexString(),
    version: 0,
    price: overrides.price ?? 20,
    status: overrides.status ?? OrderStatus.Created,
  });
  await order.save();
  return order;
};

describe('POST /api/payments/create-intent', () => {
  it('returns a 404 when the order does not exist', async () => {
    await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', global.signin())
      .send({ orderId: new mongoose.Types.ObjectId().toHexString() })
      .expect(404);
  });

  it('returns a 401 when the order does not belong to the user', async () => {
    const order = await buildOrder();

    await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', global.signin())
      .send({ orderId: order.id })
      .expect(401);
  });

  it('returns a 400 when the order is cancelled', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const order = await buildOrder({ userId, status: OrderStatus.Cancelled });

    await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', global.signin(userId))
      .send({ orderId: order.id })
      .expect(400);
  });

  it('returns a client secret for a valid order', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const price = Math.floor(Math.random() * 100000) + 1;
    const order = await buildOrder({ userId, price });

    (stripe.paymentIntents.create as jest.Mock).mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret_abc',
    });

    const { body } = await request(app)
      .post('/api/payments/create-intent')
      .set('Cookie', global.signin(userId))
      .send({ orderId: order.id })
      .expect(201);

    expect(body.clientSecret).toEqual('pi_test_123_secret_abc');
    const createOptions = (stripe.paymentIntents.create as jest.Mock).mock.calls[0][0];
    expect(createOptions.amount).toEqual(price * 100);
    expect(createOptions.currency).toEqual('usd');
    expect(createOptions.metadata.orderId).toEqual(order.id);
  });
});

describe('POST /api/payments', () => {
  it('returns a 400 when the payment intent has not succeeded', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const order = await buildOrder({ userId });

    (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({
      id: 'pi_test_123',
      status: 'requires_action',
      metadata: { orderId: order.id },
    });

    await request(app)
      .post('/api/payments')
      .set('Cookie', global.signin(userId))
      .send({ orderId: order.id, paymentIntentId: 'pi_test_123' })
      .expect(400);
  });

  it('returns a 400 when the intent belongs to a different order', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const order = await buildOrder({ userId });

    (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
      metadata: { orderId: 'some-other-order-id' },
    });

    await request(app)
      .post('/api/payments')
      .set('Cookie', global.signin(userId))
      .send({ orderId: order.id, paymentIntentId: 'pi_test_123' })
      .expect(400);
  });

  it('returns a 201 and saves a payment when the intent succeeded', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const order = await buildOrder({ userId });

    (stripe.paymentIntents.retrieve as jest.Mock).mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
      metadata: { orderId: order.id },
    });

    await request(app)
      .post('/api/payments')
      .set('Cookie', global.signin(userId))
      .send({ orderId: order.id, paymentIntentId: 'pi_test_123' })
      .expect(201);

    const payment = await Payment.findOne({
      orderId: order.id,
      stripeId: 'pi_test_123',
    });
    expect(payment).not.toBeNull();
  });
});
