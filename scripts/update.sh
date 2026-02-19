#!/bin/bash

echo "Updating technology data..."
pushd data
./update.sh
popd
