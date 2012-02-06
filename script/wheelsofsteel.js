/**
 * DJ Schill's adventures on the wheels of steel
 * ------------------------------------------------------------
 * A browser-based turntable prototype / toy
 * (not for serious/skratch DJs given latency etc.)
 * Code is provided "as-is", unsupported and without warranty.
 *
 * http://wheelsofsteel.net/
 * http://schillmania.com/content/entries/2011/wheels-of-steel/
 *
 * HTML + CSS + JS UI, uses SoundManager 2 API
 * http://schillmania.com/projects/soundmanager2/
 *
 * Hardware acceleration needed for a usable UI.
 * Scratch is laggy on Windows due to Flash/OS
 * latency (and/or I'm doing it wrong.)
 */

/* jslint white: false, onevar: false, undef: true, nomen: false, eqeqeq: true, plusplus: false, bitwise: true, regexp: false, newcap: true, immed: true */
/*global window, turntables, soundManager, console, document, navigator, setTimeout, setInterval, clearInterval, Audio */

(function(window){

// various SM2 config bits
soundManager.flashVersion = 9;
soundManager.useHighPerformance = true;
soundManager.useFastPolling = true;
soundManager.useFlashBlock = true;
soundManager.consoleOnly = true;
soundManager.debugMode = false;
soundManager.useHTML5Audio = (window.location.toString().match(/html5audio/i));
soundManager.wmode = 'transparent';
soundManager.url = 'swf/';

// for Chrome, which seems to still return "maybe" at best.
soundManager.html5Test = /^(probably|maybe)$/i;

// expose a few things to the global, eg., turntables, mixer and so on
window.wheelsofsteel = {
  turntables: [],
  mixer: null
};

var turntables = [],
    mixer = null,
    utils,
    prefs = {},
    loc = window.location.toString(),
    isTouchDevice = (navigator.userAgent.match(/ipad|ipod|iphone/i)), // this will need future updates
    IS_SPECIAL_SNOWFLAKE = isTouchDevice, // iOS has special restrictions on audio.
    SCRATCH_MODE = !!(loc.match(/scratch\=1/i)), // or local storage...
    BATTLE_MODE = !!(loc.match(/battle/i)),
    STRICT_MODE = !IS_SPECIAL_SNOWFLAKE, // better platter/record physics
    EMPTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    add,
    remove,
    soundCounter = 0,
    testDiv = document.createElement('div'),
    features,
    transform,
    prop,
    styles,
    timer,
    wheelsofsteel = window.wheelsofsteel;

utils = (function(){

  // events, math and DOM normalization stuffs.

  var me = this,
      DEG2RAD = Math.PI/180,
      RAD2DEG = 180/Math.PI,

  touchEventMap = {
    'mousedown': 'touchstart',
    'mousemove': 'touchmove',
    'mouseup': 'touchend'
  },

  hasLocalStorage = (function() {
    var result = false;
    try {
      result = (typeof window.localStorage !== 'undefined' && typeof window.JSON !== 'undefined' ? window.localStorage : null);
    } catch(e) {
      // may throw if disabled, etc.
    }
    return result;
  }());

  add = (typeof window.addEventListener !== 'undefined' ? function(o, evtName, evtHandler) {
    return o.addEventListener(evtName,evtHandler,false);
  } : function(o, evtName, evtHandler) {
    o.attachEvent('on'+evtName,evtHandler);
  });

  remove = (typeof window.removeEventListener !== 'undefined' ? function(o, evtName, evtHandler) {
    return o.removeEventListener(evtName,evtHandler,false);
  } : function(o, evtName, evtHandler) {
    return o.detachEvent('on'+evtName,evtHandler);
  });

  function toTouchEvent(evtName) {

    return (touchEventMap[evtName] ? touchEventMap[evtName] : evtName);

  }

  this.events = {

    add: (isTouchDevice ? function(o, evtName, evtHandler) {
      return add(o, toTouchEvent(evtName), evtHandler);
    } : function(o, evtName, evtHandler) {
      return add(o, evtName, evtHandler);
    }),

    remove: (isTouchDevice ? function(o, evtName, evtHandler) {
      return remove(o, toTouchEvent(evtName), evtHandler);
    } : function(o, evtName, evtHandler) {
      return remove(o, evtName, evtHandler);
    })

  };

  this.storage = {

    get: function(name) {
      var result = {};
      if (hasLocalStorage) {
        try {
          result = window.JSON.parse(window.localStorage.getItem(name));
        } catch(e) {
          // oh well
        }
      }
      return result;
    },

    set: function(name, data) {
      var result;
      if (hasLocalStorage) {
        try {
          result = window.localStorage.setItem(name, window.JSON.stringify(data));
        } catch(e) {
          // oh well
        }
      }
      return result;
    }

  };

  this.deg2rad = function(nDeg) {

    return (nDeg * DEG2RAD);

  };

  this.rad2deg = function(nRad) {

    return (nRad * RAD2DEG);

  };

  this.findXY = function(obj) {

    var curleft = 0,
        curtop = 0;
    do {
      curleft += obj.offsetLeft;
      curtop += obj.offsetTop;
    } while (!!(obj = obj.offsetParent));
    return [curleft,curtop];

  };

  this.getMouse = function(e, sXOrY) {

    // return rotated coordinates, if element has a transform on it (?)
    return e[(sXOrY === 'clientY' && BATTLE_MODE ? 'clientX' : 'clientY')];

  };

  this.getMouseXY = function(e) {

    // http://www.quirksmode.org/js/events_properties.html
    e = e?e:window.event;
    if (isTouchDevice && e.touches) {
      e = e.touches[0];
    }
    if (e.pageX || e.pageY) {
      return [e.pageX,e.pageY];
    } else if (e.clientX || e.clientY) {
      return [e.clientX+utils.getScrollLeft(),e.clientY+utils.getScrollTop()];
    }

  };

  this.getScrollLeft = function() {

    return (document.body.scrollLeft+document.documentElement.scrollLeft);

  };

  this.getScrollTop = function() {

    return (document.body.scrollTop+document.documentElement.scrollTop);

  };

  this.hasClass = function(o, cStr) {

    return (typeof(o.className)!=='undefined'?new RegExp('(^|\\s)'+cStr+'(\\s|$)').test(o.className):false);

  };

  this.addClass = function(o, cStr) {

    if (!o || !cStr || me.hasClass(o,cStr)) {
      return false; // safety net
    }
    o.className = (o.className?o.className+' ':'')+cStr;

  };

  this.removeClass = function(o, cStr) {

    if (!o || !cStr || !me.hasClass(o,cStr)) {
      return false;
    }
    o.className = o.className.replace(new RegExp('( '+cStr+')|('+cStr+')','g'),'');

  };

  this.toggleClass = function(o, cStr) {

    (me.hasClass(o, cStr)?me.removeClass:me.addClass)(o, cStr);

  };

  this.getCoordsForDOM = function(oDOM, oData) {

    // relative x/y and so forth
    if (!oData.offsetWidth) {
      var xy = utils.findXY(oDOM);
      oData.offsetWidth = parseInt(oDOM.offsetWidth, 10);
      oData.offsetHeight = parseInt(oDOM.offsetHeight, 10);
      oData.offsetLeft = xy[0];
      oData.offsetTop = xy[1];
      oData.midX = oData.offsetLeft + (oData.offsetWidth * 0.5);
      oData.midY = oData.offsetTop + (oData.offsetHeight * 0.5);
    }

  };

  this.getAngleForDOM = function(oDOM, e) { // oDOM = me.dom[something]

    var coords = utils.getMouseXY(e),
        x = coords[0],
        y = coords[1],
        deltaX = x - oDOM.midX,
        deltaY = y - oDOM.midY,
        angle = me.rad2deg(Math.atan2(deltaX,deltaY));

    return angle;

  };

  this.getURLParams = function(sURL, asObject) {

    var pairs = sURL.split('&'),
        parts = [],
        object = {},
        i, j, tmp;

    // find and trim ? on starting query string, if applicable
    if (pairs.length && pairs[0].charAt(0) === '?') {
      pairs[0] = pairs[0].substr(1);
    } else {
      pairs = [];
    }

    if (asObject) {
      for (i=0, j=pairs.length; i<j; i++) {
        tmp = pairs[i].split('='); // name/value
        object[tmp[0]] = tmp[1];
      }
     return object;
    } else {
      return pairs;
    }

  };

  this.isSameProtocol = function(sURL1, sURL2) {

    // compare http:// to http://, etc.
    if (typeof sURL2 === 'undefined') {
      sURL2 = window.location.toString();
    }
    // also, assume OK if sURL1 is a relative path (eg. no protocol)
    return (sURL1.indexOf('http://') === -1 || sURL1.substr(0, sURL1.indexOf('://')).toLowerCase() === sURL2.substr(0, sURL2.indexOf('://')).toLowerCase());

  };

  return this;

}());

// recall scratch mode from preferences
prefs = utils.storage.get('prefs');
if (prefs && typeof prefs.scratchMode !== 'undefined' && !loc.match(/scratch\=/i)) { // ignore if scratch= in URL
  SCRATCH_MODE = prefs.scratchMode;
}

if (!IS_SPECIAL_SNOWFLAKE && SCRATCH_MODE) {

  // not an iDevice. We presume you have ze Flash, since you need it for scratch mode.
  soundManager.useHTML5Audio = false;

  if (window.location.protocol.match(/http/i)) {
    soundManager.url = 'swf/soundmanager2_flash10.swf' + (window.location.domain === 'localhost' ? '?rnd='+parseInt(Math.random()*new Date(), 10) : '');
  } else {
    // offline/dev
    soundManager.url = 'swf/soundmanager2_flash10.swf?rnd='+parseInt(Math.random()*new Date(), 10);
  }

}

timer = (function() {

  // main animation loop, fps tracking and so forth

  var self = this,
      animInterval = null,
      fpsInterval = null,
      fpsIntervalCount = 0,
      fpsCount = 0,
      lastExec = new Date(),
      // Safari on Snow Leopard occasionally fails to load MP3 files. Unbelievably-bad bug. Allegedly fixed as of OS X Lion. https://bugs.webkit.org/show_bug.cgi?id=32159
      isBrokenHTML5Safari = (window.navigator.userAgent.match(/safari/i) && window.navigator.userAgent.match(/OS X 10_6_([3-9])/i)),
      refreshAnimationFrame,
      requestAnimationFrame,
      refreshAnimationCallback,
      USE_REQUEST_ANIMATION_FRAME = (window.location.toString().match(/raf\=1/i)); // add raf=1 in URL to enable useRequestAnimationFrame support.

  this.fpsAverage = 29.999; // start optimistically.

  /**
   * hat tip: paul irish
   * http://paulirish.com/2011/requestanimationframe-for-smart-animating/
   * https://gist.github.com/838785
   */
  requestAnimationFrame = (function(){
    return (
      USE_REQUEST_ANIMATION_FRAME ? (
        window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        null
      ) : null
    );
  }());

  refreshAnimationFrame = function() {

    // schedule a UI redraw, the modern browser way.
    requestAnimationFrame(refreshAnimationCallback);

  };

  refreshAnimationCallback = function(time) {

    var now = (time? time : new Date()),
        delta = now - lastExec;
    if (delta >= 30) { // works out to ~30 fps
      lastExec = now;
      timer.refresh();
    }
    // and repeat the process
    if (animInterval) {
      refreshAnimationFrame();
   }

  };

  function refreshFPS() {

    var i;
    if (turntables[0].power.motor || turntables[1].power.motor) {
      fpsIntervalCount++;
      self.fpsAverage = parseInt(fpsCount/fpsIntervalCount, 10);
      for (i=turntables.length; i--;) {
        turntables[i].setRPM(self.fpsAverage);
      }
    }

  }

  function refreshThrottle() {

    var now = new Date(),
        delta = now - lastExec;
    if (delta >= 30) { // works out to ~30 fps
      lastExec = now;
      timer.refresh();
    }

  }

  this.refresh = function() {

    var i;
    for (i=turntables.length; i--;) {
      turntables[i].refresh();
    }
    if (turntables[0].power.motor || turntables[1].power.motor) {
      fpsCount++;
    }

  };

  this.start = function() {

    var method, interval;

    if (!animInterval) {
      lastExec = new Date();
      // depending on browser support, use requsetAnimationFrame or old-skool interval for main UI update.
      if (USE_REQUEST_ANIMATION_FRAME && requestAnimationFrame) {
        // modern method
        if (typeof console !== 'undefined' && typeof console.log !== 'undefined') {
          console.log('timer.start(): using requestAnimationFrame');
        }
        method = refreshAnimationFrame;
        interval = 1000/30; // we'd like ~30 fps here.
        animInterval = 1;
        // and start right away
        method();
      } else {
        // old-skool method
        method = refreshThrottle;
        interval = 10; // aggressive interval, but callback throttled to ~30 fps.
        animInterval = window.setInterval(method, interval);
      }
      fpsInterval = window.setInterval(refreshFPS, 1000);
    }

  };

  this.stop = function() {

    if (animInterval) {
      window.clearInterval(animInterval);
      window.clearInterval(refreshFPS);
      animInterval = null;
      fpsInterval = null;
    }

  };

  this.debugStats = function() {

    // display FPS, etc.

    var buffer,
        latency,
        ram,
        sound1,
        sound2,
        getLatency,
        badLatency = 100,
        badFrameRate = 20,
        goodFrameRate = 25,
        latency1,
        latency2,
        bad,
        badLimit,
        scratchWrapper;

    // This part is a big ugly mess of array concatenation and ternary checks, but whatever. It's all debug and stats crap. :D

    scratchWrapper = ['<span'+(!SCRATCH_MODE?' class="no-scratch-mode"':'')+'>','</span>'];
    if (SCRATCH_MODE && !soundManager.html5Only && typeof soundManager.getMovie(soundManager.id)._getDynamicSoundLatency !== 'undefined') {
      sound1 = soundManager.getMovie(soundManager.id)._getDynamicSoundLatency(turntables[0].data.sound.soundObject.sID);
      sound2 = soundManager.getMovie(soundManager.id)._getDynamicSoundLatency(turntables[1].data.sound.soundObject.sID);
      latency1 = parseInt(sound1, 10);
      latency2 = parseInt(sound2, 10);
      bad = ['<span class="high-latency" title="High latency for this browser/OS combo - likely a Flash/Windows limitation, sorry. :/">', '</span>'];
      latency = (latency1 > badLatency ? bad[0] : '') + (sound1 === 0 ? 'n/a' : latency1 + 'ms') + (latency1 > badLatency ? bad[1] : '') + ', ' + (latency2 > badLatency ? bad[0] : '') + (sound2 === 0 ? 'n/a' : latency2 + 'ms') + (latency2 > badLatency ? bad[1] : '');
    }

    if (!soundManager.html5Only && soundManager.getMovie(soundManager.id)._getMemoryUse !== 'undefined') {
      ram = soundManager.getMovie(soundManager.id)._getMemoryUse();
    }

    document.getElementById('control-stats').innerHTML = scratchWrapper[0] + [
     '<span class="scratch-mode">Scratch mode',
     ' / latency: ' + latency,
     ' / </span>' + (!soundManager.html5Only && !SCRATCH_MODE ? '<b style="cursor:help" title="Scratch mode also includes pitch bending and EQ/filter effects.">Scratch mode requires 25+ fps, see "more info" for details</b> / ':'') + (soundManager.html5Only ? (isBrokenHTML5Safari ? '<b class="warning">Safari + Snow Leopard has broken HTML5 audio, often fails to load MP3s. :( <a href="https://bugs.webkit.org/show_bug.cgi?id=32159#c9" class="exclude">Bug #32159</a>. OS X Lion allegedly fixes this. Until then, try Chrome (or Safari on Windows, since it works) or enable flash.</b> / ' : '<b>Using HTML5 audio, scratch mode not supported</b> / '):'') + 'fps' + (requestAnimationFrame ? ' <span title="using requestAnimationFrame for UI updates">(RAF)</span>' : ''),
     ': ' + (timer.fpsAverage === 29.999 ? 'n/a' : (timer.fpsAverage < badFrameRate ? '<span class="low-framerate" title="Low framerate, slow and/or no GPU/hardware acceleration. '+(SCRATCH_MODE ? 'Try non-scratch mode.' : 'Your browser and/or hardware may be the bottleneck here.') + '">' + timer.fpsAverage + '<\/span>' : timer.fpsAverage)),
     '<span class="scratch-mode"> / ram: ' +(ram/1024/1024).toFixed(2)+' mb<\/span>' + scratchWrapper[1],
     (SCRATCH_MODE && !soundManager.html5Only && timer.fpsAverage < badFrameRate && (turntables[0].power.motor || turntables[1].power.motor) ? ' / <b class="warning">Bad sound? Try <a href="?scratch=0" onclick="window.location.href = wheelsofsteel.getURLState({scratch:0});return false" class="exclude">non-scratch mode</a>. Lack of hardware acceleration (or high load) means high CPU use, which kills audio processing.<\/b>' : ''),
     (!SCRATCH_MODE && !soundManager.html5Only && timer.fpsAverage >= goodFrameRate && (turntables[0].power.motor || turntables[1].power.motor) ? ' / <b class="highlight">Looks like you\'re one of the cool kids. Try <a href="?scratch=1" onclick="window.location.href = wheelsofsteel.getURLState({scratch:1});return false" class="exclude">scratch mode</a>.<\/b>' : '')
    ].join('');

  };

  return this;

}());

function has(prop) {

  // test for feature support
  var result = testDiv.style[prop];
  return (typeof result !== 'undefined' ? prop : null);

}

features = {

    opacity: (function(){
      try {
        testDiv.style.opacity = '0.5';
      } catch(e) {
        return false;
      }
      return true;
    }()),

    transform: {
      ie:  has('-ms-transform'),
      moz: has('MozTransform'),
      opera: has('OTransform'),
      webkit: has('webkitTransform'),
      w3: has('transform'),
      prop: null // the normalized property value
    },

    rotate: {
      has3D: false,
      prop: null
    }

};

features.transform.prop = (
  features.transform.moz ||
  features.transform.webkit ||
  features.transform.ie ||
  features.transform.opera ||
  features.transform.w3
);

function attempt(style) {

  try {
    testDiv.style[transform] = style;
  } catch(e) {
    // that *definitely* didn't work.
    return false;
  }
  // if we can read back the style, it should be cool.
  return !!testDiv.style[transform];

}

if (features.transform.prop) {

  // try to derive the rotate/3D support.
  transform = features.transform.prop;
  styles = {
    css_2d: 'rotate(0deg)',
    css_3d: 'rotate3d(0,0,1,0deg)'
  };

  if (attempt(styles.css_3d)) {
    features.rotate.has3D = true;
    prop = 'rotate3d';
  } else if (attempt(styles.css_2d)) {
    prop = 'rotate';
  }

  soundManager._wD('Has 3D rotate: '+features.rotate.has3D);

  features.rotate.prop = prop;

}

function Turntable(oTT, sURL) {

  /** 
   * Turntable()
   * -----------
   * Imagine a Technics 1200SL-MK3 turntable, or thereabouts. Might as well target the golden standard. ;)
   */

  var self = this,
      drag_timer,
      canvas,
      events,
      sound;

  if (!oTT) {
    throw new Error('Turntable(): Missing or invalid turntable DOM node');
  }

  if (!sURL) {
    // if not provided, play silence.
    sURL = 'audio/null.mp3';
  }

  function qs(selector) {
    var result = oTT.querySelectorAll(selector);
    return (result.length ? result[0] : null);
  }

  this.id = oTT.id;

  this.power = {
    table: false,
    motor: false
  };

  this.dom = {
    table: oTT,
    wrapper: oTT.querySelectorAll('.record')[0],
    artImage: oTT.querySelectorAll('.record-ui')[0],
    record: oTT.querySelectorAll('.record-ui')[0], // good enough, for now
    cover: oTT.querySelectorAll('.cover')[0],
    loader: oTT.querySelectorAll('.loader')[0],
    platter: oTT.querySelectorAll('.ring')[0],
    startStop: oTT.querySelectorAll('.startstop')[0],
    powerDial: oTT.querySelectorAll('.powerdial')[0],
    powerDialLED: oTT.querySelectorAll('.powerdial-led')[0],
    pitchSlider: oTT.querySelectorAll('.pitch-slider')[0],
    pitchSliderWrapper: oTT.querySelectorAll('.pitch')[0],
    pitchSliderInput: oTT.querySelectorAll('.control-pitch-slider-input')[0],
    pitchSliderText: oTT.querySelectorAll('.control-pitch-slider-text')[0],
    tonearm: oTT.querySelectorAll('.tonearm')[0],
    tonearmImage: oTT.querySelectorAll('.tonearm-image')[0],
    compactPlayhead: oTT.querySelectorAll('.playhead-arrow.compact')[0],
    waveform: oTT.querySelectorAll('.waveform-1')[0],
    waveform2: oTT.querySelectorAll('.waveform-2')[0],
    waveformBox: oTT.querySelectorAll('.waveform')[0],
    waveformImage: new window.Image(),
    rpm33: oTT.querySelectorAll('.rpm-33')[0],
    rpm45: oTT.querySelectorAll('.rpm-45')[0]
  };

  this.dom.pitchSliderText = this.dom.pitchSliderText.appendChild(document.createTextNode('± 0%')); // node, actually

  this.data = {

    // internal state and configuration stuffs

    id: oTT.id,

    force_refresh: false, // one-time override for refresh method

    css: {
      dragging: 'is_dragging',
      hasRecord: 'has_record'
    },

    sound: {
      blockSize: 2048, // the default (for Flash)
      soundObject: null,
      eorSounds: [], // "end of record" noises
      eorSound: null,
      nextPosition: null,
      channels: null,
      gain: 1
    },

    platter: {
      angle: 0,
      velocity: 0,        // relative amount of velocity (1 = 100% = 33 RPM?)
      nudging: false,     // not scratching, but friction - ie., a thumb weighing down the speed (or pushing it)
      nudgeDirection: -1, // which way the "drag" effect goes
      lastPitchValue: 0,  // for handling drag events
      rpmButton: 33,      // the default
      rpm: null,          // ultimately determined by FPS
      rpmDelta: 1,        // ratio eg. 33/33 or 45/33
      locked: false,      // when false, record speed will always match platter.
      pitchDelta: 0,      // percentage to adjust velocity by
      motionScale: 5,
      shortBrakeMultiplier: 0.9, // regular "stop-start" case
      longBrakeMultiplier: 0.98, // power turned off while playing, etc.
      powerUpMultiplier: 1.5,
      powerLEDFlicker: 0,
      imageURL: null      // album art?
    },

    power: {
      table: false,
      motor: false
    },

    record: {
      angle: 0,
      angleOffset: 0,
      dragging: false,
      mouseMoveCount: 0,
      lastMouseMove: null,     // timestamp
      rotations: 0,            // how many times the record has actually turned
      rotationsAtMouseDown: 0, // for when grabbing/scratching, need to track relative movement
      draggedAngle: 0,         // relative movement
      angleAtMouseDown: 0,
      lastDelta: 0,
      positionAtMouseDown: 0,  // record sound position at the time
      rotationsSinceMouseDown: 0,
      cuePoints: [],           // sticky tape!
      velocity: 0,             // record velocity relative to platter
      offsetWidth: null,
      offsetHeight: null,
      offsetLeft: null,
      offsetTop: null,
      midX: null, // points of interest for rotation
      midY: null
    },

    tonearm: {
      angle: 0,
      angleOffset: 0,
      angleToRecord: 16,
      angleMax: 28, // something around there, anyway.
      dragging: false,
      offsetWidth: null,
      offsetHeight: null,
      offsetLeft: null,
      offsetTop: null,
      drift: 0,
      driftMax: 0.5, // silly fun: how much the tonearm should sway side-to-side while the record spins.
      midX: null,    // points of interest for rotation
      midY: null
    },

    waveform: {
      width: 0,
      height: 0,
      lastX: 0,
      lastMouseX: 0,
      lastExec: 0,
      markers: [],  // equivalent to cue points
      sizeLimit: (navigator.userAgent.match(/firefox/i) ? 32767 : 65535), // Firefox barfs on PNGs bigger than 32K pixels on any side - meanwhile, "64K ought to be enough for anyone [else] :D"
      xOffset: 250, // half of the container
      offsetWidth: null,
      offsetHeight: null,
      offsetLeft: null,
      offsetTop: null,
      midX: null,
      midY: null
    },

    pitchSlider: {
      lastOffsetY: null,
      lastY: 0,
      mouseOffsetY: 0,
      offsetWidth: null,
      offsetHeight: null,
      offsetLeft: null,
      offsetTop: null,
      midHeight: null,
      midX: null,
      midY: null,
      minY: 0,
      maxY: 999
    },

    playhead: {
      lastX: 0
    },

    pending: { // throttled data, applied at intervals
      pitch: false
    }

  };

  this.power = this.data.power; // convenience

  this.setAngle = (features.rotate.has3D ? function(o, nAngle) {
    o.style[features.transform.prop] = 'rotate3d(0,0,1,'+nAngle+'deg)';
  } : function(o, nAngle) {
    o.style[features.transform.prop] = 'rotate('+nAngle+'deg)';
  });

  // edge case...
  if (!features.rotate) {
    this.setAngle = function() {
      return false;
    };
  }

  this.lastRotateExec = new Date();

  this.rotate = function() {

    var p = self.data.platter,
        r = self.data.record,
        now = new Date();

    if (!r.dragging) {

      // move relative to own velocity, or lock to platter velocity
      r.angle += (STRICT_MODE ? r.velocity * p.motionScale : p.velocity * p.motionScale);

      if (r.angle > 360) {

        r.angle -= 360;

        self.data.record.rotations++;

      } else if (r.angle < 0) {

        r.angle += 360;

        r.rotations = Math.max(0, r.rotations-1);

      }

      self.applyDrift();

      // the platter should rotate, but not the record (if being held/dragged.)
      self.setAngle(self.dom.artImage, r.angle);

    } else {

      if (STRICT_MODE) {
        p.angle += (r.velocity*0.025)*p.motionScale;
      }

    }

    // platter always(?) spins.

    p.angle += p.velocity*p.motionScale;

    if (p.angle > 360) {

      p.angle -= 360;

    } else if (p.angle < 0) {

      p.angle += 360;

    }

    self.setAngle(self.dom.platter, p.angle);

    if (self.power.table && self.data.platter.velocity !== 0) {
      p.powerLEDFlicker = !p.powerLEDFlicker;
      self.dom.powerDialLED.style.opacity = (p.powerLEDFlicker ? 0.85 : 0.9);
    }

    if (!r.dragging) {

      // check record vs. platter velocity
      if (self.data.record.velocity !== self.data.platter.velocity) {

        // adjust audio rate to match?
        var originalDiff = self.data.record.velocityOffset,
            diff = self.data.record.velocity - self.data.platter.velocity,
            absDiff = Math.abs(diff),
            absVelocity = Math.abs(self.data.record.velocity),
            absDiffScaled = absDiff*0.25;

        // handle differently if the platter is not moving.
        if (self.data.platter.velocity === 0) {

          if (absDiff > 0.01) {
            if (diff < 0) { // record needs to speed up
              self.data.record.velocity += (absDiff * 0.125);
            } else { // record needs to slow down
              self.data.record.velocity -= (absDiff * 0.125);
            }
          } else {
            // equilibrium has been reached.
            self.data.record.velocity = self.data.platter.velocity;
          }

          // and the platter should still move a percentage, due to friction.
          // this is a hack.
          if (STRICT_MODE) {
            p.angle += (r.velocity*0.025)*p.motionScale;
          }

          // apply velocity to sound
          self.applyVelocity(self.data.record.velocity);

        } else {

          if (self.data.record.velocity < 0.5 && self.data.record.velocity >= 0) {
            // friction/acceleration hack: speed up a lot if the platter is moving, and the record is near 0.
            absDiffScaled = absDiff*0.75;
          }

          if (absDiff > 0.1) {
            if (diff < 0) { // record needs to speed up
              self.data.record.velocity += absDiffScaled * (self.data.record.velocity < 0 && self.data.platter.velocity !== 0 ? 0.5 : 1); // if moving backwards, compensate for forward record movement by scaling down diff.
            } else { // record needs to slow down
              self.data.record.velocity -= absDiffScaled;
            }
          } else {
            // equilibrium has been reached.
            self.data.record.velocity = self.data.platter.velocity;
          }

          // apply velocity to sound
          self.applyVelocity(self.data.record.velocity);

        }

      }

    }

    self.updateWaveform();

    self.updatePlayhead();

    // throttled calls here...

    if (now - self.lastRotateExec > 200) {
      if (self.data.platter.nudging) {
        self.applyPlatterNudge();
      }
      if (self.data.pending.pitch) {
        self.updatePitch();
        self.data.pending.pitch = false;
      }
      self.lastRotateExec = now;
    }

  };

  this.updatePlayhead = function() {

    var offX = parseInt((self.data.waveform.offsetWidth - 2) * (self.data.sound.soundObject.position/self.data.sound.soundObject.durationEstimate), 10); // TODO: Fix hardcoded 500 value

    if (!isNaN(offX) && self.data.playhead.lastX !== offX) {
      // move small playhead in scope of total
      self.dom.compactPlayhead.style.left = offX + 'px';
      self.data.playhead.lastX = offX;
    }

  };

  this.updateWaveform = function() {

    // update the waveform box to the current position, too...
    var waveX = Math.floor(-(self.data.waveform.width*(self.data.sound.soundObject.position/self.data.sound.soundObject.durationEstimate)));

    if (!isNaN(waveX) && waveX !== self.data.waveform.lastX) {
      self.dom.waveform.style.backgroundPosition = (self.data.waveform.xOffset+waveX) + 'px 0px';
      self.data.waveform.lastX = waveX;
    }

  };

  this.unloadWaveform = function() {

    self.dom.waveform.style.background = 'transparent';
    self.dom.waveform2.style.background = 'transparent';
    utils.removeClass(self.dom.waveformBox, 'loaded');

  };

  this.loadWaveform = function(trackName, soundcloudID, soundcloudURL) {

    var fgcolor = '336699', // color to draw the waveform with
        defaultWidth = 500,
        defaultHeight = 48,
        compactHeight = 88, // cheat and artificially compensate for low-contrast peaks

    waveformURL = 'utils/waveform/?' + [
      'track=' + trackName,
      'width=' + self.data.waveform.sizeLimit, // several minutes will fit within the 64K-pixel limit; longer tracks will start to get scaled down.
      'height=' + defaultHeight,
      'fgcolor=' + fgcolor
    ].join('&'),

    compactWaveformURL = 'utils/waveform/?' + [
      'track=' + trackName,
      'width=' + defaultWidth,
      'height=' + compactHeight,
      'fgcolor=' + fgcolor
    ].join('&');

    function resetImage() {

      var img = self.dom.waveform;
      utils.removeClass(self.dom.waveformBox, 'loading');
      img.onload = null;
      img.onerror = null;
      // unload with a 1x1 .gif.
      img.src = EMPTY_GIF;

    }

    if (!window.location.protocol.match(/http/i)) {

      // offline case

      waveformURL = 'utils/waveform/cache/' + [
        trackName.replace(' ','_'), // space to underscore in cached file names
        self.data.waveform.sizeLimit + 'x' + defaultHeight, // several minutes will fit within the 64K-pixel limit; longer tracks will start to get scaled down.
        'transparent',
        fgcolor
      ].join('_')+'.png';

      compactWaveformURL = 'utils/waveform/cache/' + [
        trackName.replace(' ','_'),
        (self.data.waveform.offsetWidth+2)+'x'+compactHeight, // +2 for padding/border stuff, thus 498 becomes 500.
        'transparent',
        fgcolor
      ].join('_')+'.png';

    }

    // soundcloud hax
    if (soundcloudID) {
      waveformURL = soundcloudURL; 
      compactWaveformURL = soundcloudURL.replace(/\_m/, '_s'); // 600px variant
    }

    if (self.dom.waveformImage.src.indexOf(waveformURL) !== -1) {
      // we're there, dude.
      return false;
    }

    self.dom.waveform.style.background = 'transparent';
    utils.removeClass(self.dom.waveform, 'loaded');
    utils.removeClass(self.dom.waveform2, 'loaded');
    utils.addClass(self.dom.waveformBox, 'loading');

    self.dom.waveformImage.onload = function() {

      var bgURL = 'transparent url('+this.src+') no-repeat '+self.data.waveform.xOffset+'px 0px';
      self.data.waveform.width = parseInt(this.width, 10);
      self.data.waveform.height = parseInt(this.height, 10);
      self.dom.waveform.style.background = bgURL;
      utils.addClass(self.dom.waveform, 'loaded');
      utils.addClass(self.dom.waveform2, 'loaded');
      resetImage();

    };

    self.dom.waveformImage.onerror = resetImage;

    // zoomed-out, full-width dealio
    self.dom.waveform2.style.background = 'transparent url('+compactWaveformURL+') no-repeat 0px 50%';
    self.dom.waveformImage.src = waveformURL;

  };

  this.applyDrift = function(recordAngle) {

      self.data.tonearm.drift = Math.sin(utils.deg2rad(self.data.record.angle))*self.data.tonearm.driftMax;

  };

  this.moveTonearm = function(oOptions) {

    var o = self.dom.tonearm,
        angle,
        drift = self.data.tonearm.drift,
        relativeAngle = (oOptions && oOptions.relativeAngle ? oOptions.relativeAngle : null),
        position = (oOptions && oOptions.position? oOptions.position : sound.position);

    if (relativeAngle) {
      angle = relativeAngle;
    } else if (!self.data.tonearm.dragging) { // sound.playState &&
      angle = self.data.tonearm.angleToRecord + drift + (self.data.tonearm.angleMax * (position/sound.durationEstimate));
    }

    if (angle !== undefined && !isNaN(angle)) { // todo: fix bug: when mousedown() fires followed by no mousemove() during redraw, angle is undefined / NaN
      /**
       * a little hackish: restrict movement again.
       * check for weird angles - user not clicking on cartridge/needle assembly, but top of tonearm area etc. bad action.
       */
      angle = Math.min(self.data.tonearm.angleMax + self.data.tonearm.angleToRecord + self.data.tonearm.driftMax, Math.max(0, angle)); // hack: 9 degrees ~= label radius
      self.setAngle(o, angle);
      self.data.tonearm.angle = angle;
    }

  };

  this.setRPM = function(averageFPS) {

    // based on framerate and angle per frame, determine RPM average.

    var p = self.data.platter,
        averageAnglePerMinute = (p.velocity*p.motionScale*averageFPS)*60,
        averageRPM = averageAnglePerMinute/360;
    // console.log('average RPM: '+averageRPM);
    self.data.platter.rpm = averageRPM;

  };

  this.setRPMClick = function(e) {

    var offset = e.target.href.toString().lastIndexOf('#'),
        rpm = parseInt(e.target.href.toString().substr(offset+1), 10);
    self.setButtonRPM(rpm);
    self.applyRPM(rpm);
    return false;

  };

  this.applyRPM = function(rpm) {

    var velocity = self.getPlatterVelocity();
    self.data.platter.rpmDelta = rpm/33;
    self.setVelocity(velocity);
    if (SCRATCH_MODE) {
      self.applyVelocity(velocity);
    }

  };

  this.recordMouseDown = function(e) {

    self.data.record.dragging = true;

    // get midpoint, figure out relative angle, move by that
    var angle = utils.getAngleForDOM(self.data.record, e);

    if (angle < 0) {
      angle += 360;
    }

    self.data.record.lastTravelDelta = 0;
    self.data.record.angleAtMouseDown = self.data.record.angle;
    self.data.record.rotationsAtMouseDown = self.data.record.rotations;
    self.data.record.positionAtMouseDown = self.data.sound.soundObject.position;

    self.data.record.angleOffset = angle;

    if (self.data.record.angleOffset < 0) {
      self.data.record.angleOffset += 360;
    }

    // attach events

    utils.events.add(document, 'mousemove', self.recordMouseMove);
    utils.events.add(document, 'mouseup', self.recordMouseUp);

    self.data.record.dragging = true;
    utils.addClass(self.dom.cover, self.data.css.dragging);

    // pause while dragging

    if (!SCRATCH_MODE) {
      self.data.sound.soundObject.pause();
    }

    self.stopEORSound();

    self.data.record.mouseMoveCount = 0; // reset counter...

    self.recordMouseMove(e);

    if (e.preventDefault) {
      e.preventDefault();
    }

    return false;

  };

  this.normalizeAngle = function(a) {

    if (a < 0) {
      a += 360;
    } else if (a > 360) {
      a -= 360;
    }
    return a;

  };

  this.pitchMouseDown = function(e) {

    // watch for mousemove()

    var eOriginal = e;

    if (isTouchDevice && e.touches) {
      e = e.touches[0];
    }

    if (!self.data.pitchSlider.offsetWidth) {
      utils.getCoordsForDOM(self.dom.pitchSlider, self.data.pitchSlider);
      // set limits, too
      self.data.pitchSlider.midHeight = parseInt(self.data.pitchSlider.offsetHeight/2, 10);
      self.data.pitchSlider.minY = self.data.pitchSlider.midHeight;
      self.data.pitchSlider.maxY = self.dom.pitchSliderWrapper.offsetHeight;
    }

    // do the offset thingy

    self.data.pitchSlider.lastY = (self.dom.pitchSlider.offsetTop || 0) + self.data.pitchSlider.minY;

    self.data.pitchSlider.lastOffsetY = utils.findXY(self.dom.pitchSlider)[1];

    self.data.pitchSlider.mouseOffsetY = utils.getMouse(e, 'clientY') - self.data.pitchSlider.lastOffsetY;

    utils.addClass(self.dom.pitchSlider, 'dragging');

    utils.events.add(document, 'mousemove', self.pitchMouseMove);
    utils.events.add(document, 'mouseup', self.pitchMouseUp);

    if (eOriginal.preventDefault) {
      eOriginal.preventDefault();
    }

    return false;

  };

  this.pitchMouseMove = function(e) {

    var eOriginal = e,
        mouseScale = 1.0, // how far to move relative to mouse
        sliderY = self.data.pitchSlider.lastY + ( (utils.getMouse(e, 'clientY') - self.data.pitchSlider.lastOffsetY - self.data.pitchSlider.mouseOffsetY) * mouseScale ),
        pitchPosition = Math.max(0, Math.min(1, ((sliderY - self.data.pitchSlider.midHeight) / (self.data.pitchSlider.maxY - self.data.pitchSlider.offsetHeight - 3)))), // minus a few pixels for maxY limit
        pitchValue,
        pitchMax = 0.08,
        sliderMidpoint = 0.5,
        sliderInputValue;

    if (isTouchDevice && e.touches) {
      e = e.touches[0];
    }

    sliderY = Math.max(self.data.pitchSlider.minY, Math.min(self.data.pitchSlider.maxY - self.data.pitchSlider.midHeight - 3, sliderY)); // enforce limits

    // set position
    self.dom.pitchSlider.style.top = sliderY + 'px';

    sliderInputValue = parseInt(Math.floor(pitchPosition * self.dom.pitchSliderInput.getAttribute('max')), 10);

    // update underlying node
    self.dom.pitchSliderInput.setAttribute('value', sliderInputValue); // relative to input's min/max
    self.dom.pitchSliderInput.value = sliderInputValue; // actually updates the UI

    self.updatePitchThrottled();

    if (eOriginal.preventDefault) {
      eOriginal.preventDefault();
    }

    return false;

  };

  this.movePitchSliderPerValue = function(value) {

    // position slider to represent given value
    var minY = self.data.pitchSlider.minY,
        maxY = (self.data.pitchSlider.maxY - self.data.pitchSlider.offsetHeight - 3), // TODO: eliminate redundant math
        relPosition = ((value/self.dom.pitchSliderInput.getAttribute('max')) * maxY) / maxY;
    // var relPosition = (value / self.dom.pitchSliderInput.getAttribute('max'));
    self.movePitchSlider(relPosition);

  };

  this.movePitchSlider = function(position) {

    // relative move, for things like 0, 50, 100%;
    self.dom.pitchSlider.style.top = (position * 100)+'%';

  };

  this.pitchMouseUp = function(e) {

    utils.removeClass(self.dom.pitchSlider, 'dragging');
    utils.events.remove(document, 'mousemove', self.pitchMouseMove);
    utils.events.remove(document, 'mouseup', self.pitchMouseUp);

  };
  
  this.updatePitchThrottled = function(e) {

    self.data.pending.pitch = true;
    self.updatePitch(e);

  };

  this.updatePitch = function(e) {

    // event handler: slider control has changed.
    var slider = self.dom.pitchSliderInput,
        maxUp = 0.08, // 10%
        maxDown = -0.08,
        v = slider.getAttribute('value'),
        midpoint = slider.getAttribute('max')/2,
        pitchDelta,
        pitchString,
        velocity;

    if (v === midpoint) {
      pitchDelta = 0;
    } else if (v < midpoint) {
      pitchDelta = maxDown + (Math.abs(maxDown)*(v/midpoint));
    } else {
      pitchDelta = (maxUp*((v-midpoint)/midpoint));
    }

    pitchString = (pitchDelta === 0 ? '± 0' : (pitchDelta > 0 ? '+' : '') + ((pitchDelta*100).toFixed(2))) + '%';
    slider.title = pitchString;
    self.dom.pitchSliderText.nodeValue = pitchString;
    self.data.platter.pitchDelta = pitchDelta;
    velocity = self.data.platter.rpmDelta + pitchDelta;

    // update platter velocity..
    if (self.power.motor) {
      self.setVelocity(velocity);
      // and apply to the sound
      self.applyVelocity(velocity, true);
    }

  };

  this.resetPitch = function(e) {

    // event fired from input type="range"
    var slider = self.dom.pitchSliderInput,
        mid = parseInt(slider.getAttribute('max')/2, 10);

    slider.setAttribute('value', mid);
    utils.addClass(self.dom.pitchSlider, 'resetting'); // transition doesn't work here, for some reason.
    self.movePitchSliderPerValue(mid);
    // self.movePitchSlider(0.5); // reset to mid-point
    window.setTimeout(function() {
     utils.removeClass(self.dom.pitchSlider, 'resetting');
    }, 250);
    self.updatePitch();

  };

  this.getPlatterVelocity = function() {

    return (self.power.motor ? (1 + self.data.platter.pitchDelta) * self.data.platter.rpmDelta : 0);

  };

  this.recordMouseMove = function(e) {

    var eOriginal = e,
        angle = utils.getAngleForDOM(self.data.record, e),
        sound = self.data.sound.soundObject,
        record = self.data.record,
        now,
        displayAngle,
        travelDelta,
        howFarSinceLastMouseMove,
        nextSoundPosition,
        oldRate;

    if (isTouchDevice && e.touches) {
      e = e.touches[0];
    }

    angle = self.normalizeAngle(angle);

    now = new Date();

    displayAngle = record.angleAtMouseDown + (record.angleOffset-angle);

    displayAngle = self.normalizeAngle(displayAngle);

    travelDelta = record.angleAtMouseDown + (record.angleOffset - angle);

    // if lastTravelDelta is 0 (ie., mouse just went down), don't apply.
    howFarSinceLastMouseMove = (record.lastTravelDelta !== 0 ? (travelDelta - record.lastTravelDelta) : 0);

    // position-based seek, track with record movement
    nextSoundPosition = sound.position + ((howFarSinceLastMouseMove/360)*2000); // ~2 seconds per rotation(?)

    if (!SCRATCH_MODE) {

      sound.setPosition(nextSoundPosition);

    } else {

      // here's where things get more hacky.
      oldRate = self.data.record.velocity;

      // fake this a little bit.
      self.data.record.velocity = howFarSinceLastMouseMove/2; // incorporate fpsAverage?

      self.applyVelocity(self.data.record.velocity);

      if (drag_timer) {
        window.clearTimeout(drag_timer);
      }

      // try to cancel/stop motion within a reasonable delay after the last mouse move - otherwise, the record will follow the last "known" speed.
      drag_timer = window.setTimeout(function() {
        if (self.data.record.dragging || !self.power.motor) { // or, scratching with power off
          self.data.record.velocity = 0;
          self.applyVelocity(self.data.record.velocity);
          drag_timer = null;
        }
         // stop somewhere between 20 and 150 msec
      }, Math.min(150, Math.max(20, self.data.record.lastMouseMove ? (now - self.data.record.lastMouseMove)*2 : 0))); // stop next one in 2x the last recorded delta

      self.data.record.lastMouseMove = now;

    }

    record.lastTravelDelta = travelDelta;

    self.setAngle(self.dom.record, displayAngle);

    self.applyDrift();
    self.moveTonearm();

    self.data.record.angleDuringMouseMove = displayAngle;

    self.data.record.mouseMoveCount++;

    if (eOriginal.preventDefault) {
      eOriginal.preventDefault();
    }

    return false;

  };

  this.recordMouseUp = function() {

    var velocity = self.getPlatterVelocity();

    self.data.record.dragging = false;
    utils.removeClass(self.dom.cover, self.data.css.dragging);

    if (drag_timer) {
      window.clearTimeout(drag_timer);
      drag_timer = null;
    }

    if (self.power.motor || STRICT_MODE) {

      self.setVelocity(velocity);
      self.applyVelocity(velocity);

    }

    // IF not in vinyl "STRICT" mode (or mouse has hardly moved), don't simulate record/platter friction
    if (!STRICT_MODE || self.data.record.mouseMoveCount < 2) {
      self.data.record.velocity = velocity;
    }

    // determine and set new position?

    self.data.record.rotations += self.data.record.rotationsSinceMouseDown;

    self.data.record.rotationsSinceMouseDown = 0;

    self.data.record.angle = self.data.record.angleDuringMouseMove;

    // apply, resume sound
    if (sound.readyState) {
        // sound.setPosition(sound.nextPosition*sound.durationEstimate);
      if (self.power.motor) {
        sound.resume();
      }
    }

    self.data.record.mouseMoveCount = 0; // reset

    utils.events.remove(document, 'mousemove', self.recordMouseMove);
    utils.events.remove(document, 'mouseup', self.recordMouseUp);

  };

  this.tonearmMouseDown = function(e) {

    utils.getCoordsForDOM(self.dom.tonearm, self.data.tonearm);

    utils.events.add(document, 'mousemove', self.tonearmMouseMove);
    utils.events.add(document, 'mouseup', self.tonearmMouseUp);

    self.data.tonearm.dragging = true;
    utils.addClass(self.dom.tonearmImage, self.data.css.dragging);

    // stop sound
    sound.pause();
    self.stopEORSound();

    var angle = 360 - utils.getAngleForDOM(self.data.tonearm, e);

    var relativeAngle = angle - 360 - self.data.tonearm.angleToRecord;

    self.data.tonearm.angleOffset = (relativeAngle-self.data.tonearm.angle);

    // move to current position
    self.tonearmMouseMove(e);

    if (e.preventDefault) {
      e.preventDefault();
    }

    return false;

  };

  this.tonearmMouseMove = function(e) {

    var angle = 360 - utils.getAngleForDOM(self.data.tonearm, e),
        sound = self.data.sound.soundObject,
        tonearm = self.data.tonearm,
        relativeAngle = angle - 360 - tonearm.angleToRecord;

    // only let user move within record space..
    relativeAngle = Math.min(tonearm.angleMax + tonearm.angleToRecord, Math.max(0, relativeAngle));

    sound.nextPosition = (relativeAngle - tonearm.angleToRecord - tonearm.angleOffset) / tonearm.angleMax;

    self.moveTonearm({
      relativeAngle: relativeAngle-tonearm.angleOffset
    });

    if (e.preventDefault) {
      e.preventDefault();
    }

    return false;

  };

  this.tonearmMouseUp = function() {

    self.data.tonearm.dragging = false;
    utils.removeClass(self.dom.tonearmImage, self.data.css.dragging);

    var newPosition, tonearm = self.data.tonearm;

    // apply, resume sound
    if (sound.readyState) {

      newPosition = sound.nextPosition*sound.durationEstimate;
      sound.setPosition(newPosition);

      self.stopEORSound();

      self.moveTonearm({
        relativeAngle: tonearm.angleToRecord + (tonearm.angleMax * sound.nextPosition)
      });

      // cheat and set the new sound position on the object -right now-
      self.data.sound.soundObject.position = newPosition;

      if (self.power.motor) {
        sound.resume();
      }

    }

    utils.events.remove(document, 'mousemove', self.tonearmMouseMove);
    utils.events.remove(document, 'mouseup', self.tonearmMouseUp);

  };

  this.unload = function() {

    // remove current album image, waveform etc.
    self.stopEORSound();
    self.data.sound.soundObject.unload();
    // self.data.sound.soundObject.load({url: 'audio/null.mp3'}); // empty sound again?
    utils.removeClass(self.dom.table, self.data.css.hasRecord);
    self.dom.artImage.style.backgroundImage = 'none';
    utils.addClass(self.dom.artImage, 'empty');
    self.dom.waveform.style.background = 'transparent';
    self.dom.waveform2.style.background = 'transparent';
    // utils.removeClass(self.dom.waveformBox, 'loaded');
    self.destroyCuePoints();
    self.setMotor(false);

  };

  this.waveformBoxMouseDown = function(e) {

    if (!self.data.waveform.offsetWidth) {
      utils.getCoordsForDOM(self.dom.waveformBox, self.data.waveform);
    }
    self.waveformBoxMouseMove(e);

    utils.events.add(document, 'mousemove', self.waveformBoxMouseMove);
    utils.events.add(document, 'mouseup', self.waveformBoxMouseUp);

    if (e.preventDefault) {
      e.preventDefault();
    }

    return false;

  };

  this.waveformBoxMouseMove = function(e) {

    if (isTouchDevice && e.touches) {
      e = e.touches[0];
    }

    var offset = Math.min(1, Math.max(0, ((e.clientX - self.data.waveform.offsetLeft) / self.data.waveform.offsetWidth))),
        sound = self.data.sound.soundObject,
        now = new Date().getTime(),
        delta = now - self.data.waveform.lastExec;

    if (sound.readyState && sound.readyState !== 2 && delta > 50) { // throttle calls
      self.data.waveform.lastExec = now;
      sound.setPosition(sound.durationEstimate * offset);
      self.updatePlayhead();
      self.moveTonearm();
    }

  };

  this.waveformBoxMouseUp = function() {

    utils.events.remove(document, 'mousemove', self.waveformBoxMouseMove);
    utils.events.remove(document, 'mouseup', self.waveformBoxMouseUp);

  };

  this.refresh = function() {

    if (self.data.force_refresh || (self.data.record.velocity !== 0 || self.data.platter.velocity !== 0) || (STRICT_MODE && self.data.record.velocity !== 0) || ((self.power.motor && self.data.platter.velocity > 0) || (!self.power.motor && self.data.platter.velocity > 0)) || self.data.record.dragging || self.data.tonearm.dragging) {
      self.rotate(); // move platter
      self.moveTonearm();
      self.data.force_refresh = false;
    }

  };

  this.applyRate = function(sID, nRate) {

    if (!soundManager.html5Only) {
      soundManager.getMovie(soundManager.id)._setRate(self.data.sound.soundObject.sID, nRate);
      if (self.data.sound.eorSound) {
        soundManager.getMovie(soundManager.id)._setRate(self.data.sound.eorSound.sID, nRate);
      }
    }

  };

  this.setButtonRPM = function(nRPM) {

    var t = self.dom.table;
    utils.removeClass(t, 'rpm-33');
    utils.removeClass(t, 'rpm-45');
    utils.addClass(t, nRPM === 45 ? 'rpm-45' : 'rpm-33');
    self.applyRPM(nRPM);

  };

  this.setPower = function(bPower) {

    var pClass = 'power-on';
    if (!self.power.table && bPower) {
      utils.addClass(self.dom.table, pClass);
    } else if (self.power && !bPower) {
      utils.removeClass(self.dom.table, pClass);
    }
    self.power.table = bPower;
    if (!bPower) { // cut power to other things, too
      self.setMotor(false);
    }
    self.dom.powerDialLED.style.opacity = bPower ? 0.9 : 0;

  };

  this.setMotor = function(bPower) {

    var power_state = self.power.table;
    if (self.power.table) {
      self.power.motor = bPower;
      if (bPower) {
        // ramp up?
        self.applyPowerUpEffect();
      } else {
        // wind down?
        self.applyBrakeEffect();
      }
    } else {
      self.power.motor = false;
      self.applyBrakeEffect(true); // long brake effect, if spinning
      self.data.platter.velocity = 0;
    }

  };

  this.setVelocity = function(nVelocity) {

    // lock platter + record speeds
    self.data.platter.velocity = nVelocity;
    // record will play catch-up, unless platter lock is on.
    self.data.record.velocityOffset = ((!STRICT_MODE || self.data.platter.locked) ? 0 : (self.data.record.velocity - self.data.platter.velocity));

  };

  this.applyVelocity = function(nVelocity, bIgnoreIfNotMoving) {

    if (SCRATCH_MODE && !self.data.sound.soundObject.isHTML5) {
      // console.log('velocity: '+nVelocity);
      // hard-limit velocity
      if (nVelocity >= 0) {
        if (nVelocity > 20) {
          nVelocity = 20;
        }
      } else {
        if (nVelocity < -20) {
          nVelocity = -20;
        }
      }
      if (!bIgnoreIfNotMoving) { // don't let slider controls etc. start sound again
        self.applyRate(self.data.sound.soundObject.sID, nVelocity);
      }
    }

  };

  this.applyBrakeEffect = function(bPower) {

    var timer,
        recordRate = self.data.record.velocity,
        brakeMultiplier = (bPower ? self.data.platter.longBrakeMultiplier : self.data.platter.shortBrakeMultiplier);

    function endEffect() {

      window.clearInterval(timer);
      timer = null;
      self.data.platter.locked = false;

    }

    function brakeEffect() {

      if (!self.power.motor) {
        recordRate *= brakeMultiplier;
        self.setVelocity(recordRate);
        if (Math.abs(recordRate) < 0.01) {
          self.setVelocity(0);
          self.applyVelocity(0);
          endEffect();
        }
      } else {
        endEffect();
      }

    }

    self.data.platter.locked = true;
    timer = window.setInterval(brakeEffect, 20);

  };

  this.applyPowerUpEffect = function() {

    var timer,
        targetVelocity = self.getPlatterVelocity(),
        recordRate = Math.max(self.data.platter.velocity, 0.05), // at least..
        powerUpMultiplier = self.data.platter.powerUpMultiplier;

    function powerUpEffect() {

      if (self.power.motor && self.data.record.velocity < targetVelocity) {
        recordRate *= powerUpMultiplier;
        self.setVelocity(Math.min(targetVelocity, recordRate));
        if (SCRATCH_MODE) {
          self.applyVelocity(self.data.record.velocity);
        }
      } else {
        // we're done.
        window.clearInterval(timer);
        self.data.platter.locked = false;
        self.applyVelocity(targetVelocity);
        timer = null;
      }

    }

    self.data.platter.locked = true;
    timer = window.setInterval(powerUpEffect, 20);

  };

  this.togglePowerDial = function(e) {

    // power has been switched completely on or off.

    if (self.power.table) {

      if (self.power.motor) {

        // .. and the platter is spinning...

        if (self.data.platter.velocity !== 0) {

          if (sound.readyState) {
            if (!SCRATCH_MODE) {
              sound.pause();
              self.stopEORSound();
            }
          }

        }

      }

      self.setPower(false);

    } else {

      self.setPower(true);

    }

  };

  this.toggleStartStop = function(e) {

    var isEmpty = false;

    if (self.power.table) {

      if (!self.power.motor) {

        // need to start ze motor

        isEmpty = !!(sound.url.match(/null\.mp3/i)); // special case: don't start empty turntable.

        isEmpty = false;

        if (!sound.readyState) {
          if (!isEmpty) {
            sound.play();
          }
        } else {
          if (!SCRATCH_MODE) {
            if (!isEmpty) {
              sound.togglePause();
            }
          } else {
            // if scratch_mode, speed up to 1 and resume?
            if (!isEmpty) {
              sound.resume();
              // special case: sound loaded while power/motor was off
              self.startDynamicSound();
            }
          }
        }

        // special case: scratch mode and new URL loaded over existing one, hasn't started playing yet..
        if (SCRATCH_MODE && !isEmpty) {
          if (self.data.sound.soundObject.playState === 0) {
            self.data.sound.soundObject.play();
            // ensure buffer is cool, and sound actually starts (if it's already loaded, from cache etc.)
            self.soundEvents.onbufferchange();
          }
        }

        self.setMotor(true);

      } else {

        // motor, possibly sound already running

        if (!SCRATCH_MODE) {
          sound.pause();
          self.setMotor(false);
          self.stopEORSound();
        } else {
          if (!sound.readyState) {
            // edge case: new song loaded on already-playing record.
            self.data.record.velocity = 1;
            self.applyVelocity(self.data.record.velocity);
            if (!isEmpty) {
              sound.play();
            }
          } else {
            self.setMotor(false);
          }
        }

      }

    }

    if (e && e.preventDefault) {
      e.preventDefault();
    }

    return false;

  };

  this.makeCuePoint = function(i, radialDistance, angle) {

    var cp = self.data.record.cuePoints[i],
        o = (cp && cp.node ? cp.node : null),
        labelDiameter = 45,
        radialValue,
        cueRange,
        tonearmAngle = 40 - self.normalizeAngle(angle);

    if (o) {
      // trash and recreate...
      o.parentNode.removeChild(o, true);
    }
    o = document.createElement('div');

    o.className = 'cuepoint';
    o.innerHTML = '<div class="tape"></div>';

    cueRange = parseInt(self.dom.record.offsetWidth/2, 10) - labelDiameter;
    radialValue = ((self.dom.record.offsetWidth/2) - parseInt(radialDistance*cueRange, 10));

    o.childNodes[0].style.width = radialValue + 'px';

    self.dom.artImage.appendChild(o);
    self.setAngle(o, tonearmAngle);

    return o;

  };

  this.makeMarker = function(i, relativePosition) {

    var m = self.data.waveform.markers[i],
        o = (m && m.node ? m.node : null),
        label = i+1;

    if (self.id === 'tt-2') {
      // right deck is 6...0
      label += 5;
      if (label === 10) {
        label = 0;
      }
    }

    if (o) {
      // trash and recreate...
      o.parentNode.removeChild(o, true);
    }
    o = document.createElement('div');

    o.className = 'marker';
    o.innerHTML = '<div class="label">' + label + '</div>';

    o.style.left = Math.floor(relativePosition * self.data.waveform.offsetWidth)+'px';

    self.dom.waveform2.appendChild(o);

    return o;

  };

  this.setCuePoint = function(i, positionOverride) {

    if (!self.data.sound.soundObject.readyState) {
      // needs to have something loaded, at least...
      return false;
    }

    var d = self.data,
        sound = d.sound.soundObject,
        cpAngle = d.record.angle,
        cpNode = self.makeCuePoint(i, sound.position/sound.durationEstimate, cpAngle),
        markerNode = self.makeMarker(i, sound.position/sound.durationEstimate); // related waveform marker

    self.data.record.cuePoints[i] = {
      position: (typeof positionOverride !== 'undefined' ? positionOverride : sound.position),
      angle: cpAngle, // - (d.record.dragging ? d.record.angleOffset : 0)
      node: cpNode
    };

    self.data.waveform.markers[i] = {
      position: (typeof positionOverride !== 'undefined' ? positionOverride : sound.position),
      node: markerNode
    };

  };

  this.applyCuePoint = function(i) {

    var cp = self.data.record.cuePoints[i];
    if (!cp) {
      // if previously unused, then set it now.
      self.setCuePoint(i);
      return false;
    }

    self.data.sound.soundObject.setPosition(cp.position);
    self.stopEORSound();
    self.data.record.angle = cp.angle;

    // force refresh, if loaded
    if (self.data.sound.soundObject.readyState) {
      self.data.force_refresh = true;
      self.refresh();
      if (!self.data.platter.velocity) {
        // .. and force the proper tonearm update, if need be
        self.moveTonearm({
          position: cp.position
        });
      }
    }

  };

  this.destroyCuePoint = function(i) {

    var cp = self.data.record.cuePoints[i];
    if (cp && cp.node) {
      cp.node.parentNode.removeChild(cp.node, true);
    }
    self.data.record.cuePoints[i] = null;
    self.destroyMarker(i); // get related marker, as well

  };

  this.destroyMarker = function(i) {

    var m = self.data.waveform.markers[i];
    if (m && m.node) {
      m.node.parentNode.removeChild(m.node, true);
    }
    self.data.waveform.markers[i] = null;

  };

  this.destroyCuePoints = function() {

    var i;
    for (i=self.data.record.cuePoints.length; i--;) {
      self.destroyCuePoint(i);
    }
    self.data.record.cuePoints = [];

  };

  this.startPlatterNudge = function(direction) {

    if (!self.data.platter.nudging) {
      self.data.platter.nudging = true;
      self.data.platter.nudgeDirection = direction;
      self.data.platter.lastPitchValue = self.dom.pitchSliderInput.getAttribute('value'); // store for eventual reset..
      utils.addClass(self.dom.pitchSlider, 'dragging');
    }

  };

  this.applyPlatterNudge = function() {

    // TODO: Ceiling on amount of nudge that can be applied.
    var old = parseInt(self.dom.pitchSliderInput.getAttribute('value'), 10);
    self.dom.pitchSliderInput.setAttribute('value', old + Math.max((self.data.platter.nudgeDirection > 0 ? 1 : -1), parseInt(self.dom.pitchSliderInput.getAttribute('max')*0.01*self.data.platter.nudgeDirection, 10))); // add at least 1 (nudgeDirection)
    self.updatePitch();
    self.movePitchSliderPerValue(self.dom.pitchSliderInput.getAttribute('value'));

  };

  this.stopPlatterNudge = function() {

    if (self.data.platter.nudging) {
      self.dom.pitchSliderInput.setAttribute('value', self.data.platter.lastPitchValue);
      self.updatePitch();
      utils.addClass(self.dom.pitchSlider, 'resetting');
      self.movePitchSliderPerValue(self.data.platter.lastPitchValue);
      window.setTimeout(function() {
       utils.removeClass(self.dom.pitchSlider, 'resetting');
      }, 250);
      utils.removeClass(self.dom.pitchSlider, 'dragging');
      self.data.platter.nudging = false;
    }

  };

  this.updateLoadProgress = function(bytesLoaded, bytesTotal) {

    if (bytesLoaded && bytesTotal) {
      // hide cover via w/h change and opacity. or something.
      var percentage = bytesLoaded/bytesTotal,
          percentageRemaining = 1 - percentage,
          pixels = Math.floor(self.data.record.offsetWidth * percentageRemaining);
      self.dom.loader.style.width = self.dom.loader.style.height = pixels+'px';
      self.dom.loader.style.marginLeft = self.dom.loader.style.marginTop = -(Math.floor(pixels/2))+'px';
    }

  };

  this.startDynamicSound = function() {

    if (SCRATCH_MODE && !soundManager.html5Only) {
      soundManager.getMovie(soundManager.id)._startDynamicSound(self.data.sound.soundObject.sID);
    }

  };

  this.setBlockSize = function(nBlockSize) {

    if (SCRATCH_MODE && !soundManager.html5Only) {
      soundManager.getMovie(soundManager.id)._setBlockSize(self.data.sound.soundObject.sID, nBlockSize);
    }

  };

  this.stopEORSound = function() {

    // stop any existing ones
    var s = self.data.sound.eorSounds, i;
    for (i=s.length; i--;) {
      if (s[i].playState) {
        s[i].setPosition(0);
        s[i].stop();
        if (SCRATCH_MODE && !soundManager.html5Only) {
          soundManager.getMovie(soundManager.id)._stopDynamicSound(s[i].sID);
        }
      }
    }
    self.data.sound.eorSound = null;

  };

  this.startEORSound = function() {

    var s = self.data.sound.eorSounds,
    sound = s[parseInt(Math.random()*s.length, 10)];
    self.stopEORSound();
    self.data.sound.eorSound = sound;
    function ready() {
      self.soundEvents.eor.onfinish.apply(sound);
    }
    if (!sound.readyState) {
      sound.load({
        onload: function() {
          ready();
        }
      });
    } else {
      ready();
    }

  };

  this.soundEvents = {

    eor: { // end-of-record

      onfinish: function() {
        if (SCRATCH_MODE && !soundManager.html5Only) {
          this.setPosition(0);
          soundManager.getMovie(soundManager.id)._startDynamicSound(this.sID);
        }
        this.play({
          onfinish: self.soundEvents.eor.onfinish // self-referential...
        });
      }

    },

    whileloading: function() {

      self.updateLoadProgress(this.bytesLoaded, this.bytesTotal);

    },

    onload: function() {

      // self.dom.artImage.style.opacity = 1;
      self.updateLoadProgress(this.bytesLoaded, this.bytesTotal);
      if (self.power.motor) {
        self.startDynamicSound();
      }

    },

    onfinish: function() {

      // fake-reset the sound to the end (SM2 normally resets to 0), and keep it active (but paused)
      this.play({position:this.duration});
      this.pause();
      // and fake it, to be safe..
      self.data.sound.soundObject.position = self.data.sound.soundObject.duration;
      self.moveTonearm();
      // and play the end-of-record noise
      if (self.power.motor) {
        self.startEORSound();
      }

    },

    onplay: function() {

      self.startTimer();

    },

    onbufferchange: function(e) {

      if (SCRATCH_MODE) {
        window.setTimeout(function() {
          if (!this.isBuffering && self.power.motor) {
            self.startDynamicSound();
          }
        }, 500);
      }

    },

    whileplaying: function() {

      // console.log('sound id '+this.sID+' / position: '+this.position+'/'+this.duration);

    }
    
  };

  this.startTimer = function() {

    timer.start();

  };

  this.initSound = function() {

    self.data.sound.soundObject = soundManager.createSound({
      id: 'turntableSound'+(soundCounter++),
      url: sURL,
      whileloading: (IS_SPECIAL_SNOWFLAKE ? null : self.soundEvents.whileloading),
      whileplaying: self.soundEvents.whileplaying,
      onfinish: self.soundEvents.onfinish,
      onload: self.soundEvents.onload,
      onplay: self.soundEvents.onplay,
      onbufferchange: self.soundEvents.onbufferchange
    });

    self.data.sound.eorSounds.push(soundManager.createSound({
      id: self.data.sound.soundObject.sID+'EORSound0',
      url: 'audio/endnoise-1.mp3',
      onfinish: self.soundEvents.eor.onfinish
    }));

    self.data.sound.eorSounds.push(soundManager.createSound({
      id: self.data.sound.soundObject.sID+'EORSound1',
      url: 'audio/endnoise-2.mp3',
      onfinish: self.soundEvents.eor.onfinish
    }));

    self.setBlockSize(self.data.sound.blockSize);

    if (SCRATCH_MODE) {
      document.getElementById('experimental').style.display = 'block';
    }

    // local reference
    sound = self.data.sound.soundObject;

    // kick things off
    self.startTimer();

  };

  if (!isTouchDevice) {

    utils.events.add(self.dom.tonearmImage, 'mousedown', self.tonearmMouseDown);
    utils.events.add(self.dom.powerDial, 'mousedown', self.togglePowerDial);
    utils.events.add(self.dom.startStop, 'mousedown', self.toggleStartStop);
    utils.events.add(self.dom.cover, 'mousedown', self.recordMouseDown);
    utils.events.add(self.dom.pitchSlider, 'mousedown', self.pitchMouseDown);
    utils.events.add(self.dom.pitchSlider, 'dblclick', self.resetPitch);
    utils.events.add(self.dom.pitchSliderInput, 'change', self.updatePitchThrottled);
    utils.events.add(self.dom.waveformBox, 'mousedown', self.waveformBoxMouseDown);
    utils.events.add(self.dom.rpm33, 'mousedown', self.setRPMClick);
    utils.events.add(self.dom.rpm45, 'mousedown', self.setRPMClick);

  } else {

    utils.events.add(self.dom.tonearmImage, 'touchstart', self.tonearmMouseDown);
    utils.events.add(self.dom.pitchSlider, 'touchstart', self.pitchMouseDown);
    utils.events.add(self.dom.powerDial, 'touchstart', self.togglePowerDial);
    utils.events.add(self.dom.startStop, 'touchstart', self.toggleStartStop);
    utils.events.add(self.dom.cover, 'touchstart', self.recordMouseDown);
    utils.events.add(self.dom.waveformBox, 'touchstart', self.waveformBoxMouseDown);

  }

  // fetch the record coords up-front
  utils.getCoordsForDOM(self.dom.record, self.data.record);

  utils.getCoordsForDOM(self.dom.waveformBox, self.data.waveform);

  this.initSound();

  self.setButtonRPM(33);

  self.setPower(true);

}

function Mixer() {

  /**
   * Mixer()
   * -------
   * Imagine a Stanton SK-2f, with the buttery-smooth optical cross-fader.
   * ... Or, a Rane TTM-54. Both have their merits.
   *         :D
   * |------------|
   * |   o    o   |
   * |   o    o   |
   * |   o    o   |
   * |   +    +   |
   * |   |    |   |
   * |   --|--    |
   * |------------|
   */

  var self = this;

  function CrossFader(o) {

    var that = this;

    this.dom = {
      crossFader: null,
      input: null,
      crossFaderUI: null,
      crossFaderSlider: null
    };

    this.data = {
      value: 0, // stored from input
      valueMax: null,
      lastValue: 0,
      // special-case because we have two outputs here
      outputValues: [1, 1],
      crossFaderSlider: {
        offsetTop: null,
        offsetLeft: null,
        offsetWidth: null,
        offsetHeight: null,
        midX: null,
        midY: null,
        minX: 0,
        maxX: null,
        lastX: 0,
        lastOffsetX: 0,
        mouseOffsetX: 0
      },
      crossFaderUI: {
        offsetTop: null,
        offsetLeft: null,
        offsetWidth: null,
        offsetHeight: null,
        midX: null,
        midY: null
      }
    };

    this.setDragging = function(isDragging) {

      utils[isDragging?'addClass':'removeClass'](that.dom.crossFaderSlider, 'dragging');

    };

    this.update = function(e) {

      var value = (that.dom.input.getAttribute('value') || that.dom.input.value),
          eOriginal = e,
          mouseScale = 1.0, // how far to move relative to mouse
          sliderX = that.data.crossFaderSlider.lastX + ( (e.clientX - that.data.crossFaderSlider.lastOffsetX - that.data.crossFaderSlider.mouseOffsetX + that.data.crossFaderSlider.midWidth + 2) * mouseScale ),
          sliderPosition,
          sliderValue,
          sliderMax = 1,
          sliderMidpoint = 0.5,
          sliderInputValue;

      // depending on event target, move <input> or CSS UI

      if (isTouchDevice && e.touches) {
        e = e.touches[0];
      }

      sliderX = Math.max(0, Math.min(that.data.crossFaderUI.offsetWidth, sliderX));

      sliderPosition = (sliderX / that.data.crossFaderUI.maxX);

      // set position
      that.dom.crossFaderSlider.style.left = sliderX + 'px';

      sliderInputValue = parseInt(Math.floor(sliderPosition * that.dom.input.getAttribute('max')), 10);

      // update underlying node
      that.dom.input.setAttribute('value', sliderInputValue); // relative to input's min/max
      that.dom.input.value = sliderInputValue; // this one actually updates the UI.

      value = (that.dom.input.getAttribute('value') || that.dom.input.value);

      if (isNaN(value)) {
        // may happen at ends?
        return true;
      }

      that.data.value = value;

      // update own data...
      that.data.outputValue = value/100;

      that.applyValue(value);

    };

    this.applyValue = function(value) {

      var vol1, vol2, opacity,
          waveformOpacity = 1, // maximum opacity
          opacityDelta = 0.5,  // max amount to subtract
          waveformOpacityDelta = 0.25;

      if (value > 50) {

        vol1 = 100 - (100 * (value-50)/50);
        vol2 = 100;
        opacity = opacityDelta-((vol1/100)*opacityDelta);

        // turntable opacity effects
        turntables[0].dom.cover.style.backgroundColor = 'rgba(0,0,0,'+opacity+')';
        turntables[0].dom.waveformBox.style.opacity = waveformOpacity - (opacity/opacityDelta * (waveformOpacity * waveformOpacityDelta)); // todo: refactor
        turntables[1].dom.cover.style.backgroundColor = 'transparent';
        turntables[1].dom.waveformBox.style.opacity = waveformOpacity;

      } else if (value === 50) {

        vol1 = 100;
        vol2 = 100;

        // reset opacity effects
        turntables[0].dom.cover.style.backgroundColor = 'transparent';
        turntables[0].dom.waveformBox.style.opacity = waveformOpacity;
        turntables[1].dom.cover.style.backgroundColor = 'transparent';
        turntables[1].dom.waveformBox.style.opacity = waveformOpacity;

      } else {

        vol1 = 100;
        vol2 = 100 * value/50;
        opacity = opacityDelta-((vol2/100)*opacityDelta);

        // turntable opacity effects
        turntables[0].dom.cover.style.backgroundColor = 'transparent';
        turntables[0].dom.waveformBox.style.opacity = waveformOpacity;
        turntables[1].dom.cover.style.backgroundColor = 'rgba(0,0,0,'+opacity+')';
        turntables[1].dom.waveformBox.style.opacity = waveformOpacity - (opacity/opacityDelta * (waveformOpacity * waveformOpacityDelta)); // todo: refactor

      }

      // update own data...
      that.data.outputValues[0] = vol1/100;
      that.data.outputValues[1] = vol2/100;

      // ... and update mixer
      self.applyVolume();

    };

    this.setValue = function(value) {

      // update input...
      that.dom.input.setAttribute('value', value);
      that.dom.input.value = value; // actually updates the UI

      // move element...

      that.dom.crossFaderSlider.style.left = parseInt(that.data.crossFaderUI.offsetWidth*(value/100), 10)+'px';

      // ...and apply
      that.applyValue(value); 

    };

    this.reset = function(e) {

      // update crossfader, and mixer
      that.setValue(that.dom.input.getAttribute('max')/2);

    };

    this.assignEvents = function() {

      var xFader = that.dom.input,
          xFaderSlider = that.dom.crossFaderSlider;

      utils.events.add(xFader, 'change', that.update);
      utils.events.add(xFaderSlider, 'dblclick', that.reset);

    };

    this.init = function() {

      // container + fader

      that.dom.crossFaderUI = o.querySelectorAll('.crossfader-ui')[0]; // ?

      that.dom.crossFaderSlider = o.querySelectorAll('.crossfader-slider')[0]; // ?

      // get fader + input
      that.dom.crossFader = o; // TODO: Review this. Right element?
      that.dom.input = o.getElementsByTagName('input')[0];

      // read from input
      that.data.valueMax = that.dom.input.getAttribute('max');
      that.data.value = (that.dom.input.getAttribute('value') || that.dom.input.value);

      // read from DOM
      utils.getCoordsForDOM(that.dom.crossFaderSlider, that.data.crossFaderSlider);
      utils.getCoordsForDOM(that.dom.crossFaderUI, that.data.crossFaderUI);

      that.data.crossFaderUI.minX = parseInt(that.data.crossFaderUI.offsetWidth/2, 10);
      that.data.crossFaderUI.maxX = that.data.crossFaderUI.offsetWidth;
      that.data.crossFaderUI.midWidth = parseInt(that.data.crossFaderUI.offsetWidth/2, 10);

      that.data.crossFaderSlider.midWidth = parseInt(that.data.crossFaderSlider.offsetWidth/2, 10);
      that.data.crossFaderSlider.maxX = that.data.crossFaderSlider.offsetWidth;

      that.assignEvents();

      // fire onchange/update event, to refresh live logic?

    };

    that.init();

  } // CrossFader();


  function UpFader(o, initCallback) {

    var that = this;

    this.dom = {
      upFaderBox: null, // container
      upFaderUI: null, // CSS UI
      input: null
    };

    this.data = {
      value: 0, // stored from input
      valueMax: null,
      upFaderBox: {
        offsetTop: null,
        offsetLeft: null,
        offsetWidth: null,
        offsetHeight: null,
        midX: null,
        midY: null
      },
      upFaderUI: {
        offsetTop: null,
        offsetLeft: null,
        offsetWidth: null,
        offsetHeight: null,
        midX: null,
        midY: null,
        minY: 0,
        maxY: null,
        lastY: null,
        lastOffsetY: 0,
        mouseOffsetY: 0
      },
      turntableIndex: null,
      turntableId: null,
      outputValue: 1 // read and applied directly to sound
    };

    this.setDragging = function(isDragging) {

      utils[isDragging?'addClass':'removeClass'](that.dom.upFaderUI, 'dragging');

    };

    this.update = function(e) {

      // depending on event target, move <input> or CSS UI

      var eOriginal = e;

      if (isTouchDevice && e.touches) {
        e = e.touches[0];
      }

      var mouseScale = 1.0, // how far to move relative to mouse
          sliderY = that.data.upFaderUI.lastY + ( ( e.clientY - that.data.upFaderUI.lastOffsetY - that.data.upFaderUI.mouseOffsetY -1) * mouseScale ),
          sliderPosition,
          sliderValue,
          sliderMax = 1,
          sliderMidpoint = 0.5,
          sliderInputValue;

      sliderY = Math.max(that.data.upFaderUI.minY, Math.min(that.data.upFaderUI.maxY - that.data.upFaderUI.midHeight - 3, sliderY)); // enforce limits

      sliderPosition = ((sliderY - that.data.upFaderUI.midHeight) / (that.data.upFaderBox.maxY - that.data.upFaderUI.offsetHeight - 3));

      // set position
      that.dom.upFaderUI.style.top = sliderY + 'px';

      sliderInputValue = parseInt(Math.floor(sliderPosition * that.dom.input.getAttribute('max')), 10);

      // update underlying node
      that.dom.input.setAttribute('value', 100 - sliderInputValue); // relative to input's min/max
      that.dom.input.value = (100 - sliderInputValue); // actually updates the UI

      var value = (that.dom.input.getAttribute('value') || that.dom.input.value);

      if (isNaN(value)) {
        // may happen at ends?
        return true;
      }

      that.data.value = value;

      // update own data...
      that.data.outputValue = value/100;

      // ... and update mixer
      self.applyVolume();

    };

    this.reset = function(e) {

      var value = 75; // default volume

      // TODO: Use default from better place
      that.dom.input.setAttribute('value', value);
      that.dom.input.value = value; // actually updates the UI

      // update own data...
      that.data.outputValue = value/100;

      // update UI...
      that.dom.upFaderUI.style.top = (100-value) + '%';

      // ... and update mixer
      self.applyVolume();

      // that.update(e);

    };

    this.assignEvents = function() {

      var upFader = that.dom.input,
          upFaderUI = that.dom.upFaderUI;

      utils.events.add(upFader, 'change', that.update);
      utils.events.add(upFaderUI, 'dblclick', that.reset);

    };

    this.init = function() {

      var UPFADER_DEFAULT = 0.25; // eg., 25%

      // get fader + input
      that.dom.upFaderBox = o;
      that.dom.input = o.getElementsByTagName('input')[0];
      that.dom.upFaderUI = o.querySelectorAll('.upfader-slider')[0];

      // read from input
      that.data.valueMax = that.dom.input.getAttribute('max');
      that.data.value = (that.dom.input.getAttribute('value') || that.dom.input.value);

      // turntable references
      that.data.turntableIndex = parseInt(that.dom.input.getAttribute('data-table-id'), 10);
      that.data.turntableId = ('turntableSound' + that.data.turntableIndex);

      // box measurements
      if (!that.data.upFaderBox.offsetWidth) {

        utils.getCoordsForDOM(that.dom.upFaderBox, that.data.upFaderBox);
        utils.getCoordsForDOM(that.dom.upFaderUI, that.data.upFaderUI);

        that.data.upFaderUI.minY = parseInt(that.data.upFaderUI.offsetHeight/2, 10);
        that.data.upFaderUI.maxY = that.data.upFaderBox.offsetHeight;
        that.data.upFaderUI.midHeight = parseInt(that.data.upFaderUI.offsetHeight/2, 10);

        that.data.upFaderUI.lastY = (parseInt(that.data.upFaderBox.offsetHeight*UPFADER_DEFAULT + 1, 10) || 0);

        that.data.upFaderBox.midHeight = parseInt(that.data.upFaderBox.offsetHeight/2, 10);
        that.data.upFaderBox.maxY = that.data.upFaderBox.offsetHeight;

      }

      that.assignEvents();

    };

    that.init();

    // feed back to the parent for storage
    initCallback(that, that.dom.upFaderBox.getAttribute('data-id'));

  } // UpFader();


  function Pot(o, initCallback) {

    // uh-huh huh huh. heh heh, m-heh. he said, "pot." (As in, potentiometer.)

    var that = this;

    this.dom = {
      mixer: null,
      pot: null,
      input: null
    };

    this.data = {
      angle: 0,
      angleMin: -150,
      angleMax: 150,
      value: 1, // real value from input, etc.
      outputValue: 1, // value that is referenced/used eg., volume control etc.
      valueMax: 0,
      offsetLeft: 0,
      offsetTop: 0,
      offsetWidth: 0,
      offsetHeight: 0,
      midX: 0,
      midY: 0,
      mouseX: 0,
      mouseY: 0,
      turntableIndex: null,
      turntableId: null,
      instance: {} // type-specific data (eg., EQ offset)
    };

    this.methods = {

      eq: function() {

        // TODO: lowest value should never be 0.

        var outValue = Math.max(0.01, (that.data.value/100)*1.5);

        that.data.outputValue = outValue;

        if (!soundManager.html5Only) {
          soundManager.getMovie(soundManager.id)._setEQ(that.data.turntableId, that.data.instance.dataEQOffset, outValue);
        }

      },

      eqSetup: function() {

        that.data.instance.dataEQOffset = that.dom.input.getAttribute('data-eq-offset');

      },

      gain: function(gain) {

        var tt = turntables[that.data.turntableIndex],
            outValue = (that.data.value/100)*2;

        that.data.outputValue = outValue;

        tt.data.sound.soundObject.gain = outValue;

        mixer.applyVolume();

      },

      gainSetup: function() {

        // console.log('gainSetup()');

      }

    };

    this.methodTypeMap = { // keyed on data-type attribute

      eq: this.methods.applyEQ,
      gain: this.methods.applyGain

    };

    this.method = null; // mapped to the above, depending

    this.setMethod = function(type) {

      // console.log('setMethod('+type+')');
      that.method = that.methods[type];

      // apply the setup method, which may configure some things
      var setup = that.methods[type+'Setup'];

      if (setup) {
        setup();
      }

    };

    this.reset = function() {

      that.applyAngle(0);
      that.applyEffect();

    };

    this.applyAngle = function(angle) {

      var d = that.data;
      d.angle = Math.min(d.angleMax, Math.max(d.angleMin, angle));
      turntables[0].setAngle(that.dom.pot, d.angle); // haaaack

    };

    this.applyEffect = function() {

      // eg. angle from -150 to +150, make it one sweep from 0-100%
      var value = (that.data.valueMax * ((that.data.angle + that.data.angleMax) / (that.data.angleMax*2)) / 100);
      // update the hidden element and ish
      that.data.value = parseInt(that.dom.input.getAttribute('max') * value, 10);
      that.dom.input.setAttribute('value', that.data.value);
      that.dom.input.value = that.data.value; // actually updates the UI
      that.method();

    };

    this.setDragging = function(isDragging) {

      utils[isDragging?'addClass':'removeClass'](that.dom.pot, 'dragging');

    };

    this.init = function() {

      // get pot + input
      that.dom.pot = o.getElementsByClassName('pot')[0];
      that.dom.input = o.getElementsByTagName('input')[0];

      // read from input
      that.data.valueMax = that.dom.input.getAttribute('max');
      that.data.value = (that.dom.input.getAttribute('value') || that.dom.input.value);

      that.data.turntableIndex = parseInt(that.dom.input.getAttribute('data-table-id'), 10);

      that.data.turntableId = ('turntableSound' + that.dom.input.getAttribute('data-table-id'));

      that.setMethod(that.dom.input.getAttribute('data-type'));

      utils.events.add(that.dom.pot, 'dblclick', that.reset);

      // feed back to the parent for storage
      initCallback(that, that.dom.pot);

    };

    that.init();

  } // Pot();

  /**
   * Mixer() ...
   */

  this.data = {
    pots: [],      // gain and eq
    potsById: {},  // for lookups from mouseDown event
    upFaders: [],  // [0] and [1]
    upFadersById: {},
    crossFader: {}
  };

  this.dom = {
  };

  this.events = {

    dragTarget: null, // convenient reference for events

    mouseDown: function(e) {

      var eOriginal = e,
          o, relObj;

      if (isTouchDevice && e.touches) {
        e = e.touches[0];
      }

      o = e.target;

      if (!o) {
        // scrollbar clicked, or some other nonsense
        return true;
      }

      function stop() {
        if (eOriginal.preventDefault) {
          eOriginal.preventDefault();
        }
        return false;
      }

      self.events.dragTarget = o;

      // for now: target element class name determines the control we're working with.

      if (o.className === 'pot') { // eh, brittle for now.

        // grab current coordinates, find out which pot etc.?

        self.events.relatedObject = self.data.potsById[o.id];

        self.events.relatedObject.setDragging(true);

        self.events.relatedObject.data.mouseX = e.clientX;
        self.events.relatedObject.data.mouseY = e.clientY;

        utils.events.add(window, 'mousemove', self.events.pot.mouseMove);
        utils.events.add(window, 'mouseup', self.events.pot.mouseUp);

        return stop();

      } else if (o.className === 'upfader-cover' || o.className === 'control-upfader') { // CSS UI vs. <input>

        self.events.relatedObject = self.data.upFadersById[o.getAttribute('data-id')];

        relObj = self.events.relatedObject;

        relObj.setDragging(true);

        // offset things

        relObj.data.upFaderUI.mouseY = e.clientY;

        relObj.data.upFaderUI.lastY = (relObj.dom.upFaderUI.offsetTop || 0) + relObj.data.upFaderUI.minY;

        relObj.data.upFaderUI.lastOffsetY = utils.findXY(relObj.dom.upFaderUI)[1];

        relObj.data.upFaderUI.mouseOffsetY = e.clientY - relObj.data.upFaderUI.lastOffsetY;

        utils.events.add(window, 'mousemove', self.events.upFader.mouseMove);
        utils.events.add(window, 'mouseup', self.events.upFader.mouseUp);

        relObj.update(e);

        return stop();

      } else if (o.className === 'crossfader-cover' || o.className === 'control-crossfader') { // CSS UI vs. <input>

        self.events.relatedObject = self.data.crossFader;

        relObj = self.events.relatedObject;

        relObj.setDragging(true);

        // offset things

        relObj.data.crossFaderUI.mouseX = e.clientX;

        relObj.data.crossFaderSlider.lastX = (relObj.dom.crossFaderSlider.offsetLeft || 0) + relObj.data.crossFaderSlider.minX;

        relObj.data.crossFaderSlider.lastOffsetX = utils.findXY(relObj.dom.crossFaderSlider)[0];

        relObj.data.crossFaderSlider.mouseOffsetX = e.clientX - relObj.data.crossFaderSlider.lastOffsetX;

        utils.events.add(window, 'mousemove', self.events.crossFader.mouseMove);
        utils.events.add(window, 'mouseup', self.events.crossFader.mouseUp);

        relObj.update(e);

        return stop();

      }
      
    },

    crossFader: {

      mouseMove: function(e) {

        self.data.crossFader.update(e);

      },

      mouseUp: function(e) {

        self.events.relatedObject.setDragging(false);

        utils.events.remove(window, 'mousemove', self.events.crossFader.mouseMove);
        utils.events.remove(window, 'mouseup', self.events.crossFader.mouseUp);

      }

    },

    pot: {

      mouseMove: function(e) {

        var o = self.events.relatedObject,
            eOriginal = e;

        if (isTouchDevice && e.touches) {
          e = e.touches[0];
        }

        var yDiff = (o.data.mouseY - e.clientY);

        o.data.angle += 180*(yDiff/20); // haaaack

        o.applyAngle(o.data.angle);

        o.applyEffect();

        // and update ze mouse
        o.data.mouseX = e.clientX;
        o.data.mouseY = e.clientY;

        if (eOriginal.preventDefault) {
          eOriginal.preventDefault();
        }

        return false;

      },

      mouseUp: function(e) {

        self.events.relatedObject.setDragging(false);

        utils.events.remove(window, 'mousemove', self.events.pot.mouseMove);
        utils.events.remove(window, 'mouseup', self.events.pot.mouseUp);

      }

    },

    upFader: {

      mouseMove: function(e) {

        var o = self.events.relatedObject;

        o.update(e);

        self.applyVolume();

      },

      mouseUp: function(e) {

        self.events.relatedObject.setDragging(false);
        
        utils.events.remove(window, 'mousemove', self.events.upFader.mouseMove);
        utils.events.remove(window, 'mouseup', self.events.upFader.mouseUp);

      }

    }

  };

  this.getVolumeForChannel = function(channel) {

    // output volume = input volume -> gain -> upfader -> crossfader

    var data = {
      // potentially-dangerous: assumes gain is [0] and [1] of pots array
      gain: self.data.pots[channel].data.outputValue,
      upFader: self.data.upFaders[channel].data.outputValue,
      crossFader: self.data.crossFader.data.outputValues[channel]
    },
    result = data.gain * data.upFader * data.crossFader * 100; // 0-1 scaled by 100%

    return result;

  };

  this.applyVolume = function() {
   
    // get volume from mixer outputs, apply to sounds
    var v0 = self.getVolumeForChannel(0),
        v1 = self.getVolumeForChannel(1),
        tt0 = turntables[0],
        tts0 = tt0.data.sound,
        tt1 = turntables[1],
        tts1 = tt1.data.sound;

    tts0.soundObject.setVolume(v0);
    tts1.soundObject.setVolume(v1);

    // affect end-of-record sounds, too
    if (tts0.eorSound) {
      tts0.eorSound.setVolume(v0);
    }

    if (tts1.eorSound) {
      tts1.eorSound.setVolume(v1);
    }

  };

  this.assignEvents = function() {

    // delegates for click. If on .pot, then watch mousemove/up.
    utils.events.add(self.dom.mixer, 'mousedown', self.events.mouseDown);

    // TODO: refactor
    document.getElementById('use-eq').checked = false;
    self.eqEnabled = document.getElementById('use-eq').checked;

    utils.events.add(document.getElementById('use-eq'), 'click', function() {
      self.eqEnabled = document.getElementById('use-eq').checked;
      if (!soundManager.html5Only) {
        if (self.eqEnabled) {
          soundManager.getMovie(soundManager.id)._enableEQ('turntableSound0');
          soundManager.getMovie(soundManager.id)._enableEQ('turntableSound1');
        } else {
          soundManager.getMovie(soundManager.id)._disableEQ('turntableSound0');
          soundManager.getMovie(soundManager.id)._disableEQ('turntableSound1');
        }
      }
    }, false);

  };

  this.createPots = function() {

    var oContainers = self.dom.mixer.querySelectorAll('li');
    var i, j;

    function potMade(oPot, oDomNode) {
        self.data.potsById[oDomNode.id] = oPot;
    }

    for (i=0, j=oContainers.length; i<j; i++) {
      self.data.pots.push(new Pot(oContainers[i], potMade));
    }

  };

  this.createUpFaders = function() {

    var oContainers = self.dom.mixer.querySelectorAll('div.upfader');
    var i, j;

    function upFaderMade(oUpFader, faderID) {
      self.data.upFadersById[faderID] = oUpFader;
    }

    for (i=0, j=oContainers.length; i<j; i++) {
      self.data.upFaders.push(new UpFader(oContainers[i], upFaderMade));
    }

  };

  this.createCrossFader = function() {

    self.data.crossFader = new CrossFader(self.dom.mixer.querySelectorAll('.x-fader-panel')[0]);

  };

  this.init = function() {

    // power on?

    self.dom.mixer = document.getElementById('mixer');

    self.createPots();

    self.createUpFaders();

    self.createCrossFader();

    self.assignEvents();

  };

  self.init();

}

/**
 * Main initialization
 * -------------------
 * Hook off of soundManager.onready()
 * Create turntables + mixer objects, etc.
 */

soundManager.onready(function() {

  if (!soundManager.supported()) {
    return false;
  }

  // additional scratch mode check - if you don't have flash, then it must be false.
  if (SCRATCH_MODE && soundManager.html5Only) {
    SCRATCH_MODE = false;
  }

  var oTT,
      html = [],
      i, j, o,
      lastTarget = null,
      url,
      urls,
      thruYou,
      rnd,
      loaderForm = [document.getElementById('loader-form-1'), document.getElementById('loader-form-2')],
      urlParams,
      keyData,
      sc = document.getElementById('soundcloud-tracks'),
      sc_cache = {},
      loadURL;

  function loadScript(sURL,onLoad) {

    function loadScriptHandler() {
      var rs = this.readyState;
      if (rs === 'loaded' || rs === 'complete') {
        this.onreadystatechange = null;
        this.onload = null;
        if (onLoad) {
          window.setTimeout(onLoad,20);
        }
      }
    }

    function scriptOnload() {
      this.onreadystatechange = null;
      this.onload = null;
      window.setTimeout(onLoad,20);
    }

    try {
      var oS = document.createElement('script');
      oS.type = 'text/javascript';
      oS.setAttribute('async', true);
      if (onLoad) {
        oS.onreadystatechange = loadScriptHandler;
        oS.onload = scriptOnload;
      }
      oS.src = sURL;
      document.getElementsByTagName('head')[0].appendChild(oS);
    } catch(e) {
      // oh well
    }

  }

  function getSoundcloudTopTen(callback) {

    wheelsofsteel.soundcloudTopTen = callback;
    var url = 'utils/soundcloud_hot_tracks/';
    loadScript(url, function() {});

  }

  function getSoundcloudSet(set_id, callback) {

    wheelsofsteel['soundcloudSet_'+set_id] = callback;
    // http://api.soundcloud.com/playlists/737966.json
    var url = 'utils/soundcloud_fetch_set/?id=' + set_id;
    loadScript(url, function() {});

  }

  function sc_cache_data(scData) {

    var id;
    if (scData && scData.streamable) {
      id = scData.id;
      sc_cache[id] = scData;
      sc_cache[id].wheelsofsteel = {
        // should approximate 'http://api.soundcloud.com/tracks/' + id + '/stream?client_id=' + ZOMG_SECRET
        // url: scData.stream_url + '?client_id=' + ZOMG_SECRET
      };
    }

  }

  function fetchSoundcloudURL(track_id, callback) {

    wheelsofsteel['soundcloudURL_'+track_id] = function(scData) {
      callback(scData);
    };
    loadScript('utils/soundcloud_fetch_url/?id=' + track_id, function(){});

  }

  function sc_callback(scData, turntable) {

    sc_cache_data(scData);
    var id = scData.id;
    if (scData && scData.streamable) {
      fetchSoundcloudURL(id, function(scData) {
        sc_cache[id].wheelsofsteel.url = scData.url;
        loadURL(sc_cache[id].wheelsofsteel.url, turntable, id); // left vs. right-click
      });
    }

  }

  function loadSoundcloudID(track_id, oOptions) {

    var turntable = (oOptions && typeof oOptions.turntable !== 'undefined' ? oOptions.turntable : 0);
    if (typeof sc_cache[track_id] === 'undefined') {
      // fetch API data
      // expose this SC callback
      wheelsofsteel['soundcloudJSONP_'+track_id] = function(scData) {
        sc_callback(scData, turntable);
        if (oOptions.callback) {
          oOptions.callback();
        }
      };
      loadScript('utils/soundcloud_fetch_track/?id=' + track_id, function(){});
    } else {
      // we've already got the info.
      fetchSoundcloudURL(track_id, function(scData) {
        sc_cache[track_id].wheelsofsteel.url = scData.url;
        loadURL(sc_cache[track_id].wheelsofsteel.url, turntable, track_id); // left vs. right-click
        if (oOptions.callback) {
          oOptions.callback();
        }
      });
      // loadURL(sc_cache[track_id].wheelsofsteel.url, turntable, track_id); // left vs. right-click
    }

  }

  function getURLState(additional_params) {

    var winloc = window.location,
        winURL = winloc.toString(),
        urlState, url_params, track1, track2, item, params = [];

    url_params = utils.getURLParams(window.location.toString(), true);
    track1 = document.getElementById('track1').value;
    track2 = document.getElementById('track2').value;

    if (track1) {
      url_params.track1 = track1;
    }

    if (track2) {
      url_params.track2 = track2;
    }

    // reconstruct URL, excluding a few things
    delete url_params.debug;
    delete url_params.scratch;

    if (additional_params) {
      // eg. scratch=1
      for (item in additional_params) {
        if (additional_params.hasOwnProperty(item)) {
          url_params[item] = additional_params[item].toString();
        }
      }
    }

    for (item in url_params) {
      if (url_params.hasOwnProperty(item)) {
        // add URL, trimming local paths if applicable
        params.push(item + '=' + url_params[item].replace(window.location.protocol+'//'+window.location.host,''));
      }
    }

    urlState = window.location.protocol + '//' + window.location.host + (window.location.pathname || '') + (params.length ? '?' + params.join('&') : (winloc.search || '')); // + (window.location.hash || '');

    return urlState;

  }

  function updateHistory() {

    // as user loads new tracks, update window location.
    var historyURL;

    if (typeof window.history !== 'undefined' && typeof window.history.replaceState !== 'undefined') {
      historyURL = getURLState();
      window.history.replaceState({}, document.title, historyURL);
    }

  }

  // expose to global for a few things
  wheelsofsteel.getURLState = getURLState;

  function unload(i, e) {
    turntables[i].unload();
    document.getElementById('track'+(i+1)).value = '';
    updateHistory();
  }

  loadURL = function(sURL, i, soundcloudID) {

    if (typeof sURL === 'undefined' || !sURL) {
      return false;
    }

    var turntable = turntables[i],
        s = turntable.data.sound.soundObject,
        img = new window.Image(),
        oInput = document.getElementById('track'+(i+1)),
        isSoundcloud = (soundcloudID || sURL.match(/^sc\-/i)); // numeric ID, or sc-###### in URL

    if (isSoundcloud && !soundcloudID) {
      // retrive from URL, trimming prefix
      soundcloudID = sURL.substr(3);
      // go get the real URL based on ID, and load it.
      loadSoundcloudID(soundcloudID, {
        turntable: i
      });
      return false;
    }

    // turntable.data.sound.soundObject.mute();
    s.stop();

    // manually reset the tonearm
    turntable.setAngle(turntable.dom.tonearm, 0);

    utils.addClass(turntable.dom.table, turntable.data.css.hasRecord);

    // go get the waveform stuff, if we're loading from the same place
    if (!isSoundcloud && utils.isSameProtocol(sURL)) {
      turntable.loadWaveform(sURL.substr(sURL.lastIndexOf('/')+1).replace('.mp3',''));
    } else {
      turntable.unloadWaveform();
      // waveforms: not yet.
      // turntable.loadWaveform(null, soundcloudID, sc_cache[soundcloudID].waveform_url);
    }

    // and apply to the relevant input
    if (oInput) {
      oInput.value = (isSoundcloud ? 'sc-' + soundcloudID : sURL);
    }

    if (turntable.power.motor && IS_SPECIAL_SNOWFLAKE) {
      // iOS won't let the new sound automatically start, so kill the power.
      turntable.setMotor(false);
    }

    if (s.readyState) {

      // stop eor sounds
      turntable.stopEORSound();

      s.load({
        url: sURL,
        type: 'audio/mp3' // assumed
      });

      turntable.setBlockSize(turntable.data.sound.blockSize);

      // reset cue points...
      turntable.destroyCuePoints();

      // ...and pitch
      turntable.updatePitch();

      if (turntable.power.table && turntable.power.motor) {
        // and the motor is running..

        s.play({
          whileloading: (IS_SPECIAL_SNOWFLAKE ? null : turntable.soundEvents.whileloading),
          whileplaying: turntable.soundEvents.whileplaying,
          onfinish: turntable.soundEvents.onfinish,
          onload: turntable.soundEvents.onload,
          onplay: turntable.soundEvents.onplay,
          onbufferchange: turntable.soundEvents.onbufferchange
        });

        // volume, too.
        mixer.applyVolume();

      }

    } else {

      turntable.data.sound.soundObject._iO.url = sURL;

    }

    // and if applicable, rewrite history.
    updateHistory();

    // load, and do things if it succeeds / fails
    img.onload = function() {

      turntable.dom.artImage.style.backgroundImage = 'url('+this.src+')';
      utils.removeClass(turntable.dom.artImage, 'empty');
      this.onload = null;
      this.onerror = null;
      this.src = EMPTY_GIF;
      img = null;

    };

    img.onerror = function() {

      this.onload = null;
      this.onerror = null;
      this.src = EMPTY_GIF;
      utils.addClass(turntable.dom.artImage, 'empty');
      turntable.dom.artImage.style.backgroundImage = 'none';
      img = null;

    };

    // and attempt to load album art, if applicable.
    // this is a really dumb hackish way to do it, but it works for this demo.
    if (!isSoundcloud) {
      if (sURL.match(/nyanyanyan/i)) {
        // special case. :D
        img.src = 'tunes/nyancat-poptart1red1-by-prguitarman-dot-com.gif';
      } else {
        img.src = 'tunes/'+sURL.substr(sURL.lastIndexOf('/')+1).replace('.mp3','.jpg');
      }
    } else {
      // w00t
      if (sc_cache[soundcloudID].artwork_url) {
        img.src = sc_cache[soundcloudID].artwork_url.replace('large','crop'); // http://developers.soundcloud.com/docs/api/tracks#artwork_url
      } else {
        img.src = EMPTY_GIF;
      }
    }

  };

  function handleLoaderSubmit(e) {

    var o = e.target,
        input = o.getElementsByTagName('input')[1], // the URL element
        id = parseInt(input.id.substr(5), 10)-1, // array ID is zero-based
        url = input.value;
    loadURL(url, id); 
    try {
      input.blur();
    } catch(ee) {
      // oh well
    }
    if (e.preventDefault) {
      e.preventDefault();
    }
    return false;

  }

  function handleLoaderFocus(e) {

    utils.addClass(e.target.parentNode, 'focused');

  }

  function handleLoaderBlur(e) {

    utils.removeClass(e.target.parentNode, 'focused');

  }

  function toggleDebug() {

    var debugCSS = 'debug',
        i;

    for (i=turntables.length; i--;) {
      utils.toggleClass(turntables[i].dom.table, debugCSS);
    }
    utils.toggleClass(document.getElementById('mixer'), debugCSS);

  }

  function editOrApplyCue(nTT, nCue, e) {

    var t = turntables[nTT];
    if (e.shiftKey) {
      t.setCuePoint(nCue);
    } else if (e.ctrlKey) {
      t.destroyCuePoint(nCue);
    } else {
      t.applyCuePoint(nCue);
    }

  }

  function keyIsDown(key) {

    var o = (typeof keyData[key] !== 'undefined' ? keyData[key] : null);
    if (o && o.isDown) {
      return true;
    } else {
      if (!o) {
        keyData[key] = {};
      }
      keyData[key].isDown = true;
      return false;
    }

  }

  function keyReset(key) {

    if (keyData[key]) {
      keyData[key].isDown = false;
    }

  }

  function safeForKeys(e) {

    return (!e.target || (e.target && !e.target.nodeName.match(/input/i)));

  }

  oTT = document.getElementById('tt-container');
  if (oTT) {
    var c = oTT.className;
    oTT.className = (oTT.className ? oTT.className + ' ' : '') + (SCRATCH_MODE ? 'scratch-mode' : '');
  }

  turntables.push(new Turntable(document.getElementById('tt-1')));
  turntables.push(new Turntable(document.getElementById('tt-2')));

  if (loaderForm[0]) {

    // URL loader form events. TODO: Clean-up
    loaderForm[0].onsubmit = handleLoaderSubmit;
    utils.events.add(loaderForm[0].getElementsByTagName('input')[0], 'click', function(e) {
      unload(0);
    });
    utils.events.add(loaderForm[0].getElementsByTagName('input')[1], 'focus', handleLoaderFocus);
    utils.events.add(loaderForm[0].getElementsByTagName('input')[1], 'blur', handleLoaderBlur);
    loaderForm[0].onblur = handleLoaderBlur;

    loaderForm[1].onsubmit = handleLoaderSubmit;
    utils.events.add(loaderForm[1].getElementsByTagName('input')[0], 'click', function(e) {
      unload(1);
    });
    utils.events.add(loaderForm[1].getElementsByTagName('input')[1], 'focus', handleLoaderFocus);
    utils.events.add(loaderForm[1].getElementsByTagName('input')[1], 'blur', handleLoaderBlur);

  }

  o = document.getElementById('the-music');

  o.onmousedown = function(e) {

    // a link may have been clicked. sort out which, and which turntable to load it on.

    var target = e.target;

    if (e.target.nodeName.toLowerCase() === 'span') {
      target = e.target.parentNode;
    }

    if (target.nodeName.toLowerCase() === 'a' && !utils.hasClass(target, 'exclude')) {

      if (lastTarget && lastTarget !== target) {
        lastTarget.className = '';
      }

      target.className = 'active';
      lastTarget = target;

        var track_id = target.getAttribute('data-track-id');

        if (!track_id) {

          // regular MP3
          loadURL(target.href, (e.button === 2 || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ? 1 : 0)); // left vs. right-click
          if (e.preventDefault) {
            e.preventDefault();
          }

        } else {

          // soundcloud
          utils.addClass(target, 'loading');
          loadSoundcloudID(track_id, {
            turntable: (e.button === 2 || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ? 1 : 0),
            callback: function() {
              utils.removeClass(target, 'loading');
            }
          });

        }

      return false;

    }

  };

  o.onclick = function(e) {

    var target = e.target;

    if (e.target.nodeName.toLowerCase() === 'span') {
      target = e.target.parentNode;
    }

    if (target.nodeName.toLowerCase() === 'a' && !utils.hasClass(target, 'exclude')) {
      if (e.preventDefault) {
        e.preventDefault();
      }
      return false;
    }

  };

  if (sc) {

    getSoundcloudTopTen(function(data) {

      var i, tmp, item, items, topten = [];
      for (item in data) {
        if (data.hasOwnProperty(item) && data[item].streamable) {
          sc_cache_data(data[item]);
          topten.push(sc_cache[data[item].id]);
        }
      }

      if (topten.length) {
        tmp = [];
        for (i=0; i<topten.length; i++) {
          items = topten[i].title.split('-'); // artist - name where possible
          tmp.push('<li><a href="#" data-track-id="'+topten[i].id+'" oncontextmenu="return false">' + (items.length === 2 ? '<span style="font-weight:normal;color:rgba(255,255,255,0.5)">' + items[0] + ' - </span>' + items[1] : topten[i].title) + '</a></li>');
        }
        document.getElementById('soundcloud-top10').innerHTML = '<ul>' + tmp.join('') + '</ul>';
      }

    });

    if (document.getElementById('soundcloud-beastieboys')) {

      getSoundcloudSet(737966, function(data) {

        var i, tmp, item, items, bboys = [];
        if (data.streamable) {
          // playlist is cool to stream
          // TODO: Store meta info
          data = data.tracks;
        }
        for (item in data) {
          if (data.hasOwnProperty(item) && data[item].streamable) {
            sc_cache_data(data[item]);
            bboys.push(sc_cache[data[item].id]);
          }
        }

        if (bboys.length) {
          tmp = [];
          for (i=0; i<bboys.length; i++) {
            tmp.push('<li><a href="#" data-track-id="'+bboys[i].id+'" oncontextmenu="return false">' + bboys[i].title + '</a></li>');
          }
          document.getElementById('soundcloud-beastieboys').innerHTML = '<ol>' + tmp.join('') + '</ol>';
        }

      });

    }

  }

  var moreinfo_link = document.getElementById('moreinfo-link');

  moreinfo_link.onclick = function(e) {

    var controls = document.getElementById('controls'),
    css_open = 'open',
    was_open = controls.className === css_open;
    controls.className = (was_open ? '' : css_open);
    if (was_open) {
      // toggle-based effect
      window.location.hash = '#less';
      if (e) {
        e.preventDefault();
      }
      return false;
    } else {
      return true;
    }

  };

  if (window.location.hash && window.location.hash.match(/more/i) && document.getElementById('controls').className !== 'open') {

    // toggle things open
    moreinfo_link.onclick();

  }

  // assign key handlers
  keyData = {
    /**
     * structure assigned dynamically
     * eg.
     * ']' : { isDown: false} 
     */
  };

  /**
   * Would love to use DOM3 keyLocation to determine left/right-ness
   * of keys like shift + ctrl, but this doesn't seem to be
   * implemented as of may 2011. http://unixpapa.com/js/key.html
   * IE implements shiftLeft / shiftRight, but nobody else does.
   */

  var keyDownActions = {

    '16': function(e) { // shift key(s)
    },
    '37': function() { // left arrow
      mixer.data.crossFader.setValue(0);
    },
    '39': function() { // right arrow
      mixer.data.crossFader.setValue(100);
    },
    '38': function() { // up arrow
      mixer.data.crossFader.reset();
    },
    '40': function() { // down arrow
      mixer.data.crossFader.reset();
    },
    '49': function(e) { // 1
      editOrApplyCue(0, 0, e);
    },
    '50': function(e) {
      editOrApplyCue(0, 1, e);
    },
    '51': function(e) {
      editOrApplyCue(0, 2, e);
    },
    '52': function(e) {
      editOrApplyCue(0, 3, e);
    },
    '53': function(e) {
      editOrApplyCue(0, 4, e);
    },
    '54': function(e) {
      editOrApplyCue(1, 0, e);
    },
    '55': function(e) {
      editOrApplyCue(1, 1, e);
    },
    '56': function(e) {
      editOrApplyCue(1, 2, e);
    },
    '57': function(e) { // 9
      editOrApplyCue(1, 3, e);
    },
    '48': function(e) { // 0
      editOrApplyCue(1, 4, e);
    },
    '66': function(e) { // b
      if (e.shiftKey) {
        wheelsofsteel.toggleBattleMode();
      }
    },
    '68': function() {
      toggleDebug();
    },
    '83': function(e) { // s
      if (e.shiftKey) {
        wheelsofsteel.nextSkin();
      }
    }

  };

  var keyPressActions = {

    '-': function() {
      turntables[0].startPlatterNudge(-1);
    },
    '=': function() {
      turntables[0].startPlatterNudge(1);
    },
    '_': function() {
      turntables[1].startPlatterNudge(-1);
    },
    '+': function() {
      turntables[1].startPlatterNudge(1);
    },
    '[': function() {
      if (!keyIsDown('[')) {
        mixer.data.crossFader.data.lastValue = mixer.data.crossFader.dom.input.getAttribute('value');
        mixer.data.crossFader.setValue(0);
        // mixer.data.crossFader.update();
      }
    },
    ']': function() {
      if (!keyIsDown(']')) {
        mixer.data.crossFader.data.lastValue = mixer.data.crossFader.dom.input.getAttribute('value');
        mixer.data.crossFader.setValue(100);
        // mixer.data.crossFader.update();
      }
    },
    ',': function() { // < sans-shift
      turntables[0].toggleStartStop();
    },
    '.': function() { // > sans-shift
      turntables[1].toggleStartStop();
    },
    '<': function() {
      turntables[0].togglePowerDial();
    },
    '>': function() {
      turntables[1].togglePowerDial();
    }

  };

  var keyUpActions = {

    '16': function(e) { // shift key(s)
    },
    '189': function(e) { // -
      // shift may or may not be on.
      turntables[0].stopPlatterNudge();
      turntables[1].stopPlatterNudge();
    },
    '187': function(e) { // +
      // shift may or may not be on.
      turntables[0].stopPlatterNudge();
      turntables[1].stopPlatterNudge();
    },
    '219': function() { // [
      keyReset('[');
      if (mixer.data.crossFader.data.lastValue !== null) {
        var last = mixer.data.crossFader.data.lastValue;
          mixer.data.crossFader.setValue(last);
      }
    },
    '221': function() { // ]
      keyReset(']');
      if (mixer.data.crossFader.data.lastValue !== null) {
        var last = mixer.data.crossFader.data.lastValue;
          mixer.data.crossFader.setValue(last);
      }
    }

  };

  function keyHandlerDown(e) {

    // TODO: Handle repeated events when keys repeatedly fire?
    if (keyDownActions[e.keyCode] && safeForKeys(e)) {
      keyDownActions[e.keyCode](e);
    }

  }

  function keyHandlerPress(e) {

    var char = String.fromCharCode(e.charCode);
    if (keyPressActions[char] && safeForKeys(e)) {
      keyPressActions[char](e);
    }

  }

  function keyHandlerUp(e) {

    if (keyUpActions[e.keyCode] && safeForKeys(e)) {
      keyUpActions[e.keyCode](e);
    }

  }

  function shareOnTwitter(e) {

    var tweetURL = 'http://twitter.com/share?text=%s',
        tweetMessage = 'DJing from my browser on the "Wheels Of Steel" prototype:';

    window.open(tweetURL.replace('%s', encodeURIComponent(tweetMessage)), null, 'width=800,height=400');
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    return false;

  }

  function shareOnFacebook(e) {

    var fbURL = 'http://www.facebook.com/sharer.php?t=%title&u=%url',
        message = 'DJing from my browser on the Wheels Of Steel prototype',
        shareURL = fbURL.replace('%title', encodeURIComponent(message)).replace('%url', encodeURIComponent(window.location.href.toString()));
    window.open(shareURL, null, 'width=1000,height=600');
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    return false;

  }

  var urlParamsObj = utils.getURLParams(window.location.search.toString(), true);

  if (urlParamsObj.debug) {
    toggleDebug();
  }

  if (urlParamsObj.tripmat) {
    utils.addClass(document.getElementById(turntables[0].id), 'tripmat');
    utils.addClass(document.getElementById(turntables[1].id), 'tripmat');
  }

  if (urlParamsObj.skin) {
    try {
      wheelsofsteel.setSkin(urlParamsObj.skin);
    } catch(e) {
      // d'oh well
    }
  }

  // set/refresh scratch mode preference
  utils.storage.set('prefs', {
    'scratchMode': SCRATCH_MODE
  });

  if (loaderForm[0]) { // form is present...
    // look for tracks to load
    var item;
    if (urlParamsObj.track1) {
      loadURL(urlParamsObj.track1, 0);
    }
    if (urlParamsObj.track2) {
      loadURL(urlParamsObj.track2, 1);
    }
  }

  // expose to global
  wheelsofsteel.shareOnTwitter = shareOnTwitter;
  wheelsofsteel.shareOnFacebook = shareOnFacebook;

  utils.events.add(window, 'keydown', keyHandlerDown);
  utils.events.add(window, 'keypress', keyHandlerPress);
  utils.events.add(window, 'keyup', keyHandlerUp);

  mixer = new Mixer();

  // debug-mode only?
  timer.debugStats();
  window.setInterval(timer.debugStats, 2000);

});

window.setEQ = function(turntableID, eqIndex, eqInput) {

  var ttID = 'turntableSound'+turntableID,
      value = eqInput.value,
      max = eqInput.getAttribute('max'),
      mid = max/2,
      relativeValue,
      outValue;

  if (value >= 50) {

    relativeValue = value/max;

  } else {

    relativeValue = (mid - (mid * (mid-value)/mid))/100;
    if (isNaN(relativeValue)) { // wtf?
      relativeValue = 0;
    }

  }

  if (relativeValue >= 0.5) {

    outValue = 0.5 + ((relativeValue-0.5) * 3);

  } else {

    outValue = relativeValue;

  }

  if (!soundManager.html5Only) {
    soundManager.getMovie(soundManager.id)._setEQ(ttID, eqIndex, outValue);
  }

  // enable or disable if all values are centered
  var i,
      inputs = document.getElementById('tt-'+(turntableID+1)).querySelectorAll('.control-eq'),
      isSet = false;

  for (i=inputs.length; i--;) {
    if (inputs[i].value !== mid) {
      isSet = true;
      break;
    }
  }

  if (!soundManager.html5Only) {
    if (isSet) {
      soundManager.getMovie(soundManager.id)._enableEQ(ttID);
    } else {
      soundManager.getMovie(soundManager.id)._disableEQ(ttID);
    }
  }

};

function setBattleMode(bOn) {

  var sClass = 'battle-style',
      oElement = document.body;

  if (oElement && BATTLE_MODE !== bOn) {

    // we're shifting.
    utils[(bOn ? 'addClass' : 'removeClass')](oElement, sClass);

    BATTLE_MODE = bOn;

  }

  // invalidate DOM position data (since rotation will affect box model, need to re-get width/height etc.)
  // this is incomplete.
  /*
  turntables[0].data.record.offsetWidth = null;
  turntables[0].data.tonearm.offsetWidth = null;

  turntables[1].data.record.offsetWidth = null;
  turntables[1].data.tonearm.offsetWidth = null;
  */

}

function toggleBattleMode() {

  setBattleMode(!wheelsofsteel.getBattleMode());

}

function getBattleMode() {

  return BATTLE_MODE;

}

wheelsofsteel.setBattleMode = setBattleMode;
wheelsofsteel.getBattleMode = getBattleMode;
wheelsofsteel.toggleBattleMode = toggleBattleMode;

// skin/theme bits

var skins = ['','yahoo','flickr'],
    currentSkin = 0;

wheelsofsteel.setSkin = function(sName) {
  var i, skin;
  for (i=skins.length; i--;) {
    if (skins[i] === sName) {
      document.body.className = ['has_js', skins[i]].join(' ');
      currentSkin = i;
      break;
    }
  }
  return false;
};

wheelsofsteel.nextSkin = function(e) {
  currentSkin++;
  if (currentSkin >= skins.length) {
    currentSkin = 0;
  }
  document.body.className = ['has_js', skins[currentSkin]].join(' ');
  e.preventDefault();
  return false;
};

// expose instances to the window.wheelsofsteel global

wheelsofsteel.mixer = mixer;
wheelsofsteel.turntables = turntables;

}(window)); // invocation
