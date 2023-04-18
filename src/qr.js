// Adapted from https://github.com/kazuhikoarase/qrcode-generator
// License reproduced below

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

import { QRErrorCorrectionLevel, QRMaskPattern } from './constants.js';

/** @typedef {boolean | null} Module */

const encoder = new TextEncoder();

const PAD0 = 0xec;
const PAD1 = 0x11;

/**
 * @param {string} input
 * @param {{
 *   version?: number;
 *   correction?: 'L' | 'M' | 'Q' | 'H';
 * }} opts
 */
export function qr(input, { version = -1, correction = 'M' } = {}) {
	const error_correction_level = QRErrorCorrectionLevel[correction];
	const data = encoder.encode(input);

	if (version < 1) {
		for (version = 1; version < 40; version++) {
			const rs_blocks = QRRSBlock.get_rs_blocks(
				version,
				error_correction_level
			);
			const buffer = new QrBitBuffer();

			buffer.put(4, 4);
			buffer.put(data.length, QRUtil.get_length_in_bits(version));
			buffer.put_bytes(data);

			let total_data_count = 0;
			for (let i = 0; i < rs_blocks.length; i++) {
				total_data_count += rs_blocks[i].data_count;
			}

			if (buffer.get_length_in_bits() <= total_data_count * 8) {
				break;
			}
		}
	}

	const size = version * 4 + 17;
	/** @type {Module[][]} */
	const modules = new Array(size);
	for (let row = 0; row < size; row += 1) {
		modules[row] = new Array(size);
	}

	let min_lost_point = 0;
	let best_pattern = 0;

	/** @type {number[]} */
	let cache = create_data(version, error_correction_level, data);

	for (let i = 0; i < 8; i += 1) {
		const modules = make(true, i);

		const lost_point = get_lost_point(modules);

		if (i == 0 || min_lost_point > lost_point) {
			min_lost_point = lost_point;
			best_pattern = i;
		}
	}

	return make(false, best_pattern);

	/**
	 * @param {boolean} test
	 * @param {number} mask_pattern
	 */
	function make(test, mask_pattern) {
		for (let row = 0; row < size; row += 1) {
			for (let col = 0; col < size; col += 1) {
				modules[row][col] = null;
			}
		}

		setup_position_probe_patter(modules, 0, 0);
		setup_position_probe_patter(modules, size - 7, 0);
		setup_position_probe_patter(modules, 0, size - 7);
		setup_position_adjust_pattern(modules, version);
		setup_timing_pattern(modules);
		setup_type_info(modules, test, mask_pattern, error_correction_level);

		if (version >= 7) {
			setup_version_number(modules, version, test);
		}

		map_data(modules, cache, mask_pattern);

		return modules;
	}
}

/**
 * @param {Module[][]} modules
 * @param {number} row
 * @param {number} col
 */
function setup_position_probe_patter(modules, row, col) {
	for (let r = -1; r <= 7; r += 1) {
		if (row + r <= -1 || modules.length <= row + r) continue;

		for (let c = -1; c <= 7; c += 1) {
			if (col + c <= -1 || modules.length <= col + c) continue;

			if (
				(0 <= r && r <= 6 && (c == 0 || c == 6)) ||
				(0 <= c && c <= 6 && (r == 0 || r == 6)) ||
				(2 <= r && r <= 4 && 2 <= c && c <= 4)
			) {
				modules[row + r][col + c] = true;
			} else {
				modules[row + r][col + c] = false;
			}
		}
	}
}

/**
 * @param {Module[][]} modules
 * @param {number} version
 */
function setup_position_adjust_pattern(modules, version) {
	const pos = QRUtil.get_pattern_position(version);

	for (let i = 0; i < pos.length; i += 1) {
		for (let j = 0; j < pos.length; j += 1) {
			const row = pos[i];
			const col = pos[j];

			if (modules[row][col] != null) {
				continue;
			}

			for (let r = -2; r <= 2; r += 1) {
				for (let c = -2; c <= 2; c += 1) {
					if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
						modules[row + r][col + c] = true;
					} else {
						modules[row + r][col + c] = false;
					}
				}
			}
		}
	}
}

