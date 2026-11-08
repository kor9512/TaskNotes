// Fork: "Set TaskNotes Google Calendar" in the task context menu's calendar
// submenu (forkFeatures.taskCalendarRouting).
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Menu, MenuItem, Notice, TFile } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { TaskInfo } from "../../types";
import { forkFeature } from "../featureFlags";
import { getEnabledGoogleCalendars, setTaskCalendarOverride } from "../calendar/taskCalendar";

type Translate = (key: MessageDescriptor, params?: Record<string, string | number>) => string;

async function setTaskCalendar(
	plugin: TaskNotesPlugin,
	task: TaskInfo,
	calendarId: string | undefined,
	t: Translate
): Promise<void> {
	const file = plugin.app.vault.getAbstractFileByPath(task.path);
	if (!(file instanceof TFile)) return;
	await setTaskCalendarOverride(plugin, file, calendarId);
	const updatedTask = await plugin.cacheManager.getTaskInfo(task.path);
	if (updatedTask && plugin.taskCalendarSyncService?.isEnabled()) {
		await plugin.taskCalendarSyncService.syncTaskToCalendar(updatedTask);
	}
	new Notice(
		calendarId
			? t(msg({ message: "TaskNotes Google Calendar override saved", context: "contextMenus.task.calendar.overrideSaved" }))
			: t(msg({ message: "TaskNotes default Google Calendar restored", context: "contextMenus.task.calendar.defaultRestored" }))
	);
}

/** Add the per-task calendar picker to `submenu` (no-op when routing is off). */
export function addForkTaskCalendarMenu(
	submenu: Menu,
	plugin: TaskNotesPlugin,
	task: TaskInfo,
	t: Translate
): void {
	if (!forkFeature(plugin, "taskCalendarRouting")) return;
	submenu.addItem((item: MenuItem) => {
		item.setTitle(t(msg({ message: "Set TaskNotes Google Calendar", context: "contextMenus.task.calendar.setTaskTarget" })));
		item.setIcon("calendar-cog");
		const calendarMenu = (item as unknown as { setSubmenu(): Menu }).setSubmenu();
		calendarMenu.addItem((calendarItem) => {
			calendarItem.setTitle(t(msg({ message: "Use default target calendar", context: "contextMenus.task.calendar.useDefaultTarget" })));
			calendarItem.onClick(() => {
				void setTaskCalendar(plugin, task, undefined, t);
			});
		});
		for (const calendar of getEnabledGoogleCalendars(plugin)) {
			calendarMenu.addItem((calendarItem) => {
				calendarItem.setTitle(calendar.summary || calendar.id);
				calendarItem.onClick(() => {
					void setTaskCalendar(plugin, task, calendar.id, t);
				});
			});
		}
	});
}
