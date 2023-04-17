//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

/**
 * @param {string} data
 * @param {number} typeNumber 1 to 40
 * @param {'L' | 'M' | 'Q' | 'H'} errorCorrectionLevel
 */
var qrcode = function (data, typeNumber = -1, errorCorrectionLevel = 'M') {
	const PAD0 = 0xec;
	const PAD1 = 0x11;

	var _typeNumber = typeNumber;
	var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];

	/** @type {(boolean | null)[][]} */
	var _modules = [];

	/** @type {number[] | null} */
	var _dataCache = null;

	var _data = new Qr8BitByte(data);

	if (_typeNumber < 1) {
		var typeNumber = 1;

		for (; typeNumber < 40; typeNumber++) {
			var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
			var buffer = new QrBitBuffer();

			buffer.put(4, 4);
			buffer.put(_data.getLength(), QRUtil.getLengthInBits(4, typeNumber));
			_data.write(buffer);

			var totalDataCount = 0;
			for (var i = 0; i < rsBlocks.length; i++) {
				totalDataCount += rsBlocks[i].dataCount;
			}

			if (buffer.getLengthInBits() <= totalDataCount * 8) {
				break;
			}
		}

		_typeNumber = typeNumber;
	}

	const _moduleCount = _typeNumber * 4 + 17;

	/**
	 * @param {boolean} test
	 * @param {number} maskPattern
	 */
	var makeImpl = function (test, maskPattern) {
		_modules = new Array(_moduleCount);
		for (var row = 0; row < _moduleCount; row += 1) {
			_modules[row] = new Array(_moduleCount);
			for (var col = 0; col < _moduleCount; col += 1) {
				_modules[row][col] = null;
			}
		}

		setupPositionProbePattern(0, 0);
		setupPositionProbePattern(_moduleCount - 7, 0);
		setupPositionProbePattern(0, _moduleCount - 7);
		setupPositionAdjustPattern();
		setupTimingPattern();
		setupTypeInfo(test, maskPattern);

		if (_typeNumber >= 7) {
			setupTypeNumber(test);
		}

		if (_dataCache == null) {
			_dataCache = createData(_typeNumber, _errorCorrectionLevel, _data);
		}

		mapData(_dataCache, maskPattern);
	};

	makeImpl(false, getBestMaskPattern());

	/**
	 *
	 * @param {number} row
	 * @param {number} col
	 */
	function setupPositionProbePattern(row, col) {
		for (var r = -1; r <= 7; r += 1) {
			if (row + r <= -1 || _moduleCount <= row + r) continue;

			for (var c = -1; c <= 7; c += 1) {
				if (col + c <= -1 || _moduleCount <= col + c) continue;

				if (
					(0 <= r && r <= 6 && (c == 0 || c == 6)) ||
					(0 <= c && c <= 6 && (r == 0 || r == 6)) ||
					(2 <= r && r <= 4 && 2 <= c && c <= 4)
				) {
					_modules[row + r][col + c] = true;
				} else {
					_modules[row + r][col + c] = false;
				}
			}
		}
	}

	function getBestMaskPattern() {
		var minLostPoint = 0;
		var pattern = 0;

		for (var i = 0; i < 8; i += 1) {
			makeImpl(true, i);

			var lostPoint = getLostPoint();

			if (i == 0 || minLostPoint > lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}

		return pattern;
	}

	function setupTimingPattern() {
		for (var r = 8; r < _moduleCount - 8; r += 1) {
			if (_modules[r][6] != null) {
				continue;
			}
			_modules[r][6] = r % 2 == 0;
		}

		for (var c = 8; c < _moduleCount - 8; c += 1) {
			if (_modules[6][c] != null) {
				continue;
			}
			_modules[6][c] = c % 2 == 0;
		}
	}

	function setupPositionAdjustPattern() {
		var pos = QRUtil.getPatternPosition(_typeNumber);

		for (var i = 0; i < pos.length; i += 1) {
			for (var j = 0; j < pos.length; j += 1) {
				var row = pos[i];
				var col = pos[j];

				if (_modules[row][col] != null) {
					continue;
				}

				for (var r = -2; r <= 2; r += 1) {
					for (var c = -2; c <= 2; c += 1) {
						if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
							_modules[row + r][col + c] = true;
						} else {
							_modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	}

	/**
	 * @param {boolean} test
	 */
	var setupTypeNumber = function (test) {
		var bits = QRUtil.getBCHTypeNumber(_typeNumber);

		for (var i = 0; i < 18; i += 1) {
			var mod = !test && ((bits >> i) & 1) == 1;
			_modules[Math.floor(i / 3)][(i % 3) + _moduleCount - 8 - 3] = mod;
		}

		for (var i = 0; i < 18; i += 1) {
			var mod = !test && ((bits >> i) & 1) == 1;
			_modules[(i % 3) + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
		}
	};

	/**
	 * @param {boolean} test
	 * @param {number} maskPattern
	 */
	function setupTypeInfo(test, maskPattern) {
		var data = (_errorCorrectionLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);

		// vertical
		for (var i = 0; i < 15; i += 1) {
			var mod = !test && ((bits >> i) & 1) == 1;

			if (i < 6) {
				_modules[i][8] = mod;
			} else if (i < 8) {
				_modules[i + 1][8] = mod;
			} else {
				_modules[_moduleCount - 15 + i][8] = mod;
			}
		}

		// horizontal
		for (var i = 0; i < 15; i += 1) {
			var mod = !test && ((bits >> i) & 1) == 1;

			if (i < 8) {
				_modules[8][_moduleCount - i - 1] = mod;
			} else if (i < 9) {
				_modules[8][15 - i - 1 + 1] = mod;
			} else {
				_modules[8][15 - i - 1] = mod;
			}
		}

		// fixed module
		_modules[_moduleCount - 8][8] = !test;
	}

	/**
	 * @param {number[]} data
	 * @param {number} maskPattern
	 */
	function mapData(data, maskPattern) {
		var inc = -1;
		var row = _moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		var maskFunc = QRUtil.getMaskFunction(maskPattern);

		for (var col = _moduleCount - 1; col > 0; col -= 2) {
			if (col == 6) col -= 1;

			while (true) {
				for (var c = 0; c < 2; c += 1) {
					if (_modules[row][col - c] == null) {
						var dark = false;

						if (byteIndex < data.length) {
							dark = ((data[byteIndex] >>> bitIndex) & 1) == 1;
						}

						var mask = maskFunc(row, col - c);

						if (mask) {
							dark = !dark;
						}

						_modules[row][col - c] = dark;
						bitIndex -= 1;

						if (bitIndex == -1) {
							byteIndex += 1;
							bitIndex = 7;
						}
					}
				}

				row += inc;

				if (row < 0 || _moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
	}

	/**
	 * @param {QrBitBuffer} buffer
	 * @param {Array<{ dataCount: number, totalCount: number }>} rsBlocks
	 */
	function createBytes(buffer, rsBlocks) {
		var offset = 0;

		var maxDcCount = 0;
		var maxEcCount = 0;

		/** @type {number[][]} */
		var dcdata = new Array(rsBlocks.length);

		/** @type {number[][]} */
		var ecdata = new Array(rsBlocks.length);

		for (var r = 0; r < rsBlocks.length; r += 1) {
			var dcCount = rsBlocks[r].dataCount;
			var ecCount = rsBlocks[r].totalCount - dcCount;

			maxDcCount = Math.max(maxDcCount, dcCount);
			maxEcCount = Math.max(maxEcCount, ecCount);

			dcdata[r] = new Array(dcCount);

			for (var i = 0; i < dcdata[r].length; i += 1) {
				dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
			}
			offset += dcCount;

			var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
			var rawPoly = new QrPolynomial(dcdata[r], rsPoly.getLength() - 1);

			var modPoly = rawPoly.mod(rsPoly);
			ecdata[r] = new Array(rsPoly.getLength() - 1);
			for (var i = 0; i < ecdata[r].length; i += 1) {
				var modIndex = i + modPoly.getLength() - ecdata[r].length;
				ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
			}
		}

		var totalCodeCount = 0;
		for (var i = 0; i < rsBlocks.length; i += 1) {
			totalCodeCount += rsBlocks[i].totalCount;
		}

		/** @type {number[]} */
		var data = new Array(totalCodeCount);
		var index = 0;

		for (var i = 0; i < maxDcCount; i += 1) {
			for (var r = 0; r < rsBlocks.length; r += 1) {
				if (i < dcdata[r].length) {
					data[index] = dcdata[r][i];
					index += 1;
				}
			}
		}

		for (var i = 0; i < maxEcCount; i += 1) {
			for (var r = 0; r < rsBlocks.length; r += 1) {
				if (i < ecdata[r].length) {
					data[index] = ecdata[r][i];
					index += 1;
				}
			}
		}

		return data;
	}

	/**
	 * @param {number} typeNumber
	 * @param {number} errorCorrectionLevel
	 * @param {Qr8BitByte} data
	 */
	function createData(typeNumber, errorCorrectionLevel, data) {
		var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

		var buffer = new QrBitBuffer();

		buffer.put(4, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(4, typeNumber));
		data.write(buffer);

		// calc num max data.
		var totalDataCount = 0;
		for (var i = 0; i < rsBlocks.length; i += 1) {
			totalDataCount += rsBlocks[i].dataCount;
		}

		if (buffer.getLengthInBits() > totalDataCount * 8) {
			throw (
				'code length overflow. (' +
				buffer.getLengthInBits() +
				'>' +
				totalDataCount * 8 +
				')'
			);
		}

		// end code
		if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
			buffer.put(0, 4);
		}

		// padding
		while (buffer.getLengthInBits() % 8 != 0) {
			buffer.putBit(false);
		}

		// padding
		while (true) {
			if (buffer.getLengthInBits() >= totalDataCount * 8) {
				break;
			}
			buffer.put(PAD0, 8);

			if (buffer.getLengthInBits() >= totalDataCount * 8) {
				break;
			}
			buffer.put(PAD1, 8);
		}

		return createBytes(buffer, rsBlocks);
	}

	function getLostPoint() {
		var moduleCount = getModuleCount();

		var lostPoint = 0;

		// LEVEL1

		for (var row = 0; row < moduleCount; row += 1) {
			for (var col = 0; col < moduleCount; col += 1) {
				var sameCount = 0;
				var dark = isDark(row, col);

				for (var r = -1; r <= 1; r += 1) {
					if (row + r < 0 || moduleCount <= row + r) {
						continue;
					}

					for (var c = -1; c <= 1; c += 1) {
						if (col + c < 0 || moduleCount <= col + c) {
							continue;
						}

						if (r == 0 && c == 0) {
							continue;
						}

						if (dark == isDark(row + r, col + c)) {
							sameCount += 1;
						}
					}
				}

				if (sameCount > 5) {
					lostPoint += 3 + sameCount - 5;
				}
			}
		}

		// LEVEL2

		for (var row = 0; row < moduleCount - 1; row += 1) {
			for (var col = 0; col < moduleCount - 1; col += 1) {
				var count = 0;
				if (isDark(row, col)) count += 1;
				if (isDark(row + 1, col)) count += 1;
				if (isDark(row, col + 1)) count += 1;
				if (isDark(row + 1, col + 1)) count += 1;
				if (count == 0 || count == 4) {
					lostPoint += 3;
				}
			}
		}

		// LEVEL3

		for (var row = 0; row < moduleCount; row += 1) {
			for (var col = 0; col < moduleCount - 6; col += 1) {
				if (
					isDark(row, col) &&
					!isDark(row, col + 1) &&
					isDark(row, col + 2) &&
					isDark(row, col + 3) &&
					isDark(row, col + 4) &&
					!isDark(row, col + 5) &&
					isDark(row, col + 6)
				) {
					lostPoint += 40;
				}
			}
		}

		for (var col = 0; col < moduleCount; col += 1) {
			for (var row = 0; row < moduleCount - 6; row += 1) {
				if (
					isDark(row, col) &&
					!isDark(row + 1, col) &&
					isDark(row + 2, col) &&
					isDark(row + 3, col) &&
					isDark(row + 4, col) &&
					!isDark(row + 5, col) &&
					isDark(row + 6, col)
				) {
					lostPoint += 40;
				}
			}
		}

		// LEVEL4

		var darkCount = 0;

		for (var col = 0; col < moduleCount; col += 1) {
			for (var row = 0; row < moduleCount; row += 1) {
				if (isDark(row, col)) {
					darkCount += 1;
				}
			}
		}

		var ratio =
			Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
		lostPoint += ratio * 10;

		return lostPoint;
	}

	/**
	 * @param {number} row
	 * @param {number} col
	 */
	function isDark(row, col) {
		if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
			throw row + ',' + col;
		}
		return _modules[row][col];
	}

	function getModuleCount() {
		return _moduleCount;
	}

	return _modules;
};

//---------------------------------------------------------------------
// QRMode
//---------------------------------------------------------------------

var QRMode = {
	MODE_8BIT_BYTE: 1 << 2
};

//---------------------------------------------------------------------
// QRErrorCorrectionLevel
//---------------------------------------------------------------------

var QRErrorCorrectionLevel = {
	L: 1,
	M: 0,
	Q: 3,
	H: 2
};

//---------------------------------------------------------------------
// QRMaskPattern
//---------------------------------------------------------------------

var QRMaskPattern = {
	PATTERN000: 0,
	PATTERN001: 1,
	PATTERN010: 2,
	PATTERN011: 3,
	PATTERN100: 4,
	PATTERN101: 5,
	PATTERN110: 6,
	PATTERN111: 7
};

//---------------------------------------------------------------------
// QRUtil
//---------------------------------------------------------------------

var QRUtil = (function () {
	var PATTERN_POSITION_TABLE = [
		[],
		[6, 18],
		[6, 22],
		[6, 26],
		[6, 30],
		[6, 34],
		[6, 22, 38],
		[6, 24, 42],
		[6, 26, 46],
		[6, 28, 50],
		[6, 30, 54],
		[6, 32, 58],
		[6, 34, 62],
		[6, 26, 46, 66],
		[6, 26, 48, 70],
		[6, 26, 50, 74],
		[6, 30, 54, 78],
		[6, 30, 56, 82],
		[6, 30, 58, 86],
		[6, 34, 62, 90],
		[6, 28, 50, 72, 94],
		[6, 26, 50, 74, 98],
		[6, 30, 54, 78, 102],
		[6, 28, 54, 80, 106],
		[6, 32, 58, 84, 110],
		[6, 30, 58, 86, 114],
		[6, 34, 62, 90, 118],
		[6, 26, 50, 74, 98, 122],
		[6, 30, 54, 78, 102, 126],
		[6, 26, 52, 78, 104, 130],
		[6, 30, 56, 82, 108, 134],
		[6, 34, 60, 86, 112, 138],
		[6, 30, 58, 86, 114, 142],
		[6, 34, 62, 90, 118, 146],
		[6, 30, 54, 78, 102, 126, 150],
		[6, 24, 50, 76, 102, 128, 154],
		[6, 28, 54, 80, 106, 132, 158],
		[6, 32, 58, 84, 110, 136, 162],
		[6, 26, 54, 82, 110, 138, 166],
		[6, 30, 58, 86, 114, 142, 170]
	];
	var G15 =
		(1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
	var G18 =
		(1 << 12) |
		(1 << 11) |
		(1 << 10) |
		(1 << 9) |
		(1 << 8) |
		(1 << 5) |
		(1 << 2) |
		(1 << 0);
	var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

	/**
	 * @param {number} data
	 */
	var getBCHDigit = function (data) {
		var digit = 0;
		while (data != 0) {
			digit += 1;
			data >>>= 1;
		}
		return digit;
	};

	return {
		/**
		 * @param {number} data
		 */
		getBCHTypeInfo(data) {
			var d = data << 10;
			while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
				d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
			}
			return ((data << 10) | d) ^ G15_MASK;
		},

		/**
		 * @param {number} data
		 */
		getBCHTypeNumber(data) {
			var d = data << 12;
			while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
				d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18));
			}
			return (data << 12) | d;
		},

		/**
		 * @param {number} typeNumber
		 */
		getPatternPosition(typeNumber) {
			return PATTERN_POSITION_TABLE[typeNumber - 1];
		},

		/**
		 *
		 * @param {number} maskPattern
		 * @returns {(i: number, j: number) => boolean}
		 */
		getMaskFunction(maskPattern) {
			switch (maskPattern) {
				case QRMaskPattern.PATTERN000:
					return function (i, j) {
						return (i + j) % 2 == 0;
					};
				case QRMaskPattern.PATTERN001:
					return function (i, j) {
						return i % 2 == 0;
					};
				case QRMaskPattern.PATTERN010:
					return function (i, j) {
						return j % 3 == 0;
					};
				case QRMaskPattern.PATTERN011:
					return function (i, j) {
						return (i + j) % 3 == 0;
					};
				case QRMaskPattern.PATTERN100:
					return function (i, j) {
						return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
					};
				case QRMaskPattern.PATTERN101:
					return function (i, j) {
						return ((i * j) % 2) + ((i * j) % 3) == 0;
					};
				case QRMaskPattern.PATTERN110:
					return function (i, j) {
						return (((i * j) % 2) + ((i * j) % 3)) % 2 == 0;
					};
				case QRMaskPattern.PATTERN111:
					return function (i, j) {
						return (((i * j) % 3) + ((i + j) % 2)) % 2 == 0;
					};

				default:
					throw 'bad maskPattern:' + maskPattern;
			}
		},

		/** @param {number} errorCorrectLength */
		getErrorCorrectPolynomial(errorCorrectLength) {
			var a = new QrPolynomial([1], 0);
			for (var i = 0; i < errorCorrectLength; i += 1) {
				a = a.multiply(new QrPolynomial([1, QRMath.gexp(i)], 0));
			}
			return a;
		},

		/**
		 * @param {number} mode
		 * @param {number} type
		 */
		getLengthInBits(mode, type) {
			if (1 <= type && type < 10) {
				// 1 - 9
				return 8;
			} else if (type < 27) {
				// 10 - 26
				return 16;
			} else if (type < 41) {
				// 27 - 40
				return 16;
			} else {
				throw 'type:' + type;
			}
		}
	};
})();

//---------------------------------------------------------------------
// QRMath
//---------------------------------------------------------------------

var QRMath = (function () {
	var EXP_TABLE = new Array(256);
	var LOG_TABLE = new Array(256);

	// initialize tables
	for (var i = 0; i < 8; i += 1) {
		EXP_TABLE[i] = 1 << i;
	}
	for (var i = 8; i < 256; i += 1) {
		EXP_TABLE[i] =
			EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
	}
	for (var i = 0; i < 255; i += 1) {
		LOG_TABLE[EXP_TABLE[i]] = i;
	}

	return {
		/** @param {number} n */
		glog(n) {
			if (n < 1) {
				throw 'glog(' + n + ')';
			}

			return LOG_TABLE[n];
		},

		/** @param {number} n */
		gexp(n) {
			while (n < 0) {
				n += 255;
			}

			while (n >= 256) {
				n -= 255;
			}

			return EXP_TABLE[n];
		}
	};
})();

class QrPolynomial {
	#num;

	/**
	 * @param {number[]} num
	 * @param {number} shift
	 */
	constructor(num, shift) {
		if (typeof num.length == 'undefined') {
			throw num.length + '/' + shift;
		}

		this.#num = (function () {
			var offset = 0;
			while (offset < num.length && num[offset] == 0) {
				offset += 1;
			}
			var _num = new Array(num.length - offset + shift);
			for (var i = 0; i < num.length - offset; i += 1) {
				_num[i] = num[i + offset];
			}
			return _num;
		})();
	}

	/**
	 * @param {number} index
	 */
	getAt(index) {
		return this.#num[index];
	}

	getLength() {
		return this.#num.length;
	}

	/**
	 * @param {QrPolynomial} e
	 */
	multiply(e) {
		var num = new Array(this.getLength() + e.getLength() - 1);

		for (var i = 0; i < this.getLength(); i += 1) {
			for (var j = 0; j < e.getLength(); j += 1) {
				num[i + j] ^= QRMath.gexp(
					QRMath.glog(this.getAt(i)) + QRMath.glog(e.getAt(j))
				);
			}
		}

		return new QrPolynomial(num, 0);
	}

	/**
	 * @param {QrPolynomial} e
	 * @returns {QrPolynomial}
	 */
	mod(e) {
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}

		var ratio = QRMath.glog(this.getAt(0)) - QRMath.glog(e.getAt(0));

		var num = new Array(this.getLength());
		for (var i = 0; i < this.getLength(); i += 1) {
			num[i] = this.getAt(i);
		}

		for (var i = 0; i < e.getLength(); i += 1) {
			num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
		}

		// recursive call
		return new QrPolynomial(num, 0).mod(e);
	}
}

