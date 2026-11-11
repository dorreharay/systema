/**
 * The offline layer as the app has it: one store on the phone's storage, one engine that takes it to the server with the
 * signed-in person's token, and the actions the screens use. Everything else of the layer is plain logic that knows nothing of
 * React Native (and is tested in plain Node); this is the one file that joins it to the app.
 */
import { api } from '@/lib/api';
import type { OrderCap } from '@/lib/subscription';

import { createActions } from './actions';
import { FileStorage } from './file-storage';
import { OfflineStore } from './store';
import { SyncEngine, type Request } from './sync';

export const offlineStore = new OfflineStore(new FileStorage());

let token: string | null = null;
let sessionEnded: () => void = () => undefined;

/** What the engine needs of the session: the token to send, and what to do when the server says it is over. */
export function bindSession(session: { token: string | null; onEnded: () => void }) {
  token = session.token;
  sessionEnded = session.onEnded;
}

const transport = (request: Request) =>
  api<unknown>(request.path, { method: request.method, body: request.body, token, timeoutMs: request.timeoutMs });

export const engine = new SyncEngine(offlineStore, transport, { onUnauthorized: () => sessionEnded() });

let orderCap: () => OrderCap | null = () => null;
let stockOn: () => boolean = () => true;

/**
 * What the plan of the account allows on this phone, asked each time an order is made (see lib/subscription.ts): the limit of orders in
 * a month, and whether the stock is counted. `null`: no plan limits anything.
 */
export function bindPlan(rules: { orderCap: () => OrderCap | null; stockOn: () => boolean } | null) {
  orderCap = rules?.orderCap ?? (() => null);
  stockOn = rules?.stockOn ?? (() => true);
}

export const offlineActions = createActions(offlineStore, engine, { orderCap: () => orderCap(), stockOn: () => stockOn() });