/**
 * @param {Module[][]} modules
 */
function setup_timing_pattern(modules) {
	for (let r = 8; r < modules.length - 8; r += 1) {
		if (modules[r][6] != null) {
			continue;
		}
		modules[r][6] = r % 2 == 0;
	}

	for (let c = 8; c < modules.length - 8; c += 1) {
		if (modules[6][c] != null) {
			continue;
		}
		modules[6][c] = c % 2 == 0;
	}
}

/**
 * @param {Module[][]} modules
 * @param {boolean} test
 * @param {number} mask_pattern
 * @param {number} error_correction_level
 */
function setup_type_info(modules, test, mask_pattern, error_correction_level) {
	const data = (error_correction_level << 3) | mask_pattern;
	const bits = QRUtil.get_bch_type_info(data);

	// vertical
	for (let i = 0; i < 15; i += 1) {
		const mod = !test && ((bits >> i) & 1) == 1;

		if (i < 6) {
			modules[i][8] = mod;
		} else if (i < 8) {
			modules[i + 1][8] = mod;
		} else {
			modules[modules.length - 15 + i][8] = mod;
		}
	}

	// horizontal
	for (let i = 0; i < 15; i += 1) {
		const mod = !test && ((bits >> i) & 1) == 1;

		if (i < 8) {
			modules[8][modules.length - i - 1] = mod;
		} else if (i < 9) {
			modules[8][15 - i - 1 + 1] = mod;
		} else {
			modules[8][15 - i - 1] = mod;
		}
	}

	// fixed module
	modules[modules.length - 8][8] = !test;
}

/**
 * @param {Module[][]} modules
 * @param {number} version
 * @param {boolean} test
 */
function setup_version_number(modules, version, test) {
	const bits = QRUtil.get_bch_type_number(version);

	for (let i = 0; i < 18; i += 1) {
		const mod = !test && ((bits >> i) & 1) == 1;
		modules[Math.floor(i / 3)][(i % 3) + modules.length - 8 - 3] = mod;
	}

	for (let i = 0; i < 18; i += 1) {
		const mod = !test && ((bits >> i) & 1) == 1;
		modules[(i % 3) + modules.length - 8 - 3][Math.floor(i / 3)] = mod;
	}
}

/**
 * @param {Module[][]} modules
 * @param {number[]} data
 * @param {number} mask_pattern
 */
function map_data(modules, data, mask_pattern) {
	let inc = -1;
	let row = modules.length - 1;
	let bit_index = 7;
	let byte_index = 0;
	const mask_func = QRUtil.get_mask_function(mask_pattern);

	for (let col = modules.length - 1; col > 0; col -= 2) {
		if (col == 6) col -= 1;

		while (true) {
			for (let c = 0; c < 2; c += 1) {
				if (modules[row][col - c] == null) {
					let dark = false;

					if (byte_index < data.length) {
						dark = ((data[byte_index] >>> bit_index) & 1) == 1;
					}

					const mask = mask_func(row, col - c);

					if (mask) {
						dark = !dark;
					}

					modules[row][col - c] = dark;
					bit_index -= 1;

					if (bit_index == -1) {
						byte_index += 1;
						bit_index = 7;
					}
				}
			}

			row += inc;

			if (row < 0 || modules.length <= row) {
				row -= inc;
				inc = -inc;
				break;
			}
		}
	}
}

/**
 * @param {Module[][]} modules
 */
