gdb \
 -ex "file ./d8 " \
 -ex "source ../../tools/gdbinit" \
 -ex "source ../../tools/gdb-v8-support.py" \
 -ex "set args --allow-natives-syntax ./exp.js" \
 -ex "r"
