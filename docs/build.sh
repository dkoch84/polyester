#!/bin/bash
# Build the Polyester documentation

cd "$(dirname "$0")/.."

# Compile the documentation
node dist/cli/index.js build docs/index.poly -o docs/index.html

# Post-process (add title, syntax highlighting)
node docs/build.js

echo "Done!"
