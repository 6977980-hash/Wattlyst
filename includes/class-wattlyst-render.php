<?php
/**
 * HTML for one generated page. Templates: tool, appliance (tool + appliance facts), guide, pillar, trust.
 * Section order follows specs/seo-rules.md section 3. All text arrives pre-rendered from generated/;
 * this class only escapes and arranges it.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Render {

	/** Tools listed openly per hub card on the home page; the rest sit in a "Show N more" fold. */
	private const HOME_CARD_LINKS = 2;

	private Wattlyst_Tools $plugin;
	private array $page;
	private array $c;
	private int $tables = 0; // numbers the reference table headings on this page (unique ids)
	private bool $embed = false; // /embed/<id>/: result first, no links out but the credit (WL-238)
	private bool $ur    = false; // an Urdu page (/ur/...): the words around the content come from content/ur/ui.json

	public function __construct( Wattlyst_Tools $plugin, array $page ) {
		$this->plugin = $plugin;
		$this->page   = $page;
		$this->c      = is_array( $page['content'] ?? null ) ? $page['content'] : array();
		$this->ur     = 'ur' === ( $page['lang'] ?? '' );
	}

	/** The Urdu words for a fixed English phrase on an Urdu page (manifest ui_ur), the phrase itself elsewhere. */
	private function t( string $s ): string {
		return $this->ur ? (string) ( $this->plugin->manifest()['ui_ur'][ $s ] ?? $s ) : $s;
	}

	/**
	 * Link to the same page in the other language, only when both are live (build `alt`). The link text is in the
	 * language it opens, with lang and hreflang, so a screen reader reads it right.
	 */
	private function lang_link(): string {
		$alt = $this->page['alt'] ?? null;
		if ( ! $alt || $this->embed ) {
			return '';
		}
		$to   = $this->ur ? 'en' : 'ur';
		$text = $this->ur ? 'Read in English' : (string) ( $this->plugin->manifest()['ui_ur']['Read in Urdu'] ?? 'Urdu' );
		return '<p class="wl-lang-link"><a href="' . esc_url( Wattlyst_Tools::link( (string) $alt[ $to ] ) ) . '" hreflang="' . $to . '" lang="' . $to . '">' . esc_html( $text ) . '</a></p>';
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
					'<ol class="wl-steps"><li>List your appliances</li><li>Set your city and backup</li><li>Get every size and the best setup</li></ol></div>' .
					$this->tool( true ) . $this->how( true ) . $this->data_used() . '</section>';
			}
			$out .= $this->cards();
			$out .= $this->lead();
			$out .= '' !== $this->sections() ? '<div class="wl-home-info">' . $this->sections( true ) . '</div>' : '';
			// FAQ and author box beside the key facts, so neither runs across the whole page.
			$out .= '<div class="wl-home-more"><div class="wl-home-main">' . $this->faq( true ) . $this->author_box() . '</div><div class="wl-home-side">' . $this->key_facts( 3 ) . $this->dates() . '</div></div>';
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
			// Hub (WL-200): each "by task" section with its own calculators as cards, then the rest, then key facts.
			$out .= $this->children();
			$out .= $this->key_facts();
			$out .= $this->sections( false, true );
			$out .= $this->tables();
			$out .= $this->faq();
			if ( ! empty( $this->c['sections'] ) || ! empty( $this->c['tables'] ) ) {
				$out .= $this->author_box();
				$out .= $this->sources();
			} else {
				$out .= $this->dates();
			}
		} else {
			if ( ! empty( $this->c['tool'] ) ) {
				// List calculators: the list on the left and the result beside it on wide screens (WL-204).
				$list = in_array( 'loads', array_column( $this->c['tool']['fields'], 'type' ), true );
				$out .= $this->tool( $list );
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
		return '<nav class="wl-breadcrumb" aria-label="' . esc_attr( $this->t( 'Breadcrumb' ) ) . '"><ol>' . implode( '', $items ) . '</ol></nav>';
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
		return '<header class="wl-hero">' . $crumb . '<h1 class="wl-h1">' . esc_html( $this->page['h1'] ) . '</h1>' . $this->answer( (string) $answer ) . $byline . $this->lang_link() . '</header>';
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
			$ids    = array_merge( $ids, array_column( $card['children'], 'id' ) );
			$chips .= '<li><a class="wl-chip wl-card-' . sanitize_html_class( trim( (string) $card['url'], '/' ) ) . '" href="' . esc_url( Wattlyst_Tools::link( $card['url'] ) ) . '"><span class="wl-ico" aria-hidden="true"></span><span class="wl-chip-name">' . esc_html( $card['label'] ) . '</span><span class="wl-chip-n">' . esc_html( $this->tools_label( $card['children'] ) ) . '</span></a></li>';
		}
		// Calculators and guides are counted apart, from the manifest, so the home page never calls a guide a tool (WL-205).
		$kinds = $this->kinds( array_unique( $ids ) );
		$cta   = ! empty( $this->c['tool'] ) ? '<a class="wl-cta" href="#wl-plan-title">Start planning</a>' : '';
		$cta  .= $chips ? '<a class="wl-cta wl-cta-ghost" href="#wl-tasks-title">Browse all calculators</a>' : '';
		$pills = ( $kinds['calculator'] ? '<li>' . esc_html( $kinds['calculator'] . ' free calculators' ) . '</li>' : '' ) .
			( $kinds['guide'] ? '<li>' . esc_html( self::count_label( $kinds['guide'], 'guide' ) ) . '</li>' : '' ) . '<li>No sign-up</li><li>Formulas shown</li><li>Works on your phone</li>';
		$text  = '<div class="wl-hero-text"><h1 class="wl-h1">' . esc_html( $this->page['h1'] ) . '</h1>' . $this->answer( $answer ) .
			( $cta ? '<p class="wl-ctas">' . $cta . '</p>' : '' ) . '<ul class="wl-pills">' . $pills . '</ul>' . $this->lang_link() . '</div>';
		$nav   = $chips ? '<nav class="wl-hero-cats" aria-label="Calculator categories"><p class="wl-hero-cats-title">Browse by task</p><ul>' . $chips . '</ul></nav>' : '';
		return '<header class="wl-hero wl-hero-home">' . $text . $nav . '</header>';
	}

	/** Live pages by kind: calculator (tools, appliance pages, the error-code lookup), guide, dataset. */
	private function kinds( array $ids ): array {
		$n = array( 'calculator' => 0, 'guide' => 0, 'dataset' => 0 );
		foreach ( $ids as $id ) {
			$type = $this->plugin->row( (string) $id )['type'] ?? 'tool';
			++$n[ 'guide' === $type ? 'guide' : ( 'data' === $type ? 'dataset' : 'calculator' ) ];
		}
		return $n;
	}

	/** "21 calculators", "5 guides", "2 datasets", or "3 calculators, 1 guide" for a hub that has both. */
	private function tools_label( array $children ): string {
		$parts = array();
		foreach ( $this->kinds( array_column( $children, 'id' ) ) as $kind => $n ) {
			if ( $n ) {
				$parts[] = self::count_label( $n, $kind );
			}
		}
		return implode( ', ', $parts );
	}

	private static function count_label( int $n, string $kind ): string {
		return $n . ' ' . $kind . ( 1 === $n ? '' : 's' );
	}

	private function answer( string $text ): string {
		return '' === $text ? '' : '<p class="wl-answer">' . esc_html( $text ) . '</p>';
	}

	/** One line under the answer: author and date. "Reviewed" only after the engineer signs off; until then "Updated" (WL-214). */
	private function byline(): string {
		$author = $this->author();
		$when   = $this->when();
		if ( ! $author || ! $when || empty( $this->page['reviewed'] ) ) {
			return '';
		}
		return '<p class="wl-byline">' . esc_html( $this->t( 'By' ) ) . ' <span>' . esc_html( $author['name'] ) . '</span> <span aria-hidden="true">&middot;</span> ' . esc_html( $this->t( $when[0] ) ) . ' <time datetime="' . esc_attr( $when[1] ) . '">' . esc_html( $this->date( $when[1] ) ) . '</time></p>';
	}

	/** Label and date for the byline and "Last ...": the review date once signed off, else the last change (build `modified`, WL-206). */
	private function when(): ?array {
		$p      = $this->page;
		$signed = 'signed_off' === ( $this->plugin->site()['reviewer']['status'] ?? '' );
		if ( $signed && ! empty( $p['reviewed'] ) && 'trust' !== $p['type'] ) {
			return array( 'Reviewed', $p['reviewed'] );
		}
		$date = ( $p['modified'] ?? '' ) ?: ( $p['reviewed'] ?? '' );
		return '' === $date ? null : array( 'Updated', $date );
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

	/**
	 * Calculator form. $split (home planner, list calculators) wraps the inputs and the results in two columns for the
	 * desktop layout. In an embed the result comes first, so a short iframe still shows it (WL-238).
	 */
	private function tool( bool $split = false ): string {
		$home = 'home' === $this->page['type'];
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
				'<div class="wl-result"%s><span class="wl-result-label"%s>%s</span> <output data-out="%s"><span class="wl-val">%s</span>%s</output></div>',
				'' === (string) $o['value'] ? ' hidden' : '',
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
			'<button type="button" class="wl-btn-secondary" data-wl-share="print">' . esc_html( $this->t( 'Save as PDF' ) ) . '</button> ' .
			'<a class="wl-btn-secondary" data-wl-share="whatsapp" href="https://wa.me/" target="_blank" rel="noopener">' . esc_html( $this->t( 'Share on WhatsApp' ) ) . '</a> ' .
			'<button type="button" class="wl-btn-secondary" data-wl-share="copy">' . esc_html( $this->t( 'Copy link' ) ) . '</button>' .
			( $has_ur ? ' <button type="button" class="wl-btn-secondary wl-lang" data-wl-lang aria-pressed="false">Roman Urdu</button>' : '' ) .
			'<span class="wl-share-note" role="status" aria-live="polite"' . ( $this->ur ? ' data-ok="' . esc_attr( $this->t( 'Link copied.' ) ) . '"' : '' ) . '></span></div>';
		$config = array(
			'calc'    => $t['calc'],
			'module'  => $t['module'],
			'fields'  => array_map(
				static fn( $f ) => array_filter(
					array(
						'name'    => $f['name'],
						'label'   => $f['label'] ?? $f['name'],
						'unit'    => $f['unit'] ?? null,
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
			'msg'     => (object) ( $t['msg'] ?? array() ),
			'outputs' => array_map( static fn( $o ) => array_filter( array( 'key' => $o['key'], 'spec' => $o['spec'] ?? '2', 'yn' => $o['yn'] ?? null ) ), $t['outputs'] ),
			'how'     => $t['how']['tpl'] ?? '',
			'how_ur'  => $t['how']['tpl_ur'] ?? '',
			'h1'      => $this->page['h1'],
			'live'    => $t['live'] ?? '',
			'diagram' => $t['diagram'] ?? '',
			'rtable'  => isset( $t['rtable'] ) ? array( 'key' => $t['rtable']['key'], 'cap' => $t['rtable']['cap'], 'columns' => $t['rtable']['columns'] ) : '',
			'data'    => $this->tool_data( $t['data_keys'] ?? array(), $t['appliances'] ?? array() ),
		);
		$split = $split && ! $this->embed;
		$inputs = '<div class="wl-fields">' . $main . '</div>';
		if ( '' !== $adv ) {
			$inputs .= '<details class="wl-advanced"><summary>' . esc_html( $this->t( 'Advanced settings' ) ) . '</summary><div class="wl-fields">' . $adv . '</div></details>';
		}
		$inputs .= '<button type="submit" class="wl-btn">' . esc_html( $t['submit'] ?? 'Calculate' ) . '</button>';
		// Without JavaScript the button does nothing (onsubmit), instead of reloading the page with the defaults (audit WL-27).
		$inputs .= '<noscript><p class="wl-hint">' . esc_html( $this->ur ? $this->t( 'noscript' ) : 'Turn on JavaScript to calculate with your own numbers. The result ' . ( $this->embed ? 'above' : 'below' ) . ' uses the default inputs.' ) . '</p></noscript>';
		$notice  = (string) ( $t['notice'] ?? '' ); // a warning on the default result, same text the browser prints
		// An empty box waits for errors (role=alert); a notice on the default result is amber and polite (audit WL-54, WL-61).
		$out     = '' === $notice
			? '<p class="wl-error" id="' . esc_attr( $id ) . '-error" role="alert" hidden></p>'
			: '<p class="wl-error wl-notice" id="' . esc_attr( $id ) . '-error" role="status">' . esc_html( $notice ) . '</p>';
		// Split: the result table goes under the inputs, the result column is too narrow for it. The compact Next step
		// follows the share bar, so it sits right under the result on a phone (WL-198).
		$out    .= '<div class="wl-results" aria-live="polite">' . $results . '</div>' . $this->credit( $t ) . $this->legal( $t ) . ( $split ? '' : $this->rtable( $id, $t ) ) . $this->diagram( $t ) . $share . ( $home ? '' : $this->next_inline() );
		$class   = $split ? ( $home ? ' wl-tool-split' : ' wl-tool-list' ) : '';
		$form    = '<form class="wl-tool' . $class . '" id="' . esc_attr( $id ) . '" data-wl-tool novalidate onsubmit="return false">';
		if ( $split ) {
			$form .= '<div class="wl-in">' . $inputs . '</div><div class="wl-out"><p class="wl-out-title">' . esc_html( $home ? 'Your plan' : $this->t( 'Your result' ) ) . '</p>' . $out . '</div>' . $this->rtable( $id, $t );
		} else {
			$form .= $this->embed ? $out . $inputs : $inputs . $out;
		}
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
		$labels = array_column( $r['columns'], 'label' );
		foreach ( $r['rows'] as $row ) {
			$cells = '';
			foreach ( array_values( $row ) as $n => $v ) {
				$cells .= '<td data-l="' . esc_attr( $labels[ $n ] ?? '' ) . '"' . self::cell_class( (string) $v ) . '>' . str_replace( 'Rs ', 'Rs&nbsp;', esc_html( $v ) ) . '</td>';
			}
			// The recommended row is marked for the eye; the same rule runs in the browser (wattlyst-extra.js drawTable).
			$rows .= '<tr' . ( str_contains( (string) reset( $row ), '(recommended)' ) ? ' class="wl-rec"' : '' ) . '>' . $cells . '</tr>';
		}
		return '<div class="wl-rtable" data-wl-rtable><p class="wl-rtable-title" id="' . esc_attr( $cid ) . '">' . esc_html( $r['caption'] ) . '</p>' .
			'<div class="wl-table-wrap" role="region" tabindex="0" aria-labelledby="' . esc_attr( $cid ) . '"><table class="wl-table" aria-labelledby="' . esc_attr( $cid ) . '"><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></div>';
	}

	/** A net figure that reads "... saved" or "... cost" gets a colour class (same rule as wattlyst-extra.js). */
	private static function cell_class( string $v ): string {
		return str_ends_with( $v, ' saved' ) ? ' class="wl-good"' : ( str_ends_with( $v, ' cost' ) ? ' class="wl-bad"' : '' );
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
		// One group per category in order of first appearance, even where the data lists a category twice (WL-205).
		$groups = array();
		foreach ( $catalog as $a ) {
			$groups[ $a['category'] ][] = $a['id'];
		}
		return array_map( null, array_keys( $groups ), array_values( $groups ) );
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
		// N18: a new circuit starts with the last default row's cable length, so the first edit is not an error (WL-137).
		$defs  = $f['default'] ?? array();
		$last  = end( $defs ) ?: array();
		$tmpl  = '<template class="wl-loads-template">' . $this->loads_row( $fid, $f, -1, empty( $f['length'] ) || ! isset( $last['length'] ) ? array() : array( 'length' => $last['length'] ) ) . '</template>';
		return '<div class="wl-field wl-field-loads" data-wl-loads="' . esc_attr( $f['name'] ) . '"><span class="wl-label" id="' . esc_attr( $fid ) . '-label">' . esc_html( $f['label'] ?? 'Appliances' ) . '</span>' .
			'<div class="wl-table-wrap"><table class="wl-table wl-loads" aria-labelledby="' . esc_attr( $fid ) . '-label"><thead>' . $head . '</thead><tbody>' . $rows . '</tbody></table></div>' .
			'<button type="button" class="wl-btn-secondary wl-add-row">+ Add ' . ( empty( $f['length'] ) ? 'appliance' : 'circuit' ) . '</button>' . $hint . $tmpl . '</div>';
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
			$cell( 'watts', $watts, 'Watts' ) . ( empty( $f['start'] ) ? '' : $cell( 'start', isset( $row['start'] ) ? (string) $row['start'] : '', 'Starting watts', ' placeholder="auto"' ) ) . $cell( 'qty', $qty, 'Quantity', ' size="3"' ) . ( empty( $f['length'] ) ? $cell( 'hours', $hours, 'Hours a day', ' size="4"' ) : $cell( 'length', isset( $row['length'] ) ? (string) $row['length'] : '', 'Cable length in metres', ' size="4"' ) ) .
			'<td><button type="button" class="wl-remove-row" aria-label="Remove this ' . ( empty( $f['length'] ) ? 'appliance' : 'circuit' ) . '">&times;</button></td></tr>';
	}

	private function field( string $prefix, array $f ): string {
		if ( 'loads' === ( $f['type'] ?? '' ) ) {
			return $this->loads_field( $prefix, $f );
		}
		$fid   = $prefix . '-' . $f['name'];
		$unit  = isset( $f['unit'] ) ? ' <span class="wl-unit">(' . esc_html( $f['unit'] ) . ')</span>' : '';
		$hint  = isset( $f['hint'] ) ? '<p class="wl-hint" id="' . esc_attr( $fid ) . '-hint">' . self::linked( $f['hint'], $f['l'] ?? array() ) . '</p>' : '';
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

	private function how( bool $steps = false ): string {
		$how = $this->c['tool']['how'] ?? null;
		if ( ! $how ) {
			return '';
		}
		if ( ! $steps ) {
			// No Roman Urdu text yet: the heading says "(English)" while the Roman Urdu toggle is on (CSS, WL-225).
			return '<section class="wl-how' . ( empty( $how['tpl_ur'] ) && ! $this->ur ? ' wl-how-en' : '' ) . '"><h2>' . esc_html( $this->t( 'How this result was calculated' ) ) . '</h2><p data-wl-how>' . esc_html( $how['text'] ) . '</p></section>';
		}
		// Home: one sentence per step, the first three shown and the rest behind a toggle (all of it stays in the HTML);
		// the browser splits its live text the same way (wattlyst-extra.js drawTable).
		$li = implode( '', array_map( static fn( $x ) => '<li>' . esc_html( $x ) . '</li>', preg_split( '/(?<=\.)\s+(?=[A-Z])/u', $how['text'] ) ) );
		return '<section class="wl-how wl-how-steps"><h2>How this result was calculated</h2><input type="checkbox" id="wl-how-all" class="wl-tg"><ol data-wl-how data-wl-steps>' . $li . '</ol>' .
			'<label for="wl-how-all" class="wl-tg-l"><span>Show every step</span><span>Show fewer steps</span></label></section>';
	}

	/** Home: the dated data behind the plan and the setup prices (the home page has no Sources list). */
	private function data_used(): string {
		$items = '';
		foreach ( $this->c['tool']['data_checked'] ?? array() as $d ) {
			$items .= '<li>' . ( $d['url'] ? '<a href="' . esc_url( $d['url'] ) . '" rel="noopener">' . esc_html( $d['label'] ) . '</a>' : esc_html( $d['label'] ) ) . ' <span class="wl-du-d">checked <time datetime="' . esc_attr( $d['checked'] ) . '">' . esc_html( $this->date( $d['checked'] ) ) . '</time></span></li>';
		}
		return $items ? '<section class="wl-data-used"><h2>Data and prices used</h2><ul>' . $items . '</ul></section>' : '';
	}

	/** Key facts; with $show (home) only the first $show are open and the rest fold under "Show all" (still in the HTML). */
	private function key_facts( int $show = 0 ): string {
		if ( empty( $this->c['key_facts'] ) ) {
			return '';
		}
		$li   = static fn( array $k ) => implode( '', array_map( static fn( $x ) => '<li>' . esc_html( $x ) . '</li>', $k ) );
		$all  = $this->c['key_facts'];
		$more = $show && count( $all ) > $show ? array_slice( $all, $show ) : array();
		$fold = $more ? '<details class="wl-more"><summary>Show all ' . count( $all ) . ' key facts</summary><ul>' . $li( $more ) . '</ul></details>' : '';
		return '<section class="wl-facts"><h2>' . esc_html( $this->t( 'Key facts' ) ) . '</h2><ul>' . $li( $more ? array_slice( $all, 0, $show ) : $all ) . '</ul>' . $fold . '</section>';
	}

	private function formula(): string {
		$f = $this->c['formula'] ?? null;
		if ( ! $f ) {
			return '';
		}
		$lines = implode( '', array_map( static fn( $l ) => '<li>' . esc_html( $l ) . '</li>', $f['lines'] ) );
		return '<section class="wl-formula"><h2>' . esc_html( $this->t( 'Formula' ) ) . '</h2><p class="wl-eq"><code>' . esc_html( $f['text'] ) . '</code></p>' . ( $lines ? '<ul>' . $lines . '</ul>' : '' ) . '</section>';
	}

	/**
	 * Text sections; with $fold (home) only the first paragraph is open and the rest folds under "Read more". With $rest
	 * (hubs) the sections children() already printed as task groups are left out.
	 */
	private function sections( bool $fold = false, bool $rest = false ): string {
		$out  = '';
		$skip = $rest ? $this->groups()[0] : array();
		foreach ( $this->c['sections'] ?? array() as $i => $s ) {
			if ( isset( $skip[ $i ] ) ) {
				continue;
			}
			$out .= '<section><h2>' . esc_html( $s['h2'] ) . '</h2>';
			foreach ( $s['p'] as $n => $p ) {
				$out .= ( $fold && 1 === $n ? '<details class="wl-more"><summary>Read more</summary>' : '' ) . '<p>' . self::linked( $p, $s['l'][ $n ] ?? array() ) . '</p>';
			}
			$out .= ( $fold && count( $s['p'] ) > 1 ? '</details>' : '' ) . '</section>';
		}
		return $out;
	}

	/**
	 * Escaped text with its in-text links (WL-140): the build lists each link as t (anchor, already in the text) and
	 * u (a live page URL); the first match of each anchor after the previous link becomes <a href>. Only <a href> survives.
	 */
	public static function linked( string $text, array $links ): string {
		$out = esc_html( $text );
		$at  = 0;
		foreach ( $links as $l ) {
			$anchor = esc_html( (string) ( $l['t'] ?? '' ) );
			$pos    = '' === $anchor ? false : strpos( $out, $anchor, $at );
			if ( false === $pos ) {
				continue;
			}
			$tag = '<a href="' . esc_url( Wattlyst_Tools::link( (string) $l['u'] ) ) . '">' . $anchor . '</a>';
			$out = substr_replace( $out, $tag, $pos, strlen( $anchor ) );
			$at  = $pos + strlen( $tag );
		}
		return wp_kses( $out, array( 'a' => array( 'href' => true ) ) );
	}

	private function examples(): string {
		if ( empty( $this->c['examples'] ) ) {
			return '';
		}
		$out = '<section class="wl-examples"><h2>' . esc_html( $this->t( 'Worked examples' ) ) . '</h2>';
		foreach ( $this->c['examples'] as $ex ) {
			$out .= '<h3>' . esc_html( $ex['title'] ) . '</h3><p>' . self::linked( $ex['text'], $ex['l'] ?? array() ) . '</p>';
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
	private function ref_table( array $t, string $attrs = '', bool $stack = false ): string {
		$id   = 'wl-t' . ( ++$this->tables ) . '-' . substr( sanitize_title( $t['caption'] ), 0, 40 );
		$head = implode( '', array_map( static fn( $h ) => '<th scope="col">' . esc_html( $h ) . '</th>', $t['head'] ) );
		$rows = '';
		foreach ( $t['rows'] as $r ) {
			$cells = '';
			foreach ( array_values( $r ) as $n => $v ) {
				// A figure never breaks from its unit ("1,200 W", "Rs 300") in a narrow phone column (WL-81, WL-205).
				$v = preg_replace( '/(\d) (W|kW|kVA|kWh|A|V|Ah|mm²|units)(?![\w²])/u', '$1&nbsp;$2', str_replace( 'Rs ', 'Rs&nbsp;', esc_html( $v ) ) );
				// A table whose rows are named (appliance or set) heads each row with its name (WL-239); a stacked table
				// carries each column's name for its phone card (WL-202).
				$cells .= 0 === $n && ! empty( $t['row_head'] )
					? '<th scope="row">' . $v . '</th>'
					: '<td' . ( $stack ? ' data-l="' . esc_attr( $t['head'][ $n ] ?? '' ) . '"' : '' ) . '>' . $v . '</td>';
			}
			$rows .= '<tr>' . $cells . '</tr>';
		}
		// A table's scope note (error codes: models covered) sits under the short H2 and describes the table (WL-210).
		$note = empty( $t['note'] ) ? '' : '<p class="wl-hint" id="' . esc_attr( $id ) . '-n">' . esc_html( $t['note'] ) . '</p>';
		$desc = $note ? ' aria-describedby="' . esc_attr( $id ) . '-n"' : '';
		return '<section class="wl-ref' . ( $stack ? ' wl-stack' : '' ) . '"' . $attrs . '><h2 id="' . esc_attr( $id ) . '">' . esc_html( $t['caption'] ) . '</h2>' . $note .
			'<div class="wl-table-wrap" role="region" tabindex="0" aria-labelledby="' . esc_attr( $id ) . '"><table class="wl-table" aria-labelledby="' . esc_attr( $id ) . '"' . $desc . '><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></section>';
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
			'<div class="wl-field"><label for="' . esc_attr( $id ) . '-q">' . esc_html( $l['text_label'] ) . '</label><input type="search" id="' . esc_attr( $id ) . '-q" data-wl-filter autocomplete="off" placeholder="For example 02, 1010, F03, grid"><p class="wl-hint">Type the code as the display shows it, or a word such as battery, fan or grid. ' . esc_html( (string) $l['count'] ) . ' codes from manufacturer manuals, last checked <time datetime="' . esc_attr( $l['checked'] ) . '">' . esc_html( $this->date( $l['checked'] ) ) . '</time>.</p></div>' .
			'</div><p class="wl-error wl-notice" data-wl-nomatch role="status" hidden>No code matches. Check the brand, or try a shorter text such as the code alone.</p>' .
			// While a filter is on: how many codes match and a jump to the first one, which sits below the page text (WL-202).
			'<p class="wl-lookup-count" data-wl-count role="status" hidden><span></span> <a href="#">Show the matches</a></p>' . $this->next_inline() . '</form>';
	}

	private function tables(): string {
		$out = '';
		foreach ( $this->c['tables'] ?? array() as $t ) {
			$out .= isset( $t['key'] ) ? $this->ref_table( $t, ' data-wl-group="' . esc_attr( $t['key'] ) . '"', true ) : $this->ref_table( $t );
		}
		return $out;
	}

	private function download(): string {
		$d = $this->c['download'] ?? null;
		if ( ! $d ) {
			return '';
		}
		return '<p class="wl-download"><a class="wl-btn-secondary" href="' . esc_url( Wattlyst_Tools::link( $d['url'] ) ) . '" download>' . esc_html( $d['label'] ) . '</a> <span>Data checked <time datetime="' . esc_attr( $d['checked'] ) . '">' . esc_html( $this->date( $d['checked'] ) ) . '</time>. ' . esc_html( $d['license'] ) . '.</span></p>';
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
				'<p><a href="' . esc_url( Wattlyst_Tools::link( $e['url'] ) ) . '">Open the full ' . esc_html( $e['h1'] ) . '</a></p>' .
				// The script code first: it fits the frame to the calculator; the iframe code has a fixed height (WL-238).
				'<label for="' . esc_attr( $id ) . '-script">Script code (recommended, resizes itself)</label><textarea id="' . esc_attr( $id ) . '-script" readonly rows="3">' . esc_textarea( $e['script'] ) . '</textarea>' .
				'<button type="button" class="wl-btn-secondary" data-wl-copy="' . esc_attr( $id ) . '-script">Copy script code</button>' .
				'<label for="' . esc_attr( $id ) . '-iframe">Iframe code (fixed height, for editors that strip scripts)</label><textarea id="' . esc_attr( $id ) . '-iframe" readonly rows="4">' . esc_textarea( $e['iframe'] ) . '</textarea>' .
				'<button type="button" class="wl-btn-secondary" data-wl-copy="' . esc_attr( $id ) . '-iframe">Copy iframe code</button></details>';
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
		$site        = $this->plugin->site();
		$this->embed = true;
		return '<div class="wl-page wl-embedded"><p class="wl-embed-title"><strong>' . esc_html( $this->page['h1'] ) . '</strong></p>' . $this->tool() . $this->how() .
			'<p class="wl-credit"><a href="' . esc_url( Wattlyst_Tools::link( $this->page['url'] ) ) . '" target="_blank" rel="noopener">Calculator by ' . esc_html( $site['brand'] ?? 'Wattlyst' ) . '</a></p></div>';
	}

	/** Home page: "What do you want to do?" task cards, one per live hub, each listing its live tools. */
	private function cards(): string {
		$cards = '';
		foreach ( $this->page['cards'] ?? array() as $card ) {
			$items = array();
			foreach ( $card['children'] as $ch ) {
				$items[] = '<li><a href="' . esc_url( Wattlyst_Tools::link( $ch['url'] ) ) . '"><span>' . esc_html( $ch['h1'] ) . '</span></a></li>';
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
			$cards .= '<div class="wl-card wl-card-' . $slug . '"><div class="wl-card-top"><span class="wl-ico" aria-hidden="true"></span><span class="wl-count">' . esc_html( $this->tools_label( $card['children'] ) ) . '</span></div>' .
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
		$out = '<section class="wl-mistakes"><h2>' . esc_html( $this->t( 'Common mistakes' ) ) . '</h2>';
		if ( $m ) {
			$out .= '<ul>' . implode( '', array_map( static fn( $x ) => '<li>' . esc_html( $x ) . '</li>', $m ) ) . '</ul>';
		}
		if ( $s ) {
			$out .= '<p class="wl-safety"><strong>' . esc_html( $this->t( 'Safety:' ) ) . '</strong> ' . esc_html( $s ) . '</p>';
		}
		return $out . '</section>';
	}

	/** FAQ; $fold (home) shows each answer under its question as an open/close row, the first one open. */
	private function faq( bool $fold = false ): string {
		if ( empty( $this->c['faq'] ) ) {
			return '';
		}
		$out = '<section class="wl-faq' . ( $fold ? ' wl-faq-fold' : '' ) . '"><h2>' . esc_html( $this->t( 'Frequently asked questions' ) ) . '</h2>';
		foreach ( $this->c['faq'] as $i => $f ) {
			$out .= $fold
				? '<details class="wl-qa"' . ( 0 === $i ? ' open' : '' ) . '><summary><h3>' . esc_html( $f['q'] ) . '</h3></summary><p>' . self::linked( $f['a'], $f['l'] ?? array() ) . '</p></details>'
				: '<h3>' . esc_html( $f['q'] ) . '</h3><p>' . self::linked( $f['a'], $f['l'] ?? array() ) . '</p>';
		}
		return $out . '</section>';
	}

	/** Data licence credit under a live-data result (N6 Open-Meteo, CC BY 4.0, WL-240). */
	private function credit( array $t ): string {
		$c = $t['credit'] ?? null;
		if ( ! $c ) {
			return '';
		}
		return sprintf(
			'<p class="wl-hint wl-credit">Weather data by <a href="%1$s">%2$s</a>, licensed under <a href="%3$s" rel="license">%4$s</a>.</p>',
			esc_url( $c['by_url'] ),
			esc_html( $c['by'] ),
			esc_url( $c['licence_url'] ),
			esc_html( $c['licence'] )
		);
	}

	/** Bill calculators: the result is an estimate, not an official bill or evidence, and where to complain (content/bill-note.json). */
	private function legal( array $t ): string {
		$n = $t['legal'] ?? null;
		if ( ! $n ) {
			return '';
		}
		$out = esc_html( (string) $n['t'] );
		$at  = 0;
		foreach ( $n['l'] ?? array() as $l ) {
			$anchor = esc_html( (string) $l['t'] );
			$pos    = strpos( $out, $anchor, $at );
			if ( false === $pos ) {
				continue;
			}
			$tag = '<a href="' . esc_url( (string) $l['u'] ) . '" rel="noopener" target="_blank">' . $anchor . '</a>';
			$out = substr_replace( $out, $tag, $pos, strlen( $anchor ) );
			$at  = $pos + strlen( $tag );
		}
		return '<p class="wl-hint wl-legal">' . wp_kses( $out, array( 'a' => array( 'href' => true, 'rel' => true, 'target' => true ) ) ) . '</p>';
	}

	/** A manifest row by id, only when its page is live, so a page never links to a URL that does not exist yet. */
	private function live_row( $id ): ?array {
		$r = '' !== (string) $id ? $this->plugin->row( (string) $id ) : null;
		return $r && ! empty( $r['live'] ) ? $r : null;
	}

	private static function link_to( array $r, bool $anchor = false ): string {
		return '<a href="' . esc_url( Wattlyst_Tools::link( $r['url'] ) ) . '">' . esc_html( $anchor && ! empty( $r['anchor'] ) ? ucfirst( $r['anchor'] ) : $r['h1'] ) . '</a>';
	}

	/**
	 * The page's Next step and its first two related tools, right under the result (WL-198). The full Related list stays
	 * at the bottom; these links are plain HTML, so a recalculation or a shared ?load= link never changes them.
	 */
	private function next_inline(): string {
		if ( $this->embed ) {
			return '';
		}
		$next = $this->live_row( $this->page['next'] ?? '' );
		$more = array();
		foreach ( $this->page['related'] ?? array() as $rid ) {
			$r = $rid !== ( $this->page['next'] ?? '' ) ? $this->live_row( $rid ) : null;
			if ( $r && count( $more ) < 2 ) {
				$more[] = '<li>' . self::link_to( $r ) . '</li>';
			}
		}
		if ( ! $next && ! $more ) {
			return '';
		}
		return '<nav class="wl-next-inline" aria-label="' . esc_attr( $this->t( 'Next step' ) ) . '">' . ( $next ? '<p><strong>' . esc_html( $this->t( 'Next step:' ) ) . '</strong> ' . self::link_to( $next ) . '</p>' : '' ) .
			( $more ? '<ul>' . implode( '', $more ) . '</ul>' : '' ) . '</nav>';
	}

	private function related(): string {
		$links = array();
		$next  = $this->live_row( $this->page['next'] ?? '' );
		if ( $next ) {
			$links[] = '<li class="wl-next"><strong>' . esc_html( $this->t( 'Next step:' ) ) . '</strong> ' . self::link_to( $next, true ) . '</li>';
		}
		foreach ( $this->page['related'] ?? array() as $rid ) {
			$r = $this->live_row( $rid );
			if ( $r ) {
				// The Next step box above already links these pages by their H1, so this list uses the page's own anchor (WL-211).
				$links[] = '<li>' . self::link_to( $r, true ) . '</li>';
			}
		}
		$parent = ! empty( $this->page['parent'] ) ? $this->plugin->row( $this->page['parent'] ) : null;
		if ( $parent && ! empty( $parent['live'] ) ) {
			// "All battery and UPS calculators": lower-case the words, keep abbreviations such as UPS and DISCO.
			$name    = $this->ur ? str_replace( '{h}', (string) $parent['h1'], $this->t( 'All {h}' ) ) : 'All ' . preg_replace_callback( '/\b[A-Z][a-z]+\b/', static fn( $m ) => strtolower( $m[0] ), (string) $parent['h1'] );
			$links[] = '<li><a href="' . esc_url( Wattlyst_Tools::link( $parent['url'] ) ) . '">' . esc_html( $name ) . '</a></li>';
		}
		return $links ? '<section class="wl-related"><h2>' . esc_html( $this->t( 'Related calculators' ) ) . '</h2><ul>' . implode( '', $links ) . '</ul></section>' : '';
	}

	/**
	 * Hub task groups (WL-200): a section that links this hub's live pages owns those pages (first link wins, in link
	 * order). Returns [ section index => rows, rows no section names ].
	 */
	private function groups(): array {
		$kids = array();
		foreach ( $this->page['children'] ?? array() as $cid ) {
			$r = $this->live_row( $cid );
			if ( $r ) {
				$kids[ $r['url'] ] = $r;
			}
		}
		$groups = array();
		$used   = array();
		foreach ( $this->c['sections'] ?? array() as $i => $s ) {
			foreach ( $s['l'] ?? array() as $para ) {
				foreach ( $para as $l ) {
					$u = (string) ( $l['u'] ?? '' );
					if ( isset( $kids[ $u ] ) && ! isset( $used[ $u ] ) ) {
						$groups[ $i ][] = $kids[ $u ];
						$used[ $u ]     = true;
					}
				}
			}
		}
		return array( $groups, array_values( array_diff_key( $kids, $used ) ) );
	}

	/** Hub page: one H2 per task with its text and its calculators as cards, then the pages no task names. */
	private function children(): string {
		$cards = static function ( array $rows ): string {
			$items = '';
			foreach ( $rows as $r ) {
				$items .= '<li>' . self::link_to( $r ) . '<p>' . esc_html( $r['meta'] ) . '</p></li>';
			}
			return '<ul class="wl-children">' . $items . '</ul>';
		};
		[ $groups, $rest ] = $this->groups();
		$out               = '';
		foreach ( $groups as $i => $rows ) {
			$s    = $this->c['sections'][ $i ];
			$out .= '<section class="wl-group"><h2>' . esc_html( $s['h2'] ) . '</h2>';
			foreach ( $s['p'] as $n => $p ) {
				$out .= '<p>' . self::linked( $p, $s['l'][ $n ] ?? array() ) . '</p>';
			}
			$out .= $cards( $rows ) . '</section>';
		}
		if ( $rest ) {
			$out .= '<section class="wl-group"><h2>' . esc_html( $this->ur ? str_replace( '{h}', $this->page['h1'], $this->t( $groups ? 'More {h}' : 'All {h}' ) ) : ( $groups ? 'More ' : 'All ' ) . $this->page['h1'] ) . '</h2>' . $cards( $rest ) . '</section>';
		}
		return $out;
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
			$review = esc_html( $this->t( 'Technically reviewed by' ) ) . ' ' . $rname . ', ' . esc_html( $rev['credential'] ?? '' ) . '.';
		} else {
			$review = esc_html( $this->t( 'Technical review by a PEC-registered electrical engineer is in progress.' ) );
		}
		// Urdu page: the Urdu role names and bio line of content/ur/ui.json (author_roles, author_bio), the person's own facts.
		$roles = $this->ur ? $this->t( 'author_roles' ) : implode( ' and ', $author['roles'] ) . ' of ' . ( $site['brand'] ?? '' );
		$bio   = $this->ur ? $this->t( 'author_bio' ) : (string) ( $author['short_bio'] ?? '' );
		return '<aside class="wl-author" aria-label="' . esc_attr( $this->t( 'About this page' ) ) . '"><p><strong>' . esc_html( $this->t( 'Written by' ) ) . '</strong> ' . $name . ', ' . esc_html( $roles ) . '.' . ( '' === $bio ? '' : ' ' . esc_html( $bio ) ) . '</p><p>' . $review . ' <a href="' . esc_url( Wattlyst_Tools::link( '/methodology/' ) ) . '">' . esc_html( $this->t( 'How we calculate' ) ) . '</a>.</p></aside>';
	}

	private function sources(): string {
		$items = '';
		foreach ( $this->c['sources'] ?? array() as $s ) {
			$url    = str_starts_with( $s['url'], '/' ) ? Wattlyst_Tools::link( $s['url'] ) : $s['url'];
			$items .= '<li><a href="' . esc_url( $url ) . '"' . ( str_starts_with( $s['url'], '/' ) ? '' : ' rel="noopener"' ) . '>' . esc_html( $s['label'] ) . '</a></li>';
		}
		foreach ( $this->c['tool']['data_checked'] ?? array() as $d ) {
			$items .= '<li>' . ( $d['url'] ? '<a href="' . esc_url( $d['url'] ) . '" rel="noopener">' . esc_html( $d['label'] ) . '</a>' : esc_html( $d['label'] ) ) . ', ' . esc_html( $this->t( 'last checked' ) ) . ' <time datetime="' . esc_attr( $d['checked'] ) . '">' . esc_html( $this->date( $d['checked'] ) ) . '</time></li>';
		}
		$out = $items ? '<section class="wl-sources"><h2>' . esc_html( $this->t( 'Sources' ) ) . '</h2><ul>' . $items . '</ul></section>' : '';
		return $out . $this->dates();
	}

	/** "Last reviewed" once signed off, else "Last updated" (WL-214); a hub changes when a page in it changes (WL-142). */
	private function dates(): string {
		$when = $this->when();
		if ( ! $when ) {
			return '';
		}
		return '<p class="wl-dates">' . esc_html( $this->t( 'Last ' . strtolower( $when[0] ) ) ) . ': <time datetime="' . esc_attr( $when[1] ) . '">' . esc_html( $this->date( $when[1] ) ) . '</time></p>';
	}

	/** "21 October 2026"; on an Urdu page the month in Urdu (content/ur/ui.json), the digits as they are. */
	private function date( string $ymd ): string {
		$ts = strtotime( $ymd . ' 12:00:00 UTC' );
		if ( ! $ts ) {
			return $ymd;
		}
		return $this->ur ? gmdate( 'j', $ts ) . ' ' . $this->t( gmdate( 'F', $ts ) ) . ' ' . gmdate( 'Y', $ts ) : gmdate( 'j F Y', $ts );
	}
}
