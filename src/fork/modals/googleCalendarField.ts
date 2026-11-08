// Fork: "Google Calendar" field in the task modals (forkFeatures.taskCalendarRouting).
// Picks the calendar a task is routed to (blank = default target). The selection is
// kept here per modal instance, so upstream modal classes only make one call each.
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Setting } from "obsidian";
import type TaskNotesPlugin from "../../main";
import { forkFeature } from "../featureFlags";
import {
	getEnabledGoogleCalendars,
	readTaskCalendarOverride,
	resolveGoogleCalendarId,
} from "../calendar/taskCalendar";

type Translate = (key: MessageDescriptor, params?: Record<string, string | number>) => string;

interface FieldState {
	value: string;
	initial: string;
}

const states = new WeakMap<object, FieldState>();

function stateOf(modal: object): FieldState {
	let state = states.get(modal);
	if (!state) {
		state = { value: "", initial: "" };
		states.set(modal, state);
	}
	return state;
}

function calendarName(plugin: TaskNotesPlugin, calendarId: string): string {
	return (
		plugin.googleCalendarService?.getAvailableCalendars().find((item) => item.id === calendarId)
			?.summary || calendarId
	);
}

/** Render the field (no-op when task calendar routing is off). */
export function createForkGoogleCalendarField(
	container: HTMLElement,
	modal: object,
	plugin: TaskNotesPlugin,
	t: Translate
): void {
	if (!forkFeature(plugin, "taskCalendarRouting")) return;
	const state = stateOf(modal);
	const setting = new Setting(container).setName(
		t(msg({ message: "Google Calendar", context: "modals.task.googleCalendar.name" }))
	);
	const dropdown = setting.controlEl.createEl("select");
	const calendars = getEnabledGoogleCalendars(plugin);
	const defaultOption = dropdown.createEl("option", {
		text: t(msg({ message: "Use default target calendar", context: "modals.task.googleCalendar.useDefaultTarget" })),
		value: "",
	});
	defaultOption.selected = !state.value;

	if (state.value && !calendars.some((calendar) => calendar.id === state.value)) {
		const missingOption = dropdown.createEl("option", {
			text: t(msg({ message: "Unavailable calendar ({id})", context: "modals.task.googleCalendar.unavailable" }), { id: state.value }),
			value: state.value,
		});
		missingOption.selected = true;
		setting.setDesc(
			t(msg({ message: "This calendar is no longer available. Choose another calendar.", context: "modals.task.googleCalendar.unavailableDescription" }))
		);
	}

	for (const calendar of calendars) {
		const option = dropdown.createEl("option", {
			text: calendar.summary || calendar.id,
			value: calendar.id,
		});
		option.selected = calendar.id === state.value;
	}

	dropdown.addEventListener("change", () => {
		state.value = dropdown.value;
	});
}

/** Edit modal: load the task's current calendar before the form renders. */
export function initForkTaskCalendarForEdit(
	modal: object,
	plugin: TaskNotesPlugin,
	taskPath: string
): void {
	const stored = readTaskCalendarOverride(plugin, taskPath) ?? "";
	const resolved = resolveGoogleCalendarId(plugin, stored) || stored;
	states.set(modal, { value: resolved, initial: resolved });
}

/** Creation modal: frontmatter for the chosen calendar, merged into custom frontmatter. */
export function applyForkTaskCalendarOnCreate<T extends { customFrontmatter?: Record<string, unknown> }>(
	modal: object,
	plugin: TaskNotesPlugin,
	taskData: T
): T {
	const value = states.get(modal)?.value;
	if (!value || !forkFeature(plugin, "taskCalendarRouting")) return taskData;
	// Store the readable name; sync resolves it to the calendar ID.
	taskData.customFrontmatter = {
		...taskData.customFrontmatter,
		googleCalendarName: calendarName(plugin, value),
	};
	return taskData;
}

/** Edit modal: write the calendar only when the user changed it (null clears it). */
export function applyForkTaskCalendarOnEdit(
	modal: object,
	plugin: TaskNotesPlugin,
	changes: object
): void {
	const state = states.get(modal);
	if (!state || state.value === state.initial || !forkFeature(plugin, "taskCalendarRouting")) return;
	const target = changes as { customFrontmatter?: Record<string, unknown> };
	target.customFrontmatter = {
		...(target.customFrontmatter || {}),
		googleCalendarName: state.value ? calendarName(plugin, state.value) : null,
	};
}
