<?php
/**
 * Ad slot partials (specs/seo-rules.md section 8). Nothing is printed until data/site.json has
 * ads.enabled = true (after AdSense approval). Then each slot is a labelled box with a fixed reserved
 * height, so an ad loading late cannot shift the page (no CLS). Slots are placed by the templates
 * away from calculator inputs and the Calculate button.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Ads {

	/** Reserved heights in px: mobile, desktop. */
	public const SLOTS = array(
		'content-1' => array( 280, 280 ),
		'content-2' => array( 280, 280 ),
		'sidebar'   => array( 0, 600 ),
	);

	public static function slot( string $name, array $site ): string {
		if ( empty( $site['ads']['enabled'] ) || ! isset( self::SLOTS[ $name ] ) ) {
			return '';
		}
		return sprintf(
			'<aside class="wl-ad wl-ad-%1$s" aria-label="Advertisement"><span class="wl-ad-label">Advertisement</span><div class="wl-ad-box" data-slot="%1$s"></div></aside>',
			esc_attr( $name )
		);
	}
}
