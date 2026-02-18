#!/bin/bash

echo "Updating data and indexes..."
pushd completed
./update.sh
popd

echo "Updating failed urls index..."
pushd failed
./update.sh
popd

echo "Updating technology data..."
pushd data
./update.sh
popd