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

## Fixed

- (#2364) Fixed the calendar creation menu opening off-screen after selecting a time range by touch. Thanks to @saschaobsidian for reporting the iPad issue.

- (#2360) Preserve expanded and collapsed settings cards when the settings interface is rebuilt. Thanks to @pankevely for reporting the loss of expanded sections.

- (#2361) Fixed Kanban formula swimlanes showing **None** on a cold load when Bases had not cached the formula. Swimlane values now use the public Bases entry API. Thanks to @iantierney for reporting and recording the issue.

- (#2362) Show every configured priority swimlane when empty swimlanes are visible, including priorities assigned only to hidden subtasks. See [Kanban View](https://tasknotes.dev/views/kanban-view/).
  - Thanks to @iantierney for reporting.

- Clarified that dependency relationships store `blockedBy` and derive “Blocking”, separately from project/subtask membership. See [Dependencies](https://tasknotes.dev/features/task-management/#dependencies).
  - Thanks to @Dual1r for raising this in [discussion #2357](https://github.com/callumalpass/tasknotes/discussions/2357).

- (#2359) Fixed task list cards retaining outdated metadata after property changes, including contexts, tags, and displayed Bases formula values.
  - Thanks to @maks-io for reporting and investigating.
