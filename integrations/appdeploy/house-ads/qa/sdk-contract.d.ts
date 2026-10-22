declare module '@appdeploy/sdk' {
// --- Database ---
/** Revision and available database capabilities of this generated SDK bundle. */
export const databaseContract: {
    readonly revision: string;
    readonly capabilities: readonly string[];
};
export type AppDatabaseErrorCode =
    | "AppDatabaseCapabilityInvalid"
    | "AppDatabaseConditionFailed"
    | "AppDatabaseConflict"
    | "AppDatabaseDuplicateId"
    | "AppDatabaseGatewayUnavailable"
    | "AppDatabaseInvalidInput"
    | "AppDatabaseInvocationMismatch"
    | "AppDatabaseItemTooLarge"
    | "AppDatabasePartitionAccessDenied"
    | "AppDatabaseQuotaExceeded"
    | "AppDatabaseReadIncomplete"
    | "AppDatabaseRequestTooLarge"
    | "AppDatabaseResponseTooLarge"
    | "AppDatabaseScopeMismatch"
    | "AppDatabaseTransactionTooLarge"
    | "AppDatabaseUnknownOutcome"
    | "AppDatabaseUnsupportedOperation";
export interface AppDatabaseSdkError extends Error {
    readonly code: AppDatabaseErrorCode;
    readonly statusCode: number;
    readonly details: Record<string, unknown> & {
        reason?: string;
        commitId?: string;
        operationIndex?: number;
        itemIndex?: number;
        failedItemIndex?: number;
        settled?: Array<{ itemIndex: number; result: string | boolean | null }>;
        unprocessedIds?: string[];
    };
}
/** Narrow unknown database errors across module/transport boundaries. */
export function isAppDatabaseError(error: unknown): error is AppDatabaseSdkError;
const operationBrand: unique symbol;
const incrementBrand: unique symbol;
export interface IncrementValue { readonly [incrementBrand]: true; }
export interface DbOperation<T> extends PromiseLike<T> {
    readonly [operationBrand]: true;
    catch: Promise<T>["catch"];
    finally: Promise<T>["finally"];
}
export type RecordData = Record<string, unknown>;
export type UpdateItem = { id: string; record: RecordData; if?: RecordData };
/** Lazy writes: await/then/catch/finally and Promise.resolve/all start standalone execution.
 * Repeated consumers share execution. Compose fresh, unconsumed handles from one invocation.
 * Tables match [A-Za-z0-9_][A-Za-z0-9_.-]{0,127}, excluding __ anywhere. */
export interface TransactionWrites {
    /** A nonempty record.id chooses the physical ID; omitted IDs generate once per handle.
     * Existing IDs return null standalone and abort a composed transaction. */
    add(table: string, records: RecordData[]): DbOperation<(string | null)[]>;
    /** Default replacement/upsert. patch:true requires an existing record: omitted fields stay,
     * undefined removes, null stores null, nested objects replace. Empty patches reject.
     * if: literal top-level field equality (dots are not nested paths) ANDed at commit; undefined expects absence, null expects null.
     * Missing patch targets/failed conditions return false standalone and abort db.transact. */
    update(table: string, items: UpdateItem[], options?: { patch?: boolean }): DbOperation<boolean[]>;
    delete(table: string, ids: string[]): DbOperation<boolean[]>;
}
/** Atomic top-level patch transform: missing starts at zero; null/nonnumeric fields reject.
 * Amounts must be finite; integers must be JS-safe. Negative/fractional amounts are supported.
 * Decimal arithmetic: 38 significant digits, nonzero magnitude 1e-130 through 9.999...e125.
 * Invalid amounts/results reject; precision already lost in JS cannot be recovered. */
export function increment(amount: number): IncrementValue;

/** App-isolated tables. Keep reads bounded; filters run after reads and do not reduce cost.
 * Inputs: 1 MiB/call, 500 array elements; split larger work by bytes and count.
 * Each complete serialized item (keys and nested data included) is limited to 256 KiB;
 * count caps are not size checks. Use storage for larger payloads.
 * Per-app minute/daily quotas apply; never hide or retry 429 AppDatabaseQuotaExceeded.
 * Use db.get<T>/db.list<T> for typed records. */
export const db: {
    /** Standalone items commit independently. On error, details.settled lists known outcomes:
     * null/false had no effect; other results committed. Unlisted outcomes remain unresolved. */
    readonly tx: TransactionWrites;
    /** Atomic commit of distinct unconsumed handles from this invocation; duplicate targets reject.
     * Maximum 100 application actions/4 MiB; no chunking. Missing table catalogs are created separately before application writes.
     * AppDatabaseUnknownOutcome may have committed: reconcile using the original receipt. */
    transact<const T extends readonly DbOperation<unknown>[]>(operations: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }>;

    /** Add records to a table. Returns array with ID (success) or null (failure) per record */
    add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>>;

    /** Update existing records by ID (replaces entire record). Returns boolean array indicating success per record */
    update(
        table: string,
        items: Array<{ id: string; record: Record<string, unknown> }>
    ): Promise<boolean[]>;

    /** Stored data in ID order; null for missing processed keys. Does not attach IDs to returned records;
     * retain and reuse the requested IDs. Eventual consistency by default; consistent:true reads
     * committed state, not a multi-record snapshot. Absence cannot rule out pending commits.
     * Unprocessed keys after retries throw AppDatabaseReadIncomplete, never false absence.
     * Callers may retry incomplete/transient read failures with a bounded budget; quota/auth/limits must surface. */
    get<T = Record<string, any>>(table: string, ids: string[], options?: { consistent?: boolean }): Promise<Array<T | null>>;

    /** List one bounded page with an optional post-read filter. Use nextToken only when another page is needed. */
    list<T = Record<string, any>>(
        table: string,
        options?: { filter?: Record<string, unknown>; nextToken?: string; limit?: number }
    ): Promise<{
        items: Array<Omit<T, "id"> & { id: string }>;
        nextToken?: string;
    }>;

    /** Delete records by ID. Returns boolean array indicating success per record */
    delete(table: string, ids: string[]): Promise<boolean[]>;
};

export interface AuthUser {
    /** Stable AppDeploy user ID (UUID) */
    userId: string;
    /** User's email address (requires 'email' scope) */
    email?: string;
    /** User's display name (requires 'profile' scope) */
    name?: string;
    /** Space-separated list of granted scopes */
    scope: string;
}

// --- Router helpers ---

/** Context passed to each route middleware */
export interface RouterContext {
    /** Parsed request body */
    body: unknown;
    /** Query string parameters */
    query: Record<string, string>;
    /** URL path parameters (e.g., :id) */
    params: Record<string, string>;
    /** Raw Lambda event */
    event: any;
    /** Authenticated user (set by requireAuth middleware) */
    user?: AuthUser;
}

/** Standard JSON response returned by route handlers */
export interface RouterResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

/** A route middleware function */
export type RouterMiddleware = (
    ctx: RouterContext
) => Promise<RouterResponse | void> | RouterResponse | void;

/** Route definitions: pattern string → middleware chain */
export type RouterRoutes = Record<string, RouterMiddleware[]>;

/**
 * Create a Lambda handler that routes requests through middleware chains.
 *
 * @example
 * ```typescript
 * import { router, json, error } from '@appdeploy/sdk';
 *
 * // Use SDK router/auth helpers directly. Do not re-implement custom router/requireAuth/json helpers.
 * // Reserved platform paths like __appdeploy/* are handled by the platform and should not be defined in app routes.
 *
 * export const handler = router({
 *   'GET /api/items': [async (ctx) => json(await getItems())],
 *   'POST /api/items': [async (ctx) => {
 *     const item = ctx.body as { name: string };
 *     return json({ created: true });
 *   }],
 *   'GET /api/items/:id': [async (ctx) => json({ id: ctx.params.id })],
 * });
 * ```
 */
export function router(
    routes: RouterRoutes
): (event: any) => Promise<RouterResponse>;

/** Create a JSON success response */
export function json(data: unknown, status?: number): RouterResponse;

/** Create a JSON error response */
export function error(message: string, status?: number): RouterResponse;

/**
 * Storage operations - file storage with path-based access.
 * Files are isolated per app. Paths are relative (no leading slash).
 *
 * @example
 * ```typescript
 * import { storage } from '@appdeploy/sdk';
 *
 * // Write files - returns boolean array indicating success per file
 * const results = await storage.write([
 *   { path: 'images/logo.png', content: base64Data, contentType: 'image/png' },
 *   { path: 'data/config.json', content: JSON.stringify(config), contentType: 'application/json' }
 * ]);
 * // Returns: [true, true] - all succeeded
 * // Or: [true, false] - second file failed
 *
 * // Read files
 * const files = await storage.read(['images/logo.png', 'data/config.json']);
 * // Returns: [{ path: 'images/logo.png', content: '...' }, { path: 'data/config.json', content: '...' }]
 *
 * // Get signed URLs (valid 1 hour)
 * const urls = await storage.url(['images/logo.png']);
 * // Returns: [{ path: 'images/logo.png', url: 'https://...' }]
 *
 * // List files
 * const { paths, nextToken } = await storage.list({ prefix: 'images/', limit: 10 });
 *
 * // Delete files - returns boolean array indicating success per file
 * const deleted = await storage.delete(['images/old.png', 'images/unused.jpg']);
 * // Returns: [true, true] - both deleted
 * // Check results: deleted.forEach((ok, i) => console.log(ok ? 'deleted' : 'failed'));
 * ```
 */
export const storage: {
    /** Write one or more files. Returns boolean array indicating success per file */
    write(
        items: Array<{ path: string; content: string; contentType: string }>
    ): Promise<boolean[]>;

    /** Read files by path. Returns null content for missing files */
    read(paths: string[]): Promise<Array<{ path: string; content: string | null }>>;

    /** Get signed URLs (valid 15 minutes, cached by browser for 30 days) */
    url(paths: string[]): Promise<Array<{ path: string; url: string }>>;

    /** List files with optional prefix filter */
    list(options?: {
        prefix?: string;
        nextToken?: string;
        limit?: number;
    }): Promise<{ paths: string[]; nextToken?: string }>;

    /** Delete files by path. Returns boolean array indicating success per file */
    delete(paths: string[]): Promise<boolean[]>;
};

}
declare module '@appdeploy/client' {
/** Authenticated user information */
export interface AuthUser {
    /** Stable AppDeploy user ID (UUID) */
    userId: string;
    /** User's email address (requires 'email' scope) */
    email?: string;
    /** User's display name (requires 'profile' scope) */
    name?: string;
    /** User's profile picture URL (requires 'profile' scope) */
    picture?: string;
    /** Space-separated list of granted scopes */
    scope: string;
}

/** Sign-in options */
export interface SignInOptions {
    /** Space-separated list of scopes to request (default: "openid email profile offline_access") Do not include 'offline_access' if you intentionally do not want refresh tokens. */
    scope?: string;
}

/** Sign-in result */
export interface SignInResult {
    /** The authenticated user */
    user: AuthUser;
    /** Access token (automatically attached to API requests) */
    accessToken: string;
    /** Token expiration time in seconds */
    expiresIn: number;
}

/** Authentication API */
export interface AuthAPI {
    /**
     * Opens a popup for user sign-in.
     * Returns the authenticated user on success, or throws on failure/cancel.
     * Error codes: 'popup_blocked' (browser blocked the popup), 'popup_closed' (user closed before completing), 'auth_error' (authentication failed).
     */
    signIn(options?: SignInOptions): Promise<SignInResult>;

