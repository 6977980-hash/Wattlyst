<?php
/**
 * <head> output: title, meta description, canonical, Open Graph, Twitter card, JSON-LD and icons.
 *
 * On Wattlyst pages the plugin owns these tags (values from specs/keyword-map.csv via generated/), so
 * Rank Math's head output is switched off there to avoid duplicates. Other pages keep Rank Math.
 * Site-wide: favicon / Apple touch icon (unless a Site Icon is set) and Organization + WebSite schema
 * on the front page.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Head {

	private Wattlyst_Tools $plugin;

	public function __construct( Wattlyst_Tools $plugin ) {
		$this->plugin = $plugin;
		add_action( 'init', array( $this, 'no_emoji' ) );
		add_action( 'wp', array( $this, 'take_over' ) );
		add_filter( 'pre_get_document_title', array( $this, 'title' ), 99 );
		add_action( 'wp_head', array( $this, 'head' ), 1 );
		add_action( 'wp_head', array( $this, 'icons' ), 2 );
		add_filter( 'rank_math/json_ld', array( $this, 'rank_math_front_schema' ), 99 );
		add_filter( 'wp_robots', array( $this, 'robots' ) );
		add_filter( 'generate_logo', array( $this, 'logo' ) );
		add_filter( 'generate_logo_attributes', array( $this, 'logo_attributes' ) );
		add_filter( 'generate_site_title_output', array( $this, 'site_title' ) );
	}

	/** Brand logo in the GeneratePress header until the owner sets a Custom Logo (the SVG holds the wordmark). */
	public function logo( $url ) {
		return $url ? $url : Wattlyst_Tools::asset( 'assets/brand/logo.svg' );
	}

	public function logo_attributes( $attr ) {
		if ( ! get_theme_mod( 'custom_logo' ) ) {
			$attr['width']  = '174'; // logo.svg viewBox 543 x 100 at 32 px high: no layout shift.
			$attr['height'] = '32';
			$attr['alt']    = $this->plugin->site()['brand'] ?? 'Wattlyst';
		}
		return $attr;
	}

	/** The logo already shows the brand name, so the text title would repeat it. */
	public function site_title( $html ) {
		return get_theme_mod( 'custom_logo' ) ? $html : '';
	}

	/** Wattlyst pages are always indexable with full snippets (core prints the one robots meta tag). */
	public function robots( $robots ) {
		if ( $this->current() && get_option( 'blog_public' ) ) {
			$robots['index']             = true;
			$robots['follow']            = true;
			$robots['max-snippet']       = '-1';
			$robots['max-image-preview'] = 'large';
		}
		return $robots;
	}

	private function current(): ?array {
		$id = Wattlyst_Pages::current_id();
		return $id ? $this->plugin->page( $id ) : null;
	}

	/** Remove other head output that would duplicate ours on Wattlyst pages. */
	public function take_over(): void {
		if ( ! $this->current() ) {
			return;
		}
		remove_all_actions( 'rank_math/head' );
		remove_action( 'wp_head', 'rel_canonical' );
		remove_action( 'wp_head', 'wp_shortlink_wp_head', 10 );
	}

	public function title( $title ) {
		$page = $this->current();
		return $page ? $page['title'] : $title;
	}

	public function head(): void {
		$page = $this->current();
		if ( is_front_page() && ! $page ) {
			$this->json_ld( $this->plugin->manifest()['website_schema'] ?? null );
			return;
		}
		if ( ! $page ) {
			return;
		}
		$site  = $this->plugin->site();
		// Canonical is always the clean URL: ?load= result links point back to the page itself.
		$url   = Wattlyst_Tools::link( $page['url'] );
		$image = Wattlyst_Tools::asset( $site['og_image'] ?? 'assets/brand/og-default.png' );
		$type  = 'guide' === $page['type'] ? 'article' : 'website';

		echo "\n<!-- Wattlyst SEO -->\n";
		printf( '<meta name="description" content="%s">' . "\n", esc_attr( $page['meta'] ) );
		printf( '<link rel="canonical" href="%s">' . "\n", esc_url( $url ) );
		$og = array(
			'og:locale'       => 'en_US',
			'og:type'         => $type,
			'og:site_name'    => $site['brand'] ?? '',
			'og:title'        => $page['title'],
			'og:description'  => $page['meta'],
			'og:url'          => $url,
			'og:image'        => $image,
			'og:image:type'   => 'image/png',
			'og:image:width'  => '1200',
			'og:image:height' => '630',
			'og:image:alt'    => ( $site['brand'] ?? '' ) . ': ' . ( $site['tagline'] ?? '' ),
		);
		foreach ( $og as $k => $v ) {
			printf( '<meta property="%s" content="%s">' . "\n", esc_attr( $k ), esc_attr( $v ) );
		}
		if ( 'article' === $type && ! empty( $page['reviewed'] ) ) {
			printf( '<meta property="article:modified_time" content="%s">' . "\n", esc_attr( $page['reviewed'] ) );
		}
		$tw = array(
			'twitter:card'        => 'summary_large_image',
			'twitter:title'       => $page['title'],
			'twitter:description' => $page['meta'],
			'twitter:image'       => Wattlyst_Tools::asset( $site['twitter_image'] ?? $site['og_image'] ?? 'assets/brand/og-default.png' ),
			'twitter:image:alt'   => $og['og:image:alt'],
		);
		foreach ( $tw as $k => $v ) {
			printf( '<meta name="%s" content="%s">' . "\n", esc_attr( $k ), esc_attr( $v ) );
		}
		$this->json_ld( $page['schema'] ?? null );
		$this->styles();
		echo Wattlyst_Ads::loader( $site, $page ); // phpcs:ignore WordPress.Security.EscapeOutput -- escaped in loader()
		if ( ! empty( $page['content']['tool'] ) ) {
			$this->preload( $page['content']['tool'] );
		}
		echo "<!-- /Wattlyst SEO -->\n";
	}

	private function json_ld( ?array $schema ): void {
		if ( ! $schema ) {
			return;
		}
		echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ) . "</script>\n";
	}

	/** Small stylesheet inlined on Wattlyst pages only (no extra render-blocking request). */
	private function styles(): void {
		$css = WATTLYST_TOOLS_DIR . 'assets/css/wattlyst.css';
		if ( is_readable( $css ) ) {
			echo '<style id="wattlyst-css">' . wp_strip_all_tags( (string) file_get_contents( $css ) ) . "</style>\n";
		}
	}

	private function preload( array $tool ): void {
		// dist/ holds the stripped copies built by tools/build.js (same code, no comments or indentation).
		// Whole import chain (tool script, shared modules, the calculator module and its nested imports), each
		// under the exact versioned URL the import uses, so nothing is fetched twice or discovered late.
		// Pages with an appliance list also load the list module (assets/js/wattlyst-loads.js); the live forecast
		// and diagram pages load assets/js/wattlyst-extra.js.
		$module  = basename( (string) $tool['module'] );
		$engine  = array_unique( array_merge( array( 'format.js', 'messages.js', 'core.js', $module ), $this->plugin->module_deps( $module ) ) );
		$list    = in_array( 'loads', array_column( $tool['fields'] ?? array(), 'type' ), true ) ? array( 'dist/assets/js/wattlyst-loads.js' ) : array();
		$extra   = ! empty( $tool['live'] ) || ! empty( $tool['diagram'] ) ? array( 'dist/assets/js/wattlyst-extra.js' ) : array();
		$files   = array_merge( array( 'dist/assets/js/wattlyst-tool.js' ), $list, $extra, array_map( static fn( $f ) => 'dist/engine/' . $f, $engine ) );
		foreach ( $files as $f ) {
			printf( '<link rel="modulepreload" href="%s">' . "\n", esc_url( $this->plugin->script_url( $f ) ) );
		}
	}

	/**
	 * WordPress's emoji detection script and styles (audit WL-57): every browser we serve draws emoji itself,
	 * so they only cost a script download and main-thread time on every page. Front end, feeds and email.
	 */
	public function no_emoji(): void {
		remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
		remove_action( 'embed_head', 'print_emoji_detection_script' );
		remove_action( 'wp_enqueue_scripts', 'wp_enqueue_emoji_styles' );
		remove_action( 'enqueue_embed_scripts', 'wp_enqueue_emoji_styles' );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );
		remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
		remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
		remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
		add_filter( 'emoji_svg_url', '__return_false' );
	}

	public function icons(): void {
		if ( has_site_icon() ) {
			return; // The owner set a Site Icon in the Customizer; WordPress prints it.
		}
		$b = 'assets/brand/';
		printf( '<link rel="icon" href="%s" sizes="any">' . "\n", esc_url( Wattlyst_Tools::asset( $b . 'favicon.ico' ) ) );
		printf( '<link rel="icon" href="%s" type="image/svg+xml">' . "\n", esc_url( Wattlyst_Tools::asset( $b . 'icon.svg' ) ) );
		printf( '<link rel="apple-touch-icon" href="%s">' . "\n", esc_url( Wattlyst_Tools::asset( $b . 'apple-touch-icon.png' ) ) );
		echo '<meta name="theme-color" content="#0b3d2e">' . "\n";
	}

	/** On the front page our Organization + WebSite graph replaces Rank Math's, so the entity is defined once. */
	public function rank_math_front_schema( $data ) {
		return is_front_page() && ! $this->current() ? array() : $data;
	}
}
