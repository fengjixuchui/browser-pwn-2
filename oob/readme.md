# StarCTF 2019 OOB

The bug was added by using the `oob.diff`. In this patch file , It adds a API function into Array Object's Buildin Funtions. The new API `Array.oob` can cause `off-by-one` in Reading & Writing its element.

```diff
diff --git a/src/bootstrapper.cc b/src/bootstrapper.cc
index b027d36..ef1002f 100644
--- a/src/bootstrapper.cc
+++ b/src/bootstrapper.cc
@@ -1668,6 +1668,8 @@ void Genesis::InitializeGlobal(Handle<JSGlobalObject> global_object,
                           Builtins::kArrayPrototypeCopyWithin, 2, false);
     SimpleInstallFunction(isolate_, proto, "fill",
                           Builtins::kArrayPrototypeFill, 1, false);
+    SimpleInstallFunction(isolate_, proto, "oob",
+                          Builtins::kArrayOob,2,false);
     SimpleInstallFunction(isolate_, proto, "find",
                           Builtins::kArrayPrototypeFind, 1, false);
     SimpleInstallFunction(isolate_, proto, "findIndex",
diff --git a/src/builtins/builtins-array.cc b/src/builtins/builtins-array.cc
index 8df340e..9b828ab 100644
--- a/src/builtins/builtins-array.cc
+++ b/src/builtins/builtins-array.cc
@@ -361,6 +361,27 @@ V8_WARN_UNUSED_RESULT Object GenericArrayPush(Isolate* isolate,
   return *final_length;
 }
 }  // namespace
+BUILTIN(ArrayOob){
+    uint32_t len = args.length();
+    if(len > 2) return ReadOnlyRoots(isolate).undefined_value();
+    Handle<JSReceiver> receiver;
+    ASSIGN_RETURN_FAILURE_ON_EXCEPTION(
+            isolate, receiver, Object::ToObject(isolate, args.receiver()));
+    Handle<JSArray> array = Handle<JSArray>::cast(receiver);
+    FixedDoubleArray elements = FixedDoubleArray::cast(array->elements());
+    uint32_t length = static_cast<uint32_t>(array->length()->Number());
+    if(len == 1){
+        //read
+        return *(isolate->factory()->NewNumber(elements.get_scalar(length)));
+    }else{
+        //write
+        Handle<Object> value;
+        ASSIGN_RETURN_FAILURE_ON_EXCEPTION(
+                isolate, value, Object::ToNumber(isolate, args.at<Object>(1)));
+        elements.set(length,value->Number());
+        return ReadOnlyRoots(isolate).undefined_value();
+    }
+}
 
 BUILTIN(ArrayPush) {
   HandleScope scope(isolate);
diff --git a/src/builtins/builtins-definitions.h b/src/builtins/builtins-definitions.h
index 0447230..f113a81 100644
--- a/src/builtins/builtins-definitions.h
+++ b/src/builtins/builtins-definitions.h
@@ -368,6 +368,7 @@ namespace internal {
   TFJ(ArrayPrototypeFlat, SharedFunctionInfo::kDontAdaptArgumentsSentinel)     \
   /* https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatMap */   \
   TFJ(ArrayPrototypeFlatMap, SharedFunctionInfo::kDontAdaptArgumentsSentinel)  \
+  CPP(ArrayOob)                                                                \
                                                                                \
   /* ArrayBuffer */                                                            \
   /* ES #sec-arraybuffer-constructor */                                        \
diff --git a/src/compiler/typer.cc b/src/compiler/typer.cc
index ed1e4a5..c199e3a 100644
--- a/src/compiler/typer.cc
+++ b/src/compiler/typer.cc
@@ -1680,6 +1680,8 @@ Type Typer::Visitor::JSCallTyper(Type fun, Typer* t) {
       return Type::Receiver();
     case Builtins::kArrayUnshift:
       return t->cache_->kPositiveSafeInteger;
+    case Builtins::kArrayOob:
+      return Type::Receiver();
 
     // ArrayBuffer functions.
     case Builtins::kArrayBufferIsView:

```

The bug is in the V8 part of chrome , we can compile and debug it using the script below.

```bash
#!/bin/bash

set -Eeuxo pipefail

fetch v8
pushd v8
git checkout 6dc88c191f5ecc5389dc26efa3ca0907faef3598
git apply < ../oob.diff
gclient sync
./tools/dev/gm.py x64.release
popd
```

