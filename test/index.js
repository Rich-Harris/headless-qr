import qrcode, { qr } from '../qr.js';
import test from 'node:test';
import * as assert from 'node:assert';

const input = 'http://www.example.com/ążśźęćńół';

const encoded = encodeURI(input);
const unescaped = unescape(encoded);

const output = `
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xx       x  xx xx x   xx       xx
xx xxxxx x xx xxx  x xxx xxxxx xx
xx x   x xx xx xxxx    x x   x xx
xx x   x x  x xx  xxx xx x   x xx
xx x   x xxx x x x  x xx x   x xx
xx xxxxx xxx   xx xx   x xxxxx xx
xx       x x x x x x x x       xx
xxxxxxxxxx  xxx x  xx xxxxxxxxxxx
xx x  x   x  xxxxx xxxxx xx x  xx
xxxx   xxxxxxx x  xx   x   xxx xx
xxxx x x x    x   x  xxx xxx  xxx
xx  x xxxx  xxxx xx  xxx  x xx xx
xx  xx x    x  x  xxxxxxxxx  xxxx
xx x xx x  x x x x  x xx xxxx  xx
xx  xx   xx xx    xx  xx x     xx
xx  x  xx    x    x x  xx xxx xxx
xx xx      x   x   xx   x  xx xxx
xxxxx xxxxxx    xx   xxxxxxx  xxx
xx x xx    x x  xxxxxx x  x  xxxx
xxxxxxxxxx x xxx x xxxx xxxx xxxx
xxx  xx    xx x xx x         xxxx
xxxxxxxxxx   xx x  x x xxx     xx
xx       x x xx x x    x x  x xxx
xx xxxxx x x  xxx    x xxx xx  xx
xx x   x xx    x x x x         xx
xx x   x x xx x   xx x  xx   x xx
xx x   x x x xx x x xx  x xx x xx
xx xxxxx xxxx x     xx  x x x xxx
xx       x  x x xxx    xxxx x xxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
`.trim();

test('QRCode is correct', () => {
	// const qr = qrcode(-1, 'M');
	// qr.addData(input);
	// // qr.addData('漢字');
	// qr.make();

	const modules = qr(input);

	const lines = output
		.split('\n')
		.slice(2, -2)
		.map((line) => line.slice(2, -2));

	for (let r = 0; r < lines.length; r++) {
		for (let c = 0; c < lines[r].length; c++) {
			// const module = qr.isDark(r, c) ? ' ' : 'x';
			assert.strictEqual(
				modules[r][c] ? ' ' : 'x',
				lines[r][c],
				`Module ${r}, ${c} is incorrect`
			);
		}
	}
});
