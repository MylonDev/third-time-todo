# Testing on the phone

Wake lock, backgrounding and the icon badge behave differently on a real iPhone
from anything a desktop browser or the test suite can show. Run this on the
installed app, not in Safari, and note the iOS version.

Target device: iPhone on iOS 27.2 (developer build).

## Install
1. Open https://mylondev.github.io/third-time-todo/ in Safari.
2. Share, then Add to Home Screen. Open it from the new icon.
3. It should open full screen with no Safari bars, and the clock area should
   clear the notch and the home indicator.
4. The install hint should no longer show.

## Wake lock
1. Start Should. "Screen stays on while timing." should appear.
2. Leave the phone untouched for longer than its auto-lock time. The screen
   should stay on.
3. Stop the timer. Leave it. The screen should lock as normal.
4. Start it again, press the side button to lock, then wake the phone. The text
   should reappear within a couple of seconds.
5. If the text never appears, wake lock isn't granted in the installed app on
   this iOS version. Everything else should still work.

## Background tracking
1. Start Should, switch to another app for 3 minutes, come back. The elapsed time
   should be about 3 minutes more, and Want available about a minute more.
2. Start Should, lock the phone for 5 minutes, unlock. Same expectation.
3. Start Should, force quit the app from the app switcher, wait 2 minutes, reopen.
   The timer should still be running with the elapsed time correct.
4. Try the Fix timer control after each of these.

## Icon badge
1. Settings, switch on "Show Want available on the app icon". Allow notifications
   when asked.
2. Start Should and run a few minutes. Leave the app. The icon badge should show
   the whole minutes of Want available as they were when you left.
3. Run into debt: the badge should clear.

## Day boundary
1. Set the day end to 1:00 AM, leave a timer running past midnight, and check the
   next morning that the day totals look right and nothing was lost.
