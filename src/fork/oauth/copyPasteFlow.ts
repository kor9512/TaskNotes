// Fork: copy-paste OAuth for devices that cannot receive the loopback callback
// (headless server, mobile). The consent page opens as usual; the user pastes the
// redirected URL (or just the code) back. PKCE and state checks are the same as
// upstream's loopback flow, whose helpers OAuthService hands in.
import { msg } from "@lingui/core/macro";
import { uiText } from "../../i18n/runtime";
import { publishUserNotice } from "../../core/userNotices";
import type { OAuthConfig, OAuthProvider, OAuthTokens } from "../../types";
import { OAuthNotConfiguredError } from "../../services/errors";

const REQUEST_TTL_MS = 300_000;

/** Upstream OAuthService internals the flow needs; bound inside OAuthService. */
export interface CopyPasteOAuthInternals {
	emitter: Parameters<typeof publishUserNotice>[0];
	getConfig(provider: OAuthProvider): OAuthConfig;
	generateCodeVerifier(): string;
	generateCodeChallenge(verifier: string): Promise<string>;
	generateState(): string;
	buildAuthorizationUrl(config: OAuthConfig, codeChallenge: string, state: string): string;
	openAuthorizationUrl(url: string): Promise<void>;
	exchangeCodeForTokens(config: OAuthConfig, code: string, codeVerifier: string): Promise<OAuthTokens>;
	storeConnection(provider: OAuthProvider, tokens: OAuthTokens): Promise<void>;
	isAuthenticating(): boolean;
	setAuthenticating(value: boolean): void;
}

interface PendingRequest {
	state: string;
	codeVerifier: string;
	expiresAt: number;
	timeout: number;
}

/** Extract the authorization code from a pasted redirect URL or bare code. */
export function parsePastedAuthorization(pastedValue: string, expectedState: string): string {
	let code = pastedValue.trim();
	if (!code) throw new Error("Paste the OAuth redirect URL or authorization code first.");
	if (code.startsWith("http://") || code.startsWith("https://")) {
		const redirectedUrl = new URL(code);
		const returnedState = redirectedUrl.searchParams.get("state");
		if (returnedState && returnedState !== expectedState) {
			throw new Error("OAuth state did not match. Press Request authorization again.");
		}
		const providerError = redirectedUrl.searchParams.get("error");
		if (providerError) throw new Error(`OAuth authorization failed: ${providerError}`);
		code = redirectedUrl.searchParams.get("code") ?? "";
	}
	if (!code) throw new Error("The pasted OAuth value did not contain an authorization code.");
	return code;
}

export class CopyPasteOAuthFlow {
	private pending = new Map<OAuthProvider, PendingRequest>();

	constructor(private readonly internals: CopyPasteOAuthInternals) {}

	hasPendingRequest(provider: OAuthProvider): boolean {
		const pending = this.pending.get(provider);
		return !!pending && pending.expiresAt >= Date.now();
	}

	/** Opens the provider consent page and returns when the request expires. */
	async requestCopyPasteAuthorization(provider: OAuthProvider): Promise<number> {
		const internals = this.internals;
		if (internals.isAuthenticating()) {
			throw new Error("An OAuth authorization is already in progress");
		}
		const config = internals.getConfig(provider);
		if (!config.clientId) throw new OAuthNotConfiguredError(provider);
		const codeVerifier = internals.generateCodeVerifier();
		const codeChallenge = await internals.generateCodeChallenge(codeVerifier);
		const state = internals.generateState();
		const expiresAt = Date.now() + REQUEST_TTL_MS;
		const timeout = window.setTimeout(() => {
			this.pending.delete(provider);
			internals.setAuthenticating(false);
			publishUserNotice(
				internals.emitter,
				uiText(msg({ message: "OAuth request expired. Start again.", context: "services.oauth.copyPasteExpired" }))
			);
		}, REQUEST_TTL_MS);
		this.pending.set(provider, { state, codeVerifier, expiresAt, timeout });
		internals.setAuthenticating(true);
		try {
			await internals.openAuthorizationUrl(
				internals.buildAuthorizationUrl(config, codeChallenge, state)
			);
			publishUserNotice(
				internals.emitter,
				uiText(msg({ message: "After approval, paste the redirect URL or code and connect.", context: "services.oauth.copyPastePaste" }))
			);
			return expiresAt;
		} catch (error) {
			this.clear(provider);
			throw error;
		}
	}

	/** Exchanges a pasted redirect URL/code for tokens and stores the connection. */
	async connectCopyPasteAuthorization(provider: OAuthProvider, pastedValue: string): Promise<void> {
		const pending = this.pending.get(provider);
		if (!pending || pending.expiresAt < Date.now()) {
			this.clear(provider);
			throw new Error("No active OAuth request. Press Request authorization first.");
		}
		try {
			const code = parsePastedAuthorization(pastedValue, pending.state);
			const tokens = await this.internals.exchangeCodeForTokens(
				this.internals.getConfig(provider),
				code,
				pending.codeVerifier
			);
			await this.internals.storeConnection(provider, tokens);
			publishUserNotice(this.internals.emitter, `Successfully connected to ${provider} Calendar!`);
		} finally {
			this.clear(provider);
		}
	}

	/** One-shot flow used by `authenticate()` when copy-paste mode is selected. */
	async authenticate(
		provider: OAuthProvider,
		requestInput?: () => Promise<string | null>
	): Promise<void> {
		await this.requestCopyPasteAuthorization(provider);
		try {
			const pasted = requestInput
				? await requestInput()
				: (() => {
						const promptDialog = Reflect.get(window, "prompt");
						return promptDialog("Paste the OAuth redirect URL or authorization code:");
				  })();
			if (!pasted?.trim()) {
				throw new Error("No OAuth redirect URL or authorization code was provided.");
			}
			await this.connectCopyPasteAuthorization(provider, pasted);
		} catch (error) {
			this.clear(provider);
			throw error;
		}
	}

	private clear(provider: OAuthProvider): void {
		const pending = this.pending.get(provider);
		if (pending) window.clearTimeout(pending.timeout);
		this.pending.delete(provider);
		this.internals.setAuthenticating(false);
	}
}

/** Extra Google scope only the calendar-routing panel needs (calendar colours). */
const GOOGLE_CALENDAR_LIST_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist";

export function forkOAuthScopes(
	provider: OAuthProvider,
	scopes: string[],
	calendarRoutingPanel: boolean
): string[] {
	if (provider !== "google" || !calendarRoutingPanel || scopes.includes(GOOGLE_CALENDAR_LIST_SCOPE)) {
		return scopes;
	}
	return [...scopes, GOOGLE_CALENDAR_LIST_SCOPE];
}