function get_lost_point(modules) {
	const size = modules.length;
	let lost_point = 0;

	/**
	 * @param {number} row
	 * @param {number} col
	 */
	const is_dark = (row, col) => modules[row][col];

	// LEVEL1
	for (let row = 0; row < size; row += 1) {
		for (let col = 0; col < size; col += 1) {
			const dark = is_dark(row, col);
			let same_count = 0;

			for (let r = -1; r <= 1; r += 1) {
				if (row + r < 0 || size <= row + r) {
					continue;
				}

				for (let c = -1; c <= 1; c += 1) {
					if (col + c < 0 || size <= col + c) {
						continue;
					}

					if (r == 0 && c == 0) {
						continue;
					}

					if (dark == is_dark(row + r, col + c)) {
						same_count += 1;
					}
				}
			}

			if (same_count > 5) {
				lost_point += 3 + same_count - 5;
			}
		}
	}

	// LEVEL2
	for (let row = 0; row < size - 1; row += 1) {
		for (let col = 0; col < size - 1; col += 1) {
			let count = 0;
			if (is_dark(row, col)) count += 1;
			if (is_dark(row + 1, col)) count += 1;
			if (is_dark(row, col + 1)) count += 1;
			if (is_dark(row + 1, col + 1)) count += 1;
			if (count == 0 || count == 4) {
				lost_point += 3;
			}
		}
	}

	// LEVEL3
	for (let row = 0; row < size; row += 1) {
		for (let col = 0; col < size - 6; col += 1) {
			if (
				is_dark(row, col) &&
				!is_dark(row, col + 1) &&
				is_dark(row, col + 2) &&
				is_dark(row, col + 3) &&
				is_dark(row, col + 4) &&
				!is_dark(row, col + 5) &&
				is_dark(row, col + 6)
			) {
				lost_point += 40;
			}
		}
	}

	for (let col = 0; col < size; col += 1) {
		for (let row = 0; row < size - 6; row += 1) {
			if (
				is_dark(row, col) &&
				!is_dark(row + 1, col) &&
				is_dark(row + 2, col) &&
				is_dark(row + 3, col) &&
				is_dark(row + 4, col) &&
				!is_dark(row + 5, col) &&
				is_dark(row + 6, col)
			) {
				lost_point += 40;
			}
		}
	}

	// LEVEL4
	let dark_count = 0;

	for (let col = 0; col < size; col += 1) {
		for (let row = 0; row < size; row += 1) {
			if (is_dark(row, col)) {
				dark_count += 1;
			}
		}
	}

	const ratio = Math.abs((100 * dark_count) / size / size - 50) / 5;
	lost_point += ratio * 10;

	return lost_point;
}

/**
 * @param {QrBitBuffer} buffer
 * @param {Array<{ data_count: number, total_count: number }>} rs_blocks
 */
function create_bytes(buffer, rs_blocks) {
	let offset = 0;

	let max_dc_count = 0;
	let max_ec_count = 0;

	/** @type {number[][]} */
	const dcdata = new Array(rs_blocks.length);

	/** @type {number[][]} */
	const ecdata = new Array(rs_blocks.length);

	for (let r = 0; r < rs_blocks.length; r += 1) {
		const dc_count = rs_blocks[r].data_count;
		const ec_count = rs_blocks[r].total_count - dc_count;

		max_dc_count = Math.max(max_dc_count, dc_count);
		max_ec_count = Math.max(max_ec_count, ec_count);

		dcdata[r] = new Array(dc_count);

		for (let i = 0; i < dcdata[r].length; i += 1) {
			dcdata[r][i] = 0xff & buffer.get_buffer()[i + offset];
		}
		offset += dc_count;

		const rs_poly = QRUtil.get_error_correct_polynominal(ec_count);
		const raw_poly = new QrPolynomial(dcdata[r], rs_poly.get_length() - 1);

		const mod_poly = raw_poly.mod(rs_poly);
		ecdata[r] = new Array(rs_poly.get_length() - 1);
		for (let i = 0; i < ecdata[r].length; i += 1) {
			const mod_index = i + mod_poly.get_length() - ecdata[r].length;
			ecdata[r][i] = mod_index >= 0 ? mod_poly.get_at(mod_index) : 0;
		}
	}

	let total_code_count = 0;
	for (let i = 0; i < rs_blocks.length; i += 1) {
		total_code_count += rs_blocks[i].total_count;
	}

	/** @type {number[]} */
	const data = new Array(total_code_count);
	let index = 0;

	for (let i = 0; i < max_dc_count; i += 1) {
		for (let r = 0; r < rs_blocks.length; r += 1) {
			if (i < dcdata[r].length) {
				data[index] = dcdata[r][i];
				index += 1;
			}
		}
	}

	for (let i = 0; i < max_ec_count; i += 1) {
		for (let r = 0; r < rs_blocks.length; r += 1) {
			if (i < ecdata[r].length) {
				data[index] = ecdata[r][i];
				index += 1;
			}
		}
	}

	return data;
}

