require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
;(function () {

  var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function InvalidCharacterError(message) {
    this.message = message;
  }
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  // encoder
  // [https://gist.github.com/999166] by [https://github.com/nignag]
  object.btoa || (
  object.btoa = function (input) {
    for (
      // initialize result and counter
      var block, charCode, idx = 0, map = chars, output = '';
      // if the next input index does not exist:
      //   change the mapping table to "="
      //   check if d has no fractional digits
      input.charAt(idx | 0) || (map = '=', idx % 1);
      // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
      output += map.charAt(63 & block >> 8 - idx % 1 * 8)
    ) {
      charCode = input.charCodeAt(idx += 3/4);
      if (charCode > 0xFF) {
        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  });

  // decoder
  // [https://gist.github.com/1020396] by [https://github.com/atk]
  object.atob || (
  object.atob = function (input) {
    input = input.replace(/=+$/, '');
    if (input.length % 4 == 1) {
      throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
      // initialize result and counters
      var bc = 0, bs, buffer, idx = 0, output = '';
      // get next character
      buffer = input.charAt(idx++);
      // character found in table? initialize bit storage and add its ascii value;
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        // and if not first of each 4 characters,
        // convert the first 8 bits to one ascii character
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      // try to find character in table (0-63, not found => -1)
      buffer = chars.indexOf(buffer);
    }
    return output;
  });

}());

},{}],2:[function(require,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 1.0.1 Copyright (c) 2011-2016, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [requireFn]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = require('path'),
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                if (callback) {
                    process.nextTick(function () {
                        callback.apply(null, deps);
                    });
                }
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    requireFn = requireFn || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(requireFn, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(requireFn, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(m.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

}).call(this,require('_process'),"/node_modules/amdefine/amdefine.js")
},{"_process":65,"path":64}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){

},{}],5:[function(require,module,exports){
arguments[4][4][0].apply(exports,arguments)
},{"dup":4}],6:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Safari 5-7 lacks support for changing the `Object.prototype.constructor` property
 *     on objects.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

