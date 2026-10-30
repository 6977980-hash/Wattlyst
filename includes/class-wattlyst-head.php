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
		add_action( 'wp_head', array( $this, 'verification' ), 2 );
		add_action( 'wp_head', array( $this, 'analytics' ), 3 );
		add_filter( 'rank_math/json_ld', array( $this, 'rank_math_front_schema' ), 99 );
		add_filter( 'wp_robots', array( $this, 'robots' ), 99 );
		add_action( 'wp_enqueue_scripts', array( $this, 'drop_block_styles' ), 100 );
		add_filter( 'generate_logo', array( $this, 'logo' ) );
		add_filter( 'generate_logo_attributes', array( $this, 'logo_attributes' ) );
		add_filter( 'generate_site_title_output', array( $this, 'site_title' ) );
		add_filter( 'language_attributes', array( $this, 'lang' ) );
	}

	/** An Urdu page (/ur/...) is lang="ur" dir="rtl"; every other page keeps WordPress's own attributes. */
	public function lang( $attrs ) {
		$page = $this->current();
		return $page && 'ur' === ( $page['lang'] ?? '' ) ? 'lang="ur" dir="rtl"' : $attrs;
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

	/**
	 * Wattlyst pages are indexable with full snippets (core prints the one robots meta tag). Runs last and never adds
	 * "index" next to a "noindex" core set for a variant such as ?replytocom= or the oEmbed /embed/ view (WL-83).
	 */
	public function robots( $robots ) {
		if ( $this->current() && get_option( 'blog_public' ) && empty( $robots['noindex'] ) ) {
			$robots['index']             = true;
			$robots['follow']            = true;
			$robots['max-snippet']       = '-1';
			$robots['max-image-preview'] = 'large';
		}
		return $robots;
	}

	/**
	 * Wattlyst pages are a shortcode, not blocks, so WordPress's block library and global-styles CSS (about 16 KB
	 * inlined in every page) style nothing there (audit WL-85). Pages the owner writes with blocks keep them.
	 */
	public function drop_block_styles(): void {
		if ( ! $this->current() ) {
			return;
		}
		foreach ( array( 'wp-block-library', 'wp-block-library-theme', 'classic-theme-styles', 'global-styles' ) as $handle ) {
			wp_dequeue_style( $handle );
		}
		remove_action( 'wp_footer', 'wp_enqueue_global_styles', 1 );
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
		if ( ! $page ) {
			// WordPress's own pages (404, search) share the header and footer, so they get the same styles (WL-77).
			$this->styles();
			if ( is_front_page() ) {
				$this->json_ld( $this->plugin->manifest()['website_schema'] ?? null );
			}
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
		// hreflang (Urdu plan section 2): only when both pages are live (build `alt`), both ways, English as x-default.
		if ( ! empty( $page['alt'] ) ) {
			foreach ( array( 'en' => $page['alt']['en'], 'ur-PK' => $page['alt']['ur'], 'x-default' => $page['alt']['en'] ) as $lang => $path ) {
				printf( '<link rel="alternate" hreflang="%s" href="%s">' . "\n", esc_attr( $lang ), esc_url( Wattlyst_Tools::link( (string) $path ) ) );
			}
		}
		$ur = 'ur' === ( $page['lang'] ?? '' );
		$og = array(
			'og:locale'       => $ur ? 'ur_PK' : 'en_US',
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
		if ( 'article' === $type && ! empty( $page['modified'] ) ) {
			printf( '<meta property="article:modified_time" content="%s">' . "\n", esc_attr( $page['modified'] ) );
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
		$this->styles( 'home' === $page['type'], $ur );
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

	/** Small stylesheet inlined in the head of every front-end page (no extra render-blocking request). */
	/** Inlined styles; the home page adds its own layout file (hero, planner columns, task cards), so other pages stay light. */
	private function styles( bool $home = false, bool $ur = false ): void {
		$files = array( 'wattlyst-css' => 'wattlyst.css' );
		if ( $home ) {
			$files['wattlyst-home-css'] = 'wattlyst-home.css';
		}
		// Urdu pages: the Nastaliq font and the right-to-left fixes, never on an English page (Urdu plan section 3).
		$font = Wattlyst_Tools::asset( 'assets/fonts/noto-nastaliq-urdu.woff2' );
		if ( $ur ) {
			$files['wattlyst-ur-css'] = 'wattlyst-ur.css';
			printf( '<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n", esc_url( $font ) );
		}
		foreach ( $files as $id => $file ) {
			$css = WATTLYST_TOOLS_DIR . 'assets/css/' . $file;
			if ( is_readable( $css ) ) {
				// The font URL is absolute (inline CSS resolves a relative URL against the page), with its file time.
				echo '<style id="' . esc_attr( $id ) . '">' . str_replace( '%FONT%', esc_url( $font ), wp_strip_all_tags( (string) file_get_contents( $css ) ) ) . "</style>\n";
			}
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

	/** Search Console HTML-tag verification from data/site.json `verification`; Google reads it on the home page only. */
	public function verification(): void {
		$site = $this->plugin->site();
		$code = (string) ( $site['verification']['google'] ?? '' );
		if ( '' !== $code && is_front_page() ) {
			printf( '<meta name="google-site-verification" content="%s">' . "\n", esc_attr( $code ) );
		}
		// AdSense ownership check: the account meta tag from the pub id, even while ads are off (audit 2026-10-21 policy #8).
		$pub = (string) ( $site['ads']['adsense_pub_id'] ?? '' );
		if ( '' !== $pub && is_front_page() ) {
			printf( '<meta name="google-adsense-account" content="%s">' . "\n", esc_attr( 'ca-' . $pub ) );
		}
	}

	/**
	 * Google Analytics 4 from data/site.json `analytics` (owner, 26 Oct 2026). Every front-end page (the
	 * /embed/<id>/ document has its own head and no tag); not for logged-in editors, so the owner's own
	 * visits are not counted. gtag.js is fetched after the page: on the first tap, scroll or key, or
	 * load_delay_ms after load, so it never competes with the calculator (Lighthouse gate). Consent Mode
	 * default: storage denied in consent_regions (EEA, UK, Switzerland) until a consent tool grants it.
	 */
	public function analytics(): void {
		$a = $this->plugin->site()['analytics'] ?? array();
		if ( empty( $a['enabled'] ) || empty( $a['ga4_id'] ) || is_preview() || current_user_can( 'edit_posts' ) ) {
			return;
		}
		$id      = (string) $a['ga4_id'];
		$denied  = array(
			'ad_storage'         => 'denied',
			'ad_user_data'       => 'denied',
			'ad_personalization' => 'denied',
			'analytics_storage'  => 'denied',
			'region'             => array_values( $a['consent_regions'] ?? array() ),
		);
		$src     = 'https://www.googletagmanager.com/gtag/js?id=' . rawurlencode( $id );
		$js      = 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}'
			. 'gtag("consent","default",' . wp_json_encode( $denied ) . ');'
			. 'gtag("js",new Date());gtag("config",' . wp_json_encode( $id ) . ',{allow_google_signals:false});'
			. '(function(){var e=["pointerdown","keydown","scroll","touchstart"],d=0;function l(){if(d)return;d=1;'
			. 'e.forEach(function(n){removeEventListener(n,l)});var s=document.createElement("script");s.async=true;'
			. 's.src=' . wp_json_encode( $src ) . ';document.head.appendChild(s)}'
			. 'e.forEach(function(n){addEventListener(n,l,{passive:true,once:true})});'
			. 'addEventListener("load",function(){setTimeout(l,' . (int) $a['load_delay_ms'] . ')})})();';
		echo '<script>' . $js . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput -- values JSON-encoded above.
	}

	/** On the front page our Organization + WebSite graph replaces Rank Math's, so the entity is defined once. */
	public function rank_math_front_schema( $data ) {
		return is_front_page() && ! $this->current() ? array() : $data;
	}
}
