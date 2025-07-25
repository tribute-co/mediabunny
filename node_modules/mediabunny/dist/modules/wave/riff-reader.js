/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export class RiffReader {
    constructor(reader) {
        this.reader = reader;
        this.pos = 0;
        this.littleEndian = true;
    }
    readBytes(length) {
        const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + length);
        this.pos += length;
        return new Uint8Array(view.buffer, offset, length);
    }
    readU16() {
        const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 2);
        this.pos += 2;
        return view.getUint16(offset, this.littleEndian);
    }
    readU32() {
        const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + 4);
        this.pos += 4;
        return view.getUint32(offset, this.littleEndian);
    }
    readU64() {
        let low;
        let high;
        if (this.littleEndian) {
            low = this.readU32();
            high = this.readU32();
        }
        else {
            high = this.readU32();
            low = this.readU32();
        }
        return high * 0x100000000 + low;
    }
    readAscii(length) {
        const { view, offset } = this.reader.getViewAndOffset(this.pos, this.pos + length);
        this.pos += length;
        let str = '';
        for (let i = 0; i < length; i++) {
            str += String.fromCharCode(view.getUint8(offset + i));
        }
        return str;
    }
}