function typedArraySupport () {
  function Bar () {}
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    arr.constructor = Bar
    return arr.foo() === 42 && // typed array instances can be augmented
        arr.constructor === Bar && // constructor can be set
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    this.length = 0
    this.parent = undefined
  }

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (object.buffer instanceof ArrayBuffer) {
      return fromTypedArray(that, object)
    }
    if (object instanceof ArrayBuffer) {
      return fromArrayBuffer(that, object)
    }
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    array.byteLength
    that = Buffer._augment(new Uint8Array(array))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromTypedArray(that, new Uint8Array(array))
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
} else {
  // pre-set for values that may exist in the future
  Buffer.prototype.length = undefined
  Buffer.prototype.parent = undefined
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` is deprecated
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` is deprecated
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":3,"ieee754":59,"isarray":7}],7:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],8:[function(require,module,exports){
(function (process){
/**
 * Clean-css - https://github.com/jakubpawlowicz/clean-css
 * Released under the terms of MIT license
 *
 * Copyright (C) 2014 JakubPawlowicz.com
 */

var ImportInliner = require('./imports/inliner');
var UrlRebase = require('./images/url-rebase');
var SelectorsOptimizer = require('./selectors/optimizer');
var Stringifier = require('./selectors/stringifier');
var SourceMapStringifier = require('./selectors/source-map-stringifier');

var CommentsProcessor = require('./text/comments-processor');
var ExpressionsProcessor = require('./text/expressions-processor');
var FreeTextProcessor = require('./text/free-text-processor');
var UrlsProcessor = require('./text/urls-processor');

var Compatibility = require('./utils/compatibility');
var InputSourceMapTracker = require('./utils/input-source-map-tracker');
var SourceTracker = require('./utils/source-tracker');
var SourceReader = require('./utils/source-reader');

var DEFAULT_TIMEOUT = 5000;

var CleanCSS = module.exports = function CleanCSS(options) {
  options = options || {};

  this.options = {
    advanced: undefined === options.advanced ? true : !!options.advanced,
    aggressiveMerging: undefined === options.aggressiveMerging ? true : !!options.aggressiveMerging,
    benchmark: options.benchmark,
    compatibility: new Compatibility(options.compatibility).toOptions(),
    debug: options.debug,
    inliner: options.inliner || {},
    keepBreaks: options.keepBreaks || false,
    keepSpecialComments: 'keepSpecialComments' in options ? options.keepSpecialComments : '*',
    processImport: undefined === options.processImport ? true : !!options.processImport,
    rebase: undefined === options.rebase ? true : !!options.rebase,
    relativeTo: options.relativeTo,
    root: options.root,
    roundingPrecision: options.roundingPrecision,
    shorthandCompacting: !!options.sourceMap ? false : (undefined === options.shorthandCompacting ? true : !!options.shorthandCompacting),
    sourceMap: options.sourceMap,
    target: options.target
  };

  this.options.inliner.timeout = this.options.inliner.timeout || DEFAULT_TIMEOUT;
  this.options.inliner.request = this.options.inliner.request || {};
};

CleanCSS.prototype.minify = function(data, callback) {
  var context = {
    stats: {},
    errors: [],
    warnings: [],
    options: this.options,
    debug: this.options.debug,
    sourceTracker: new SourceTracker()
  };

  data = new SourceReader(context, data).toString();

  if (context.options.processImport || data.indexOf('@shallow') > 0) {
    // inline all imports
    var runner = callback ?
      process.nextTick :
      function (callback) { return callback(); };

    return runner(function () {
      return new ImportInliner(context).process(data, {
        localOnly: !callback,
        whenDone: runMinifier(callback, context)
      });
    });
  } else {
    return runMinifier(callback, context)(data);
  }
};

function runMinifier(callback, context) {
  function whenSourceMapReady (data) {
    data = context.options.debug ?
      minifyWithDebug(context, data) :
      minify(context, data);
    data = withMetadata(context, data);

    return callback ?
      callback.call(null, context.errors.length > 0 ? context.errors : null, data) :
      data;
  }

  return function (data) {
    if (context.options.sourceMap) {
      context.inputSourceMapTracker = new InputSourceMapTracker(context);
      return context.inputSourceMapTracker.track(data, function () { return whenSourceMapReady(data); });
    } else {
      return whenSourceMapReady(data);
    }
  };
}

function withMetadata(context, data) {
  data.stats = context.stats;
  data.errors = context.errors;
  data.warnings = context.warnings;
  return data;
}

function minifyWithDebug(context, data) {
  var startedAt = process.hrtime();
  context.stats.originalSize = context.sourceTracker.removeAll(data).length;

  data = minify(context, data);

  var elapsed = process.hrtime(startedAt);
  context.stats.timeSpent = ~~(elapsed[0] * 1e3 + elapsed[1] / 1e6);
  context.stats.efficiency = 1 - data.styles.length / context.stats.originalSize;
  context.stats.minifiedSize = data.styles.length;

  return data;
}

function benchmark(runner) {
  return function (processor, action) {
    var name =  processor.constructor.name + '#' + action;
    var start = process.hrtime();
    runner(processor, action);
    var itTook = process.hrtime(start);
    console.log('%d ms: ' + name, 1000 * itTook[0] + itTook[1] / 1000000);
  };
}

function minify(context, data) {
  var options = context.options;
  var sourceMapTracker = context.inputSourceMapTracker;

  var commentsProcessor = new CommentsProcessor(context, options.keepSpecialComments, options.keepBreaks, options.sourceMap);
  var expressionsProcessor = new ExpressionsProcessor(options.sourceMap);
  var freeTextProcessor = new FreeTextProcessor(options.sourceMap);
  var urlsProcessor = new UrlsProcessor(context, options.sourceMap);

  var urlRebase = new UrlRebase(context);
  var selectorsOptimizer = new SelectorsOptimizer(options, context);
  var stringifierClass = options.sourceMap ? SourceMapStringifier : Stringifier;

  var run = function (processor, action) {
    data = typeof processor == 'function' ?
      processor(data) :
      processor[action](data);
  };

  if (options.benchmark)
    run = benchmark(run);

  run(commentsProcessor, 'escape');
  run(expressionsProcessor, 'escape');
  run(urlsProcessor, 'escape');
  run(freeTextProcessor, 'escape');

  run(function() {
    var stringifier = new stringifierClass(options, function (data) {
      data = freeTextProcessor.restore(data);
      data = urlsProcessor.restore(data);
      data = options.rebase ? urlRebase.process(data) : data;
      data = expressionsProcessor.restore(data);
      return commentsProcessor.restore(data);
    }, sourceMapTracker);

    return selectorsOptimizer.process(data, stringifier);
  });

  return data;
}

}).call(this,require('_process'))
},{"./images/url-rebase":12,"./imports/inliner":14,"./selectors/optimizer":21,"./selectors/source-map-stringifier":25,"./selectors/stringifier":26,"./text/comments-processor":28,"./text/expressions-processor":30,"./text/free-text-processor":31,"./text/urls-processor":32,"./utils/compatibility":34,"./utils/input-source-map-tracker":36,"./utils/source-reader":40,"./utils/source-tracker":41,"_process":65}],9:[function(require,module,exports){
var HexNameShortener = {};

var COLORS = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#0ff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000',
  blanchedalmond: '#ffebcd',
  blue: '#00f',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#0ff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#f0f',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#0f0',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#f00',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#fff',
  whitesmoke: '#f5f5f5',
  yellow: '#ff0',
  yellowgreen: '#9acd32'
};

var toHex = {};
var toName = {};

for (var name in COLORS) {
  var hex = COLORS[name];
  if (name.length < hex.length)
    toName[hex] = name;
  else
    toHex[name] = hex;
}

var toHexPattern = new RegExp('(' + Object.keys(toHex).join('|') + ')( |,|\\)|$)', 'ig');
var toNamePattern = new RegExp('(' + Object.keys(toName).join('|') + ')([^a-f0-9]|$)', 'ig');

HexNameShortener.shorten = function (value) {
  var hasHex = value.indexOf('#') > -1;
  var shortened = value.replace(toHexPattern, function(match, colorValue, suffix) {
    return toHex[colorValue.toLowerCase()] + suffix;
  });

  if (hasHex) {
    shortened = shortened.replace(toNamePattern, function(match, colorValue, suffix) {
      return toName[colorValue.toLowerCase()] + suffix;
    });
  }

  return shortened;
};

module.exports = HexNameShortener;

},{}],10:[function(require,module,exports){
// HSL to RGB converter. Both methods adapted from:
// http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript

function HSLColor(hue, saturation, lightness) {
  this.hue = hue;
  this.saturation = saturation;
  this.lightness = lightness;
}

function hslToRgb(h, s, l) {
  var r, g, b;

  // normalize hue orientation b/w 0 and 360 degrees
  h = h % 360;
  if (h < 0)
    h += 360;
  h = ~~h / 360;

  if (s < 0)
    s = 0;
  else if (s > 100)
    s = 100;
  s = ~~s / 100;

  if (l < 0)
    l = 0;
  else if (l > 100)
    l = 100;
  l = ~~l / 100;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    var q = l < 0.5 ?
      l * (1 + s) :
      l + s - l * s;
    var p = 2 * l - q;
    r = hueToRgb(p, q, h + 1/3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1/3);
  }

  return [~~(r * 255), ~~(g * 255), ~~(b * 255)];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

HSLColor.prototype.toHex = function () {
  var asRgb = hslToRgb(this.hue, this.saturation, this.lightness);
  var redAsHex = asRgb[0].toString(16);
  var greenAsHex = asRgb[1].toString(16);
  var blueAsHex = asRgb[2].toString(16);

  return '#' +
    ((redAsHex.length == 1 ? '0' : '') + redAsHex) +
    ((greenAsHex.length == 1 ? '0' : '') + greenAsHex) +
    ((blueAsHex.length == 1 ? '0' : '') + blueAsHex);
};

module.exports = HSLColor;

},{}],11:[function(require,module,exports){
function RGB(red, green, blue) {
  this.red = red;
  this.green = green;
  this.blue = blue;
}

RGB.prototype.toHex = function () {
  var red = Math.max(0, Math.min(~~this.red, 255));
  var green = Math.max(0, Math.min(~~this.green, 255));
  var blue = Math.max(0, Math.min(~~this.blue, 255));

  // Credit: Asen  http://jsbin.com/UPUmaGOc/2/edit?js,console
  return '#' + ('00000' + (red << 16 | green << 8 | blue).toString(16)).slice(-6);
};

module.exports = RGB;

},{}],12:[function(require,module,exports){
var fs = require('fs');
var path = require('path');

var UrlRewriter = require('./url-rewriter');

function UrlRebase(outerContext) {
  this.outerContext = outerContext;
}

UrlRebase.prototype.process = function (data) {
  var options = this.outerContext.options;

  var rebaseOpts = {
    absolute: !!options.root,
    relative: !options.root && !!options.target,
    fromBase: options.relativeTo
  };

  if (!rebaseOpts.absolute && !rebaseOpts.relative)
    return data;

  if (rebaseOpts.absolute && !!options.target)
    this.outerContext.warnings.push('Both \'root\' and output file given so rebasing URLs as absolute paths');

  if (rebaseOpts.absolute)
    rebaseOpts.toBase = path.resolve(options.root);

  if (rebaseOpts.relative) {
    var target = fs.existsSync(options.target) && fs.statSync(options.target).isDirectory() ?
      options.target :
      path.dirname(options.target);

    rebaseOpts.toBase = path.resolve(target);
  }

  if (!rebaseOpts.fromBase || !rebaseOpts.toBase)
    return data;

  return new UrlRewriter(rebaseOpts).process(data);
};

module.exports = UrlRebase;

},{"./url-rewriter":13,"fs":5,"path":64}],13:[function(require,module,exports){
(function (process){
var path = require('path');
var url = require('url');

function UrlRewriter(options) {
  this.options = options;
}

UrlRewriter.prototype.process = function (data) {
  var tempData = [];
  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;

  for (; nextEnd < data.length;) {
    nextStart = data.indexOf('url(', nextEnd);
    if (nextStart == -1)
      break;

    nextEnd = data.indexOf(')', nextStart + 4);
    if (nextEnd == -1)
      break;

    tempData.push(data.substring(cursor, nextStart));
    var url = data.substring(nextStart + 4, nextEnd);
    if (!/\/\*|\*\//.test(url))
      url = url.replace(/['"]/g, '');

    tempData.push('url(' + rebase(url, this.options) + ')');
    cursor = nextEnd + 1;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

function rebase(resource, options) {
  var specialUrl = resource[0] == '/' ||
    resource[0] == '#' ||
    resource.substring(resource.length - 4) == '.css' ||
    resource.indexOf('data:') === 0 ||
    /^https?:\/\//.exec(resource) !== null ||
    /__\w+__/.exec(resource) !== null;
  var rebased;

  if (specialUrl)
    return resource;

  if (/https?:\/\//.test(options.toBase))
    return url.resolve(options.toBase, resource);

  if (options.absolute) {
    rebased = path
      .resolve(path.join(options.fromBase, resource))
      .replace(options.toBase, '');
  } else {
    rebased = path.relative(options.toBase, path.join(options.fromBase, resource));
  }

  return process.platform == 'win32' ?
    rebased.replace(/\\/g, '/') :
    rebased;
}

module.exports = UrlRewriter;

}).call(this,require('_process'))
},{"_process":65,"path":64,"url":82}],14:[function(require,module,exports){
(function (process){
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var url = require('url');

var UrlRewriter = require('../images/url-rewriter');
var Splitter = require('../utils/splitter.js');
var override = require('../utils/object.js').override;

var MAP_MARKER = /\/\*# sourceMappingURL=(\S+) \*\//;
var REMOTE_RESOURCE = /^(https?:)?\/\//;

function ImportInliner (context) {
  this.outerContext = context;
}

ImportInliner.prototype.process = function (data, context) {
  var root = this.outerContext.options.root || process.cwd();

  context = override(context, {
    baseRelativeTo: this.outerContext.options.relativeTo || root,
    debug: this.outerContext.options.debug,
    done: [],
    errors: this.outerContext.errors,
    left: [],
    inliner: this.outerContext.options.inliner,
    rebase: this.outerContext.options.rebase,
    relativeTo: this.outerContext.options.relativeTo || root,
    root: root,
    sourceTracker: this.outerContext.sourceTracker,
    warnings: this.outerContext.warnings,
    visited: []
  });

  return importFrom(data, context);
};

function importFrom(data, context) {
  if (context.shallow) {
    context.shallow = false;
    context.done.push(data);
    return processNext(context);
  }

  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;
  var isComment = commentScanner(data);
  var afterContent = contentScanner(data);

  for (; nextEnd < data.length;) {
    nextStart = nextImportAt(data, cursor);
    if (nextStart == -1)
      break;

    if (isComment(nextStart)) {
      cursor = nextStart + 1;
      continue;
    }

    nextEnd = data.indexOf(';', nextStart);
    if (nextEnd == -1) {
      cursor = data.length;
      data = '';
      break;
    }

    context.done.push(data.substring(0, nextStart));
    context.left.unshift([data.substring(nextEnd + 1), context]);

    return afterContent(nextStart) ?
      processNext(context) :
      inline(data, nextStart, nextEnd, context);
  }

  // no @import matched in current data
  context.done.push(data);
  return processNext(context);
}

function rebaseMap(data, source) {
  return data.replace(MAP_MARKER, function (match, sourceMapUrl) {
    return REMOTE_RESOURCE.test(sourceMapUrl) ?
      match :
      match.replace(sourceMapUrl, url.resolve(source, sourceMapUrl));
  });
}

function nextImportAt(data, cursor) {
  var nextLowerCase = data.indexOf('@import', cursor);
  var nextUpperCase = data.indexOf('@IMPORT', cursor);

  if (nextLowerCase > -1 && nextUpperCase == -1)
    return nextLowerCase;
  else if (nextLowerCase == -1 && nextUpperCase > -1)
    return nextUpperCase;
  else
    return Math.min(nextLowerCase, nextUpperCase);
}

function processNext(context) {
  return context.left.length > 0 ?
    importFrom.apply(null, context.left.shift()) :
    context.whenDone(context.done.join(''));
}

function commentScanner(data) {
  var commentRegex = /(\/\*(?!\*\/)[\s\S]*?\*\/)/;
  var lastStartIndex = 0;
  var lastEndIndex = 0;
  var noComments = false;

  // test whether an index is located within a comment
  return function scanner(idx) {
    var comment;
    var localStartIndex = 0;
    var localEndIndex = 0;
    var globalStartIndex = 0;
    var globalEndIndex = 0;

    // return if we know there are no more comments
    if (noComments)
      return false;

    // idx can be still within last matched comment (many @import statements inside one comment)
    if (idx > lastStartIndex && idx < lastEndIndex)
      return true;

    comment = data.match(commentRegex);

    if (!comment) {
      noComments = true;
      return false;
    }

    // get the indexes relative to the current data chunk
    lastStartIndex = localStartIndex = comment.index;
    localEndIndex = localStartIndex + comment[0].length;

    // calculate the indexes relative to the full original data
    globalEndIndex = localEndIndex + lastEndIndex;
    globalStartIndex = globalEndIndex - comment[0].length;

    // chop off data up to and including current comment block
    data = data.substring(localEndIndex);
    lastEndIndex = globalEndIndex;

    // re-run scan if comment ended before the idx
    if (globalEndIndex < idx)
      return scanner(idx);

    return globalEndIndex > idx && idx > globalStartIndex;
  };
}

function contentScanner(data) {
  var isComment = commentScanner(data);
  var firstContentIdx = -1;
  while (true) {
    firstContentIdx = data.indexOf('{', firstContentIdx + 1);
    if (firstContentIdx == -1 || !isComment(firstContentIdx))
      break;
  }

  return function(idx) {
    return firstContentIdx > -1 ?
      idx > firstContentIdx :
      false;
  };
}

function inline(data, nextStart, nextEnd, context) {
  context.shallow = data.indexOf('@shallow') > 0;

  var importDeclaration = data
    .substring(nextImportAt(data, nextStart) + '@import'.length + 1, nextEnd)
    .replace(/@shallow\)$/, ')')
    .trim();

  var viaUrl = importDeclaration.indexOf('url(') === 0;
  var urlStartsAt = viaUrl ? 4 : 0;
  var isQuoted = /^['"]/.exec(importDeclaration.substring(urlStartsAt, urlStartsAt + 2));
  var urlEndsAt = isQuoted ?
    importDeclaration.indexOf(isQuoted[0], urlStartsAt + 1) :
    new Splitter(' ').split(importDeclaration)[0].length - (viaUrl ? 1 : 0);

  var importedFile = importDeclaration
    .substring(urlStartsAt, urlEndsAt)
    .replace(/['"]/g, '')
    .replace(/\)$/, '')
    .trim();

  var mediaQuery = importDeclaration
    .substring(urlEndsAt + 1)
    .replace(/^\)/, '')
    .trim();

  var isRemote = context.isRemote || REMOTE_RESOURCE.test(importedFile);

  if (context.localOnly && isRemote) {
    context.warnings.push('Ignoring remote @import declaration of "' + importedFile + '" as no callback given.');
    restoreImport(importedFile, mediaQuery, context);

    return processNext(context);
  }

  var method = isRemote ? inlineRemoteResource : inlineLocalResource;
  return method(importedFile, mediaQuery, context);
}

function inlineRemoteResource(importedFile, mediaQuery, context) {
  var importedUrl = REMOTE_RESOURCE.test(importedFile) ?
    importedFile :
    url.resolve(context.relativeTo, importedFile);

  if (importedUrl.indexOf('//') === 0)
    importedUrl = 'http:' + importedUrl;

  if (context.visited.indexOf(importedUrl) > -1)
    return processNext(context);


  if (context.debug)
    console.error('Inlining remote stylesheet: ' + importedUrl);

  context.visited.push(importedUrl);

  var get = importedUrl.indexOf('http://') === 0 ?
    http.get :
    https.get;

  function handleError(message) {
    context.errors.push('Broken @import declaration of "' + importedUrl + '" - ' + message);
    restoreImport(importedUrl, mediaQuery, context);

    processNext(context);
  }

  var requestOptions = override(url.parse(importedUrl), context.inliner.request);
  get(requestOptions, function(res) {
    if (res.statusCode < 200 || res.statusCode > 399) {
      return handleError('error ' + res.statusCode);
    } else if (res.statusCode > 299) {
      var movedUrl = url.resolve(importedUrl, res.headers.location);
      return inlineRemoteResource(movedUrl, mediaQuery, context);
    }

    var chunks = [];
    var parsedUrl = url.parse(importedUrl);
    res.on('data', function(chunk) {
      chunks.push(chunk.toString());
    });
    res.on('end', function() {
      var importedData = chunks.join('');
      if (context.rebase)
        importedData = new UrlRewriter({ toBase: importedUrl }).process(importedData);
      importedData = context.sourceTracker.store(importedUrl, importedData);
      importedData = rebaseMap(importedData, importedUrl);

      if (mediaQuery.length > 0)
        importedData = '@media ' + mediaQuery + '{' + importedData + '}';

      var newContext = override(context, {
        isRemote: true,
        relativeTo: parsedUrl.protocol + '//' + parsedUrl.host
      });

      importFrom(importedData, newContext);
    });
  })
  .on('error', function(res) {
    handleError(res.message);
  })
  .on('timeout', function() {
    handleError('timeout');
  })
  .setTimeout(context.inliner.timeout);
}

function inlineLocalResource(importedFile, mediaQuery, context) {
  var relativeTo = importedFile[0] == '/' ?
    context.root :
    context.relativeTo;

  var fullPath = path.resolve(path.join(relativeTo, importedFile));

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    context.errors.push('Broken @import declaration of "' + importedFile + '"');
    return processNext(context);
  }

  if (context.visited.indexOf(fullPath) > -1)
    return processNext(context);


  if (context.debug)
    console.error('Inlining local stylesheet: ' + fullPath);

  context.visited.push(fullPath);

  var importRelativeTo = path.dirname(fullPath);
  var importedData = fs.readFileSync(fullPath, 'utf8');
  if (context.rebase) {
    var rewriter = new UrlRewriter({
      relative: true,
      fromBase: importRelativeTo,
      toBase: context.baseRelativeTo
    });
    importedData = rewriter.process(importedData);
  }
  importedData = context.sourceTracker.store(path.resolve(context.relativeTo, fullPath), importedData);

  if (mediaQuery.length > 0)
    importedData = '@media ' + mediaQuery + '{' + importedData + '}';

  var newContext = override(context, {
    relativeTo: importRelativeTo,
  });

  return importFrom(importedData, newContext);
}

function restoreImport(importedUrl, mediaQuery, context) {
  var restoredImport = '@import url(' + importedUrl + ')' + (mediaQuery.length > 0 ? ' ' + mediaQuery : '') + ';';
  context.done.push(restoredImport);
}

module.exports = ImportInliner;

}).call(this,require('_process'))
},{"../images/url-rewriter":13,"../utils/object.js":37,"../utils/splitter.js":42,"_process":65,"fs":5,"http":55,"https":58,"path":64,"url":82}],15:[function(require,module,exports){

var processableInfo = require('./processable');
var overrideCompactor = require('./override-compactor');
var shorthandCompactor = require('./shorthand-compactor');

function valueMapper(object) { return object.value; }

module.exports = function Optimizer(options, context) {
  var overridable = {
    'animation-delay': ['animation'],
    'animation-direction': ['animation'],
    'animation-duration': ['animation'],
    'animation-fill-mode': ['animation'],
    'animation-iteration-count': ['animation'],
    'animation-name': ['animation'],
    'animation-play-state': ['animation'],
    'animation-timing-function': ['animation'],
    '-moz-animation-delay': ['-moz-animation'],
    '-moz-animation-direction': ['-moz-animation'],
    '-moz-animation-duration': ['-moz-animation'],
    '-moz-animation-fill-mode': ['-moz-animation'],
    '-moz-animation-iteration-count': ['-moz-animation'],
    '-moz-animation-name': ['-moz-animation'],
    '-moz-animation-play-state': ['-moz-animation'],
    '-moz-animation-timing-function': ['-moz-animation'],
    '-o-animation-delay': ['-o-animation'],
    '-o-animation-direction': ['-o-animation'],
    '-o-animation-duration': ['-o-animation'],
    '-o-animation-fill-mode': ['-o-animation'],
    '-o-animation-iteration-count': ['-o-animation'],
    '-o-animation-name': ['-o-animation'],
    '-o-animation-play-state': ['-o-animation'],
    '-o-animation-timing-function': ['-o-animation'],
    '-webkit-animation-delay': ['-webkit-animation'],
    '-webkit-animation-direction': ['-webkit-animation'],
    '-webkit-animation-duration': ['-webkit-animation'],
    '-webkit-animation-fill-mode': ['-webkit-animation'],
    '-webkit-animation-iteration-count': ['-webkit-animation'],
    '-webkit-animation-name': ['-webkit-animation'],
    '-webkit-animation-play-state': ['-webkit-animation'],
    '-webkit-animation-timing-function': ['-webkit-animation'],
    'background-clip': ['background'],
    'background-origin': ['background'],
    'border-color': ['border'],
    'border-style': ['border'],
    'border-width': ['border'],
    'border-bottom': ['border'],
    'border-bottom-color': ['border-bottom', 'border-color', 'border'],
    'border-bottom-style': ['border-bottom', 'border-style', 'border'],
    'border-bottom-width': ['border-bottom', 'border-width', 'border'],
    'border-left': ['border'],
    'border-left-color': ['border-left', 'border-color', 'border'],
    'border-left-style': ['border-left', 'border-style', 'border'],
    'border-left-width': ['border-left', 'border-width', 'border'],
    'border-right': ['border'],
    'border-right-color': ['border-right', 'border-color', 'border'],
    'border-right-style': ['border-right', 'border-style', 'border'],
    'border-right-width': ['border-right', 'border-width', 'border'],
    'border-top': ['border'],
    'border-top-color': ['border-top', 'border-color', 'border'],
    'border-top-style': ['border-top', 'border-style', 'border'],
    'border-top-width': ['border-top', 'border-width', 'border'],
    'font-family': ['font'],
    'font-size': ['font'],
    'font-style': ['font'],
    'font-variant': ['font'],
    'font-weight': ['font'],
    'margin-bottom': ['margin'],
    'margin-left': ['margin'],
    'margin-right': ['margin'],
    'margin-top': ['margin'],
    'padding-bottom': ['padding'],
    'padding-left': ['padding'],
    'padding-right': ['padding'],
    'padding-top': ['padding'],
    'transition-delay': ['transition'],
    'transition-duration': ['transition'],
    'transition-property': ['transition'],
    'transition-timing-function': ['transition'],
    '-moz-transition-delay': ['-moz-transition'],
    '-moz-transition-duration': ['-moz-transition'],
    '-moz-transition-property': ['-moz-transition'],
    '-moz-transition-timing-function': ['-moz-transition'],
    '-o-transition-delay': ['-o-transition'],
    '-o-transition-duration': ['-o-transition'],
    '-o-transition-property': ['-o-transition'],
    '-o-transition-timing-function': ['-o-transition'],
    '-webkit-transition-delay': ['-webkit-transition'],
    '-webkit-transition-duration': ['-webkit-transition'],
    '-webkit-transition-property': ['-webkit-transition'],
    '-webkit-transition-timing-function': ['-webkit-transition']
  };

  var compatibility = options.compatibility;
  var aggressiveMerging = options.aggressiveMerging;
  var shorthandCompacting = options.shorthandCompacting;

  var IE_BACKSLASH_HACK = '\\9';
  var processable = processableInfo.processable(compatibility);

  var overrides = {};
  for (var granular in overridable) {
    for (var i = 0; i < overridable[granular].length; i++) {
      var coarse = overridable[granular][i];
      var list = overrides[coarse];

      if (list)
        list.push(granular);
      else
        overrides[coarse] = [granular];
    }
  }

  var tokenize = function(body, selector) {
    var keyValues = [];

    for (var i = 0, l = body.length; i < l; i++) {
      var token = body[i];
      var firstColon = token.value.indexOf(':');
      var property = token.value.substring(0, firstColon);
      var value = token.value.substring(firstColon + 1);
      if (value === '') {
        context.warnings.push('Empty property \'' + property + '\' inside \'' + selector.map(valueMapper).join(',') + '\' selector. Ignoring.');
        continue;
      }

      keyValues.push([
        property,
        value,
        token.value.indexOf('!important') > -1,
        token.value.indexOf(IE_BACKSLASH_HACK, firstColon + 1) === token.value.length - IE_BACKSLASH_HACK.length,
        token.metadata
      ]);
    }

    return keyValues;
  };

  var optimize = function(tokens, allowAdjacent) {
    var merged = [];
    var properties = [];
    var lastProperty = null;
    var rescanTrigger = {};

    var removeOverridenBy = function(property, isImportant) {
      var overrided = overrides[property];
      for (var i = 0, l = overrided.length; i < l; i++) {
        for (var j = 0; j < properties.length; j++) {
          if (properties[j] != overrided[i] || (merged[j][2] && !isImportant))
            continue;

          merged.splice(j, 1);
          properties.splice(j, 1);
          j -= 1;
        }
      }
    };

    var mergeablePosition = function(position) {
      if (allowAdjacent === false || allowAdjacent === true)
        return allowAdjacent;

      return allowAdjacent.indexOf(position) > -1;
    };

    tokensLoop:
    for (var i = 0, l = tokens.length; i < l; i++) {
      var token = tokens[i];
      var property = token[0];
      var value = token[1];
      var isImportant = token[2];
      var isIEHack = token[3];
      var _property = (property == '-ms-filter' || property == 'filter') ?
        (lastProperty == 'background' || lastProperty == 'background-image' ? lastProperty : property) :
        property;
      var toOverridePosition = 0;

      if (isIEHack && !compatibility.properties.ieSuffixHack)
        continue;

      // comment is necessary - we assume that if two properties are one after another
      // then it is intentional way of redefining property which may not be widely supported
      // e.g. a{display:inline-block;display:-moz-inline-box}
      // however if `mergeablePosition` yields true then the rule does not apply
      // (e.g merging two adjacent selectors: `a{display:block}a{display:block}`)
      if (aggressiveMerging && property !== '' && _property != lastProperty || mergeablePosition(i)) {
        while (true) {
          toOverridePosition = properties.indexOf(_property, toOverridePosition);
          if (toOverridePosition == -1)
            break;

          var lastToken = merged[toOverridePosition];
          var wasImportant = lastToken[2];
          var wasIEHack = lastToken[3];

          if (wasImportant && !isImportant)
            continue tokensLoop;

          if (compatibility.properties.ieSuffixHack && !wasIEHack && isIEHack)
            break;

          var _info = processable[_property];
          if (!isIEHack && !wasIEHack && _info && _info.canOverride && !_info.canOverride(tokens[toOverridePosition][1], value))
            break;

          merged.splice(toOverridePosition, 1);
          properties.splice(toOverridePosition, 1);
        }
      }

      merged.push(token);
      properties.push(_property);

      // certain properties (see values of `overridable`) should trigger removal of
      // more granular properties (see keys of `overridable`)
      if (rescanTrigger[_property])
        removeOverridenBy(_property, isImportant);

      // add rescan triggers - if certain property appears later in the list a rescan needs
      // to be triggered, e.g 'border-top' triggers a rescan after 'border-top-width' and
      // 'border-top-color' as they can be removed
      for (var j = 0, list = overridable[_property] || [], m = list.length; j < m; j++)
        rescanTrigger[list[j]] = true;

      lastProperty = _property;
    }

    return merged;
  };

  var rebuild = function(tokens) {
    var tokenized = [];
    var list = [];
    var eligibleForCompacting = false;

    for (var i = 0, l = tokens.length; i < l; i++) {
      if (!eligibleForCompacting && processableInfo.implementedFor.test(tokens[i][0]))
        eligibleForCompacting = true;

      // FIXME: the check should be gone with #396
      var property = !tokens[i][0] && tokens[i][1].indexOf('__ESCAPED_') === 0 ?
        tokens[i][1] :
        tokens[i][0] + ':' + tokens[i][1];
      tokenized.push({ value: property, metadata: tokens[i][4] });
      list.push(property);
    }

    return {
      compactFurther: eligibleForCompacting,
      list: list,
      tokenized: tokenized
    };
  };

  var compact = function (input) {
    var Token = processableInfo.Token;

    var tokens = Token.tokenize(input);

    tokens = overrideCompactor.compactOverrides(tokens, processable, Token, compatibility);
    tokens = shorthandCompactor.compactShorthands(tokens, false, processable, Token);
    tokens = shorthandCompactor.compactShorthands(tokens, true, processable, Token);

    return Token.detokenize(tokens);
  };

  return {
    process: function(selector, body, allowAdjacent, compactProperties) {
      var tokenized = tokenize(body, selector);
      var optimized = optimize(tokenized, allowAdjacent);
      var rebuilt = rebuild(optimized);

      return shorthandCompacting && compactProperties && rebuilt.compactFurther ?
        compact(rebuilt.tokenized) :
        rebuilt;
    }
  };
};

},{"./override-compactor":16,"./processable":17,"./shorthand-compactor":18}],16:[function(require,module,exports){

// Compacts the given tokens according to their ability to override each other.

var validator = require('./validator');

module.exports = (function () {
  // Default override function: only allow overrides when the two values are the same
  var sameValue = function (val1, val2) {
    return val1 === val2;
  };

  var compactOverrides = function (tokens, processable, Token, compatibility) {
    var result, can, token, t, i, ii, iiii, oldResult, matchingComponent;

    // Used when searching for a component that matches token
    var nameMatchFilter1 = function (x) {
      return x.prop === token.prop;
    };
    // Used when searching for a component that matches t
    var nameMatchFilter2 = function (x) {
      return x.prop === t.prop;
    };

    function willResultInShorterValue (shorthand, token) {
      var shorthandCopy = shorthand.clone();
      shorthandCopy.isDirty = true;
      shorthandCopy.isShorthand = true;
      shorthandCopy.components = [];

      shorthand.components.forEach(function (component) {
        var componentCopy = component.clone();
        if (component.prop == token.prop)
          componentCopy.value = token.value;

        shorthandCopy.components.push(componentCopy);
      });

      return Token.getDetokenizedLength([shorthand, token]) >= Token.getDetokenizedLength([shorthandCopy]);
    }

    // Go from the end and always take what the current token can't override as the new result set
    // NOTE: can't cache result.length here because it will change with every iteration
    for (result = tokens, i = 0; (ii = result.length - 1 - i) >= 0; i++) {
      token = result[ii];
      can = (processable[token.prop] && processable[token.prop].canOverride) || sameValue;
      oldResult = result;
      result = [];

      // Special flag which indicates that the current token should be removed
      var removeSelf = false;
      var oldResultLength = oldResult.length;

      for (var iii = 0; iii < oldResultLength; iii++) {
        t = oldResult[iii];

        // A token can't override itself (checked by reference, not by value)
        // NOTE: except when we explicitly tell it to remove itself
        if (t === token && !removeSelf) {
          result.push(t);
          continue;
        }

        // Only an important token can even try to override tokens that come after it
        if (iii > ii && !token.isImportant) {
          result.push(t);
          continue;
        }

        // If an important component tries to override an important shorthand and it is not yet merged
        // just make sure it is not lost
        if (iii > ii && t.isImportant && token.isImportant && t.prop != token.prop && t.isComponentOf(token)) {
          result.push(t);
          continue;
        }

        // A nonimportant token can never override an important one
        if (t.isImportant && !token.isImportant) {
          result.push(t);
          continue;
        }

        if (token.isShorthand && !t.isShorthand && t.isComponentOf(token)) {
          // token (a shorthand) is trying to override t (a component)

          // Find the matching component in the shorthand
          matchingComponent = token.components.filter(nameMatchFilter2)[0];
          can = (processable[t.prop] && processable[t.prop].canOverride) || sameValue;
          if (!can(t.value, matchingComponent.value)) {
            // The shorthand can't override the component
            result.push(t);
          }
        } else if (t.isShorthand && !token.isShorthand && token.isComponentOf(t)) {
          // token (a component) is trying to override a component of t (a shorthand)

          // Find the matching component in the shorthand
          matchingComponent = t.components.filter(nameMatchFilter1)[0];
          if (can(matchingComponent.value, token.value)) {
            // The component can override the matching component in the shorthand
            var disabledForToken = !compatibility.properties.backgroundSizeMerging &&
              token.prop.indexOf('background-size') > -1;

            if (disabledForToken) {
              result.push(t);
              continue;
            }

            if (!compatibility.properties.merging) {
              // in compatibility mode check if shorthand in not less understandable than merged-in value
              var wouldBreakCompatibility = false;
              for (iiii = 0; iiii < t.components.length; iiii++) {
                var o = processable[t.components[iiii].prop];
                can = (o && o.canOverride) || sameValue;

                if (!can(o.defaultValue, t.components[iiii].value)) {
                  wouldBreakCompatibility = true;
                  break;
                }
              }

              if (wouldBreakCompatibility) {
                result.push(t);
                continue;
              }
            }

            if ((!token.isImportant || token.isImportant && matchingComponent.isImportant) && willResultInShorterValue(t, token)) {
              // The overriding component is non-important which means we can simply include it into the shorthand
              // NOTE: stuff that can't really be included, like inherit, is taken care of at the final step, not here
              matchingComponent.value = token.value;
              // We use the special flag to get rid of the component
              removeSelf = true;
            } else {
              // The overriding component is important; sadly we can't get rid of it,
              // but we can still mark the matching component in the shorthand as irrelevant
              matchingComponent.isIrrelevant = true;
            }
            t.isDirty = true;
          }
          result.push(t);
        } else if (token.isShorthand && t.isShorthand && token.prop === t.prop) {
          // token is a shorthand and is trying to override another instance of the same shorthand

          // Can only override other shorthand when each of its components can override each of the other's components
          for (iiii = 0; iiii < t.components.length; iiii++) {
            can = (processable[t.components[iiii].prop] && processable[t.components[iiii].prop].canOverride) || sameValue;
            if (!can(t.components[iiii].value, token.components[iiii].value)) {
              result.push(t);
              break;
            }
            if (t.components[iiii].isImportant && token.components[iiii].isImportant && (validator.isValidFunction(t.components[iiii].value) ^ validator.isValidFunction(token.components[iiii].value))) {
              result.push(t);
              break;
            }
          }
        } else if (t.prop !== token.prop || !can(t.value, token.value)) {
          // in every other case, use the override mechanism
          result.push(t);
        } else if (t.isImportant && token.isImportant && (validator.isValidFunction(t.value) ^ validator.isValidFunction(token.value))) {
          result.push(t);
        }
      }
      if (removeSelf) {
        i--;
      }
    }

    return result;
  };

  return {
    compactOverrides: compactOverrides
  };

})();

},{"./validator":20}],17:[function(require,module,exports){

// Contains the interpretation of CSS properties, as used by the property optimizer

module.exports = (function () {

  var tokenModule = require('./token');
  var validator = require('./validator');
  var Splitter = require('../utils/splitter');

  // Functions that decide what value can override what.
  // The main purpose is to disallow removing CSS fallbacks.
  // A separate implementation is needed for every different kind of CSS property.
  // -----
  // The generic idea is that properties that have wider browser support are 'more understandable'
  // than others and that 'less understandable' values can't override more understandable ones.
  var canOverride = {
    // Use when two tokens of the same property can always be merged
    always: function () {
      // NOTE: We could have (val1, val2) parameters here but jshint complains because we don't use them
      return true;
    },
    // Use when two tokens of the same property can only be merged if they have the same value
    sameValue: function(val1, val2) {
      return val1 === val2;
    },
    sameFunctionOrValue: function(val1, val2) {
      // Functions with the same name can override each other
      if (validator.areSameFunction(val1, val2)) {
        return true;
      }

      return val1 === val2;
    },
    // Use for properties containing CSS units (margin-top, padding-left, etc.)
    unit: function(val1, val2) {
      // The idea here is that 'more understandable' values override 'less understandable' values, but not vice versa
      // Understandability: (unit without functions) > (same functions | standard functions) > anything else
      // NOTE: there is no point in having different vendor-specific functions override each other or standard functions,
      //       or having standard functions override vendor-specific functions, but standard functions can override each other
      // NOTE: vendor-specific property values are not taken into consideration here at the moment
      if (validator.isValidAndCompatibleUnitWithoutFunction(val1) && !validator.isValidAndCompatibleUnitWithoutFunction(val2))
        return false;

      if (validator.isValidUnitWithoutFunction(val2))
        return true;
      if (validator.isValidUnitWithoutFunction(val1))
        return false;

      // Standard non-vendor-prefixed functions can override each other
      if (validator.isValidFunctionWithoutVendorPrefix(val2) && validator.isValidFunctionWithoutVendorPrefix(val1)) {
        return true;
      }

      // Functions with the same name can override each other; same values can override each other
      return canOverride.sameFunctionOrValue(val1, val2);
    },
    // Use for color properties (color, background-color, border-color, etc.)
    color: function(val1, val2) {
      // The idea here is that 'more understandable' values override 'less understandable' values, but not vice versa
      // Understandability: (hex | named) > (rgba | hsla) > (same function name) > anything else
      // NOTE: at this point rgb and hsl are replaced by hex values by clean-css

      // (hex | named)
      if (validator.isValidNamedColor(val2) || validator.isValidHexColor(val2))
        return true;
      if (validator.isValidNamedColor(val1) || validator.isValidHexColor(val1))
        return false;

      // (rgba|hsla)
      if (validator.isValidRgbaColor(val2) || validator.isValidHslaColor(val2))
        return true;
      if (validator.isValidRgbaColor(val1) || validator.isValidHslaColor(val1))
        return false;

      // Functions with the same name can override each other; same values can override each other
      return canOverride.sameFunctionOrValue(val1, val2);
    },
    // Use for background-image
    backgroundImage: function(val1, val2) {
      // The idea here is that 'more understandable' values override 'less understandable' values, but not vice versa
      // Understandability: (none | url | inherit) > (same function) > (same value)

      // (none | url)
      if (val2 === 'none' || val2 === 'inherit' || validator.isValidUrl(val2))
        return true;
      if (val1 === 'none' || val1 === 'inherit' || validator.isValidUrl(val1))
        return false;

      // Functions with the same name can override each other; same values can override each other
      return canOverride.sameFunctionOrValue(val1, val2);
    },
    border: function(val1, val2) {
      var brokenUp1 = breakUp.border(Token.tokenizeOne({ value: val1 }));
      var brokenUp2 = breakUp.border(Token.tokenizeOne({ value: val2 }));

      return canOverride.color(brokenUp1[2].value, brokenUp2[2].value);
    }
  };
  canOverride = Object.freeze(canOverride);

  // Functions for breaking up shorthands to components
  var breakUp = {};
  breakUp.takeCareOfFourValues = function (splitfunc) {
    return function (token) {
      var descriptor = processable[token.prop];
      var result = [];
      var splitval = splitfunc(token.value);

      if (splitval.length === 0 || (splitval.length < descriptor.components.length && descriptor.components.length > 4)) {
        // This token is malformed and we have no idea how to fix it. So let's just keep it intact
        return [token];
      }

      // Fix those that we do know how to fix
      if (splitval.length < descriptor.components.length && splitval.length < 2) {
        // foo{margin:1px} -> foo{margin:1px 1px}
        splitval[1] = splitval[0];
      }
      if (splitval.length < descriptor.components.length && splitval.length < 3) {
        // foo{margin:1px 2px} -> foo{margin:1px 2px 1px}
        splitval[2] = splitval[0];
      }
      if (splitval.length < descriptor.components.length && splitval.length < 4) {
        // foo{margin:1px 2px 3px} -> foo{margin:1px 2px 3px 2px}
        splitval[3] = splitval[1];
      }

      // Now break it up to its components
      for (var i = 0; i < descriptor.components.length; i++) {
        var t = new Token(descriptor.components[i], splitval[i], token.isImportant);
        result.push(t);
      }

      return result;
    };
  };
  // Use this when you simply want to break up four values along spaces
  breakUp.fourBySpaces = breakUp.takeCareOfFourValues(function (val) {
    return new Splitter(' ').split(val).filter(function (v) { return v; });
  });
  // Breaks up a background property value
  breakUp.commaSeparatedMulitpleValues = function (splitfunc) {
    return function (token) {
      if (token.value.indexOf(',') === -1)
        return splitfunc(token);

      var values = new Splitter(',').split(token.value);
      var components = [];

      for (var i = 0, l = values.length; i < l; i++) {
        token.value = values[i];
        components.push(splitfunc(token));
      }

      for (var j = 0, m = components[0].length; j < m; j++) {
        for (var k = 0, n = components.length, newValues = []; k < n; k++) {
          newValues.push(components[k][j].value);
        }

        components[0][j].value = newValues.join(',');
      }

      return components[0];
    };
  };
  breakUp.background = function (token) {
    // Default values
    var result = Token.makeDefaults(['background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-color'], token.isImportant);
    var image = result[0];
    var position = result[1];
    var size = result[2];
    var repeat = result[3];
    var attachment = result[4];
    var color = result[5];
    var positionSet = false;

    // Take care of inherit
    if (token.value === 'inherit') {
      // NOTE: 'inherit' is not a valid value for background-attachment so there we'll leave the default value
      color.value = image.value =  repeat.value = position.value = size.value = attachment.value = 'inherit';
      return result;
    }

    // Break the background up into parts
    var parts = new Splitter(' ').split(token.value);
    if (parts.length === 0)
      return result;

    // Iterate over all parts and try to fit them into positions
    for (var i = parts.length - 1; i >= 0; i--) {
      var currentPart = parts[i];

      if (validator.isValidBackgroundAttachment(currentPart)) {
        attachment.value = currentPart;
      } else if (validator.isValidBackgroundRepeat(currentPart)) {
        repeat.value = currentPart;
      } else if (validator.isValidBackgroundPositionPart(currentPart) || validator.isValidBackgroundSizePart(currentPart)) {
        if (i > 0) {
          var previousPart = parts[i - 1];

          if (previousPart.indexOf('/') > 0) {
            var twoParts = new Splitter('/').split(previousPart);
            size.value = twoParts.pop() + ' ' + currentPart;
            parts[i - 1] = twoParts.pop();
          } else if (i > 1 && parts[i - 2] == '/') {
            size.value = previousPart + ' ' + currentPart;
            i -= 2;
          } else if (parts[i - 1] == '/') {
            size.value = currentPart;
          } else {
            position.value = currentPart + (positionSet ? ' ' + position.value : '');
            positionSet = true;
          }
        } else {
          position.value = currentPart + (positionSet ? ' ' + position.value : '');
          positionSet = true;
        }
      } else if (validator.isValidBackgroundPositionAndSize(currentPart)) {
        var sizeValue = new Splitter('/').split(currentPart);
        size.value = sizeValue.pop();
        position.value = sizeValue.pop();
      } else if ((color.value == processable[color.prop].defaultValue || color.value == 'none') && validator.isValidColor(currentPart)) {
        color.value = currentPart;
      } else if (validator.isValidUrl(currentPart) || validator.isValidFunction(currentPart)) {
        image.value = currentPart;
      }
    }

    return result;
  };
  // Breaks up a list-style property value
  breakUp.listStyle = function (token) {
    // Default values
    var result = Token.makeDefaults(['list-style-type', 'list-style-position', 'list-style-image'], token.isImportant);
    var type = result[0], position = result[1], image = result[2];

    if (token.value === 'inherit') {
      type.value = position.value = image.value = 'inherit';
      return result;
    }

    var parts = new Splitter(' ').split(token.value);
    var ci = 0;

    // Type
    if (ci < parts.length && validator.isValidListStyleType(parts[ci])) {
      type.value = parts[ci];
      ci++;
    }
    // Position
    if (ci < parts.length && validator.isValidListStylePosition(parts[ci])) {
      position.value = parts[ci];
      ci++;
    }
    // Image
    if (ci < parts.length) {
      image.value = parts.splice(ci, parts.length - ci + 1).join(' ');
    }

    return result;
  };

  breakUp._widthStyleColor = function(token, prefix, order) {
    // Default values
    var components = order.map(function(prop) {
      return prefix + '-' + prop;
    });
    var result = Token.makeDefaults(components, token.isImportant);
    var color = result[order.indexOf('color')];
    var style = result[order.indexOf('style')];
    var width = result[order.indexOf('width')];

    // Take care of inherit
    if (token.value === 'inherit' || token.value === 'inherit inherit inherit') {
      color.value = style.value = width.value = 'inherit';
      return result;
    }

    // NOTE: usually users don't follow the required order of parts in this shorthand,
    // so we'll try to parse it caring as little about order as possible

    var parts = new Splitter(' ').split(token.value), w;

    if (parts.length === 0) {
      return result;
    }

    if (parts.length >= 1) {
      // Try to find -width, excluding inherit because that can be anything
      w = parts.filter(function(p) { return p !== 'inherit' && validator.isValidOutlineWidth(p); });
      if (w.length) {
        width.value = w[0];
        parts.splice(parts.indexOf(w[0]), 1);
      }
    }
    if (parts.length >= 1) {
      // Try to find -style, excluding inherit because that can be anything
      w = parts.filter(function(p) { return p !== 'inherit' && validator.isValidOutlineStyle(p); });
      if (w.length) {
        style.value = w[0];
        parts.splice(parts.indexOf(w[0]), 1);
      }
    }
    if (parts.length >= 1) {
      // Find -color but this time can catch inherit
      w = parts.filter(function(p) { return validator.isValidOutlineColor(p); });
      if (w.length) {
        color.value = w[0];
        parts.splice(parts.indexOf(w[0]), 1);
      }
    }

    return result;
  };

  breakUp.outline = function(token) {
    return breakUp._widthStyleColor(token, 'outline', ['color', 'style', 'width']);
  };

  breakUp.border = function(token) {
    return breakUp._widthStyleColor(token, 'border', ['width', 'style', 'color']);
  };

  breakUp.borderRadius = function(token) {
    var parts = token.value.split('/');
    if (parts.length == 1)
      return breakUp.fourBySpaces(token);

    var horizontalPart = token.clone();
    var verticalPart = token.clone();

    horizontalPart.value = parts[0];
    verticalPart.value = parts[1];

    var horizontalBreakUp = breakUp.fourBySpaces(horizontalPart);
    var verticalBreakUp = breakUp.fourBySpaces(verticalPart);

    for (var i = 0; i < 4; i++) {
      horizontalBreakUp[i].value = [horizontalBreakUp[i].value, verticalBreakUp[i].value];
    }

    return horizontalBreakUp;
  };

  // Contains functions that can put together shorthands from their components
  // NOTE: correct order of tokens is assumed inside these functions!
  var putTogether = {
    // Use this for properties which have four unit values (margin, padding, etc.)
    // NOTE: optimizes to shorter forms too (that only specify 1, 2, or 3 values)
    fourUnits: function (prop, tokens, isImportant) {
      // See about irrelevant tokens
      // NOTE: This will enable some crazy optimalizations for us.
      if (tokens[0].isIrrelevant)
        tokens[0].value = tokens[2].value;
      if (tokens[2].isIrrelevant)
        tokens[2].value = tokens[0].value;
      if (tokens[1].isIrrelevant)
        tokens[1].value = tokens[3].value;
      if (tokens[3].isIrrelevant)
        tokens[3].value = tokens[1].value;

      if (tokens[0].isIrrelevant && tokens[2].isIrrelevant) {
        if (tokens[1].value === tokens[3].value)
          tokens[0].value = tokens[2].value = tokens[1].value;
        else
          tokens[0].value = tokens[2].value = '0';
      }
      if (tokens[1].isIrrelevant && tokens[3].isIrrelevant) {
        if (tokens[0].value === tokens[2].value)
          tokens[1].value = tokens[3].value = tokens[0].value;
        else
          tokens[1].value = tokens[3].value = '0';
      }

      var result = new Token(prop, tokens[0].value, isImportant);
      result.granularValues = [];
      result.granularValues[tokens[0].prop] = tokens[0].value;
      result.granularValues[tokens[1].prop] = tokens[1].value;
      result.granularValues[tokens[2].prop] = tokens[2].value;
      result.granularValues[tokens[3].prop] = tokens[3].value;

      // If all of them are irrelevant
      if (tokens[0].isIrrelevant && tokens[1].isIrrelevant && tokens[2].isIrrelevant && tokens[3].isIrrelevant) {
        result.value = processable[prop].shortestValue || processable[prop].defaultValue;
        return result;
      }

      // 1-value short form: all four components are equal
      if (tokens[0].value === tokens[1].value && tokens[0].value === tokens[2].value && tokens[0].value === tokens[3].value) {
        return result;
      }
      result.value += ' ' + tokens[1].value;
      // 2-value short form: first and third; second and fourth values are equal
      if (tokens[0].value === tokens[2].value && tokens[1].value === tokens[3].value) {
        return result;
      }
      result.value += ' ' + tokens[2].value;
      // 3-value short form: second and fourth values are equal
      if (tokens[1].value === tokens[3].value) {
        return result;
      }
      // 4-value form (none of the above optimalizations could be accomplished)
      result.value += ' ' + tokens[3].value;
      return result;
    },
    // Puts together the components by spaces and omits default values (this is the case for most shorthands)
    bySpacesOmitDefaults: function (prop, tokens, isImportant, meta) {
      var result = new Token(prop, '', isImportant);

      // Get irrelevant tokens
      var irrelevantTokens = tokens.filter(function (t) { return t.isIrrelevant; });

      // If every token is irrelevant, return shortest possible value, fallback to default value
      if (irrelevantTokens.length === tokens.length) {
        result.isIrrelevant = true;
        result.value = processable[prop].shortestValue || processable[prop].defaultValue;
        return result;
      }

      // This will be the value of the shorthand if all the components are default
      var valueIfAllDefault = processable[prop].defaultValue;

      // Go through all tokens and concatenate their values as necessary
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];

        // Set granular value so that other parts of the code can use this for optimalization opportunities
        result.granularValues = result.granularValues || { };
        result.granularValues[token.prop] = token.value;

        // Use irrelevant tokens for optimalization opportunity
        if (token.isIrrelevant) {
          // Get shortest possible value, fallback to default value
          var tokenShortest = processable[token.prop].shortestValue || processable[token.prop].defaultValue;
          // If the shortest possible value of this token is shorter than the default value of the shorthand, use it instead
          if (tokenShortest.length < valueIfAllDefault.length) {
            valueIfAllDefault = tokenShortest;
          }
        }

        // Omit default / irrelevant value
        if (token.isIrrelevant || (processable[token.prop] && processable[token.prop].defaultValue === token.value)) {
          continue;
        }

        if (meta && meta.partsCount && meta.position < meta.partsCount - 1 && processable[token.prop].multiValueLastOnly)
          continue;

        var requiresPreceeding = processable[token.prop].shorthandFollows;
        if (requiresPreceeding && (tokens[i - 1].value == processable[requiresPreceeding].defaultValue)) {
          result.value += ' ' + tokens[i - 1].value;
        }

        result.value += (processable[token.prop].prefixShorthandValueWith || ' ') + token.value;
      }

      result.value = result.value.trim();
      if (!result.value) {
        result.value = valueIfAllDefault;
      }

      return result;
    },
    commaSeparatedMulitpleValues: function (assembleFunction) {
      return function(prop, tokens, isImportant) {
        var tokenSplitLengths = tokens.map(function (token) {
          return new Splitter(',').split(token.value).length;
        });
        var partsCount = Math.max.apply(Math, tokenSplitLengths);

        if (partsCount == 1)
          return assembleFunction(prop, tokens, isImportant);

        var merged = [];

        for (var i = 0; i < partsCount; i++) {
          merged.push([]);

          for (var j = 0; j < tokens.length; j++) {
            var split = new Splitter(',').split(tokens[j].value);
            merged[i].push(split[i] || split[0]);
          }
        }

        var mergedValues = [];
        var firstProcessed;
        for (i = 0; i < partsCount; i++) {
          var newTokens = [];
          for (var k = 0, n = merged[i].length; k < n; k++) {
            var newToken = tokens[k].clone();
            newToken.value = merged[i][k];
            newTokens.push(newToken);
          }

          var meta = {
            partsCount: partsCount,
            position: i
          };
          var processed = assembleFunction(prop, newTokens, isImportant, meta);
          mergedValues.push(processed.value);

          if (!firstProcessed)
            firstProcessed = processed;
        }

        firstProcessed.value = mergedValues.join(',');
        return firstProcessed;
      };
    },
    // Handles the cases when some or all the fine-grained properties are set to inherit
    takeCareOfInherit: function (innerFunc) {
      return function (prop, tokens, isImportant, meta) {
        // Filter out the inheriting and non-inheriting tokens in one iteration
        var inheritingTokens = [];
        var nonInheritingTokens = [];
        var result2Shorthandable = [];
        var i;
        for (i = 0; i < tokens.length; i++) {
          if (tokens[i].value === 'inherit') {
            inheritingTokens.push(tokens[i]);

            // Indicate that this property is irrelevant and its value can safely be set to anything else
            var r2s = new Token(tokens[i].prop, tokens[i].isImportant);
            r2s.isIrrelevant = true;
            result2Shorthandable.push(r2s);
          } else {
            nonInheritingTokens.push(tokens[i]);
            result2Shorthandable.push(tokens[i]);
          }
        }

        if (nonInheritingTokens.length === 0) {
          // When all the tokens are 'inherit'
          return new Token(prop, 'inherit', isImportant);
        } else if (inheritingTokens.length > 0) {
          // When some (but not all) of the tokens are 'inherit'

          // Result 1. Shorthand just the inherit values and have it overridden with the non-inheriting ones
          var result1 = [new Token(prop, 'inherit', isImportant)].concat(nonInheritingTokens);

          // Result 2. Shorthand every non-inherit value and then have it overridden with the inheriting ones
          var result2 = [innerFunc(prop, result2Shorthandable, isImportant, meta)].concat(inheritingTokens);

          // Return whichever is shorter
          var dl1 = Token.getDetokenizedLength(result1);
          var dl2 = Token.getDetokenizedLength(result2);

          return dl1 < dl2 ? result1 : result2;
        } else {
          // When none of tokens are 'inherit'
          return innerFunc(prop, tokens, isImportant, meta);
        }
      };
    },
    borderRadius: function (prop, tokens, isImportant) {
      var verticalTokens = [];
      var newTokens = [];

      for (var i = 0, l = tokens.length; i < l; i++) {
        var token = tokens[i];
        var newToken = token.clone();
        newTokens.push(newToken);
        if (!Array.isArray(token.value))
          continue;

        if (token.value.length > 1) {
          verticalTokens.push({
            prop: token.prop,
            value: token.value[1],
            isImportant: token.isImportant
          });
        }

        newToken.value = token.value[0];
      }

      var result = putTogether.takeCareOfInherit(putTogether.fourUnits)(prop, newTokens, isImportant);
      if (verticalTokens.length > 0) {
        var verticalResult = putTogether.takeCareOfInherit(putTogether.fourUnits)(prop, verticalTokens, isImportant);
        if (result.value != verticalResult.value)
          result.value += '/' + verticalResult.value;
      }

      return result;
    }
  };

  // Properties to process
  // Extend this object in order to add support for more properties in the optimizer.
  //
  // Each key in this object represents a CSS property and should be an object.
  // Such an object contains properties that describe how the represented CSS property should be handled.
  // Possible options:
  //
  // * components: array (Only specify for shorthand properties.)
  //   Contains the names of the granular properties this shorthand compacts.
  //
  // * canOverride: function (Default is canOverride.sameValue - meaning that they'll only be merged if they have the same value.)
  //   Returns whether two tokens of this property can be merged with each other.
  //   This property has no meaning for shorthands.
  //
  // * defaultValue: string
  //   Specifies the default value of the property according to the CSS standard.
  //   For shorthand, this is used when every component is set to its default value, therefore it should be the shortest possible default value of all the components.
  //
  // * shortestValue: string
  //   Specifies the shortest possible value the property can possibly have.
  //   (Falls back to defaultValue if unspecified.)
  //
  // * breakUp: function (Only specify for shorthand properties.)
  //   Breaks the shorthand up to its components.
  //
  // * putTogether: function (Only specify for shorthand properties.)
  //   Puts the shorthand together from its components.
  //
  var processable = {
    'color': {
      canOverride: canOverride.color,
      defaultValue: 'transparent',
      shortestValue: 'red'
    },
    // background ------------------------------------------------------------------------------
    'background': {
      components: [
        'background-image',
        'background-position',
        'background-size',
        'background-repeat',
        'background-attachment',
        'background-color'
      ],
      breakUp: breakUp.commaSeparatedMulitpleValues(breakUp.background),
      putTogether: putTogether.commaSeparatedMulitpleValues(
        putTogether.takeCareOfInherit(putTogether.bySpacesOmitDefaults)
      ),
      defaultValue: '0 0',
      shortestValue: '0'
    },
    'background-color': {
      canOverride: canOverride.color,
      defaultValue: 'transparent',
      multiValueLastOnly: true,
      shortestValue: 'red'
    },
    'background-image': {
      canOverride: canOverride.backgroundImage,
      defaultValue: 'none'
    },
    'background-repeat': {
      canOverride: canOverride.always,
      defaultValue: 'repeat'
    },
    'background-position': {
      canOverride: canOverride.always,
      defaultValue: '0 0',
      shortestValue: '0'
    },
    'background-size': {
      canOverride: canOverride.always,
      defaultValue: 'auto',
      shortestValue: '0 0',
      prefixShorthandValueWith: '/',
      shorthandFollows: 'background-position'
    },
    'background-attachment': {
      canOverride: canOverride.always,
      defaultValue: 'scroll'
    },
    'border': {
      breakUp: breakUp.border,
      canOverride: canOverride.border,
      components: [
        'border-width',
        'border-style',
        'border-color'
      ],
      defaultValue: 'none',
      putTogether: putTogether.takeCareOfInherit(putTogether.bySpacesOmitDefaults)
    },
    'border-color': {
      canOverride: canOverride.color,
      defaultValue: 'none'
    },
    'border-style': {
      canOverride: canOverride.always,
      defaultValue: 'none'
    },
    'border-width': {
      canOverride: canOverride.unit,
      defaultValue: 'medium',
      shortestValue: '0'
    },
    // list-style ------------------------------------------------------------------------------
    'list-style': {
      components: [
        'list-style-type',
        'list-style-position',
        'list-style-image'
      ],
      canOverride: canOverride.always,
      breakUp: breakUp.listStyle,
      putTogether: putTogether.takeCareOfInherit(putTogether.bySpacesOmitDefaults),
      defaultValue: 'outside', // can't use 'disc' because that'd override default 'decimal' for <ol>
      shortestValue: 'none'
    },
    'list-style-type' : {
      canOverride: canOverride.always,
      shortestValue: 'none',
      defaultValue: '__hack'
      // NOTE: we can't tell the real default value here, it's 'disc' for <ul> and 'decimal' for <ol>
      //       -- this is a hack, but it doesn't matter because this value will be either overridden or it will disappear at the final step anyway
    },
    'list-style-position' : {
      canOverride: canOverride.always,
      defaultValue: 'outside',
      shortestValue: 'inside'
    },
    'list-style-image' : {
      canOverride: canOverride.always,
      defaultValue: 'none'
    },
    // outline ------------------------------------------------------------------------------
    'outline': {
      components: [
        'outline-color',
        'outline-style',
        'outline-width'
      ],
      breakUp: breakUp.outline,
      putTogether: putTogether.takeCareOfInherit(putTogether.bySpacesOmitDefaults),
      defaultValue: '0'
    },
    'outline-color': {
      canOverride: canOverride.color,
      defaultValue: 'invert',
      shortestValue: 'red'
    },
    'outline-style': {
      canOverride: canOverride.always,
      defaultValue: 'none'
    },
    'outline-width': {
      canOverride: canOverride.unit,
      defaultValue: 'medium',
      shortestValue: '0'
    },
    // transform
    '-moz-transform': {
      canOverride: canOverride.sameFunctionOrValue
    },
    '-ms-transform': {
      canOverride: canOverride.sameFunctionOrValue
    },
    '-webkit-transform': {
      canOverride: canOverride.sameFunctionOrValue
    },
    'transform': {
      canOverride: canOverride.sameFunctionOrValue
    }
  };

  var addFourValueShorthand = function (prop, components, options) {
    options = options || {};
    processable[prop] = {
      components: components,
      breakUp: options.breakUp || breakUp.fourBySpaces,
      putTogether: options.putTogether || putTogether.takeCareOfInherit(putTogether.fourUnits),
      defaultValue: options.defaultValue || '0',
      shortestValue: options.shortestValue
    };
    for (var i = 0; i < components.length; i++) {
      processable[components[i]] = {
        breakUp: options.breakUp || breakUp.fourBySpaces,
        canOverride: options.canOverride || canOverride.unit,
        defaultValue: options.defaultValue || '0',
        shortestValue: options.shortestValue
      };
    }
  };

  ['', '-moz-', '-o-', '-webkit-'].forEach(function (prefix) {
    addFourValueShorthand(prefix + 'border-radius', [
      prefix + 'border-top-left-radius',
      prefix + 'border-top-right-radius',
      prefix + 'border-bottom-right-radius',
      prefix + 'border-bottom-left-radius'
    ], {
      breakUp: breakUp.borderRadius,
      putTogether: putTogether.borderRadius
    });
  });

  addFourValueShorthand('border-color', [
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color'
  ], {
    breakUp: breakUp.fourBySpaces,
    canOverride: canOverride.color,
    defaultValue: 'currentColor',
    shortestValue: 'red'
  });

  addFourValueShorthand('border-style', [
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style'
  ], {
    breakUp: breakUp.fourBySpaces,
    canOverride: canOverride.always,
    defaultValue: 'none'
  });

  addFourValueShorthand('border-width', [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width'
  ], {
    defaultValue: 'medium',
    shortestValue: '0'
  });

  addFourValueShorthand('padding', [
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left'
  ]);

  addFourValueShorthand('margin', [
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left'
  ]);

  // Set some stuff iteratively
  for (var proc in processable) {
    if (!processable.hasOwnProperty(proc))
      continue;

    var currDesc = processable[proc];

    if (!(currDesc.components instanceof Array) || currDesc.components.length === 0)
      continue;

    currDesc.isShorthand = true;

    for (var cI = 0; cI < currDesc.components.length; cI++) {
      if (!processable[currDesc.components[cI]]) {
        throw new Error('"' + currDesc.components[cI] + '" is defined as a component of "' + proc + '" but isn\'t defined in processable.');
      }
      processable[currDesc.components[cI]].componentOf = proc;
    }
  }

  var Token = tokenModule.createTokenPrototype(processable);

  return {
    implementedFor: /background|border|color|list|margin|outline|padding|transform/,
    processable: function (compatibility) {
      // FIXME: we need a proper OO way
      validator.setCompatibility(compatibility);

      return processable;
    },
    Token: Token
  };
})();

},{"../utils/splitter":42,"./token":19,"./validator":20}],18:[function(require,module,exports){

// Compacts the tokens by transforming properties into their shorthand notations when possible

module.exports = (function () {
  var isHackValue = function (t) { return t.value === '__hack'; };

  var compactShorthands = function(tokens, isImportant, processable, Token) {
    // Contains the components found so far, grouped by shorthand name
    var componentsSoFar = { };

    // Initializes a prop in componentsSoFar
    var initSoFar = function (shprop, last, clearAll) {
      var found = {};
      var shorthandPosition;

      if (!clearAll && componentsSoFar[shprop]) {
        for (var i = 0; i < processable[shprop].components.length; i++) {
          var prop = processable[shprop].components[i];
          found[prop] = [];

          if (!(componentsSoFar[shprop].found[prop]))
            continue;

          for (var ii = 0; ii < componentsSoFar[shprop].found[prop].length; ii++) {
            var comp = componentsSoFar[shprop].found[prop][ii];

            if (comp.isMarkedForDeletion)
              continue;

            found[prop].push(comp);

            if (comp.position && (!shorthandPosition || comp.position < shorthandPosition))
              shorthandPosition = comp.position;
          }
        }
      }
      componentsSoFar[shprop] = {
        lastShorthand: last,
        found: found,
        shorthandPosition: shorthandPosition
      };
    };

    // Adds a component to componentsSoFar
    var addComponentSoFar = function (token, index) {
      var shprop = processable[token.prop].componentOf;
      if (!componentsSoFar[shprop])
        initSoFar(shprop);
      if (!componentsSoFar[shprop].found[token.prop])
        componentsSoFar[shprop].found[token.prop] = [];

      // Add the newfound component to componentsSoFar
      componentsSoFar[shprop].found[token.prop].push(token);

      if (!componentsSoFar[shprop].shorthandPosition && index) {
        // If the haven't decided on where the shorthand should go, put it in the place of this component
        componentsSoFar[shprop].shorthandPosition = index;
      }
    };

    // Tries to compact a prop in componentsSoFar
    var compactSoFar = function (prop) {
      var i;
      var componentsCount = processable[prop].components.length;

      // Check basics
      if (!componentsSoFar[prop] || !componentsSoFar[prop].found)
        return false;

      // Find components for the shorthand
      var components = [];
      var realComponents = [];
      for (i = 0 ; i < componentsCount; i++) {
        // Get property name
        var pp = processable[prop].components[i];

        if (componentsSoFar[prop].found[pp] && componentsSoFar[prop].found[pp].length) {
          // We really found it
          var foundRealComp = componentsSoFar[prop].found[pp][0];
          components.push(foundRealComp);
          if (foundRealComp.isReal !== false) {
            realComponents.push(foundRealComp);
          }
        } else if (componentsSoFar[prop].lastShorthand) {
          // It's defined in the previous shorthand
          var c = componentsSoFar[prop].lastShorthand.components[i].clone(isImportant);
          components.push(c);
        } else {
          // Couldn't find this component at all
          return false;
        }
      }

      if (realComponents.length === 0) {
        // Couldn't find enough components, sorry
        return false;
      }

      if (realComponents.length === componentsCount) {
        // When all the components are from real values, only allow shorthanding if their understandability allows it
        // This is the case when every component can override their default values, or when all of them use the same function

        var canOverrideDefault = true;
        var functionNameMatches = true;
        var functionName;

        for (var ci = 0; ci < realComponents.length; ci++) {
          var rc = realComponents[ci];

          if (!processable[rc.prop].canOverride(processable[rc.prop].defaultValue, rc.value)) {
            canOverrideDefault = false;
          }
          var iop = rc.value.indexOf('(');
          if (iop >= 0) {
            var otherFunctionName = rc.value.substring(0, iop);
            if (functionName)
              functionNameMatches = functionNameMatches && otherFunctionName === functionName;
            else
              functionName = otherFunctionName;
          }
        }

        if (!canOverrideDefault || !functionNameMatches)
          return false;
      }

      // Compact the components into a shorthand
      var compacted = processable[prop].putTogether(prop, components, isImportant);
      if (!(compacted instanceof Array)) {
        compacted = [compacted];
      }

      var compactedLength = Token.getDetokenizedLength(compacted);
      var authenticLength = Token.getDetokenizedLength(realComponents);

      if (realComponents.length === componentsCount || compactedLength < authenticLength || components.some(isHackValue)) {
        compacted[0].isShorthand = true;
        compacted[0].components = processable[prop].breakUp(compacted[0]);

        // Mark the granular components for deletion
        for (i = 0; i < realComponents.length; i++) {
          realComponents[i].isMarkedForDeletion = true;
        }

        // Mark the position of the new shorthand
        tokens[componentsSoFar[prop].shorthandPosition].replaceWith = compacted;

        // Reinitialize the thing for further compacting
        initSoFar(prop, compacted[0]);
        for (i = 1; i < compacted.length; i++) {
          addComponentSoFar(compacted[i]);
        }

        // Yes, we can keep the new shorthand!
        return true;
      }

      return false;
    };

    // Tries to compact all properties currently in componentsSoFar
    var compactAllSoFar = function () {
      for (var i in componentsSoFar) {
        if (componentsSoFar.hasOwnProperty(i)) {
          while (compactSoFar(i)) { }
        }
      }
    };

    var i, token;

    // Go through each token and collect components for each shorthand as we go on
    for (i = 0; i < tokens.length; i++) {
      token = tokens[i];
      if (token.isMarkedForDeletion) {
        continue;
      }
      if (!processable[token.prop]) {
        // We don't know what it is, move on
        continue;
      }
      if (processable[token.prop].isShorthand) {
        // Found an instance of a full shorthand
        // NOTE: we should NOT mix together tokens that come before and after the shorthands

        if (token.isImportant === isImportant || (token.isImportant && !isImportant)) {
          // Try to compact what we've found so far
          while (compactSoFar(token.prop)) { }
          // Reset
          initSoFar(token.prop, token, true);
        }

        // TODO: when the old optimizer is removed, take care of this corner case:
        //   div{background-color:#111;background-image:url(aaa);background:linear-gradient(aaa);background-repeat:no-repeat;background-position:1px 2px;background-attachment:scroll}
        //   -> should not be shorthanded / minified at all because the result wouldn't be equivalent to the original in any browser
      } else if (processable[token.prop].componentOf) {
        // Found a component of a shorthand
        if (token.isImportant === isImportant) {
          // Same importantness
          token.position = i;
          addComponentSoFar(token, i);
        } else if (!isImportant && token.isImportant) {
          // Use importants for optimalization opportunities
          // https://github.com/jakubpawlowicz/clean-css/issues/184
          var importantTrickComp = new Token(token.prop, token.value, isImportant);
          importantTrickComp.isIrrelevant = true;
          importantTrickComp.isReal = false;
          addComponentSoFar(importantTrickComp);
        }
      } else {
        // This is not a shorthand and not a component, don't care about it
        continue;
      }
    }

    // Perform all possible compactions
    compactAllSoFar();

    // Process the results - throw away stuff marked for deletion, insert compacted things, etc.
    var result = [];
    for (i = 0; i < tokens.length; i++) {
      token = tokens[i];

      if (token.replaceWith) {
        for (var ii = 0; ii < token.replaceWith.length; ii++) {
          result.push(token.replaceWith[ii]);
        }
      }
      if (!token.isMarkedForDeletion) {
        result.push(token);
      }

      token.isMarkedForDeletion = false;
      token.replaceWith = null;
    }

    return result;
  };

  return {
    compactShorthands: compactShorthands
  };

})();

},{}],19:[function(require,module,exports){

// Helper for tokenizing the contents of a CSS selector block

module.exports = (function() {
  var createTokenPrototype = function (processable) {
    var important = '!important';

    // Constructor for tokens
    function Token (prop, p2, p3) {
      this.prop = prop;
      if (typeof(p2) === 'string') {
        this.value = p2;
        this.isImportant = p3;
      }
      else {
        this.value = processable[prop].defaultValue;
        this.isImportant = p2;
      }
    }

    Token.prototype.prop = null;
    Token.prototype.value = null;
    Token.prototype.granularValues = null;
    Token.prototype.components = null;
    Token.prototype.position = null;
    Token.prototype.isImportant = false;
    Token.prototype.isDirty = false;
    Token.prototype.isShorthand = false;
    Token.prototype.isIrrelevant = false;
    Token.prototype.isReal = true;
    Token.prototype.isMarkedForDeletion = false;
    Token.prototype.metadata = null;

    // Tells if this token is a component of the other one
    Token.prototype.isComponentOf = function (other) {
      if (!processable[this.prop] || !processable[other.prop])
        return false;
      if (!(processable[other.prop].components instanceof Array) || !processable[other.prop].components.length)
        return false;

      return processable[other.prop].components.indexOf(this.prop) >= 0;
    };

    // Clones a token
    Token.prototype.clone = function (isImportant) {
      var token = new Token(this.prop, this.value, (typeof(isImportant) !== 'undefined' ? isImportant : this.isImportant));
      return token;
    };

    // Creates an irrelevant token with the same prop
    Token.prototype.cloneIrrelevant = function (isImportant) {
      var token = Token.makeDefault(this.prop, (typeof(isImportant) !== 'undefined' ? isImportant : this.isImportant));
      token.isIrrelevant = true;
      return token;
    };

    // Creates an array of property tokens with their default values
    Token.makeDefaults = function (props, important) {
      return props.map(function(prop) {
        return new Token(prop, important);
      });
    };

    // Parses one CSS property declaration into a token
    Token.tokenizeOne = function (fullProp) {
      // Find first colon
      var colonPos = fullProp.value.indexOf(':');

      if (colonPos < 0) {
        // This property doesn't have a colon, it's invalid. Let's keep it intact anyway.
        return new Token('', fullProp.value);
      }

      // Parse parts of the property
      var prop = fullProp.value.substr(0, colonPos).trim();
      var value = fullProp.value.substr(colonPos + 1).trim();
      var isImportant = false;
      var importantPos = value.indexOf(important);

      // Check if the property is important
      if (importantPos >= 1 && importantPos === value.length - important.length) {
        value = value.substr(0, importantPos).trim();
        isImportant = true;
      }

      // Return result
      var result = new Token(prop, value, isImportant);

      // If this is a shorthand, break up its values
      // NOTE: we need to do this for all shorthands because otherwise we couldn't remove default values from them
      if (processable[prop] && processable[prop].isShorthand) {
        result.isShorthand = true;
        result.components = processable[prop].breakUp(result);
        result.isDirty = true;
      }

      result.metadata = fullProp.metadata;

      return result;
    };

    // Breaks up a string of CSS property declarations into tokens so that they can be handled more easily
    Token.tokenize = function (input) {
      // Split the input by semicolons and parse the parts
      var tokens = input.map(Token.tokenizeOne);
      return tokens;
    };

    // Transforms tokens back into CSS properties
    Token.detokenize = function (tokens) {
      // If by mistake the input is not an array, make it an array
      if (!(tokens instanceof Array)) {
        tokens = [tokens];
      }

      var tokenized = [];
      var list = [];

      // This step takes care of putting together the components of shorthands
      // NOTE: this is necessary to do for every shorthand, otherwise we couldn't remove their default values
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        if (t.isShorthand && t.isDirty) {
          var news = processable[t.prop].putTogether(t.prop, t.components, t.isImportant);
          Array.prototype.splice.apply(tokens, [i, 1].concat(news));
          t.isDirty = false;
          i--;
          continue;
        }

        // FIXME: the check should be gone with #396
        var property = t.prop === '' && t.value.indexOf('__ESCAPED_') === 0 ?
          t.value :
          t.prop + ':' + t.value + (t.isImportant ? important : '');
        tokenized.push({ value: property, metadata: t.metadata || {} });
        list.push(property);
      }

      return {
        list: list,
        tokenized: tokenized
      };
    };

    // Gets the final (detokenized) length of the given tokens
    Token.getDetokenizedLength = function (tokens) {
      // If by mistake the input is not an array, make it an array
      if (!(tokens instanceof Array)) {
        tokens = [tokens];
      }

      var result = 0;

      // This step takes care of putting together the components of shorthands
      // NOTE: this is necessary to do for every shorthand, otherwise we couldn't remove their default values
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        if (t.isShorthand && t.isDirty) {
          var news = processable[t.prop].putTogether(t.prop, t.components, t.isImportant);
          Array.prototype.splice.apply(tokens, [i, 1].concat(news));
          t.isDirty = false;
          i--;
          continue;
        }

        if (t.prop) {
          result += t.prop.length + 1;
        }
        if (t.value) {
          result += t.value.length;
        }
        if (t.isImportant) {
          result += important.length;
        }
      }

      return result;
    };

    return Token;
  };

  return {
    createTokenPrototype: createTokenPrototype
  };

})();

},{}],20:[function(require,module,exports){

// Validates various CSS property values

var Splitter = require('../utils/splitter');

module.exports = (function () {
  // Regexes used for stuff
  var widthKeywords = ['thin', 'thick', 'medium', 'inherit', 'initial'];
  var allUnits = ['px', '%', 'em', 'rem', 'in', 'cm', 'mm', 'ex', 'pt', 'pc', 'vw', 'vh', 'vmin', 'vmax'];
  var cssUnitRegexStr = '(\\-?\\.?\\d+\\.?\\d*(' + allUnits.join('|') + '|)|auto|inherit)';
  var cssCalcRegexStr = '(\\-moz\\-|\\-webkit\\-)?calc\\([^\\)]+\\)';
  var cssFunctionNoVendorRegexStr = '[A-Z]+(\\-|[A-Z]|[0-9])+\\(([A-Z]|[0-9]|\\ |\\,|\\#|\\+|\\-|\\%|\\.|\\(|\\))*\\)';
  var cssFunctionVendorRegexStr = '\\-(\\-|[A-Z]|[0-9])+\\(([A-Z]|[0-9]|\\ |\\,|\\#|\\+|\\-|\\%|\\.|\\(|\\))*\\)';
  var cssVariableRegexStr = 'var\\(\\-\\-[^\\)]+\\)';
  var cssFunctionAnyRegexStr = '(' + cssVariableRegexStr + '|' + cssFunctionNoVendorRegexStr + '|' + cssFunctionVendorRegexStr + ')';
  var cssUnitOrCalcRegexStr = '(' + cssUnitRegexStr + '|' + cssCalcRegexStr + ')';
  var cssUnitAnyRegexStr = '(none|' + widthKeywords.join('|') + '|' + cssUnitRegexStr + '|' + cssVariableRegexStr + '|' + cssFunctionNoVendorRegexStr + '|' + cssFunctionVendorRegexStr + ')';

  var cssFunctionNoVendorRegex = new RegExp('^' + cssFunctionNoVendorRegexStr + '$', 'i');
  var cssFunctionVendorRegex = new RegExp('^' + cssFunctionVendorRegexStr + '$', 'i');
  var cssVariableRegex = new RegExp('^' + cssVariableRegexStr + '$', 'i');
  var cssFunctionAnyRegex = new RegExp('^' + cssFunctionAnyRegexStr + '$', 'i');
  var cssUnitRegex = new RegExp('^' + cssUnitRegexStr + '$', 'i');
  var cssUnitOrCalcRegex = new RegExp('^' + cssUnitOrCalcRegexStr + '$', 'i');
  var cssUnitAnyRegex = new RegExp('^' + cssUnitAnyRegexStr + '$', 'i');

  var backgroundRepeatKeywords = ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'inherit'];
  var backgroundAttachmentKeywords = ['inherit', 'scroll', 'fixed', 'local'];
  var backgroundPositionKeywords = ['center', 'top', 'bottom', 'left', 'right'];
  var backgroundSizeKeywords = ['contain', 'cover'];
  var listStyleTypeKeywords = ['armenian', 'circle', 'cjk-ideographic', 'decimal', 'decimal-leading-zero', 'disc', 'georgian', 'hebrew', 'hiragana', 'hiragana-iroha', 'inherit', 'katakana', 'katakana-iroha', 'lower-alpha', 'lower-greek', 'lower-latin', 'lower-roman', 'none', 'square', 'upper-alpha', 'upper-latin', 'upper-roman'];
  var listStylePositionKeywords = ['inside', 'outside', 'inherit'];
  var outlineStyleKeywords = ['auto', 'inherit', 'hidden', 'none', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];

  var compatibleCssUnitRegex;
  var compatibleCssUnitAnyRegex;

  var validator = {
    // FIXME: we need a proper OO here
    setCompatibility: function (compatibility) {
      if (compatibility.units.rem) {
        compatibleCssUnitRegex = cssUnitRegex;
        compatibleCssUnitAnyRegex = cssUnitAnyRegex;
        return;
      }

      var validUnits = allUnits.slice(0).filter(function (value) {
        return value != 'rem';
      });

      var compatibleCssUnitRegexStr = '(\\-?\\.?\\d+\\.?\\d*(' + validUnits.join('|') + ')|auto|inherit)';
      compatibleCssUnitRegex = new RegExp('^' + compatibleCssUnitRegexStr + '$', 'i');
      compatibleCssUnitAnyRegex = new RegExp('^(none|' + widthKeywords.join('|') + '|' + compatibleCssUnitRegexStr + '|' + cssVariableRegexStr + '|' + cssFunctionNoVendorRegexStr + '|' + cssFunctionVendorRegexStr + ')$', 'i');
    },

    isValidHexColor: function (s) {
      return (s.length === 4 || s.length === 7) && s[0] === '#';
    },
    isValidRgbaColor: function (s) {
      s = s.split(' ').join('');
      return s.length > 0 && s.indexOf('rgba(') === 0 && s.indexOf(')') === s.length - 1;
    },
    isValidHslaColor: function (s) {
      s = s.split(' ').join('');
      return s.length > 0 && s.indexOf('hsla(') === 0 && s.indexOf(')') === s.length - 1;
    },
    isValidNamedColor: function (s) {
      // We don't really check if it's a valid color value, but allow any letters in it
      return s !== 'auto' && (s === 'transparent' || s === 'inherit' || /^[a-zA-Z]+$/.test(s));
    },
    isValidVariable: function(s) {
      return cssVariableRegex.test(s);
    },
    isValidColor: function (s) {
      return validator.isValidNamedColor(s) || validator.isValidHexColor(s) || validator.isValidRgbaColor(s) || validator.isValidHslaColor(s) || validator.isValidVariable(s);
    },
    isValidUrl: function (s) {
      // NOTE: at this point all URLs are replaced with placeholders by clean-css, so we check for those placeholders
      return s.indexOf('__ESCAPED_URL_CLEAN_CSS') === 0;
    },
    isValidUnit: function (s) {
      return cssUnitAnyRegex.test(s);
    },
    isValidUnitWithoutFunction: function (s) {
      return cssUnitRegex.test(s);
    },
    isValidAndCompatibleUnit: function (s) {
      return compatibleCssUnitAnyRegex.test(s);
    },
    isValidAndCompatibleUnitWithoutFunction: function (s) {
      return compatibleCssUnitRegex.test(s);
    },
    isValidFunctionWithoutVendorPrefix: function (s) {
      return cssFunctionNoVendorRegex.test(s);
    },
    isValidFunctionWithVendorPrefix: function (s) {
      return cssFunctionVendorRegex.test(s);
    },
    isValidFunction: function (s) {
      return cssFunctionAnyRegex.test(s);
    },
    isValidBackgroundRepeat: function (s) {
      return backgroundRepeatKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidBackgroundAttachment: function (s) {
      return backgroundAttachmentKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidBackgroundPositionPart: function (s) {
      return backgroundPositionKeywords.indexOf(s) >= 0 || cssUnitOrCalcRegex.test(s) || validator.isValidVariable(s);
    },
    isValidBackgroundPosition: function (s) {
      if (s === 'inherit')
        return true;

      var parts = s.split(' ');
      for (var i = 0, l = parts.length; i < l; i++) {
        if (parts[i] === '')
          continue;
        if (validator.isValidBackgroundPositionPart(parts[i]) || validator.isValidVariable(parts[i]))
          continue;

        return false;
      }

      return true;
    },
    isValidBackgroundSizePart: function(s) {
      return backgroundSizeKeywords.indexOf(s) >= 0 || cssUnitRegex.test(s) || validator.isValidVariable(s);
    },
    isValidBackgroundPositionAndSize: function(s) {
      if (s.indexOf('/') < 0)
        return false;

      var twoParts = new Splitter('/').split(s);
      return validator.isValidBackgroundSizePart(twoParts.pop()) && validator.isValidBackgroundPositionPart(twoParts.pop());
    },
    isValidListStyleType: function (s) {
      return listStyleTypeKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidListStylePosition: function (s) {
      return listStylePositionKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidOutlineColor: function (s) {
      return s === 'invert' || validator.isValidColor(s) || validator.isValidVendorPrefixedValue(s);
    },
    isValidOutlineStyle: function (s) {
      return outlineStyleKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidOutlineWidth: function (s) {
      return validator.isValidUnit(s) || widthKeywords.indexOf(s) >= 0 || validator.isValidVariable(s);
    },
    isValidVendorPrefixedValue: function (s) {
      return /^-([A-Za-z0-9]|-)*$/gi.test(s);
    },
    areSameFunction: function (a, b) {
      if (!validator.isValidFunction(a) || !validator.isValidFunction(b))
        return false;

      var f1name = a.substring(0, a.indexOf('('));
      var f2name = b.substring(0, b.indexOf('('));

      return f1name === f2name;
    }
  };

  return validator;
})();

},{"../utils/splitter":42}],21:[function(require,module,exports){
var Tokenizer = require('./tokenizer');
var SimpleOptimizer = require('./optimizers/simple');
var AdvancedOptimizer = require('./optimizers/advanced');

function SelectorsOptimizer(options, context) {
  this.options = options || {};
  this.context = context || {};
}

SelectorsOptimizer.prototype.process = function (data, stringifier) {
  var tokens = new Tokenizer(this.context, this.options.advanced, this.options.sourceMap).toTokens(data);

  new SimpleOptimizer(this.options).optimize(tokens);
  if (this.options.advanced)
    new AdvancedOptimizer(this.options, this.context).optimize(tokens);

  return stringifier.toString(tokens);
};

module.exports = SelectorsOptimizer;

},{"./optimizers/advanced":22,"./optimizers/simple":24,"./tokenizer":27}],22:[function(require,module,exports){
var PropertyOptimizer = require('../../properties/optimizer');
var CleanUp = require('./clean-up');

function AdvancedOptimizer(options, context) {
  this.options = options;
  this.minificationsMade = [];
  this.propertyOptimizer = new PropertyOptimizer(this.options, context);
}

function changeBodyOf(token, newBody) {
  token.body = newBody.tokenized;
  token.metadata.body = newBody.list.join(';');
  token.metadata.bodiesList = newBody.list;
}

function changeSelectorOf(token, newSelectors) {
  token.value = newSelectors.tokenized;
  token.metadata.selector = newSelectors.list.join(',');
  token.metadata.selectorsList = newSelectors.list;
}

AdvancedOptimizer.prototype.isSpecial = function (selector) {
  return this.options.compatibility.selectors.special.test(selector);
};

AdvancedOptimizer.prototype.removeDuplicates = function (tokens) {
  var matched = {};
  var forRemoval = [];

  for (var i = 0, l = tokens.length; i < l; i++) {
    var token = tokens[i];
    if (token.kind != 'selector')
      continue;

    var id = token.metadata.body + '@' + token.metadata.selector;
    var alreadyMatched = matched[id];

    if (alreadyMatched) {
      forRemoval.push(alreadyMatched[0]);
      alreadyMatched.unshift(i);
    } else {
      matched[id] = [i];
    }
  }

  forRemoval = forRemoval.sort(function(a, b) {
    return a > b ? 1 : -1;
  });

  for (var j = 0, n = forRemoval.length; j < n; j++) {
    tokens.splice(forRemoval[j] - j, 1);
  }

  this.minificationsMade.unshift(forRemoval.length > 0);
};

AdvancedOptimizer.prototype.mergeAdjacent = function (tokens) {
  var forRemoval = [];
  var lastToken = { selector: null, body: null };

  for (var i = 0, l = tokens.length; i < l; i++) {
    var token = tokens[i];

    if (token.kind != 'selector')
      continue;

    if (lastToken.kind == 'selector' && token.metadata.selector == lastToken.metadata.selector) {
      var joinAt = [lastToken.body.length];
      changeBodyOf(
        lastToken,
        this.propertyOptimizer.process(token.value, lastToken.body.concat(token.body), joinAt, true)
      );
      forRemoval.push(i);
    } else if (lastToken.body && token.metadata.body == lastToken.metadata.body &&
        !this.isSpecial(token.metadata.selector) && !this.isSpecial(lastToken.metadata.selector)) {
      changeSelectorOf(
        lastToken,
        CleanUp.selectors(lastToken.value.concat(token.value), false)
      );
      forRemoval.push(i);
    } else {
      lastToken = token;
    }
  }

  for (var j = 0, m = forRemoval.length; j < m; j++) {
    tokens.splice(forRemoval[j] - j, 1);
  }

  this.minificationsMade.unshift(forRemoval.length > 0);
};

AdvancedOptimizer.prototype.reduceNonAdjacent = function (tokens) {
  var candidates = {};
  var repeated = [];

  for (var i = tokens.length - 1; i >= 0; i--) {
    var token = tokens[i];

    if (token.kind != 'selector')
      continue;

    var isComplexAndNotSpecial = token.value.length > 1 && !this.isSpecial(token.metadata.selector);
    var selectors = isComplexAndNotSpecial ?
      [token.metadata.selector].concat(token.metadata.selectorsList) :
      [token.metadata.selector];

    for (var j = 0, m = selectors.length; j < m; j++) {
      var selector = selectors[j];

      if (!candidates[selector])
        candidates[selector] = [];
      else
        repeated.push(selector);

      candidates[selector].push({
        where: i,
        list: token.metadata.selectorsList,
        isPartial: isComplexAndNotSpecial && j > 0,
        isComplex: isComplexAndNotSpecial && j === 0
      });
    }
  }

  var reducedInSimple = this.reduceSimpleNonAdjacentCases(tokens, repeated, candidates);
  var reducedInComplex = this.reduceComplexNonAdjacentCases(tokens, candidates);

  this.minificationsMade.unshift(reducedInSimple || reducedInComplex);
};

AdvancedOptimizer.prototype.reduceSimpleNonAdjacentCases = function (tokens, repeated, candidates) {
  var reduced = false;

  function filterOut(idx, bodies) {
    return data[idx].isPartial && bodies.length === 0;
  }

  function reduceBody(token, newBody, processedCount, tokenIdx) {
    if (!data[processedCount - tokenIdx - 1].isPartial) {
      changeBodyOf(token, newBody);
      reduced = true;
    }
  }

  for (var i = 0, l = repeated.length; i < l; i++) {
    var selector = repeated[i];
    var data = candidates[selector];

    this.reduceSelector(tokens, selector, data, {
      filterOut: filterOut,
      callback: reduceBody
    });
  }

  return reduced;
};

AdvancedOptimizer.prototype.reduceComplexNonAdjacentCases = function (tokens, candidates) {
  var reduced = false;
  var localContext = {};

  function filterOut(idx) {
    return localContext.data[idx].where < localContext.intoPosition;
  }

  function collectReducedBodies(token, newBody, processedCount, tokenIdx) {
    if (tokenIdx === 0)
      localContext.reducedBodies.push(newBody);
  }

  allSelectors:
  for (var complexSelector in candidates) {
    var into = candidates[complexSelector];
    if (!into[0].isComplex)
      continue;

    var intoPosition = into[into.length - 1].where;
    var intoToken = tokens[intoPosition];
    var reducedBodies = [];

    var selectors = this.isSpecial(complexSelector) ?
      [complexSelector] :
      into[0].list;

    localContext.intoPosition = intoPosition;
    localContext.reducedBodies = reducedBodies;

    for (var j = 0, m = selectors.length; j < m; j++) {
      var selector = selectors[j];
      var data = candidates[selector];

      if (data.length < 2)
        continue allSelectors;

      localContext.data = data;

      this.reduceSelector(tokens, selector, data, {
        filterOut: filterOut,
        callback: collectReducedBodies
      });

      if (reducedBodies[reducedBodies.length - 1].list.length != reducedBodies[0].list.length)
        continue allSelectors;
    }

    intoToken.body = reducedBodies[0].tokenized;
    reduced = true;
  }

  return reduced;
};

AdvancedOptimizer.prototype.reduceSelector = function (tokens, selector, data, options) {
  var bodies = [];
  var bodiesAsList = [];
  var joinsAt = [];
  var processedTokens = [];

  for (var j = data.length - 1, m = 0; j >= 0; j--) {
    if (options.filterOut(j, bodies))
      continue;

    var where = data[j].where;
    var token = tokens[where];

    bodies = bodies.concat(token.body);
    bodiesAsList.push(token.metadata.bodiesList);
    processedTokens.push(where);
  }

  for (j = 0, m = bodiesAsList.length; j < m; j++) {
    if (bodiesAsList[j].length > 0)
      joinsAt.push((joinsAt[j - 1] || 0) + bodiesAsList[j].length);
  }

  var optimizedBody = this.propertyOptimizer.process(selector, bodies, joinsAt, false);

  var processedCount = processedTokens.length;
  var propertyIdx = optimizedBody.tokenized.length - 1;
  var tokenIdx = processedCount - 1;

  while (tokenIdx >= 0) {
     if ((tokenIdx === 0 || (optimizedBody.tokenized[propertyIdx] && bodiesAsList[tokenIdx].indexOf(optimizedBody.tokenized[propertyIdx].value) > -1)) && propertyIdx > -1) {
      propertyIdx--;
      continue;
    }

    var newBody = {
      list: optimizedBody.list.splice(propertyIdx + 1),
      tokenized: optimizedBody.tokenized.splice(propertyIdx + 1)
    };
    options.callback(tokens[processedTokens[tokenIdx]], newBody, processedCount, tokenIdx);

    tokenIdx--;
  }
};

function optimizeProperties(tokens, propertyOptimizer) {
  for (var i = 0, l = tokens.length; i < l; i++) {
    var token = tokens[i];

    if (token.kind == 'selector') {
      changeBodyOf(
        token,
        propertyOptimizer.process(token.value, token.body, false, true)
      );
    } else if (token.kind == 'block') {
      optimizeProperties(token.body, propertyOptimizer);
    }
  }
}

AdvancedOptimizer.prototype.optimize = function (tokens) {
  var self = this;

  function _optimize(tokens) {
    tokens.forEach(function (token) {
      if (token.kind == 'block')
        _optimize(token.body);
    });

    optimizeProperties(tokens, self.propertyOptimizer);

    self.removeDuplicates(tokens);
    self.mergeAdjacent(tokens);
    self.reduceNonAdjacent(tokens);

    self.removeDuplicates(tokens);
    self.mergeAdjacent(tokens);
  }

  _optimize(tokens);
};

module.exports = AdvancedOptimizer;

},{"../../properties/optimizer":15,"./clean-up":23}],23:[function(require,module,exports){
function removeWhitespace(match, value) {
  return '[' + value.replace(/ /g, '') + ']';
}

function selectorSorter(s1, s2) {
  return s1.value > s2.value ? 1 : -1;
}

var CleanUp = {
  selectors: function (selectors, removeUnsupported) {
    var plain = [];
    var tokenized = [];

    for (var i = 0, l = selectors.length; i < l; i++) {
      var selector = selectors[i];
      var reduced = selector.value
        .replace(/\s+/g, ' ')
        .replace(/ ?, ?/g, ',')
        .replace(/\s*([>\+\~])\s*/g, '$1')
        .trim();

      if (removeUnsupported && (reduced.indexOf('*+html ') != -1 || reduced.indexOf('*:first-child+html ') != -1))
        continue;

      if (reduced.indexOf('*') > -1) {
        reduced = reduced
          .replace(/\*([:#\.\[])/g, '$1')
          .replace(/^(\:first\-child)?\+html/, '*$1+html');
      }

      if (reduced.indexOf('[') > -1)
        reduced = reduced.replace(/\[([^\]]+)\]/g, removeWhitespace);

      if (plain.indexOf(reduced) == -1) {
        plain.push(reduced);
        selector.value = reduced;
        tokenized.push(selector);
      }
    }

    return {
      list: plain.sort(),
      tokenized: tokenized.sort(selectorSorter)
    };
  },

  block: function (block) {
    return block
      .replace(/\s+/g, ' ')
      .replace(/(,|:|\() /g, '$1')
      .replace(/ \)/g, ')');
  },

  atRule: function (block) {
    return block
      .replace(/\s+/g, ' ')
      .trim();
  }
};

module.exports = CleanUp;

},{}],24:[function(require,module,exports){
var CleanUp = require('./clean-up');
var Splitter = require('../../utils/splitter');

var RGB = require('../../colors/rgb');
var HSL = require('../../colors/hsl');
var HexNameShortener = require('../../colors/hex-name-shortener');

var DEFAULT_ROUNDING_PRECISION = 2;
var CHARSET_TOKEN = '@charset';
var CHARSET_REGEXP = new RegExp('^' + CHARSET_TOKEN, 'i');

function SimpleOptimizer(options) {
  this.options = options;

  var units = ['px', 'em', 'ex', 'cm', 'mm', 'in', 'pt', 'pc', '%'];
  if (options.compatibility.units.rem)
    units.push('rem');
  options.unitsRegexp = new RegExp('(^|\\s|\\(|,)0(?:' + units.join('|') + ')', 'g');

  options.precision = {};
  options.precision.value = options.roundingPrecision === undefined ?
    DEFAULT_ROUNDING_PRECISION :
    options.roundingPrecision;
  options.precision.multiplier = Math.pow(10, options.precision.value);
  options.precision.regexp = new RegExp('(\\d*\\.\\d{' + (options.precision.value + 1) + ',})px', 'g');

  options.updateMetadata = this.options.advanced;
}

var valueMinifiers = {
  'background': function (value) {
    return value == 'none' || value == 'transparent' ? '0 0' : value;
  },
  'border-*-radius': function (value) {
    if (value.indexOf('/') == -1)
      return value;

    var parts = value.split(/\s*\/\s*/);
    if (parts[0] == parts[1])
      return parts[0];
    else
      return parts[0] + '/' + parts[1];
  },
  'filter': function (value) {
    if (value.indexOf('DXImageTransform') === value.lastIndexOf('DXImageTransform')) {
      value = value.replace(/progid:DXImageTransform\.Microsoft\.(Alpha|Chroma)/, function (match, filter) {
        return filter.toLowerCase();
      });
    }

    return value
      .replace(/,(\S)/g, ', $1')
      .replace(/ ?= ?/g, '=');
  },
  'font': function (value) {
    var parts = value.split(' ');

    if (parts[1] != 'normal' && parts[1] != 'bold' && !/^[1-9]00/.test(parts[1]))
      parts[0] = this['font-weight'](parts[0]);

    return parts.join(' ');
  },
  'font-weight': function (value) {
    if (value == 'normal')
      return '400';
    else if (value == 'bold')
      return '700';
    else
      return value;
  },
  'outline': function (value) {
    return value == 'none' ? '0' : value;
  }
};

function zeroMinifier(_, value) {
  if (value.indexOf('0') == -1)
    return value;

  return value
    .replace(/\-0$/g, '0')
    .replace(/\-0([^\.])/g, '0$1')
    .replace(/(^|\s)0+([1-9])/g, '$1$2')
    .replace(/(^|\D)\.0+(\D|$)/g, '$10$2')
    .replace(/(^|\D)\.0+(\D|$)/g, '$10$2')
    .replace(/\.([1-9]*)0+(\D|$)/g, function(match, nonZeroPart, suffix) {
      return (nonZeroPart.length > 0 ? '.' : '') + nonZeroPart + suffix;
    })
    .replace(/(^|\D)0\.(\d)/g, '$1.$2');
}

function precisionMinifier(_, value, precisionOptions) {
  if (precisionOptions.value === -1 || value.indexOf('.') === -1)
    return value;

  return value
    .replace(precisionOptions.regexp, function(match, number) {
      return Math.round(parseFloat(number) * precisionOptions.multiplier) / precisionOptions.multiplier + 'px';
    })
    .replace(/(\d)\.($|\D)/g, '$1$2');
}

function unitMinifier(_, value, unitsRegexp) {
  return value.replace(unitsRegexp, '$1' + '0');
}

function multipleZerosMinifier(property, value) {
  if (value.indexOf('0 0 0 0') == -1)
    return value;

  if (property.indexOf('box-shadow') > -1)
    return value == '0 0 0 0' ? '0 0' : value;

  return value.replace(/^0 0 0 0$/, '0');
}

function colorMininifier(property, value, compatibility) {
  if (value.indexOf('#') === -1 && value.indexOf('rgb') == -1 && value.indexOf('hsl') == -1)
    return HexNameShortener.shorten(value);

  value = value
    .replace(/rgb\((\-?\d+),(\-?\d+),(\-?\d+)\)/g, function (match, red, green, blue) {
      return new RGB(red, green, blue).toHex();
    })
    .replace(/hsl\((-?\d+),(-?\d+)%?,(-?\d+)%?\)/g, function (match, hue, saturation, lightness) {
      return new HSL(hue, saturation, lightness).toHex();
    })
    .replace(/(^|[^='"])#([0-9a-f]{6})/gi, function (match, prefix, color) {
      if (color[0] == color[1] && color[2] == color[3] && color[4] == color[5])
        return prefix + '#' + color[0] + color[2] + color[4];
      else
        return prefix + '#' + color;
    })
    .replace(/(rgb|rgba|hsl|hsla)\(([^\)]+)\)/g, function(match, colorFunction, colorDef) {
      var tokens = colorDef.split(',');
      var applies = colorFunction == 'hsl' || colorFunction == 'hsla' || tokens[0].indexOf('%') > -1;
      if (!applies)
        return match;

      if (tokens[1].indexOf('%') == -1)
        tokens[1] += '%';
      if (tokens[2].indexOf('%') == -1)
        tokens[2] += '%';
      return colorFunction + '(' + tokens.join(',') + ')';
    });

  if (compatibility.colors.opacity) {
    value = value.replace(/(?:rgba|hsla)\(0,0%?,0%?,0\)/g, function (match) {
      if (new Splitter(',').split(value).pop().indexOf('gradient(') > -1)
        return match;

      return 'transparent';
    });
  }

  return HexNameShortener.shorten(value);
}

function reduce(body, options) {
  var reduced = [];
  var properties = [];
  var newProperty;

  for (var i = 0, l = body.length; i < l; i++) {
    var token = body[i];

    // FIXME: the check should be gone with #396
    if (token.value.indexOf('__ESCAPED_') === 0) {
      reduced.push(token);
      properties.push(token.value);
      continue;
    }

    var firstColon = token.value.indexOf(':');
    var property = token.value.substring(0, firstColon);
    var value = token.value.substring(firstColon + 1);
    var important = false;

    if (!options.compatibility.properties.iePrefixHack && (property[0] == '_' || property[0] == '*'))
      continue;

    if (value.indexOf('!important') > 0 || value.indexOf('! important') > 0) {
      value = value.substring(0, value.indexOf('!')).trim();
      important = true;
    }

    if (property.indexOf('border') === 0 && property.indexOf('radius') > 0)
      value = valueMinifiers['border-*-radius'](value);

    if (valueMinifiers[property])
      value = valueMinifiers[property](value);

    value = precisionMinifier(property, value, options.precision);
    value = zeroMinifier(property, value);
    value = unitMinifier(property, value, options.unitsRegexp);
    value = multipleZerosMinifier(property, value);
    value = colorMininifier(property, value, options.compatibility);

    newProperty = property + ':' + value + (important ? '!important' : '');
    reduced.push({ value: newProperty, metadata: token.metadata });
    properties.push(newProperty);
  }

  return {
    tokenized: reduced,
    list: properties
  };
}

SimpleOptimizer.prototype.optimize = function(tokens) {
  var self = this;
  var hasCharset = false;
  var options = this.options;

  function _optimize(tokens) {
    for (var i = 0, l = tokens.length; i < l; i++) {
      var token = tokens[i];
      // FIXME: why it's so?
      if (!token)
        break;

      if (token.kind == 'selector') {
        var newSelectors = CleanUp.selectors(token.value, !options.compatibility.selectors.ie7Hack);
        token.value = newSelectors.tokenized;

        if (token.value.length === 0) {
          tokens.splice(i, 1);
          i--;
          continue;
        }
        var newBody = reduce(token.body, self.options);
        token.body = newBody.tokenized;

        if (options.updateMetadata) {
          token.metadata.body = newBody.list.join(';');
          token.metadata.bodiesList = newBody.list;
          token.metadata.selector = newSelectors.list.join(',');
          token.metadata.selectorsList = newSelectors.list;
        }
      } else if (token.kind == 'block') {
        token.value = CleanUp.block(token.value);
        if (token.isFlatBlock)
          token.body = reduce(token.body, self.options).tokenized;
        else
          _optimize(token.body);
      } else if (token.kind == 'at-rule') {
        token.value = CleanUp.atRule(token.value);

        if (CHARSET_REGEXP.test(token.value)) {
          if (hasCharset || token.value.indexOf(CHARSET_TOKEN) == -1) {
            tokens.splice(i, 1);
            i--;
          } else {
            hasCharset = true;
            tokens.splice(i, 1);
            tokens.unshift({ kind: 'at-rule', value: token.value.replace(CHARSET_REGEXP, CHARSET_TOKEN) });
          }
        }
      }
    }
  }

  _optimize(tokens);
};

module.exports = SimpleOptimizer;

},{"../../colors/hex-name-shortener":9,"../../colors/hsl":10,"../../colors/rgb":11,"../../utils/splitter":42,"./clean-up":23}],25:[function(require,module,exports){
(function (process){
var path = require('path');
var fs = require('fs');
var url = require('url');

var SourceMapGenerator = require('source-map').SourceMapGenerator;

var lineBreak = require('os').EOL;

function Rebuilder(options, restoreCallback, inputMapTracker) {
  this.column = 0;
  this.line = 1;
  this.output = [];
  this.keepBreaks = options.keepBreaks;
  this.restore = restoreCallback;
  this.inputMapTracker = inputMapTracker;
  this.outputMap = new SourceMapGenerator();

  if (options.root) {
    this.rebaseTo = path.resolve(options.root);
    this.resolvePath = this.rootPathResolver;
  } else if (options.target) {
    this.rebaseTo = path.resolve(process.cwd(), options.target);
    if (!fs.existsSync(this.rebaseTo) || fs.statSync(this.rebaseTo).isFile())
      this.rebaseTo = path.dirname(this.rebaseTo);
    this.resolvePath = this.relativePathResolver;
  }
}

Rebuilder.prototype.rootPathResolver = function (sourcePath) {
  return sourcePath.replace(this.rebaseTo, '');
};

Rebuilder.prototype.relativePathResolver = function (sourcePath, sourceRelativeTo) {
  if (sourceRelativeTo)
    sourcePath = path.resolve(path.dirname(sourceRelativeTo), sourcePath);

  return path.relative(this.rebaseTo, sourcePath);
};

Rebuilder.prototype.rebuildValue = function (list, separator, isSelector) {
  var escaped = 0;

  for (var i = 0, l = list.length; i < l; i++) {
    var el = list[i];

    if (el.value.indexOf('__ESCAPED_') === 0) {
      this.store(el);
      escaped++;

      if (i === l - 1 && escaped > 0)
        this.output.splice(this.output.length - escaped - 1, 1);
    } else {
      this.store(el, isSelector ? l : 0);
      this.store(i < l - 1 ? separator : '');
      escaped = 0;
    }
  }
};

Rebuilder.prototype.store = function (token, allowNFallbacks) {
  var value = typeof token == 'string' ?
    token :
    token.value.indexOf('_') > -1 ? this.restore(token.value) : token.value;

  this.track(value, token.metadata, allowNFallbacks);
  this.output.push(value);
};

Rebuilder.prototype.rebuildList = function (tokens, isFlatBlock) {
  var joinCharacter = isFlatBlock ? ';' : (this.keepBreaks ? lineBreak : '');

  for (var i = 0, l = tokens.length; i < l; i++) {
    var token = tokens[i];

    if (token.kind === 'text' || token.kind == 'at-rule') {
      this.store(token);
      continue;
    }

    // FIXME: broken due to joining/splitting
    if (token.body && (token.body.length === 0 || (token.body.length == 1 && token.body[0].value === '')))
      continue;

    if (token.kind == 'block') {
      if (token.body.length > 0) {
        this.rebuildValue([{ value: token.value, metadata: token.metadata }], '');
        this.store('{');
        if (token.isFlatBlock)
          this.rebuildValue(token.body, ';');
        else
          this.rebuildList(token.body, false);
        this.store('}');
      }
    } else {
      this.rebuildValue(token.value, ',', true);
      this.store('{');
      this.rebuildValue(token.body, ';');
      this.store('}');
    }

    this.store(joinCharacter);
  }
};

Rebuilder.prototype.track = function (value, metadata, allowNFallbacks) {
  if (metadata)
    this.trackMetadata(metadata, value, allowNFallbacks);

  var parts = value.split('\n');
  this.line += parts.length - 1;
  this.column = parts.length > 1 ? 0 : (this.column + parts.pop().length);
};

Rebuilder.prototype.trackMetadata = function (metadata, value, allowNFallbacks) {
  var original = this.inputMapTracker.isTracking(metadata) ?
    this.inputMapTracker.originalPositionFor(metadata, value, allowNFallbacks) :
    {};

  this.outputMap.addMapping({
    generated: {
      line: this.line,
      column: this.column,
    },
    source: this.stylingSourceFor(original, metadata) || '__stdin__.css',
    original: {
      line: original.line || metadata.line,
      column: original.column || metadata.column
    }
  });
};

Rebuilder.prototype.stylingSourceFor = function (original, metadata) {
  var source = original.source || metadata.source;

  if (source && metadata.source && (/^https?:\/\//.test(metadata.source) || /^\/\//.test(metadata.source)) && source != metadata.source)
    return url.resolve(metadata.source, source);
  else if (source && this.resolvePath)
    return this.resolvePath(source, metadata.source);
  else
    return source;
};


function SourceMapStringifier(options, restoreCallback, inputMapTracker) {
  this.rebuilder = new Rebuilder(options, restoreCallback, inputMapTracker);
}

SourceMapStringifier.prototype.toString = function (tokens) {
  this.rebuilder.rebuildList(tokens);

  return {
    sourceMap: this.rebuilder.outputMap,
    styles: this.rebuilder.output.join('').trim()
  };
};

module.exports = SourceMapStringifier;

}).call(this,require('_process'))
},{"_process":65,"fs":5,"os":63,"path":64,"source-map":43,"url":82}],26:[function(require,module,exports){
var lineBreak = require('os').EOL;

function Stringifier(options, restoreCallback) {
  this.keepBreaks = options.keepBreaks;
  this.restoreCallback = restoreCallback;
}

function valueRebuilder(list, separator) {
  var merged = '';

  for (var i = 0, l = list.length; i < l; i++) {
    var el = list[i];

    if (el.value.indexOf('__ESCAPED_') === 0) {
      merged += el.value;

      if (i === l - 1) {
        var lastSemicolonAt = merged.lastIndexOf(';');
        merged = merged.substring(0, lastSemicolonAt) + merged.substring(lastSemicolonAt + 1);
      }
    } else {
      merged += list[i].value + (i < l - 1 ? separator : '');
    }
  }

  return merged;
}

function rebuild(tokens, keepBreaks, isFlatBlock) {
  var joinCharacter = isFlatBlock ? ';' : (keepBreaks ? lineBreak : '');
  var parts = [];
  var body;
  var selector;

  for (var i = 0, l = tokens.length; i < l; i++) {
    var token = tokens[i];

    if (token.kind === 'text' || token.kind == 'at-rule') {
      parts.push(token.value);
      continue;
    }

    // FIXME: broken due to joining/splitting
    if (token.body && (token.body.length === 0 || (token.body.length == 1 && token.body[0].value === '')))
      continue;

    if (token.kind == 'block') {
      body = token.isFlatBlock ?
        valueRebuilder(token.body, ';') :
        rebuild(token.body, keepBreaks, token.isFlatBlock);
      if (body.length > 0)
        parts.push(token.value + '{' + body + '}');
    } else {
      selector = valueRebuilder(token.value, ',');
      body = valueRebuilder(token.body, ';');
      parts.push(selector + '{' + body + '}');
    }
  }

  return parts.join(joinCharacter);
}

Stringifier.prototype.toString = function (tokens) {
  var rebuilt = rebuild(tokens, this.keepBreaks, false);

  return {
    styles: this.restoreCallback(rebuilt).trim()
  };
};

module.exports = Stringifier;

},{"os":63}],27:[function(require,module,exports){
var Chunker = require('../utils/chunker');
var Extract = require('../utils/extractors');
var SourceMaps = require('../utils/source-maps');

var flatBlock = /(^@(font\-face|page|\-ms\-viewport|\-o\-viewport|viewport|counter\-style)|\\@.+?)/;

function Tokenizer(minifyContext, addMetadata, addSourceMap) {
  this.minifyContext = minifyContext;
  this.addMetadata = addMetadata;
  this.addSourceMap = addSourceMap;
}

Tokenizer.prototype.toTokens = function (data) {
  data = data.replace(/\r\n/g, '\n');

  var chunker = new Chunker(data, '}', 128);
  if (chunker.isEmpty())
    return [];

  var context = {
    cursor: 0,
    mode: 'top',
    chunker: chunker,
    chunk: chunker.next(),
    outer: this.minifyContext,
    addMetadata: this.addMetadata,
    addSourceMap: this.addSourceMap,
    state: [],
    line: 1,
    column: 0,
    source: undefined
  };

  return tokenize(context);
};

function whatsNext(context) {
  var mode = context.mode;
  var chunk = context.chunk;
  var closest;

  if (chunk.length == context.cursor) {
    if (context.chunker.isEmpty())
      return null;

    context.chunk = chunk = context.chunker.next();
    context.cursor = 0;
  }

  if (mode == 'body') {
    closest = chunk.indexOf('}', context.cursor);
    return closest > -1 ?
      [closest, 'bodyEnd'] :
      null;
  }

  var nextSpecial = chunk.indexOf('@', context.cursor);
  var nextEscape = chunk.indexOf('__ESCAPED_', context.cursor);
  var nextBodyStart = chunk.indexOf('{', context.cursor);
  var nextBodyEnd = chunk.indexOf('}', context.cursor);

  if (nextEscape > -1 && /\S/.test(chunk.substring(context.cursor, nextEscape)))
    nextEscape = -1;

  closest = nextSpecial;
  if (closest == -1 || (nextEscape > -1 && nextEscape < closest))
    closest = nextEscape;
  if (closest == -1 || (nextBodyStart > -1 && nextBodyStart < closest))
    closest = nextBodyStart;
  if (closest == -1 || (nextBodyEnd > -1 && nextBodyEnd < closest))
    closest = nextBodyEnd;

  if (closest == -1)
    return;
  if (nextEscape === closest)
    return [closest, 'escape'];
  if (nextBodyStart === closest)
    return [closest, 'bodyStart'];
  if (nextBodyEnd === closest)
    return [closest, 'bodyEnd'];
  if (nextSpecial === closest)
    return [closest, 'special'];
}

function tokenize(context) {
  var chunk = context.chunk;
  var tokenized = [];
  var newToken;
  var value;
  var addSourceMap = context.addSourceMap;

  while (true) {
    var next = whatsNext(context);
    if (!next) {
      var whatsLeft = context.chunk.substring(context.cursor);
      if (whatsLeft.trim().length > 0) {
        tokenized.push({ kind: 'text', value: whatsLeft });
        context.cursor += whatsLeft.length;
      }
      break;
    }

    var nextSpecial = next[0];
    var what = next[1];
    var nextEnd;
    var oldMode;

    chunk = context.chunk;

    if (context.cursor != nextSpecial && what != 'bodyEnd') {
      var spacing = chunk.substring(context.cursor, nextSpecial);
      var leadingWhitespace = /^\s+/.exec(spacing);

      if (leadingWhitespace) {
        context.cursor += leadingWhitespace[0].length;

        if (addSourceMap)
          SourceMaps.track(leadingWhitespace[0], context);
      }
    }

    if (what == 'special') {
      var firstOpenBraceAt = chunk.indexOf('{', nextSpecial);
      var firstSemicolonAt = chunk.indexOf(';', nextSpecial);
      var isSingle = firstSemicolonAt > -1 && (firstOpenBraceAt == -1 || firstSemicolonAt < firstOpenBraceAt);
      var isBroken = firstOpenBraceAt == -1 && firstSemicolonAt == -1;
      if (isBroken) {
        context.outer.warnings.push('Broken declaration: \'' + chunk.substring(context.cursor) +  '\'.');
        context.cursor = chunk.length;
      } else if (isSingle) {
        nextEnd = chunk.indexOf(';', nextSpecial + 1);

        value = chunk.substring(context.cursor, nextEnd + 1);
        newToken = { kind: 'at-rule', value: value };
        tokenized.push(newToken);

        if (addSourceMap)
          newToken.metadata = SourceMaps.saveAndTrack(value, context, true);

        context.cursor = nextEnd + 1;
      } else {
        nextEnd = chunk.indexOf('{', nextSpecial + 1);
        value = chunk.substring(context.cursor, nextEnd);

        var trimmedValue = value.trim();
        var isFlat = flatBlock.test(trimmedValue);
        oldMode = context.mode;
        context.cursor = nextEnd + 1;
        context.mode = isFlat ? 'body' : 'block';

        newToken = { kind: 'block', value: trimmedValue, isFlatBlock: isFlat };

        if (addSourceMap)
          newToken.metadata = SourceMaps.saveAndTrack(value, context, true);

        newToken.body = tokenize(context);
        if (typeof newToken.body == 'string')
          newToken.body = Extract.properties(newToken.body, context).tokenized;

        context.mode = oldMode;

        if (addSourceMap)
          SourceMaps.suffix(context);

        tokenized.push(newToken);
      }
    } else if (what == 'escape') {
      nextEnd = chunk.indexOf('__', nextSpecial + 1);
      var escaped = chunk.substring(context.cursor, nextEnd + 2);
      var isStartSourceMarker = !!context.outer.sourceTracker.nextStart(escaped);
      var isEndSourceMarker = !!context.outer.sourceTracker.nextEnd(escaped);

      if (isStartSourceMarker) {
        if (addSourceMap)
          SourceMaps.track(escaped, context);

        context.state.push({
          source: context.source,
          line: context.line,
          column: context.column
        });
        context.source = context.outer.sourceTracker.nextStart(escaped).filename;
        context.line = 1;
        context.column = 0;
      } else if (isEndSourceMarker) {
        var oldState = context.state.pop();
        context.source = oldState.source;
        context.line = oldState.line;
        context.column = oldState.column;

        if (addSourceMap)
          SourceMaps.track(escaped, context);
      } else {
        if (escaped.indexOf('__ESCAPED_COMMENT_SPECIAL') === 0)
          tokenized.push({ kind: 'text', value: escaped });

        if (addSourceMap)
          SourceMaps.track(escaped, context);
      }

      context.cursor = nextEnd + 2;
    } else if (what == 'bodyStart') {
      var selectorData = Extract.selectors(chunk.substring(context.cursor, nextSpecial), context);

      oldMode = context.mode;
      context.cursor = nextSpecial + 1;
      context.mode = 'body';

      var bodyData = Extract.properties(tokenize(context), context);

      if (addSourceMap)
        SourceMaps.suffix(context);

      context.mode = oldMode;

      newToken = {
        kind: 'selector',
        value: selectorData.tokenized,
        body: bodyData.tokenized
      };
      if (context.addMetadata) {
        newToken.metadata = {
          body: bodyData.list.join(','),
          bodiesList: bodyData.list,
          selector: selectorData.list.join(','),
          selectorsList: selectorData.list
        };
      }
      tokenized.push(newToken);
    } else if (what == 'bodyEnd') {
      // extra closing brace at the top level can be safely ignored
      if (context.mode == 'top') {
        var at = context.cursor;
        var warning = chunk[context.cursor] == '}' ?
          'Unexpected \'}\' in \'' + chunk.substring(at - 20, at + 20) + '\'. Ignoring.' :
          'Unexpected content: \'' + chunk.substring(at, nextSpecial + 1) + '\'. Ignoring.';

        context.outer.warnings.push(warning);
        context.cursor = nextSpecial + 1;
        continue;
      }

      if (context.mode == 'block' && context.addSourceMap)
        SourceMaps.track(chunk.substring(context.cursor, nextSpecial), context);
      if (context.mode != 'block')
        tokenized = chunk.substring(context.cursor, nextSpecial);

      context.cursor = nextSpecial + 1;

      break;
    }
  }

  return tokenized;
}

module.exports = Tokenizer;

},{"../utils/chunker":33,"../utils/extractors":35,"../utils/source-maps":39}],28:[function(require,module,exports){
var EscapeStore = require('./escape-store');
var QuoteScanner = require('../utils/quote-scanner');

var SPECIAL_COMMENT_PREFIX = '/*!';
var COMMENT_PREFIX = '/*';
var COMMENT_SUFFIX = '*/';

var lineBreak = require('os').EOL;

function CommentsProcessor(context, keepSpecialComments, keepBreaks, saveWaypoints) {
  this.comments = new EscapeStore('COMMENT');
  this.specialComments = new EscapeStore('COMMENT_SPECIAL');

  this.context = context;
  this.keepAll = keepSpecialComments == '*';
  this.keepOne = keepSpecialComments == '1' || keepSpecialComments === 1;
  this.keepBreaks = keepBreaks;
  this.saveWaypoints = saveWaypoints;
}

function quoteScannerFor(data) {
  var quoteMap = [];
  new QuoteScanner(data).each(function (quotedString, _, startsAt) {
    quoteMap.push([startsAt, startsAt + quotedString.length]);
  });

  return function (position) {
    for (var i = 0, l = quoteMap.length; i < l; i++) {
      if (quoteMap[i][0] < position && quoteMap[i][1] > position)
        return true;
    }

    return false;
  };
}

CommentsProcessor.prototype.escape = function (data) {
  var tempData = [];
  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;
  var indent = 0;
  var breaksCount;
  var lastBreakAt;
  var newIndent;
  var isQuotedAt = quoteScannerFor(data);
  var saveWaypoints = this.saveWaypoints;

  for (; nextEnd < data.length;) {
    nextStart = data.indexOf(COMMENT_PREFIX, cursor);
    if (nextStart == -1)
      break;

    if (isQuotedAt(nextStart)) {
      tempData.push(data.substring(cursor, nextStart + COMMENT_PREFIX.length));
      cursor = nextStart + COMMENT_PREFIX.length;
      continue;
    }

    nextEnd = data.indexOf(COMMENT_SUFFIX, nextStart + COMMENT_PREFIX.length);
    if (nextEnd == -1) {
      this.context.warnings.push('Broken comment: \'' + data.substring(nextStart) + '\'.');
      nextEnd = data.length - 2;
    }

    tempData.push(data.substring(cursor, nextStart));

    var comment = data.substring(nextStart, nextEnd + COMMENT_SUFFIX.length);
    var isSpecialComment = comment.indexOf(SPECIAL_COMMENT_PREFIX) === 0;

    if (saveWaypoints) {
      breaksCount = comment.split(lineBreak).length - 1;
      lastBreakAt = comment.lastIndexOf(lineBreak);
      newIndent = lastBreakAt > 0 ?
        comment.substring(lastBreakAt + lineBreak.length).length :
        indent + comment.length;
    }

    if (saveWaypoints || isSpecialComment) {
      var metadata = saveWaypoints ? [breaksCount, newIndent] : null;
      var placeholder = isSpecialComment ?
        this.specialComments.store(comment, metadata) :
        this.comments.store(comment, metadata);
      tempData.push(placeholder);
    }

    if (saveWaypoints)
      indent = newIndent + 1;
    cursor = nextEnd + COMMENT_SUFFIX.length;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

function restore(context, data, from, isSpecial) {
  var tempData = [];
  var restored = 0;
  var cursor = 0;
  var addBreak;

  for (; cursor < data.length;) {
    var nextMatch = from.nextMatch(data, cursor);
    if (nextMatch.start < 0)
      break;

    tempData.push(data.substring(cursor, nextMatch.start));
    var comment = from.restore(nextMatch.match);

    if (isSpecial && (context.keepAll || (context.keepOne && restored === 0))) {
      restored++;
      addBreak = context.keepBreaks && data[nextMatch.end] != '\n' && data.lastIndexOf('\r\n', nextMatch.end + 1) != nextMatch.end;
      tempData.push(comment, addBreak ? lineBreak : '');
    } else {
      nextMatch.end += context.keepBreaks ? lineBreak.length : 0;
    }

    cursor = nextMatch.end;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
}

CommentsProcessor.prototype.restore = function (data) {
  data = restore(this, data, this.comments, false);
  data = restore(this, data, this.specialComments, true);
  return data;
};

module.exports = CommentsProcessor;

},{"../utils/quote-scanner":38,"./escape-store":29,"os":63}],29:[function(require,module,exports){
var placeholderBrace = '__';

function EscapeStore(placeholderRoot) {
  this.placeholderRoot = 'ESCAPED_' + placeholderRoot + '_CLEAN_CSS';
  this.placeholderToData = {};
  this.dataToPlaceholder = {};
  this.count = 0;
  this.restoreMatcher = new RegExp(this.placeholderRoot + '(\\d+)');
}

EscapeStore.prototype._nextPlaceholder = function (metadata) {
  return {
    index: this.count,
    value: placeholderBrace + this.placeholderRoot + this.count++ + metadata + placeholderBrace
  };
};

EscapeStore.prototype.store = function (data, metadata) {
  var encodedMetadata = metadata ?
    '(' + metadata.join(',') + ')' :
    '';
  var placeholder = this.dataToPlaceholder[data];

  if (!placeholder) {
    var nextPlaceholder = this._nextPlaceholder(encodedMetadata);
    placeholder = nextPlaceholder.value;
    this.placeholderToData[nextPlaceholder.index] = data;
    this.dataToPlaceholder[data] = nextPlaceholder.value;
  }

  if (metadata)
    placeholder = placeholder.replace(/\([^\)]+\)/, encodedMetadata);

  return placeholder;
};

EscapeStore.prototype.nextMatch = function (data, cursor) {
  var next = {};

  next.start = data.indexOf(this.placeholderRoot, cursor) - placeholderBrace.length;
  next.end = data.indexOf(placeholderBrace, next.start + placeholderBrace.length) + placeholderBrace.length;
  if (next.start > -1 && next.end > -1)
    next.match = data.substring(next.start, next.end);

  return next;
};

EscapeStore.prototype.restore = function (placeholder) {
  var index = this.restoreMatcher.exec(placeholder)[1];
  return this.placeholderToData[index];
};

module.exports = EscapeStore;

},{}],30:[function(require,module,exports){
var EscapeStore = require('./escape-store');

var EXPRESSION_NAME = 'expression';
var EXPRESSION_START = '(';
var EXPRESSION_END = ')';
var EXPRESSION_PREFIX = EXPRESSION_NAME + EXPRESSION_START;
var BODY_START = '{';
var BODY_END = '}';

var lineBreak = require('os').EOL;

function findEnd(data, start) {
  var end = start + EXPRESSION_NAME.length;
  var level = 0;
  var quoted = false;
  var braced = false;

  while (true) {
    var current = data[end++];

    if (quoted) {
      quoted = current != '\'' && current != '"';
    } else {
      quoted = current == '\'' || current == '"';

      if (current == EXPRESSION_START)
        level++;
      if (current == EXPRESSION_END)
        level--;
      if (current == BODY_START)
        braced = true;
      if (current == BODY_END && !braced && level == 1) {
        end--;
        level--;
      }
    }

    if (level === 0 && current == EXPRESSION_END)
      break;
    if (!current) {
      end = data.substring(0, end).lastIndexOf(BODY_END);
      break;
    }
  }

  return end;
}

function ExpressionsProcessor(saveWaypoints) {
  this.expressions = new EscapeStore('EXPRESSION');
  this.saveWaypoints = saveWaypoints;
}

ExpressionsProcessor.prototype.escape = function (data) {
  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;
  var tempData = [];
  var indent = 0;
  var breaksCount;
  var lastBreakAt;
  var newIndent;
  var saveWaypoints = this.saveWaypoints;

  for (; nextEnd < data.length;) {
    nextStart = data.indexOf(EXPRESSION_PREFIX, nextEnd);
    if (nextStart == -1)
      break;

    nextEnd = findEnd(data, nextStart);

    var expression = data.substring(nextStart, nextEnd);
    if (saveWaypoints) {
      breaksCount = expression.split(lineBreak).length - 1;
      lastBreakAt = expression.lastIndexOf(lineBreak);
      newIndent = lastBreakAt > 0 ?
        expression.substring(lastBreakAt + lineBreak.length).length :
        indent + expression.length;
    }

    var metadata = saveWaypoints ? [breaksCount, newIndent] : null;
    var placeholder = this.expressions.store(expression, metadata);
    tempData.push(data.substring(cursor, nextStart));
    tempData.push(placeholder);

    if (saveWaypoints)
      indent = newIndent + 1;
    cursor = nextEnd;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

ExpressionsProcessor.prototype.restore = function (data) {
  var tempData = [];
  var cursor = 0;

  for (; cursor < data.length;) {
    var nextMatch = this.expressions.nextMatch(data, cursor);
    if (nextMatch.start < 0)
      break;

    tempData.push(data.substring(cursor, nextMatch.start));
    var comment = this.expressions.restore(nextMatch.match);
    tempData.push(comment);

    cursor = nextMatch.end;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

module.exports = ExpressionsProcessor;

},{"./escape-store":29,"os":63}],31:[function(require,module,exports){
var EscapeStore = require('./escape-store');
var QuoteScanner = require('../utils/quote-scanner');

var lineBreak = require('os').EOL;

function FreeTextProcessor(saveWaypoints) {
  this.matches = new EscapeStore('FREE_TEXT');
  this.saveWaypoints = saveWaypoints;
}

// Strip content tags by replacing them by the a special
// marker for further restoring. It's done via string scanning
// instead of regexps to speed up the process.
FreeTextProcessor.prototype.escape = function(data) {
  var self = this;
  var breaksCount;
  var lastBreakAt;
  var indent;
  var metadata;
  var saveWaypoints = this.saveWaypoints;

  return new QuoteScanner(data).each(function(match, store) {
    if (saveWaypoints) {
      breaksCount = match.split(lineBreak).length - 1;
      lastBreakAt = match.lastIndexOf(lineBreak);
      indent = lastBreakAt > 0 ?
        match.substring(lastBreakAt + lineBreak.length).length :
        match.length;
      metadata = [breaksCount, indent];
    }

    var placeholder = self.matches.store(match, metadata);
    store.push(placeholder);
  });
};

function normalize(text, data, cursor) {
  // FIXME: this is a hack
  var lastSemicolon = data.lastIndexOf(';', cursor);
  var lastOpenBrace = data.lastIndexOf('{', cursor);
  var lastOne = 0;

  if (lastSemicolon > -1 && lastOpenBrace > -1)
    lastOne = Math.max(lastSemicolon, lastOpenBrace);
  else if (lastSemicolon == -1)
    lastOne = lastOpenBrace;
  else
    lastOne = lastSemicolon;

  var context = data.substring(lastOne + 1, cursor);

  if (/\[[\w\d\-]+[\*\|\~\^\$]?=$/.test(context))
    text = text.replace(/\\\n|\\\r\n/g, '');

  if (/^['"][a-zA-Z][a-zA-Z\d\-_]+['"]$/.test(text) && !/format\($/.test(context)) {
    var isFont = /^(font|font\-family):/.test(context);
    var isAttribute = /\[[\w\d\-]+[\*\|\~\^\$]?=$/.test(context);
    var isKeyframe = /@(-moz-|-o-|-webkit-)?keyframes /.test(context);
    var isAnimation = /^(-moz-|-o-|-webkit-)?animation(-name)?:/.test(context);

    if (isFont || isAttribute || isKeyframe || isAnimation)
      text = text.substring(1, text.length - 1);
  }

  return text;
}

FreeTextProcessor.prototype.restore = function(data) {
  var tempData = [];
  var cursor = 0;

  for (; cursor < data.length;) {
    var nextMatch = this.matches.nextMatch(data, cursor);
    if (nextMatch.start < 0)
      break;

    tempData.push(data.substring(cursor, nextMatch.start));
    var text = normalize(this.matches.restore(nextMatch.match), data, nextMatch.start);
    tempData.push(text);

    cursor = nextMatch.end;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

module.exports = FreeTextProcessor;

},{"../utils/quote-scanner":38,"./escape-store":29,"os":63}],32:[function(require,module,exports){
var EscapeStore = require('./escape-store');

var URL_PREFIX = 'url(';
var URL_SUFFIX = ')';
var lineBreak = require('os').EOL;

function UrlsProcessor(context, saveWaypoints) {
  this.urls = new EscapeStore('URL');
  this.context = context;
  this.saveWaypoints = saveWaypoints;
}

// Strip urls by replacing them by a special
// marker for further restoring. It's done via string scanning
// instead of regexps to speed up the process.
UrlsProcessor.prototype.escape = function (data) {
  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;
  var tempData = [];
  var breaksCount;
  var lastBreakAt;
  var indent;
  var saveWaypoints = this.saveWaypoints;

  for (; nextEnd < data.length;) {
    nextStart = data.indexOf(URL_PREFIX, nextEnd);
    if (nextStart == -1)
      break;

    if (data[nextStart + URL_PREFIX.length] == '"')
      nextEnd = data.indexOf('"', nextStart + URL_PREFIX.length + 1);
    else if (data[nextStart + URL_PREFIX.length] == '\'')
      nextEnd = data.indexOf('\'', nextStart + URL_PREFIX.length + 1);
    else
      nextEnd = data.indexOf(URL_SUFFIX, nextStart);

    // Following lines are a safety mechanism to ensure
    // incorrectly terminated urls are processed correctly.
    if (nextEnd == -1) {
      nextEnd = data.indexOf('}', nextStart);

      if (nextEnd == -1)
        nextEnd = data.length;
      else
        nextEnd--;

      this.context.warnings.push('Broken URL declaration: \'' + data.substring(nextStart, nextEnd + 1) + '\'.');
    } else {
      if (data[nextEnd] != URL_SUFFIX)
        nextEnd = data.indexOf(URL_SUFFIX, nextEnd);
    }

    var url = data.substring(nextStart, nextEnd + 1);

    if (saveWaypoints) {
      breaksCount = url.split(lineBreak).length - 1;
      lastBreakAt = url.lastIndexOf(lineBreak);
      indent = lastBreakAt > 0 ?
        url.substring(lastBreakAt + lineBreak.length).length :
        url.length;
    }

    var placeholder = this.urls.store(url, saveWaypoints ? [breaksCount, indent] : null);
    tempData.push(data.substring(cursor, nextStart));
    tempData.push(placeholder);

    cursor = nextEnd + 1;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

function normalize(url) {
  url = url
    .replace(/\\?\n|\\?\r\n/g, '')
    .replace(/(\s{2,}|\s)/g, ' ')
    .replace(/^url\((['"])? /, 'url($1')
    .replace(/ (['"])?\)$/, '$1)');

  if (!/url\(.*[\s\(\)].*\)/.test(url) && !/url\(['"]data:[^;]+;charset/.test(url))
    url = url.replace(/["']/g, '');

  return url;
}

UrlsProcessor.prototype.restore = function (data) {
  var tempData = [];
  var cursor = 0;

  for (; cursor < data.length;) {
    var nextMatch = this.urls.nextMatch(data, cursor);
    if (nextMatch.start < 0)
      break;

    tempData.push(data.substring(cursor, nextMatch.start));
    var url = normalize(this.urls.restore(nextMatch.match));
    tempData.push(url);

    cursor = nextMatch.end;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

module.exports = UrlsProcessor;

},{"./escape-store":29,"os":63}],33:[function(require,module,exports){
// Divides `data` into chunks of `chunkSize` for faster processing
function Chunker(data, breakString, chunkSize) {
  this.chunks = [];

  for (var cursor = 0, dataSize = data.length; cursor < dataSize;) {
    var nextCursor = cursor + chunkSize > dataSize ?
      dataSize - 1 :
      cursor + chunkSize;

    if (data[nextCursor] != breakString)
      nextCursor = data.indexOf(breakString, nextCursor);
    if (nextCursor == -1)
      nextCursor = data.length - 1;

    this.chunks.push(data.substring(cursor, nextCursor + breakString.length));
    cursor = nextCursor + breakString.length;
  }
}

Chunker.prototype.isEmpty = function () {
  return this.chunks.length === 0;
};

Chunker.prototype.next = function () {
  return this.chunks.shift();
};

module.exports = Chunker;

},{}],34:[function(require,module,exports){
var util = require('util');

var DEFAULTS = {
  '*': {
    colors: {
      opacity: true // rgba / hsla
    },
    properties: {
      backgroundSizeMerging: false, // background-size to shorthand
      iePrefixHack: false, // underscore / asterisk prefix hacks on IE
      ieSuffixHack: false, // \9 suffix hacks on IE
      merging: true // merging properties into one
    },
    selectors: {
      ie7Hack: false, // *+html hack
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:dir\([a-z-]*\)|:first(?![a-z-])|:fullscreen|:left|:read-only|:read-write|:right)/ // special selectors which prevent merging
    },
    units: {
      rem: true
    }
  },
  'ie8': {
    colors: {
      opacity: false
    },
    properties: {
      backgroundSizeMerging: false,
      iePrefixHack: true,
      ieSuffixHack: true,
      merging: false
    },
    selectors: {
      ie7Hack: false,
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:root|:nth|:first\-of|:last|:only|:empty|:target|:checked|::selection|:enabled|:disabled|:not)/
    },
    units: {
      rem: false
    }
  },
  'ie7': {
    colors: {
      opacity: false
    },
    properties: {
      backgroundSizeMerging: false,
      iePrefixHack: true,
      ieSuffixHack: true,
      merging: false
    },
    selectors: {
      ie7Hack: true,
      special: /(\-moz\-|\-ms\-|\-o\-|\-webkit\-|:focus|:before|:after|:root|:nth|:first\-of|:last|:only|:empty|:target|:checked|::selection|:enabled|:disabled|:not)/
    },
    units: {
      rem: false
    }
  }
};

function Compatibility(source) {
  this.source = source || {};
}

function merge(source, target) {
  for (var key in source) {
    var value = source[key];

    if (typeof value === 'object' && !util.isRegExp(value))
      target[key] = merge(value, target[key] || {});
    else
      target[key] = key in target ? target[key] : value;
  }

  return target;
}

function calculateSource(source) {
  if (typeof source == 'object')
    return source;

  if (!/[,\+\-]/.test(source))
    return DEFAULTS[source] || DEFAULTS['*'];

  var parts = source.split(',');
  var template = parts[0] in DEFAULTS ?
    DEFAULTS[parts.shift()] :
    DEFAULTS['*'];

  source = {};

  parts.forEach(function (part) {
    var isAdd = part[0] == '+';
    var key = part.substring(1).split('.');
    var group = key[0];
    var option = key[1];

    source[group] = source[group] || {};
    source[group][option] = isAdd;
  });

  return merge(template, source);
}

Compatibility.prototype.toOptions = function () {
  return merge(DEFAULTS['*'], calculateSource(this.source));
};

module.exports = Compatibility;

},{"util":85}],35:[function(require,module,exports){
var Splitter = require('./splitter');
var SourceMaps = require('../utils/source-maps');

var Extractors = {
  properties: function (string, context) {
    var tokenized = [];
    var list = [];
    var buffer = [];
    var all = [];
    var property;
    var isPropertyEnd;
    var isWhitespace;
    var wasWhitespace;
    var isSpecial;
    var wasSpecial;
    var current;
    var secondToLast;
    var wasCloseParenthesis;
    var isEscape;
    var token;
    var addSourceMap = context.addSourceMap;

    for (var i = 0, l = string.length; i < l; i++) {
      current = string[i];
      isPropertyEnd = current === ';';

      isEscape = !isPropertyEnd && current == '_' && string.indexOf('__ESCAPED_COMMENT', i) === i;
      if (isEscape) {
        if (buffer.length > 0) {
          i--;
          isPropertyEnd = true;
        } else {
          var endOfEscape = string.indexOf('__', i + 1) + 2;
          var comment = string.substring(i, endOfEscape);
          i = endOfEscape - 1;

          if (comment.indexOf('__ESCAPED_COMMENT_SPECIAL') === -1) {
            if (addSourceMap)
              SourceMaps.track(comment, context, true);
            continue;
          }
          else {
            buffer = all = [comment];
          }
        }
      }

      if (isPropertyEnd || isEscape) {
        if (wasWhitespace && buffer[buffer.length - 1] === ' ')
          buffer.pop();
        if (buffer.length > 0) {
          property = buffer.join('');
          token = { value: property };
          tokenized.push(token);
          list.push(property);

          if (addSourceMap)
            token.metadata = SourceMaps.saveAndTrack(all.join(''), context, !isEscape);
        }
        buffer = [];
        all = [];
      } else {
        isWhitespace = current === ' ' || current === '\t' || current === '\n';
        isSpecial = current === ':' || current === '[' || current === ']' || current === ',' || current === '(' || current === ')';

        if (wasWhitespace && isSpecial) {
          secondToLast = buffer[buffer.length - 2];
          if (secondToLast != '+' && secondToLast != '-' && secondToLast != '/' && secondToLast != '*')
            buffer.pop();
          buffer.push(current);
        } else if (isWhitespace && wasSpecial && !wasCloseParenthesis) {
        } else if (isWhitespace && !wasWhitespace && buffer.length > 0) {
          buffer.push(' ');
        } else if (isWhitespace && buffer.length === 0) {
        } else if (isWhitespace && wasWhitespace) {
        } else {
          buffer.push(isWhitespace ? ' ' : current);
        }

        all.push(current);
      }

      wasSpecial = isSpecial;
      wasWhitespace = isWhitespace;
      wasCloseParenthesis = current === ')';
    }

    if (wasWhitespace && buffer[buffer.length - 1] === ' ')
      buffer.pop();
    if (buffer.length > 0) {
      property = buffer.join('');
      token = { value: property };
      tokenized.push(token);
      list.push(property);

      if (addSourceMap)
        token.metadata = SourceMaps.saveAndTrack(all.join(''), context, false);
    } else if (all.indexOf('\n') > -1) {
      SourceMaps.track(all.join(''), context);
    }

    return {
      list: list,
      tokenized: tokenized
    };
  },

  selectors: function (string, context) {
    var tokenized = [];
    var list = [];
    var selectors = new Splitter(',').split(string);
    var addSourceMap = context.addSourceMap;

    for (var i = 0, l = selectors.length; i < l; i++) {
      var selector = selectors[i];

      list.push(selector);

      var token = { value: selector };
      tokenized.push(token);

      if (addSourceMap)
        token.metadata = SourceMaps.saveAndTrack(selector, context, true);
    }

    return {
      list: list,
      tokenized: tokenized
    };
  }
};

module.exports = Extractors;

},{"../utils/source-maps":39,"./splitter":42}],36:[function(require,module,exports){
var SourceMapConsumer = require('source-map').SourceMapConsumer;

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var url = require('url');

var override = require('../utils/object.js').override;

var MAP_MARKER = /\/\*# sourceMappingURL=(\S+) \*\//;

function InputSourceMapStore(outerContext) {
  this.options = outerContext.options;
  this.errors = outerContext.errors;
  this.sourceTracker = outerContext.sourceTracker;
  this.timeout = this.options.inliner.timeout;
  this.requestOptions = this.options.inliner.request;

  this.maps = {};
}

function fromString(self, data, whenDone) {
  self.maps[undefined] = new SourceMapConsumer(self.options.sourceMap);
  return whenDone();
}

function fromSource(self, data, whenDone, context) {
  var nextAt = 0;

  function proceedToNext() {
    context.cursor += nextAt + 1;
    fromSource(self, data, whenDone, context);
  }

  while (context.cursor < data.length) {
    var fragment = data.substring(context.cursor);

    var markerStartMatch = self.sourceTracker.nextStart(fragment) || { index: -1 };
    var markerEndMatch = self.sourceTracker.nextEnd(fragment) || { index: -1 };
    var mapMatch = MAP_MARKER.exec(fragment) || { index: -1 };
    var sourceMapFile = mapMatch[1];

    nextAt = data.length;
    if (markerStartMatch.index > -1)
      nextAt = markerStartMatch.index;
    if (markerEndMatch.index > -1 && markerEndMatch.index < nextAt)
      nextAt = markerEndMatch.index;
    if (mapMatch.index > -1 && mapMatch.index < nextAt)
      nextAt = mapMatch.index;

    if (nextAt == data.length)
      break;

    if (nextAt == markerStartMatch.index) {
      context.files.push(markerStartMatch.filename);
    } else if (nextAt == markerEndMatch.index) {
      context.files.pop();
    } else if (nextAt == mapMatch.index) {
      var isRemote = /^https?:\/\//.test(sourceMapFile) || /^\/\//.test(sourceMapFile);
      if (isRemote) {
        return fetchMapFile(self, sourceMapFile, context, proceedToNext);
      } else {
        var sourceFile = context.files[context.files.length - 1];
        var sourceDir = sourceFile ? path.dirname(sourceFile) : self.options.relativeTo;

        var inputMapData = fs.readFileSync(path.join(sourceDir || '', sourceMapFile), 'utf-8');
        self.maps[sourceFile || undefined] = new SourceMapConsumer(inputMapData);
      }
    }

    context.cursor += nextAt + 1;
  }

  return whenDone();
}

function fetchMapFile(self, mapSource, context, done) {
  function handleError(status) {
    context.errors.push('Broken source map at "' + mapSource + '" - ' + status);
    return done();
  }

  var method = mapSource.indexOf('https') === 0 ? https : http;
  var requestOptions = override(url.parse(mapSource), self.requestOptions);

  method
    .get(requestOptions, function (res) {
      if (res.statusCode < 200 || res.statusCode > 299)
        return handleError(res.statusCode);

      var chunks = [];
      res.on('data', function (chunk) {
        chunks.push(chunk.toString());
      });
      res.on('end', function () {
        self.maps[context.files[context.files.length - 1] || undefined] = new SourceMapConsumer(chunks.join(''));
        done();
      });
    })
    .on('error', function(res) {
      handleError(res.message);
    })
    .on('timeout', function() {
      handleError('timeout');
    })
    .setTimeout(self.timeout);
}

function originalPositionIn(trackedSource, sourceInfo, token, allowNFallbacks) {
  // FIXME: we should rather track original positions in tokenizer
  // here it is a bit too late do do it reliably hance the hack
  var originalPosition;
  var maxRange = token.replace(/[>\+~]/g, ' $1 ').length;
  var position = {
    line: sourceInfo.line,
    column: sourceInfo.column + maxRange
  };

  while (maxRange-- > 0) {
    position.column--;
    originalPosition = trackedSource.originalPositionFor(position);

    if (originalPosition)
      break;
  }

  if (originalPosition.line === null && sourceInfo.line > 1 && allowNFallbacks > 0)
    return originalPositionIn(trackedSource, { line: sourceInfo.line - 1, column: sourceInfo.column }, token, allowNFallbacks - 1);

  return originalPosition;
}

InputSourceMapStore.prototype.track = function (data, whenDone) {
  return typeof this.options.sourceMap == 'string' ?
    fromString(this, data, whenDone) :
    fromSource(this, data, whenDone, { files: [], cursor: 0, errors: this.errors });
};

InputSourceMapStore.prototype.isTracking = function (sourceInfo) {
  return !!this.maps[sourceInfo.source];
};

InputSourceMapStore.prototype.originalPositionFor = function (sourceInfo, token, allowNFallbacks) {
  return originalPositionIn(this.maps[sourceInfo.source], sourceInfo, token, allowNFallbacks);
};

module.exports = InputSourceMapStore;

},{"../utils/object.js":37,"fs":5,"http":55,"https":58,"path":64,"source-map":43,"url":82}],37:[function(require,module,exports){
module.exports = {
  override: function (source1, source2) {
    var target = {};
    for (var key1 in source1)
      target[key1] = source1[key1];
    for (var key2 in source2)
      target[key2] = source2[key2];

    return target;
  }
};

},{}],38:[function(require,module,exports){
function QuoteScanner(data) {
  this.data = data;
}

var findQuoteEnd = function (data, matched, cursor, oldCursor) {
  var commentStartMark = '/*';
  var commentEndMark = '*/';
  var escapeMark = '\\';
  var blockEndMark = '}';
  var dataPrefix = data.substring(oldCursor, cursor);
  var commentEndedAt = dataPrefix.lastIndexOf(commentEndMark, cursor);
  var commentStartedAt = dataPrefix.lastIndexOf(commentStartMark, cursor);
  var commentStarted = false;

  if (commentEndedAt >= cursor && commentStartedAt > -1)
    commentStarted = true;
  if (commentStartedAt < cursor && commentStartedAt > commentEndedAt)
    commentStarted = true;

  if (commentStarted) {
    var commentEndsAt = data.indexOf(commentEndMark, cursor);
    if (commentEndsAt > -1)
      return commentEndsAt;

    commentEndsAt = data.indexOf(blockEndMark, cursor);
    return commentEndsAt > -1 ? commentEndsAt - 1 : data.length;
  }

  while (true) {
    if (data[cursor] === undefined)
      break;
    if (data[cursor] == matched && (data[cursor - 1] != escapeMark || data[cursor - 2] == escapeMark))
      break;

    cursor++;
  }

  return cursor;
};

QuoteScanner.prototype.each = function (callback) {
  var data = this.data;
  var tempData = [];
  var nextStart = 0;
  var nextEnd = 0;
  var cursor = 0;
  var matchedMark = null;
  var singleMark = '\'';
  var doubleMark = '"';
  var dataLength = data.length;

  for (; nextEnd < data.length;) {
    var nextStartSingle = data.indexOf(singleMark, nextEnd + 1);
    var nextStartDouble = data.indexOf(doubleMark, nextEnd + 1);

    if (nextStartSingle == -1)
      nextStartSingle = dataLength;
    if (nextStartDouble == -1)
      nextStartDouble = dataLength;

    if (nextStartSingle < nextStartDouble) {
      nextStart = nextStartSingle;
      matchedMark = singleMark;
    } else {
      nextStart = nextStartDouble;
      matchedMark = doubleMark;
    }

    if (nextStart == -1)
      break;

    nextEnd = findQuoteEnd(data, matchedMark, nextStart + 1, cursor);
    if (nextEnd == -1)
      break;

    var text = data.substring(nextStart, nextEnd + 1);
    tempData.push(data.substring(cursor, nextStart));
    if (text.length > 0)
      callback(text, tempData, nextStart);

    cursor = nextEnd + 1;
  }

  return tempData.length > 0 ?
    tempData.join('') + data.substring(cursor, data.length) :
    data;
};

module.exports = QuoteScanner;

},{}],39:[function(require,module,exports){
function trimLeft(value, context) {
  var withoutContent;
  var total;
  var split = value.split('\n');
  var shift = 0;
  for (withoutContent = 0, total = split.length; withoutContent < total; withoutContent++) {
    var part = split[withoutContent];
    if (/\S/.test(part))
      break;

    shift += part.length + 1;
  }

  context.line += withoutContent;
  context.column = withoutContent > 0 ? 0 : context.column;
  context.column += /^(\s)*/.exec(split[withoutContent])[0].length;

  return value.substring(shift).trimLeft();
}

var SourceMaps = {
  saveAndTrack: function (data, context, hasSuffix) {
    var trimmedValue = trimLeft(data, context);

    var metadata = {
      line: context.line,
      column: context.column,
      source: context.source
    };

    this.track(trimmedValue, context);

    if (hasSuffix)
      context.column++;

    return metadata;
  },

  suffix: function (context) {
    context.column++;
  },

  track: function (data, context) {
    var parts = data.split('\n');

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];
      var cursor = 0;

      if (i > 0) {
        context.line++;
        context.column = 0;
      }

      while (true) {
        var next = part.indexOf('__ESCAPED_', cursor);

        if (next == -1) {
          context.column += part.substring(cursor).length;
          break;
        }

        context.column += next - cursor;
        cursor += next - cursor;

        var escaped = part.substring(next, part.indexOf('__', next + 1) + 2);
        var encodedValues = escaped.substring(escaped.indexOf('(') + 1, escaped.indexOf(')')).split(',');
        context.line += ~~encodedValues[0];
        context.column = (~~encodedValues[0] === 0 ? context.column : 0) + ~~encodedValues[1];
        cursor += escaped.length;
      }
    }
  }
};

module.exports = SourceMaps;

},{}],40:[function(require,module,exports){
(function (Buffer){
var path = require('path');

function SourceReader(context, data) {
  this.outerContext = context;
  this.data = data;
}

SourceReader.prototype.toString = function () {
  if (typeof this.data == 'string')
    return this.data;
  if (Buffer.isBuffer(this.data))
    return this.data.toString();
  if (Array.isArray(this.data))
    return fromArray(this.outerContext, this.data);

  return this.data;
};

function fromArray(outerContext, sources) {
  return sources
    .map(function (source) {
      return outerContext.options.processImport === false ?
        source + '@shallow' :
        source;
    })
    .map(function (source) {
      return !outerContext.options.relativeTo || /^https?:\/\//.test(source) ?
        source :
        path.relative(outerContext.options.relativeTo, source);
    })
    .map(function (source) { return '@import url(' + source + ');'; })
    .join('');
}

module.exports = SourceReader;

}).call(this,{"isBuffer":require("../../../is-buffer/index.js")})
},{"../../../is-buffer/index.js":61,"path":64}],41:[function(require,module,exports){
function SourceTracker() {
  this.sources = [];
}

SourceTracker.prototype.store = function (filename, data) {
  this.sources.push(filename);

  return '__ESCAPED_SOURCE_CLEAN_CSS' + (this.sources.length - 1) + '__' +
    data +
    '__ESCAPED_SOURCE_END_CLEAN_CSS__';
};

SourceTracker.prototype.nextStart = function (data) {
  var next = /__ESCAPED_SOURCE_CLEAN_CSS(\d+)__/.exec(data);

  return next ?
    { index: next.index, filename: this.sources[~~next[1]] } :
    null;
};

SourceTracker.prototype.nextEnd = function (data) {
  return /__ESCAPED_SOURCE_END_CLEAN_CSS__/g.exec(data);
};

SourceTracker.prototype.removeAll = function (data) {
  return data
    .replace(/__ESCAPED_SOURCE_CLEAN_CSS\d+__/g, '')
    .replace(/__ESCAPED_SOURCE_END_CLEAN_CSS__/g, '');
};

module.exports = SourceTracker;

},{}],42:[function(require,module,exports){
function Splitter(separator) {
  this.separator = separator;
}

Splitter.prototype.split = function (value) {
  if (value.indexOf(this.separator) === -1)
    return [value];

  if (value.indexOf('(') === -1)
    return value.split(this.separator);

  var level = 0;
  var cursor = 0;
  var lastStart = 0;
  var len = value.length;
  var tokens = [];

  while (cursor++ < len) {
    if (value[cursor] == '(') {
      level++;
    } else if (value[cursor] == ')') {
      level--;
    } else if (value[cursor] == this.separator && level === 0) {
      tokens.push(value.substring(lastStart, cursor));
      lastStart = cursor + 1;
    }
  }

  if (lastStart < cursor + 1)
    tokens.push(value.substring(lastStart));

  return tokens;
};

module.exports = Splitter;

},{}],43:[function(require,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = require('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = require('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = require('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":49,"./source-map/source-map-generator":50,"./source-map/source-node":51}],44:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":52,"amdefine":2}],45:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string via the out parameter.
   */
  exports.decode = function base64VLQ_decode(aStr, aOutParam) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    aOutParam.value = fromVLQSigned(result);
    aOutParam.rest = aStr.slice(i);
  };

});

},{"./base64":46,"amdefine":2}],46:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

},{"amdefine":2}],47:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the index of
    //      the next closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return -1.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return mid;
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return mid;
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0 ? -1 : aLow;
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the index of next lowest value checked if there is no exact hit. This is
   * because mappings between original and generated line/col pairs are single
   * points, and there is an implicit region between each of them, so a miss
   * just means that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    if (aHaystack.length === 0) {
      return -1;
    }
    return recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
  };

});

},{"amdefine":2}],48:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2014 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * Determine whether mappingB is after mappingA with respect to generated
   * position.
   */
  function generatedPositionAfter(mappingA, mappingB) {
    // Optimized for most common case
    var lineA = mappingA.generatedLine;
    var lineB = mappingB.generatedLine;
    var columnA = mappingA.generatedColumn;
    var columnB = mappingB.generatedColumn;
    return lineB > lineA || lineB == lineA && columnB >= columnA ||
           util.compareByGeneratedPositions(mappingA, mappingB) <= 0;
  }

  /**
   * A data structure to provide a sorted view of accumulated mappings in a
   * performance conscious manner. It trades a neglibable overhead in general
   * case for a large speedup in case of mappings being added in order.
   */
  function MappingList() {
    this._array = [];
    this._sorted = true;
    // Serves as infimum
    this._last = {generatedLine: -1, generatedColumn: 0};
  }

  /**
   * Iterate through internal items. This method takes the same arguments that
   * `Array.prototype.forEach` takes.
   *
   * NOTE: The order of the mappings is NOT guaranteed.
   */
  MappingList.prototype.unsortedForEach =
    function MappingList_forEach(aCallback, aThisArg) {
      this._array.forEach(aCallback, aThisArg);
    };

  /**
   * Add the given source mapping.
   *
   * @param Object aMapping
   */
  MappingList.prototype.add = function MappingList_add(aMapping) {
    var mapping;
    if (generatedPositionAfter(this._last, aMapping)) {
      this._last = aMapping;
      this._array.push(aMapping);
    } else {
      this._sorted = false;
      this._array.push(aMapping);
    }
  };

  /**
   * Returns the flat, sorted array of mappings. The mappings are sorted by
   * generated position.
   *
   * WARNING: This method returns internal data without copying, for
   * performance. The return value must NOT be mutated, and should be treated as
   * an immutable borrow. If you want to take ownership, you must make your own
   * copy.
   */
  MappingList.prototype.toArray = function MappingList_toArray() {
    if (!this._sorted) {
      this._array.sort(util.compareByGeneratedPositions);
      this._sorted = true;
    }
    return this._array;
  };

  exports.MappingList = MappingList;

});

},{"./util":52,"amdefine":2}],49:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    sources = sources.map(util.normalize);

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  /**
   * Create a SourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns SourceMapConsumer
   */
  SourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(SourceMapConsumer.prototype);

      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      smc.__generatedMappings = aSourceMap._mappings.toArray().slice();
      smc.__originalMappings = aSourceMap._mappings.toArray().slice()
        .sort(util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  SourceMapConsumer.prototype._nextCharIsMappingSeparator =
    function SourceMapConsumer_nextCharIsMappingSeparator(aStr) {
      var c = aStr.charAt(0);
      return c === ";" || c === ",";
    };

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var str = aStr;
      var temp = {};
      var mapping;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          base64VLQ.decode(str, temp);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
            // Original source.
            base64VLQ.decode(str, temp);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            base64VLQ.decode(str, temp);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            base64VLQ.decode(str, temp);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
              // Original name.
              base64VLQ.decode(str, temp);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this.__generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            this.__originalMappings.push(mapping);
          }
        }
      }

      this.__generatedMappings.sort(util.compareByGeneratedPositions);
      this.__originalMappings.sort(util.compareByOriginalPositions);
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Compute the last column for each generated mapping. The last column is
   * inclusive.
   */
  SourceMapConsumer.prototype.computeColumnSpans =
    function SourceMapConsumer_computeColumnSpans() {
      for (var index = 0; index < this._generatedMappings.length; ++index) {
        var mapping = this._generatedMappings[index];

        // Mappings do not contain a field for the last generated columnt. We
        // can come up with an optimistic estimate, however, by assuming that
        // mappings are contiguous (i.e. given two consecutive mappings, the
        // first mapping ends where the second one starts).
        if (index + 1 < this._generatedMappings.length) {
          var nextMapping = this._generatedMappings[index + 1];

          if (mapping.generatedLine === nextMapping.generatedLine) {
            mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
            continue;
          }
        }

        // The last mapping for each line spans the entire line.
        mapping.lastGeneratedColumn = Infinity;
      }
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var index = this._findMapping(needle,
                                    this._generatedMappings,
                                    "generatedLine",
                                    "generatedColumn",
                                    util.compareByGeneratedPositions);

      if (index >= 0) {
        var mapping = this._generatedMappings[index];

        if (mapping.generatedLine === needle.generatedLine) {
          var source = util.getArg(mapping, 'source', null);
          if (source != null && this.sourceRoot != null) {
            source = util.join(this.sourceRoot, source);
          }
          return {
            source: source,
            line: util.getArg(mapping, 'originalLine', null),
            column: util.getArg(mapping, 'originalColumn', null),
            name: util.getArg(mapping, 'name', null)
          };
        }
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  SourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot != null) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot != null
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      throw new Error('"' + aSource + '" is not in the SourceMap.');
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);

      if (index >= 0) {
        var mapping = this._originalMappings[index];

        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }

      return {
        line: null,
        column: null,
        lastColumn: null
      };
    };

  /**
   * Returns all generated line and column information for the original source
   * and line provided. The only argument is an object with the following
   * properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *
   * and an array of objects is returned, each with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.allGeneratedPositionsFor =
    function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
      // When there is no exact match, SourceMapConsumer.prototype._findMapping
      // returns the index of the closest mapping less than the needle. By
      // setting needle.originalColumn to Infinity, we thus find the last
      // mapping for the given line, provided such a mapping exists.
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: Infinity
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mappings = [];

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);
      if (index >= 0) {
        var mapping = this._originalMappings[index];

        while (mapping && mapping.originalLine === needle.originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[--index];
        }
      }

      return mappings.reverse();
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source;
        if (source != null && sourceRoot != null) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name
        };
      }).forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

},{"./array-set":44,"./base64-vlq":45,"./binary-search":47,"./util":52,"amdefine":2}],50:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;
  var MappingList = require('./mapping-list').MappingList;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._skipValidation = util.getArg(aArgs, 'skipValidation', false);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = new MappingList();
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source != null) {
          newMapping.source = mapping.source;
          if (sourceRoot != null) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name != null) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      if (!this._skipValidation) {
        this._validateMapping(generated, original, source, name);
      }

      if (source != null && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name != null && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.add({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot != null) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent != null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else if (this._sourcesContents) {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      var sourceFile = aSourceFile;
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (aSourceFile == null) {
        if (aSourceMapConsumer.file == null) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        sourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "sourceFile" relative if an absolute Url is passed.
      if (sourceRoot != null) {
        sourceFile = util.relative(sourceRoot, sourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "sourceFile"
      this._mappings.unsortedForEach(function (mapping) {
        if (mapping.source === sourceFile && mapping.originalLine != null) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source != null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath != null) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot != null) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name != null) {
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source != null && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name != null && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aSourceMapPath != null) {
            sourceFile = util.join(aSourceMapPath, sourceFile);
          }
          if (sourceRoot != null) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      var mappings = this._mappings.toArray();

      for (var i = 0, len = mappings.length; i < len; i++) {
        mapping = mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositions(mapping, mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source != null) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name != null) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot != null) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._file != null) {
        map.file = this._file;
      }
      if (this._sourceRoot != null) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":44,"./base64-vlq":45,"./mapping-list":48,"./util":52,"amdefine":2}],51:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;
  var util = require('./util');

  // Matches a Windows-style `\r\n` newline or a `\n` newline used by all other
  // operating systems these days (capturing the result).
  var REGEX_NEWLINE = /(\r?\n)/;

  // Newline character code for charCodeAt() comparisons
  var NEWLINE_CODE = 10;

  // Private symbol for identifying `SourceNode`s when multiple versions of
  // the source-map library are loaded. This MUST NOT CHANGE across
  // versions!
  var isSourceNode = "$$$isSourceNode$$$";

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   * @param aName The original identifier.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
    this.children = [];
    this.sourceContents = {};
    this.line = aLine == null ? null : aLine;
    this.column = aColumn == null ? null : aColumn;
    this.source = aSource == null ? null : aSource;
    this.name = aName == null ? null : aName;
    this[isSourceNode] = true;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Creates a SourceNode from generated code and a SourceMapConsumer.
   *
   * @param aGeneratedCode The generated code
   * @param aSourceMapConsumer The SourceMap for the generated code
   * @param aRelativePath Optional. The path that relative sources in the
   *        SourceMapConsumer should be relative to.
   */
  SourceNode.fromStringWithSourceMap =
    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
      // The SourceNode we want to fill with the generated code
      // and the SourceMap
      var node = new SourceNode();

      // All even indices of this array are one line of the generated code,
      // while all odd indices are the newlines between two adjacent lines
      // (since `REGEX_NEWLINE` captures its match).
      // Processed fragments are removed from this array, by calling `shiftNextLine`.
      var remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
      var shiftNextLine = function() {
        var lineContents = remainingLines.shift();
        // The last line of a file might not have a newline.
        var newLine = remainingLines.shift() || "";
        return lineContents + newLine;
      };

      // We need to remember the position of "remainingLines"
      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

      // The generate SourceNodes we need a code range.
      // To extract it current and last mapping is used.
      // Here we store the last mapping.
      var lastMapping = null;

      aSourceMapConsumer.eachMapping(function (mapping) {
        if (lastMapping !== null) {
          // We add the code from "lastMapping" to "mapping":
          // First check if there is a new line in between.
          if (lastGeneratedLine < mapping.generatedLine) {
            var code = "";
            // Associate first line with "lastMapping"
            addMappingWithCode(lastMapping, shiftNextLine());
            lastGeneratedLine++;
            lastGeneratedColumn = 0;
            // The remaining code is added without mapping
          } else {
            // There is no new line in between.
            // Associate the code between "lastGeneratedColumn" and
            // "mapping.generatedColumn" with "lastMapping"
            var nextLine = remainingLines[0];
            var code = nextLine.substr(0, mapping.generatedColumn -
                                          lastGeneratedColumn);
            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                                lastGeneratedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
            addMappingWithCode(lastMapping, code);
            // No more remaining code, continue
            lastMapping = mapping;
            return;
          }
        }
        // We add the generated code until the first mapping
        // to the SourceNode without any mapping.
        // Each line is added as separate string.
        while (lastGeneratedLine < mapping.generatedLine) {
          node.add(shiftNextLine());
          lastGeneratedLine++;
        }
        if (lastGeneratedColumn < mapping.generatedColumn) {
          var nextLine = remainingLines[0];
          node.add(nextLine.substr(0, mapping.generatedColumn));
          remainingLines[0] = nextLine.substr(mapping.generatedColumn);
          lastGeneratedColumn = mapping.generatedColumn;
        }
        lastMapping = mapping;
      }, this);
      // We have processed all mappings.
      if (remainingLines.length > 0) {
        if (lastMapping) {
          // Associate the remaining code in the current line with "lastMapping"
          addMappingWithCode(lastMapping, shiftNextLine());
        }
        // and add the remaining lines without any mapping
        node.add(remainingLines.join(""));
      }

      // Copy sourcesContent into SourceNode
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aRelativePath != null) {
            sourceFile = util.join(aRelativePath, sourceFile);
          }
          node.setSourceContent(sourceFile, content);
        }
      });

      return node;

      function addMappingWithCode(mapping, code) {
        if (mapping === null || mapping.source === undefined) {
          node.add(code);
        } else {
          var source = aRelativePath
            ? util.join(aRelativePath, mapping.source)
            : mapping.source;
          node.add(new SourceNode(mapping.originalLine,
                                  mapping.originalColumn,
                                  source,
                                  code,
                                  mapping.name));
        }
      }
    };

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk[isSourceNode] || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk[isSourceNode] || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    var chunk;
    for (var i = 0, len = this.children.length; i < len; i++) {
      chunk = this.children[i];
      if (chunk[isSourceNode]) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source,
                       line: this.line,
                       column: this.column,
                       name: this.name });
        }
      }
    }
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length;
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild[isSourceNode]) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Set the source content for a source file. This will be added to the SourceMapGenerator
   * in the sourcesContent field.
   *
   * @param aSourceFile The filename of the source file
   * @param aSourceContent The content of the source file
   */
  SourceNode.prototype.setSourceContent =
    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
    };

  /**
   * Walk over the tree of SourceNodes. The walking function is called for each
   * source file content and is passed the filename and source content.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walkSourceContents =
    function SourceNode_walkSourceContents(aFn) {
      for (var i = 0, len = this.children.length; i < len; i++) {
        if (this.children[i][isSourceNode]) {
          this.children[i].walkSourceContents(aFn);
        }
      }

      var sources = Object.keys(this.sourceContents);
      for (var i = 0, len = sources.length; i < len; i++) {
        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
      }
    };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    var sourceMappingActive = false;
    var lastOriginalSource = null;
    var lastOriginalLine = null;
    var lastOriginalColumn = null;
    var lastOriginalName = null;
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source !== null
          && original.line !== null
          && original.column !== null) {
        if(lastOriginalSource !== original.source
           || lastOriginalLine !== original.line
           || lastOriginalColumn !== original.column
           || lastOriginalName !== original.name) {
          map.addMapping({
            source: original.source,
            original: {
              line: original.line,
              column: original.column
            },
            generated: {
              line: generated.line,
              column: generated.column
            },
            name: original.name
          });
        }
        lastOriginalSource = original.source;
        lastOriginalLine = original.line;
        lastOriginalColumn = original.column;
        lastOriginalName = original.name;
        sourceMappingActive = true;
      } else if (sourceMappingActive) {
        map.addMapping({
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
        lastOriginalSource = null;
        sourceMappingActive = false;
      }
      for (var idx = 0, length = chunk.length; idx < length; idx++) {
        if (chunk.charCodeAt(idx) === NEWLINE_CODE) {
          generated.line++;
          generated.column = 0;
          // Mappings end at eol
          if (idx + 1 === length) {
            lastOriginalSource = null;
            sourceMappingActive = false;
          } else if (sourceMappingActive) {
            map.addMapping({
              source: original.source,
              original: {
                line: original.line,
                column: original.column
              },
              generated: {
                line: generated.line,
                column: generated.column
              },
              name: original.name
            });
          }
        } else {
          generated.column++;
        }
      }
    });
    this.walkSourceContents(function (sourceFile, sourceContent) {
      map.setSourceContent(sourceFile, sourceContent);
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

},{"./source-map-generator":50,"./util":52,"amdefine":2}],52:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }
    if (aPath === "") {
      aPath = ".";
    }
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Make a path relative to a URL or another path.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be made relative to aRoot.
   */
  function relative(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }

    aRoot = aRoot.replace(/\/$/, '');

    // XXX: It is possible to remove this block, and the tests still pass!
    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  function strcmp(aStr1, aStr2) {
    var s1 = aStr1 || "";
    var s2 = aStr2 || "";
    return (s1 > s2) - (s1 < s2);
  }

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp;

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp || onlyCompareOriginal) {
      return cmp;
    }

    cmp = strcmp(mappingA.name, mappingB.name);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    return mappingA.generatedColumn - mappingB.generatedColumn;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings where the generated positions are
   * compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
    var cmp;

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp || onlyCompareGenerated) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositions = compareByGeneratedPositions;

});

},{"amdefine":2}],53:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":61}],54:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],55:[function(require,module,exports){
var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');
var url = require('url')

