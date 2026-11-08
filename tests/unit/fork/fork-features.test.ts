import {
	DEFAULT_FORK_FEATURES,
	LEGACY_FORK_FEATURES,
	buildForkFeatureSettings,
	forkFeature,
	shouldPersistForkFeatures,
} from "../../../src/fork/featureFlags";
import {
	getAdoptableGoogleEvent,
	parseGoogleEventRef,
	planForkEventToTask,
} from "../../../src/fork/calendar/eventToTask";
import { parsePastedAuthorization } from "../../../src/fork/oauth/copyPasteFlow";
import { forkOAuthScopes } from "../../../src/fork/oauth/copyPasteFlow";
import { TaskCalendarSyncService } from "../../../src/services/TaskCalendarSyncService";
import type TaskNotesPlugin from "../../../src/main";
import type { ICSEvent } from "../../../src/types";

describe("fork feature switches", () => {
	it("default to upstream behaviour for fresh installs and upstream settings", () => {
		expect(buildForkFeatureSettings(null)).toEqual(DEFAULT_FORK_FEATURES);
		expect(buildForkFeatureSettings({ taskTag: "task" })).toEqual(DEFAULT_FORK_FEATURES);
		expect(forkFeature(undefined, "eventToTaskMode")).toBe("link");
		expect(forkFeature({ settings: {} }, "taskCalendarRouting")).toBe(false);
		expect(shouldPersistForkFeatures({ taskTag: "task" })).toBe(false);
	});

	it("keep the previous behaviour for existing fork installs", () => {
		expect(buildForkFeatureSettings({ oauthCredentialStorage: "plaintext" })).toEqual(
			LEGACY_FORK_FEATURES
		);
		expect(shouldPersistForkFeatures({ oauthCredentialStorage: "plaintext" })).toBe(true);
	});

	it("read stored switches and ignore invalid values", () => {
		const settings = buildForkFeatureSettings({
			oauthCredentialStorage: "plaintext",
			forkFeatures: { dueAsEventEnd: true, stableEventIds: "yes", eventToTaskMode: "adopt" },
		});
		expect(settings).toEqual({
			...DEFAULT_FORK_FEATURES,
			dueAsEventEnd: true,
			eventToTaskMode: "adopt",
		});
		expect(
			buildForkFeatureSettings({ forkFeatures: { eventToTaskMode: "merge" } }).eventToTaskMode
		).toBe("link");
		expect(shouldPersistForkFeatures({ forkFeatures: {} })).toBe(false);
	});
});

describe("fork: task from calendar event", () => {
	const todo = "todo@group.calendar.google.com";
	const heart = "heart@group.calendar.google.com";
	const googleEvent = (calendarId: string, extra: Partial<ICSEvent> = {}): ICSEvent => ({
		id: `google-${calendarId}-evt123`,
		subscriptionId: `google-${calendarId}`,
		title: "Dinner",
		start: "2026-11-10T19:00:00+09:00",
		allDay: false,
		...extra,
	});
	const makePlugin = (features: Partial<typeof DEFAULT_FORK_FEATURES>) => {
		const recordAdoptedEvent = jest.fn().mockResolvedValue(undefined);
		const trashFile = jest.fn().mockResolvedValue(undefined);
		const plugin = {
			settings: {
				taskTag: "task",
				tasksFolder: "TaskNotes",
				googleCalendarExport: { targetCalendarId: todo },
				forkFeatures: { ...DEFAULT_FORK_FEATURES, ...features },
			},
			fieldMapper: { toUserField: (key: string) => (key === "icsEventTag" ? "ics_event" : key) },
			taskCalendarSyncService: { recordAdoptedEvent },
			app: {
				vault: {
					getMarkdownFiles: () => [{ path: "Calendar/old.md" }, { path: "other.md" }],
				},
				metadataCache: {
					getFileCache: (file: { path: string }) =>
						file.path === "Calendar/old.md"
							? { frontmatter: { tags: ["ics_event"], icsEventId: [`google-${heart}-evt123`] } }
							: { frontmatter: {} },
				},
				fileManager: { trashFile },
			},
		} as unknown as TaskNotesPlugin;
		return { plugin, recordAdoptedEvent, trashFile };
	};

	it("splits Google event ids even when the calendar id contains hyphens", () => {
		expect(
			parseGoogleEventRef({ id: "google-a-b@x.com-ev1", subscriptionId: "google-a-b@x.com" })
		).toEqual({ calendarId: "a-b@x.com", eventId: "ev1" });
		expect(parseGoogleEventRef({ id: "ics-1-ev", subscriptionId: "ics-1" })).toBeUndefined();
	});

	it("keeps upstream behaviour in link mode", () => {
		const { plugin } = makePlugin({});
		expect(planForkEventToTask(plugin, googleEvent(heart), "♡")).toBeNull();
	});

	it("takes over the original event in adopt mode", async () => {
		const { plugin, recordAdoptedEvent, trashFile } = makePlugin({
			eventToTaskMode: "adopt",
			taskCalendarRouting: true,
		});
		const plan = planForkEventToTask(plugin, googleEvent(heart), "♡");
		expect(plan?.dropIcsLink).toBe(true);
		expect(plan?.overrides.tags).toEqual(["task"]);
		expect(plan?.overrides.customFrontmatter).toEqual({
			googleCalendarName: "♡",
			googleCalendarEventId: "evt123",
		});
		await plan?.afterCreate("TaskNotes/Dinner.md");
		expect(recordAdoptedEvent).toHaveBeenCalledWith("TaskNotes/Dinner.md", heart, "evt123");
		expect(trashFile).toHaveBeenCalledWith({ path: "Calendar/old.md" });
	});

	it("does not take over events it cannot own", () => {
		const { plugin } = makePlugin({ eventToTaskMode: "adopt", taskCalendarRouting: true });
		expect(getAdoptableGoogleEvent(plugin, googleEvent(heart, { recurringEventId: "series" }))).toBeUndefined();
		expect(
			getAdoptableGoogleEvent(plugin, googleEvent("ko.south_korea#holiday@group.v.calendar.google.com"))
		).toBeUndefined();
		const noRouting = makePlugin({ eventToTaskMode: "adopt" }).plugin;
		expect(getAdoptableGoogleEvent(noRouting, googleEvent(heart))).toBeUndefined();
		expect(getAdoptableGoogleEvent(noRouting, googleEvent(todo))).toEqual({
			calendarId: todo,
			eventId: "evt123",
		});
	});

	it("independent mode drops the link without owning the event", async () => {
		const { plugin, recordAdoptedEvent } = makePlugin({
			eventToTaskMode: "independent",
			taskCalendarRouting: true,
			calendarFolders: true,
		});
		const plan = planForkEventToTask(plugin, googleEvent(heart), "♡");
		expect(plan?.overrides.folder).toBe("TaskNotes/♡");
		expect(plan?.overrides.customFrontmatter).toEqual({ googleCalendarName: "♡" });
		await plan?.afterCreate("TaskNotes/♡/Dinner.md");
		expect(recordAdoptedEvent).not.toHaveBeenCalled();
	});
});

