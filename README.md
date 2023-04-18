# headless-qr

A simple, modern QR code generator. Adapted from https://github.com/kazuhikoarase/qrcode-generator but without all the junk that was necessary 10 years ago.

## Usage

```js
import { qr } from 'headless-qr';

// generate an n x n array of booleans,
// where `true` is a dark pixel
const modules = qr('https://example.com');

// specify version and error correction
const modules = qr('https://example.com', {
	version: 40, // 1 - 40, will select the best version if unspecified
	correction: 'Q' // L, M, Q or H
});
```