http.request = function (params, cb) {
    if (typeof params === 'string') {
        params = url.parse(params)
    }
    if (!params) params = {};
    if (!params.host && !params.port) {
        params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
        params.host = params.hostname;
    }

    if (!params.protocol) {
        if (params.scheme) {
            params.protocol = params.scheme + ':';
        } else {
            params.protocol = window.location.protocol;
        }
    }

    if (!params.host) {
        params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
        if (!params.port) {
            params.port = params.host.split(':')[1];
        }
        params.host = params.host.split(':')[0];
    }
    if (!params.port) params.port = params.protocol == 'https:' ? 443 : 80;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

http.STATUS_CODES = {
    100 : 'Continue',
    101 : 'Switching Protocols',
    102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
    200 : 'OK',
    201 : 'Created',
    202 : 'Accepted',
    203 : 'Non-Authoritative Information',
    204 : 'No Content',
    205 : 'Reset Content',
    206 : 'Partial Content',
    207 : 'Multi-Status',               // RFC 4918
    300 : 'Multiple Choices',
    301 : 'Moved Permanently',
    302 : 'Moved Temporarily',
    303 : 'See Other',
    304 : 'Not Modified',
    305 : 'Use Proxy',
    307 : 'Temporary Redirect',
    400 : 'Bad Request',
    401 : 'Unauthorized',
    402 : 'Payment Required',
    403 : 'Forbidden',
    404 : 'Not Found',
    405 : 'Method Not Allowed',
    406 : 'Not Acceptable',
    407 : 'Proxy Authentication Required',
    408 : 'Request Time-out',
    409 : 'Conflict',
    410 : 'Gone',
    411 : 'Length Required',
    412 : 'Precondition Failed',
    413 : 'Request Entity Too Large',
    414 : 'Request-URI Too Large',
    415 : 'Unsupported Media Type',
    416 : 'Requested Range Not Satisfiable',
    417 : 'Expectation Failed',
    418 : 'I\'m a teapot',              // RFC 2324
    422 : 'Unprocessable Entity',       // RFC 4918
    423 : 'Locked',                     // RFC 4918
    424 : 'Failed Dependency',          // RFC 4918
    425 : 'Unordered Collection',       // RFC 4918
    426 : 'Upgrade Required',           // RFC 2817
    428 : 'Precondition Required',      // RFC 6585
    429 : 'Too Many Requests',          // RFC 6585
    431 : 'Request Header Fields Too Large',// RFC 6585
    500 : 'Internal Server Error',
    501 : 'Not Implemented',
    502 : 'Bad Gateway',
    503 : 'Service Unavailable',
    504 : 'Gateway Time-out',
    505 : 'HTTP Version Not Supported',
    506 : 'Variant Also Negotiates',    // RFC 2295
    507 : 'Insufficient Storage',       // RFC 4918
    509 : 'Bandwidth Limit Exceeded',
    510 : 'Not Extended',               // RFC 2774
    511 : 'Network Authentication Required' // RFC 6585
};
},{"./lib/request":56,"events":54,"url":82}],56:[function(require,module,exports){
var Stream = require('stream');
var Response = require('./response');
var Base64 = require('Base64');
var inherits = require('inherits');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = [];
    
    self.uri = (params.protocol || 'http:') + '//'
        + params.host
        + (params.port ? ':' + params.port : '')
        + (params.path || '/')
    ;
    
    if (typeof params.withCredentials === 'undefined') {
        params.withCredentials = true;
    }

    try { xhr.withCredentials = params.withCredentials }
    catch (e) {}
    
    if (params.responseType) try { xhr.responseType = params.responseType }
    catch (e) {}
    
    xhr.open(
        params.method || 'GET',
        self.uri,
        true
    );

    xhr.onerror = function(event) {
        self.emit('error', new Error('Network error'));
    };

    self._headers = {};
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) continue;
            var value = params.headers[key];
            self.setHeader(key, value);
        }
    }
    
    if (params.auth) {
        //basic auth
        this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
    }

    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });

    res.on('error', function (err) {
        self.emit('error', err);
    });
    
    xhr.onreadystatechange = function () {
        // Fix for IE9 bug
        // SCRIPT575: Could not complete the operation due to error c00c023f
        // It happens when a request is aborted, calling the success callback anyway with readyState === 4
        if (xhr.__aborted) return;
        res.handle(xhr);
    };
};

