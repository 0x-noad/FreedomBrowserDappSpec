/**
 * Freedom Browser Dapp Specification — page-facing types for `window.dapp`.
 * specVersion "1". Normative text: SPEC.md (core), providers/safe.md and
 * providers/files.md.
 *
 * `window.swarm`, `window.radicle` and `window.ethereum` are not described
 * here; they ship as before (SPEC.md §1.4).
 *
 * Usage:  /// <reference path="./dapp.d.ts" />
 *         if (window.dapp?.isFreedomBrowser) { ... }
 */

declare global {
  interface Window {
    /** Present only on bzz/ipfs/ipns/web3 top-level documents (and the dev realm); otherwise undefined. SPEC.md §7.1. */
    readonly dapp?: FreedomDapp.Dapp;
  }

namespace FreedomDapp {
  // ---------------------------------------------------------------------
  // Identity and versions
  // ---------------------------------------------------------------------

  /** The core specification version this host implements. SPEC.md §14. */
  type SpecVersion = "1";

  /** Provider ids registered in v1. `ipfs`, `chain` and `ethereum` are reserved and never appear. SPEC.md §12.1. */
  type ProviderId = "safe" | "files" | "swarm" | "radicle";

  /** `<provider>:<name>`. SPEC.md §6.1. */
  type CapabilityId =
    | "safe:store"
    | "files:own"
    | "files:read"
    | "swarm:publish"
    | "swarm:feeds"
    | "swarm:signing"
    | "swarm:messaging"
    | "radicle:node"
    | "radicle:signing";

  type Tier = "public" | "consent" | "per-call";

  // ---------------------------------------------------------------------
  // Scopes
  // ---------------------------------------------------------------------

  /** A MIME type (`image/png`) or family pattern (`image/*`). */
  type MimePattern = string;

  /** A dapp key (SPEC.md §3.2), or the literal `user` or `agent`. */
  type Author = string;
  /** In a query only: the calling dapp's own key, resolved by the host (providers/files.md §4). */
  type Self = "self";


  /** Scope objects by capability; no capability in this revision carries one (SPEC.md §6.3). */
  interface ScopeByCapability {}

  type ScopeOf<C extends CapabilityId> = C extends keyof ScopeByCapability
    ? ScopeByCapability[C]
    : never;

  // ---------------------------------------------------------------------
  // Core method params and results (SPEC.md §7.4)
  // ---------------------------------------------------------------------

  /** One requested capability; `scope` is allowed only where the capability defines one. */
  type CapabilityRequest = {
    [C in CapabilityId]: { id: C; scope?: ScopeOf<C> };
  }[CapabilityId];

  type HeldCapability = {
    [C in CapabilityId]: {
      id: C;
      scope?: ScopeOf<C>;
      tier: Tier;
      /** Always false for consent-tier capabilities. */
      alwaysAllow: boolean;
      /** The user can pause a capability without revoking it. SPEC.md §6.9. */
      enabled: boolean;
    };
  }[CapabilityId];

  /** Result of `dapp_getCapabilities` and `dapp_requestCapabilities`, and payload of `capabilitiesChanged`. */
  interface Grant {
    /** The dapp-wide pause switch. SPEC.md §6.9. */
    enabled: boolean;
    capabilities: HeldCapability[];
  }

  type ProviderStatus = "available" | "unavailable";

    interface ProviderInfo {
    id: ProviderId | string;
    /** Present only for an added dapp: availability is the user's state, not the host's. SPEC.md §7.4, §6.2. */
    status?: ProviderStatus;

    /** Ships as experimental before stable. SPEC.md §12.3. */
    experimental: boolean;
    /** The provider's own version, independent of specVersion. SPEC.md §12.3. */
    version: string;
    /** Wire method names this provider answers. */
    methods: string[];
    /** Provider-specific limits, as its document defines them. */
    limits?: Record<string, number | string | boolean>;
        /** Why `status` is "unavailable", when it is; added dapps only. */
    reason?: string;
  }

  /** Result of `dapp_getProviders`. */
  interface Providers {
    specVersion: SpecVersion;
    /** A string naming the implementation; Freedom reports "freedom" (SPEC.md §7.1). */
    host: string;
    providers: ProviderInfo[];
  }

  /** Result of `dapp_getManifest`: the record the host holds for this dapp. SPEC.md §7.4. */
  interface ManifestRecord {
    version: string;
    /** The recorded root reference. SPEC.md §5.1. */
    reference: string;
    signed: boolean;
    /** Which §5 notice is unanswered, if any: a blocked dapp can say why. Absent when none. SPEC.md §7.4. */
    pending?: "update" | "missing" | "invalid" | "key-change";
    /** `pending === "update"`; every capability-gated call rejects 4100 update_pending. SPEC.md §5.4. */
    updatePending: boolean;
    pendingVersion?: string;
  }

  /** Result of `dapp_getIdentityState`. SPEC.md §6.11, §7.4. */
  interface IdentityState {
    /** false before the host's identity onboarding or after the vault was deleted; a site that is not added always reads true. */
    exists: boolean;
    /** While true, Safe calls and signing wait for the unlock prompt. */
    locked: boolean;
    /** No unlock yet this session: Files calls wait for the unlock prompt too. Implies `locked`. */
    sealed: boolean;
  }

  interface FetchResult {
    status: number;
    headers: Record<string, string>;
    bytes: Uint8Array;
  }

  // ---------------------------------------------------------------------
  // Files provider (providers/files.md)
  // ---------------------------------------------------------------------

  /** A file's mark: `shared` is readable by every dapp holding files:read; `private` by its author alone. providers/files.md §8.1. */
  type Visibility = "shared" | "private";

  type Location = "local" | "published";

  /** One provider's publication record on a file. providers/files.md §8.6. */
  interface Publication {
    /** The provider's reference to the published bytes (Swarm: a 64-hex reference). */
    ref: string;
    /** ms since epoch. */
    at: number;
    /** true when the host matched the published bytes to this file; false when the dapp reported it. */
    verified: boolean;
  }

  interface FileEntry {
    name: string;
    /** A dapp key, `user` or `agent`. */
    author: Author;
    visibility: Visibility;
    size: number;
    type: string;
    /** CIDv1 of the bytes; also the etag. providers/files.md §8.5. */
    cid: string;
    /** ms since epoch. */
    mtime: number;
    location: Location;
    /** At most one record per provider id; `location` is "published" while any exists. */
    publications?: Record<string, Publication>;
  }

  /** What `files_write` accepts as `data`. SPEC.md §7.7. */
  type WriteData = string | Uint8Array | ArrayBuffer | Blob;

  /** A file reference: `author` omitted means the caller's own file. SPEC.md §7.8. */
  interface FileRef {
    author?: Author | Self;
    name: string;
  }

  /** At least one MIME pattern: an exact type or a one-family wildcard such as `image/*`; the all-types pattern is refused (providers/files.md §4). */
  type Types = [MimePattern, ...MimePattern[]];

  interface ListParamsBase {
    prefix?: string;
    /** Matches the end of `name` (".state"); narrows, never replaces `types`. */
    suffix?: string;
    /** Default 200, max 1000. */
    limit?: number;
    cursor?: string;
  }

  /**
   * `author: "self"` lists the dapp's own files of both marks and needs no types.
   * Anything else lists shared files only and must name types (`types_required`). providers/files.md §4.
   */
  type ListParams =
    | (ListParamsBase & { author: Self; types?: MimePattern[]; visibility?: Visibility })
    | (ListParamsBase & { types: Types; /** Narrows to one author; omitted = every author. */ author?: Author; /** A filter on `author: "self"` listings only. */ visibility?: never });

  interface ListResult {
    items: FileEntry[];
    nextCursor?: string;
  }

  /** `author` omitted means the caller's own file. */
  interface ReadParams {
    author?: Author | Self;
    name: string;
  }

  /** Wire result of `files_read`; the sugar returns a Blob instead. */
  interface ReadResult {
    bytes: Uint8Array;
    type: string;
    cid: string;
    size: number;
    mtime: number;
  }

  interface WriteParams {
    name: string;
    data: WriteData;
    /** Required; verified by sniffing. providers/files.md §8.4. */
    type: string;
    /** A new file is shared when omitted; an overwrite keeps the file's mark. */
    visibility?: Visibility;
    /** Conditional on the current CID; a mismatch, or no such file, is 4409 conflict. */
    ifMatch?: string;
    /** `"*"` = create-only; existing name is 4409 exists. */
    ifNoneMatch?: "*";
  }

  interface WriteJsonParams {
    name: string;
    value: unknown;
    visibility?: Visibility;
    ifMatch?: string;
    ifNoneMatch?: "*";
  }

  interface ReadJsonResult {
    value: unknown;
    cid: string;
  }

  interface DeleteParams {
    name: string;
  }

  interface RenameParams {
    from: string;
    to: string;
  }

  interface CopyParams {
    from: FileRef;
    to: { name: string };
    /** Omitted: the copy of an own file takes the source's mark; the copy of another author's file is shared. */
    visibility?: Visibility;
    ifNoneMatch?: "*";
  }

  interface SetVisibilityParams {
    name: string;
    visibility: Visibility;
  }

  interface SetPublicationParams {
    name: string;
    /** A provider that declares a publication record (providers/files.md §8.6). */
    provider: string;
    ref: string;
  }

  /** Same rule as `ListParams`: own files with `author: "self"`, otherwise shared files by type. */
  type SubscribeParams =
    | { author: Self; prefix?: string; suffix?: string; types?: MimePattern[] }
    | { types: Types; prefix?: string; suffix?: string; author?: Author };

  interface SubscribeResult {
    subscriptionId: string;
  }

  interface UnsubscribeParams {
    subscriptionId: string;
  }

  /** `dapp_getProviders` → `providers[].limits` for `files`: the fixed figure only (providers/files.md §8.2). */
  interface FilesLimits {
    /** 536870912 (512 MB) per file. */
    fileBytes: number;
  }

  /** Result of `files_getQuota`. providers/files.md §8.2. */
  interface FilesQuota {
    used: number;
    /** This dapp's allowance (default 1 GB, user-adjustable), covering its files of both marks. */
    limit: number;
    /** min(allowance free, pool free) with a files grant; the allowance's free space alone without. */
    free: number;
    /** 536870912 (512 MB). */
    fileLimit: number;
    /** Present only while the dapp holds files:own or files:read (providers/files.md §8.2). */
    pool?: { used: number; limit: number; free: number };
  }

  type FilesChangedKind = "created" | "modified" | "deleted" | "renamed" | "published" | "visibility";

  /** Payload of `files:changed`. providers/files.md §5. */
  interface FilesChanged {
    author: Author;
    name: string;
    kind: FilesChangedKind;
    cid: string;
    visibility: Visibility;
    /** Old name, for `renamed`. */
    from?: string;
    /** The new record with its provider, for `published`. */
    publication?: Publication & { provider: string };
  }

  // ---------------------------------------------------------------------
  // Safe provider (providers/safe.md)
  // ---------------------------------------------------------------------

  /** A JSON value. */
  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

  /** What `safe_set` accepts: a JSON value, or bytes. */
  type SafeValue = Json | Uint8Array | ArrayBuffer | Blob;

  /** A key's facts, without its value. providers/safe.md §4. */
  interface SafeItem {
    /** 1–128 characters from A–Z a–z 0–9 . _ : / - */
    key: string;
    kind: "json" | "bytes";
    /** Stored length in bytes. */
    size: number;
    /** Opaque; changes whenever the value does. */
    etag: string;
    /** ms since epoch. */
    mtime: number;
  }

  /** Result of `safe_get`: the item with its value; bytes come back as Uint8Array. */
  type SafeEntry =
    | (SafeItem & { kind: "json"; value: Json })
    | (SafeItem & { kind: "bytes"; value: Uint8Array });

  interface SafeSetParams {
    key: string;
    value: SafeValue;
    /** Conditional on the current etag; a mismatch, or an absent key, is 4409 conflict. */
    ifMatch?: string;
    /** `"*"` = create-only; existing key is 4409 exists. */
    ifNoneMatch?: "*";
  }

  interface SafeKeysParams {
    prefix?: string;
    /** Default 200, max 1000. */
    limit?: number;
    cursor?: string;
  }

  /** `dapp_getProviders` → `providers[].limits` for `safe` (providers/safe.md §8.2). */
  interface SafeLimits {
    /** 67108864 (64 MB) per dapp. */
    bytes: number;
    /** 8388608 (8 MB) per value. */
    valueBytes: number;
    /** 1000. */
    keys: number;
  }

  /** Result of `safe_getQuota`. */
  interface SafeQuota {
    used: number;
    /** 67108864 (64 MB). */
    limit: number;
    free: number;
    count: number;
    /** 1000. */
    countLimit: number;
    /** 8388608 (8 MB). */
    valueLimit: number;
  }

  /** Payload of `safe:changed`. providers/safe.md §5. */
  interface SafeChanged {
    key: string;
    change: "set" | "deleted";
    /** The new etag, for `set`. */
    etag?: string;
  }

  // ---------------------------------------------------------------------
  // Wire: method name → params → result (SPEC.md §7.2–7.4, providers/safe.md §4, providers/files.md §4)
  // ---------------------------------------------------------------------

  interface Methods {
    dapp_requestCapabilities: { params: { capabilities: CapabilityRequest[] }; result: Grant };
    dapp_getCapabilities: { params?: undefined; result: Grant };
    dapp_getProviders: { params?: undefined; result: Providers };
    dapp_relinquish: { params?: { capabilities?: CapabilityId[] }; result: Record<string, never> };
    dapp_getManifest: { params?: undefined; result: ManifestRecord };
    dapp_cancelJob: { params: { jobId: string }; result: Record<string, never> };
    dapp_getIdentityState: { params?: undefined; result: IdentityState };
    /** web3:// origins only. SPEC.md §7.14. */
    dapp_fetch: { params: { url: string }; result: FetchResult };

    safe_get: { params: { key: string }; result: SafeEntry | null };
    safe_set: { params: SafeSetParams; result: SafeItem };
    safe_delete: { params: { key: string }; result: Record<string, never> };
    safe_keys: { params?: SafeKeysParams; result: { items: SafeItem[]; nextCursor?: string } };
    safe_subscribe: { params?: { prefix?: string }; result: SubscribeResult };
    safe_unsubscribe: { params: UnsubscribeParams; result: Record<string, never> };
    safe_getQuota: { params?: undefined; result: SafeQuota };

    files_list: { params: ListParams; result: ListResult };
    files_read: { params: ReadParams; result: ReadResult };
    files_stat: { params: ReadParams; result: FileEntry };
    files_readJson: { params: ReadParams; result: ReadJsonResult };
    files_write: { params: WriteParams; result: FileEntry };
    files_writeJson: { params: WriteJsonParams; result: FileEntry };
    files_delete: { params: DeleteParams; result: Record<string, never> };
    files_rename: { params: RenameParams; result: FileEntry };
    files_copy: { params: CopyParams; result: FileEntry };
    files_setVisibility: { params: SetVisibilityParams; result: FileEntry };
    files_setPublication: { params: SetPublicationParams; result: FileEntry };
    files_subscribe: { params: SubscribeParams; result: SubscribeResult };
    files_unsubscribe: { params: UnsubscribeParams; result: Record<string, never> };
    files_getQuota: { params?: undefined; result: FilesQuota };
  }

  type MethodName = keyof Methods;

  type ParamsOf<M extends MethodName> = Methods[M] extends { params?: infer P } ? P : never;
  type ResultOf<M extends MethodName> = Methods[M] extends { result: infer R } ? R : never;

  interface RequestArgs<M extends MethodName = MethodName> {
    method: M;
    params?: ParamsOf<M>;
  }

  // ---------------------------------------------------------------------
  // Events (SPEC.md §7.5)
  // ---------------------------------------------------------------------

  interface JobEventBase {
    jobId: string;
    provider: ProviderId | string;
  }

  interface JobProgress extends JobEventBase {
    done: number;
    total?: number;
    phase?: string;
  }

  interface JobDone extends JobEventBase {
    result: unknown;
  }

  interface JobFailed extends JobEventBase {
    error: ProviderError;
  }

  interface Events {
    capabilitiesChanged: Grant;
    updatePending: { fromVersion: string; toVersion: string };
    updateApplied: { version: string };
    providersChanged: Providers;
    /** The identity vault was created, deleted, unsealed, locked or unlocked; added dapps only. SPEC.md §6.11. */
    identityChanged: IdentityState;
    "job:progress": JobProgress;
    "job:done": JobDone;
    "job:failed": JobFailed;
    "safe:changed": SafeChanged;
    "files:changed": FilesChanged;
  }

  type EventName = keyof Events;

  // ---------------------------------------------------------------------
  // Errors (SPEC.md §7.13)
  // ---------------------------------------------------------------------

  type ErrorCode =
    | 4001 // user rejected
    | 4100 // not authorized
    | 4200 // unknown method
    | 4300 // quota exceeded
    | 4409 // conflict
    | 4900 // provider unavailable
    | -32602 // invalid params
    | -32005 // rate limited
    | -32603; // internal

  type CoreReason =
    // 4001
    | "user_rejected"
    | "cooldown"
    | "sheet_busy"
    | "navigated"
    // 4100
    | "unauthorized"
    | "disabled"
    | "locked"
    | "no_identity"
    | "update_pending"
    | "no_manifest"
    | "not_in_manifest"
    | "agent_custody"
    // 4409
        | "conflict"
    | "exists"
    // -32602
    | "payload_too_large"
    // -32603
    | "timeout"
    | "cancelled";

  type FilesReason =
    // 4300
    | "dapp_quota"
    | "pool_quota"
    | "file_too_large"
    // 4900
    | "store_unavailable"
    // -32602
    | "invalid_name"
    | "invalid_type"
    | "invalid_visibility"
    | "type_mismatch"
    | "not_found"
    | "types_required"
    | "unknown_provider"
    | "invalid_reference"
    | "invalid_cursor"
    | "invalid_subscription"
    | "too_many_subscriptions"
    | "invalid_json"
    // -32603
    | "disk_full"
    | "io_error";

  type SafeReason =
    // 4300
    | "safe_quota"
    | "value_too_large"
    | "too_many_keys"
    // 4900
    | "store_unavailable"
    // -32602
    | "invalid_key"
    | "invalid_value"
    | "invalid_cursor"
    | "invalid_subscription"
    | "too_many_subscriptions"
    // -32603
    | "disk_full"
    | "io_error";

  interface ErrorData {
    reason?: CoreReason | FilesReason | SafeReason | string;
    /** With 4300 and some -32602. */
    limit?: number;
    actual?: number;
    /** With -32005. */
    retryAfterMs?: number;
    [key: string]: unknown;
  }

  interface ProviderError extends Error {
    code: ErrorCode;
    message: string;
    data?: ErrorData;
  }

  // ---------------------------------------------------------------------
  // The object (SPEC.md §7.1–7.2)
  // ---------------------------------------------------------------------

  type Listener<E extends EventName> = (payload: Events[E]) => void;

  interface EventEmitter {
    on<E extends EventName>(event: E, listener: Listener<E>): this;
    addListener<E extends EventName>(event: E, listener: Listener<E>): this;
    removeListener<E extends EventName>(event: E, listener: Listener<E>): this;
  }

  /** Sugar over the Safe methods. SPEC.md §7.2; providers/safe.md §4. */
  interface SafeSugar {
    /** The item with its value, or `null` when the key is absent. */
    get(params: { key: string }): Promise<SafeEntry | null>;
    set(params: SafeSetParams): Promise<SafeItem>;
    delete(params: { key: string }): Promise<Record<string, never>>;
    keys(params?: SafeKeysParams): Promise<{ items: SafeItem[]; nextCursor?: string }>;
    subscribe(params?: { prefix?: string }): Promise<SubscribeResult>;
    unsubscribe(params: UnsubscribeParams): Promise<Record<string, never>>;
    getQuota(): Promise<SafeQuota>;
  }

  /** Sugar over the Files methods, with Blob/Uint8Array conversions. SPEC.md §7.2, §7.7. */
  interface FilesSugar {
    list(params: ListParams): Promise<ListResult>;
    /** Resolves a Blob whose `type` is the stored MIME type. */
    read(params: ReadParams): Promise<Blob>;
    /** `read` decoded as UTF-8. */
    readText(params: ReadParams): Promise<string>;
    stat(params: ReadParams): Promise<FileEntry>;
    readJson<T = unknown>(params: ReadParams): Promise<{ value: T; cid: string }>;
    write(params: WriteParams): Promise<FileEntry>;
    writeJson(params: WriteJsonParams): Promise<FileEntry>;
    delete(params: DeleteParams): Promise<Record<string, never>>;
    rename(params: RenameParams): Promise<FileEntry>;
    copy(params: CopyParams): Promise<FileEntry>;
    setVisibility(params: SetVisibilityParams): Promise<FileEntry>;
    setPublication(params: SetPublicationParams): Promise<FileEntry>;
    subscribe(params: SubscribeParams): Promise<SubscribeResult>;
    unsubscribe(params: UnsubscribeParams): Promise<Record<string, never>>;
    getQuota(): Promise<FilesQuota>;
  }

  interface Dapp extends EventEmitter {
    /** `true` on Freedom; unset on another host. SPEC.md §7.1. */
    readonly isFreedomBrowser?: true;
    readonly specVersion: SpecVersion;

    /** The one wire. SPEC.md §7.2. */
    request<M extends MethodName>(args: RequestArgs<M>): Promise<ResultOf<M>>;

    // Core sugar (SPEC.md §7.4)
    requestCapabilities(params: { capabilities: CapabilityRequest[] }): Promise<Grant>;
    getCapabilities(): Promise<Grant>;
    getProviders(): Promise<Providers>;
    relinquish(params?: { capabilities?: CapabilityId[] }): Promise<Record<string, never>>;
    getManifest(): Promise<ManifestRecord>;
    getIdentityState(): Promise<IdentityState>;
    cancelJob(params: { jobId: string }): Promise<Record<string, never>>;
    /** Present on web3:// origins only; absent elsewhere. SPEC.md §7.14. */
    fetch?(params: { url: string }): Promise<Response>;

    readonly safe: SafeSugar;
    readonly files: FilesSugar;
  }

  // ---------------------------------------------------------------------
  // Manifest (SPEC.md §4; schemas/freedom-manifest-2.schema.json)
  // ---------------------------------------------------------------------

  interface CapabilityRow {
    /** ≤ 140 characters, shown on the consent sheet. */
    why: string;
  }

  type SafeManifestBlock = {
    store?: CapabilityRow;
  };

  type FilesManifestBlock = {
    own?: CapabilityRow;
    read?: CapabilityRow;
  };

  /** Byte-for-byte freedom-manifest/1's block. */
  type SwarmManifestBlock = {
    publish?: CapabilityRow;
    feeds?: CapabilityRow;
    signing?: CapabilityRow;
    messaging?: CapabilityRow;
  };

  type RadicleManifestBlock = {
    node?: CapabilityRow;
    signing?: CapabilityRow;
  };

  /** Any provider's block: rows keyed by capability name. */
  type ManifestBlock = Record<string, CapabilityRow & { scope?: unknown }>;

  interface Manifest {
    /** Editor hint, ignored by the host; served file only. SPEC.md §4.2. */
    "$schema"?: string;
    schema: "freedom-manifest/2";
    /** ≤ 32 characters; display only. */
    name: string;
    /** ≤ 160 characters. */
    description: string;
    /** Relative path on served schemes; `data:` URI on web3://. */
    icon: string;
    /** ≤ 32 characters. */
    version: string;
    capabilities: {
      safe?: SafeManifestBlock;
      files?: FilesManifestBlock;
      swarm?: SwarmManifestBlock;
      radicle?: RadicleManifestBlock;
      /** Unknown providers are allowed and shown as ungrantable. */
      [provider: string]: ManifestBlock | undefined;
    };
    homepage?: string;
    source?: string;
    author?: { name: string; url?: string };
    minSpecVersion?: string;
    publicKey?: string;
    signature?: string;
    /** The previous key's endorsement of `publicKey`, read only when the key changed. SPEC.md §4.6. */
    rotation?: { from: string; signature: string };
  }
}
}

export {};