    /**
     * Gets the currently authenticated user, or null if not signed in.
     * Automatically refreshes expired access tokens if a refresh token exists.
     */
    getUser(): Promise<AuthUser | null>;

    /**
     * Gets the current access token, or null if not signed in.
     * Automatically refreshes expired tokens if a refresh token exists.
     */
    getAccessToken(): Promise<string | null>;

    /**
     * Signs out the current user and clears stored tokens.
     */
    signOut(): Promise<void>;

    /**
     * Returns true if the user is signed in (has a valid or refreshable token).
     */
    isSignedIn(): boolean;
}

export const auth: AuthAPI;
 export const api: {get(url:string,data?:unknown):Promise<{data:any}>;post(url:string,data?:unknown):Promise<{data:any}>;put(url:string,data?:unknown):Promise<{data:any}>;delete(url:string,data?:unknown):Promise<{data:any}>};
 export const image:{resizeIfNeeded(file:File,options:{maxDimension:number;maxPixels:number;quality:number;mimeType:string}):Promise<{data:string;mimeType:string}>};
 export const notifications:{configure(options:{showSystemNotificationOnForeground:boolean}):Promise<void>;onMessage(callback:(payload:{notification?:{title?:string}})=>void):()=>void;getEnableGuidance():Promise<{kind:string;message?:string;steps:string[]}>;subscribe(options:{showUi:boolean}):Promise<void>;unsubscribe(options:{showUi:boolean}):Promise<void>};
}