inherits(Request, Stream);

Request.prototype.setHeader = function (key, value) {
    this._headers[key.toLowerCase()] = value
};

Request.prototype.getHeader = function (key) {
    return this._headers[key.toLowerCase()]
};

Request.prototype.removeHeader = function (key) {
    delete this._headers[key.toLowerCase()]
};

Request.prototype.write = function (s) {
    this.body.push(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.__aborted = true;
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.push(s);

    var keys = objectKeys(this._headers);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = this._headers[key];
        if (isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                this.xhr.setRequestHeader(key, value[j]);
            }
        }
        else this.xhr.setRequestHeader(key, value)
    }

    if (this.body.length === 0) {
        this.xhr.send('');
    }
    else if (typeof this.body[0] === 'string') {
        this.xhr.send(this.body.join(''));
    }
    else if (isArray(this.body[0])) {
        var body = [];
        for (var i = 0; i < this.body.length; i++) {
            body.push.apply(body, this.body[i]);
        }
        this.xhr.send(body);
    }
    else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
        var len = 0;
        for (var i = 0; i < this.body.length; i++) {
            len += this.body[i].length;
        }
        var body = new(this.body[0].constructor)(len);
        var k = 0;
        
        for (var i = 0; i < this.body.length; i++) {
            var b = this.body[i];
            for (var j = 0; j < b.length; j++) {
                body[k++] = b[j];
            }
        }
        this.xhr.send(body);
    }
    else if (isXHR2Compatible(this.body[0])) {
        this.xhr.send(this.body[0]);
    }
    else {
        var body = '';
        for (var i = 0; i < this.body.length; i++) {
            body += this.body[i].toString();
        }
        this.xhr.send(body);
    }
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

