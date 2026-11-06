// Fork-only "Calendar routing" settings section: which Google calendars
// TaskNotes subscribes to, their colors, and which ones tasks may route to.
// Kept out of upstream's integrationsTab.ts to shrink the merge surface.
import { msg } from "@lingui/core/macro";
import { Notice } from "obsidian";
import type TaskNotesPlugin from "../../main";
import type { MessageDescriptor } from "../../i18n";
import { displayError, uiText } from "../../i18n/runtime";
import { createSettingGroup, runAsyncSettingCallback } from "../../settings/components/settingHelpers";

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function renderForkCalendarRoutingSection(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void
): void {
	const translate = (key: MessageDescriptor, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);

	// Calendar routing and subscriptions are independent from task export. The
	// user-facing value is the calendar name; IDs are shown only as reference
	// metadata while the stable IDs remain stored in plugin data.
	createSettingGroup(
		container,
		{
			heading: uiText(msg({ message: "Calendar routing", context: "settings.integrations.calendarRouting.heading" })),
			description: uiText(msg({ message: "Choose which connected calendars TaskNotes can display and route tasks to.", context: "settings.integrations.calendarRouting.description" })),
		},
		(group) => {
			group.addSetting((setting) => {
				setting.settingEl.addClass("tasknotes-calendar-routing-setting");
				setting.setName(translate(msg({ message: "Calendars shown in TaskNotes", context: "settings.integrations.googleCalendarExport.enabledCalendars.name" })));
				setting.setDesc(translate(msg({ message: "Select the Google calendars that TaskNotes should subscribe to and display.", context: "settings.integrations.googleCalendarExport.enabledCalendars.description" })));
				setting.controlEl.createDiv({ cls: "tasknotes-calendar-routing-divider" });
				const listEl = setting.controlEl.createDiv({ cls: "tasknotes-calendar-routing-list" });

				const renderCalendarList = async () => {
					listEl.empty();
					// Same guard as the upstream calendar dropdowns: list nothing until Google is connected.
					const isConnected =
						plugin.oauthService && (await plugin.oauthService.isConnected("google"));
					if (!isConnected || !plugin.googleCalendarService) {
						listEl.createSpan({ text: uiText(msg({ message: "No calendars available", context: "settings.integrations.calendarRouting.none" })) });
						return;
					}
					let calendars = plugin.googleCalendarService.getAvailableCalendars();
					if (calendars.length === 0) {
						try {
							calendars = await plugin.googleCalendarService.listCalendars();
						} catch {
							listEl.createSpan({ text: uiText(msg({ message: "No calendars available", context: "settings.integrations.calendarRouting.none" })) });
							return;
						}
					}
					for (const calendar of calendars) {
						const row = listEl.createDiv({ cls: "tasknotes-calendar-routing-row" });
						const calendarColor = calendar.backgroundColor || "#4285f4";
						row.style.setProperty("--tn-calendar-color", calendarColor);
						const colorSwatch = row.createEl("input", {
							cls: "tasknotes-calendar-routing-color",
							type: "color",
							value: calendarColor,
						});
						colorSwatch.setAttribute("aria-label", uiText(msg({ message: "Color for {calendar}", context: "settings.integrations.calendarRouting.colorLabel" }), { calendar: calendar.summary }));
						colorSwatch.addEventListener("change", () => runAsyncSettingCallback(async () => {
							try {
								await plugin.googleCalendarService?.updateCalendarColor(calendar.id, colorSwatch.value);
								row.style.setProperty("--tn-calendar-color", colorSwatch.value);
								new Notice(uiText(msg({ message: "Updated {calendar} color", context: "settings.integrations.calendarRouting.colorUpdated" }), { calendar: calendar.summary }));
							} catch {
								new Notice(uiText(msg({ message: "Failed to update {calendar} color", context: "settings.integrations.calendarRouting.colorFailed" }), { calendar: calendar.summary }));
								colorSwatch.value = calendarColor;
							}
						}));
						const nameBox = row.createDiv({ cls: "tasknotes-calendar-routing-name-box" });
						nameBox.createSpan({
							cls: "tasknotes-calendar-routing-name",
							text: calendar.summary + (calendar.primary ? uiText(msg({ message: " (Primary)", context: "settings.integrations.googleCalendarExport.targetCalendar.primarySuffix" })) : ""),
						});
						const idBox = row.createDiv({ cls: "tasknotes-calendar-routing-id-box" });
						idBox.createSpan({
							cls: "tasknotes-calendar-routing-id",
							text: calendar.id,
						});
						const toggleLabel = row.createEl("label", { cls: "tasknotes-calendar-routing-toggle" });
						const toggle = toggleLabel.createEl("input", { type: "checkbox" });
						toggleLabel.createSpan({ cls: "tasknotes-calendar-routing-toggle-track" });
						toggle.checked = plugin.settings.enabledGoogleCalendars.includes(calendar.id);
						toggle.addEventListener("change", () => runAsyncSettingCallback(async () => {
								const enabled = toggle.checked;
								const selected = new Set(plugin.settings.enabledGoogleCalendars);
								if (enabled) selected.add(calendar.id);
								else selected.delete(calendar.id);
								plugin.settings.enabledGoogleCalendars = Array.from(selected);
								if (
									!enabled &&
									plugin.settings.googleCalendarExport.targetCalendarId === calendar.id
								) {
									plugin.settings.googleCalendarExport.targetCalendarId =
										Array.from(selected)[0] || "";
								}
								save();
								try {
									await plugin.googleCalendarService?.manualRefresh();
									new Notice(enabled ? uiText(msg({ message: "Subscribed to {calendar}", context: "settings.integrations.calendarRouting.subscribed" }), { calendar: calendar.summary }) : uiText(msg({ message: "Unsubscribed from {calendar}", context: "settings.integrations.calendarRouting.unsubscribed" }), { calendar: calendar.summary }));
								} catch (error) {
									new Notice(uiText(msg({ message: "Calendar refresh failed: {message}", context: "settings.integrations.calendarRouting.refreshFailed" }), { message: displayError(getErrorMessage(error)) }));
								}
						}));
					}
				};

				void renderCalendarList();
				plugin.googleCalendarService?.on("data-changed", () => {
					if (listEl.isConnected) void renderCalendarList();
				});
			});
		}
	);
}
