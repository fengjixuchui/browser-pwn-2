let a = [1.1];
let f = [];

test(a);
test(f);
console.log('---');
let b = function (){return a};
function get(x){
  c = new this();
  %DebugPrint(c);
  %DebugPrint(a);
  %DebugPrint(fun());
  //console.log(IsConstructor(this));
}

function test(x){
	%DebugPrint(x);
};
 
c = new b();
let fun = function() { return a };
//%DebugPrint(fun);
//console.log("---");
d = Array.from.call(fun, {[Symbol.iterator] : _ => (
  {
    counter : 0,
    max : 10000,
    next() {
      let result = this.counter++;
      //console.log("bbb");
      if (this.counter == this.max) {
        a.length = 1;
        return {done: true};
      } else {
        return {value: result, done: false};
      }
    }
  }
) });

test(a);
test(d);
test(f);

console.log(a[0]);

//d = Array.from.call( a);

//b = new d();
//t = b[Symbol.iterator]();
//test(t.next().value);
//test(t.next().value);
//function test(new){}
//test(new b());