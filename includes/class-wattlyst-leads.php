<?php
/**
 * Solar quote requests (build-plan Phase 6). The form is printed by Wattlyst_Render::lead() on the pages
 * listed in data/site.json leads.pages, only while leads.enabled is true. A request is checked here,
 * saved as a private "Solar leads" entry that only administrators can see, and emailed to the site's
 * contact address. Requests older than leads.retention_days are deleted by a daily task (privacy policy).
 *
 * Spam guards without JavaScript or cookies (pages are cached, so no nonce): a honeypot field, a signed
 * render-time token (form posted within two seconds of being built = bot) and a per-connection hourly limit.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Leads {

	public const POST_TYPE = 'wattlyst_lead';
	public const CRON      = 'wattlyst_lead_cleanup';
	private const MIN_AGE  = 2; // seconds between building the form and a human sending it

	private Wattlyst_Tools $plugin;

	public function __construct( Wattlyst_Tools $plugin ) {
		$this->plugin = $plugin;
		add_action( 'init', array( $this, 'register' ) );
		add_action( 'admin_post_nopriv_wattlyst_lead', array( $this, 'handle' ) );
		add_action( 'admin_post_wattlyst_lead', array( $this, 'handle' ) );
		add_action( self::CRON, array( $this, 'cleanup' ) );
		add_filter( 'manage_' . self::POST_TYPE . '_posts_columns', array( $this, 'columns' ) );
		add_action( 'manage_' . self::POST_TYPE . '_posts_custom_column', array( $this, 'column' ), 10, 2 );
	}

	public function register(): void {
		$cap = 'manage_options';
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array( 'name' => 'Solar leads', 'singular_name' => 'Solar lead', 'edit_item' => 'Solar lead', 'search_items' => 'Search leads', 'not_found' => 'No quote requests yet.' ),
				'public'              => false,
				'show_ui'             => true,
				'show_in_menu'        => true,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'menu_icon'           => 'dashicons-email-alt',
				'supports'            => array( 'title', 'editor' ),
				'capability_type'     => self::POST_TYPE,
				'map_meta_cap'        => false,
				'capabilities'        => array(
					'edit_post'          => $cap,
					'read_post'          => $cap,
					'delete_post'        => $cap,
					'edit_posts'         => $cap,
					'edit_others_posts'  => $cap,
					'delete_posts'       => $cap,
					'publish_posts'      => $cap,
					'read_private_posts' => $cap,
					'create_posts'       => 'do_not_allow',
				),
			)
		);
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
		}
	}

	/** Signed form build time: "<time>.<signature>". */
	public static function token(): string {
		$t = (string) time();
		return $t . '.' . substr( wp_hash( 'wattlyst_lead|' . $t ), 0, 16 );
	}

	private static function token_ok( string $token ): bool {
		$parts = explode( '.', $token );
		if ( 2 !== count( $parts ) || ! ctype_digit( $parts[0] ) ) {
			return false;
		}
		if ( ! hash_equals( substr( wp_hash( 'wattlyst_lead|' . $parts[0] ), 0, 16 ), $parts[1] ) ) {
			return false;
		}
		$age = time() - (int) $parts[0];
		$max = (int) ( Wattlyst_Tools::instance()->site()['leads']['token_max_age_days'] ?? 0 ) * DAY_IN_SECONDS;
		return $age >= self::MIN_AGE && ( ! $max || $age <= $max );
	}

	/** Field value from the POST body, unslashed and sanitised as one line (or several for msg). */
	private static function post( string $key, bool $multi = false ): string {
		$v = isset( $_POST[ $key ] ) ? wp_unslash( $_POST[ $key ] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification,WordPress.Security.ValidatedSanitizedInput
		if ( ! is_string( $v ) ) {
			return '';
		}
		return trim( $multi ? sanitize_textarea_field( $v ) : sanitize_text_field( $v ) );
	}

	/** Positive number typed by the visitor (optional fields), or '' when empty or not a number. */
	private static function amount( string $v ): string {
		$v = str_replace( ',', '', $v );
		if ( strlen( $v ) > 8 || ! is_numeric( $v ) || ! is_finite( (float) $v ) || (float) $v <= 0 ) {
			return '';
		}
		return (string) ( 0 + $v );
	}

	/**
	 * Address the hourly limit counts against (WL-64). Behind Hostinger's CDN, REMOTE_ADDR can be the edge
	 * server, so every visitor would share one bucket. data/site.json leads.client_ip_header names the
	 * header the CDN sets to the visitor's address (only a header the CDN overwrites can be trusted; a
	 * visitor can send any header). Empty: REMOTE_ADDR. The first address of a list is used.
	 */
	private static function client_ip( string $header ): string {
		$remote = (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		if ( '' === $header ) {
			return $remote;
		}
		$key   = 'HTTP_' . strtoupper( str_replace( '-', '_', $header ) );
		$first = trim( explode( ',', (string) ( $_SERVER[ $key ] ?? '' ) )[0] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		return filter_var( $first, FILTER_VALIDATE_IP ) ? $first : $remote;
	}

	public function handle(): void {
		$site  = $this->plugin->site();
		$leads = $site['leads'] ?? array();
		$id    = self::post( 'page' );
		$row   = preg_match( '/^[A-Za-z0-9-]+$/', $id ) ? $this->plugin->row( $id ) : null;
		if ( ! $row || empty( $row['live'] ) || empty( $leads['enabled'] ) || ! in_array( $id, $leads['pages'] ?? array(), true ) ) {
			wp_safe_redirect( home_url( '/' ) );
			exit;
		}
		$back = Wattlyst_Tools::link( $row['url'] );
		$fail = static function ( string $why ) use ( $back ): void {
			wp_safe_redirect( add_query_arg( array( 'lead' => 'error', 'why' => $why ), $back ) . '#wl-lead' );
			exit;
		};

		if ( '' !== self::post( 'website' ) || ! self::token_ok( self::post( 'wl_t' ) ) ) {
			$fail( 'spam' );
		}
		$name  = mb_substr( self::post( 'name' ), 0, 80 );
		$phone = preg_replace( '/[\s\-().]/', '', self::post( 'phone' ) );
		$city  = sanitize_key( self::post( 'city' ) );
		$cities = wp_list_pluck( $leads['cities'] ?? array(), 'name', 'id' );
		if ( mb_strlen( $name ) < 2 ) {
			$fail( 'name' );
		}
		// Pakistani mobile: 03xxxxxxxxx, 923xxxxxxxxx or +923xxxxxxxxx; stored as +923xxxxxxxxx.
		if ( ! preg_match( '/^(?:\+?92|0)(3\d{9})$/', (string) $phone, $m ) ) {
			$fail( 'phone' );
		}
		$phone = '+92' . $m[1];
		if ( 'other' !== $city && ! isset( $cities[ $city ] ) ) {
			$fail( 'city' );
		}
		if ( '1' !== self::post( 'consent' ) ) {
			$fail( 'consent' );
		}

		$ip_key = 'wl_lead_' . substr( wp_hash( self::client_ip( (string) ( $leads['client_ip_header'] ?? '' ) ) ), 0, 20 );
		$count  = (int) get_transient( $ip_key );
		if ( $count >= (int) ( $leads['rate_limit_per_hour'] ?? 1 ) ) {
			$fail( 'rate' );
		}
		set_transient( $ip_key, $count + 1, HOUR_IN_SECONDS );

		$fields = array(
			'Name'          => $name,
			'Mobile'        => $phone,
			'City'          => 'other' === $city ? 'Other' : $cities[ $city ],
			'System kW'     => self::amount( self::post( 'kw' ) ),
			'Monthly units' => self::amount( self::post( 'units' ) ),
			'Message'       => mb_substr( self::post( 'msg', true ), 0, 500 ),
			'Page'          => $back,
		);
		$body = '';
		foreach ( $fields as $k => $v ) {
			$body .= $k . ': ' . ( '' === $v ? '-' : $v ) . "\n";
		}
		$post_id = wp_insert_post(
			array(
				'post_type'    => self::POST_TYPE,
				'post_status'  => 'private',
				'post_title'   => $name . ' - ' . $fields['City'],
				'post_content' => $body,
				'meta_input'   => array(
					'_wl_phone' => $phone,
					'_wl_city'  => $fields['City'],
					'_wl_kw'    => $fields['System kW'],
					'_wl_page'  => $id,
				),
			),
			true
		);
		if ( is_wp_error( $post_id ) ) {
			$fail( 'send' );
		}
		if ( ! empty( $site['contact_email'] ) ) {
			// Notice only: the details stay in WordPress, where the retention cleanup deletes them.
			wp_mail( $site['contact_email'], 'New solar quote request: ' . $fields['City'], 'A new solar quote request was saved. Open it in WordPress > Solar leads: ' . admin_url( 'post.php?post=' . (int) $post_id . '&action=edit' ) );
		}
		wp_safe_redirect( add_query_arg( 'lead', 'sent', $back ) . '#wl-lead' );
		exit;
	}

	/** Daily: delete requests older than the retention period stated in the privacy policy. */
	public function cleanup(): void {
		$days = (int) ( $this->plugin->site()['leads']['retention_days'] ?? 0 );
		if ( $days < 1 ) {
			return;
		}
		$old = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => 200,
				'date_query'     => array( array( 'before' => gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS ), 'column' => 'post_date_gmt' ) ),
			)
		);
		foreach ( $old as $pid ) {
			wp_delete_post( (int) $pid, true );
		}
	}

	public function columns( array $cols ): array {
		return array(
			'cb'       => $cols['cb'] ?? '',
			'title'    => 'Name and city',
			'wl_phone' => 'Mobile',
			'wl_kw'    => 'System kW',
			'wl_page'  => 'Page',
			'date'     => 'Date',
		);
	}

	public function column( string $col, int $post_id ): void {
		$map = array( 'wl_phone' => '_wl_phone', 'wl_kw' => '_wl_kw', 'wl_page' => '_wl_page' );
		if ( isset( $map[ $col ] ) ) {
			echo esc_html( (string) get_post_meta( $post_id, $map[ $col ], true ) );
		}
	}
}
