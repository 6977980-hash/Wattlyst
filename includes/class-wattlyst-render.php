<?php
/**
 * HTML for one generated page. Templates: tool, appliance (tool + appliance facts), guide, pillar, trust.
 * Section order follows specs/seo-rules.md section 3. All text arrives pre-rendered from generated/;
 * this class only escapes and arranges it.
 */

defined( 'ABSPATH' ) || exit;

final class Wattlyst_Render {

	private Wattlyst_Tools $plugin;
	private array $page;
	private array $c;

	public function __construct( Wattlyst_Tools $plugin, array $page ) {
		$this->plugin = $plugin;
		$this->page   = $page;
		$this->c      = is_array( $page['content'] ?? null ) ? $page['content'] : array();
	}

	public function html(): string {
		$type = $this->page['type'];
		$out  = '<div class="wl-page wl-type-' . esc_attr( $type ) . '">';
		$out .= $this->breadcrumb();
		$out .= '<h1 class="wl-h1">' . esc_html( $this->page['h1'] ) . '</h1>';

		if ( 'trust' === $type ) {
			$out .= wp_kses_post( $this->c['html'] ?? '' );
			$out .= $this->dates();
		} elseif ( 'home' === $type ) {
			$out .= $this->answer( $this->c['answer'] ?? $this->page['meta'] );
			if ( ! empty( $this->c['tool'] ) ) { // Home Power Planner (Phase 4)
				$out .= $this->tool();
				$out .= $this->how();
			}
			$out .= $this->cards();
			$out .= $this->key_facts();
			$out .= $this->sections();
			$out .= $this->faq();
			$out .= $this->author_box();
			$out .= $this->dates();
		} elseif ( 'lookup' === $type ) {
			$out .= $this->answer( $this->c['answer'] ?? '' );
			$out .= $this->lookup();
			$out .= $this->key_facts();
			$out .= $this->sections();
			$out .= $this->tables();
			$out .= $this->mistakes();
			$out .= $this->faq();
			$out .= $this->related();
			$out .= $this->author_box();
			$out .= $this->sources();
		} elseif ( 'pillar' === $type ) {
			$out .= $this->answer( ( $this->c['answer'] ?? '' ) ?: ( $this->c['intro'] ?? '' ) ?: $this->page['meta'] );
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
			$out .= $this->answer( $this->c['answer'] ?? '' );
			if ( ! empty( $this->c['tool'] ) ) {
				$out .= $this->tool();
				$out .= $this->how();
			}
			$out .= $this->key_facts();
			$out .= Wattlyst_Ads::slot( 'content-1', $this->plugin->site() );
			$out .= $this->formula();
			$out .= $this->sections();
			$out .= $this->examples();
			$out .= $this->table();
			$out .= $this->tables();
			$out .= $this->mistakes();
			$out .= Wattlyst_Ads::slot( 'content-2', $this->plugin->site() );
			$out .= $this->faq();
			$out .= $this->related();
			$out .= $this->author_box();
			$out .= $this->sources();
		}
		return $out . '</div>';
	}

	/* ------------------------------------------------------------ pieces */

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

	private function answer( string $text ): string {
		return '' === $text ? '' : '<p class="wl-answer">' . esc_html( $text ) . '</p>';
	}