var isXHR2Compatible = function (obj) {
    if (typeof Blob !== 'undefined' && obj instanceof Blob) return true;
    if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) return true;
    if (typeof FormData !== 'undefined' && obj instanceof FormData) return true;
};

},{"./response":57,"Base64":1,"inherits":60,"stream":80}],57:[function(require,module,exports){
var Stream = require('stream');
var util = require('util');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

util.inherits(Response, Stream);

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob || xhr.response;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

},{"stream":80,"util":85}],58:[function(require,module,exports){
var http = require('http');

var https = module.exports;

for (var key in http) {
    if (http.hasOwnProperty(key)) https[key] = http[key];
};

https.request = function (params, cb) {
    if (!params) params = {};
    params.scheme = 'https';
    params.protocol = 'https:';
    return http.request.call(this, params, cb);
}

},{"http":55}],59:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],60:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],61:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],62:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],63:[function(require,module,exports){
exports.endianness = function () { return 'LE' };

exports.hostname = function () {
    if (typeof location !== 'undefined') {
        return location.hostname
    }
    else return '';
};

exports.loadavg = function () { return [] };

exports.uptime = function () { return 0 };

exports.freemem = function () {
    return Number.MAX_VALUE;
};

exports.totalmem = function () {
    return Number.MAX_VALUE;
};

exports.cpus = function () { return [] };

exports.type = function () { return 'Browser' };

exports.release = function () {
    if (typeof navigator !== 'undefined') {
        return navigator.appVersion;
    }
    return '';
};

exports.networkInterfaces
= exports.getNetworkInterfaces
= function () { return {} };

exports.arch = function () { return 'javascript' };

exports.platform = function () { return 'browser' };

exports.tmpdir = exports.tmpDir = function () {
    return '/tmp';
};

exports.EOL = '\n';

},{}],64:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":65}],65:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],66:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],67:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],68:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],69:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":67,"./encode":68}],70:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":71}],71:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require('_process'))
},{"./_stream_readable":73,"./_stream_writable":75,"_process":65,"core-util-is":53,"inherits":60}],72:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":74,"core-util-is":53,"inherits":60}],73:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;


