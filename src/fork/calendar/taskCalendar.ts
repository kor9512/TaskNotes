import type TaskNotesPlugin from "../../main";

/**
 * Fork: a task's own Google calendar (frontmatter `googleCalendarName`, legacy `googleCalendarId`/`googleCalendar`).
 * Returns the stored value (display name or id) — resolve it with `googleCalendarService.resolveCalendarId`.
 */
export function readTaskCalendarOverride(plugin: TaskNotesPlugin, taskPath: string | undefined): string | undefined {
	if (!taskPath) return undefined;
	const frontmatter = plugin.app?.metadataCache?.getCache?.(taskPath)?.frontmatter;
	const value = frontmatter?.googleCalendarId ?? frontmatter?.googleCalendarName ?? frontmatter?.googleCalendar;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Fork: calendars where a task's Google mirror may live — the export target plus each listed task's own calendar.
 * Upstream only checks the export target, so mirrors of tasks routed to another calendar were shown twice.
 */
export function getLinkedGoogleCalendarIds(
	plugin: TaskNotesPlugin,
	tasks: Iterable<{ path?: string }>,
	targetId: string | undefined,
	canonicalId: (id: string) => string
): Set<string> {
	const ids = new Set<string>();
	if (targetId) ids.add(canonicalId(targetId));
	for (const task of tasks) {
		const override = readTaskCalendarOverride(plugin, task.path);
		if (!override) continue;
		ids.add(canonicalId(plugin.googleCalendarService?.resolveCalendarId?.(override) ?? override));
	}
	return ids;
}