describe("fork: copy-paste OAuth", () => {
	it("accepts a redirect URL or a bare code and checks state", () => {
		expect(parsePastedAuthorization("http://127.0.0.1/?code=abc&state=s1", "s1")).toBe("abc");
		expect(parsePastedAuthorization("  rawcode ", "s1")).toBe("rawcode");
		expect(() => parsePastedAuthorization("http://127.0.0.1/?code=abc&state=bad", "s1")).toThrow(
			/state did not match/
		);
		expect(() => parsePastedAuthorization("http://127.0.0.1/?error=access_denied", "s1")).toThrow(
			/access_denied/
		);
	});

	it("adds the calendar-list scope only for the routing panel", () => {
		const scopes = ["a", "b"];
		expect(forkOAuthScopes("google", scopes, false)).toBe(scopes);
		expect(forkOAuthScopes("microsoft", scopes, true)).toBe(scopes);
		expect(forkOAuthScopes("google", scopes, true)).toContain(
			"https://www.googleapis.com/auth/calendar.calendarlist"
		);
	});
});

describe("fork: stable Google event ids", () => {
	const createService = (stableEventIds: boolean) => {
		const googleCalendarService = {
			getAvailableCalendars: jest.fn().mockReturnValue([{ id: "cal" }]),
			createEvent: jest.fn().mockResolvedValue({ id: "google-cal-created" }),
			getEvent: jest.fn().mockResolvedValue({ id: "google-cal-existing" }),
			getConnectionGeneration: () => 0,
			isConnectionGenerationCurrent: async () => true,
		};
		const plugin = {
			settings: {
				googleCalendarExport: { targetCalendarId: "cal" },
				forkFeatures: { ...DEFAULT_FORK_FEATURES, stableEventIds },
			},
		};
		const service = new TaskCalendarSyncService(
			plugin as unknown as TaskNotesPlugin,
			googleCalendarService as never
		) as unknown as {
			saveTaskEventId: jest.Mock;
			createCalendarEventForTask(
				task: { path: string },
				eventData: Record<string, unknown>,
				calendarId: string,
				generation: number
			): Promise<string>;
		};
		service.saveTaskEventId = jest.fn().mockResolvedValue(undefined);
		return { service, googleCalendarService };
	};
	const eventData = { summary: "t", start: { date: "2026-11-10" }, end: { date: "2026-11-11" } };

	it("lets Google pick the id when off (upstream)", async () => {
		const { service, googleCalendarService } = createService(false);
		await service.createCalendarEventForTask({ path: "a.md" }, eventData, "cal", 0);
		expect(googleCalendarService.createEvent.mock.calls[0][1]).not.toHaveProperty("id");
	});

	it("sends a path-derived id and reuses the event on 409 when on", async () => {
		const { service, googleCalendarService } = createService(true);
		googleCalendarService.createEvent.mockRejectedValueOnce(Object.assign(new Error("dup"), { status: 409 }));
		const id = await service.createCalendarEventForTask({ path: "a.md" }, eventData, "cal", 0);
		const sentId = googleCalendarService.createEvent.mock.calls[0][1].id;
		expect(sentId).toMatch(/^tn[0-9a-f]{64}$/);
		expect(googleCalendarService.getEvent).toHaveBeenCalledWith("cal", sentId);
		expect(id).toBe("existing");
	});
});
