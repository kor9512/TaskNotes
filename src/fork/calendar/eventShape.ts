// Fork: how a task becomes a Google event — `due` as the event end, and
// deterministic event IDs. Each is behind its own fork feature switch.
import { format } from "date-fns";
import { getDatePart } from "../../utils/dateUtils";

type StartInfo = { date?: string; dateTime?: string; timeZone?: string; isAllDay: boolean };
type EventEnd = { date?: string; dateTime?: string; timeZone?: string };

/**
 * A timed event ends at the task's due when due is later than the start: a timed
 * due ends at that moment, a date-only due on a later day ends when that day ends
 * (next local midnight). Otherwise undefined and the caller uses the duration.
 */
export function getTimedEndFromDue(startDate: Date, due?: string): Date | undefined {
	if (!due) return undefined;
	let dueEnd: Date;
	if (due.includes("T")) {
		dueEnd = new Date(due);
	} else {
		if (due <= format(startDate, "yyyy-MM-dd")) return undefined;
		dueEnd = new Date(due + "T00:00:00");
		dueEnd.setDate(dueEnd.getDate() + 1);
	}
	if (isNaN(dueEnd.getTime()) || dueEnd.getTime() <= startDate.getTime()) return undefined;
	return dueEnd;
}

/**
 * Event end derived from `due` (forkFeatures.dueAsEventEnd), or undefined to keep
 * upstream's end (start + 1 day / start + duration).
 * Google's all-day end date is exclusive, so an all-day span ends the day after due.
 */
export function getDueEventEnd(
	startInfo: StartInfo,
	due: string | undefined,
	createAsAllDay: boolean
): EventEnd | undefined {
	if (!due) return undefined;
	if (startInfo.isAllDay || createAsAllDay) {
		const startDatePart =
			startInfo.date || (startInfo.dateTime ? getDatePart(startInfo.dateTime) : undefined);
		const dueDatePart = getDatePart(due);
		if (!dueDatePart || (startDatePart && dueDatePart < startDatePart)) return undefined;
		const endDate = new Date(dueDatePart + "T00:00:00");
		endDate.setDate(endDate.getDate() + 1);
		return { date: format(endDate, "yyyy-MM-dd") };
	}
	if (!startInfo.dateTime) return undefined;
	const dueEnd = getTimedEndFromDue(new Date(startInfo.dateTime), due);
	return dueEnd
		? { dateTime: format(dueEnd, "yyyy-MM-dd'T'HH:mm:ssxxx"), timeZone: startInfo.timeZone }
		: undefined;
}

/**
 * Deterministic Google event ID (forkFeatures.stableEventIds). Google accepts a
 * caller-supplied ID; deriving it from the note path and calendar makes
 * concurrent creates from several devices converge on one event (the loser gets
 * HTTP 409) instead of producing two random IDs.
 */
export async function getStableGoogleEventId(taskPath: string, calendarId: string): Promise<string> {
	const data = new TextEncoder().encode(`tasknotes:${calendarId}:${taskPath}`);
	const digest = await crypto.subtle.digest("SHA-256", data);
	const hex = Array.from(new Uint8Array(digest))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
	// Google event IDs accept lowercase base32hex; hex is a compliant subset.
	return `tn${hex}`;
}
