export type CheckoutFieldMode = 'required' | 'optional' | 'hidden';

export type KitchenMenuCheckoutFields = {
  name: CheckoutFieldMode;
  email: CheckoutFieldMode;
  room: CheckoutFieldMode;
  table: CheckoutFieldMode;
  hotelName: CheckoutFieldMode;
  location: CheckoutFieldMode;
};

export const DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS: KitchenMenuCheckoutFields = {
  name: 'required',
  email: 'optional',
  room: 'optional',
  table: 'optional',
  hotelName: 'optional',
  location: 'optional',
};

const MODES: CheckoutFieldMode[] = ['required', 'optional', 'hidden'];

function parseMode(raw: unknown, fallback: CheckoutFieldMode): CheckoutFieldMode {
  return typeof raw === 'string' && MODES.includes(raw as CheckoutFieldMode)
    ? (raw as CheckoutFieldMode)
    : fallback;
}

export function parseKitchenMenuCheckoutFields(raw: unknown): KitchenMenuCheckoutFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS };
  }
  const o = raw as Record<string, unknown>;
  return {
    name: parseMode(o.name, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.name),
    email: parseMode(o.email, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.email),
    room: parseMode(o.room, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.room),
    table: parseMode(o.table, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.table),
    hotelName: parseMode(o.hotelName, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.hotelName),
    location: parseMode(o.location, DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS.location),
  };
}

export function kitchenMenuCheckoutFieldsToPayload(
  fields: KitchenMenuCheckoutFields
): KitchenMenuCheckoutFields {
  return { ...fields };
}

export function isValidCheckoutEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type CheckoutFormValues = {
  name: string;
  email: string;
  room: string;
  table: string;
  hotelName: string;
  locationAddress: string;
  locationLat?: number | null;
  locationLng?: number | null;
};

export function validateCheckoutForm(
  fields: KitchenMenuCheckoutFields,
  values: CheckoutFormValues,
  messages: {
    nameRequired: string;
    emailRequired: string;
    roomRequired: string;
    tableRequired: string;
    hotelNameRequired: string;
    locationRequired: string;
  }
): string | null {
  const name = values.name.trim();
  const email = values.email.trim();
  const room = values.room.trim();
  const table = values.table.trim();
  const hotelName = values.hotelName.trim();
  const deliveryAddress = (values.locationAddress ?? '').trim();
  const hasDeliveryAddress = deliveryAddress.length > 0;

  if (fields.name !== 'hidden' && fields.name === 'required' && name.length < 2) {
    return messages.nameRequired;
  }
  if (fields.email !== 'hidden') {
    if (fields.email === 'required' && !isValidCheckoutEmail(email)) {
      return messages.emailRequired;
    }
    if (email && !isValidCheckoutEmail(email)) {
      return messages.emailRequired;
    }
  }
  if (fields.room !== 'hidden' && fields.room === 'required' && !room) {
    return messages.roomRequired;
  }
  if (fields.table !== 'hidden' && fields.table === 'required' && !table) {
    return messages.tableRequired;
  }
  if (fields.hotelName !== 'hidden' && fields.hotelName === 'required' && !hotelName) {
    return messages.hotelNameRequired;
  }
  if (fields.location !== 'hidden' && fields.location === 'required' && !hasDeliveryAddress) {
    return messages.locationRequired;
  }
  return null;
}

export function resolveCheckoutCustomerName(
  fields: KitchenMenuCheckoutFields,
  raw: string
): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) return trimmed;
  if (fields.name === 'optional' || fields.name === 'hidden') return 'Misafir';
  return trimmed;
}
