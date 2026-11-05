/**
 * The rules of the queue of changes that have not reached the server: which of them have to wait for another, which go
 * with another when it is given up, and how an id that turned out different is put right in what is left.
 */
import type { Mark, Op } from './types';

export type OpMeta = {
  // What the operation is about.
  subject: string;
  // What it brings into being on the server (the thing itself, and the racket an order names).
  creates: string[];
  // What else has to be there before it can be done.
  needs: string[];
  // A change of the stock is added to what is there, so it does not have to wait for the others of the same item.
  commutes: boolean;
};

const ids = (values: (string | null | undefined)[]) => values.filter((value): value is string => !!value);

export function opMeta(op: Op): OpMeta {
  const meta = (creates: string[], needs: string[], commutes = false): OpMeta => ({
    subject: op.subject,
    creates,
    needs,
    commutes,
  });
  switch (op.type) {
    case 'client.create':
    case 'string.create':
    case 'service.create':
      return meta([op.subject], []);
    case 'racket.create':
      return meta([op.subject], ids([op.fields.client_id]));
    case 'racket.update':
      return meta([], ids([op.patch.client_id]));
    case 'racket.stock':
    case 'string.stock':
      return meta([], [], true);
    case 'order.create':
      return meta(ids([op.subject, op.input.new_racket?.id]), orderNeeds(op.input));
    case 'order.update':
      return meta(ids([op.patch.new_racket?.id]), orderNeeds(op.patch));
    case 'photo.delete':
      return meta([], [op.orderId]);
    default:
      return meta([], []);
  }
}

function orderNeeds(input: {
  client_id?: string;
  racket_id?: string;
  main_string_id?: string | null;
  cross_string_id?: string | null;
  services?: { service_id: string | null }[];
}) {
  return ids([
    input.client_id,
    input.racket_id,
    input.main_string_id,
    input.cross_string_id,
    ...(input.services ?? []).map((line) => line.service_id),
  ]);
}

/** Whether `later` cannot be sent while `earlier` has not been: it uses what `earlier` is to make, or changes the same thing. */
function waitsFor(earlier: OpMeta, later: OpMeta) {
  if (earlier.creates.some((id) => id === later.subject || later.needs.includes(id))) return true;
  return earlier.subject === later.subject && !earlier.commutes && !later.commutes;
}

/**
 * The queue with every operation after those it cannot be sent before: the ones that make what it points at, and the earlier ones
 * that change the same thing. A change that makes an operation point at something made later in the queue (an order given a client
 * who was added after it) moves it after that, with whatever waits for it; the rest keep the order they had. The queue it answers
 * is the one it was given when there is nothing to put right.
 */
export function inOrder(ops: readonly Op[]): readonly Op[] {
  const metas = ops.map(opMeta);
  // For each operation, the ones it has to come after.
  const after = ops.map((_, later) => {
    const needed: number[] = [];
    for (let earlier = 0; earlier < ops.length; earlier++) {
      if (earlier === later) continue;
      const makes = metas[earlier].creates.some((id) => id === metas[later].subject || metas[later].needs.includes(id));
      const sameThing =
        earlier < later &&
        metas[earlier].subject === metas[later].subject &&
        !metas[earlier].commutes &&
        !metas[later].commutes;
      if (makes || sameThing) needed.push(earlier);
    }
    return needed;
  });

  const placed = new Set<number>();
  const result: Op[] = [];
  while (result.length < ops.length) {
    let next = ops.findIndex((_, index) => !placed.has(index) && after[index].every((before) => placed.has(before)));
    // Two operations that each wait for the other cannot be put in order: what is left keeps the order it has.
    if (next === -1) next = ops.findIndex((_, index) => !placed.has(index));
    placed.add(next);
    result.push(ops[next]);
  }
  return result.every((op, index) => op === ops[index]) ? ops : result;
}

/**
 * The operations that cannot go yet, each with the one it waits for: they follow an operation that the server refused (or one that
 * waits itself) and depend on it. The others go on.
 */
export function blockedBy(ops: readonly Op[]): Map<string, string> {
  const stuck: { op: Op; meta: OpMeta }[] = [];
  const blocked = new Map<string, string>();
  for (const op of ops) {
    const meta = opMeta(op);
    const blocker = stuck.find((other) => waitsFor(other.meta, meta));
    if (blocker) {
      blocked.set(op.id, blocker.op.id);
      stuck.push({ op, meta });
    } else if (op.failure) {
      stuck.push({ op, meta });
    }
  }
  return blocked;
}

/** What goes when this operation is given up: it, and whatever was to be done to what it was to make. */
export function discardSet(ops: readonly Op[], opId: string): Set<string> {
  const first = ops.find((op) => op.id === opId);
  if (!first) return new Set();
  const gone = new Set([first.id]);
  const made = new Set(opMeta(first).creates);
  let grew = true;
  while (grew) {
    grew = false;
    for (const op of ops) {
      if (gone.has(op.id)) continue;
      const meta = opMeta(op);
      if (made.has(meta.subject) || meta.needs.some((id) => made.has(id))) {
        gone.add(op.id);
        for (const id of meta.creates) made.add(id);
        grew = true;
      }
    }
  }
  return gone;
}

/** The queue with an id replaced by another wherever it is named (the server used a racket it already had, not the one that was named). */
export function remapId(ops: readonly Op[], from: string, to: string): Op[] {
  return ops.map((op) => {
    const text = JSON.stringify(op);
    return text.includes(from) ? (JSON.parse(text.split(from).join(to)) as Op) : op;
  });
}

/** For each thing a change is waiting on: whether it is only waiting to go, has been refused, or waits for something that was refused. */
export function marksOf(ops: readonly Op[], blocked: ReadonlyMap<string, string>): Map<string, Mark> {
  const rank: Record<Mark, number> = { pending: 0, blocked: 1, failed: 2 };
  const marks = new Map<string, Mark>();
  const mark = (id: string, value: Mark) => {
    const current = marks.get(id);
    if (!current || rank[value] > rank[current]) marks.set(id, value);
  };
  for (const op of ops) {
    const value: Mark = op.failure ? 'failed' : blocked.has(op.id) ? 'blocked' : 'pending';
    mark(op.subject, value);
    if (op.type === 'photo.delete') mark(op.orderId, value);
  }
  return marks;
}
