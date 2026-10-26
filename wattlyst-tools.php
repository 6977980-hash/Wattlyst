<?php
/**
 * Plugin Name:       Wattlyst Tools
 * Plugin URI:        https://wattlyst.com/
 * Description:       Electricity calculators for Wattlyst (watts, amps, battery, generator, solar, inverter, bill).
 * Version:           0.8.34
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Author:            Wattlyst
 * License:           GPL-2.0-or-later
 * Text Domain:       wattlyst-tools
 */

defined( 'ABSPATH' ) || exit;

define( 'WATTLYST_TOOLS_VERSION', '0.8.34' );
define( 'WATTLYST_TOOLS_FILE', __FILE__ );
define( 'WATTLYST_TOOLS_DIR', plugin_dir_path( __FILE__ ) );
define( 'WATTLYST_TOOLS_URL', plugin_dir_url( __FILE__ ) );

require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-tools.php';

Wattlyst_Tools::instance();

// Stop the daily quote-request cleanup and any pending page sync when the plugin is switched off.
register_deactivation_hook(
	__FILE__,
	static function (): void {
		wp_clear_scheduled_hook( Wattlyst_Leads::CRON );
		wp_clear_scheduled_hook( Wattlyst_Pages::CRON );
		wp_unschedule_hook( Wattlyst_Pages::WARM );
	}
);
