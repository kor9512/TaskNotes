// Fork: OAuth credential/connection storage that follows `oauthCredentialStorage`.
//   "secret"    → upstream OAuthSecretStore (Obsidian SecretStorage, per device)
//   "plaintext" → plugin settings (data.json), so a headless server can share a
//                 connection made on another device through file sync.
// OAuthService keeps calling the same store methods; only its constructor wraps the store.
import type { OAuthConnection, OAuthProvider } from "../../types";
import type { OAuthCredentials, OAuthSecretStore } from "../../services/OAuthSecretStore";
import type { TaskNotesSettings } from "../../types/settings";
import { createTaskNotesLogger } from "../../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Fork/OAuthStore" });

type StoreMethods = Pick<
	OAuthSecretStore,
	| "getCredentials"
	| "setCredentials"
	| "clearCredentials"
	| "getConnection"
	| "setConnection"
	| "clearConnection"
>;

interface PlaintextHost {
	settings?: Pick<
		TaskNotesSettings,
		"oauthCredentialStorage" | "oauthPlaintextCredentials" | "oauthPlaintextConnections"
	> | null;
	saveSettingsDataOnly(): Promise<void>;
}

export function usesPlaintextOAuthStorage(plugin: PlaintextHost): boolean {
	return plugin.settings?.oauthCredentialStorage === "plaintext";
}

/** Stores OAuth data in plugin settings. Refresh tokens become visible to file sync. */
export class PlaintextOAuthStore implements StoreMethods {
	constructor(private readonly plugin: PlaintextHost) {}

	private save(): void {
		this.plugin.saveSettingsDataOnly().catch((error: unknown) => {
			tasknotesLogger.error("Failed to save plaintext OAuth data", {
				category: "configuration",
				operation: "save-plaintext-oauth",
				error,
			});
		});
	}

	getCredentials(provider: OAuthProvider): OAuthCredentials | null {
		const credentials = this.plugin.settings?.oauthPlaintextCredentials?.[provider];
		return credentials?.clientId
			? {
					clientId: credentials.clientId,
					...(credentials.clientSecret ? { clientSecret: credentials.clientSecret } : {}),
			  }
			: null;
	}

	setCredentials(provider: OAuthProvider, credentials: OAuthCredentials): void {
		const settings = this.plugin.settings;
		if (!settings) return;
		settings.oauthPlaintextCredentials ??= {};
		settings.oauthPlaintextCredentials[provider] = {
			clientId: credentials.clientId.trim(),
			...(credentials.clientSecret?.trim() ? { clientSecret: credentials.clientSecret.trim() } : {}),
		};
		this.save();
	}

	clearCredentials(provider: OAuthProvider): void {
		if (this.plugin.settings?.oauthPlaintextCredentials) {
			delete this.plugin.settings.oauthPlaintextCredentials[provider];
		}
		this.save();
	}

	getConnection(provider: OAuthProvider): OAuthConnection | null {
		return this.plugin.settings?.oauthPlaintextConnections?.[provider] ?? null;
	}

	setConnection(provider: OAuthProvider, connection: OAuthConnection): void {
		const settings = this.plugin.settings;
		if (!settings) return;
		settings.oauthPlaintextConnections ??= {};
		settings.oauthPlaintextConnections[provider] = connection;
		this.save();
	}

	clearConnection(provider: OAuthProvider): void {
		if (this.plugin.settings?.oauthPlaintextConnections) {
			delete this.plugin.settings.oauthPlaintextConnections[provider];
		}
		this.save();
	}
}

/**
 * Wrap the upstream secret store so every call is routed by the current
 * `oauthCredentialStorage` setting. Switching the setting takes effect immediately.
 */
export function createForkOAuthStore<T extends StoreMethods>(plugin: PlaintextHost, secretStore: T): T {
	const plaintext = new PlaintextOAuthStore(plugin);
	const routed: StoreMethods = {
		getCredentials: (provider) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.getCredentials(provider)
				: secretStore.getCredentials(provider),
		setCredentials: (provider, credentials) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.setCredentials(provider, credentials)
				: secretStore.setCredentials(provider, credentials),
		clearCredentials: (provider) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.clearCredentials(provider)
				: secretStore.clearCredentials(provider),
		getConnection: (provider) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.getConnection(provider)
				: secretStore.getConnection(provider),
		setConnection: (provider, connection) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.setConnection(provider, connection)
				: secretStore.setConnection(provider, connection),
		clearConnection: (provider) =>
			usesPlaintextOAuthStorage(plugin)
				? plaintext.clearConnection(provider)
				: secretStore.clearConnection(provider),
	};
	// Other members (state readers etc.) still come from the upstream store.
	return new Proxy(secretStore, {
		get(target, property, receiver) {
			if (typeof property === "string" && property in routed) {
				return routed[property as keyof StoreMethods];
			}
			const value: unknown = Reflect.get(target, property, receiver);
			return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
		},
	});
}