//---------------------------------------------------------------------
// QRRSBlock
//---------------------------------------------------------------------

var QRRSBlock = (function () {
	var RS_BLOCK_TABLE = [
		// L
		// M
		// Q
		// H

		// 1
		[1, 26, 19],
		[1, 26, 16],
		[1, 26, 13],
		[1, 26, 9],

		// 2
		[1, 44, 34],
		[1, 44, 28],
		[1, 44, 22],
		[1, 44, 16],

		// 3
		[1, 70, 55],
		[1, 70, 44],
		[2, 35, 17],
		[2, 35, 13],

		// 4
		[1, 100, 80],
		[2, 50, 32],
		[2, 50, 24],
		[4, 25, 9],

		// 5
		[1, 134, 108],
		[2, 67, 43],
		[2, 33, 15, 2, 34, 16],
		[2, 33, 11, 2, 34, 12],

		// 6
		[2, 86, 68],
		[4, 43, 27],
		[4, 43, 19],
		[4, 43, 15],

		// 7
		[2, 98, 78],
		[4, 49, 31],
		[2, 32, 14, 4, 33, 15],
		[4, 39, 13, 1, 40, 14],

		// 8
		[2, 121, 97],
		[2, 60, 38, 2, 61, 39],
		[4, 40, 18, 2, 41, 19],
		[4, 40, 14, 2, 41, 15],

		// 9
		[2, 146, 116],
		[3, 58, 36, 2, 59, 37],
		[4, 36, 16, 4, 37, 17],
		[4, 36, 12, 4, 37, 13],

		// 10
		[2, 86, 68, 2, 87, 69],
		[4, 69, 43, 1, 70, 44],
		[6, 43, 19, 2, 44, 20],
		[6, 43, 15, 2, 44, 16],

		// 11
		[4, 101, 81],
		[1, 80, 50, 4, 81, 51],
		[4, 50, 22, 4, 51, 23],
		[3, 36, 12, 8, 37, 13],

		// 12
		[2, 116, 92, 2, 117, 93],
		[6, 58, 36, 2, 59, 37],
		[4, 46, 20, 6, 47, 21],
		[7, 42, 14, 4, 43, 15],

		// 13
		[4, 133, 107],
		[8, 59, 37, 1, 60, 38],
		[8, 44, 20, 4, 45, 21],
		[12, 33, 11, 4, 34, 12],

		// 14
		[3, 145, 115, 1, 146, 116],
		[4, 64, 40, 5, 65, 41],
		[11, 36, 16, 5, 37, 17],
		[11, 36, 12, 5, 37, 13],

		// 15
		[5, 109, 87, 1, 110, 88],
		[5, 65, 41, 5, 66, 42],
		[5, 54, 24, 7, 55, 25],
		[11, 36, 12, 7, 37, 13],

		// 16
		[5, 122, 98, 1, 123, 99],
		[7, 73, 45, 3, 74, 46],
		[15, 43, 19, 2, 44, 20],
		[3, 45, 15, 13, 46, 16],

		// 17
		[1, 135, 107, 5, 136, 108],
		[10, 74, 46, 1, 75, 47],
		[1, 50, 22, 15, 51, 23],
		[2, 42, 14, 17, 43, 15],

		// 18
		[5, 150, 120, 1, 151, 121],
		[9, 69, 43, 4, 70, 44],
		[17, 50, 22, 1, 51, 23],
		[2, 42, 14, 19, 43, 15],

		// 19
		[3, 141, 113, 4, 142, 114],
		[3, 70, 44, 11, 71, 45],
		[17, 47, 21, 4, 48, 22],
		[9, 39, 13, 16, 40, 14],

		// 20
		[3, 135, 107, 5, 136, 108],
		[3, 67, 41, 13, 68, 42],
		[15, 54, 24, 5, 55, 25],
		[15, 43, 15, 10, 44, 16],

		// 21
		[4, 144, 116, 4, 145, 117],
		[17, 68, 42],
		[17, 50, 22, 6, 51, 23],
		[19, 46, 16, 6, 47, 17],

		// 22
		[2, 139, 111, 7, 140, 112],
		[17, 74, 46],
		[7, 54, 24, 16, 55, 25],
		[34, 37, 13],

		// 23
		[4, 151, 121, 5, 152, 122],
		[4, 75, 47, 14, 76, 48],
		[11, 54, 24, 14, 55, 25],
		[16, 45, 15, 14, 46, 16],

		// 24
		[6, 147, 117, 4, 148, 118],
		[6, 73, 45, 14, 74, 46],
		[11, 54, 24, 16, 55, 25],
		[30, 46, 16, 2, 47, 17],

		// 25
		[8, 132, 106, 4, 133, 107],
		[8, 75, 47, 13, 76, 48],
		[7, 54, 24, 22, 55, 25],
		[22, 45, 15, 13, 46, 16],

		// 26
		[10, 142, 114, 2, 143, 115],
		[19, 74, 46, 4, 75, 47],
		[28, 50, 22, 6, 51, 23],
		[33, 46, 16, 4, 47, 17],

		// 27
		[8, 152, 122, 4, 153, 123],
		[22, 73, 45, 3, 74, 46],
		[8, 53, 23, 26, 54, 24],
		[12, 45, 15, 28, 46, 16],

		// 28
		[3, 147, 117, 10, 148, 118],
		[3, 73, 45, 23, 74, 46],
		[4, 54, 24, 31, 55, 25],
		[11, 45, 15, 31, 46, 16],

		// 29
		[7, 146, 116, 7, 147, 117],
		[21, 73, 45, 7, 74, 46],
		[1, 53, 23, 37, 54, 24],
		[19, 45, 15, 26, 46, 16],

		// 30
		[5, 145, 115, 10, 146, 116],
		[19, 75, 47, 10, 76, 48],
		[15, 54, 24, 25, 55, 25],
		[23, 45, 15, 25, 46, 16],

		// 31
		[13, 145, 115, 3, 146, 116],
		[2, 74, 46, 29, 75, 47],
		[42, 54, 24, 1, 55, 25],
		[23, 45, 15, 28, 46, 16],

		// 32
		[17, 145, 115],
		[10, 74, 46, 23, 75, 47],
		[10, 54, 24, 35, 55, 25],
		[19, 45, 15, 35, 46, 16],

		// 33
		[17, 145, 115, 1, 146, 116],
		[14, 74, 46, 21, 75, 47],
		[29, 54, 24, 19, 55, 25],
		[11, 45, 15, 46, 46, 16],

		// 34
		[13, 145, 115, 6, 146, 116],
		[14, 74, 46, 23, 75, 47],
		[44, 54, 24, 7, 55, 25],
		[59, 46, 16, 1, 47, 17],

		// 35
		[12, 151, 121, 7, 152, 122],
		[12, 75, 47, 26, 76, 48],
		[39, 54, 24, 14, 55, 25],
		[22, 45, 15, 41, 46, 16],

		// 36
		[6, 151, 121, 14, 152, 122],
		[6, 75, 47, 34, 76, 48],
		[46, 54, 24, 10, 55, 25],
		[2, 45, 15, 64, 46, 16],

		// 37
		[17, 152, 122, 4, 153, 123],
		[29, 74, 46, 14, 75, 47],
		[49, 54, 24, 10, 55, 25],
		[24, 45, 15, 46, 46, 16],

		// 38
		[4, 152, 122, 18, 153, 123],
		[13, 74, 46, 32, 75, 47],
		[48, 54, 24, 14, 55, 25],
		[42, 45, 15, 32, 46, 16],

		// 39
		[20, 147, 117, 4, 148, 118],
		[40, 75, 47, 7, 76, 48],
		[43, 54, 24, 22, 55, 25],
		[10, 45, 15, 67, 46, 16],

		// 40
		[19, 148, 118, 6, 149, 119],
		[18, 75, 47, 31, 76, 48],
		[34, 54, 24, 34, 55, 25],
		[20, 45, 15, 61, 46, 16]
	];

	/**
	 * @param {number} typeNumber
	 * @param {number} errorCorrectionLevel
	 */
	function getRsBlockTable(typeNumber, errorCorrectionLevel) {
		switch (errorCorrectionLevel) {
			case QRErrorCorrectionLevel.L:
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
			case QRErrorCorrectionLevel.M:
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
			case QRErrorCorrectionLevel.Q:
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
			case QRErrorCorrectionLevel.H:
				return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
			default:
				return undefined;
		}
	}

	return {
		/**
		 * @param {number} typeNumber
		 * @param {number} errorCorrectionLevel
		 */
		getRSBlocks(typeNumber, errorCorrectionLevel) {
			const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

			if (typeof rsBlock == 'undefined') {
				throw (
					'bad rs block @ typeNumber:' +
					typeNumber +
					'/errorCorrectionLevel:' +
					errorCorrectionLevel
				);
			}

			const length = rsBlock.length / 3;

			const list = [];

			for (let i = 0; i < length; i += 1) {
				const count = rsBlock[i * 3 + 0];
				const totalCount = rsBlock[i * 3 + 1];
				const dataCount = rsBlock[i * 3 + 2];

				for (let j = 0; j < count; j += 1) {
					list.push({ totalCount, dataCount });
				}
			}

			return list;
		}
	};
})();