/**
 * @param {number} version
 * @param {number} error_correction_level
 * @param {Uint8Array} data
 */
function create_data(version, error_correction_level, data) {
	const rs_blocks = QRRSBlock.get_rs_blocks(version, error_correction_level);

	const buffer = new QrBitBuffer();

	buffer.put(4, 4);
	buffer.put(data.length, QRUtil.get_length_in_bits(version));
	buffer.put_bytes(data);

	// calc num max data.
	let total_data_count = 0;
	for (let i = 0; i < rs_blocks.length; i += 1) {
		total_data_count += rs_blocks[i].data_count;
	}

	if (buffer.get_length_in_bits() > total_data_count * 8) {
		throw (
			'code length overflow. (' +
			buffer.get_length_in_bits() +
			'>' +
			total_data_count * 8 +
			')'
		);
	}

	// end code
	if (buffer.get_length_in_bits() + 4 <= total_data_count * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.get_length_in_bits() % 8 != 0) {
		buffer.put_bit(false);
	}

	// padding
	while (true) {
		if (buffer.get_length_in_bits() >= total_data_count * 8) {
			break;
		}
		buffer.put(PAD0, 8);

		if (buffer.get_length_in_bits() >= total_data_count * 8) {
			break;
		}
		buffer.put(PAD1, 8);
	}

	return create_bytes(buffer, rs_blocks);
}

