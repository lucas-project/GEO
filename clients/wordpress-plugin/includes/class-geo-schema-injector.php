<?php
/**
 * Schema injector — emits any stored GEO-generated artifacts into <head>.
 *
 * Currently wires FAQ JSON-LD only. TODOs document the next steps.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GEO_AI_OS_Schema_Injector
{
    public static function register()
    {
        add_action('wp_head', [__CLASS__, 'inject'], 99);
    }

    public static function inject()
    {
        $faq = get_option('geo_ai_os_injected_faq_schema', '');
        if (!empty($faq)) {
            echo "\n<!-- GEO AI OS — FAQ JSON-LD -->\n";
            echo $faq . "\n"; // already wrapped in <script> tags by the backend
        }

        // TODO Phase 3: also auto-inject llms.txt (served as /llms.txt via a rewrite rule),
        // AI summary blocks (filter the_content), and answer-first rewrites (the_content filter).
    }
}
