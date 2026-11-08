// Fork-only OAuth settings (copy/paste authorization, credential storage).
// Kept out of upstream's integrationsTab.ts so upstream merges touch fewer lines;
// integrationsTab only calls into this module.
import { msg } from "@lingui/core/macro";
import { Notice } from "obsidian";
import type TaskNotesPlugin from "../../main";
import { displayError, uiText } from "../../i18n/runtime";
import { uiData } from "../../i18n/dataText";
import { configureDropdownSetting, createSettingGroup } from "../../settings/components/settingHelpers";
import { createCardInput, type CardButton } from "../../settings/components/CardComponent";

type SettingGroup = Parameters<Parameters<typeof createSettingGroup>[2]>[0];
type CopyPasteProvider = "google" | "microsoft";

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export type OAuthCopyPasteControls = {
	input: HTMLInputElement;
	container: HTMLElement;
	status: HTMLSpanElement;
};

export function createOAuthCopyPasteInput(plugin: TaskNotesPlugin): OAuthCopyPasteControls {
	const input = createCardInput(
		"text",
		uiText(msg({ message: "Paste OAuth redirect URL or authorization code", context: "settings.integrations.oauth.pastePlaceholder" })),
		""
	);
	input.disabled = plugin.settings.oauthAuthorizationMode !== "copy-paste";
	// Keep the input and its status in a dedicated block. Appending the status to
	// the input's parent made it either invisible or squeezed into the setting row
	// on mobile because the input is created before CardComponent attaches it.
	const container = activeWindow.createDiv({ cls: "tasknotes-oauth-copy-paste-control" });
	container.appendChild(input);
	const status = container.createSpan({ cls: "tasknotes-oauth-copy-paste-status" });
	status.textContent = uiText(msg({ message: "Request authorization to start a 5-minute window.", context: "settings.integrations.oauth.windowHint" }));
	return { input, container, status };
}

export function startOAuthCopyPasteCountdown(
	status: HTMLSpanElement,
	expiresAt: number
): () => void {
	let timer: number | null = null;
	const update = () => {
		timer = null;
		const remaining = Math.max(0, expiresAt - Date.now());
		if (remaining === 0) {
			status.textContent = uiText(msg({ message: "Authorization request expired. Request a new code.", context: "settings.integrations.oauth.windowExpired" }));
			return;
		}
		const totalSeconds = Math.ceil(remaining / 1000);
		status.textContent = uiText(msg({ message: "Authorization window: {time} remaining", context: "settings.integrations.oauth.windowRemaining" }), { time: `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}` });
		timer = window.setTimeout(update, 1000);
	};
	update();
	return () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
	};
}

/** "OAUTH credential storage" and "OAUTH authorization method" dropdowns. */
export function addForkOAuthSettings(
	group: SettingGroup,
	plugin: TaskNotesPlugin,
	save: () => void,
	rerender: () => void
): void {
	group.addSetting((setting) =>
		void configureDropdownSetting(setting, {
			name: plugin.i18n.translate(msg({ message: "OAUTH credential storage", context: "settings.integrations.oauthCredentialStorage.name" })),
			desc: plugin.i18n.translate(msg({ message: "Choose where client credentials will be stored. Plaintext is convenient for cross-device setup but insecure.", context: "settings.integrations.oauthCredentialStorage.description" })),
			options: [
				{
					value: "secret",
					label: plugin.i18n.translate(msg({ message: "Obsidian secret storage", context: "settings.integrations.oauthCredentialStorage.options.secret" })),
				},
				{
					value: "plaintext",
					label: plugin.i18n.translate(msg({ message: "Plaintext (experimental)", context: "settings.integrations.oauthCredentialStorage.options.plaintext" })),
				},
			],
			getValue: () => plugin.settings.oauthCredentialStorage,
			setValue: (value) => {
				if (value !== "secret" && value !== "plaintext") return;
				plugin.settings.oauthCredentialStorage = value;
				save();
			},
		})
	);

	group.addSetting((setting) =>
		void configureDropdownSetting(setting, {
			name: plugin.i18n.translate(msg({ message: "OAUTH authorization method", context: "settings.integrations.oauthAuthorizationMode.name" })),
			desc: plugin.i18n.translate(msg({ message: "Choose the authorization flow. Copy/paste works without a local callback server.", context: "settings.integrations.oauthAuthorizationMode.description" })),
			options: [
				{
					value: "desktop-callback",
					label: plugin.i18n.translate(msg({ message: "Desktop callback", context: "settings.integrations.oauthAuthorizationMode.options.desktop" })),
				},
				{
					value: "copy-paste",
					label: plugin.i18n.translate(msg({ message: "Copy/paste authorization (experimental)", context: "settings.integrations.oauthAuthorizationMode.options.copyPaste" })),
				},
			],
			getValue: () => plugin.settings.oauthAuthorizationMode,
			setValue: (value) => {
				if (value !== "desktop-callback" && value !== "copy-paste") return;
				plugin.settings.oauthAuthorizationMode = value;
				save();
				// Rebuild the provider cards so the mode-specific controls change immediately.
				rerender();
			},
		})
	);
}

/**
 * Per-card copy/paste authorization flow: the paste input section, the
 * "Request authorization" step, and the "Connect with pasted code" button.
 */
export function createForkCopyPasteFlow(
	plugin: TaskNotesPlugin,
	provider: CopyPasteProvider,
	providerLabel: string,
	onConnected: () => Promise<void>
) {
	const controls = createOAuthCopyPasteInput(plugin);
	const enabled = plugin.settings.oauthAuthorizationMode === "copy-paste";
	let stopCountdown = () => {};
	const providerName = uiData(providerLabel, "Upstream product name; not plugin-authored prose");

	return {
		enabled,
		section: {
			label: plugin.i18n.translate(msg({ message: "OAuth redirect/code:", context: "settings.integrations.oauth.copyPasteLabel" })),
			input: controls.container,
		},
		requestText: plugin.i18n.translate(msg({ message: "Request authorization", context: "settings.integrations.oauth.requestAuthorization" })),
		/** Starts the copy/paste window when that mode is on. Returns true if it handled the click. */
		async request(): Promise<boolean> {
			if (!enabled || !plugin.oauthService) return false;
			new Notice(uiText(msg({ message: "Opening {provider} authorization…", context: "settings.integrations.oauth.opening" }), { provider: providerName }));
			const expiresAt = await plugin.oauthService.copyPaste.requestCopyPasteAuthorization(provider);
			stopCountdown();
			stopCountdown = startOAuthCopyPasteCountdown(controls.status, expiresAt);
			return true;
		},
		buttons(): CardButton[] {
			if (!enabled) return [];
			return [
				{
					text: "Connect with pasted code",
					icon: "plug",
					variant: "primary",
					onClick: async () => {
						try {
							new Notice(uiText(msg({ message: "Connecting to {provider} calendar…", context: "settings.integrations.oauth.connecting" }), { provider: providerName }));
							await plugin.oauthService?.copyPaste.connectCopyPasteAuthorization(provider, controls.input.value);
							controls.input.value = "";
							stopCountdown();
							await onConnected();
						} catch (error) {
							new Notice(uiText(msg({ message: "Failed to connect: {message}", context: "settings.integrations.oauth.connectFailed" }), { message: displayError(getErrorMessage(error)) }));
						}
					},
				},
			];
		},
	};
}
