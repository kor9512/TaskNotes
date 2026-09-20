import { requestUrl } from "obsidian";
import type TaskNotesPlugin from "../../src/main";
import { EVENT_USER_NOTICE } from "../../src/core/userNotices";
import { TokenRefreshError } from "../../src/services/errors";
import { OAuthSecretStore } from "../../src/services/OAuthSecretStore";
import { OAuthService } from "../../src/services/OAuthService";
import type { OAuthConnection, OAuthTokens } from "../../src/types";

jest.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	requestUrl: jest.fn(),
}));

class InMemorySecretStorage {
	private readonly values = new Map<string, string>();

	getSecret(id: string): string | null {
		return this.values.get(id) ?? null;
	}

	setSecret(id: string, value: string): void {
		this.values.set(id, value);
	}
}

function createExpiredConnection(): OAuthConnection {
	return {
		provider: "google",
		tokens: {
			accessToken: "expired-access-token",
			refreshToken: "current-refresh-token",
			expiresAt: 1,
			scope: "calendar.read",
			tokenType: "Bearer",
		},
		userEmail: "person@example.com",
		connectedAt: "2026-01-01T00:00:00.000Z",
	};
}

function getRequestCall(
	mockRequestUrl: jest.MockedFunction<typeof requestUrl>
): Exclude<Parameters<typeof requestUrl>[0], string> {
	const request = mockRequestUrl.mock.calls[0][0];
	if (typeof request === "string") {
		throw new Error("Expected requestUrl to receive request parameters");
	}
	return request;
}

describe("OAuthService SecretStorage persistence", () => {
	let sut: OAuthService;
	let secretStore: OAuthSecretStore;
	let mockPlugin: Partial<TaskNotesPlugin>;
	let mockRequestUrl: jest.MockedFunction<typeof requestUrl>;

	beforeEach(() => {
		jest.clearAllMocks();
		secretStore = new OAuthSecretStore(new InMemorySecretStorage());
		secretStore.setCredentials("google", {
			clientId: "current-client-id",
			clientSecret: "current-client-secret",
		});
		secretStore.setConnection("google", createExpiredConnection());
		mockPlugin = {
			emitter: { trigger: jest.fn() } as never,
			saveData: jest.fn(),
		};
		sut = new OAuthService(mockPlugin as TaskNotesPlugin, secretStore);
		mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;
	});

	it("refreshes and persists tokens without writing plugin data", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: {
				access_token: "new-access-token",
				expires_in: 3600,
				token_type: "Bearer",
			},
			text: "OK",
			arrayBuffer: new ArrayBuffer(0),
			headers: {},
		});

		const result = await sut.refreshToken("google");

		expect(result).toEqual(
			expect.objectContaining({
				accessToken: "new-access-token",
				refreshToken: "current-refresh-token",
			})
		);
		expect(secretStore.getConnection("google")?.tokens).toEqual(result);
		expect(mockPlugin.saveData).not.toHaveBeenCalled();
		const request = getRequestCall(mockRequestUrl);
		expect(request.body).toContain("client_id=current-client-id");
		expect(request.body).toContain("client_secret=current-client-secret");
		expect(request.body).toContain("refresh_token=current-refresh-token");
	});

	it("clears invalid tokens without deleting the saved app credentials", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 400,
			json: {
				error: "invalid_grant",
				error_description: "Refresh token was revoked",
			},
			text: "Bad Request",
			arrayBuffer: new ArrayBuffer(0),
			headers: {},
		});

		await expect(sut.refreshToken("google")).rejects.toBeInstanceOf(TokenRefreshError);

		expect(secretStore.getConnection("google")).toBeNull();
		expect(secretStore.getCredentials("google")).toEqual({
			clientId: "current-client-id",
			clientSecret: "current-client-secret",
		});
		expect(mockPlugin.saveData).not.toHaveBeenCalled();
		expect(mockPlugin.emitter?.trigger).toHaveBeenCalledWith(
			EVENT_USER_NOTICE,
			expect.objectContaining({
				message: expect.stringContaining("connection expired"),
			})
		);
	});

	it("does not let a stale refresh failure clear a reconnected account", async () => {
		type RequestResponse = Awaited<ReturnType<typeof requestUrl>>;
		let resolveRefresh: (response: RequestResponse) => void = () => undefined;
		const refreshResponse = new Promise<RequestResponse>((resolve) => {
			resolveRefresh = resolve;
		});
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: {},
			text: "OK",
			arrayBuffer: new ArrayBuffer(0),
			headers: {},
		});
		mockRequestUrl.mockReturnValueOnce(
			refreshResponse as unknown as ReturnType<typeof requestUrl>
		);
		const staleRefresh = sut.refreshToken("google");
		const staleRefreshResult = expect(staleRefresh).rejects.toThrow(
			"connection changed during token refresh"
		);

		await sut.disconnect("google");
		const reconnected = createExpiredConnection();
		reconnected.tokens.accessToken = "reconnected-access-token";
		secretStore.setConnection("google", reconnected);
		resolveRefresh({
			status: 400,
			json: {
				error: "invalid_grant",
				error_description: "The old refresh token was revoked",
			},
			text: "Bad Request",
			arrayBuffer: new ArrayBuffer(0),
			headers: {},
		});

		await staleRefreshResult;
		expect(secretStore.getConnection("google")?.tokens.accessToken).toBe(
			"reconnected-access-token"
		);
	});
});

