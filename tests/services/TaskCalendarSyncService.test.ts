import { TaskCalendarSyncService } from "../../src/services/TaskCalendarSyncService";
import { TaskInfo } from "../../src/types";
import { TFile } from "obsidian";

describe("TaskCalendarSyncService", () => {
    let syncService: any;
    let mockPlugin: any;
    let mockGoogleCalendarService: any;

    const deferred = () => {
        let resolve!: () => void;
        const promise = new Promise<void>((innerResolve) => {
            resolve = innerResolve;
        });
        return { promise, resolve };
    };

    beforeEach(() => {
        jest.useFakeTimers();
        const pluginData: Record<string, unknown> = {};

        mockPlugin = {
            settings: {
                googleCalendarExport: {
                    syncOnTaskUpdate: true,
                    syncOnTaskComplete: true,
                    enabled: true,
                    targetCalendarId: "test-calendar",
                    includeObsidianLink: true,
                    eventTitleTemplate: "{{title}}",
                    includeDescription: false,
                    syncTrigger: "scheduled",
                    createAsAllDay: true,
                    defaultEventDuration: 60,
                }
            },
            app: {
                vault: {
                    getName: jest.fn().mockReturnValue("Example Vault"),
                },
            },
            cacheManager: {
                getTaskInfo: jest.fn()
            },
            loadData: jest.fn().mockImplementation(async () => pluginData),
            loadPluginDataForSafeWrite: jest.fn().mockImplementation(async () => pluginData),
            saveData: jest.fn().mockImplementation(async (data: Record<string, unknown>) => {
                const nextData = { ...data };
                for (const key of Object.keys(pluginData)) {
                    delete pluginData[key];
                }
                Object.assign(pluginData, nextData);
            }),
            statusManager: {
                getStatusConfig: jest.fn((status: string) => ({ label: status === "ready" ? "Ready" : "Todo" })),
                isCompletedStatus: jest.fn((status?: string) => status === "done")
            },
            priorityManager: {
                getPriorityConfig: jest.fn((priority: string) => ({ label: priority === "2-high" ? "High" : "Medium" }))
            },
            i18n: {
                translate: jest.fn((key: string, params?: Record<string, string | number>) => {
                    const translations: Record<string, string> = {
                        "settings.integrations.googleCalendarExport.eventDescription.untitledTask": "Untitled Task",
                        "settings.integrations.googleCalendarExport.eventDescription.priority": "Priority: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.status": "Status: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.scheduled": "Scheduled: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.timeEstimate": "Time Estimate: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.contexts": "Contexts: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.projects": "Projects: {value}",
                        "settings.integrations.googleCalendarExport.eventDescription.openInObsidian": "Open in Obsidian",
                    };
                    const translation = translations[key] || key;
                    return translation.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? ""));
                })
            }
        };

        mockGoogleCalendarService = {
            getAvailableCalendars: jest.fn().mockReturnValue([{ id: "test-calendar" }]),
            updateEvent: jest.fn().mockResolvedValue({}),
            createEvent: jest.fn().mockResolvedValue({ id: "test-id" })
        };

        syncService = new TaskCalendarSyncService(mockPlugin, mockGoogleCalendarService);

        // Mock internal methods to avoid testing downstream serialization logic which might be complex
        syncService.executeTaskUpdate = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("should use the most recently passed task explicitly, avoiding stale cacheManager payloads during debounce", async () => {
        const taskPath = "test/path.md";

        const firstPayload: TaskInfo = {
            path: taskPath,
            title: "Task Title",
            scheduled: "2026-04-04"
        };

        const secondPayload: TaskInfo = {
            path: taskPath,
            title: "Task Title",
            scheduled: "2026-04-06" // Agent updated it to April 6
        };

        // Pretend the metadataCache hasn't caught up and still returns the stale task
        mockPlugin.cacheManager.getTaskInfo.mockResolvedValue(firstPayload);

        // Act: trigger sync twice rapidly to simulate MCP updates or user typing
        syncService.updateTaskInCalendar(firstPayload);
        syncService.updateTaskInCalendar(secondPayload);

        // Fast-forward past the 500ms debounce
        jest.advanceTimersByTime(500);

        // Flush the microtask queue so the async debounce handler completes
        await Promise.resolve();
        await Promise.resolve();

        // Assert: It should execute only once, and pass the explicit secondPayload, not the stale cache!
        expect(syncService.executeTaskUpdate).toHaveBeenCalledTimes(1);
        expect(syncService.executeTaskUpdate).toHaveBeenCalledWith(secondPayload);
    });

    it("should build plain-text calendar descriptions for external calendar clients", () => {
        const description = syncService.buildEventDescription({
            path: "Tasks/Prepare quarterly planning notes.md",
            title: "Prepare quarterly planning notes",
            status: "ready",
            priority: "2-high",
            scheduled: "2026-04-29",
            timeEstimate: 180,
            projects: [
                "[[Projects/Quarterly Planning|Quarterly Planning]]",
                "[[Projects/Nested Project.md]]",
                "[Markdown Project](Projects/Markdown%20Project.md)",
            ],
            contexts: ["[[People/Alex Example|Alex Example]]", "admin"],
        } as TaskInfo);

        expect(description).toContain("Priority: High");
        expect(description).toContain("Status: Ready");
        expect(description).toContain("Scheduled: 2026-04-29");
        expect(description).toContain("Time Estimate: 3h 0m");
        expect(description).toContain("Contexts: @Alex Example, @admin");
        expect(description).toContain(
            "Projects: Quarterly Planning, Nested Project, Markdown Project"
        );
        expect(description).toContain(
            "Open in Obsidian: obsidian://open?vault=Example%20Vault&file=Tasks%2FPrepare%20quarterly%20planning%20notes.md"
        );
        expect(description).not.toContain("[[");
        expect(description).not.toContain("]]");
        expect(description).not.toContain("<a ");
        expect(description).not.toContain("</a>");
        expect(description).not.toContain("](");
    });

    it("should cancel a pending status update before syncing completion", async () => {
        syncService.withGoogleRateLimit = (fn: () => Promise<unknown>) => fn();

        const taskPath = "test/path.md";
        const somedayPayload: TaskInfo = {
            path: taskPath,
            title: "Task Title",
            status: "someday",
            scheduled: "2026-04-29",
            googleCalendarEventId: "event-1"
        };
        const donePayload: TaskInfo = {
            ...somedayPayload,
            status: "done"
        };

        syncService.updateTaskInCalendar(somedayPayload);
        await syncService.completeTaskInCalendar(donePayload);

        jest.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();

        expect(syncService.executeTaskUpdate).not.toHaveBeenCalled();
        expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledTimes(1);
        expect(mockGoogleCalendarService.updateEvent).toHaveBeenCalledWith(
            "test-calendar",
            "event-1",
            {
                summary: "✓ Task Title",
                description: undefined
            },
            expect.any(Number)
        );
    });

    it("should mark already-completed tasks when a later schedule change creates a calendar event", () => {
        const event = syncService.taskToCalendarEvent({
            path: "test/path.md",
            title: "Task Title",
            status: "done",
            scheduled: "2026-04-29"
        } as TaskInfo);

        expect(event).toEqual(
            expect.objectContaining({
                summary: "✓ Task Title",
                start: { date: "2026-04-29" }
            })
        );
    });

    it("should retry recovery queues without overlapping runs", async () => {
        const startupRecovery = deferred();
        const firstRetry = deferred();

        syncService.processStartupRecovery = jest.fn().mockReturnValue(startupRecovery.promise);
        syncService.processRecoveryQueues = jest.fn().mockReturnValue(firstRetry.promise);

        syncService.startRecoveryQueueProcessor();

        expect(syncService.processStartupRecovery).toHaveBeenCalledTimes(1);
        expect(syncService.processRecoveryQueues).not.toHaveBeenCalled();

        jest.advanceTimersByTime(60000);
        expect(syncService.processRecoveryQueues).not.toHaveBeenCalled();

        startupRecovery.resolve();
        await Promise.resolve();
        await Promise.resolve();

        jest.advanceTimersByTime(60000);
        expect(syncService.processRecoveryQueues).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(60000);
        expect(syncService.processRecoveryQueues).toHaveBeenCalledTimes(1);

        firstRetry.resolve();
        await Promise.resolve();
        await Promise.resolve();

        jest.advanceTimersByTime(60000);
        expect(syncService.processRecoveryQueues).toHaveBeenCalledTimes(2);
    });

    it("uses due as the exclusive end for multi-day all-day events", () => {
        const event = syncService.taskToCalendarEvent({
            path: "Tasks/date-span.md",
            title: "Date span",
            scheduled: "2026-09-17",
            due: "2026-09-20",
        });

        expect(event).toMatchObject({
            start: { date: "2026-09-17" },
            end: { date: "2026-09-21" },
        });
    });

    describe("timed events end at due", () => {
        beforeEach(() => {
            mockPlugin.settings.googleCalendarExport.createAsAllDay = false;
        });

        it("ends at a timed due later the same day", () => {
            const event = syncService.taskToCalendarEvent({
                path: "Tasks/work-day.md",
                title: "Work day",
                scheduled: "2026-10-01T08:30",
                due: "2026-10-01T18:00",
            });
            expect(new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime())
                .toBe((9 * 60 + 30) * 60 * 1000);
        });

        it("ends when a later date-only due day ends", () => {
            const event = syncService.taskToCalendarEvent({
                path: "Tasks/trip.md",
                title: "Trip",
                scheduled: "2026-10-01T08:30",
                due: "2026-10-03",
            });
            const end = new Date(event.end.dateTime);
            expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([4, 0, 0]);
        });

        it("keeps the duration when due is same-day date-only, earlier, or absent", () => {
            for (const due of ["2026-10-01", "2026-10-01T07:00", undefined]) {
                const event = syncService.taskToCalendarEvent({
                    path: "Tasks/short.md",
                    title: "Short",
                    scheduled: "2026-10-01T08:30",
                    due,
                });
                expect(new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime())
                    .toBe(60 * 60 * 1000);
            }
        });
    });

    it("falls back to a one-day event when due is absent", () => {
        const event = syncService.taskToCalendarEvent({
            path: "Tasks/single-day.md",
            title: "Single day",
            scheduled: "2026-09-17",
        });

        expect(event).toMatchObject({
            start: { date: "2026-09-17" },
            end: { date: "2026-09-18" },
        });
    });

    it("changes the calendar fingerprint only when a calendar override is set or changed", () => {
        const file = Object.create(TFile.prototype);
        mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(file);
        let frontmatter: Record<string, unknown> = {};
        mockPlugin.app.metadataCache = { getFileCache: jest.fn(() => ({ frontmatter })) };
        const task = { path: "Tasks/route.md", title: "Route", scheduled: "2026-10-01T08:30" };
        const fingerprint = () => (syncService as any).getCalendarRelevantFingerprint(task);

        const noOverride = fingerprint();
        expect(JSON.parse(noOverride)).not.toHaveProperty("calendar");
        frontmatter = { googleCalendarName: "Schedule" };
        const schedule = fingerprint();
        expect(schedule).not.toBe(noOverride);
        frontmatter = { googleCalendarName: "♡" };
        expect(fingerprint()).not.toBe(schedule);
    });

    it("resolves a task calendar override from frontmatter before the global target", () => {
        const file = Object.create(TFile.prototype);
        mockPlugin.app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(file);
        mockPlugin.app.metadataCache = {
            getFileCache: jest.fn().mockReturnValue({
                frontmatter: { googleCalendarId: "heart-calendar" },
            }),
        };
        // Calendar routing resolves note values against the subscribed calendar list.
        mockGoogleCalendarService.resolveCalendarId = jest.fn((value?: string) =>
            value === "heart-calendar" ? value : undefined
        );

        expect(syncService.getTaskTargetCalendarId({
            path: "Tasks/heart-only.md",
            title: "Heart only",
            scheduled: "2026-09-17",
        })).toBe("heart-calendar");
    });
});
