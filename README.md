# Wattlyst

WordPress plugin `wattlyst-tools` for [wattlyst.com](https://wattlyst.com): electricity calculators
(watts/amps, battery, generator, solar/inverter, home load, Pakistan electricity bill).

Deploy: Hostinger Git pulls `main` into `wp-content/plugins/wattlyst-tools` on every push.
Check a deploy with the `[wattlyst_status]` shortcode. See `CLAUDE.md` for rules.

Build: `node tools/build.js` regenerates `generated/` from specs, content and data; `npm test` checks
it is current. Local preview: `tools/wp-test-site.sh /tmp/wp` starts WordPress + GeneratePress with this plugin.
