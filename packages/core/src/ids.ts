/**
 * Stable identifiers.
 *
 * Engineering objects must survive UI re-renders, database re-imports and
 * SketchUp round trips. Every persisted entity therefore owns an opaque,
 * prefixed identifier that is never derived from a rendering index, an array
 * position or a transient React key.
 *
 * Prefixes make logs, API payloads and audit records readable without a join,
 * and make it impossible to hand a project id to an endpoint expecting an
 * equipment id by accident.
 */

export const ID_PREFIXES = {
  organization: "org",
  user: "usr",
  membership: "mem",
  session: "ses",
  project: "prj",
  building: "bld",
  level: "lvl",
  room: "rm",
  wall: "wal",
  equipment: "eq",
  terminal: "trm",
  connection: "cn",
  circuit: "ckt",
  route: "rte",
  routeSegment: "rgs",
  validation: "val",
  calculation: "calc",
  revision: "rev",
  audit: "aud",
  task: "tsk",
  inspection: "ins",
  asset: "ast",
  document: "doc",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

export type EntityId<K extends IdKind = IdKind> = string & { readonly __idKind?: K };

const ID_PATTERN = /^[a-z]{2,3}_[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isEntityId(value: unknown, kind?: IdKind): value is EntityId {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) return false;
  if (!kind) return true;
  return value.startsWith(`${ID_PREFIXES[kind]}_`);
}

export function assertEntityId(value: unknown, kind: IdKind): EntityId {
  if (!isEntityId(value, kind)) {
    throw new Error(`Expected a ${kind} id (prefix "${ID_PREFIXES[kind]}_"), received: ${String(value)}`);
  }
  return value;
}

/**
 * Creates a new identifier. Uses the runtime crypto UUID (available in Node 20+
 * and every supported browser) so ids remain globally unique across offline
 * clients that later synchronise.
 */
export function newId<K extends IdKind>(kind: K): EntityId<K> {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) {
    throw new Error("crypto.randomUUID is unavailable in this runtime");
  }
  return `${ID_PREFIXES[kind]}_${uuid}` as EntityId<K>;
}

/**
 * Deterministic id for fixtures, seeds and tests. The caller is responsible for
 * uniqueness; this is intentionally explicit rather than implicit.
 */
export function fixtureId<K extends IdKind>(kind: K, slug: string): EntityId<K> {
  const safe = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!safe) throw new Error("fixtureId requires a non-empty slug");
  return `${ID_PREFIXES[kind]}_${safe}` as EntityId<K>;
}
