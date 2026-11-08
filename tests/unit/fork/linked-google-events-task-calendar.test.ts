import { buildLinkedGoogleEventPredicate } from "../../../src/bases/calendarExternalEvents";
import type TaskNotesPlugin from "../../../src/main";
import type { ICSEvent } from "../../../src/types";

// Fork: a task routed to its own calendar (frontmatter googleCalendarName) has its Google mirror there,
// not in the export target. Upstream's predicate only looked at the target, so these showed twice.
const day = "2026-05-19";
const target = "todo@group.calendar.google.com";
const schedule = "schedule@group.calendar.google.com";
const other = "other@group.calendar.google.com";
const event = (calendarId: string, id = "tnabc"): ICSEvent => ({
	id: `google-${calendarId}-${id}`, subscriptionId: `google-${calendarId}`, title: "t", start: day, allDay: true,
});
const frontmatter: Record<string, Record<string, unknown>> = {
	"Tasks/Routed.md": { googleCalendarName: "Schedule" },
	"Tasks/Default.md": {},
};
const plugin = {
	settings: { googleCalendarExport: { targetCalendarId: target }, forkFeatures: { taskCalendarRouting: true } },
	app: { metadataCache: { getCache: (path: string) => ({ frontmatter: frontmatter[path] }) } },
	googleCalendarService: {
		getAvailableCalendars: () => [
			{ id: target, summary: "Todo" }, { id: schedule, summary: "Schedule" }, { id: other, summary: "Other" },
		],
	},
} as unknown as TaskNotesPlugin;

describe("fork: linked Google mirrors in a task's own calendar", () => {
	it("hides the mirror in the task's own calendar", () => {
		const isLinked = buildLinkedGoogleEventPredicate(
			[{ task: { path: "Tasks/Routed.md", googleCalendarEventId: "tnabc" }, date: day }], plugin);
		expect(isLinked(event(schedule))).toBe(true);
		expect(isLinked(event(other))).toBe(false);
	});

	it("ignores a task's own calendar when task calendar routing is off", () => {
		const upstream = { ...plugin, settings: { ...plugin.settings, forkFeatures: { taskCalendarRouting: false } } } as unknown as TaskNotesPlugin;
		const isLinked = buildLinkedGoogleEventPredicate(
			[{ task: { path: "Tasks/Routed.md", googleCalendarEventId: "tnabc" }, date: day }], upstream);
		expect(isLinked(event(schedule))).toBe(false);
		expect(isLinked(event(target))).toBe(true);
	});

	it("keeps upstream behaviour for tasks without their own calendar", () => {
		const isLinked = buildLinkedGoogleEventPredicate(
			[{ task: { path: "Tasks/Default.md", googleCalendarEventId: "tnabc" }, date: day }], plugin);
		expect(isLinked(event(target))).toBe(true);
		expect(isLinked(event(schedule))).toBe(false);
	});
});
