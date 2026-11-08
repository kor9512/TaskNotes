// Fork: "Fork features" settings section — one switch per fork behaviour.
// Every switch off = upstream TaskNotes behaviour.
import { msg } from "@lingui/core/macro";
import type TaskNotesPlugin from "../../main";
import { uiText } from "../../i18n/runtime";
import {
	configureDropdownSetting,
	configureToggleSetting,
	createSettingGroup,
} from "../../settings/components/settingHelpers";
import { DEFAULT_FORK_FEATURES, type ForkFeatureSettings } from "../featureFlags";

type BooleanFeature = Exclude<keyof ForkFeatureSettings, "eventToTaskMode">;

function features(plugin: TaskNotesPlugin): ForkFeatureSettings {
	plugin.settings.forkFeatures ??= { ...DEFAULT_FORK_FEATURES };
	return plugin.settings.forkFeatures;
}

export function renderForkFeaturesSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	rerender: () => void
): void {
	const toggles: { key: BooleanFeature; name: string; desc: string; rerender?: boolean }[] = [
		{
			key: "taskCalendarRouting",
			name: uiText(msg({ message: "Per-task Google calendar", context: "settings.fork.taskCalendarRouting.name" })),
			desc: uiText(msg({ message: "A task can name its own Google calendar (googleCalendarName). Adds a calendar field to the task modal and context menu.", context: "settings.fork.taskCalendarRouting.description" })),
		},
		{
			key: "calendarRoutingPanel",
			name: uiText(msg({ message: "Calendar routing panel", context: "settings.fork.calendarRoutingPanel.name" })),
			desc: uiText(msg({ message: "Show the calendar subscription and colour panel. Colour changes need the calendar list permission; reconnect after turning this on.", context: "settings.fork.calendarRoutingPanel.description" })),
			rerender: true,
		},
		{
			key: "dueAsEventEnd",
			name: uiText(msg({ message: "Due date ends the event", context: "settings.fork.dueAsEventEnd.name" })),
			desc: uiText(msg({ message: "Exported events run from scheduled to due instead of using the default length.", context: "settings.fork.dueAsEventEnd.description" })),
		},
		{
			key: "stableEventIds",
			name: uiText(msg({ message: "Stable event IDs", context: "settings.fork.stableEventIds.name" })),
			desc: uiText(msg({ message: "Derive Google event IDs from the note path so two devices exporting the same task create one event.", context: "settings.fork.stableEventIds.description" })),
		},
		{
			key: "calendarFolders",
			name: uiText(msg({ message: "Per-calendar folders", context: "settings.fork.calendarFolders.name" })),
			desc: uiText(msg({ message: "Notes and tasks created from calendar events go into a folder named after their calendar.", context: "settings.fork.calendarFolders.description" })),
		},
	];

	createSettingGroup(
		container,
		{
			heading: uiText(msg({ message: "Fork features", context: "settings.fork.heading" })),
			description: uiText(msg({ message: "Changes this build makes to TaskNotes. Turning everything off gives upstream behaviour.", context: "settings.fork.description" })),
		},
		(group) => {
			for (const toggle of toggles) {
				group.addSetting((setting) =>
					void configureToggleSetting(setting, {
						name: toggle.name,
						desc: toggle.desc,
						getValue: () => features(plugin)[toggle.key],
						setValue: (value) => {
							features(plugin)[toggle.key] = value;
							save();
							if (toggle.rerender) rerender();
						},
					})
				);
			}
			group.addSetting((setting) =>
				void configureDropdownSetting(setting, {
					name: uiText(msg({ message: "Task from calendar event", context: "settings.fork.eventToTaskMode.name" })),
					desc: uiText(msg({ message: "Take over: the task becomes the original Google event (one event; editing or deleting the task changes the event). Link: upstream, the task links to the event and exporting adds a copy. Independent: no link; exporting adds a new event.", context: "settings.fork.eventToTaskMode.description" })),
					options: [
						{ value: "link", label: uiText(msg({ message: "Link (upstream)", context: "settings.fork.eventToTaskMode.options.link" })) },
						{ value: "adopt", label: uiText(msg({ message: "Take over the event", context: "settings.fork.eventToTaskMode.options.adopt" })) },
						{ value: "independent", label: uiText(msg({ message: "Independent copy", context: "settings.fork.eventToTaskMode.options.independent" })) },
					],
					getValue: () => features(plugin).eventToTaskMode,
					setValue: (value) => {
						if (value !== "link" && value !== "adopt" && value !== "independent") return;
						features(plugin).eventToTaskMode = value;
						save();
					},
				})
			);
		}
	);
}
