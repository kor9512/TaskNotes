# TaskNotes - Unreleased

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

## Added

- Added per-task Google Calendar target selection in task creation, edit, and context menus. The selected calendar is stored by stable calendar ID while the UI displays the current calendar name.
- Added a warning when a task references a Google Calendar that is no longer available.
- Added experimental OAuth storage and authorization modes for mobile-friendly setups. Secret Storage is the default; Plaintext mode shares client credentials and connection tokens through plugin settings, and authorization can use the desktop callback or copy/paste flow. Plaintext mode exposes refresh tokens in synced `data.json` and should only be used deliberately.

## Fixed

- Google all-day task events now use the task due date as the exclusive event end date, allowing scheduled-to-due spans to display across multiple days.
- Calendar changes now remove the previous-calendar event before creating the replacement and preserve the resolved target across retry paths.
