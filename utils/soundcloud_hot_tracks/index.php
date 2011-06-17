<?php

require '../include/referrer_check.php';
require '../include/SC_API_KEY.php';
require '../include/API_cache.php';

  $ZOMG_SECRET = get_soundcloud_api_key();

  $cache_file = 'soundcloud_top_ten.json';
  $api_call = 'http://api.soundcloud.com/tracks?order=hotness&limit=10&client_id=' . $ZOMG_SECRET . '&format=json&callback=wheelsofsteel.soundcloudTopTen';
  $cache_for = 480; // cache results for "n" minutes

  $api_cache = new API_cache ($api_call, $cache_for, $cache_file);
  if (!$res = $api_cache->get_api_cache())
    $res = '{"error": "Could not load cache"}';

  ob_start();
  echo $res;
  $json_body = ob_get_clean();

  header ('Content-Type: application/json');
  header ('Content-length: ' . strlen($json_body));
  header ("Expires: " . $api_cache->get_expires_datetime());
  echo $json_body;

?>