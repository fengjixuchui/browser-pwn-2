#!/bin/bash

set -Eeuxo pipefail

fetch v8
pushd v8
git checkout 6dc88c191f5ecc5389dc26efa3ca0907faef3598
git apply < ../oob.diff
gclient sync
./tools/dev/gm.py x64.release
popd

