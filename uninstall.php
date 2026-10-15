<?php
/**
 * Runs when the plugin is deleted in WordPress (Plugins > Delete), not on deactivation or a Git deploy
 * (audit WL-71). Removes the plugin's options, scheduled tasks and the private quote requests (personal
 * data the privacy policy promises to delete). Managed pages are set to draft, not deleted: without the
 * plugin they would show a bare shortcode. If the plugin comes back, the next sync takes them over and
 * publishes them again.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'wattlyst_sync_hash', 'wattlyst_sync_lock', 'wattlyst_warm_queue', 'wattlyst_indexnow_key' ) as $opt ) {
	delete_option( $opt );
}
wp_clear_scheduled_hook( 'wattlyst_lead_cleanup' );
wp_clear_scheduled_hook( 'wattlyst_sync' );
wp_clear_scheduled_hook( 'wattlyst_warm' );

$wattlyst_leads = get_posts( array( 'post_type' => 'wattlyst_lead', 'post_status' => 'any', 'fields' => 'ids', 'numberposts' => -1 ) );
foreach ( $wattlyst_leads as $wattlyst_id ) {
	wp_delete_post( (int) $wattlyst_id, true );
}

$wattlyst_pages = get_posts( array( 'post_type' => 'page', 'post_status' => 'any', 'fields' => 'ids', 'numberposts' => -1, 'meta_key' => '_wattlyst_id' ) ); // phpcs:ignore WordPress.DB.SlowDBQuery
foreach ( $wattlyst_pages as $wattlyst_id ) {
	if ( (int) get_option( 'page_on_front' ) === (int) $wattlyst_id ) {
		update_option( 'show_on_front', 'posts' );
		update_option( 'page_on_front', 0 );
	}
	wp_update_post( array( 'ID' => (int) $wattlyst_id, 'post_status' => 'draft' ) );
	delete_post_meta( (int) $wattlyst_id, '_wattlyst_id' );
}
