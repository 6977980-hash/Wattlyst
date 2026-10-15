#!/usr/bin/env bash
# Throwaway local WordPress (SQLite + GeneratePress) with this plugin linked in, for Lighthouse and
# template checks. Usage: tools/wp-test-site.sh <empty-dir> [port]   (needs php 8+, curl, unzip)
set -euo pipefail
DIR=$(realpath -m "$1"); PORT=${2:-8080}; REPO=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$DIR/dl" && cd "$DIR/dl"
curl -sSL -o wp.zip https://wordpress.org/latest.zip
curl -sSL -o sqlite.zip https://downloads.wordpress.org/plugin/sqlite-database-integration.zip
curl -sSL -o gp.zip https://downloads.wordpress.org/theme/generatepress.zip
curl -sSL -o wp-cli.phar https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
cd "$DIR" && unzip -q dl/wp.zip
W="$DIR/wordpress"
unzip -q dl/sqlite.zip -d "$W/wp-content/plugins/" && unzip -q dl/gp.zip -d "$W/wp-content/themes/"
sed -e "s#{SQLITE_IMPLEMENTATION_FOLDER_PATH}#$W/wp-content/plugins/sqlite-database-integration#" -e "s#{SQLITE_PLUGIN}#sqlite-database-integration/load.php#" \
  "$W/wp-content/plugins/sqlite-database-integration/db.copy" > "$W/wp-content/db.php"
ln -s "$REPO" "$W/wp-content/plugins/wattlyst-tools"
cat > "$DIR/router.php" <<PHP
<?php
\$p = '$W' . parse_url(\$_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (substr(\$p, -1) !== '/' && file_exists(\$p) && !is_dir(\$p)) return false;
\$_SERVER['SCRIPT_NAME'] = '/index.php';
require '$W/index.php';
PHP
WP="php $DIR/dl/wp-cli.phar --allow-root --path=$W"
$WP config create --dbname=wp --dbuser=x --dbpass=x --skip-check >/dev/null
# PHP's built-in server handles one request at a time, so WP-Cron's loopback request (the cache warm-up fetches
# pages from the same server) would block it. WP-CLI below runs the page sync instead.
$WP config set DISABLE_WP_CRON true --raw >/dev/null
$WP core install --url="http://127.0.0.1:$PORT" --title=Wattlyst --admin_user=admin --admin_password="$(openssl rand -hex 12)" --admin_email=test@example.com --skip-email >/dev/null
$WP theme activate generatepress >/dev/null
$WP rewrite structure '/%postname%/' >/dev/null
$WP plugin activate wattlyst-tools >/dev/null
(cd "$W" && nohup php -S "127.0.0.1:$PORT" "$DIR/router.php" > "$DIR/php.log" 2>&1 &)
sleep 1
$WP eval 'echo "";' >/dev/null   # WP-CLI runs the page sync at once (visitor requests only schedule it)
curl -s "http://127.0.0.1:$PORT/" > /dev/null
echo "WordPress test site on http://127.0.0.1:$PORT"
