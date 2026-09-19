# TaskNotes - Unreleased

## Added

- (#2349, #2127) Recurring tasks now create their first available occurrence note when “Create next after completion” is enabled. Completing the parent in the UI also uses occurrence notes, and new occurrence notes use unambiguous parent links across folders. Thanks to @raphaelfaouakhiri for the requests and investigation.

- (#296) Added commands to start and stop time tracking for the current task note, usable from the Command Palette, hotkeys, and plugins such as Buttons. Thanks to @schosch-iteratec for the request and for sharing the Quick Actions workaround. See [Time Management](https://tasknotes.dev/features/time-management/).

## Fixed

- Fixed task dialogs falling back to plain text inputs when opened without an active note, including from release notes or in an empty vault.
- (#2347) Fixed subtasks created from the edit task modal ignoring the parent project when choosing their folder. Thanks to @iantierney for reporting.

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->
