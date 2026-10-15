<?php
/**
 * HTML for one generated page. Templates: tool, appliance (tool + appliance facts), guide, pillar, trust.
 * Section order follows specs/seo-rules.md section 3. All text arrives pre-rendered from generated/;
 * this class only escapes and arranges it.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Render {

	/** Tools listed openly per hub card on the home page; the rest sit in a "Show N more" fold. */
	private const HOME_CARD_LINKS = 3;

	private Wattlyst_Tools $plugin;
	private array $page;
	private array $c;
	private int $tables = 0; // numbers the reference table headings on this page (unique ids)

	public function __construct( Wattlyst_Tools $plugin, array $page ) {
		$this->plugin = $plugin;
		$this->page   = $page;
		$this->c      = is_array( $page['content'] ?? null ) ? $page['content'] : array();
	}

	public function html(): string {
		$type = $this->page['type'];
		$out  = '<div class="wl-page wl-type-' . esc_attr( $type ) . '">';
		$out .= $this->hero( $type );

		if ( 'trust' === $type ) {
			$out .= wp_kses_post( $this->c['html'] ?? '' );
			$out .= $this->dates();
		} elseif ( 'home' === $type ) {
			if ( ! empty( $this->c['tool'] ) ) { // Home Power Planner (Phase 4): inputs left, sticky plan right on desktop
				$out .= '<section class="wl-planner" aria-labelledby="wl-plan-title"><div class="wl-planner-head"><h2 id="wl-plan-title">Plan your home power</h2>' .
					'<ol class="wl-steps"><li>List your appliances</li><li>Set your city and backup</li><li>Read every size</li></ol></div>' .
					$this->tool( true ) . $this->how() . '</section>';
			}
			$out .= $this->cards();
			$out .= $this->lead();
			$out .= '' !== $this->sections() ? '<div class="wl-home-info">' . $this->sections() . '</div>' : '';
			// FAQ and author box beside the key facts, so neither runs across the whole page.
			$out .= '<div class="wl-home-more"><div class="wl-home-main">' . $this->faq( true ) . $this->author_box() . '</div><div class="wl-home-side">' . $this->key_facts() . $this->dates() . '</div></div>';
		} elseif ( 'data' === $type ) { // Bill Index, Solar Price Tracker (Phase 5)
			$out .= $this->download();
			$out .= $this->key_facts();
			$out .= $this->chart();
			$out .= $this->tables();
			$out .= $this->sections();
			$out .= $this->faq();
			$out .= $this->related();
			$out .= $this->author_box();
			$out .= $this->sources();
		} elseif ( 'embed' === $type ) {
			$out .= $this->embeds();
			$out .= $this->sections();
			$out .= $this->sources();
		} elseif ( 'lookup' === $type ) {
			$out .= $this->lookup();
			$out .= $this->key_facts();
			$out .= $this->ad( 'content-1' );
			$out .= $this->sections();
			$out .= $this->tables();
			$out .= $this->ad( 'content-2' );
			$out .= $this->mistakes();
			$out .= $this->faq();
			$out .= $this->related();
			$out .= $this->ad( 'content-3' );
			$out .= $this->author_box();
			$out .= $this->sources();
		} elseif ( 'pillar' === $type ) {
			$out .= $this->children();
			$out .= $this->key_facts();
			$out .= $this->sections();
			$out .= $this->tables();
			$out .= $this->faq();
			if ( ! empty( $this->c['sections'] ) || ! empty( $this->c['tables'] ) ) {
				$out .= $this->author_box();
				$out .= $this->sources();
			}
		} else {
			if ( ! empty( $this->c['tool'] ) ) {
				$out .= $this->tool();
				$out .= $this->how();
			}
			$out .= $this->key_facts();
			$out .= $this->ad( 'content-1' );
			$out .= $this->formula();
			$out .= $this->sections();
			$out .= $this->examples();
			$out .= $this->table();
			$out .= $this->tables();
			// Unit 2 sits above Common mistakes; with no mistakes section it would touch the buy box or form, so skip it.
			$mistakes = $this->mistakes();
			$out     .= '' !== $mistakes ? $this->ad( 'content-2' ) . $mistakes : '';
			$out     .= $this->where_to_buy();
			$out .= $this->lead();
			$out .= $this->faq();
			$out .= $this->related();
			$out .= $this->ad( 'content-3' );
			$out .= $this->author_box();
			$out .= $this->sources();
		}
		return $out . '</div>';
	}

	/* ------------------------------------------------------------ pieces */

	/** One of the three manual ad units (Wattlyst_Ads decides whether this page and request may show it). */
	private function ad( string $slot ): string {
		return Wattlyst_Ads::slot( $slot, $this->plugin->site(), $this->page );
	}

	/** Affiliate links (data/affiliates.json): labelled box, visible disclosure, rel="sponsored" on every link. */
	private function where_to_buy(): string {
		$a = $this->page['affiliates'] ?? null;
		if ( empty( $a['links'] ) ) {
			return '';
		}
		$items = '';
		foreach ( $a['links'] as $l ) {
			$items .= '<li><a href="' . esc_url( $l['url'] ) . '" rel="sponsored noopener">' . esc_html( $l['label'] ) . '</a>' . ( ! empty( $l['note'] ) ? ' ' . esc_html( $l['note'] ) : '' ) . '</li>';
		}
		return '<aside class="wl-buy" aria-label="Where to buy"><h2>Where to buy</h2><p class="wl-disclosure">' . esc_html( $a['disclosure'] ) . '</p><ul>' . $items . '</ul></aside>';
	}

	/**
	 * Solar quote request form (Phase 6). Plain HTML form posted to admin-post.php and handled by
	 * Wattlyst_Leads, so it needs no JavaScript. Shown only when leads are enabled for this page.
	 */
	private function lead(): string {
		$leads = $this->plugin->site()['leads'] ?? array();
		if ( empty( $leads['enabled'] ) || empty( $this->page['lead'] ) ) {
			return '';
		}
		$c     = $leads['copy'];
		$state = isset( $_GET['lead'] ) ? sanitize_key( wp_unslash( $_GET['lead'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$out   = '<section class="wl-lead" id="wl-lead" aria-labelledby="wl-lead-h"><h2 id="wl-lead-h">' . esc_html( $c['heading'] ) . '</h2>';
		if ( 'sent' === $state ) {
			$link = '';
			if ( ! empty( $leads['success_url'] ) && $leads['success_url'] !== $this->page['url'] ) {
				$link = ' <a href="' . esc_url( Wattlyst_Tools::link( $leads['success_url'] ) ) . '">' . esc_html( $this->plugin->row_by_url( $leads['success_url'] )['h1'] ?? '' ) . '</a>';
			}
			return $out . '<p class="wl-lead-ok" role="status">' . esc_html( $c['success'] ) . $link . '</p></section>';
		}
		$why = isset( $_GET['why'] ) ? sanitize_key( wp_unslash( $_GET['why'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		if ( 'error' === $state && isset( $c['errors'][ $why ] ) ) {
			$out .= '<p class="wl-error" role="alert">' . esc_html( $c['errors'][ $why ] ) . '</p>';
		}
		$f    = $c['fields'];
		$opts = '<option value="">' . esc_html( $f['city'] ) . '</option>';
		foreach ( $leads['cities'] as $city ) {
			$opts .= '<option value="' . esc_attr( $city['id'] ) . '">' . esc_html( $city['name'] ) . '</option>';
		}
		$opts .= '<option value="other">' . esc_html( $f['city_other'] ) . '</option>';
		$row   = static function ( string $id, string $label, string $control ): string {
			return '<div class="wl-field"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>' . $control . '</div>';
		};
		$out .= '<p>' . esc_html( $c['intro'] ) . '</p>';
		$out .= '<form class="wl-lead-form" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		$out .= '<input type="hidden" name="action" value="wattlyst_lead"><input type="hidden" name="page" value="' . esc_attr( $this->page['id'] ) . '">';
		$out .= '<input type="hidden" name="wl_t" value="' . esc_attr( Wattlyst_Leads::token() ) . '">';
		$out .= '<div class="wl-fields">';
		$out .= $row( 'wl-lead-name', $f['name'], '<input type="text" id="wl-lead-name" name="name" required maxlength="80" autocomplete="name">' );
		$out .= $row( 'wl-lead-phone', $f['phone'], '<input type="tel" id="wl-lead-phone" name="phone" required maxlength="20" autocomplete="tel" inputmode="tel" aria-describedby="wl-lead-phone-hint"><p class="wl-hint" id="wl-lead-phone-hint">' . esc_html( $f['phone_hint'] ) . '</p>' );
		$out .= $row( 'wl-lead-city', $f['city'], '<select id="wl-lead-city" name="city" required>' . $opts . '</select>' );
		$out .= $row( 'wl-lead-kw', $f['kw'], '<input type="text" id="wl-lead-kw" name="kw" inputmode="decimal" maxlength="8">' );
		$out .= $row( 'wl-lead-units', $f['units'], '<input type="text" id="wl-lead-units" name="units" inputmode="numeric" maxlength="8">' );
		$out .= '</div>';
		$out .= $row( 'wl-lead-msg', $f['msg'], '<textarea id="wl-lead-msg" name="msg" rows="3" maxlength="500"></textarea>' );
		// Honeypot: hidden from people and screen readers; bots that fill it are dropped.
		$out .= '<div class="wl-hp" aria-hidden="true"><label for="wl-lead-web">Website</label><input type="text" id="wl-lead-web" name="website" tabindex="-1" autocomplete="off"></div>';
		$out .= '<div class="wl-check"><input type="checkbox" id="wl-lead-ok" name="consent" value="1" required><label for="wl-lead-ok">' . esc_html( $f['consent'] ) . ' <a href="' . esc_url( Wattlyst_Tools::link( '/privacy-policy/' ) ) . '">Privacy policy</a>.</label></div>';
		$out .= '<button type="submit" class="wl-btn">' . esc_html( $c['button'] ) . '</button>';
		$out .= '<p class="wl-note">' . esc_html( $c['privacy'] ) . '</p>';
		return $out . '</form></section>';
	}

	private function breadcrumb(): string {
		$items = array();
		$crumbs = $this->page['breadcrumb'] ?? array();
		foreach ( $crumbs as $i => $b ) {
			$last    = ( count( $crumbs ) - 1 === $i );
			$items[] = $last
				? '<li aria-current="page">' . esc_html( $b['name'] ) . '</li>'
				: '<li><a href="' . esc_url( Wattlyst_Tools::link( $b['url'] ) ) . '">' . esc_html( $b['name'] ) . '</a></li>';
		}
		return '<nav class="wl-breadcrumb" aria-label="Breadcrumb"><ol>' . implode( '', $items ) . '</ol></nav>';
	}

	/** Page header (design Phase 7): breadcrumb, H1, the one-sentence answer and, on content pages, who wrote it and when it was reviewed. */
	private function hero( string $type ): string {
		if ( 'trust' === $type ) {
			$answer = '';
		} elseif ( 'home' === $type ) {
			$answer = $this->c['answer'] ?? $this->page['meta'];
		} elseif ( 'pillar' === $type ) {
			$answer = ( $this->c['answer'] ?? '' ) ?: ( $this->c['intro'] ?? '' ) ?: $this->page['meta'];
		} else {
			$answer = $this->c['answer'] ?? '';
		}
		$byline = in_array( $type, array( 'home', 'pillar', 'trust', 'embed' ), true ) ? '' : $this->byline();
		// The home page is the top of the trail, so a one-item "Home" breadcrumb adds nothing there (WL-81).
		$crumb = 'home' === $type ? '' : $this->breadcrumb();
		if ( 'home' === $type ) {
			return $this->home_hero( (string) $answer );
		}
		return '<header class="wl-hero">' . $crumb . '<h1 class="wl-h1">' . esc_html( $this->page['h1'] ) . '</h1>' . $this->answer( (string) $answer ) . $byline . '</header>';
	}

	/**
	 * Home page header: H1, answer, two calls to action and what the site offers, with every task hub as an icon
	 * chip beside it (the categories are visible without scrolling). Tool counts are the links each hub card lists.
	 */
	private function home_hero( string $answer ): string {
		$cards = $this->page['cards'] ?? array();
		$chips = '';
		$ids   = array();
		foreach ( $cards as $card ) {
			$n      = count( $card['children'] );
			$ids    = array_merge( $ids, array_column( $card['children'], 'id' ) );
			$chips .= '<li><a class="wl-chip wl-card-' . sanitize_html_class( trim( (string) $card['url'], '/' ) ) . '" href="' . esc_url( Wattlyst_Tools::link( $card['url'] ) ) . '"><span class="wl-ico" aria-hidden="true"></span><span class="wl-chip-name">' . esc_html( $card['label'] ) . '</span><span class="wl-chip-n">' . esc_html( self::tools_label( $n ) ) . '</span></a></li>';
		}
		$total = count( array_unique( $ids ) );
		$cta   = ! empty( $this->c['tool'] ) ? '<a class="wl-cta" href="#wl-plan-title">Start planning</a>' : '';
		$cta  .= $chips ? '<a class="wl-cta wl-cta-ghost" href="#wl-tasks-title">Browse all calculators</a>' : '';
		$pills = ( $total ? '<li>' . esc_html( $total . ' free tools' ) . '</li>' : '' ) . '<li>No sign-up</li><li>Formulas shown</li><li>Works on your phone</li>';
		$text  = '<div class="wl-hero-text"><h1 class="wl-h1">' . esc_html( $this->page['h1'] ) . '</h1>' . $this->answer( $answer ) .
			( $cta ? '<p class="wl-ctas">' . $cta . '</p>' : '' ) . '<ul class="wl-pills">' . $pills . '</ul></div>';
		$nav   = $chips ? '<nav class="wl-hero-cats" aria-label="Calculator categories"><p class="wl-hero-cats-title">Browse by task</p><ul>' . $chips . '</ul></nav>' : '';
		return '<header class="wl-hero wl-hero-home">' . $text . $nav . '</header>';
	}

	private static function tools_label( int $n ): string {
		return 1 === $n ? '1 tool' : $n . ' tools';
	}

	private function answer( string $text ): string {
		return '' === $text ? '' : '<p class="wl-answer">' . esc_html( $text ) . '</p>';
	}

	/** One line under the answer: author and review date (the same values as the author box and "Last reviewed"). */
	private function byline(): string {
		$author = $this->author();
		if ( ! $author || empty( $this->page['reviewed'] ) ) {
			return '';
		}
		return '<p class="wl-byline">By <span>' . esc_html( $author['name'] ) . '</span> <span aria-hidden="true">&middot;</span> Reviewed <time datetime="' . esc_attr( $this->page['reviewed'] ) . '">' . esc_html( self::date( $this->page['reviewed'] ) ) . '</time></p>';
	}

	private function author(): ?array {
		$site = $this->plugin->site();
		foreach ( $site['people'] ?? array() as $p ) {
			if ( $p['id'] === ( $this->page['author'] ?? '' ) ) {
				return $p;
			}
		}
		return $site['people'][0] ?? null;
	}

	/** Calculator form. $split (home planner) wraps the inputs and the results in two columns for the desktop layout. */
	private function tool( bool $split = false ): string {
		$t    = $this->c['tool'];
		$id   = 'wl-' . strtolower( $this->page['id'] );
		$main = '';
		$adv  = '';
		foreach ( $t['fields'] as $f ) {
			$html = $this->field( $id, $f );
			if ( ! empty( $f['advanced'] ) ) {
				$adv .= $html;
			} else {
				$main .= $html;
			}
		}
		$results = '';
		$has_ur  = false;
		foreach ( $t['outputs'] as $o ) {
			$unit     = isset( $o['unit'] ) ? ' <span class="wl-unit">' . esc_html( $o['unit'] ) . '</span>' : '';
			$ur       = isset( $o['label_ur'] ) ? ' data-ur="' . esc_attr( $o['label_ur'] ) . '" data-en="' . esc_attr( $o['label'] ) . '"' : '';
			$has_ur   = $has_ur || '' !== $ur;
			$results .= sprintf(
				'<div class="wl-result"><span class="wl-result-label"%s>%s</span> <output data-out="%s"><span class="wl-val">%s</span>%s</output></div>',
				$ur,
				esc_html( $o['label'] ),
				esc_attr( $o['key'] ),
				esc_html( $o['value'] ),
				$unit
			);
		}
		// Share bar (build-plan Phase 4: PDF export + WhatsApp share) and the Roman Urdu result toggle; the buttons
		// only work with JavaScript, so they are hidden until the script runs.
		$share = '<div class="wl-share" hidden>' .
			'<button type="button" class="wl-btn-secondary" data-wl-share="print">Save as PDF</button> ' .
			'<a class="wl-btn-secondary" data-wl-share="whatsapp" href="https://wa.me/" target="_blank" rel="noopener">Share on WhatsApp</a> ' .
			'<button type="button" class="wl-btn-secondary" data-wl-share="copy">Copy link</button>' .
			( $has_ur ? ' <button type="button" class="wl-btn-secondary wl-lang" data-wl-lang aria-pressed="false">Roman Urdu</button>' : '' ) .
			'<span class="wl-share-note" role="status" aria-live="polite"></span></div>';
		$config = array(
			'calc'    => $t['calc'],
			'module'  => $t['module'],
			'fields'  => array_map(
				static fn( $f ) => array_filter(
					array(
						'name'    => $f['name'],
						'label'   => $f['label'] ?? $f['name'],
						'type'    => $f['type'] ?? 'number',
						'options' => isset( $f['options'] ) ? array_map( static fn( $o ) => (string) $o[0], $f['options'] ) : null,
						'default' => $f['default'] ?? null,
						'catalog' => isset( $f['catalog'] ) ? self::catalog_groups( $f['catalog'] ) : null,
						'start'   => empty( $f['start'] ) ? null : true,
						'length'  => empty( $f['length'] ) ? null : true,
					),
					static fn( $v ) => null !== $v
				),
				$t['fields']
			),
			'fixed'   => (object) ( $t['fixed_inputs'] ?? array() ),
			'outputs' => array_map( static fn( $o ) => array( 'key' => $o['key'], 'spec' => $o['spec'] ?? '2' ), $t['outputs'] ),
			'how'     => $t['how']['tpl'] ?? '',
			'how_ur'  => $t['how']['tpl_ur'] ?? '',
			'h1'      => $this->page['h1'],
			'live'    => $t['live'] ?? '',
			'diagram' => $t['diagram'] ?? '',
			'rtable'  => isset( $t['rtable'] ) ? array( 'key' => $t['rtable']['key'], 'columns' => $t['rtable']['columns'] ) : '',
			'data'    => $this->tool_data( $t['data_keys'] ?? array(), $t['appliances'] ?? array() ),
		);
		$form  = '<form class="wl-tool' . ( $split ? ' wl-tool-split' : '' ) . '" id="' . esc_attr( $id ) . '" data-wl-tool novalidate onsubmit="return false">';
		$form .= ( $split ? '<div class="wl-in">' : '' ) . '<div class="wl-fields">' . $main . '</div>';
		if ( '' !== $adv ) {
			$form .= '<details class="wl-advanced"><summary>Advanced settings</summary><div class="wl-fields">' . $adv . '</div></details>';
		}
		$form .= '<button type="submit" class="wl-btn">' . esc_html( $t['submit'] ?? 'Calculate' ) . '</button>';
		// Without JavaScript the button does nothing (onsubmit), instead of reloading the page with the defaults (audit WL-27).
		$form .= '<noscript><p class="wl-hint">Turn on JavaScript to calculate with your own numbers. The result below uses the default inputs.</p></noscript>';
		$form  .= $split ? '</div><div class="wl-out"><p class="wl-out-title">Your plan</p>' : '';
		$notice = (string) ( $t['notice'] ?? '' ); // a warning on the default result, same text the browser prints
		// An empty box waits for errors (role=alert); a notice on the default result is amber and polite (audit WL-54, WL-61).
		$form  .= '' === $notice
			? '<p class="wl-error" id="' . esc_attr( $id ) . '-error" role="alert" hidden></p>'
			: '<p class="wl-error wl-notice" id="' . esc_attr( $id ) . '-error" role="status">' . esc_html( $notice ) . '</p>';
		$form .= '<div class="wl-results" aria-live="polite">' . $results . '</div>' . $this->rtable( $id, $t ) . $this->diagram( $t ) . $share . ( $split ? '</div>' : '' );
		$form .= '<script type="application/json" class="wl-config">' . wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP ) . '</script>';
		$form .= '</form>';
		return $form;
	}

	/**
	 * Result table (N17 months, N18 circuits): the default rows from the build; the browser redraws the body from the
	 * engine on every calculation (wattlyst-extra.js drawTable), so the table and the result cards always agree.
	 */
	private function rtable( string $id, array $t ): string {
		$r = $t['rtable'] ?? null;
		if ( ! $r ) {
			return '';
		}
		$cid  = $id . '-rtable';
		$head = implode( '', array_map( static fn( $c ) => '<th scope="col">' . esc_html( $c['label'] ) . '</th>', $r['columns'] ) );
		$rows = '';
		foreach ( $r['rows'] as $row ) {
			$rows .= '<tr>' . implode( '', array_map( static fn( $v ) => '<td>' . str_replace( 'Rs ', 'Rs&nbsp;', esc_html( $v ) ) . '</td>', $row ) ) . '</tr>';
		}
		return '<div class="wl-rtable" data-wl-rtable><p class="wl-rtable-title" id="' . esc_attr( $cid ) . '">' . esc_html( $r['caption'] ) . '</p>' .
			'<div class="wl-table-wrap" role="region" tabindex="0" aria-labelledby="' . esc_attr( $cid ) . '"><table class="wl-table" aria-labelledby="' . esc_attr( $cid ) . '"><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></div>';
	}

	/**
	 * N11 battery diagram: one row per parallel string, one box per battery in series, drawn from the result
	 * values already printed above (the browser redraws it on every calculation). Capped for readability.
	 */
	private function diagram( array $t ): string {
		if ( 'battery_grid' !== ( $t['diagram'] ?? '' ) ) {
			return '';
		}
		$val = static function ( string $key ) use ( $t ): int {
			foreach ( $t['outputs'] as $o ) {
				if ( $o['key'] === $key ) {
					return (int) str_replace( ',', '', (string) $o['value'] );
				}
			}
			return 0;
		};
		return '<div class="wl-diagram" data-wl-diagram="battery_grid" role="img" aria-label="Battery wiring diagram: the batteries of each string in series, minus of the first battery to the negative bus, plus of the last battery through a fuse to the positive bus">' . self::battery_grid( $val( 'n_series' ), $val( 'n_parallel' ) ) . '</div>';
	}

	/**
	 * Same markup as the browser's drawGrid() in assets/js/wattlyst-tool.js. Each battery reads "− +" left to right,
	 * so battery 1's free terminal is minus (N11 step 3); each string's minus lead runs to the negative bus on the
	 * left and its plus lead through a fuse to the positive bus on the right.
	 */
	public static function battery_grid( int $series, int $parallel ): string {
		$max  = 8;
		$rows = '';
		for ( $p = 1; $p <= min( $parallel, $max ); $p++ ) {
			$cells = str_repeat( '<span class="wl-cell">&minus; +</span>', min( $series, $max ) );
			$more  = $series > $max ? '<span class="wl-more">+' . ( $series - $max ) . '</span>' : '';
			$rows .= '<div class="wl-string"><span class="wl-string-label">String ' . $p . '</span><div class="wl-row"><span class="wl-wire"></span>' . $cells . $more . '<span class="wl-wire"></span><span class="wl-fuse">fuse</span><span class="wl-wire"></span></div></div>';
		}
		$more_rows = $parallel > $max ? '<div class="wl-more">+' . ( $parallel - $max ) . ' more strings</div>' : '';
		return '<div class="wl-grid"><span class="wl-bus wl-bus-neg">Negative bus</span><div class="wl-strings">' . $rows . $more_rows . '</div><span class="wl-bus wl-bus-pos">Positive bus</span></div>';
	}

	/**
	 * Appliance picker list for the browser as [[category, [id, ...]], ...]: names come from the appliance data
	 * already in the config, so the catalog is not shipped twice (audit WL-58, homepage weight).
	 */
	private static function catalog_groups( array $catalog ): array {
		$groups = array();
		foreach ( $catalog as $a ) {
			$last = count( $groups ) - 1;
			if ( $last < 0 || $groups[ $last ][0] !== $a['category'] ) {
				$groups[] = array( $a['category'], array() );
				++$last;
			}
			$groups[ $last ][1][] = $a['id'];
		}
		return $groups;
	}

	private function tool_data( array $keys, array $appliances ): array {
		$data = array( 'defaults' => $this->plugin->manifest()['data']['defaults'] ?? array() );
		foreach ( $keys as $k ) {
			if ( isset( $this->plugin->manifest()['data'][ $k ] ) ) {
				$data[ $k ] = $this->plugin->manifest()['data'][ $k ];
			}
		}
		if ( $appliances ) {
			$data['appliances'] = $appliances;
		}
		return $data;
	}

	/**
	 * Appliance list: one row per load (appliance, watts, quantity, hours a day) with add/remove buttons. With the
	 * field flag "start" (generator pages) a Starting watts column follows Watts: blank = the listed appliance's own
	 * starting watts (or the running watts for a custom row), a number = that starting surge (a custom motor).
	 * Default rows are rendered server-side so the default result and the form agree before JavaScript runs.
	 */
	private function loads_field( string $prefix, array $f ): string {
		$fid   = $prefix . '-' . $f['name'];
		$hint  = isset( $f['hint'] ) ? '<p class="wl-hint" id="' . esc_attr( $fid ) . '-hint">' . esc_html( $f['hint'] ) . '</p>' : '';
		$rows  = '';
		foreach ( $f['default'] ?? array() as $n => $row ) {
			$rows .= $this->loads_row( $fid, $f, (int) $n, $row );
		}
		$head  = '<tr><th scope="col">Appliance</th><th scope="col">Watts</th>' . ( empty( $f['start'] ) ? '' : '<th scope="col">Starting watts</th>' ) . '<th scope="col">Qty</th><th scope="col">' . ( empty( $f['length'] ) ? 'Hours a day' : 'Cable length (m)' ) . '</th><th scope="col"><span class="screen-reader-text">Remove</span></th></tr>';
		$tmpl  = '<template class="wl-loads-template">' . $this->loads_row( $fid, $f, -1, array() ) . '</template>';
		return '<div class="wl-field wl-field-loads" data-wl-loads="' . esc_attr( $f['name'] ) . '"><span class="wl-label" id="' . esc_attr( $fid ) . '-label">' . esc_html( $f['label'] ?? 'Appliances' ) . '</span>' .
			'<div class="wl-table-wrap"><table class="wl-table wl-loads" aria-labelledby="' . esc_attr( $fid ) . '-label"><thead>' . $head . '</thead><tbody>' . $rows . '</tbody></table></div>' .
			'<button type="button" class="wl-btn-secondary wl-add-row">+ Add appliance</button>' . $hint . $tmpl . '</div>';
	}

	private function loads_row( string $fid, array $f, int $n, array $row ): string {
		$a     = $this->page['content']['tool']['appliances'] ?? array();
		$id    = (string) ( $row['id'] ?? '' );
		$item  = $a[ $id ] ?? null;
		$watts = isset( $row['watts'] ) ? (string) $row['watts'] : ( $item ? (string) $item['running_w'] : '' );
		$qty   = (string) ( $row['qty'] ?? 1 );
		$hours = isset( $row['hours'] ) ? (string) $row['hours'] : ( $item ? (string) $item['typical_hours_per_day'] : '' );
		// Only the chosen option is rendered; the live script fills the full appliance list from the catalog
		// (87 options per row would bloat the HTML, and without JavaScript the list cannot recalculate anyway).
		$name  = 'custom' === $id || '' === $id ? 'Custom (enter watts)' : ( $item['name'] ?? $id );
		$opts  = '<option value="' . esc_attr( '' === $id ? 'custom' : $id ) . '" selected>' . esc_html( $name ) . '</option>';
		$r     = $n < 0 ? 'x' : (string) $n;
		$cell  = static fn( string $k, string $v, string $label, string $extra = '' ) => '<td><label class="screen-reader-text" for="' . esc_attr( "$fid-$r-$k" ) . '">' . esc_html( $label ) . '</label><input type="text" inputmode="decimal" autocomplete="off" id="' . esc_attr( "$fid-$r-$k" ) . '" data-k="' . esc_attr( $k ) . '" value="' . esc_attr( $v ) . '"' . $extra . '></td>';
		return '<tr class="wl-load-row">' .
			'<td><label class="screen-reader-text" for="' . esc_attr( "$fid-$r-id" ) . '">Appliance</label><select id="' . esc_attr( "$fid-$r-id" ) . '" data-k="id">' . $opts . '</select></td>' .
			$cell( 'watts', $watts, 'Watts' ) . ( empty( $f['start'] ) ? '' : $cell( 'start', isset( $row['start'] ) ? (string) $row['start'] : '', 'Starting watts (blank = automatic)', ' placeholder="auto"' ) ) . $cell( 'qty', $qty, 'Quantity', ' size="3"' ) . ( empty( $f['length'] ) ? $cell( 'hours', $hours, 'Hours a day', ' size="4"' ) : $cell( 'length', isset( $row['length'] ) ? (string) $row['length'] : '', 'Cable length in metres', ' size="4"' ) ) .
			'<td><button type="button" class="wl-remove-row" aria-label="Remove this appliance">&times;</button></td></tr>';
	}

	private function field( string $prefix, array $f ): string {
		if ( 'loads' === ( $f['type'] ?? '' ) ) {
			return $this->loads_field( $prefix, $f );
		}
		$fid   = $prefix . '-' . $f['name'];
		$unit  = isset( $f['unit'] ) ? ' <span class="wl-unit">(' . esc_html( $f['unit'] ) . ')</span>' : '';
		$hint  = isset( $f['hint'] ) ? '<p class="wl-hint" id="' . esc_attr( $fid ) . '-hint">' . esc_html( $f['hint'] ) . '</p>' : '';
		$descr = isset( $f['hint'] ) ? ' aria-describedby="' . esc_attr( $fid ) . '-hint"' : '';
		$label = '<label for="' . esc_attr( $fid ) . '">' . esc_html( $f['label'] ?? $f['name'] ) . $unit . '</label>';
		$value = isset( $f['default'] ) ? (string) $f['default'] : '';
		if ( in_array( $f['type'] ?? '', array( 'select', 'appliance' ), true ) ) {
			$opts = '';
			foreach ( $f['options'] as $o ) {
				$opts .= sprintf( '<option value="%s"%s>%s</option>', esc_attr( (string) $o[0] ), selected( (string) $o[0], $value, false ), esc_html( $o[1] ) );
			}
			$input = '<select id="' . esc_attr( $fid ) . '" name="' . esc_attr( $f['name'] ) . '"' . $descr . '>' . $opts . '</select>';
		} elseif ( 'checkbox' === ( $f['type'] ?? '' ) ) {
			return '<div class="wl-field wl-check"><input type="checkbox" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $f['name'] ) . '"' . ( $value ? ' checked' : '' ) . $descr . '> ' . $label . $hint . '</div>';
		} else {
			$ph    = isset( $f['placeholder'] ) ? ' placeholder="' . esc_attr( $f['placeholder'] ) . '"' : '';
			$input = '<input type="text" inputmode="decimal" autocomplete="off" id="' . esc_attr( $fid ) . '" name="' . esc_attr( $f['name'] ) . '" value="' . esc_attr( $value ) . '"' . $ph . $descr . '>';
		}
		return '<div class="wl-field">' . $label . $input . $hint . '</div>';
	}

	private function how(): string {
		$how = $this->c['tool']['how'] ?? null;
		if ( ! $how ) {
			return '';
		}
		return '<section class="wl-how"><h2>How this result was calculated</h2><p data-wl-how>' . esc_html( $how['text'] ) . '</p></section>';
	}

	private function key_facts(): string {
		if ( empty( $this->c['key_facts'] ) ) {
			return '';
		}
		$li = implode( '', array_map( static fn( $k ) => '<li>' . esc_html( $k ) . '</li>', $this->c['key_facts'] ) );
		return '<section class="wl-facts"><h2>Key facts</h2><ul>' . $li . '</ul></section>';
	}

	private function formula(): string {
		$f = $this->c['formula'] ?? null;
		if ( ! $f ) {
			return '';
		}
		$lines = implode( '', array_map( static fn( $l ) => '<li>' . esc_html( $l ) . '</li>', $f['lines'] ) );
		return '<section class="wl-formula"><h2>Formula</h2><p class="wl-eq"><code>' . esc_html( $f['text'] ) . '</code></p>' . ( $lines ? '<ul>' . $lines . '</ul>' : '' ) . '</section>';
	}

	private function sections(): string {
		$out = '';
		foreach ( $this->c['sections'] ?? array() as $s ) {
			$out .= '<section><h2>' . esc_html( $s['h2'] ) . '</h2>';
			foreach ( $s['p'] as $p ) {
				$out .= '<p>' . esc_html( $p ) . '</p>';
			}
			$out .= '</section>';
		}
		return $out;
	}

	private function examples(): string {
		if ( empty( $this->c['examples'] ) ) {
			return '';
		}
		$out = '<section class="wl-examples"><h2>Worked examples</h2>';
		foreach ( $this->c['examples'] as $ex ) {
			$out .= '<h3>' . esc_html( $ex['title'] ) . '</h3><p>' . esc_html( $ex['text'] ) . '</p>';
		}
		return $out . '</section>';
	}

	private function table(): string {
		$t = $this->c['table'] ?? null;
		return $t ? $this->ref_table( $t ) : '';
	}

	/**
	 * One reference table under its H2. The table is named by the heading (aria-labelledby, audit WL-60) and its
	 * scroll box is a focusable, named region, so keyboard users can scroll a wide table on a phone.
	 */
	private function ref_table( array $t, string $attrs = '' ): string {
		$id   = 'wl-t' . ( ++$this->tables ) . '-' . substr( sanitize_title( $t['caption'] ), 0, 40 );
		$head = implode( '', array_map( static fn( $h ) => '<th scope="col">' . esc_html( $h ) . '</th>', $t['head'] ) );
		$rows = '';
		foreach ( $t['rows'] as $r ) {
			$rows .= '<tr>' . implode( '', array_map( static fn( $v ) => '<td>' . str_replace( 'Rs ', 'Rs&nbsp;', esc_html( $v ) ) . '</td>', $r ) ) . '</tr>';
		}
		return '<section class="wl-ref"' . $attrs . '><h2 id="' . esc_attr( $id ) . '">' . esc_html( $t['caption'] ) . '</h2>' .
			'<div class="wl-table-wrap" role="region" tabindex="0" aria-labelledby="' . esc_attr( $id ) . '"><table class="wl-table" aria-labelledby="' . esc_attr( $id ) . '"><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></section>';
	}

	/** Lookup page (error codes): brand select + text filter over the tables below; the tables are complete without JavaScript. */
	private function lookup(): string {
		$l    = $this->c['lookup'] ?? null;
		if ( ! $l ) {
			return '';
		}
		$id   = 'wl-' . strtolower( $this->page['id'] );
		$opts = '<option value="">All brands</option>';
		foreach ( $this->c['tables'] ?? array() as $t ) {
			$opts .= '<option value="' . esc_attr( $t['key'] ) . '">' . esc_html( $t['label'] ) . '</option>';
		}
		return '<form class="wl-tool wl-lookup" data-wl-lookup onsubmit="return false"><div class="wl-fields">' .
			'<div class="wl-field"><label for="' . esc_attr( $id ) . '-brand">' . esc_html( $l['label'] ) . '</label><select id="' . esc_attr( $id ) . '-brand" data-wl-group-select>' . $opts . '</select></div>' .
			'<div class="wl-field"><label for="' . esc_attr( $id ) . '-q">' . esc_html( $l['text_label'] ) . '</label><input type="search" id="' . esc_attr( $id ) . '-q" data-wl-filter autocomplete="off" placeholder="For example 02, 1010, F03, grid"><p class="wl-hint">Type the code as the display shows it, or a word such as battery, fan or grid. ' . esc_html( (string) $l['count'] ) . ' codes from manufacturer manuals, last checked <time datetime="' . esc_attr( $l['checked'] ) . '">' . esc_html( self::date( $l['checked'] ) ) . '</time>.</p></div>' .
			'</div><p class="wl-error wl-notice" data-wl-nomatch role="status" hidden>No code matches. Check the brand, or try a shorter text such as the code alone.</p></form>';
	}

	private function tables(): string {
		$out = '';
		foreach ( $this->c['tables'] ?? array() as $t ) {
			$out .= $this->ref_table( $t, isset( $t['key'] ) ? ' data-wl-group="' . esc_attr( $t['key'] ) . '"' : '' );
		}
		return $out;
	}

	private function download(): string {
		$d = $this->c['download'] ?? null;
		if ( ! $d ) {
			return '';
		}
		return '<p class="wl-download"><a class="wl-btn-secondary" href="' . esc_url( Wattlyst_Tools::link( $d['url'] ) ) . '" download>' . esc_html( $d['label'] ) . '</a> <span>Data checked <time datetime="' . esc_attr( $d['checked'] ) . '">' . esc_html( self::date( $d['checked'] ) ) . '</time>. ' . esc_html( $d['license'] ) . '.</span></p>';
	}

	/** Horizontal bar chart in plain HTML and CSS (no image, no script): each bar's width is its share of the largest value. */
	private function chart(): string {
		$ch = $this->c['chart'] ?? null;
		if ( ! $ch ) {
			return '';
		}
		$out = '<figure class="wl-chart"><figcaption>' . esc_html( $ch['caption'] ) . '</figcaption><dl>';
		foreach ( $ch['groups'] as $g ) {
			$out .= '<dt>' . esc_html( $g['label'] ) . '</dt>';
			foreach ( $g['bars'] as $n => $b ) {
				$from  = isset( $b['from_pct'] ) ? (float) $b['from_pct'] : 0.0;
				$style = 'margin-left:' . $from . '%;width:' . max( 0.5, (float) $b['pct'] - $from ) . '%';
				$out  .= '<dd class="wl-bar wl-bar-' . ( (int) $n % 2 ) . '"><span class="wl-bar-fill" style="' . esc_attr( $style ) . '"></span><span class="wl-bar-text">' . esc_html( ( count( $g['bars'] ) > 1 ? $b['name'] . ': ' : '' ) . $b['text'] ) . '</span></dd>';
			}
		}
		return $out . '</dl></figure>';
	}

	/** Embed page: one block per live calculator with its iframe and script code, ready to copy. */
	private function embeds(): string {
		$out = '';
		foreach ( $this->c['embeds'] ?? array() as $e ) {
			$id   = 'wl-embed-' . strtolower( $e['id'] );
			$out .= '<details class="wl-embed"><summary>' . esc_html( $e['h1'] ) . '</summary>' .
				'<p><a href="' . esc_url( Wattlyst_Tools::link( $e['url'] ) ) . '">Open the full page</a></p>' .
				'<label for="' . esc_attr( $id ) . '-iframe">Iframe code</label><textarea id="' . esc_attr( $id ) . '-iframe" readonly rows="4">' . esc_textarea( $e['iframe'] ) . '</textarea>' .
				'<button type="button" class="wl-btn-secondary" data-wl-copy="' . esc_attr( $id ) . '-iframe">Copy iframe code</button>' .
				'<label for="' . esc_attr( $id ) . '-script">Script code (resizes itself)</label><textarea id="' . esc_attr( $id ) . '-script" readonly rows="3">' . esc_textarea( $e['script'] ) . '</textarea>' .
				'<button type="button" class="wl-btn-secondary" data-wl-copy="' . esc_attr( $id ) . '-script">Copy script code</button></details>';
		}
		return $out ? '<section class="wl-embeds"><h2>Calculators you can embed</h2>' . $out . '</section>' : '';
	}

	/**
	 * The calculator alone, for /embed/{id}/: the tool, its "how" text and the credit link back to the full page.
	 * No ads, no header or footer; the page itself is noindex with a canonical to the full page.
	 */
	public function embed_html(): string {
		if ( empty( $this->c['tool'] ) ) {
			return '';
		}
		$site = $this->plugin->site();
		return '<div class="wl-page wl-embedded"><p class="wl-embed-title"><strong>' . esc_html( $this->page['h1'] ) . '</strong></p>' . $this->tool() . $this->how() .
			'<p class="wl-credit"><a href="' . esc_url( Wattlyst_Tools::link( $this->page['url'] ) ) . '" target="_blank" rel="noopener">Calculator by ' . esc_html( $site['brand'] ?? 'Wattlyst' ) . '</a></p></div>';
	}

	/** Home page: "What do you want to do?" task cards, one per live hub, each listing its live tools. */
	private function cards(): string {
		$cards = '';
		foreach ( $this->page['cards'] ?? array() as $card ) {
			$items = array();
			foreach ( $card['children'] as $ch ) {
				$items[] = '<li><a href="' . esc_url( Wattlyst_Tools::link( $ch['url'] ) ) . '">' . esc_html( $ch['h1'] ) . '</a></li>';
			}
			// Every tool link stays in the HTML (internal links), but on a phone a hub shows its first few tools and
			// folds the rest, so the home page is not a wall of links (audit WL-78).
			$cut    = count( $items ) > self::HOME_CARD_LINKS + 1 ? self::HOME_CARD_LINKS : count( $items ); // never fold just one link
			$shown  = array_slice( $items, 0, $cut );
			$more   = array_slice( $items, $cut );
			$links  = $shown ? '<ul>' . implode( '', $shown ) . '</ul>' : '';
			$links .= $more ? '<details class="wl-more"><summary>' . esc_html( sprintf( 'Show %d more', count( $more ) ) ) . '</summary><ul>' . implode( '', $more ) . '</ul></details>' : '';
			$slug   = sanitize_html_class( trim( (string) $card['url'], '/' ) );
			// The hub link covers the whole card (stretched); the tool links and the fold sit above it.
			$cards .= '<div class="wl-card wl-card-' . $slug . '"><div class="wl-card-top"><span class="wl-ico" aria-hidden="true"></span><span class="wl-count">' . esc_html( self::tools_label( count( $items ) ) ) . '</span></div>' .
				'<h3><a href="' . esc_url( Wattlyst_Tools::link( $card['url'] ) ) . '">' . esc_html( $card['label'] ) . '</a></h3><p>' . esc_html( $card['meta'] ) . '</p>' . $links .
				'<span class="wl-card-cta" aria-hidden="true">Open ' . esc_html( $card['label'] ) . '</span></div>';
		}
		return $cards ? '<section class="wl-tasks" aria-labelledby="wl-tasks-title"><h2 id="wl-tasks-title">What do you want to do?</h2><p class="wl-tasks-lead">Pick a task to open its calculators, or jump straight to a tool.</p><div class="wl-cards">' . $cards . '</div></section>' : '';
	}

	private function mistakes(): string {
		$m = $this->c['mistakes'] ?? array();
		$s = $this->c['safety'] ?? '';
		if ( ! $m && ! $s ) {
			return '';
		}
		$out = '<section class="wl-mistakes"><h2>Common mistakes</h2>';
		if ( $m ) {
			$out .= '<ul>' . implode( '', array_map( static fn( $x ) => '<li>' . esc_html( $x ) . '</li>', $m ) ) . '</ul>';
		}
		if ( $s ) {
			$out .= '<p class="wl-safety"><strong>Safety:</strong> ' . esc_html( $s ) . '</p>';
		}
		return $out . '</section>';
	}

	/** FAQ; $fold (home) shows each answer under its question as an open/close row, the first one open. */
	private function faq( bool $fold = false ): string {
		if ( empty( $this->c['faq'] ) ) {
			return '';
		}
		$out = '<section class="wl-faq' . ( $fold ? ' wl-faq-fold' : '' ) . '"><h2>Frequently asked questions</h2>';
		foreach ( $this->c['faq'] as $i => $f ) {
			$out .= $fold
				? '<details class="wl-qa"' . ( 0 === $i ? ' open' : '' ) . '><summary><h3>' . esc_html( $f['q'] ) . '</h3></summary><p>' . esc_html( $f['a'] ) . '</p></details>'
				: '<h3>' . esc_html( $f['q'] ) . '</h3><p>' . esc_html( $f['a'] ) . '</p>';
		}
		return $out . '</section>';
	}

	/** Links to live pages only, so a page never links to a URL that does not exist yet. */
	private function related(): string {
		$links = array();
		$next  = ! empty( $this->page['next'] ) ? $this->plugin->row( $this->page['next'] ) : null;
		if ( $next && ! empty( $next['live'] ) ) {
			$links[] = '<li class="wl-next"><strong>Next step:</strong> <a href="' . esc_url( Wattlyst_Tools::link( $next['url'] ) ) . '">' . esc_html( $next['h1'] ) . '</a></li>';
		}
		foreach ( $this->page['related'] ?? array() as $rid ) {
			$r = $this->plugin->row( $rid );
			if ( $r && ! empty( $r['live'] ) ) {
				$links[] = '<li><a href="' . esc_url( Wattlyst_Tools::link( $r['url'] ) ) . '">' . esc_html( $r['h1'] ) . '</a></li>';
			}
		}
		$parent = ! empty( $this->page['parent'] ) ? $this->plugin->row( $this->page['parent'] ) : null;
		if ( $parent && ! empty( $parent['live'] ) ) {
			$links[] = '<li><a href="' . esc_url( Wattlyst_Tools::link( $parent['url'] ) ) . '">All ' . esc_html( strtolower( $parent['h1'] ) ) . '</a></li>';
		}
		return $links ? '<section class="wl-related"><h2>Related calculators</h2><ul>' . implode( '', $links ) . '</ul></section>' : '';
	}

	private function children(): string {
		$items = '';
		foreach ( $this->page['children'] ?? array() as $cid ) {
			$r = $this->plugin->row( $cid );
			if ( $r && ! empty( $r['live'] ) ) {
				$items .= '<li><a href="' . esc_url( Wattlyst_Tools::link( $r['url'] ) ) . '">' . esc_html( $r['h1'] ) . '</a><p>' . esc_html( $r['meta'] ) . '</p></li>';
			}
		}
		return $items ? '<ul class="wl-children">' . $items . '</ul>' : '';
	}

	private function author_box(): string {
		$site   = $this->plugin->site();
		$author = $this->author();
		if ( ! $author ) {
			return '';
		}
		$name = esc_html( $author['name'] );
		if ( ! empty( $author['same_as'][0] ) ) {
			$name = '<a href="' . esc_url( $author['same_as'][0] ) . '" rel="author noopener">' . $name . '</a>';
		}
		$rev = $site['reviewer'] ?? array();
		if ( 'signed_off' === ( $rev['status'] ?? '' ) && ! empty( $rev['name'] ) ) {
			$rname = esc_html( $rev['name'] );
			if ( ! empty( $rev['same_as'][0] ) ) {
				$rname = '<a href="' . esc_url( $rev['same_as'][0] ) . '" rel="noopener">' . $rname . '</a>';
			}
			$review = 'Technically reviewed by ' . $rname . ', ' . esc_html( $rev['credential'] ?? '' ) . '.';
		} else {
			$review = 'Technical review by a PEC-registered electrical engineer is in progress.';
		}
		return '<aside class="wl-author" aria-label="About this page"><p><strong>Written by</strong> ' . $name . ', ' . esc_html( implode( ' and ', $author['roles'] ) ) . ' of ' . esc_html( $site['brand'] ?? '' ) . '.</p><p>' . $review . ' <a href="' . esc_url( Wattlyst_Tools::link( '/methodology/' ) ) . '">How we calculate</a>.</p></aside>';
	}

	private function sources(): string {
		$items = '';
		foreach ( $this->c['sources'] ?? array() as $s ) {
			$url    = str_starts_with( $s['url'], '/' ) ? Wattlyst_Tools::link( $s['url'] ) : $s['url'];
			$items .= '<li><a href="' . esc_url( $url ) . '"' . ( str_starts_with( $s['url'], '/' ) ? '' : ' rel="noopener"' ) . '>' . esc_html( $s['label'] ) . '</a></li>';
		}
		foreach ( $this->c['tool']['data_checked'] ?? array() as $d ) {
			$items .= '<li>' . ( $d['url'] ? '<a href="' . esc_url( $d['url'] ) . '" rel="noopener">' . esc_html( $d['label'] ) . '</a>' : esc_html( $d['label'] ) ) . ', last checked <time datetime="' . esc_attr( $d['checked'] ) . '">' . esc_html( self::date( $d['checked'] ) ) . '</time></li>';
		}
		$out = $items ? '<section class="wl-sources"><h2>Sources</h2><ul>' . $items . '</ul></section>' : '';
		return $out . $this->dates();
	}

	private function dates(): string {
		if ( empty( $this->page['reviewed'] ) ) {
			return '';
		}
		$label = 'trust' === $this->page['type'] ? 'Last updated' : 'Last reviewed';
		return '<p class="wl-dates">' . $label . ': <time datetime="' . esc_attr( $this->page['reviewed'] ) . '">' . esc_html( self::date( $this->page['reviewed'] ) ) . '</time></p>';
	}

	private static function date( string $ymd ): string {
		$ts = strtotime( $ymd . ' 12:00:00 UTC' );
		return $ts ? gmdate( 'j F Y', $ts ) : $ymd;
	}
}
