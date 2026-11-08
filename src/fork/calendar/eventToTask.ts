// Fork: "Create task" from a calendar event (forkFeatures.eventToTaskMode) and
// per-calendar folders for notes/tasks made from events (forkFeatures.calendarFolders).
//
//   link        upstream: the task keeps `icsEventId`; exporting it makes a second event.
//   adopt       the task takes over the original Google event (`googleCalendarEventId`),
//               so there is one event. Editing the task rewrites that event's title,
//               time, description and reminders; deleting the task deletes the event.
//   independent no link at all; exporting creates a new event (pre-switch fork behaviour).
//
// adopt falls back to independent for events it cannot safely own: non-Google,
// recurring instances, read-only calendars, and events outside the export target
// when task calendar routing is off (sync would write to another calendar).
import type TaskNotesPlugin from "../../main";
import type { ICSEvent, TaskCreationData } from "../../types";
import { forkFeature } from "../featureFlags";
import { createTaskNotesLogger } from "../../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Fork/EventToTask" });

export interface GoogleEventRef {
	calendarId: string;
	eventId: string;
}

/** Split a Google ICSEvent into calendar and raw event ID (calendar IDs may contain hyphens). */
export function parseGoogleEventRef(icsEvent: Pick<ICSEvent, "id" | "subscriptionId">): GoogleEventRef | undefined {
	if (!icsEvent.subscriptionId.startsWith("google-")) return undefined;
	const calendarId = icsEvent.subscriptionId.slice("google-".length);
	const prefix = `google-${calendarId}-`;
	if (!calendarId || !icsEvent.id.startsWith(prefix)) return undefined;
	const eventId = icsEvent.id.slice(prefix.length);
	return eventId ? { calendarId, eventId } : undefined;
}

/** Subscribed public calendars (holidays, sports…) cannot be written to. */
export function isReadOnlyGoogleCalendar(calendarId: string): boolean {
	return calendarId.endsWith("@group.v.calendar.google.com") || calendarId.includes("#");
}

function safeFolderName(name: string, fallback: string): string {
	return name.replace(/[<>:"/\\|?*]/g, "_").trim() || fallback;
}

/** Event the task may take over, or undefined (see header for the rules). */
export function getAdoptableGoogleEvent(
	plugin: Pick<TaskNotesPlugin, "settings">,
	icsEvent: ICSEvent
): GoogleEventRef | undefined {
	const ref = parseGoogleEventRef(icsEvent);
	if (!ref || icsEvent.recurringEventId || icsEvent.rrule) return undefined;
	if (isReadOnlyGoogleCalendar(ref.calendarId)) return undefined;
	const target = plugin.settings.googleCalendarExport?.targetCalendarId;
	if (!forkFeature(plugin, "taskCalendarRouting") && ref.calendarId !== target) return undefined;
	return ref;
}

export interface ForkEventTaskPlan {
	/** Applied over upstream's task data (caller overrides still win). */
	overrides: Partial<TaskCreationData>;
	/** Drop upstream's `icsEventId` link to the event. */
	dropIcsLink: boolean;
	/** Runs after the task file exists. */
	afterCreate(taskPath: string): Promise<void>;
}

/** How to create a task from `icsEvent`; null keeps upstream behaviour unchanged. */
export function planForkEventToTask(
	plugin: TaskNotesPlugin,
	icsEvent: ICSEvent,
	calendarName: string
): ForkEventTaskPlan | null {
	const mode = forkFeature(plugin, "eventToTaskMode");
	const calendarFolders = forkFeature(plugin, "calendarFolders");
	if (mode === "link" && !calendarFolders) return null;

	const overrides: Partial<TaskCreationData> = {};
	if (calendarFolders) {
		const tasksFolder = plugin.settings.tasksFolder?.trim();
		const folder = safeFolderName(calendarName, "Calendar");
		overrides.folder = tasksFolder ? `${tasksFolder}/${folder}` : folder;
	}
	if (mode === "link") {
		return { overrides, dropIcsLink: false, afterCreate: async () => undefined };
	}

	overrides.tags = [plugin.settings.taskTag];
	const customFrontmatter: Record<string, unknown> = {};
	const ref = parseGoogleEventRef(icsEvent);
	const adopted = mode === "adopt" ? getAdoptableGoogleEvent(plugin, icsEvent) : undefined;
	if (ref && forkFeature(plugin, "taskCalendarRouting") && !isReadOnlyGoogleCalendar(ref.calendarId)) {
		customFrontmatter.googleCalendarName = calendarName;
	}
	if (adopted) {
		customFrontmatter[plugin.fieldMapper.toUserField("googleCalendarEventId")] = adopted.eventId;
	}
	if (Object.keys(customFrontmatter).length > 0) overrides.customFrontmatter = customFrontmatter;

	return {
		overrides,
		dropIcsLink: true,
		afterCreate: async (taskPath: string) => {
			if (adopted) {
				await plugin.taskCalendarSyncService?.recordAdoptedEvent(
					taskPath,
					adopted.calendarId,
					adopted.eventId
				);
			}
			await removeMaterializedICSNotes(plugin, icsEvent.id, taskPath);
		},
	};
}

/** Remove read-only notes previously materialized from the event, now that it is a task. */
async function removeMaterializedICSNotes(
	plugin: TaskNotesPlugin,
	eventId: string,
	keepPath: string
): Promise<void> {
	const tagKey = plugin.fieldMapper.toUserField("icsEventTag");
	for (const file of plugin.app.vault.getMarkdownFiles?.() ?? []) {
		if (file.path === keepPath) continue;
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const tags: unknown[] = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];
		const rawIds: unknown = frontmatter?.icsEventId;
		const eventIds: unknown[] = Array.isArray(rawIds) ? rawIds : [rawIds];
		if (!tags.includes(tagKey) || !eventIds.includes(eventId)) continue;
		try {
			await plugin.app.fileManager.trashFile(file);
		} catch (error) {
			tasknotesLogger.warn("Failed to remove materialized ICS note after task conversion", {
				category: "persistence",
				operation: "remove-materialized-ics-note",
				error,
			});
		}
	}
}

/** Notes made from events: default folder per calendar, and the Google calendar name. */
export function forkCalendarNoteFolder(
	plugin: Pick<TaskNotesPlugin, "settings">,
	icsEvent: Pick<ICSEvent, "subscriptionId">,
	calendarName: string
): string | undefined {
	if (!forkFeature(plugin, "calendarFolders")) return undefined;
	return icsEvent.subscriptionId.startsWith("google-")
		? `Calendar/${safeFolderName(calendarName, "Google")}`
		: "Calendar/Events";
}

export function forkCalendarNoteFrontmatter(
	plugin: Pick<TaskNotesPlugin, "settings">,
	icsEvent: Pick<ICSEvent, "subscriptionId">,
	calendarName: string
): Record<string, unknown> {
	return forkFeature(plugin, "calendarFolders") && icsEvent.subscriptionId.startsWith("google-")
		? { googleCalendarName: calendarName }
		: {};
}
