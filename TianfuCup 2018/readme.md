## TianfuCup 2018  —— OOB Write in ValueDeserializer::ReadDenseJSArray

The vulnerability was existed in `postMessage` process, found and exploited by Gong Guang, 360 Alpha Team. I analysis it and rewrite the [exp.html](./exp.html).

![](./result.png)

Because of bad patch , it relates to 3 issues.

 https://bugs.chromium.org/p/chromium/issues/detail?id=905940 

 https://bugs.chromium.org/p/chromium/issues/detail?id=914731 