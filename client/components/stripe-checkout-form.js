import { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axios from 'axios';

// Replaces the old react-stripe-checkout/token flow. Stripe's Charges API
// (a raw card token) is blocked for India-based accounts, so payment now
// goes through a PaymentIntent that is confirmed here, in the browser -
// this is also what lets Stripe show the extra authentication step (3DS/OTP)
// when a card requires it.
//
// For an India-based Stripe account, a foreign-currency (export) charge also
// requires the customer's name and billing address on the payment method -
// see https://stripe.com/docs/india-exports - so we collect that here too.
const StripeCheckoutForm = ({ orderId, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [billing, setBilling] = useState({
    name: '',
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  });

  const updateBilling = (field) => (event) =>
    setBilling((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Step 1: ask the server for a PaymentIntent tied to this order.
      const { data } = await axios.post('/api/payments/create-intent', {
        orderId,
      });

      // Step 2: confirm the card against that intent, right here in the
      // browser. Stripe handles any required OTP/3DS challenge itself.
      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: billing.name,
            address: {
              line1: billing.line1,
              city: billing.city,
              state: billing.state,
              postal_code: billing.postalCode,
              country: billing.country.toUpperCase(),
            },
          },
        },
      });

      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }

      // Step 3: tell the server the intent succeeded, so it can record the
      // payment and publish payment:created.
      await axios.post('/api/payments', {
        orderId,
        paymentIntentId: result.paymentIntent.id,
      });

      onSuccess();
    } catch (err) {
      const message =
        err.response?.data?.errors?.[0]?.message ||
        err.message ||
        'Something went wrong';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Name on card</label>
        <input
          className="form-control"
          required
          value={billing.name}
          onChange={updateBilling('name')}
        />
      </div>
      <div className="form-group">
        <label>Billing address</label>
        <input
          className="form-control mb-2"
          placeholder="Address line 1"
          required
          value={billing.line1}
          onChange={updateBilling('line1')}
        />
        <div className="form-row">
          <div className="col mb-2">
            <input
              className="form-control"
              placeholder="City"
              required
              value={billing.city}
              onChange={updateBilling('city')}
            />
          </div>
          <div className="col mb-2">
            <input
              className="form-control"
              placeholder="State"
              value={billing.state}
              onChange={updateBilling('state')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="col mb-2">
            <input
              className="form-control"
              placeholder="Postal code"
              required
              value={billing.postalCode}
              onChange={updateBilling('postalCode')}
            />
          </div>
          <div className="col mb-2">
            <input
              className="form-control"
              placeholder="Country (e.g. US)"
              maxLength={2}
              required
              value={billing.country}
              onChange={updateBilling('country')}
            />
          </div>
        </div>
      </div>
      <div className="form-group">
        <label>Card details</label>
        <CardElement className="form-control" options={{ hidePostalCode: true }} />
      </div>
      <button
        className="btn btn-primary"
        disabled={!stripe || submitting}
        type="submit"
      >
        {submitting ? 'Processing...' : 'Pay With Card'}
      </button>
      {error && (
        <div className="alert alert-danger mt-2">
          <ul className="my-0">
            <li>{error}</li>
          </ul>
        </div>
      )}
    </form>
  );
};

export default StripeCheckoutForm;
