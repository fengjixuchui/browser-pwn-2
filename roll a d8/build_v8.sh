#!/bin/bash

set -Eeuxo pipefail

fetch v8
pushd v8
git checkout 1dab065bb4025bdd663ba12e2e976c34c3fa6599
gclient sync
./tools/dev/gm.py x64.release
popd
