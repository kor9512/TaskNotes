// Fork: per-task Google calendar ("task calendar routing").
// A task note may name its calendar in frontmatter (`googleCalendarName`; legacy
// `googleCalendarId`/`googleCalendar`). With `forkFeatures.taskCalendarRouting`
// off every helper here returns the upstream answer (the export target).
import { TFile } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { ProviderCalendar } from "../../services/CalendarProvider";
import { processVaultFrontMatterWithinMutation } from "../../core/VaultMutationService";
import { forkFeature } from "../featureFlags";

type PluginLike = Pick<TaskNotesPlugin, "settings" | "app"> & {
	googleCalendarService?: Pick<
		NonNullable<TaskNotesPlugin["googleCalendarService"]>,
		"getAvailableCalendars"
	> | null;
};

function frontmatterOf(plugin: PluginLike, taskPath: string): Record<string, unknown> | undefined {
	const app = plugin.app as Partial<TaskNotesPlugin["app"]> | undefined;
	const cache = app?.metadataCache as
		| {
				getCache?: (path: string) => { frontmatter?: Record<string, unknown> } | null;
				getFileCache?: (file: TFile) => { frontmatter?: Record<string, unknown> } | null;
		  }
		| undefined;
	const byPath = cache?.getCache?.(taskPath)?.frontmatter;
	if (byPath) return byPath;
	const file = app?.vault?.getAbstractFileByPath?.(taskPath);
	return file instanceof TFile ? cache?.getFileCache?.(file)?.frontmatter : undefined;
}

/** Calendar name/id stored in the note, or undefined (also when routing is off). */
export function readTaskCalendarOverride(
	plugin: PluginLike,
	taskPath: string | undefined
): string | undefined {
	if (!taskPath || !forkFeature(plugin, "taskCalendarRouting")) return undefined;
	const frontmatter = frontmatterOf(plugin, taskPath);
	const value =
		frontmatter?.googleCalendarId ?? frontmatter?.googleCalendarName ?? frontmatter?.googleCalendar;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type CalendarSource = { getAvailableCalendars(): ProviderCalendar[] } | null | undefined;

/** Resolve a calendar id or display name against the connected account's calendar list. */
export function resolveGoogleCalendarId(
	plugin: PluginLike,
	value?: string,
	source: CalendarSource = plugin.googleCalendarService
): string | undefined {
	const normalized = value?.trim();
	if (!normalized) return undefined;
	const calendars = source?.getAvailableCalendars?.() ?? [];
	const byId = calendars.find((calendar) => calendar.id === normalized);
	if (byId) return byId.id;
	const lower = normalized.toLocaleLowerCase();
	return calendars.find((calendar) => calendar.summary.trim().toLocaleLowerCase() === lower)?.id;
}

/** Calendars subscribed in TaskNotes (empty selection = all), used for task targeting. */
export function getEnabledGoogleCalendars(plugin: PluginLike): ProviderCalendar[] {
	const calendars = plugin.googleCalendarService?.getAvailableCalendars?.() ?? [];
	const enabled = plugin.settings?.enabledGoogleCalendars ?? [];
	if (enabled.length === 0) return calendars;
	const ids = new Set(enabled);
	return calendars.filter((calendar) => ids.has(calendar.id));
}

/** The calendar a task's event belongs in: its own calendar, else the export target. */
export function getTaskTargetCalendarId(
	plugin: PluginLike,
	task: { path: string },
	source?: CalendarSource
): string {
	const target = plugin.settings.googleCalendarExport.targetCalendarId;
	const override = readTaskCalendarOverride(plugin, task.path);
	return (override && resolveGoogleCalendarId(plugin, override, source ?? plugin.googleCalendarService)) || target;
}

/**
 * Extra fingerprint field so a calendar change made outside Obsidian (synced from
 * another device) moves the event. Empty when no override, so fingerprints of
 * notes without one stay identical to upstream.
 */
export function taskCalendarFingerprint(
	plugin: PluginLike,
	task: { path: string }
): { calendar?: string } {
	const override = readTaskCalendarOverride(plugin, task.path);
	return override ? { calendar: override } : {};
}

/** Store (or clear) a task's calendar as its human-readable name. */
export async function setTaskCalendarOverride(
	plugin: PluginLike,
	file: TFile,
	calendarId?: string
): Promise<void> {
	await processVaultFrontMatterWithinMutation(plugin.app, file, (frontmatter) => {
		delete frontmatter.googleCalendarId;
		if (calendarId) {
			const calendar = plugin.googleCalendarService
				?.getAvailableCalendars()
				.find((item) => item.id === calendarId);
			frontmatter.googleCalendarName = calendar?.summary || calendarId;
		} else {
			delete frontmatter.googleCalendarName;
		}
	});
}

/**
 * Calendars where a task's Google mirror may live — the export target plus each
 * listed task's own calendar. Upstream only checks the export target, so mirrors
 * of tasks routed to another calendar were shown twice.
 */
export function getLinkedGoogleCalendarIds(
	plugin: PluginLike,
	tasks: Iterable<{ path?: string }>,
	targetId: string | undefined,
	canonicalId: (id: string) => string
): Set<string> {
	const ids = new Set<string>();
	if (targetId) ids.add(canonicalId(targetId));
	for (const task of tasks) {
		const override = readTaskCalendarOverride(plugin, task.path);
		if (!override) continue;
		ids.add(canonicalId(resolveGoogleCalendarId(plugin, override) ?? override));
	}
	return ids;
}
