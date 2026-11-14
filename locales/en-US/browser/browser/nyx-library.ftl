# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## about:library (src/nyx/library)

nyx-library-title = Library
nyx-library-history = History
nyx-library-bookmarks = Bookmarks
nyx-library-downloads = Downloads
nyx-library-reading = Reading list

nyx-library-find-history =
    .placeholder = Find in history
    .aria-label = Find in history
nyx-library-find-bookmarks =
    .placeholder = Find in bookmarks
    .aria-label = Find in bookmarks
nyx-library-find-downloads =
    .placeholder = Find in downloads
    .aria-label = Find in downloads
nyx-library-find-reading =
    .placeholder = Find in your reading list
    .aria-label = Find in your reading list
nyx-library-nothing-found = Nothing matches

## History

nyx-library-clear-history = Clear history…
nyx-library-today = Today
nyx-library-yesterday = Yesterday
nyx-library-more = Show more
nyx-library-history-empty = The pages you visit will be here
nyx-library-remove =
    .title = Remove
    .aria-label = Remove

## Bookmarks

nyx-library-add = Add
nyx-library-new-folder = New folder
nyx-library-import-backup = Import and back up
nyx-library-bring-in = Bring in
nyx-library-import-browser = From another browser…
nyx-library-import-file = From a file (HTML)…
nyx-library-import-file-title = Bring in bookmarks from a file
nyx-library-keep-copy = Keep a copy
nyx-library-backup = Back up now…
nyx-library-backup-title = Back up your bookmarks
nyx-library-export = Export as a file (HTML)…
nyx-library-export-title = Export your bookmarks
nyx-library-restore = Put back
# $date (String) - when the copy was made; $count (Number) - how many bookmarks it holds
nyx-library-restore-backup = { $date } · { $count } bookmarks
nyx-library-restore-file = From a file…
nyx-library-restore-title = Put back your bookmarks
nyx-library-restore-body = Every bookmark now is replaced by the ones in the copy.
nyx-library-restore-format = That isn't a bookmarks backup (.json or .jsonlz4).
nyx-library-restore-failed = That backup couldn't be read.
nyx-library-bookmarks-bar = Bookmarks bar
nyx-library-bookmarks-menu = Bookmarks menu
nyx-library-other-bookmarks = Other bookmarks
# $count (Number) - How many bookmarks the folder has
nyx-library-folder-count =
    { $count ->
        [one] 1 bookmark
       *[other] { $count } bookmarks
    }
nyx-library-folder-empty = This folder is empty
nyx-library-edit =
    .title = Edit
    .aria-label = Edit
nyx-library-delete =
    .title = Delete
    .aria-label = Delete
nyx-library-add-title = Add a bookmark
nyx-library-add-url = Its address
nyx-library-add-name = Its name
nyx-library-new-folder-title = New folder
nyx-library-new-folder-name = The folder's name
nyx-library-edit-title = Edit the bookmark

## Downloads

nyx-library-open-folder = Open folder
nyx-library-downloads-empty = The files you download will be here
nyx-library-pause =
    .title = Pause
    .aria-label = Pause
nyx-library-show-file =
    .title = Show in its folder
    .aria-label = Show in its folder
# $host (String) - The site it came from; $when (String) - Its date
nyx-library-download-failed = Failed · { $host } · { $when }
# $host (String) - The site it came from; $when (String) - Its date
nyx-library-download-stopped = Paused · { $host } · { $when }
nyx-library-retry = Retry
nyx-library-resume = Resume

## Reading list

nyx-library-reading-empty = Save pages here from a tab's menu, to read later in Reader view

## about:extensions (src/nyx/library/extensions.js)

nyx-ext-page-title = Extensions
nyx-ext-page-extensions = Extensions
nyx-ext-page-themes = Themes
nyx-ext-page-plugins = Plugins
nyx-ext-page-access = Site access
nyx-ext-page-shortcuts = Shortcuts
nyx-ext-page-find =
    .placeholder = Find in your extensions
    .aria-label = Find in your extensions
nyx-ext-get-extensions = Get extensions
nyx-ext-page-built-in = Built into Browser
nyx-ext-page-blocking = Content blocking
nyx-ext-page-blocking-note = uBlock Origin, with Browser's own panel.
nyx-ext-page-passwords = Passwords
nyx-ext-page-passwords-note = Nyx Passwords fills logins and passkeys.
nyx-ext-page-vpn = VPN
nyx-ext-page-vpn-note = Browser only; per workspace.
nyx-ext-page-settings = Settings
nyx-ext-page-installed = Installed
nyx-ext-page-none = None yet
nyx-ext-page-access-off = Off
nyx-ext-page-access-all = Site access: every site
nyx-ext-page-access-click = Site access: on click
# $host (String) - The first site it can read; $more (Number) - how many others
nyx-ext-page-access-sites =
    { $more ->
        [0] Site access: { $host }
       *[other] Site access: { $host } and { $more } more
    }
