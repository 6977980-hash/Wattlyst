<?php
/**
 * Site-root files and crawler plumbing (specs/seo-rules.md sections 4, 6, 8):
 * robots.txt rules, /llms.txt, /ads.txt (only once an AdSense publisher id is set), the IndexNow key
 * file and IndexNow pings when a page is published or updated, and a lean core XML sitemap.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Endpoints {

	private const OPT_INDEXNOW = 'wattlyst_indexnow_key';

	/** Search and AI-search crawlers that are explicitly welcome (seo-rules.md 4). */
	private const CRAWLERS = array( 'Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'DuckDuckBot' );

	private Wattlyst_Tools $plugin;

	public function __construct( Wattlyst_Tools $plugin ) {
		$this->plugin = $plugin;
		add_action( 'init', array( $this, 'serve_root_files' ), 1 );
		add_filter( 'robots_txt', array( $this, 'robots' ), 99, 2 );
		add_filter( 'wp_sitemaps_add_provider', array( $this, 'sitemap_providers' ), 10, 2 );
		add_filter( 'wp_sitemaps_posts_entry', array( $this, 'sitemap_lastmod' ), 10, 2 );
		add_action( 'transition_post_status', array( $this, 'indexnow_on_publish' ), 10, 3 );
	}

	/** Answer /llms.txt, /ads.txt and /{indexnow-key}.txt before WordPress routes the request. */
	public function serve_root_files(): void {
		$path = wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$home = wp_parse_url( home_url( '/' ), PHP_URL_PATH ) ?: '/';
		if ( ! is_string( $path ) || ! str_starts_with( $path, $home ) ) {
			return;
		}
		$file = substr( $path, strlen( $home ) );
		if ( 'llms.txt' === $file ) {
			$this->text( (string) @file_get_contents( WATTLYST_TOOLS_DIR . 'generated/llms.txt' ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		}
		if ( 'ads.txt' === $file ) {
			$pub = $this->plugin->site()['ads']['adsense_pub_id'] ?? null;
			if ( is_string( $pub ) && preg_match( '/^pub-\d{10,20}$/', $pub ) ) {
				$this->text( 'google.com, ' . $pub . ", DIRECT, f08c47fec0942fa0\n" );
			}
		}
		// Data page downloads: /data/{name}.csv from generated/data/ (built with the page, same numbers).
		if ( preg_match( '#^data/([a-z0-9-]+)\.csv$#', $file, $m ) ) {
			$csv = WATTLYST_TOOLS_DIR . 'generated/data/' . $m[1] . '.csv';
			if ( is_readable( $csv ) ) {
				status_header( 200 );
				header( 'Content-Type: text/csv; charset=utf-8' );
				header( 'Content-Disposition: attachment; filename="' . $m[1] . '.csv"' );
				header( 'Cache-Control: public, max-age=3600' );
				header( 'X-Robots-Tag: noindex' );
				readfile( $csv ); // phpcs:ignore WordPress.WP.AlternativeFunctions
				exit;
			}
		}
		// Embeddable calculators: /embed/{id}/ (see the embed page for the codes).
		if ( preg_match( '#^embed/([a-z0-9-]+)/?$#', $file, $m ) ) {
			$this->embed( $m[1] );
		}
		$key = $this->indexnow_key();
		if ( $file === $key . '.txt' ) {
			$this->text( $key );
		}
	}

	/**
	 * A calculator on its own for an iframe on another site: no theme, no ads, noindex, canonical to the full
	 * page, and a visible credit link. Unknown or unpublished ids fall through to WordPress (404).
	 */
	private function embed( string $slug ): void {
		$row = null;
		foreach ( $this->plugin->manifest()['pages'] ?? array() as $r ) {
			if ( strtolower( $r['id'] ) === $slug && ! empty( $r['live'] ) ) {
				$row = $r;
			}
		}
		$page = $row ? $this->plugin->page( $row['id'] ) : null;
		if ( ! $page || empty( $page['content']['tool'] ) ) {
			return;
		}
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-render.php';
		$body = ( new Wattlyst_Render( $this->plugin, $page ) )->embed_html();
		$css  = WATTLYST_TOOLS_DIR . 'assets/css/wattlyst.css';
		status_header( 200 );
		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'Cache-Control: public, max-age=3600' );
		header( 'X-Robots-Tag: noindex, follow' );
		Wattlyst_Site::send_security_headers( true ); // other sites may frame this document
		echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
		echo '<title>' . esc_html( $page['h1'] ) . '</title><meta name="robots" content="noindex, follow">';
		echo '<link rel="canonical" href="' . esc_url( Wattlyst_Tools::link( $page['url'] ) ) . '">';
		echo '<link rel="icon" href="' . esc_url( Wattlyst_Tools::asset( 'assets/brand/favicon.ico' ) ) . '" sizes="any">'; // no /favicon.ico 404 inside the iframe (audit WL-32)
		echo '<style>body{margin:0;padding:12px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1d2327;background:#fff}' . ( is_readable( $css ) ? wp_strip_all_tags( (string) file_get_contents( $css ) ) : '' ) . '</style>';
		echo '</head><body data-wl-embed>' . $body; // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts in Wattlyst_Render.
		printf( '<script type="module" src="%s"></script>', esc_url( $this->plugin->script_url( 'dist/assets/js/wattlyst-tool.js' ) ) );
		echo '</body></html>';
		exit;
	}

	private function text( string $body ): void {
		if ( '' === $body ) {
			return;
		}
		status_header( 200 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'Cache-Control: public, max-age=3600' );
		header( 'X-Robots-Tag: noindex' );
		echo $body; // phpcs:ignore WordPress.Security.EscapeOutput -- plain text file.
		exit;
	}

	public function robots( $output, $public ) {
		if ( ! $public ) {
			return $output; // "Discourage search engines" is on: leave WordPress's block in place.
		}
		$lines = array( '', '# Wattlyst: search and AI search crawlers are welcome' );
		foreach ( self::CRAWLERS as $bot ) {
			$lines[] = 'User-agent: ' . $bot;
		}
		$lines[] = 'Allow: /';
		$lines[] = 'Disallow: /wp-admin/';
		$lines[] = 'Allow: /wp-admin/admin-ajax.php';
		$lines[] = 'Disallow: /?s=';
		$lines[] = 'Disallow: /search/';
		$lines[] = '';
		$lines[] = 'User-agent: *';
		$lines[] = 'Disallow: /wp-admin/';
		$lines[] = 'Allow: /wp-admin/admin-ajax.php';
		$lines[] = 'Disallow: /?s=';
		$lines[] = 'Disallow: /search/';
		$lines[] = '';
		if ( false === stripos( (string) $output, 'Sitemap:' ) ) {
			$lines[] = 'Sitemap: ' . home_url( '/wp-sitemap.xml' );
		}
		// WordPress's default "User-agent: *" block is replaced by ours; keep any Sitemap lines others added.
		$keep = array_filter( explode( "\n", (string) $output ), static fn( $l ) => 0 === stripos( trim( $l ), 'Sitemap:' ) );
		return trim( implode( "\n", array_merge( $lines, $keep ) ) ) . "\n";
	}

	/** The users sitemap would publish login names and has no search value. */
	public function sitemap_providers( $provider, $name ) {
		return 'users' === $name ? false : $provider;
	}

	/**
	 * A managed page's content lives in generated/, so the WordPress post date does not move when the page does.
	 * The sitemap <lastmod> uses the page's own date instead, the same as its schema dateModified (WL-84).
	 */
	public function sitemap_lastmod( $entry, $post ) {
		$id  = $post instanceof WP_Post ? get_post_meta( $post->ID, Wattlyst_Pages::META_ID, true ) : '';
		$row = is_string( $id ) && '' !== $id ? $this->plugin->row( $id ) : null;
		if ( $row && ! empty( $row['lastmod'] ) ) {
			$entry['lastmod'] = $row['lastmod'];
		}
		return $entry;
	}

		public function indexnow_key(): string {
		$key = get_option( self::OPT_INDEXNOW );
		if ( ! is_string( $key ) || ! preg_match( '/^[a-f0-9]{32}$/', $key ) ) {
			$key = bin2hex( random_bytes( 16 ) );
			update_option( self::OPT_INDEXNOW, $key, true );
		}
		return $key;
	}

	/** Tell Bing/IndexNow engines about a published or updated page or post (production host only). */
	public function indexnow_on_publish( $new, $old, $post ): void {
		if ( 'publish' !== $new || ! $post instanceof WP_Post || ! in_array( $post->post_type, array( 'page', 'post' ), true ) ) {
			return;
		}
		if ( wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		$home = wp_parse_url( home_url(), PHP_URL_HOST );
		$prod = wp_parse_url( $this->plugin->site()['url'] ?? '', PHP_URL_HOST );
		if ( ! $home || $home !== $prod || 'production' !== wp_get_environment_type() ) {
			return;
		}
		$key = $this->indexnow_key();
		wp_remote_post(
			'https://api.indexnow.org/indexnow',
			array(
				'blocking' => false,
				'timeout'  => 3,
				'headers'  => array( 'Content-Type' => 'application/json; charset=utf-8' ),
				'body'     => wp_json_encode(
					array(
						'host'        => $home,
						'key'         => $key,
						'keyLocation' => home_url( '/' . $key . '.txt' ),
						'urlList'     => array( get_permalink( $post ) ),
					)
				),
			)
		);
	}
}