/*<replacement>*/
var debug = require('util');
if (debug && debug.debuglog) {
  debug = debug.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/


util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.readableObjectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  var Duplex = require('./_stream_duplex');

  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (util.isString(chunk) && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (util.isNullOrUndefined(chunk)) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      if (!addToFront)
        state.reading = false;

      // if we want the data now, just emit it.
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit('data', chunk);
        stream.read(0);
      } else {
        // update the buffer info.
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront)
          state.buffer.unshift(chunk);
        else
          state.buffer.push(chunk);

        if (state.needReadable)
          emitReadable(stream);
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || util.isNull(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (!util.isNumber(n) || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (util.isNull(ret)) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0)
    endReadable(this);

  if (!util.isNull(ret))
    this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync)
      process.nextTick(function() {
        emitReadable_(stream);
      });
    else
      emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain &&
        (!dest._writableState || dest._writableState.needDrain))
      ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      debug('false write response, pause',
            src._readableState.awaitDrain);
      src._readableState.awaitDrain++;
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain)
      state.awaitDrain--;
    if (state.awaitDrain === 0 && EE.listenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        var self = this;
        process.nextTick(function() {
          debug('readable nexttick read 0');
          self.read(0);
        });
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    if (!state.reading) {
      debug('resume read 0');
      this.read(0);
    }
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(function() {
      resume_(stream, state);
    });
  }
}