	private function tool(): string {
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
						'catalog' => $f['catalog'] ?? null,
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
			'data'    => $this->tool_data( $t['data_keys'] ?? array(), $t['appliances'] ?? array() ),
		);
		$form  = '<form class="wl-tool" id="' . esc_attr( $id ) . '" data-wl-tool novalidate>';
		$form .= '<div class="wl-fields">' . $main . '</div>';
		if ( '' !== $adv ) {
			$form .= '<details class="wl-advanced"><summary>Advanced settings</summary><div class="wl-fields">' . $adv . '</div></details>';
		}
		$form .= '<button type="submit" class="wl-btn">' . esc_html( $t['submit'] ?? 'Calculate' ) . '</button>';
		$form .= '<p class="wl-error" id="' . esc_attr( $id ) . '-error" role="alert" hidden></p>';
		$form .= '<div class="wl-results" aria-live="polite">' . $results . '</div>' . $share;
		$form .= '<script type="application/json" class="wl-config">' . wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP ) . '</script>';
		$form .= '</form>';
		return $form;
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
	 * Appliance list: one row per load (appliance, watts, quantity, hours a day) with add/remove buttons.
	 * Default rows are rendered server-side so the default result and the form agree before JavaScript runs.
	 */
	private function loads_field( string $prefix, array $f ): string {
		$fid   = $prefix . '-' . $f['name'];
		$hint  = isset( $f['hint'] ) ? '<p class="wl-hint" id="' . esc_attr( $fid ) . '-hint">' . esc_html( $f['hint'] ) . '</p>' : '';
		$rows  = '';
		foreach ( $f['default'] ?? array() as $n => $row ) {
			$rows .= $this->loads_row( $fid, $f, (int) $n, $row );
		}
		$head  = '<tr><th scope="col">Appliance</th><th scope="col">Watts</th><th scope="col">Qty</th><th scope="col">Hours a day</th><th scope="col"><span class="screen-reader-text">Remove</span></th></tr>';
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
			$cell( 'watts', $watts, 'Watts' ) . $cell( 'qty', $qty, 'Quantity', ' size="3"' ) . $cell( 'hours', $hours, 'Hours a day', ' size="4"' ) .
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
		if ( ! $t ) {
			return '';
		}
		$head = implode( '', array_map( static fn( $h ) => '<th scope="col">' . esc_html( $h ) . '</th>', $t['head'] ) );
		$rows = '';
		foreach ( $t['rows'] as $r ) {
			$rows .= '<tr>' . implode( '', array_map( static fn( $v ) => '<td>' . esc_html( $v ) . '</td>', $r ) ) . '</tr>';
		}
		return '<section class="wl-ref"><h2>' . esc_html( $t['caption'] ) . '</h2><div class="wl-table-wrap"><table class="wl-table"><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></section>';
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
			'</div><p class="wl-error" data-wl-nomatch hidden>No code matches. Check the brand, try a shorter text, or look at the full table below.</p></form>';
	}

	private function tables(): string {
		$out = '';
		foreach ( $this->c['tables'] ?? array() as $t ) {
			$head = implode( '', array_map( static fn( $h ) => '<th scope="col">' . esc_html( $h ) . '</th>', $t['head'] ) );
			$rows = '';
			foreach ( $t['rows'] as $r ) {
				$rows .= '<tr>' . implode( '', array_map( static fn( $v ) => '<td>' . esc_html( $v ) . '</td>', $r ) ) . '</tr>';
			}
			$group = isset( $t['key'] ) ? ' data-wl-group="' . esc_attr( $t['key'] ) . '"' : '';
			$out .= '<section class="wl-ref"' . $group . '><h2>' . esc_html( $t['caption'] ) . '</h2><div class="wl-table-wrap"><table class="wl-table"><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div></section>';
		}
		return $out;
	}

	/** Home page: "What do you want to do?" task cards, one per live hub, each listing its live tools. */
	private function cards(): string {
		$cards = '';
		foreach ( $this->page['cards'] ?? array() as $card ) {
			$links = '';
			foreach ( $card['children'] as $ch ) {
				$links .= '<li><a href="' . esc_url( Wattlyst_Tools::link( $ch['url'] ) ) . '">' . esc_html( $ch['h1'] ) . '</a></li>';
			}
			$cards .= '<div class="wl-card"><h2><a href="' . esc_url( Wattlyst_Tools::link( $card['url'] ) ) . '">' . esc_html( $card['label'] ) . '</a></h2><p>' . esc_html( $card['meta'] ) . '</p>' . ( $links ? '<ul>' . $links . '</ul>' : '' ) . '</div>';
		}
		return $cards ? '<section class="wl-cards" aria-label="Tools by task">' . $cards . '</section>' : '';
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

	private function faq(): string {
		if ( empty( $this->c['faq'] ) ) {
			return '';
		}
		$out = '<section class="wl-faq"><h2>Frequently asked questions</h2>';
		foreach ( $this->c['faq'] as $f ) {
			$out .= '<h3>' . esc_html( $f['q'] ) . '</h3><p>' . esc_html( $f['a'] ) . '</p>';
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
		$author = null;
		foreach ( $site['people'] ?? array() as $p ) {
			if ( $p['id'] === ( $this->page['author'] ?? '' ) ) {
				$author = $p;
			}
		}
		$author = $author ?? ( $site['people'][0] ?? null );
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
