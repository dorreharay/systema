/**
 * What can go wrong when something is bought (see store.ts and billing.ts). Each case is a class of its own so that the screen says the
 * right thing, or nothing at all (a person who closed the sheet needs no message).
 */

/** There is no store on this device: the SDK is not in this build, its key is not set, or this is the web. */
export class StoreUnavailableError extends Error {
  constructor() {
    super('The store is not available in this build');
    this.name = 'StoreUnavailableError';
  }
}

/** The person closed the purchase sheet. Nothing was bought, and there is nothing to say. */
export class PurchaseCancelledError extends Error {
  constructor() {
    super('The purchase was cancelled');
    this.name = 'PurchaseCancelledError';
  }
}

/** The purchase waits for someone's approval (Ask to Buy, a card that needs a check): the plan turns on when it is approved. */
export class PurchasePendingError extends Error {
  constructor() {
    super('The purchase is waiting for approval');
    this.name = 'PurchasePendingError';
  }
}

/**
 * The purchase went through, but the server could not read it yet. RevenueCat tells the server in a moment on its own, and the app
 * reads the profile again whenever it comes to the front.
 */
export class PurchaseNotSyncedError extends Error {
  constructor() {
    super('The purchase went through, but the plan has not been updated yet');
    this.name = 'PurchaseNotSyncedError';
  }
}