While debuging V8, I found something interesting. An Array in JS can have 2 kinds of memory structure.( I spent one day to trace the source code where creates the structure. 

The first one is made when the content of the array was set while defining.

In the condition, the `elements` was allocted before the body of `JSArray ` did.

```  bash
└─[$] <> cat test2.js
let obj2 = [1.1,1.2,1.1,1.2,1.1,1.1,1.2,1.1,2.1,1.1];
%DebugPrint(obj2);
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/Chrome/v8-new] - [三 5月 22, 17:49]
└─[$] <> ./v8/out/x64.debug/d8 --allow-natives-syntax ./test2.js 
DebugPrint: 0x249bdbd0d411: [JSArray]
 - map: 0x3bd4a2d82ed9 <Map(PACKED_DOUBLE_ELEMENTS)> [FastProperties]
 - prototype: 0x036485ad11c1 <JSArray[0]>
 - elements: 0x249bdbd0d3b1 <FixedDoubleArray[10]> [PACKED_DOUBLE_ELEMENTS]
 - length: 10
 - properties: 0x3d3efd840c21 <FixedArray[0]> {
    #length: 0x157bac7001a9 <AccessorInfo> (const accessor descriptor)
 }
 - elements: 0x249bdbd0d3b1 <FixedDoubleArray[10]> {
           0: 1.1
           1: 1.2
           2: 1.1
           3: 1.2
         4-5: 1.1
           6: 1.2
           7: 1.1
           8: 2.1
           9: 1.1
 }
0x3bd4a2d82ed9: [Map]
 - type: JS_ARRAY_TYPE
 - instance size: 32
 - inobject properties: 0
 - elements kind: PACKED_DOUBLE_ELEMENTS
 - unused property fields: 0
 - enum length: invalid
 - back pointer: 0x3bd4a2d82e89 <Map(HOLEY_SMI_ELEMENTS)>
 - prototype_validity cell: 0x157bac700609 <Cell value= 1>
 - instance descriptors #1: 0x036485ad1ff9 <DescriptorArray[1]>
 - layout descriptor: (nil)
 - transitions #1: 0x036485ad1f69 <TransitionArray[4]>Transition array #1:
     0x3d3efd844bb1 <Symbol: (elements_transition_symbol)>: (transition to HOLEY_DOUBLE_ELEMENTS) -> 0x3bd4a2d82f29 <Map(HOLEY_DOUBLE_ELEMENTS)>

 - prototype: 0x036485ad11c1 <JSArray[0]>
 - constructor: 0x036485ad0f71 <JSFunction Array (sfi = 0x157bac70a9c9)>
 - dependent code: 0x3d3efd8402c1 <Other heap object (WEAK_FIXED_ARRAY_TYPE)>
 - construction counter: 0
```

If Using the unassigned script to define an Array like `Array(10)`, the memory of  JSArray body would be alloced first.

```
└─[$] <> cat test2.js
let obj = Array(10);
%DebugPrint(obj);
┌─[p4nda@p4nda-virtual-machine] - [~/Desktop/browser/ctf/Chrome/v8-new] - [三 5月 22, 17:49]
└─[$] <> ./v8/out/x64.debug/d8 --allow-natives-syntax ./test2.js 
DebugPrint: 0x249bdbd0d431: [JSArray]
 - map: 0x3bd4a2d82e89 <Map(HOLEY_SMI_ELEMENTS)> [FastProperties]
 - prototype: 0x036485ad11c1 <JSArray[0]>
 - elements: 0x249bdbd0d451 <FixedArray[10]> [HOLEY_SMI_ELEMENTS]
 - length: 10
 - properties: 0x3d3efd840c21 <FixedArray[0]> {
    #length: 0x157bac7001a9 <AccessorInfo> (const accessor descriptor)
 }
 - elements: 0x249bdbd0d451 <FixedArray[10]> {
         0-9: 0x3d3efd8405b1 <the_hole>
 }
0x3bd4a2d82e89: [Map]
 - type: JS_ARRAY_TYPE
 - instance size: 32
 - inobject properties: 0
 - elements kind: HOLEY_SMI_ELEMENTS
 - unused property fields: 0
 - enum length: invalid
 - back pointer: 0x3bd4a2d82d99 <Map(PACKED_SMI_ELEMENTS)>
 - prototype_validity cell: 0x157bac700609 <Cell value= 1>
 - instance descriptors #1: 0x036485ad1ff9 <DescriptorArray[1]>
 - layout descriptor: (nil)
 - transitions #1: 0x036485ad1f39 <TransitionArray[4]>Transition array #1:
     0x3d3efd844bb1 <Symbol: (elements_transition_symbol)>: (transition to PACKED_DOUBLE_ELEMENTS) -> 0x3bd4a2d82ed9 <Map(PACKED_DOUBLE_ELEMENTS)>

 - prototype: 0x036485ad11c1 <JSArray[0]>
 - constructor: 0x036485ad0f71 <JSFunction Array (sfi = 0x157bac70a9c9)>
 - dependent code: 0x3d3efd8402c1 <Other heap object (WEAK_FIXED_ARRAY_TYPE)>
 - construction counter: 0
```

Because of the two different memory structure, there are 2 different solutions to the question.  One is overwriting its own map to cause `type-confuse`, another one is overwrite adjacent structure.

Using the `type-confuse` can modify the `length` of victim , in next step ,causing overflow. then using the [universal mothed](https://abiondo.me/2019/01/02/exploiting-math-expm1-v8/#triggering-an-oob-access?tdsourcetag=s_pctim_aiomsg) to execute shellcode.

In my solution , I use the second memory layout mentioned above. 

Ps. **The challenge is no-sandbox.** I was confused for long time about why my shellcode is useless???? 

PPs. It's exciting when I saw the `xcalc` pop up in the Chrome, although it is just a CTF challenge.



![](.\result.png)