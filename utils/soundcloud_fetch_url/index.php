<?php

require '../include/referrer_check.php';
require '../include/SC_API_KEY.php';
require '../include/API_cache.php';

  $track_id = intval($_GET['id']);

  $ZOMG_SECRET = get_soundcloud_api_key();

  $cache_file = 'soundcloud_track_id_' . $track_id . '.json';

  $js_callback = 'wheelsofsteel.soundcloudURL_' . $track_id;

  $api_call = 'http://api.soundcloud.com/tracks/' . $track_id . '/stream/?client_id=' . $ZOMG_SECRET . '&format=json&callback=' . $js_callback;

function get_web_page($url) {

    /*
     * hat tip: http://forums.devshed.com/php-development-5/curl-get-final-url-after-inital-url-redirects-544144.html
    */

    $options = array( 
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_RETURNTRANSFER => false,     // return web page 
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => true,
        CURLOPT_CONNECTTIMEOUT => 5,        // timeout on connect 
        CURLOPT_TIMEOUT        => 5,        // timeout on response 
        CURLOPT_MAXREDIRS      => 10,       // stop after 10 redirects
        CURLOPT_RETURNTRANSFER => true,     // return web page 
    ); 

    $ch      = curl_init( $url ); 
    curl_setopt_array( $ch, $options );
    $content = curl_exec( $ch );
    $err     = curl_errno( $ch );
    $errmsg  = curl_error( $ch );
    $header  = curl_getinfo( $ch );
    curl_close( $ch );

    return $header;

}  

$myUrlInfo = get_web_page($api_call);

echo "try{\n " . $js_callback . "({ url: '" . $myUrlInfo["url"] . "' });\n} catch(e){}";

?>