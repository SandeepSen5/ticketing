import { useEffect, useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import Router from 'next/router';
import StripeCheckoutForm from '../../components/stripe-checkout-form';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY);

const OrderShow = ({ order }) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const findTimeLeft = () => {
      const msLeft = new Date(order.expiresAt) - new Date();
      setTimeLeft(Math.round(msLeft / 1000));
    };

    findTimeLeft();
    const timerId = setInterval(findTimeLeft, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [order]);

  if (timeLeft === null) {
    return <div>Loading...</div>;
  }

  if (timeLeft <= 0) {
    return <div>Order Expired</div>;
  }

  return (
    <div>
      Time left to pay: {timeLeft} seconds
      <Elements stripe={stripePromise}>
        <StripeCheckoutForm
          orderId={order.id}
          onSuccess={() => Router.push('/orders')}
        />
      </Elements>
    </div>
  );
};

OrderShow.getInitialProps = async (context, client) => {
  const { orderId } = context.query;
  const { data } = await client.get(`/api/orders/${orderId}`);

  return { order: data };
};

export default OrderShow;