class QrBitBuffer {
	/** @type {number[]} */
	#buffer = [];
	#length = 0;

	getBuffer() {
		return this.#buffer;
	}

	/**
	 * @param {number} index
	 */
	getAt(index) {
		var bufIndex = Math.floor(index / 8);
		return ((this.#buffer[bufIndex] >>> (7 - (index % 8))) & 1) == 1;
	}

	/**
	 * @param {number} num
	 * @param {number} length
	 */
	put(num, length) {
		for (var i = 0; i < length; i += 1) {
			this.putBit(((num >>> (length - i - 1)) & 1) == 1);
		}
	}

	getLengthInBits() {
		return this.#length;
	}

	/**
	 * @param {boolean} bit
	 */
	putBit(bit) {
		var bufIndex = Math.floor(this.#length / 8);
		if (this.#buffer.length <= bufIndex) {
			this.#buffer.push(0);
		}

		if (bit) {
			this.#buffer[bufIndex] |= 0x80 >>> this.#length % 8;
		}

		this.#length += 1;
	}
}

const encoder = new TextEncoder();

class Qr8BitByte {
	/** @type {Uint8Array} */
	#bytes;

	/** @param {string} data */
	constructor(data) {
		this.#bytes = encoder.encode(data);
	}

	getLength() {
		return this.#bytes.length;
	}

	/** @param {QrBitBuffer} buffer */
	write(buffer) {
		for (var i = 0; i < this.#bytes.length; i += 1) {
			buffer.put(this.#bytes[i], 8);
		}
	}
}

export default qrcode;
