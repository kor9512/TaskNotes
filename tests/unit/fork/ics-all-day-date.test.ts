import { ICSNoteService } from "../../../src/services/ICSNoteService";
import type TaskNotesPlugin from "../../../src/main";
import type { ICSEvent } from "../../../src/types";

// A Google/ICS all-day event on 2026-11-27 must become scheduled/due 2026-11-27 in every timezone.
// Before the fix the date was parsed as *local* midnight and formatted with *UTC* components, so in
// UTC+ zones (e.g. Asia/Seoul) tasks created from all-day events landed one day early.
// jest.config pins TZ=UTC, where the bug never shows: run with TZ=Asia/Seoul (or any UTC+ zone) to reproduce.
// (Setting process.env.TZ inside a test does not work — Jest gives each test file its own copy of process.env.)
const service = new ICSNoteService({} as unknown as TaskNotesPlugin) as unknown as {
	computeScheduledFromICSEvent(event: ICSEvent): string | undefined;
	computeDueFromICSEnd(event: ICSEvent): string | undefined;
};
const allDay: ICSEvent = {
	id: "google-cal-1", subscriptionId: "google-cal", title: "김장",
	start: "2026-11-27", end: "2026-11-28", allDay: true,
};

describe("ICS all-day event dates do not shift with the timezone", () => {
	it("keeps the event date for scheduled", () => {
		expect(service.computeScheduledFromICSEvent(allDay)).toBe("2026-11-27");
	});
	it("keeps the event date for due (DTEND is the next day per spec)", () => {
		expect(service.computeDueFromICSEnd(allDay)).toBe("2026-11-27");
	});
});