function resume_(stream, state) {
  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

Readable.prototype.pause = function() {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    debug('wrapped data');
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (util.isFunction(stream[i]) && util.isUndefined(this[i])) {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'))
},{"./_stream_duplex":71,"_process":65,"buffer":6,"core-util-is":53,"events":54,"inherits":60,"isarray":62,"stream":80,"string_decoder/":81,"util":4}],74:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (!util.isNullOrUndefined(data))
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('prefinish', function() {
    if (util.isFunction(this._flush))
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (!util.isNull(ts.writechunk) && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":71,"core-util-is":53,"inherits":60}],75:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.writableObjectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (util.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (!util.isFunction(cb))
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function() {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function() {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing &&
        !state.corked &&
        !state.finished &&
        !state.bufferProcessing &&
        state.buffer.length)
      clearBuffer(this, state);
  }
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      util.isString(chunk)) {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (util.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing || state.corked)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, false, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev)
    stream._writev(chunk, state.onwrite);
  else
    stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      state.pendingcb--;
      cb(er);
    });
  else {
    state.pendingcb--;
    cb(er);
  }

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished &&
        !state.corked &&
        !state.bufferProcessing &&
        state.buffer.length) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  if (stream._writev && state.buffer.length > 1) {
    // Fast case, write everything using _writev()
    var cbs = [];
    for (var c = 0; c < state.buffer.length; c++)
      cbs.push(state.buffer[c].callback);

    // count the one we are adding, as well.
    // TODO(isaacs) clean this up
    state.pendingcb++;
    doWrite(stream, state, true, state.length, state.buffer, '', function(err) {
      for (var i = 0; i < cbs.length; i++) {
        state.pendingcb--;
        cbs[i](err);
      }
    });

    // Clear buffer
    state.buffer = [];
  } else {
    // Slow case, write chunks one-by-one
    for (var c = 0; c < state.buffer.length; c++) {
      var entry = state.buffer[c];
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);

      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        c++;
        break;
      }
    }

    if (c < state.buffer.length)
      state.buffer = state.buffer.slice(c);
    else
      state.buffer.length = 0;
  }

  state.bufferProcessing = false;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));

};

