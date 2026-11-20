/**
 * Freedom Browser Dapp Specification — page-facing types for `window.dapp`.
 * specVersion "1". Normative text: SPEC.md (core) and providers/files.md.
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
  type ProviderId = "files" | "swarm" | "radicle";

  /** `<provider>:<name>`. SPEC.md §6.1. */
  type CapabilityId =
    | "files:private"
    | "files:read-shared"
    | "files:write-shared"
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
    /** While true, private-root Files calls and signing wait for the unlock prompt. */
    locked: boolean;
    /** No unlock yet this session: both roots wait for the unlock prompt. Implies `locked`. */
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

  type Root = "private" | "shared";

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
    /** Present for the shared root. */
    author?: Author;
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

  interface FileRef {
    root: Root;
    author?: Author;
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

  /** A shared listing must name types (providers/files.md §4, `types_required`) unless it is the dapp's own files (`author: "self"`); a private one need not. */
  type ListParams =
    | (ListParamsBase & { root: "private"; types?: MimePattern[] })
    | (ListParamsBase & { root: "shared"; types: Types; /** Narrows further; omitted = every author. */ author?: Author | Self })
    | (ListParamsBase & { root: "shared"; author: Self; types?: MimePattern[] });

  interface ListResult {
    items: FileEntry[];
    nextCursor?: string;
  }

  interface ReadParams {
    root: Root;
    author?: Author;
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
    root: Root;
    name: string;
    data: WriteData;
    /** Required; verified by sniffing. providers/files.md §8.4. */
    type: string;
    /** Conditional on the current CID; mismatch is 4409 conflict. */
    ifMatch?: string;
    /** `"*"` = create-only; existing name is 4409 exists. */
    ifNoneMatch?: "*";
  }

  interface WriteJsonParams {
    root: Root;
    name: string;
    value: unknown;
    ifMatch?: string;
    ifNoneMatch?: "*";
  }

  interface ReadJsonResult {
    value: unknown;
    cid: string;
  }

  interface DeleteParams {
    root: Root;
    name: string;
  }

  interface RenameParams {
    root: Root;
    from: string;
    to: string;
  }

  interface CopyParams {
    from: FileRef;
    to: { root: Root; name: string };
    ifNoneMatch?: "*";
  }

  interface SetPublicationParams {
    root: Root;
    name: string;
    /** A provider that declares a publication record (providers/files.md §8.6). */
    provider: string;
    ref: string;
  }

  /** Same rule as `ListParams`: a shared subscription names types. */
  type SubscribeParams =
    | { root: "private"; prefix?: string; suffix?: string; types?: MimePattern[] }
    | { root: "shared"; prefix?: string; suffix?: string; types: Types; author?: Author | Self }
    | { root: "shared"; prefix?: string; suffix?: string; author: Self; types?: MimePattern[] };

  interface SubscribeResult {
    subscriptionId: string;
  }

  interface UnsubscribeParams {
    subscriptionId: string;
  }

  /** `dapp_getProviders` → `providers[].limits` for `files`: the fixed figures only (providers/files.md §8.2). */
  interface FilesLimits {
    /** 536870912 (512 MB). */
    privateBytes: number;
    /** 67108864 (64 MB). */
    privateFileBytes: number;
    /** 1000. */
    privateCount: number;
    /** 536870912 (512 MB). */
    sharedFileBytes: number;
  }

  interface PrivateQuota {
    used: number;
    /** 536870912 (512 MB). */
    limit: number;
    free: number;
    count: number;
    /** 1000. */
    countLimit: number;
    /** 67108864 (64 MB). */
    fileLimit: number;
  }

  interface SharedQuota {
    used: number;
    /** This dapp's allowance (default 1 GB, user-adjustable). */
    limit: number;
        /** min(allowance free, pool free) with a shared row; the allowance's free space alone without. */
    free: number;
    /** 536870912 (512 MB). */
    fileLimit: number;
    /** Present only while the dapp holds files:read-shared or files:write-shared (providers/files.md §8.2). */
    pool?: { used: number; limit: number; free: number };
  }

  type FilesChangedKind = "created" | "modified" | "deleted" | "renamed" | "published";

  /** Payload of `files:changed`. providers/files.md §5. */
  interface FilesChanged {
    root: Root;
    author: Author;
    name: string;
    kind: FilesChangedKind;
    cid: string;
    /** Old name, for `renamed`. */
    from?: string;
    /** The new record with its provider, for `published`. */
    publication?: Publication & { provider: string };
  }

  // ---------------------------------------------------------------------
  // Wire: method name → params → result (SPEC.md §7.2–7.4, providers/files.md §4)
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

    files_list: { params: ListParams; result: ListResult };
    files_read: { params: ReadParams; result: ReadResult };
    files_stat: { params: ReadParams; result: FileEntry };
    files_readJson: { params: ReadParams; result: ReadJsonResult };
    files_write: { params: WriteParams; result: FileEntry };
    files_writeJson: { params: WriteJsonParams; result: FileEntry };
    files_delete: { params: DeleteParams; result: Record<string, never> };
    files_rename: { params: RenameParams; result: FileEntry };
    files_copy: { params: CopyParams; result: FileEntry };
    files_setPublication: { params: SetPublicationParams; result: FileEntry };
    files_subscribe: { params: SubscribeParams; result: SubscribeResult };
    files_unsubscribe: { params: UnsubscribeParams; result: Record<string, never> };
    files_getQuota:
      | { params: { root: "private" }; result: PrivateQuota }
      | { params: { root: "shared" }; result: SharedQuota };
  }

  type MethodName = keyof Methods;

  type ParamsOf<M extends MethodName> = Methods[M] extends { params: infer P } ? P : never;
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
    | "too_many_files"
    // 4900
    | "store_unavailable"
    // -32602
    | "invalid_root"
    | "invalid_name"
    | "invalid_type"
    | "type_mismatch"
    | "not_found"
    
    | "invalid_reference"
    | "invalid_cursor"
        | "invalid_subscription"
        | "too_many_subscriptions"
    | "invalid_json"

    // -32603
    | "disk_full"
    | "io_error";

  interface ErrorData {
    reason?: CoreReason | FilesReason | string;
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
    setPublication(params: SetPublicationParams): Promise<FileEntry>;
    subscribe(params: SubscribeParams): Promise<SubscribeResult>;
    unsubscribe(params: UnsubscribeParams): Promise<Record<string, never>>;
    getQuota(params: { root: "private" }): Promise<PrivateQuota>;
    getQuota(params: { root: "shared" }): Promise<SharedQuota>;
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

    readonly files: FilesSugar;
  }

  // ---------------------------------------------------------------------
  // Manifest (SPEC.md §4; schemas/freedom-manifest-2.schema.json)
  // ---------------------------------------------------------------------

  interface CapabilityRow {
    /** ≤ 140 characters, shown on the consent sheet. */
    why: string;
  }

  type FilesManifestBlock = {
    private?: CapabilityRow;
    "read-shared"?: CapabilityRow;
    "write-shared"?: CapabilityRow;
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
