<?php
/**
 * Manual AdSense units (specs/seo-rules.md section 8, build-plan Phase 6). Nothing is printed until
 * data/site.json has ads.enabled = true, a pub id and the ad unit number of a slot (after AdSense
 * approval). Then each slot is a labelled box with a fixed reserved height, so an ad loading late cannot
 * shift the page (no CLS). Templates place at most three units, away from calculator inputs and the
 * Calculate button. No ads on the home page, data, embed or trust pages, or on a thank-you state.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Ads {

	/** The three manual units, in page order (tools/lib/monetize.js AD_SLOTS). */
	public const SLOTS = array( 'content-1', 'content-2', 'content-3' );

	/** Page types that may carry ads. */
	private const TYPES = array( 'tool', 'appliance', 'guide', 'lookup' );

	/** True when this page may show ads in this request. */
	public static function active( array $site, ?array $page ): bool {
		$ads = $site['ads'] ?? array();
		if ( empty( $ads['enabled'] ) || empty( $ads['adsense_pub_id'] ) || ! $page ) {
			return false;
		}
		if ( ! in_array( $page['type'] ?? '', self::TYPES, true ) ) {
			return false;
		}
		// A quote-form thank-you or error state is not a place for ads (AdSense policy).
		if ( isset( $_GET['lead'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return false;
		}
		return (bool) array_filter( $ads['slots'] ?? array() );
	}

	/** AdSense loader for <head>, printed once on pages that show ads. */
	public static function loader( array $site, ?array $page ): string {
		if ( ! self::active( $site, $page ) ) {
			return '';
		}
		$client = 'ca-' . $site['ads']['adsense_pub_id'];
		return sprintf(
			'<script async src="%s" crossorigin="anonymous"></script>' . "\n",
			esc_url( 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' . rawurlencode( $client ) )
		);
	}

	public static function slot( string $name, array $site, array $page ): string {
		$unit = $site['ads']['slots'][ $name ] ?? null;
		if ( ! $unit || ! in_array( $name, self::SLOTS, true ) || ! self::active( $site, $page ) ) {
			return '';
		}
		return sprintf(
			'<aside class="wl-ad wl-ad-%1$s" aria-label="Advertisement"><span class="wl-ad-label">Advertisement</span><div class="wl-ad-box"><ins class="adsbygoogle" style="display:block" data-ad-client="%2$s" data-ad-slot="%3$s" data-ad-format="auto" data-full-width-responsive="true"></ins></div><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>',
			esc_attr( $name ),
			esc_attr( 'ca-' . $site['ads']['adsense_pub_id'] ),
			esc_attr( (string) $unit )
		);
	}
}
