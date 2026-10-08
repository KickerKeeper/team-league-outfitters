// How a parent receives a finished order. Chosen on the order form before
// checkout; "ship" adds a flat shipping line and collects an address in Stripe.

export type DeliveryId = 'pickup' | 'ship';

export interface DeliveryOption {
  id: DeliveryId;
  label: string;
  priceCents: number;
  note: string;
}

export const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: 'pickup',
    label: 'Porch pickup in Georgetown',
    priceCents: 0,
    note: "Free. You'll be contacted by email with pickup details once your order is ready.",
  },
  {
    id: 'ship',
    label: 'Ship to home',
    priceCents: 1000,
    note: "Flat $10. You'll enter the shipping address on the checkout page.",
  },
];

export const ORDER_TIMING_NOTE =
  'All orders placed by November 9, 2026 will be ready before the first weekend in December.';

export function getDelivery(id: string | undefined | null): DeliveryOption | undefined {
  return DELIVERY_OPTIONS.find((d) => d.id === id);
}

export function deliverySummary(d: DeliveryOption): string {
  return d.priceCents > 0 ? `${d.label} ($${(d.priceCents / 100).toFixed(2)})` : `${d.label} (free)`;
}
