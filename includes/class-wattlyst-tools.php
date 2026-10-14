<?php
/**
 * Main plugin class: loads the generated manifest and wires the parts together.
 *
 * Nothing here computes a number. Every number, title, meta description and schema block comes from
 * generated/ (built by tools/build.js from specs/, content/, data/ and the engine).
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Tools {

	private static ?Wattlyst_Tools $instance = null;

	/** @var array<string,mixed>|null */
	private ?array $manifest = null;

	/** @var array<string,array<string,mixed>> */
	private array $pages = array();

	public static function instance(): Wattlyst_Tools {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-pages.php';
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-head.php';
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-endpoints.php';
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-ads.php';
		require_once WATTLYST_TOOLS_DIR . 'includes/class-wattlyst-leads.php';

		add_action( 'init', array( $this, 'register_shortcodes' ) );
		new Wattlyst_Pages( $this );
		new Wattlyst_Head( $this );
		new Wattlyst_Endpoints( $this );
		new Wattlyst_Leads( $this );
	}

	public function register_shortcodes(): void {
		add_shortcode( 'wattlyst_status', array( $this, 'render_status' ) );
	}

	/**
	 * [wattlyst_status] prints the deployed plugin version, to confirm auto-deploy worked.
	 */
	public function render_status(): string {
		return sprintf(
			'<p class="wattlyst-status">Wattlyst Tools v%s is active.</p>',
			esc_html( WATTLYST_TOOLS_VERSION )
		);
	}

	/** @return array<string,mixed> */
	public function manifest(): array {
		if ( null === $this->manifest ) {
			$this->manifest = self::read_json( 'generated/manifest.json' ) ?? array( 'pages' => array(), 'site' => array() );
		}
		return $this->manifest;
	}

	/** Light row for a page id (url, type, title, live ...), or null. */
	public function row( string $id ): ?array {
		foreach ( $this->manifest()['pages'] as $row ) {
			if ( $row['id'] === $id ) {
				return $row;
			}
		}
		return null;
	}

	/** Row whose URL equals a path such as /battery/x/, or null. */
	public function row_by_url( string $path ): ?array {
		foreach ( $this->manifest()['pages'] as $row ) {
			if ( $row['url'] === $path ) {
				return $row;
			}
		}
		return null;
	}

	/** Full generated page (content + schema) for an id, or null. */
	public function page( string $id ): ?array {
		if ( ! preg_match( '/^[A-Za-z0-9-]+$/', $id ) ) {
			return null;
		}
		if ( ! array_key_exists( $id, $this->pages ) ) {
			$this->pages[ $id ] = self::read_json( 'generated/pages/' . $id . '.json' );
		}
		return $this->pages[ $id ];
	}

	/** @return array<string,mixed> */
	public function site(): array {
		return $this->manifest()['site'] ?? array();
	}

	/**
	 * URL of a shipped script with the build's asset version (manifest assets.ver, a hash of all dist/ JS).
	 * The same ver is stamped on every relative import inside dist/, so the script tag, each modulepreload
	 * and each import name one URL per module (fetched once) and a deploy never mixes old and new modules.
	 */
	public function script_url( string $rel ): string {
		$ver = (string) ( $this->manifest()['assets']['ver'] ?? WATTLYST_TOOLS_VERSION );
		return add_query_arg( 'ver', $ver, self::asset( $rel ) );
	}

	/** Nested engine modules a dist/engine file imports (manifest assets.deps), for modulepreload. */
	public function module_deps( string $file ): array {
		return (array) ( $this->manifest()['assets']['deps'][ $file ] ?? array() );
	}

	/** Absolute URL of a site path on the current host (keeps local/staging hosts working). */
	public static function link( string $path ): string {
		return home_url( $path );
	}

	public static function asset( string $rel ): string {
		return WATTLYST_TOOLS_URL . ltrim( $rel, '/' );
	}

	private static function read_json( string $rel ): ?array {
		$file = WATTLYST_TOOLS_DIR . $rel;
		if ( ! is_readable( $file ) ) {
			return null;
		}
		$data = json_decode( (string) file_get_contents( $file ), true );
		return is_array( $data ) ? $data : null;
	}
}
