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
		$key = $this->indexnow_key();
		if ( $file === $key . '.txt' ) {
			$this->text( $key );
		}
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
