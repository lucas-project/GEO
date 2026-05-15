<?php
/**
 * Plugin Name:       GEO AI OS
 * Plugin URI:        https://github.com/geo-ai-os
 * Description:       Generative Engine Optimization for the AI Search era. Audit your site for AI visibility and inject FAQ schema, AI summaries, and llms.txt with one click.
 * Version:           0.1.0
 * Author:            GEO AI OS
 * License:           MIT
 * Text Domain:       geo-ai-os
 * Requires at least: 6.0
 * Requires PHP:      7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('GEO_AI_OS_VERSION', '0.1.0');
define('GEO_AI_OS_PATH', plugin_dir_path(__FILE__));

require_once GEO_AI_OS_PATH . 'includes/class-geo-api.php';
require_once GEO_AI_OS_PATH . 'includes/class-geo-admin.php';
require_once GEO_AI_OS_PATH . 'includes/class-geo-schema-injector.php';

add_action('plugins_loaded', function () {
    GEO_AI_OS_Admin::register();
    GEO_AI_OS_Schema_Injector::register();
});

register_activation_hook(__FILE__, function () {
    if (get_option('geo_ai_os_api_url') === false) {
        add_option('geo_ai_os_api_url', 'http://localhost:3000');
    }
});
