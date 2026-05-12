# Application Scope Report

## Purpose

This application is a web-based league management system for ultimate frisbee competitions. It supports public league browsing, player registration, team management, score reporting, season administration, and administrator review tools for competition results.

The software is organized around a central dashboard. Available pages depend on whether a visitor is signed in and what permissions their account has.

## Access And Account Features

The app includes a full account entry flow for participants and administrators.

| Area | Features |
| --- | --- |
| Welcome | Collects an email address and directs the user to the correct next step. |
| Login | Allows existing users to sign in. |
| Sign Up | Allows new users to create an account. |
| Forgot Password | Sends a recovery code to the user's email address. |
| Verify Email | Lets users verify their email using a code. |
| Logout | Confirms before signing the user out. |

## Season Setup

If no active season is available, the app shows a season setup screen.

Season administrators can create a new season. Non-administrators see a message explaining that the season is not ready and should return when registrations are open.

## Dashboard Shell

The main dashboard provides navigation, account controls, season switching, and quick actions.

Key shared features include:

- Responsive navigation for desktop and mobile.
- Current season selector, including hidden season visibility for season administrators.
- Light and dark theme toggle.
- Login, sign up, logout, and settings access.
- Team status indicator, including a prompt to join a team.
- Prominent score reporting action.
- League resource links, including rules, accreditation, and injury/insurance information.
- Optional external shop link for the Marlow Street league configuration.

## Fixtures Page

The Fixtures page shows the scheduled competition fixtures for the selected season.

Participant-facing features:

- View each fixture by title and date.
- Expand a fixture to see its games.
- See teams, times, places, and recorded scores.
- Submit a score report from the page, especially on mobile where the report button is shown at the top of the fixture list.

Administrator features:

- Add an individual fixture.
- Edit an existing fixture.
- Generate fixtures automatically with a "Magic Generate" tool.
- Adjust multiple fixtures at once.

## Fixture View

The app also supports a focused fixture view, opened by fixture identifier. This presents one fixture in a simple table showing team matchups, game times, and locations. This view appears designed for sharing, display, or capture outside the normal dashboard frame.

## Ladder Page

The Ladder page summarizes competition standings and results for the selected season.

Features include:

- Division-based ladder tables.
- Support for teams without a division.
- Final results display, including trophy marking for first place.
- Round and fixture result details.
- Score distribution graph showing how often point totals occur across games.

Administrator features:

- Edit final season results.
- Review missing score reports.
- Edit fixture tallies and recorded results.

## Score Reporting

Score reporting is available from the dashboard and fixture page for signed-in users who are attached to a team.

Report features include:

- Select fixture, reporting team, and opponent.
- Enter game scores.
- Submit spirit scores.
- Add spirit comments.
- Select male and female MVPs.
- Support both simple scoring and official scoring modes.
- In official scoring mode, support multiple spirit categories and first/second MVP point values.

If a signed-in user is not on a team, the app prompts them to join a team before reporting. If a visitor is not signed in, the app prompts them to authenticate first.

## Reports Page

The Reports page is an administrator page for reviewing and managing submitted score reports.

Features include:

- Search reports.
- Paginate through report results.
- View fixture, reporting team, opponent, spirit score, MVP completion status, comment, submitter, and creation date.
- Create reports manually.
- Edit existing reports.
- Delete reports with confirmation.
- Review missing reports for the season.

## Spirit Page

The Spirit page is an administrator page for monitoring spirit scoring across teams.

Features include:

- Table of team spirit scoring performance.
- Received spirit points, received report count, and received average.
- Sent or allocated spirit points, sent report count, and sent average.
- Average difference between received and sent spirit scoring.
- Sortable columns for team, point totals, report totals, averages, and average difference.
- Visual highlighting when the average difference is notably high or low.

## MVP Page

The MVP page is an administrator page for viewing player MVP standings.

Features include:

- Separate male and female MVP tables.
- Player name, division, team, and points.
- Official scoring note when official scoring is enabled: first-place MVP votes are worth 5 points and second-place MVP votes are worth 3 points.

## Teams Page

The Teams page provides a searchable team directory for the selected season.

Participant-facing features:

- Search teams.
- Sort by team name, division, phone, email, and creation date.
- Paginate through team results.
- Open a read-only team detail view.

Administrator features:

- Create teams.
- Open an administrative team detail view.
- Edit team information and directory details.
- Manage team records through the admin view.

## Join A Team Flow

Users without a team can open a team setup modal.

Features include:

- Search available teams in the current season.
- Request to join an existing team.
- See a pending request message while waiting for captain approval.
- Create a new team when sign-up is available.
- Automatically attach the user to a newly created team.

## Settings Area

Signed-in users can open Settings from the dashboard.

Settings sections include:

| Section | Features |
| --- | --- |
| Account | Manage personal account details. |
| Change Password | Update the user's password. |
| Team | Captain/admin area for managing team details. |
| Members | View and manage team membership information. |
| Season | Administrator area for editing season settings. |

Season settings include:

- Season name.
- Whether the season is hidden from the dashboard season selector.
- Whether team and player sign-up is open.
- Display of the active scoring system, simple or official.

## Users Page

The Users page is an administrator page for account management.

Features include:

- Search users.
- Sort by first name, last name, email, gender, and creation date.
- Paginate through users.
- Create a user manually.
- Open and edit user details.
- Manage user emails, including adding, removing, setting primary email, and verification status.
- Change a user's password.
- Toggle administrator access.
- Review user memberships across seasons.
- Merge duplicate user accounts.

## Data Port Page

The Data Port page is an administrator utility area for importing, exporting, and test data management.

Features include:

- Import CSV data into the current season.
- Export application data as a zip archive.
- Choose CSV or JSON export format.
- Generate mock data.
- Delete mock data with confirmation.

## Permissions Summary

The app separates general participant functionality from administrative functionality.

Generally available features include:

- Viewing fixtures, ladder, and teams.
- Signing up, signing in, and managing personal settings.
- Joining or creating a team when permitted.
- Reporting scores when signed in and attached to a team.

Permission-gated features include:

- Fixture creation, editing, generation, and bulk adjustment.
- Report review, creation, editing, deletion, and missing report checks.
- Spirit and MVP reporting dashboards.
- Team directory administration.
- User administration.
- Season creation and season settings.
- Data import, export, and mock data tools.

## Overall Feature Composition

At a high level, the application contains the following feature groups:

| Feature Group | Purpose |
| --- | --- |
| Authentication | Lets users enter, recover, and verify accounts. |
| Season Management | Lets administrators create and configure seasons. |
| Team Management | Lets users join teams and administrators maintain team records. |
| Fixture Management | Lets users view schedules and administrators build or adjust them. |
| Score Reporting | Collects scores, spirit ratings, comments, and MVP votes. |
| Competition Results | Presents ladders, final results, score charts, spirit tables, and MVP standings. |
| User Administration | Lets administrators manage accounts, access, emails, passwords, and duplicate users. |
| Data Operations | Supports data import/export and mock data management. |

## Review Notes

This document describes the visible software scope based on the current application structure. Some capabilities are only available to users with the appropriate permissions, so reviewers should consider both participant and administrator workflows when checking requirements coverage.
