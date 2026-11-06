// Fork-only "Google Calendar" field in the task modals: picks the calendar a task
// is routed to (blank = default target). Kept out of upstream's TaskModal.ts.
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Setting } from "obsidian";
import type TaskNotesPlugin from "../../main";

export interface ForkGoogleCalendarFieldOptions {
	plugin: TaskNotesPlugin;
	t: (key: MessageDescriptor, params?: Record<string, string | number>) => string;
	getValue: () => string;
	setValue: (value: string) => void;
}

export function createForkGoogleCalendarField(
	container: HTMLElement,
	{ plugin, t, getValue, setValue }: ForkGoogleCalendarFieldOptions
): void {
	const setting = new Setting(container).setName(t(msg({ message: "Google Calendar", context: "modals.task.googleCalendar.name" })));
	const dropdown = setting.controlEl.createEl("select");
	const calendars =
		plugin.googleCalendarService?.getEnabledCalendars?.() ||
		plugin.googleCalendarService?.getAvailableCalendars?.() ||
		[];
	const defaultOption = dropdown.createEl("option", {
		text: t(msg({ message: "Use default target calendar", context: "modals.task.googleCalendar.useDefaultTarget" })),
		value: "",
	});
	defaultOption.selected = !getValue();

	const hasCurrentCalendar = calendars.some((calendar) => calendar.id === getValue());
	if (getValue() && !hasCurrentCalendar) {
		const missingOption = dropdown.createEl("option", {
			text: t(msg({ message: "Unavailable calendar ({id})", context: "modals.task.googleCalendar.unavailable" }), { id: getValue() }),
			value: getValue(),
		});
		missingOption.selected = true;
		setting.setDesc(t(msg({ message: "This calendar is no longer available. Choose another calendar.", context: "modals.task.googleCalendar.unavailableDescription" })));
	}

	for (const calendar of calendars) {
		const option = dropdown.createEl("option", {
			text: calendar.summary || calendar.id,
			value: calendar.id,
		});
		option.selected = calendar.id === getValue();
	}

	dropdown.addEventListener("change", () => {
		setValue(dropdown.value);
	});
}
