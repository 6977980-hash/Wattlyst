<?php
/**
 * Managed pages: creates the WordPress pages for every live row of the manifest (never deletes or
 * overwrites a page the owner made), renders them with [wattlyst_page id="..."] and adjusts the theme.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Pages {

	private const META_ID   = '_wattlyst_id';
	private const OPT_HASH  = 'wattlyst_sync_hash';
	private const OPT_LOCK  = 'wattlyst_sync_lock';
	private const SHORTCODE = 'wattlyst_page';
	public const CRON       = 'wattlyst_sync';

	private Wattlyst_Tools $plugin;

	private static bool $tool_rendered = false;

	public function __construct( Wattlyst_Tools $plugin ) {
		$this->plugin = $plugin;
		add_action( 'init', array( $this, 'register' ) );
		add_action( 'init', array( $this, 'maybe_sync' ), 20 );
		add_action( self::CRON, array( $this, 'maybe_sync' ) );
		add_filter( 'generate_show_title', array( $this, 'hide_theme_title' ) );
		add_filter( 'generate_sidebar_layout', array( $this, 'no_sidebar' ) );
		add_filter( 'comments_open', array( $this, 'no_comments' ), 10, 2 );
		add_filter( 'generate_copyright', array( $this, 'footer' ) );
		add_action( 'wp_footer', array( $this, 'tool_script' ) );
		add_filter( 'wp_nav_menu_args', array( $this, 'menu_args' ) );
	}

	/** Until the owner assigns a menu, the header menu lists the task hubs (live pillars) instead of every page. */
	public function menu_args( $args ) {
		if ( 'primary' === ( $args['theme_location'] ?? '' ) && ! has_nav_menu( 'primary' ) ) {
			$args['fallback_cb'] = array( $this, 'menu_fallback' );
		}
		return $args;
	}

	public function menu_fallback(): void {
		$items = array();
		foreach ( $this->plugin->manifest()['nav'] ?? array() as $n ) {
			$row = $this->plugin->row( $n['id'] );
			if ( $row && ! empty( $row['live'] ) ) {
				$items[] = array( $n['label'], $n['url'] );
			}
		}
		if ( ! $items ) { // No hub is live yet: show the trust pages a first visitor looks for.
			foreach ( array( 'about', 'methodology', 'contact' ) as $id ) {
				$row = $this->plugin->row( $id );
				if ( $row && ! empty( $row['live'] ) ) {
					$items[] = array( $row['h1'], $row['url'] );
				}
			}
		}
		$path = wp_parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		echo '<div class="main-nav"><ul class="menu sf-menu">';
		foreach ( $items as [ $label, $url ] ) {
			$current = is_string( $path ) && str_starts_with( $path, $url ) ? ' current-menu-item' : '';
			printf( '<li class="menu-item%s"><a href="%s"%s>%s</a></li>', esc_attr( $current ), esc_url( Wattlyst_Tools::link( $url ) ), $current ? ' aria-current="page"' : '', esc_html( $label ) );
		}
		echo '</ul></div>';
	}

	public function register(): void {
		add_shortcode( self::SHORTCODE, array( $this, 'shortcode' ) );
	}

	/** Manifest id of the page being viewed, or null when it is not a Wattlyst page. */
	public static function current_id(): ?string {
		if ( ! is_singular( 'page' ) ) {
			return null;
		}
		$post = get_queried_object();
		if ( ! $post instanceof WP_Post ) {
			return null;
		}
		$id = get_post_meta( $post->ID, self::META_ID, true );
		if ( is_string( $id ) && '' !== $id ) {
			return $id;
		}
		if ( preg_match( '/\[' . self::SHORTCODE . '\s+id="([A-Za-z0-9-]+)"/', $post->post_content, $m ) ) {
			return $m[1];
		}
		return null;
	}

	/* ---------------------------------------------------------------- sync */

	/**
	 * Runs when the deployed build changed (manifest hash: it carries a hash of every generated page, so a
	 * data-only deploy counts too). A visitor request never does the work itself (WL-70): it schedules a
	 * one-off cron event, which WordPress runs in its own background request. Admin screens, cron and
	 * WP-CLI sync at once. Note: pages served from the LiteSpeed cache never reach PHP, so the sync starts
	 * with the first uncached request (an admin visit, cron, a crawler on an uncached URL).
	 */
	public function maybe_sync(): void {
		$file = WATTLYST_TOOLS_DIR . 'generated/manifest.json';
		if ( ! is_readable( $file ) ) {
			return;
		}
		$hash = md5_file( $file ) . '-' . WATTLYST_TOOLS_VERSION;
		if ( get_option( self::OPT_HASH ) === $hash ) {
			return;
		}
		if ( ! is_admin() && ! wp_doing_cron() && ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			if ( ! wp_next_scheduled( self::CRON ) ) {
				wp_schedule_single_event( time(), self::CRON );
			}
			return;
		}
		// add_option is atomic: only one request syncs at a time. A lock older than 5 minutes is stale.
		if ( ! add_option( self::OPT_LOCK, time(), '', false ) ) {
			if ( time() - (int) get_option( self::OPT_LOCK ) < 300 ) {
				return;
			}
			update_option( self::OPT_LOCK, time(), false );
		}
		try {
			$this->sync();
			update_option( self::OPT_HASH, $hash, false );
		} finally {
			delete_option( self::OPT_LOCK );
		}
		self::purge_cache();
	}

	/**
	 * A new build changes page HTML even when no WordPress post changed (e.g. a monthly data update), so
	 * the page cache is emptied after every sync (WL-36). LiteSpeed Cache's public purge action; a no-op
	 * when that plugin is not active.
	 */
	public static function purge_cache(): void {
		do_action( 'litespeed_purge_all' );
	}

	private function sync(): void {
		foreach ( $this->plugin->manifest()['pages'] as $row ) {
			if ( ! empty( $row['live'] ) && 'home' !== $row['type'] ) {
				$this->ensure( $row );
			}
		}
		foreach ( $this->plugin->manifest()['pages'] as $row ) {
			if ( ! empty( $row['live'] ) && 'home' === $row['type'] ) {
				$this->ensure_home( $row );
			}
		}
		$privacy = get_page_by_path( 'privacy-policy', OBJECT, 'page' );
		if ( $privacy instanceof WP_Post && 'privacy-policy' === get_post_meta( $privacy->ID, self::META_ID, true ) ) {
			update_option( 'wp_page_for_privacy_policy', $privacy->ID );
		}
		Wattlyst_Site::remove_version_files();
	}

	/**
	 * The home page: a page at /home/ shown as the static front page, but only while the site still shows
	 * the default "latest posts" (or already shows our page). A front page the owner chose is left alone.
	 */
	private function ensure_home( array $row ): void {
		$id = $this->ensure( array_merge( $row, array( 'url' => '/home/' ) ) );
		if ( ! $id ) {
			return;
		}
		$front = (int) get_option( 'page_on_front' );
		if ( 'page' !== get_option( 'show_on_front' ) || $front === $id || ! $front ) {
			update_option( 'show_on_front', 'page' );
			update_option( 'page_on_front', $id );
		}
	}

	/**
	 * Make sure a live row has a published page at its URL. Returns the post id, or 0 if skipped.
	 * A managed page that was trashed or drafted in WordPress is published again on the next sync
	 * (get_page_by_path also finds trashed pages; WL-69): the build decides what is live. To take a page
	 * down, set "status": "draft" in content/pages/<ID>.json (or the row in specs/site-pages.csv).
	 */
	private function ensure( array $row ): int {
		$path     = trim( $row['url'], '/' );
		$content  = sprintf( '[%s id="%s"]', self::SHORTCODE, $row['id'] );
		$existing = get_page_by_path( $path, OBJECT, 'page' );

		if ( $existing instanceof WP_Post ) {
			$owner = get_post_meta( $existing->ID, self::META_ID, true );
			if ( $owner === $row['id'] ) {
				if ( $existing->post_title !== $row['h1'] || $existing->post_content !== $content || 'publish' !== $existing->post_status ) {
					wp_update_post( array( 'ID' => $existing->ID, 'post_title' => $row['h1'], 'post_content' => $content, 'post_status' => 'publish' ) );
				}
				return $existing->ID;
			}
			// Take over only an unpublished page nobody owns (e.g. WordPress's own draft privacy page).
			if ( '' === $owner && in_array( $existing->post_status, array( 'draft', 'auto-draft' ), true ) ) {
				wp_update_post( array( 'ID' => $existing->ID, 'post_title' => $row['h1'], 'post_content' => $content, 'post_status' => 'publish', 'comment_status' => 'closed', 'ping_status' => 'closed' ) );
				update_post_meta( $existing->ID, self::META_ID, $row['id'] );
				return $existing->ID;
			}
			return 0; // The owner's own page: leave it alone.
		}

		$parent_id = 0;
		if ( ! empty( $row['parent'] ) ) {
			$parent = $this->plugin->row( $row['parent'] );
			if ( ! $parent || empty( $parent['live'] ) ) {
				return 0;
			}
			$parent_id = $this->ensure( $parent );
			if ( ! $parent_id ) {
				return 0;
			}
		}
		$slug = basename( $path );
		$id   = wp_insert_post(
			array(
				'post_type'      => 'page',
				'post_status'    => 'publish',
				'post_title'     => $row['h1'],
				'post_name'      => $slug,
				'post_parent'    => $parent_id,
				'post_content'   => $content,
				'post_author'    => $this->author_id(),
				'comment_status' => 'closed',
				'ping_status'    => 'closed',
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return 0;
		}
		update_post_meta( $id, self::META_ID, $row['id'] );
		return (int) $id;
	}

	private function author_id(): int {
		$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'orderby' => 'ID', 'fields' => 'ID' ) );
		return $admins ? (int) $admins[0] : 0;
	}

	/* ---------------------------------------------------------------- theme */

	public function hide_theme_title( $show ) {
		return self::current_id() ? false : $show; // Our template prints the one H1.
	}

	public function no_sidebar( $layout ) {
		return self::current_id() ? 'no-sidebar' : $layout;
	}

	public function no_comments( $open, $post_id ) {
		return get_post_meta( (int) $post_id, self::META_ID, true ) ? false : $open;
	}

	/**
	 * Site footer (design Phase 7): brand line, the task hubs (same live nav as the header, so every page links to
	 * every hub) and the trust pages.
	 */
	public function footer( $html ): string {
		$links = array();
		foreach ( $this->plugin->manifest()['pages'] as $row ) {
			if ( in_array( $row['type'], array( 'trust', 'embed' ), true ) && ! empty( $row['live'] ) ) {
				$links[] = sprintf( '<li><a href="%s">%s</a></li>', esc_url( Wattlyst_Tools::link( $row['url'] ) ), esc_html( $row['h1'] ) );
			}
		}
		$hubs = array();
		foreach ( $this->plugin->manifest()['nav'] ?? array() as $n ) {
			$row = $this->plugin->row( $n['id'] );
			if ( $row && ! empty( $row['live'] ) ) {
				$hubs[] = sprintf( '<li><a href="%s">%s</a></li>', esc_url( Wattlyst_Tools::link( $n['url'] ) ), esc_html( $n['label'] ) );
			}
		}
		$site  = $this->plugin->site();
		$brand = $site['brand'] ?? 'Wattlyst';
		$out   = '<div class="wl-footer"><div class="wl-footer-brand"><a href="' . esc_url( home_url( '/' ) ) . '"><img src="' . esc_url( Wattlyst_Tools::asset( 'assets/brand/logo-white.svg' ) ) . '" alt="' . esc_attr( $brand ) . '" width="152" height="28" loading="lazy" decoding="async"></a>';
		$out  .= ! empty( $site['tagline'] ) ? '<p>' . esc_html( $site['tagline'] ) . '</p>' : '';
		$out  .= '</div>';
		if ( $hubs ) {
			$out .= '<nav class="wl-footer-col" aria-label="Calculators"><p class="wl-footer-head">Calculators</p><ul>' . implode( '', $hubs ) . '</ul></nav>';
		}
		$out .= '<nav class="wl-footer-col wl-footer-nav" aria-label="Site information"><p class="wl-footer-head">' . esc_html( $brand ) . '</p><ul>' . implode( '', $links ) . '</ul></nav></div>';
		return $out . sprintf( '<p class="wl-copy">&copy; %s %s</p>', esc_html( wp_date( 'Y' ) ), esc_html( $brand ) );
	}

	/* ---------------------------------------------------------------- render */

	public function shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'id' => '' ), $atts, self::SHORTCODE );
		$page = $this->plugin->page( (string) $atts['id'] );
		if ( ! $page ) {
			return current_user_can( 'edit_pages' ) ? '<p><strong>Wattlyst:</strong> unknown page id.</p>' : '';
		}
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-render.php';
		$render = new Wattlyst_Render( $this->plugin, $page );
		if ( ! empty( $page['content']['tool'] ) || ! empty( $page['content']['lookup'] ) || ! empty( $page['content']['embeds'] ) ) {
			self::$tool_rendered = true; // the same script also drives the lookup filter
		}
		return $render->html();
	}

	public function tool_script(): void {
		if ( ! self::$tool_rendered ) {
			return;
		}
		printf(
			'<script type="module" src="%s"></script>' . "\n",
			esc_url( $this->plugin->script_url( 'dist/assets/js/wattlyst-tool.js' ) )
		);
	}
}