describe("OAuthService plaintext credential persistence", () => {
	it("stores credentials in settings when plaintext mode is selected", () => {
		const secretStore = new OAuthSecretStore(new InMemorySecretStorage());
		const settings = {
			oauthCredentialStorage: "plaintext" as const,
			oauthPlaintextCredentials: {},
		};
		const mockPlugin = {
			settings,
			saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		} as unknown as TaskNotesPlugin;
		const service = new OAuthService(mockPlugin, secretStore);

		service.setCredentials("google", {
			clientId: " client-id ",
			clientSecret: " client-secret ",
		});

		expect(service.getCredentials("google")).toEqual({
			clientId: "client-id",
			clientSecret: "client-secret",
		});
		expect(settings.oauthPlaintextCredentials).toEqual({
			google: { clientId: "client-id", clientSecret: "client-secret" },
		});
		expect(mockPlugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);
	});

	it("clears plaintext credentials without touching SecretStorage", () => {
		const secretStore = new OAuthSecretStore(new InMemorySecretStorage());
		const settings = {
			oauthCredentialStorage: "plaintext" as const,
			oauthPlaintextCredentials: {
				google: { clientId: "client-id", clientSecret: "client-secret" },
			},
		};
		const mockPlugin = {
			settings,
			saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		} as unknown as TaskNotesPlugin;
		const service = new OAuthService(mockPlugin, secretStore);

		service.clearCredentials("google");

		expect(service.getCredentials("google")).toBeNull();
		expect(secretStore.getCredentials("google")).toBeNull();
		expect(mockPlugin.saveSettingsDataOnly).toHaveBeenCalledTimes(1);
	});

	it("shares the OAuth connection in settings in plaintext mode", async () => {
		const secretStore = new OAuthSecretStore(new InMemorySecretStorage());
		const settings = {
			oauthCredentialStorage: "plaintext" as const,
			oauthPlaintextCredentials: {},
			oauthPlaintextConnections: {},
		};
		const mockPlugin = {
			settings,
			saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		} as unknown as TaskNotesPlugin;
		const service = new OAuthService(mockPlugin, secretStore);
		const connection: OAuthConnection = {
			provider: "google",
			tokens: {
				accessToken: "access-token",
				refreshToken: "refresh-token",
				expiresAt: Date.now() + 3600000,
				scope: "calendar",
				tokenType: "Bearer",
			},
			connectedAt: "2026-09-20T00:00:00.000Z",
		};

		await (service as unknown as {
			storeConnection: (provider: "google", tokens: OAuthTokens) => Promise<void>;
		}).storeConnection(
			"google",
			connection.tokens
		);

		expect(await service.getConnection("google")).toEqual(
			expect.objectContaining({ provider: "google", tokens: connection.tokens })
		);
		expect(secretStore.getConnection("google")).toBeNull();
	});
});