nyx-ext-page-access-note = What each extension can read and change on the pages you open.
nyx-ext-page-themes-sub = Browser's colours: a Nyx theme and an accent. Other Nyx apps keep their own.
nyx-ext-page-themes-unavailable = Browser's theme bridge isn't installed, so it keeps its own colours.
nyx-ext-page-follow = Follow system
# $name (String) - the theme the system shows now, like Omarchy; $appearance - light or dark
nyx-ext-page-follow-note =
    { $name } · { $appearance ->
        [light] light
       *[dark] dark
    } · what Nyx Settings picks for every app
nyx-ext-page-dark = Dark
nyx-ext-page-light = Light
nyx-ext-page-accent = Accent
nyx-ext-page-accent-note = Buttons, links, the selected tab and folders
nyx-ext-page-accent-default = Theme default
# $version (String), $author (String) - who made it, $date (String) - when it was last updated
nyx-ext-page-version = Version { $version } · { $author } · { $date }
nyx-ext-page-own-settings = Its own settings
nyx-ext-page-read-pages = Read and change pages
nyx-ext-page-in-browser = In Browser
nyx-ext-page-private = Run in private windows
nyx-ext-page-pin = Pin its button
nyx-ext-page-pin-note = Beside Extensions, wherever the layout keeps them
nyx-ext-page-updates = Update automatically
nyx-ext-page-remove = Remove
nyx-ext-page-remove-title = Remove the extension
# $name (String) - The extension's name
nyx-ext-page-remove-message = Remove { $name } from Browser?
nyx-ext-page-remove-confirm = Remove
nyx-ext-page-remove-menu = Remove…
nyx-ext-page-report = Report…
nyx-ext-page-report-button = Report
# $name (String) - The extension's name
nyx-ext-page-more-for =
    .title = More for { $name }
    .aria-label = More for { $name }
nyx-ext-page-move-up = Move up
nyx-ext-page-move-down = Move down
nyx-ext-page-permissions-and-details = Permissions and details

## An extension's page: its tabs

nyx-ext-page-tab-overview = Overview
nyx-ext-page-tab-permissions = Permissions
nyx-ext-page-tab-options = Its options
nyx-ext-page-needs = It needs
nyx-ext-page-needs-nothing = Nothing beyond its own storage
nyx-ext-page-may-ask = It may ask for
nyx-ext-page-may-ask-note = Off until you turn them on
nyx-ext-page-sites = Sites
nyx-ext-page-every-site = Every site
nyx-ext-page-site-needed = Needed
nyx-ext-page-site-remove =
    .title = Take this site away
    .aria-label = Take this site away
nyx-ext-page-site-add = Add a site
nyx-ext-page-site-add-title = Add a site
# $name (String) - The extension's name
nyx-ext-page-site-add-prompt = Which site may { $name } always read? (example.com)
nyx-ext-page-options-tab = It opens its options in a tab of their own.
nyx-ext-page-options-open = Open its options
nyx-ext-page-options-failed = Its options couldn't be shown here.

## Shortcuts

nyx-ext-page-shortcuts-sub = Keys for what extensions can do. Browser's own are in Settings › Gestures.
nyx-ext-page-shortcuts-none = No extension has anything to give a key to.
nyx-ext-page-cmd-action = Open its button
nyx-ext-page-cmd-page-action = Open its address-field button
nyx-ext-page-cmd-sidebar = Open its sidebar
nyx-ext-page-shortcut-none = Not set
nyx-ext-page-shortcut-change = Change
nyx-ext-page-shortcut-set = Set
nyx-ext-page-shortcut-clear =
    .title = Clear the shortcut
    .aria-label = Clear the shortcut
nyx-ext-page-shortcut-press = Press the keys · Esc keeps the old ones
# $shortcut (String) - like Alt+Shift+D; $other (String) - another extension's name
nyx-ext-page-shortcut-clash = { $shortcut } is { $other }'s too: only one of them works
nyx-ext-page-shortcut-taken = { $shortcut } is { $other }'s already
# $shortcut (String) - like Ctrl+T
nyx-ext-page-shortcut-browser = { $shortcut } is one of Browser's own
nyx-ext-page-shortcut-modifier = Use Ctrl or Alt with a letter or number
nyx-ext-page-shortcut-invalid = That key can't be a shortcut