const QRUtil = (function () {
	const PATTERN_POSITION_TABLE = [
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

	const G15 =
		(1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
	const G18 =
		(1 << 12) |
		(1 << 11) |
		(1 << 10) |
		(1 << 9) |
		(1 << 8) |
		(1 << 5) |
		(1 << 2) |
		(1 << 0);
	const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

	/**
	 * @param {number} data
	 */
	function get_bch_digit(data) {
		let digit = 0;
		while (data != 0) {
			digit += 1;
			data >>>= 1;
		}
		return digit;
	}

	return {
		/**
		 * @param {number} data
		 */
		get_bch_type_info(data) {
			let d = data << 10;
			while (get_bch_digit(d) - get_bch_digit(G15) >= 0) {
				d ^= G15 << (get_bch_digit(d) - get_bch_digit(G15));
			}
			return ((data << 10) | d) ^ G15_MASK;
		},

		/**
		 * @param {number} data
		 */
		get_bch_type_number(data) {
			let d = data << 12;
			while (get_bch_digit(d) - get_bch_digit(G18) >= 0) {
				d ^= G18 << (get_bch_digit(d) - get_bch_digit(G18));
			}
			return (data << 12) | d;
		},

		/**
		 * @param {number} version
		 */
		get_pattern_position(version) {
			return PATTERN_POSITION_TABLE[version - 1];
		},

		/**
		 *
		 * @param {number} mask_pattern
		 * @returns {(i: number, j: number) => boolean}
		 */
		get_mask_function(mask_pattern) {
			switch (mask_pattern) {
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
					throw 'bad mask_pattern:' + mask_pattern;
			}
		},

		/** @param {number} error_correct_length */
		get_error_correct_polynominal(error_correct_length) {
			let a = new QrPolynomial([1], 0);
			for (let i = 0; i < error_correct_length; i += 1) {
				a = a.multiply(new QrPolynomial([1, QRMath.gexp(i)], 0));
			}
			return a;
		},

		/**
		 * @param {number} type
		 */
		get_length_in_bits(type) {
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

const QRMath = (function () {
	const EXP_TABLE = new Array(256);
	const LOG_TABLE = new Array(256);

	// initialize tables
	for (let i = 0; i < 8; i += 1) {
		EXP_TABLE[i] = 1 << i;
	}
	for (let i = 8; i < 256; i += 1) {
		EXP_TABLE[i] =
			EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
	}
	for (let i = 0; i < 255; i += 1) {
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

		let offset = 0;
		while (offset < num.length && num[offset] == 0) {
			offset += 1;
		}

		this.#num = new Array(num.length - offset + shift);
		for (let i = 0; i < num.length - offset; i += 1) {
			this.#num[i] = num[i + offset];
		}
	}

	/**
	 * @param {number} index
	 */
	get_at(index) {
		return this.#num[index];
	}

	get_length() {
		return this.#num.length;
	}

	/**
	 * @param {QrPolynomial} e
	 */
	multiply(e) {
		const num = new Array(this.get_length() + e.get_length() - 1);

		for (let i = 0; i < this.get_length(); i += 1) {
			for (let j = 0; j < e.get_length(); j += 1) {
				num[i + j] ^= QRMath.gexp(
					QRMath.glog(this.get_at(i)) + QRMath.glog(e.get_at(j))
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
		if (this.get_length() - e.get_length() < 0) {
			return this;
		}

		const ratio = QRMath.glog(this.get_at(0)) - QRMath.glog(e.get_at(0));

		const num = new Array(this.get_length());
		for (let i = 0; i < this.get_length(); i += 1) {
			num[i] = this.get_at(i);
		}

		for (let i = 0; i < e.get_length(); i += 1) {
			num[i] ^= QRMath.gexp(QRMath.glog(e.get_at(i)) + ratio);
		}

		// recursive call
		return new QrPolynomial(num, 0).mod(e);
	}
}

const QRRSBlock = (function () {
	const RS_BLOCK_TABLE = [
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
	 * @param {number} version
	 * @param {number} error_correction_level
	 */
	function get_rs_block_table(version, error_correction_level) {
		switch (error_correction_level) {
			case QRErrorCorrectionLevel.L:
				return RS_BLOCK_TABLE[(version - 1) * 4 + 0];
			case QRErrorCorrectionLevel.M:
				return RS_BLOCK_TABLE[(version - 1) * 4 + 1];
			case QRErrorCorrectionLevel.Q:
				return RS_BLOCK_TABLE[(version - 1) * 4 + 2];
			case QRErrorCorrectionLevel.H:
				return RS_BLOCK_TABLE[(version - 1) * 4 + 3];
			default:
				return undefined;
		}
	}

	return {
		/**
		 * @param {number} version
		 * @param {number} error_correction_level
		 */
		get_rs_blocks(version, error_correction_level) {
			const rs_block = get_rs_block_table(version, error_correction_level);

			if (typeof rs_block == 'undefined') {
				throw (
					'bad rs block @ version:' +
					version +
					'/error_correction_level:' +
					error_correction_level
				);
			}

			const length = rs_block.length / 3;

			const list = [];

			for (let i = 0; i < length; i += 1) {
				const count = rs_block[i * 3 + 0];
				const total_count = rs_block[i * 3 + 1];
				const data_count = rs_block[i * 3 + 2];

				for (let j = 0; j < count; j += 1) {
					list.push({ total_count, data_count });
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

	get_buffer() {
		return this.#buffer;
	}

	/**
	 * @param {number} num
	 * @param {number} length
	 */
	put(num, length) {
		for (let i = 0; i < length; i += 1) {
			this.put_bit(((num >>> (length - i - 1)) & 1) == 1);
		}
	}

	get_length_in_bits() {
		return this.#length;
	}

	/**
	 * @param {boolean} bit
	 */
	put_bit(bit) {
		const buf_index = Math.floor(this.#length / 8);
		if (this.#buffer.length <= buf_index) {
			this.#buffer.push(0);
		}

		if (bit) {
			this.#buffer[buf_index] |= 0x80 >>> this.#length % 8;
		}

		this.#length += 1;
	}

	/** @param {Uint8Array} bytes */
	put_bytes(bytes) {
		for (let i = 0; i < bytes.length; i += 1) {
			this.put(bytes[i], 8);
		}
	}
}
