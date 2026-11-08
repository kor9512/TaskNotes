// Fork feature switches. Every behaviour the fork changes is behind one of these,
// and the defaults reproduce upstream TaskNotes exactly. Upstream files only call
// `forkFeature(plugin, ...)`; the fork logic itself lives under `src/fork/`.

/** How "Create task" on a Google/ICS calendar event relates the new task to the event. */
export type ForkEventToTaskMode =
	/** Upstream: keep `icsEventId`; exporting the task creates a separate event. */
	| "link"
	/** Fork: the task takes over the original Google event (one event, no copy). */
	| "adopt"
	/** Fork (2026-09-20 behaviour): no link; exporting creates a new event. */
	| "independent";

export interface ForkFeatureSettings {
	/** Per-task Google calendar (`googleCalendarName`), modal field and context menu. */
	taskCalendarRouting: boolean;
	/** "Calendar routing" settings section: subscribe toggles, colours, enabled-only target list. */
	calendarRoutingPanel: boolean;
	/** Use `due` as the Google event end (all-day and timed). */
	dueAsEventEnd: boolean;
	/** Deterministic Google event IDs so concurrent devices converge on one event. */
	stableEventIds: boolean;
	/** Relation between a task created from a calendar event and that event. */
	eventToTaskMode: ForkEventToTaskMode;
	/** Notes/tasks made from calendar events go to a per-calendar folder and keep the calendar name. */
	calendarFolders: boolean;
}

/** Upstream behaviour. Used for new installs and in tests unless a test opts in. */
export const DEFAULT_FORK_FEATURES: Readonly<ForkFeatureSettings> = Object.freeze({
	taskCalendarRouting: false,
	calendarRoutingPanel: false,
	dueAsEventEnd: false,
	stableEventIds: false,
	eventToTaskMode: "link",
	calendarFolders: false,
});

/**
 * What a fork install did before these switches existed. Applied once to settings
 * that already carry fork-only keys, so upgrading never silently drops a feature
 * (2026-09-24: a build without routing moved per-task events back to the target).
 */
export const LEGACY_FORK_FEATURES: Readonly<ForkFeatureSettings> = Object.freeze({
	taskCalendarRouting: true,
	calendarRoutingPanel: true,
	dueAsEventEnd: true,
	stableEventIds: true,
	eventToTaskMode: "independent",
	calendarFolders: true,
});

const EVENT_TO_TASK_MODES: readonly ForkEventToTaskMode[] = ["link", "adopt", "independent"];
const BOOLEAN_KEYS = [
	"taskCalendarRouting",
	"calendarRoutingPanel",
	"dueAsEventEnd",
	"stableEventIds",
	"calendarFolders",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Settings keys that only a fork build ever wrote. */
function hasLegacyForkKeys(data: Record<string, unknown>): boolean {
	return "oauthCredentialStorage" in data || "oauthAuthorizationMode" in data;
}

/** Build the effective switches from loaded `data.json` (or null for a fresh install). */
export function buildForkFeatureSettings(data: unknown): ForkFeatureSettings {
	if (!isRecord(data)) return { ...DEFAULT_FORK_FEATURES };
	const stored = data.forkFeatures;
	if (!isRecord(stored)) {
		return hasLegacyForkKeys(data) ? { ...LEGACY_FORK_FEATURES } : { ...DEFAULT_FORK_FEATURES };
	}
	const result: ForkFeatureSettings = { ...DEFAULT_FORK_FEATURES };
	for (const key of BOOLEAN_KEYS) {
		if (typeof stored[key] === "boolean") result[key] = stored[key];
	}
	const mode = stored.eventToTaskMode;
	if (typeof mode === "string" && (EVENT_TO_TASK_MODES as readonly string[]).includes(mode)) {
		result.eventToTaskMode = mode as ForkEventToTaskMode;
	}
	return result;
}

/**
 * True only when an existing fork install is being migrated, so the switches are
 * written once. Upstream settings without switches load as defaults with no extra save.
 */
export function shouldPersistForkFeatures(data: unknown): boolean {
	return isRecord(data) && !isRecord(data.forkFeatures) && hasLegacyForkKeys(data);
}

interface ForkSettingsHost {
	settings?: { forkFeatures?: Partial<ForkFeatureSettings> } | null;
}

/** Read one switch. Missing settings (tests, early startup) mean upstream behaviour. */
export function forkFeature<K extends keyof ForkFeatureSettings>(
	plugin: ForkSettingsHost | null | undefined,
	key: K
): ForkFeatureSettings[K] {
	const value = plugin?.settings?.forkFeatures?.[key];
	return value ?? DEFAULT_FORK_FEATURES[key];
}
