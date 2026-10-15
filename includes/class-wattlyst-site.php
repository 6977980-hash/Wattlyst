<?php
/**
 * WordPress-level SEO and security plumbing (audit Phase 4). The site has no blog, so WordPress's
 * author/date/empty archives, feeds and version tags only leak information or make thin indexable URLs.
 *
 * - Author archives and ?author=N: 404 (no username enumeration, WL-37, WL-62). Users REST routes and
 *   oEmbed author fields: hidden from visitors who are not logged in (WL-62).
 * - Archives with no posts: 404; date archives: noindex (WL-37). Feeds: 404, feed links removed (WL-38).
 * - One canonical URL per page: uppercase paths 301 to lowercase, /page/N/ on a page is a 404 (WL-41).
 * - Generator tag, core ?ver= with the WordPress version, RSD/WLW links, shortlink, X-Pingback, XML-RPC:
 *   removed (WL-44, WL-67). readme.html and license.txt in the WordPress root are deleted after each sync
 *   and core update (they only state the version; WordPress puts them back on update and we delete again).
 * - Security headers on every front-end response (WL-63); the /embed/ document may be framed by any site.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Site {

	public function __construct() {
		add_action( 'init', array( $this, 'head_cleanup' ) );
		add_action( 'template_redirect', array( $this, 'gate' ), 1 );
		add_filter( 'wp_robots', array( $this, 'robots' ) );
		add_filter( 'wp_headers', array( $this, 'headers' ) );
		add_filter( 'rest_endpoints', array( $this, 'rest_endpoints' ) );
		add_filter( 'oembed_response_data', array( $this, 'oembed_data' ) );
		add_filter( 'the_generator', '__return_empty_string' );
		add_filter( 'xmlrpc_enabled', '__return_false' );
		add_filter( 'style_loader_src', array( $this, 'hide_core_version' ) );
		add_filter( 'script_loader_src', array( $this, 'hide_core_version' ) );
		add_action( '_core_updated_successfully', array( __CLASS__, 'remove_version_files' ) );
		add_filter( 'redirect_canonical', array( $this, 'keep_share_link' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'menu_escape' ), 20 );
	}

	/** Escape closes the GeneratePress phone menu and gives focus back to its button (audit WL-137); the theme is not edited. */
	public function menu_escape(): void {
		wp_add_inline_script( 'generate-menu', "document.addEventListener('keydown',function(e){var b=e.key==='Escape'&&document.querySelector('.menu-toggle[aria-expanded=\"true\"]');if(b){b.click();b.focus()}});" );
	}

	/**
	 * Core redirect_canonical 301s the front page's /?load=a:1,b:2 to a copy with ":" and "," percent-encoded, which the
	 * tool script cannot split, so a shared homepage plan opened as the defaults (audit WL-89). The page is the same.
	 */
	public function keep_share_link( $redirect ) {
		return is_front_page() && isset( $_GET['load'] ) ? false : $redirect; // phpcs:ignore WordPress.Security.NonceVerification
	}

	public function head_cleanup(): void {
		remove_action( 'wp_head', 'feed_links', 2 );
		remove_action( 'wp_head', 'feed_links_extra', 3 );
		remove_action( 'wp_head', 'rsd_link' );
		remove_action( 'wp_head', 'wlwmanifest_link' );
		remove_action( 'wp_head', 'wp_generator' );
		remove_action( 'wp_head', 'wp_shortlink_wp_head', 10 );
		remove_action( 'template_redirect', 'wp_shortlink_header', 11 );
	}

	/** Runs before redirect_canonical (priority 10), so ?author=N never turns into /author/<login>/. */
	public function gate(): void {
		global $wp_query;
		if ( is_feed() || is_author() || ( is_archive() && ! $wp_query->have_posts() ) ) {
			self::not_found();
			return;
		}
		if ( is_singular() ) {
			$post  = get_queried_object();
			$paged = max( (int) get_query_var( 'paged' ), (int) get_query_var( 'page' ) );
			if ( $paged > 1 && $post instanceof WP_Post && ! str_contains( $post->post_content, '<!--nextpage-->' ) ) {
				self::not_found();
				return;
			}
			$uri  = (string) ( $_SERVER['REQUEST_URI'] ?? '' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
			$path = (string) wp_parse_url( $uri, PHP_URL_PATH );
			if ( '' !== $path && strtolower( $path ) !== $path ) {
				$query = wp_parse_url( $uri, PHP_URL_QUERY );
				wp_safe_redirect( strtolower( $path ) . ( $query ? '?' . $query : '' ), 301 );
				exit;
			}
		}
	}

	private static function not_found(): void {
		global $wp_query;
		$wp_query->set_404();
		// set_404() keeps is_feed, so the template loader would still print the RSS body (WL-144): show the HTML 404.
		$wp_query->is_feed = false;
		status_header( 404 );
		nocache_headers();
		// WP::send_headers already sent the feed's RSS Content-Type; replace it.
		if ( ! headers_sent() ) {
			header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );
		}
		// Otherwise redirect_canonical (priority 10) turns /<page>/feed/ into /<page>/feed/feed/ before the 404 (WL-82).
		remove_action( 'template_redirect', 'redirect_canonical' );
	}

	/** Date archives are thin lists of posts: keep them out of the index (search is noindex in core). */
	public function robots( $robots ) {
		if ( is_date() ) {
			$robots['noindex'] = true;
			$robots['follow']  = true;
			unset( $robots['index'] );
		}
		return $robots;
	}

	/** Front-end responses (WP::send_headers). The /embed/ document sends its own set (embed_headers). */
	public function headers( $headers ) {
		unset( $headers['X-Pingback'] );
		return array_merge( $headers, self::security_headers( false ) );
	}

	/**
	 * Security headers (WL-63). frame-ancestors / X-Frame-Options stop other sites framing normal pages
	 * (clickjacking); the embed document is meant to be framed, so it gets the rest without them.
	 */
	public static function security_headers( bool $frameable ): array {
		$h = array(
			'X-Content-Type-Options' => 'nosniff',
			'Referrer-Policy'        => 'strict-origin-when-cross-origin',
			'Permissions-Policy'     => 'camera=(), microphone=(), usb=(), magnetometer=(), gyroscope=()',
		);
		if ( is_ssl() ) {
			$h['Strict-Transport-Security'] = 'max-age=31536000';
		}
		if ( ! $frameable ) {
			$h['X-Frame-Options']         = 'SAMEORIGIN';
			$h['Content-Security-Policy'] = "frame-ancestors 'self'";
		}
		return $h;
	}

	public static function send_security_headers( bool $frameable ): void {
		foreach ( self::security_headers( $frameable ) as $k => $v ) {
			header( $k . ': ' . $v );
		}
	}

	/** Login names stay private: no users list or single user over REST for visitors (editor still works). */
	public function rest_endpoints( $endpoints ) {
		if ( ! is_user_logged_in() ) {
			foreach ( array_keys( $endpoints ) as $route ) {
				if ( str_starts_with( $route, '/wp/v2/users' ) ) {
					unset( $endpoints[ $route ] );
				}
			}
		}
		return $endpoints;
	}

	public function oembed_data( $data ) {
		unset( $data['author_name'], $data['author_url'] );
		return $data;
	}

	/** Core files keep cache busting by version, but the URL no longer states the WordPress version. */
	public function hide_core_version( $src ) {
		$wp = get_bloginfo( 'version' );
		if ( is_string( $src ) && str_contains( $src, 'ver=' . $wp ) ) {
			$src = add_query_arg( 'ver', substr( wp_hash( 'ver|' . $wp ), 0, 8 ), $src );
		}
		return $src;
	}

	/** readme.html and license.txt in the WordPress root (WL-44); WordPress restores them on core updates. */
	public static function remove_version_files(): void {
		foreach ( array( 'readme.html', 'license.txt' ) as $f ) {
			if ( is_file( ABSPATH . $f ) && is_writable( ABSPATH . $f ) ) {
				wp_delete_file( ABSPATH . $f );
			}
		}
	}
}