Writable.prototype._writev = null;

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (util.isFunction(chunk)) {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (!util.isNullOrUndefined(chunk))
    this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else
      prefinish(stream, state);
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require('_process'))
},{"./_stream_duplex":71,"_process":65,"buffer":6,"core-util-is":53,"inherits":60,"stream":80}],76:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":72}],77:[function(require,module,exports){
(function (process){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = require('stream');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');
if (!process.browser && process.env.READABLE_STREAM === 'disable') {
  module.exports = require('stream');
}

}).call(this,require('_process'))
},{"./lib/_stream_duplex.js":71,"./lib/_stream_passthrough.js":72,"./lib/_stream_readable.js":73,"./lib/_stream_transform.js":74,"./lib/_stream_writable.js":75,"_process":65,"stream":80}],78:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":74}],79:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":75}],80:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":54,"inherits":60,"readable-stream/duplex.js":70,"readable-stream/passthrough.js":76,"readable-stream/readable.js":77,"readable-stream/transform.js":78,"readable-stream/writable.js":79}],81:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":6}],82:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":66,"querystring":69}],83:[function(require,module,exports){
arguments[4][60][0].apply(exports,arguments)
},{"dup":60}],84:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],85:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":84,"_process":65,"inherits":83}],"clean-css":[function(require,module,exports){
module.exports = require('./lib/clean');

},{"./lib/clean":8}]},{},[]);
