<?php

exit; // JUST DOWNLOADED? REMOVE THIS LINE TO MAKE PHP THINGS WORK. :)

// security theater: stop errors, and prevent basic cross-domain use.

error_reporting(0); // nein.

$referrer = $_SERVER['HTTP_REFERER'];
$domain = '';
$host = $_SERVER['HTTP_HOST'];

if ($host && $referrer) {

  $domain = parse_url($referrer);
  $referrer_host = '';

  if ($domain['host']) {
    $referrer_host = $domain['host'];
  }

  if ($referrer_host != $host) {
    /*
     * bad referrer.
     * bad referer.
     * bad reefer? :D
    */
    header("HTTP/1.0 403 Forbidden");
    echo " ";
    exit;
  }

}

?>