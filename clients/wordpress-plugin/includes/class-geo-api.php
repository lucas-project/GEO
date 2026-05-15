<?php
/**
 * Thin HTTP wrapper around the GEO AI OS REST API.
 */

if (!defined('ABSPATH')) {
    exit;
}

class GEO_AI_OS_API
{
    public static function base_url()
    {
        return rtrim((string) get_option('geo_ai_os_api_url', 'http://localhost:3000'), '/');
    }

    public static function post($path, $body)
    {
        $response = wp_remote_post(self::base_url() . $path, [
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode($body),
            'timeout' => 30,
        ]);
        return self::parse($response);
    }

    public static function get($path)
    {
        $response = wp_remote_get(self::base_url() . $path, ['timeout' => 30]);
        return self::parse($response);
    }

    private static function parse($response)
    {
        if (is_wp_error($response)) {
            return new WP_Error('geo_api_error', $response->get_error_message());
        }
        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $decoded = json_decode($body, true);
        if ($code >= 200 && $code < 300) {
            return $decoded;
        }
        $message = is_array($decoded) && isset($decoded['error']) ? $decoded['error'] : ('HTTP ' . $code);
        return new WP_Error('geo_api_error', $message);
    }

    public static function run_audit($url)
    {
        $resp = self::post('/api/geo-audit', ['url' => $url]);
        if (is_wp_error($resp)) {
            return $resp;
        }
        $job_id = $resp['jobId'] ?? null;
        if (!$job_id) {
            return new WP_Error('geo_api_error', 'No jobId returned');
        }
        $deadline = time() + 90;
        while (time() < $deadline) {
            sleep(2);
            $job_resp = self::get('/api/jobs/' . rawurlencode($job_id));
            if (is_wp_error($job_resp)) {
                return $job_resp;
            }
            $job = $job_resp['job'] ?? null;
            if (!$job) {
                continue;
            }
            if ($job['status'] === 'completed') {
                $audit_id = $job['result']['auditId'] ?? null;
                if (!$audit_id) {
                    return new WP_Error('geo_api_error', 'No auditId in result');
                }
                $audit_resp = self::get('/api/geo-audit/' . rawurlencode($audit_id));
                if (is_wp_error($audit_resp)) {
                    return $audit_resp;
                }
                return $audit_resp['audit'];
            }
            if ($job['status'] === 'failed' || $job['status'] === 'cancelled') {
                return new WP_Error('geo_api_error', $job['error'] ?? 'Job failed');
            }
        }
        return new WP_Error('geo_api_error', 'Timed out waiting for audit');
    }

    public static function generate_artifact($audit_id, $type)
    {
        $resp = self::post('/api/auto-fix', [
            'auditId' => $audit_id,
            'type'    => $type,
        ]);
        if (is_wp_error($resp)) {
            return $resp;
        }
        return $resp['artifact'] ?? null;
    }
}
