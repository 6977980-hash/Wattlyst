<?php
/**
 * Main plugin class: registers shortcodes and assets.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Tools {

	private static ?Wattlyst_Tools $instance = null;

	public static function instance(): Wattlyst_Tools {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'init', array( $this, 'register_shortcodes' ) );
	}

	public function register_shortcodes(): void {
		add_shortcode( 'wattlyst_status', array( $this, 'render_status' ) );
	}

	/**
	 * [wattlyst_status] prints the deployed plugin version, to confirm auto-deploy worked.
	 */
	public function render_status(): string {
		return sprintf(
			'<p class="wattlyst-status">Wattlyst Tools v%s is active.</p>',
			esc_html( WATTLYST_TOOLS_VERSION )
		);
	}
}
