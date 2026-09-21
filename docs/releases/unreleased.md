# TaskNotes - Unreleased

## Fixed

- (#2352) Fixed the task description editor being obscured by the mobile keyboard when creating a task. Thanks to @kmalakoff for reporting.

- (#2210, #2207) Fixed Task List manual drag-to-reorder failing to start or save the new order. Thanks to @dong-jichen and @mgrecar for reporting, and @kemalguvenc, @MatthiasSoell, and @bravely for confirming and helping narrow down the issue.

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
